const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
require('dotenv').config({ path: '../.env' });

const authRoutes = require('./routes/auth');
const interviewRoutes = require('./routes/interviews');
const uploadRoutes = require('./routes/upload');
const reportRoutes = require('./routes/reports');
const { authenticateToken } = require('./middleware/auth');
const { initializeGemini, generateFirstQuestion, generateNextQuestion, processGeminiAudio, geminiService, getSessionSummary, calculateCost, processTranscriptChunk, detectQuestionIntent, detectResponseIntent, generateRealTimeAcknowledgment } = require('./services/gemini');
const Interview = require('./models/Interview');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// Trust proxy for rate limiting behind reverse proxy (Render, etc.)
// Set to 1 to trust only the first proxy (Render's reverse proxy)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5173",
  credentials: true
}));

// Rate limiting - more lenient for development
const isDevelopment = process.env.NODE_ENV !== 'production';

// General rate limiter (more lenient in development)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 1000 : 100, // limit each IP to 100 requests per windowMs (1000 in dev)
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// More lenient rate limiter for authentication routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 50 : 10, // limit each IP to 10 login attempts per windowMs (50 in dev)
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
});

app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static file serving for uploads
// Use path.join to ensure correct path resolution from server directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/interviews', authenticateToken, interviewRoutes);
app.use('/api/upload', authenticateToken, uploadRoutes);
app.use('/api/reports', authenticateToken, reportRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Email test endpoint (development only)
app.post('/api/test-email', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ message: 'Email test endpoint is only available in development mode' });
  }

  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Email address is required' });
  }

  try {
    const { emailService } = require('./services/email');
    
    if (!emailService.transporter) {
      return res.status(500).json({ 
        message: 'Email service not configured',
        hint: 'Please set SMTP_HOST, SMTP_USER, and SMTP_PASS in your .env file'
      });
    }

    // Send a test email
    await emailService.transporter.sendMail({
      from: `"HireCorrecto Test" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Test Email from HireCorrecto',
      html: `
        <h1>Test Email</h1>
        <p>This is a test email from HireCorrecto.</p>
        <p>If you received this, your SMTP configuration is working correctly!</p>
        <p>Time: ${new Date().toISOString()}</p>
      `,
      text: 'This is a test email from HireCorrecto. If you received this, your SMTP configuration is working correctly!'
    });

    res.json({ 
      message: 'Test email sent successfully',
      email: email,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({ 
      message: 'Failed to send test email',
      error: error.message,
      code: error.code,
      hint: error.code === 'EAUTH' ? 'Check your SMTP_USER and SMTP_PASS (use App Password for Gmail)' : 
            error.code === 'ECONNECTION' ? 'Check your SMTP_HOST and SMTP_PORT' :
            'Check your email configuration in .env file'
    });
  }
});

// Conversation state tracking for silence detection and interventions
const conversationStates = new Map(); // sessionId -> conversationState

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('join-interview', async (data) => {
    const { interviewId, userRole } = data;
    socket.join(`interview-${interviewId}`);
    console.log(`User ${socket.id} joined interview ${interviewId} as ${userRole}`);
  });

  socket.on('start-gemini-session', async (data) => {
    const { interviewId, candidateId } = data;
    console.log(`Starting Gemini session for interview ${interviewId}, candidate ${candidateId}`);
    try {
      // Load interview data
      const interview = await Interview.findById(interviewId);
      if (!interview) {
        throw new Error('Interview not found');
      }

      // Check if interview is in the correct status
      if (interview.status !== 'in_progress') {
        console.warn(`Interview ${interviewId} is not in progress. Current status: ${interview.status}`);
        
        // If interview is completed, don't allow starting a new session
        if (interview.status === 'completed') {
          socket.emit('gemini-session-error', {
            message: 'This interview has already been completed. You cannot start a new session.',
            status: 'completed'
          });
          return;
        }
        
        // Try to start the interview if it's in 'invited' status
        if (interview.status === 'invited') {
          interview.status = 'in_progress';
          interview.startedAt = new Date();
          await interview.save();
          console.log(`Auto-started interview ${interviewId}`);
        } else {
          if (socket.connected) {
            socket.emit('gemini-session-error', {
              message: `Interview cannot be started. Current status: ${interview.status}`,
              status: interview.status
            });
          }
          return;
        }
      }

      // Convert interview to plain object for session storage
      const interviewData = {
        title: interview.title,
        description: interview.description,
        expectedSkills: interview.expectedSkills,
        experienceRange: interview.experienceRange,
        maxQuestions: interview.maxQuestions,
        duration: interview.duration,
        passPercentage: interview.passPercentage,
        mandatoryQuestions: interview.mandatoryQuestions || [],
        optionalQuestions: interview.optionalQuestions || [],
        mandatoryWeightage: interview.mandatoryWeightage || 0,
        optionalWeightage: interview.optionalWeightage || 0,
        questionHealth: interview.questionHealth || [],
        candidateId: interview.candidateId,
        candidateEmail: interview.candidateEmail
      };

      console.log('Initializing Gemini session...');
      // Initialize Gemini session with interview context
      const geminiSession = await initializeGemini(interviewId, candidateId, interviewData);
      console.log(`Gemini session initialized: ${geminiSession.id}`);
      
      // Save model name to interview (use environment variable or default to gemini-2.5-pro)
      interview.geminiModel = geminiSession.model || process.env.GEMINI_MODEL || 'gemini-2.5-pro';
      
      // Ensure totalTokenUsage is initialized
      if (!interview.totalTokenUsage) {
        interview.totalTokenUsage = {
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0
        };
      }
      
      // Check if first question already exists (in case of reconnection)
      let firstQuestion;
      let isNewQuestion = false;
      if (interview.questions.length > 0) {
        // Use existing first question
        firstQuestion = interview.questions[0];
        console.log(`Using existing first question: ${firstQuestion.id}`);
      } else {
        console.log('Generating first question...');
        // Generate first question
        firstQuestion = await generateFirstQuestion(geminiSession.id);
        console.log(`First question generated: ${firstQuestion.id}`);
        isNewQuestion = true;
        
        // Save question to database with token usage
        interview.questions.push({
          id: firstQuestion.id,
          text: firstQuestion.text,
          type: firstQuestion.type,
          order: firstQuestion.order,
          skillsTargeted: firstQuestion.skillsTargeted || [],
          token_usage: firstQuestion.token_usage || { input_tokens: 0, output_tokens: 0 }
        });
        
        // Track question health
        if (interview.candidateId || interview.candidateEmail) {
          interview.questionHealth.push({
            questionId: firstQuestion.id,
            questionText: firstQuestion.text,
            candidateId: interview.candidateId,
            candidateEmail: interview.candidateEmail,
            askedAt: new Date(),
            questionType: firstQuestion.questionType || 'generated'
          });
        }
      }
      
      // Update interview token usage and cost (only if question was newly generated)
      if (isNewQuestion && firstQuestion.token_usage) {
        const inputTokens = firstQuestion.token_usage?.input_tokens || 0;
        const outputTokens = firstQuestion.token_usage?.output_tokens || 0;
        interview.totalTokenUsage.input_tokens += inputTokens;
        interview.totalTokenUsage.output_tokens += outputTokens;
        interview.totalTokenUsage.total_tokens = interview.totalTokenUsage.input_tokens + interview.totalTokenUsage.output_tokens;
        interview.totalCost = (interview.totalCost || 0) + calculateCost(inputTokens, outputTokens, interview.geminiModel);
      }
      
      await interview.save();
      console.log('Interview saved successfully');

      // Initialize conversation state for this session
      conversationStates.set(geminiSession.id, {
        sessionId: geminiSession.id,
        interviewId: interviewId,
        currentQuestion: {
          id: firstQuestion.id,
          text: firstQuestion.text
        },
        questionStartTime: Date.now(),
        lastSpeechTime: null, // Will be set when question finishes speaking
        silenceDuration: 0,
        interventionLevel: 'none', // 'none' | 'thinking_check' | 'suggest_move_on' | 'force_move'
        candidateResponse: null, // 'thinking' | 'ready' | 'skip' | null
        interventionHistory: [],
        questionAttempts: 0,
        deflectionHistory: [],
        transcriptBuffer: '', // Buffer for accumulating transcript chunks
        lastProcessTime: 0 // Track last transcript processing time
      });

      console.log('Emitting gemini-session-ready event to socket:', socket.id);
      if (socket.connected) {
        socket.emit('gemini-session-ready', { 
          sessionId: geminiSession.id,
          firstQuestion: {
            id: firstQuestion.id,
            text: firstQuestion.text,
            type: firstQuestion.type,
            order: firstQuestion.order
          }
        });
        console.log('✅ gemini-session-ready event emitted successfully');
      } else {
        console.error('❌ Socket not connected, cannot emit gemini-session-ready');
        throw new Error('Socket disconnected before session could be initialized');
      }
    } catch (error) {
      console.error('❌ Start Gemini session error:', error);
      console.error('Error stack:', error.stack);
      const errorMessage = error.message || error.toString() || 'Unknown error occurred';
      if (socket.connected) {
        socket.emit('gemini-error', { 
          message: errorMessage,
          error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
      } else {
        console.error('❌ Socket not connected, cannot emit error to client');
      }
    }
  });

  socket.on('gemini-audio', async (data) => {
    // Support both old 'audioData' and new 'videoData' for backward compatibility
    const { sessionId, audioData, videoData, questionId, questionText, imageFrames, timestamps } = data;
    const mediaData = videoData || audioData; // Prefer videoData if available
    const isVideo = !!videoData; // Flag to indicate if we're sending video
    try {
      // Process video/audio with Gemini (full video analysis for better accuracy)
      // Pass timestamps for cheating detection analysis
      const response = await processGeminiAudio(sessionId, mediaData, questionId, questionText, imageFrames || [], isVideo, timestamps);
      
      // Track token usage and cost for audio processing
      const session = geminiService.getSession(sessionId);
      if (session) {
        const interview = await Interview.findById(session.interviewId);
        if (interview) {
          // Ensure model is set
          if (!interview.geminiModel) {
            interview.geminiModel = session.model || process.env.GEMINI_MODEL || 'gemini-2.5-pro';
          }
          
          // Update token usage and cost for audio processing
          const inputTokens = response.token_usage?.input_tokens || 0;
          const outputTokens = response.token_usage?.output_tokens || 0;
          interview.totalTokenUsage.input_tokens += inputTokens;
          interview.totalTokenUsage.output_tokens += outputTokens;
          interview.totalTokenUsage.total_tokens = interview.totalTokenUsage.input_tokens + interview.totalTokenUsage.output_tokens;
          interview.totalCost += calculateCost(inputTokens, outputTokens, interview.geminiModel);
          
          // Update question with evaluation, cheating, transcript, and token usage
          const question = interview.questions.find(q => q.id === questionId);
          if (question) {
            // Save evaluation if provided
            if (response.evaluation) {
              question.evaluation = response.evaluation;
            }
            // Save cheating analysis if provided
            if (response.cheating) {
              question.cheating = response.cheating;
            }
            // Save transcript if provided
            if (response.transcript) {
              question.transcript = response.transcript;
            }
            // Save token usage
            question.token_usage = response.token_usage || question.token_usage || { input_tokens: 0, output_tokens: 0 };
            // Mark as answered
            if (!question.answeredAt) {
              question.answeredAt = new Date();
            }
            
            // Phase 3: Track video segment end time and aggregate transcript
            const now = Date.now();
            const sessionStartTime = interview.startedAt ? interview.startedAt.getTime() : now;
            if (!question.videoSegment) {
              question.videoSegment = {};
            }
            question.videoSegment.endTime = now - sessionStartTime; // Relative to session start
            
            // Phase 3: Aggregate final transcript from conversation turns
            if (question.conversationTurns && question.conversationTurns.length > 0) {
              question.aggregateTranscript();
            } else {
              // Fallback to regular transcript if no conversation turns
              question.finalTranscript = question.transcript || '';
            }
          }
          
          await interview.save();
        }
      }
      
      // If we need to generate next question, do it
      if (response.next_action === 'next_question') {
        if (session) {
          const answeredQuestions = session.answeredQuestions || [];
          const lastAnswer = answeredQuestions[answeredQuestions.length - 1];
          const interview = await Interview.findById(session.interviewId);
          
          // Check if we've reached max questions
          if (interview.questions.length >= interview.maxQuestions) {
            response.next_action = 'end_interview';
          } else {
            // Update interview data in session with latest questions
            const session = geminiService.getSession(sessionId);
            if (session) {
              session.interviewData.questionHealth = interview.questionHealth || [];
            }
            
            // Get the current question to extract skills
            const currentQuestion = interview.questions.find(q => q.id === questionId);
            
            // Generate next question
            const previousAnswer = {
              questionText: questionText,
              transcript: response.transcript,
              evaluation: response.evaluation,
              order: interview.questions.length,
              questionsAsked: interview.questions.length,
              skillsTargeted: currentQuestion?.skillsTargeted || [],
              interviewQuestions: interview.questions // Pass questions for distribution calculation
            };
            
            const nextQuestion = await generateNextQuestion(sessionId, previousAnswer);
            
            // Save question to database with token usage
            interview.questions.push({
              id: nextQuestion.id,
              text: nextQuestion.text,
              type: nextQuestion.type,
              order: nextQuestion.order,
              skillsTargeted: nextQuestion.skillsTargeted || [],
              token_usage: nextQuestion.token_usage || { input_tokens: 0, output_tokens: 0 }
            });
            
            // Track question health
            if (interview.candidateId || interview.candidateEmail) {
              interview.questionHealth.push({
                questionId: nextQuestion.id,
                questionText: nextQuestion.text,
                candidateId: interview.candidateId,
                candidateEmail: interview.candidateEmail,
                askedAt: new Date(),
                questionType: nextQuestion.questionType || 'generated'
              });
            }
            
            // Update interview token usage and cost
            const inputTokens = nextQuestion.token_usage?.input_tokens || 0;
            const outputTokens = nextQuestion.token_usage?.output_tokens || 0;
            interview.totalTokenUsage.input_tokens += inputTokens;
            interview.totalTokenUsage.output_tokens += outputTokens;
            interview.totalTokenUsage.total_tokens = interview.totalTokenUsage.input_tokens + interview.totalTokenUsage.output_tokens;
            interview.totalCost += calculateCost(inputTokens, outputTokens, interview.geminiModel);
            
            await interview.save();
            
            response.nextQuestion = {
              id: nextQuestion.id,
              text: nextQuestion.text,
              type: nextQuestion.type,
              order: nextQuestion.order
            };
          }
        }
      }
      
      socket.emit('gemini-response', response);
    } catch (error) {
      console.error('Gemini audio processing error:', error);
      const errorMessage = error.message || error.toString() || 'Unknown error occurred';
      socket.emit('gemini-error', { 
        message: errorMessage,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  socket.on('generate-next-question', async (data) => {
    const { sessionId, previousAnswer } = data;
    try {
      const nextQuestion = await generateNextQuestion(sessionId, previousAnswer);
      
      // Save to database
      const session = geminiService.getSession(sessionId);
      if (session) {
        const interview = await Interview.findById(session.interviewId);
        if (interview) {
          // Ensure model is set
          if (!interview.geminiModel) {
            interview.geminiModel = session.model || process.env.GEMINI_MODEL || 'gemini-2.5-pro';
          }
          
          interview.questions.push({
            id: nextQuestion.id,
            text: nextQuestion.text,
            type: nextQuestion.type,
            order: nextQuestion.order,
            skillsTargeted: nextQuestion.skillsTargeted || [],
            token_usage: nextQuestion.token_usage || { input_tokens: 0, output_tokens: 0 }
          });
          
          // Track question health
          if (interview.candidateId || interview.candidateEmail) {
            interview.questionHealth.push({
              questionId: nextQuestion.id,
              questionText: nextQuestion.text,
              candidateId: interview.candidateId,
              candidateEmail: interview.candidateEmail,
              askedAt: new Date(),
              questionType: nextQuestion.questionType || 'generated'
            });
          }
          
          // Update interview token usage and cost
          const inputTokens = nextQuestion.token_usage?.input_tokens || 0;
          const outputTokens = nextQuestion.token_usage?.output_tokens || 0;
          interview.totalTokenUsage.input_tokens += inputTokens;
          interview.totalTokenUsage.output_tokens += outputTokens;
          interview.totalTokenUsage.total_tokens = interview.totalTokenUsage.input_tokens + interview.totalTokenUsage.output_tokens;
          interview.totalCost += calculateCost(inputTokens, outputTokens, interview.geminiModel);
          
          await interview.save();
        }
      }
      
      socket.emit('next-question-generated', {
        question: {
          id: nextQuestion.id,
          text: nextQuestion.text,
          type: nextQuestion.type,
          order: nextQuestion.order
        }
      });
    } catch (error) {
      console.error('Generate next question error:', error);
      const errorMessage = error.message || error.toString() || 'Unknown error occurred';
      socket.emit('gemini-error', { 
        message: errorMessage,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  // Real-time transcript chunk processing for follow-up questions
  socket.on('transcript-chunk', async (data) => {
    const { sessionId, questionId, questionText, transcriptChunk, isFinal, timestamp } = data;
    
    try {
      const session = geminiService.getSession(sessionId);
      if (!session) {
        console.warn(`Session ${sessionId} not found for transcript chunk`);
        return;
      }

      const conversationState = conversationStates.get(sessionId);
      if (!conversationState) {
        console.warn(`Conversation state not found for session ${sessionId}`);
        return;
      }

      // Update last speech time
      conversationState.lastSpeechTime = timestamp || Date.now();
      conversationState.silenceDuration = 0;

      // Buffer transcript chunks
      conversationState.transcriptBuffer += transcriptChunk + ' ';
      
      // Store candidate's transcript as conversation turn (only for final chunks to avoid duplicates)
      if (isFinal && transcriptChunk.trim().length > 0) {
        try {
          const session = geminiService.getSession(sessionId);
          if (session) {
            // Use findByIdAndUpdate with retry logic to handle version conflicts
            const maxRetries = 3;
            let retryCount = 0;
            let success = false;
            
            while (retryCount < maxRetries && !success) {
              try {
                const interview = await Interview.findById(session.interviewId);
                if (!interview) break;
                
                const question = interview.questions.find(q => q.id === questionId);
                if (!question) break;
                
                if (!question.conversationTurns) {
                  question.conversationTurns = [];
                }
                
                // Check if this is a continuation of previous candidate turn or new turn
                const lastTurn = question.conversationTurns[question.conversationTurns.length - 1];
                const now = Date.now();
                
                if (lastTurn && lastTurn.speaker === 'candidate' && (now - lastTurn.timestamp) < 5000) {
                  // Append to last turn (within 5 seconds)
                  lastTurn.text += ' ' + transcriptChunk.trim();
                  lastTurn.timestamp = now;
                } else {
                  // New turn
                  question.conversationTurns.push({
                    turnId: `turn_${now}_${Math.random().toString(36).substr(2, 9)}`,
                    speaker: 'candidate',
                    text: transcriptChunk.trim(),
                    timestamp: now,
                    transcript: transcriptChunk.trim()
                  });
                }
                
                // Use findByIdAndUpdate to avoid version conflicts
                const questionIndex = interview.questions.findIndex(q => q.id === questionId);
                await Interview.findByIdAndUpdate(
                  session.interviewId,
                  {
                    $set: {
                      [`questions.${questionIndex}.conversationTurns`]: question.conversationTurns
                    }
                  },
                  { new: true }
                );
                
                success = true;
              } catch (versionError) {
                retryCount++;
                if (retryCount >= maxRetries) {
                  console.error('Error storing candidate conversation turn after retries:', versionError);
                } else {
                  // Wait a bit before retrying (exponential backoff)
                  await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
                }
              }
            }
          }
        } catch (error) {
          console.error('Error storing candidate conversation turn:', error);
          // Don't fail the flow if storing fails
        }
      }

      // Check for question intent (interview integrity)
      if (transcriptChunk.trim().length > 10) {
        try {
          const questionIntent = await detectQuestionIntent(transcriptChunk, questionText || '');
          
          if (questionIntent.requires_deflection) {
            // Emit deflection response
            socket.emit('bot-deflection', {
              type: questionIntent.intent,
              message: questionIntent.suggested_bot_response,
              questionId: questionId,
              candidateQuestion: transcriptChunk,
              confidence: questionIntent.confidence
            });
            
            // Store bot deflection as conversation turn
            try {
              const session = geminiService.getSession(sessionId);
              if (session) {
                const interview = await Interview.findById(session.interviewId);
                if (interview) {
                  const question = interview.questions.find(q => q.id === questionId);
                  if (question) {
                    if (!question.conversationTurns) {
                      question.conversationTurns = [];
                    }
                    question.conversationTurns.push({
                      turnId: `turn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                      speaker: 'bot',
                      text: questionIntent.suggested_bot_response,
                      timestamp: Date.now(),
                      audioUrl: null
                    });
                    await interview.save();
                  }
                }
              }
            } catch (error) {
              console.error('Error storing bot deflection turn:', error);
            }

            // Log deflection
            conversationState.deflectionHistory.push({
              timestamp: Date.now(),
              type: questionIntent.intent,
              candidateQuestion: transcriptChunk,
              botResponse: questionIntent.suggested_bot_response,
              intent: questionIntent
            });
            conversationState.questionAttempts++;

            // Update interview with integrity data (async, don't block)
            const interview = await Interview.findById(session.interviewId);
            if (interview) {
              const question = interview.questions.find(q => q.id === questionId);
              if (question) {
                if (!question.integrity) {
                  question.integrity = {
                    questionAttempts: 0,
                    deflectionHistory: [],
                    severity: 'low',
                    legitimateClarifications: 0
                  };
                }
                question.integrity.questionAttempts++;
                question.integrity.deflectionHistory.push({
                  timestamp: Date.now(),
                  type: questionIntent.intent,
                  candidateQuestion: transcriptChunk,
                  botResponse: questionIntent.suggested_bot_response,
                  intent: {
                    detected: questionIntent.intent,
                    confidence: questionIntent.confidence
                  }
                });
                await interview.save();
              }
            }
          } else if (questionIntent.intent === 'legitimate_clarification' && questionIntent.can_clarify) {
            // Handle legitimate clarification
            socket.emit('bot-clarification', {
              message: questionIntent.suggested_bot_response,
              questionId: questionId
            });
            
            // Store bot clarification as conversation turn
            try {
              const session = geminiService.getSession(sessionId);
              if (session) {
                const interview = await Interview.findById(session.interviewId);
                if (interview) {
                  const question = interview.questions.find(q => q.id === questionId);
                  if (question) {
                    if (!question.conversationTurns) {
                      question.conversationTurns = [];
                    }
                    question.conversationTurns.push({
                      turnId: `turn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                      speaker: 'bot',
                      text: questionIntent.suggested_bot_response,
                      timestamp: Date.now(),
                      audioUrl: null
                    });
                    await interview.save();
                  }
                }
              }
            } catch (error) {
              console.error('Error storing bot clarification turn:', error);
            }

            if (conversationState) {
              if (!conversationState.deflectionHistory) {
                conversationState.deflectionHistory = [];
              }
              conversationState.deflectionHistory.push({
                timestamp: Date.now(),
                type: 'legitimate_clarification',
                candidateQuestion: transcriptChunk,
                botResponse: questionIntent.suggested_bot_response
              });
            }
          }
        } catch (error) {
          console.error('Error detecting question intent:', error);
          // Continue processing even if intent detection fails
        }
      }

      // Phase 2: Generate real-time acknowledgment for natural conversation flow
      // Only for substantial chunks (not every tiny chunk)
      if (transcriptChunk.trim().length > 30 && isFinal) {
        try {
          const acknowledgment = await generateRealTimeAcknowledgment(sessionId, transcriptChunk, questionId);
          if (acknowledgment && acknowledgment.should_acknowledge && acknowledgment.acknowledgment) {
            // Emit acknowledgment to client (but don't speak it immediately - let it be subtle)
            socket.emit('bot-acknowledgment', {
              message: acknowledgment.acknowledgment,
              questionId: questionId,
              type: 'realtime',
              confidence: acknowledgment.confidence
            });
          }
        } catch (error) {
          console.error('Error generating real-time acknowledgment:', error);
          // Don't fail the flow if acknowledgment fails
        }
      }

      // Process transcript chunk for follow-up questions (only if substantial content)
      // Only process every 3-4 seconds to avoid too many API calls
      const now = Date.now();
      const lastProcessTime = conversationState.lastProcessTime || 0;
      const shouldProcess = isFinal || (now - lastProcessTime > 3000 && conversationState.transcriptBuffer.trim().length > 50);

      if (shouldProcess && conversationState.transcriptBuffer.trim().length > 20) {
        conversationState.lastProcessTime = now;
        
        try {
          const analysis = await processTranscriptChunk(sessionId, conversationState.transcriptBuffer.trim(), questionId, questionText);
          
          // Update session token usage
          const interview = await Interview.findById(session.interviewId);
          if (interview) {
            const inputTokens = analysis.token_usage?.input_tokens || 0;
            const outputTokens = analysis.token_usage?.output_tokens || 0;
            interview.totalTokenUsage.input_tokens += inputTokens;
            interview.totalTokenUsage.output_tokens += outputTokens;
            interview.totalTokenUsage.total_tokens = interview.totalTokenUsage.input_tokens + interview.totalTokenUsage.output_tokens;
            interview.totalCost += calculateCost(inputTokens, outputTokens, analysis.model || 'gemini-1.5-flash');
            
            // Phase 3: Store candidate transcript chunk as conversation turn
            const question = interview.questions.find(q => q.id === questionId);
            if (question) {
              if (!question.conversationTurns) {
                question.conversationTurns = [];
              }
              
              // Check if we already have a recent candidate turn (within last 2 seconds)
              // If so, update it instead of creating a new one
              const recentCandidateTurn = question.conversationTurns
                .filter(t => t.speaker === 'candidate')
                .sort((a, b) => b.timestamp - a.timestamp)[0];
              
              if (recentCandidateTurn && (now - recentCandidateTurn.timestamp) < 2000) {
                // Update existing turn with accumulated transcript
                recentCandidateTurn.text = conversationState.transcriptBuffer.trim();
                recentCandidateTurn.transcript = conversationState.transcriptBuffer.trim();
                recentCandidateTurn.timestamp = now;
              } else {
                // Create new candidate turn
                question.conversationTurns.push({
                  turnId: `turn_${now}_${Math.random().toString(36).substr(2, 9)}`,
                  speaker: 'candidate',
                  text: conversationState.transcriptBuffer.trim(),
                  transcript: conversationState.transcriptBuffer.trim(),
                  timestamp: now
                });
              }
            }
            
            await interview.save();
          }

          // If should ask follow-up, emit it
          if (analysis.should_ask_followup && analysis.followup_question) {
            const followupQuestionId = `${questionId}_followup_${Date.now()}`;
            socket.emit('followup-question-ready', {
              questionId: questionId,
              followupQuestion: {
                id: followupQuestionId,
                text: analysis.followup_question,
                type: 'followup',
                parentQuestionId: questionId
              },
              confidence: analysis.confidence,
              reasoning: analysis.reasoning
            });
            
            // Phase 3: Store follow-up question as conversation turn when it's ready
            // Note: This will be stored when the bot actually asks it (via followup-asked event)
          }
        } catch (error) {
          console.error('Error processing transcript chunk:', error);
          // Don't emit error to client for transcript processing failures
        }
      }
    } catch (error) {
      console.error('Error handling transcript chunk:', error);
      // Don't emit error to client - transcript processing is non-critical
    }
  });

  // Silence detection and intervention
  socket.on('silence-detected', async (data) => {
    const { sessionId, questionId, silenceDuration, interventionLevel } = data;
    
    try {
      const conversationState = conversationStates.get(sessionId);
      if (!conversationState) {
        return;
      }

      conversationState.silenceDuration = silenceDuration;

      // Determine intervention type based on duration
      let interventionType = 'none';
      let response = '';
      const checkInResponses = [
        "I notice you've paused. Would you like to continue with your answer, or are you done?",
        "You've been quiet for a moment. Would you like to continue, or have you finished your answer?",
        "I see you've paused. Are you still working on your answer, or would you like to move on?",
        "Would you like to continue with your answer, or are you finished?"
      ];
      const suggestMoveOnResponses = [
        "That's perfectly fine. We can move on to the next question if you'd like.",
        "No worries at all. Would you like to move forward?",
        "It's okay if you're not sure. We can continue with the next question.",
        "That's alright. Shall we move on?"
      ];
      const forceMoveResponses = [
        "Let's move on to the next question.",
        "We'll continue with the next question.",
        "Moving forward to the next question."
      ];

      if (silenceDuration >= 5000 && silenceDuration < 15000 && conversationState.interventionLevel === 'none') {
        interventionType = 'check_in';
        response = checkInResponses[Math.floor(Math.random() * checkInResponses.length)];
        conversationState.interventionLevel = 'check_in';
        conversationState.interventionHistory.push({
          timestamp: Date.now(),
          type: 'check_in',
          botMessage: response,
          candidateResponse: null
        });
      } else if (silenceDuration >= 15000 && silenceDuration < 30000 && 
                 (conversationState.interventionLevel === 'check_in' || conversationState.interventionLevel === 'thinking_check') && 
                 (conversationState.candidateResponse === 'thinking' || conversationState.candidateResponse === 'continue')) {
        interventionType = 'suggest_move_on';
        response = suggestMoveOnResponses[Math.floor(Math.random() * suggestMoveOnResponses.length)];
        conversationState.interventionLevel = 'suggest_move_on';
        conversationState.interventionHistory.push({
          timestamp: Date.now(),
          type: 'suggest_move_on',
          botMessage: response,
          candidateResponse: null
        });
      } else if (silenceDuration >= 30000 && conversationState.interventionLevel !== 'force_move') {
        // Only process force_move if we haven't already done so (prevent duplicate question generation)
        interventionType = 'force_move';
        response = forceMoveResponses[Math.floor(Math.random() * forceMoveResponses.length)];
        conversationState.interventionLevel = 'force_move';
        
        // Move to next question
        const session = geminiService.getSession(sessionId);
        if (session) {
          const interview = await Interview.findById(session.interviewId);
          if (interview) {
            // Mark current question as skipped
            const question = interview.questions.find(q => q.id === questionId);
            if (question) {
              question.skipped = true;
              question.skipReason = 'timeout';
              question.skippedAt = new Date();
              if (!question.interventionHistory) {
                question.interventionHistory = conversationState.interventionHistory;
              }
            }

            // Check if we've already generated a next question (prevent duplicates)
            const hasNextQuestion = interview.questions.some(q => 
              q.order > (question?.order || interview.questions.length) && 
              q.id !== questionId
            );
            
            if (!hasNextQuestion && interview.questions.length < interview.maxQuestions) {
              // Generate next question
              const answeredQuestions = session.answeredQuestions || [];
              const lastAnswer = answeredQuestions[answeredQuestions.length - 1] || {};
              const previousAnswer = {
                questionText: question?.text || '',
                transcript: '',
                evaluation: {},
                order: interview.questions.length,
                questionsAsked: interview.questions.length,
                skillsTargeted: question?.skillsTargeted || [],
                interviewQuestions: interview.questions
              };

              const nextQuestion = await generateNextQuestion(sessionId, previousAnswer);
              
              // Double-check the question doesn't already exist before adding
              const questionExists = interview.questions.some(q => q.id === nextQuestion.id);
              if (!questionExists) {
                interview.questions.push({
                  id: nextQuestion.id,
                  text: nextQuestion.text,
                  type: nextQuestion.type,
                  order: nextQuestion.order,
                  skillsTargeted: nextQuestion.skillsTargeted || [],
                  token_usage: nextQuestion.token_usage || { input_tokens: 0, output_tokens: 0 }
                });
                await interview.save();

                socket.emit('next-question-generated', {
                  question: {
                    id: nextQuestion.id,
                    text: nextQuestion.text,
                    type: nextQuestion.type,
                    order: nextQuestion.order
                  }
                });
              } else {
                console.log('Next question already exists, skipping generation:', nextQuestion.id);
              }
            } else if (interview.questions.length >= interview.maxQuestions) {
              socket.emit('interview-complete', { message: 'Interview completed' });
            }
          }
        }
      }

      if (interventionType !== 'none') {
        socket.emit('bot-intervention', {
          type: interventionType,
          message: response,
          questionId: questionId,
          silenceDuration: silenceDuration
        });
        
        // Phase 3: Store bot intervention as conversation turn
        try {
          const session = geminiService.getSession(sessionId);
          if (session) {
            const interview = await Interview.findById(session.interviewId);
            if (interview) {
              const question = interview.questions.find(q => q.id === questionId);
              if (question) {
                if (!question.conversationTurns) {
                  question.conversationTurns = [];
                }
                question.conversationTurns.push({
                  turnId: `turn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  speaker: 'bot',
                  text: response,
                  timestamp: Date.now(),
                  audioUrl: null
                });
                await interview.save();
              }
            }
          }
        } catch (error) {
          console.error('Error storing bot intervention turn:', error);
        }
      }
    } catch (error) {
      console.error('Error handling silence detection:', error);
    }
  });

  // Update conversation state when question starts
  socket.on('question-started', async (data) => {
    const { sessionId, questionId, questionText } = data;
    const conversationState = conversationStates.get(sessionId);
    if (conversationState) {
      conversationState.currentQuestion = { id: questionId, text: questionText };
      conversationState.questionStartTime = Date.now();
      conversationState.interventionLevel = 'none';
      conversationState.candidateResponse = null;
      conversationState.transcriptBuffer = ''; // Reset buffer for new question
      conversationState.lastProcessTime = 0;
      conversationState.lastSpeechTime = null; // Reset for new question
      conversationState.candidateSpeaking = false; // Phase 2: Reset VAD state
      conversationState.botCanRespond = true; // Phase 2: Bot can respond after question
      
      // Phase 3: Store bot's question as a conversation turn and track video segment start
      try {
        const session = geminiService.getSession(sessionId);
        if (session) {
          const interview = await Interview.findById(session.interviewId);
          if (interview) {
            const question = interview.questions.find(q => q.id === questionId);
            if (question) {
              if (!question.conversationTurns) {
                question.conversationTurns = [];
              }
              
              const now = Date.now();
              const sessionStartTime = interview.startedAt ? interview.startedAt.getTime() : now;
              
              // Add bot's question turn
              question.conversationTurns.push({
                turnId: `turn_${now}_${Math.random().toString(36).substr(2, 9)}`,
                speaker: 'bot',
                text: questionText,
                timestamp: now,
                audioUrl: null // Bot uses TTS
              });
              
              // Phase 3: Track video segment start time
              if (!question.videoSegment) {
                question.videoSegment = {};
              }
              question.videoSegment.startTime = now - sessionStartTime; // Relative to session start
              
              await interview.save();
            }
          }
        }
      } catch (error) {
        console.error('Error storing conversation turn:', error);
        // Don't fail the flow if storing fails
      }
    }
  });

  // Phase 3: Track when follow-up question is asked
  socket.on('followup-asked', async (data) => {
    const { sessionId, questionId, followupQuestionText, parentQuestionId } = data;
    
    try {
      const session = geminiService.getSession(sessionId);
      if (session) {
        const interview = await Interview.findById(session.interviewId);
        if (interview) {
          // Store follow-up in the parent question's conversation turns
          const parentQuestion = interview.questions.find(q => q.id === (parentQuestionId || questionId));
          if (parentQuestion) {
            if (!parentQuestion.conversationTurns) {
              parentQuestion.conversationTurns = [];
            }
            
            parentQuestion.conversationTurns.push({
              turnId: `turn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              speaker: 'bot',
              text: followupQuestionText,
              timestamp: Date.now(),
              audioUrl: null
            });
            
            await interview.save();
          }
        }
      }
    } catch (error) {
      console.error('Error storing follow-up question turn:', error);
    }
  });

  // Phase 2: Handle VAD (Voice Activity Detection) events
  socket.on('vad-detected', async (data) => {
    const { sessionId, isSpeaking, energy, silenceDuration, speakingDuration, timestamp } = data;
    
    try {
      const conversationState = conversationStates.get(sessionId);
      if (!conversationState) {
        return;
      }

      // Update conversation state with VAD information
      conversationState.candidateSpeaking = isSpeaking;
      conversationState.lastVADTime = timestamp || Date.now();
      
      if (isSpeaking) {
        conversationState.candidateSpeakingStartTime = timestamp || Date.now();
        conversationState.silenceDuration = 0;
      } else {
        conversationState.silenceDuration = silenceDuration || 0;
        conversationState.candidateSpeakingDuration = speakingDuration || 0;
      }

      // Turn management: If candidate has been speaking for > 30 seconds, bot can interrupt
      if (isSpeaking && speakingDuration && speakingDuration > 30000) {
        // Bot can prepare to interrupt (but don't interrupt immediately)
        // This is handled in the turn management logic
      }

      // If candidate stopped speaking and silence > 1-2 seconds, bot can respond
      if (!isSpeaking && silenceDuration && silenceDuration > 1500 && conversationState.botCanRespond) {
        // Bot can now respond (handled in turn management)
      }
    } catch (error) {
      console.error('Error handling VAD event:', error);
    }
  });

  // Phase 2: Handle audio chunks for real-time processing
  socket.on('audio-chunk', async (data) => {
    const { sessionId, audioData, sampleRate, timestamp } = data;
    
    try {
      const session = geminiService.getSession(sessionId);
      if (!session) {
        return;
      }

      // For now, we'll just acknowledge receipt
      // In future, this can be used for real-time audio processing
      // (e.g., server-side transcription, real-time analysis)
      
      // Note: Audio chunks are received but not processed in real-time yet
      // This is a foundation for future real-time audio processing features
    } catch (error) {
      console.error('Error handling audio chunk:', error);
    }
  });

  // Handle candidate response to interventions
  socket.on('candidate-response', async (data) => {
    const { sessionId, questionId, transcript } = data;
    
    try {
      const conversationState = conversationStates.get(sessionId);
      if (!conversationState) {
        return;
      }

      // Detect response intent
      const intent = await detectResponseIntent(transcript);
      conversationState.candidateResponse = intent.intent;

      if (intent.intent === 'continue') {
        // Candidate wants to continue answering - reset silence timer and let them continue
        conversationState.lastSpeechTime = Date.now();
        conversationState.silenceDuration = 0;
        conversationState.interventionLevel = 'none'; // Reset intervention level
        
        // Update intervention history
        const lastIntervention = conversationState.interventionHistory[conversationState.interventionHistory.length - 1];
        if (lastIntervention) {
          lastIntervention.candidateResponse = transcript;
          lastIntervention.responseTimestamp = Date.now();
          lastIntervention.intent = 'continue';
        }

        socket.emit('bot-acknowledgment', {
          message: "Of course, please continue with your answer.",
          questionId: questionId,
          type: 'continue_allowed'
        });
        
        // Store bot acknowledgment as conversation turn
        try {
          const session = geminiService.getSession(sessionId);
          if (session) {
            const interview = await Interview.findById(session.interviewId);
            if (interview) {
              const question = interview.questions.find(q => q.id === questionId);
              if (question) {
                if (!question.conversationTurns) {
                  question.conversationTurns = [];
                }
                question.conversationTurns.push({
                  turnId: `turn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  speaker: 'bot',
                  text: "Of course, please continue with your answer.",
                  timestamp: Date.now(),
                  audioUrl: null
                });
                await interview.save();
              }
            }
          }
        } catch (error) {
          console.error('Error storing bot acknowledgment turn:', error);
        }
      } else if (intent.intent === 'done') {
        // Candidate is done with their answer - process it and move to next question
        const lastIntervention = conversationState.interventionHistory[conversationState.interventionHistory.length - 1];
        if (lastIntervention) {
          lastIntervention.candidateResponse = transcript;
          lastIntervention.responseTimestamp = Date.now();
          lastIntervention.intent = 'done';
        }

        socket.emit('bot-acknowledgment', {
          message: "Thank you. Let me process your answer and we'll move to the next question.",
          questionId: questionId,
          type: 'processing_answer'
        });

        // Trigger answer processing (this will be handled by the client's stopAnswering function)
        socket.emit('process-answer-now', {
          questionId: questionId,
          reason: 'candidate_done'
        });
      } else if (intent.intent === 'thinking') {
        // Reset silence timer, give more time
        conversationState.lastSpeechTime = Date.now();
        conversationState.silenceDuration = 0;
        
        // Update intervention history
        const lastIntervention = conversationState.interventionHistory[conversationState.interventionHistory.length - 1];
        if (lastIntervention) {
          lastIntervention.candidateResponse = transcript;
          lastIntervention.responseTimestamp = Date.now();
        }

        socket.emit('bot-acknowledgment', {
          message: "Take your time, I'm here when you're ready.",
          questionId: questionId
        });
        
        // Store bot acknowledgment as conversation turn
        try {
          const session = geminiService.getSession(sessionId);
          if (session) {
            const interview = await Interview.findById(session.interviewId);
            if (interview) {
              const question = interview.questions.find(q => q.id === questionId);
              if (question) {
                if (!question.conversationTurns) {
                  question.conversationTurns = [];
                }
                question.conversationTurns.push({
                  turnId: `turn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  speaker: 'bot',
                  text: "Take your time, I'm here when you're ready.",
                  timestamp: Date.now(),
                  audioUrl: null
                });
                await interview.save();
              }
            }
          }
        } catch (error) {
          console.error('Error storing bot acknowledgment turn:', error);
        }
      } else if (intent.intent === 'skip') {
        // Move to next question
        const session = geminiService.getSession(sessionId);
        if (session) {
          const interview = await Interview.findById(session.interviewId);
          if (interview) {
            const question = interview.questions.find(q => q.id === questionId);
            if (question) {
              question.skipped = true;
              question.skipReason = 'candidate_requested';
              question.skippedAt = new Date();
            }

            // Generate next question
            const previousAnswer = {
              questionText: question?.text || '',
              transcript: '',
              evaluation: {},
              order: interview.questions.length,
              questionsAsked: interview.questions.length,
              skillsTargeted: question?.skillsTargeted || [],
              interviewQuestions: interview.questions
            };

            if (interview.questions.length < interview.maxQuestions) {
              const nextQuestion = await generateNextQuestion(sessionId, previousAnswer);
              interview.questions.push({
                id: nextQuestion.id,
                text: nextQuestion.text,
                type: nextQuestion.type,
                order: nextQuestion.order,
                skillsTargeted: nextQuestion.skillsTargeted || [],
                token_usage: nextQuestion.token_usage || { input_tokens: 0, output_tokens: 0 }
              });
              await interview.save();

              socket.emit('next-question-generated', {
                question: {
                  id: nextQuestion.id,
                  text: nextQuestion.text,
                  type: nextQuestion.type,
                  order: nextQuestion.order
                }
              });
            } else {
              socket.emit('interview-complete', { message: 'Interview completed' });
            }
          }
        }

        socket.emit('bot-acknowledgment', {
          message: "No problem at all. Let's move to the next question.",
          questionId: questionId
        });
        
        // Store bot acknowledgment as conversation turn
        try {
          const session = geminiService.getSession(sessionId);
          if (session) {
            const interview = await Interview.findById(session.interviewId);
            if (interview) {
              const question = interview.questions.find(q => q.id === questionId);
              if (question) {
                if (!question.conversationTurns) {
                  question.conversationTurns = [];
                }
                question.conversationTurns.push({
                  turnId: `turn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  speaker: 'bot',
                  text: "No problem at all. Let's move to the next question.",
                  timestamp: Date.now(),
                  audioUrl: null
                });
                await interview.save();
              }
            }
          }
        } catch (error) {
          console.error('Error storing bot acknowledgment turn:', error);
        }
      } else if (intent.intent === 'answering') {
        // Candidate started answering - cancel any pending interventions
        conversationState.candidateResponse = 'ready';
        conversationState.interventionLevel = 'none';
        conversationState.lastSpeechTime = Date.now();
        conversationState.silenceDuration = 0;

        socket.emit('bot-acknowledgment', {
          message: "Go ahead, I'm listening.",
          questionId: questionId
        });
        
        // Store bot acknowledgment as conversation turn
        try {
          const session = geminiService.getSession(sessionId);
          if (session) {
            const interview = await Interview.findById(session.interviewId);
            if (interview) {
              const question = interview.questions.find(q => q.id === questionId);
              if (question) {
                if (!question.conversationTurns) {
                  question.conversationTurns = [];
                }
                question.conversationTurns.push({
                  turnId: `turn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  speaker: 'bot',
                  text: "Go ahead, I'm listening.",
                  timestamp: Date.now(),
                  audioUrl: null
                });
                await interview.save();
              }
            }
          }
        } catch (error) {
          console.error('Error storing bot acknowledgment turn:', error);
        }
      }
    } catch (error) {
      console.error('Error handling candidate response:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    // Clean up conversation states (optional - can keep for session duration)
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Database connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    // Start server
    const PORT = process.env.PORT || 5004;
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    mongoose.connection.close();
    process.exit(0);
  });
});

module.exports = { app, io };
