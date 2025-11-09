const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config({ path: '../.env' });

const authRoutes = require('./routes/auth');
const interviewRoutes = require('./routes/interviews');
const uploadRoutes = require('./routes/upload');
const reportRoutes = require('./routes/reports');
const { authenticateToken } = require('./middleware/auth');
const { initializeGemini, generateFirstQuestion, generateNextQuestion, processGeminiAudio, geminiService, getSessionSummary, calculateCost } = require('./services/gemini');
const Interview = require('./models/Interview');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

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
app.use('/uploads', express.static('uploads'));

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
        // Try to start the interview if it's in 'invited' status
        if (interview.status === 'invited') {
          interview.status = 'in_progress';
          interview.startedAt = new Date();
          await interview.save();
          console.log(`Auto-started interview ${interviewId}`);
        } else {
          throw new Error(`Interview cannot be started. Current status: ${interview.status}`);
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
          
          // Update question with token usage if it exists
          const question = interview.questions.find(q => q.id === questionId);
          if (question) {
            question.token_usage = response.token_usage || question.token_usage || { input_tokens: 0, output_tokens: 0 };
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

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
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
