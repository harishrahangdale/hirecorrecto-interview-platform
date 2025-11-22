const { GoogleGenerativeAI } = require('@google/generative-ai');
const { v4: uuidv4 } = require('uuid');

// Pricing information per 1M tokens (as of 2024)
// Prices are in USD per million tokens
const MODEL_PRICING = {
  'gemini-1.5-flash': {
    input: 0.075,  // $0.075 per 1M input tokens
    output: 0.30   // $0.30 per 1M output tokens
  },
  'gemini-1.5-pro': {
    input: 1.25,   // $1.25 per 1M input tokens
    output: 5.00   // $5.00 per 1M output tokens
  },
  'gemini-2.0-flash-exp': {
    input: 0.075,  // $0.075 per 1M input tokens
    output: 0.30   // $0.30 per 1M output tokens
  },
  'gemini-2.5-pro': {
    input: 1.50,   // Estimated $1.50 per 1M input tokens
    output: 6.00   // Estimated $6.00 per 1M output tokens
  },
  'gemini-pro': {
    input: 0.50,   // $0.50 per 1M input tokens
    output: 1.50   // $1.50 per 1M output tokens
  }
};

// Fallback model order if primary model fails
// Start with the simplest/most compatible model names first
// Many API keys only have access to 'gemini-pro' (the basic model)
const FALLBACK_MODELS = [
  'gemini-pro',           // Most common, usually available on all API keys
  'gemini-1.5-flash',     // Standard name (if available)
  'gemini-1.5-pro'        // Standard name (if available)
];

// USD to INR conversion rate (configurable via environment variable)
const USD_TO_INR = parseFloat(process.env.USD_TO_INR_RATE) || 83.5;

// Default model to use - prefer 2.5 pro for best quality, can be overridden via GEMINI_MODEL env var
// Options: 'gemini-2.5-pro' (best quality), 'gemini-1.5-pro' (recommended), 'gemini-1.5-flash' (faster/cheaper), 'gemini-2.0-flash-exp' (experimental), 'gemini-pro' (older)
// Note: If gemini-2.5-pro is not available, will automatically fallback to gemini-pro, then gemini-1.5-flash, then gemini-1.5-pro
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-pro';

class GeminiService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    this.genAI = null;
    this.sessions = new Map(); // Store active sessions
    this.defaultModel = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    
    if (this.apiKey) {
      this.genAI = new GoogleGenerativeAI(this.apiKey);
      console.log(`Gemini service initialized with model: ${this.defaultModel}`);
    } else {
      console.warn('GEMINI_API_KEY not found. Gemini features will be disabled.');
    }
  }

  /**
   * List available models (for debugging/validation)
   * @returns {Promise<Array>} List of available models
   */
  async listAvailableModels() {
    if (!this.genAI) {
      throw new Error('Gemini API not configured');
    }
    
    try {
      // The SDK doesn't have a direct listModels method, but we can validate by trying to create a model
      // For now, return the known models
      return Object.keys(MODEL_PRICING);
    } catch (error) {
      console.error('Error listing models:', error);
      return [];
    }
  }

  /**
   * Validate if a model name is supported
   * @param {string} modelName - Model name to validate
   * @returns {boolean} True if model is supported
   */
  isValidModel(modelName) {
    return MODEL_PRICING.hasOwnProperty(modelName);
  }

  /**
   * Calculate cost based on token usage and model
   * @param {number} inputTokens - Number of input tokens
   * @param {number} outputTokens - Number of output tokens
   * @param {string} model - Model name
   * @returns {number} Cost in USD
   */
  calculateCost(inputTokens, outputTokens, model = this.defaultModel) {
    const pricing = MODEL_PRICING[model] || MODEL_PRICING[DEFAULT_MODEL];
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    return inputCost + outputCost;
  }

  /**
   * Convert USD cost to INR
   * @param {number} usdCost - Cost in USD
   * @returns {number} Cost in INR
   */
  convertToINR(usdCost) {
    return usdCost * USD_TO_INR;
  }

  /**
   * Extract token usage from Gemini API response
   * @param {Object} result - Gemini API result object from generateContent
   * @returns {Object} Token usage object with input_tokens and output_tokens
   */
  extractTokenUsage(result) {
    try {
      if (!result) {
        console.warn('extractTokenUsage: result is null or undefined');
        return { input_tokens: 0, output_tokens: 0 };
      }

      // Try to get response first if it exists
      const response = result.response || result;
      
      // Check for usageMetadata at the response level (most common in newer API)
      if (response && response.usageMetadata) {
        return {
          input_tokens: response.usageMetadata.promptTokenCount || 0,
          output_tokens: response.usageMetadata.candidatesTokenCount || 0
        };
      }
      
      // Check for usageMetadata at the result level
      if (result.usageMetadata) {
        return {
          input_tokens: result.usageMetadata.promptTokenCount || 0,
          output_tokens: result.usageMetadata.candidatesTokenCount || 0
        };
      }
      
      // Check for totalTokenCount as alternative (some API versions)
      if (response && response.usageMetadata && response.usageMetadata.totalTokenCount !== undefined) {
        const total = response.usageMetadata.totalTokenCount || 0;
        // Estimate input/output split (rough estimate)
        return {
          input_tokens: Math.floor(total * 0.7),
          output_tokens: Math.floor(total * 0.3)
        };
      }
      
      // Log warning if no token usage found (only in development)
      if (process.env.NODE_ENV === 'development' && result) {
        console.warn('Token usage metadata not found. Result structure:', {
          hasResponse: !!result.response,
          hasUsageMetadata: !!result.usageMetadata,
          resultKeys: Object.keys(result),
          responseKeys: result.response ? Object.keys(result.response) : []
        });
      }
      
      return { input_tokens: 0, output_tokens: 0 };
    } catch (error) {
      console.error('Error extracting token usage:', error);
      return { input_tokens: 0, output_tokens: 0 };
    }
  }

  async initializeGemini(interviewId, candidateId, interviewData) {
    if (!this.genAI) {
      throw new Error('Gemini API not configured');
    }

    const sessionId = uuidv4();
    const session = {
      id: sessionId,
      interviewId,
      candidateId,
      interviewData, // Store interview context
      model: this.defaultModel, // Track which model is being used
      startTime: new Date(),
      questions: [],
      answeredQuestions: [],
      totalTokens: { input: 0, output: 0 },
      totalCost: 0 // Track total cost in USD
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Select a mandatory question based on question health and skill weightage
   */
  selectMandatoryQuestion(interview, candidateId, candidateEmail, askedQuestions = []) {
    const mandatoryQuestions = interview.mandatoryQuestions || [];
    if (mandatoryQuestions.length === 0) return null;

    const questionHealth = interview.questionHealth || [];
    const recentQuestions = questionHealth.filter(qh => {
      // Check if asked in last 24 hours to same candidate
      const askedRecently = new Date(qh.askedAt) > new Date(Date.now() - 24 * 60 * 60 * 1000);
      const sameCandidate = (candidateId && qh.candidateId?.toString() === candidateId.toString()) ||
                            (candidateEmail && qh.candidateEmail === candidateEmail);
      return askedRecently && sameCandidate;
    });

    // Get questions that haven't been asked recently to this candidate
    const recentlyAskedTexts = new Set(recentQuestions.map(qh => qh.questionText.toLowerCase()));
    
    // Filter available questions (handle both old string format and new object format)
    const availableQuestions = mandatoryQuestions.filter(q => {
      const questionText = typeof q === 'string' ? q : q.text;
      return !recentlyAskedTexts.has(questionText.toLowerCase());
    });

    // If all questions were asked recently, use all questions
    const questionsToUse = availableQuestions.length > 0 ? availableQuestions : mandatoryQuestions;

    // Calculate skill coverage from already asked questions
    const askedSkillCounts = {};
    askedQuestions.forEach(q => {
      let qSkills = [];
      if (typeof q === 'string') {
        qSkills = [];
      } else if (q.skills && Array.isArray(q.skills)) {
        qSkills = q.skills;
      } else if (q.skillsTargeted && Array.isArray(q.skillsTargeted)) {
        qSkills = q.skillsTargeted;
      } else if (q.text) {
        // Look up skills from mandatoryQuestions by matching text
        const matchingQuestion = mandatoryQuestions.find(mq => {
          const mqText = typeof mq === 'string' ? mq : mq.text;
          return mqText.toLowerCase() === q.text.toLowerCase();
        });
        if (matchingQuestion && typeof matchingQuestion !== 'string') {
          qSkills = matchingQuestion.skills || [];
        }
      }
      qSkills.forEach(skill => {
        askedSkillCounts[skill] = (askedSkillCounts[skill] || 0) + 1;
      });
    });

    // Create skill weight map
    const skillWeights = {};
    (interview.expectedSkills || []).forEach(skill => {
      skillWeights[skill.skill] = skill.weight || 0;
    });

    // Score questions based on:
    // 1. Skills with higher weightage (prioritize)
    // 2. Skills that haven't been asked much (balance coverage)
    const scoredQuestions = questionsToUse.map(q => {
      const questionText = typeof q === 'string' ? q : q.text;
      const questionSkills = typeof q === 'string' ? [] : (q.skills || []);
      
      let score = 0;
      questionSkills.forEach(skill => {
        const skillWeight = skillWeights[skill] || 0;
        const askedCount = askedSkillCounts[skill] || 0;
        // Higher weight = higher score, but reduce score if asked too many times
        score += skillWeight * (1 / (1 + askedCount * 0.5));
      });
      
      return { question: q, text: questionText, score };
    });

    // Sort by score (highest first)
    scoredQuestions.sort((a, b) => b.score - a.score);

    // Select from top 30% of questions (to add some randomness while prioritizing)
    const topCount = Math.max(1, Math.ceil(scoredQuestions.length * 0.3));
    const topQuestions = scoredQuestions.slice(0, topCount);
    
    // Randomly select from top questions
    const randomIndex = Math.floor(Math.random() * topQuestions.length);
    const selected = topQuestions[randomIndex];
    
    // Return the full question object (with text and skills)
    return selected.question;
  }

  /**
   * Calculate how many mandatory vs generated questions to ask
   * @param {Object} interview - Interview data
   * @param {number} askedQuestionsCount - Number of questions already asked
   * @param {Array} interviewQuestions - List of questions already asked in the interview
   */
  calculateQuestionDistribution(interview, askedQuestionsCount, interviewQuestions = []) {
    const maxQuestions = interview.maxQuestions || 5;
    const mandatoryWeightage = interview.mandatoryWeightage || 0;
    const optionalWeightage = interview.optionalWeightage || 0;
    const mandatoryQuestions = interview.mandatoryQuestions || [];
    
    const remainingQuestions = maxQuestions - askedQuestionsCount;
    
    // Calculate how many mandatory questions should be asked
    const totalMandatoryNeeded = Math.round((mandatoryWeightage / 100) * maxQuestions);
    // Count mandatory questions already asked (type === 'static' indicates mandatory)
    const mandatoryAsked = interviewQuestions.filter(q => q.type === 'static').length;
    const mandatoryRemaining = Math.max(0, totalMandatoryNeeded - mandatoryAsked);
    
    // If we have mandatory questions and weightage > 0, prioritize them
    const shouldAskMandatory = mandatoryQuestions.length > 0 && 
                               mandatoryWeightage > 0 && 
                               mandatoryRemaining > 0 &&
                               remainingQuestions > 0;
    
    return {
      shouldAskMandatory,
      mandatoryRemaining,
      remainingQuestions,
      totalMandatoryNeeded
    };
  }

  async generateFirstQuestion(sessionId) {
    if (!this.genAI) {
      throw new Error('Gemini API not configured. Please set GEMINI_API_KEY environment variable.');
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Invalid session ID');
    }

    const interview = session.interviewData;
    if (!interview) {
      throw new Error('Interview data not found in session');
    }

    // Check if we should use a mandatory question first
    const distribution = this.calculateQuestionDistribution(interview, 0, []);
    let selectedQuestion = null;
    let questionType = 'generated';

    if (distribution.shouldAskMandatory) {
      // Get candidate info from interview data if available
      const candidateId = session.candidateId;
      const candidateEmail = interview.candidateEmail || null;
      const mandatoryQuestion = this.selectMandatoryQuestion(
        interview, 
        candidateId, 
        candidateEmail,
        [] // No questions asked yet for first question
      );
      
      if (mandatoryQuestion) {
        selectedQuestion = mandatoryQuestion;
        questionType = 'mandatory';
      }
    }

    // If we have a mandatory question, use it; otherwise generate one
    if (selectedQuestion) {
      const questionId = `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const questionText = typeof selectedQuestion === 'string' ? selectedQuestion : selectedQuestion.text;
      const questionSkills = typeof selectedQuestion === 'string' ? [] : (selectedQuestion.skills || []);
      return {
        id: questionId,
        text: questionText,
        type: 'static', // Mark as static since it's from mandatory list
        order: 1,
        skillsTargeted: questionSkills,
        questionType: 'mandatory',
        token_usage: { input_tokens: 0, output_tokens: 0 }
      };
    }

    // Generate question using Gemini
    const prompt = this.buildQuestionGenerationPrompt(interview, null, true);

    // Try primary model first, then fallback models
    // IMPORTANT: Start with gemini-pro first as it's the most compatible
    // Many API keys only have access to the basic 'gemini-pro' model
    const primaryModel = session.model || this.defaultModel;
    // Reorder to try gemini-pro first (most compatible), then primary, then others
    const modelsToTry = [
      'gemini-pro', // Try this first as it's most likely to work
      primaryModel !== 'gemini-pro' ? primaryModel : null,
      ...FALLBACK_MODELS.filter(m => m !== 'gemini-pro' && m !== primaryModel)
    ].filter(m => m !== null);
    let lastError = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`Attempting to use model: ${modelName}`);
        
        // Try to create model - strip 'models/' prefix if present as SDK handles it
        const cleanModelName = modelName.replace(/^models\//, '');
        const model = this.genAI.getGenerativeModel({ model: cleanModelName });
        
        // Try a simple test generation first (just to validate the model works)
        const result = await model.generateContent(prompt);
        
        // Get response first to ensure we have it
        const response = await result.response;
        if (!response) {
          throw new Error('No response received from Gemini API');
        }
        
        const text = response.text();
        if (!text || text.trim().length === 0) {
          throw new Error('Empty response received from Gemini API');
        }
        
        // Extract actual token usage from API response (after getting response)
        const tokenUsage = this.extractTokenUsage(result);

        // Parse the response
        const questionData = this.parseQuestionResponse(text);
        
        // Use actual token usage from API instead of parsed (which may be 0)
        questionData.token_usage = tokenUsage;
        
        // Update session model if we used a fallback
        if (modelName !== primaryModel) {
          console.log(`Model ${primaryModel} not available, using fallback: ${modelName}`);
          session.model = modelName;
        }
        
        // Update session with actual token usage
        session.totalTokens.input += tokenUsage.input_tokens;
        session.totalTokens.output += tokenUsage.output_tokens;
        
        // Calculate and add cost
        const cost = this.calculateCost(tokenUsage.input_tokens, tokenUsage.output_tokens, modelName);
        session.totalCost += cost;

        return questionData;
      } catch (error) {
        lastError = error;
        // If it's a 404/model not found error, try next model
        if (error.message && (error.message.includes('404') || error.message.includes('not found'))) {
          console.warn(`Model ${modelName} not available, trying next model...`);
          continue; // Try next model
        }
        // For other errors, break and throw
        break;
      }
    }

    // If we get here, all models failed
    console.error('Error generating first question:', lastError);
    const error = lastError || new Error('Unknown error');
    
    // Provide more detailed error message
    if (error.message && error.message.includes('API_KEY')) {
      throw new Error('Gemini API key is invalid or not configured. Please check your GEMINI_API_KEY environment variable.');
    } else if (error.message && error.message.includes('quota')) {
      throw new Error('Gemini API quota exceeded. Please check your API usage limits.');
    } else if (error.message && (error.message.includes('404') || error.message.includes('not found'))) {
      const availableModels = Object.keys(MODEL_PRICING).join(', ');
      throw new Error(`None of the models are available. Tried: ${modelsToTry.join(', ')}. Available models in config: ${availableModels}. Please check your GEMINI_API_KEY has access to these models. Original error: ${error.message}`);
    } else {
      throw new Error(`Failed to generate question: ${error.message || error.toString()}`);
    }
  }

  async generateNextQuestion(sessionId, previousAnswer) {
    if (!this.genAI) {
      throw new Error('Gemini API not configured');
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Invalid session ID');
    }

    const interview = session.interviewData;
    
    // Check if we should use a mandatory question
    const questionsAsked = (previousAnswer?.questionsAsked || 0) + 1;
    // Get list of already asked questions from previousAnswer or use empty array
    const interviewQuestions = previousAnswer?.interviewQuestions || [];
    const distribution = this.calculateQuestionDistribution(interview, questionsAsked, interviewQuestions);
    let selectedQuestion = null;
    let questionType = 'generated';

    if (distribution.shouldAskMandatory) {
      // Get candidate info from interview data if available
      const candidateId = session.candidateId;
      const candidateEmail = interview.candidateEmail || null;
      // Get already asked questions for skill-based selection
      const askedQuestions = interviewQuestions.filter(q => q.type === 'static' || q.questionType === 'mandatory');
      const mandatoryQuestion = this.selectMandatoryQuestion(
        interview, 
        candidateId, 
        candidateEmail,
        askedQuestions
      );
      
      if (mandatoryQuestion) {
        selectedQuestion = mandatoryQuestion;
        questionType = 'mandatory';
      }
    }

    // If we have a mandatory question, use it; otherwise generate one
    if (selectedQuestion) {
      const questionId = `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const questionText = typeof selectedQuestion === 'string' ? selectedQuestion : selectedQuestion.text;
      const questionSkills = typeof selectedQuestion === 'string' ? [] : (selectedQuestion.skills || []);
      return {
        id: questionId,
        text: questionText,
        type: 'static',
        order: questionsAsked + 1,
        skillsTargeted: questionSkills,
        questionType: 'mandatory',
        token_usage: { input_tokens: 0, output_tokens: 0 }
      };
    }

    // Generate question using Gemini
    const prompt = this.buildQuestionGenerationPrompt(interview, previousAnswer, false);

    // Use the model that was successful in the session (or default)
    const primaryModel = session.model || this.defaultModel;
    const modelsToTry = [primaryModel, ...FALLBACK_MODELS.filter(m => m !== primaryModel)];
    let lastError = null;

    for (const modelName of modelsToTry) {
      try {
        const model = this.genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        
        // Get response first to ensure we have it
        const response = await result.response;
        const text = response.text();
        
        // Extract actual token usage from API response (after getting response)
        const tokenUsage = this.extractTokenUsage(result);

        // Parse the response
        const questionData = this.parseQuestionResponse(text);
        
        // Use actual token usage from API instead of parsed (which may be 0)
        questionData.token_usage = tokenUsage;
        
        // Update session model if we used a fallback
        if (modelName !== primaryModel) {
          console.log(`Model ${primaryModel} not available, using fallback: ${modelName}`);
          session.model = modelName;
        }
        
        // Update session with actual token usage
        session.totalTokens.input += tokenUsage.input_tokens;
        session.totalTokens.output += tokenUsage.output_tokens;
        
        // Calculate and add cost
        const cost = this.calculateCost(tokenUsage.input_tokens, tokenUsage.output_tokens, modelName);
        session.totalCost += cost;

        return questionData;
      } catch (error) {
        lastError = error;
        // If it's a 404/model not found error, try next model
        if (error.message && (error.message.includes('404') || error.message.includes('not found'))) {
          console.warn(`Model ${modelName} not available, trying next model...`);
          continue; // Try next model
        }
        // For other errors, break and throw
        break;
      }
    }

    // If we get here, all models failed
    console.error('Error generating next question:', lastError);
    const error = lastError || new Error('Unknown error');
    throw new Error(`Failed to generate question: ${error.message || error.toString()}`);
  }

  async processAudio(sessionId, mediaData, questionId, questionText, imageFrames = [], isVideo = false, timestamps = null) {
    if (!this.genAI) {
      throw new Error('Gemini API not configured. Please set GEMINI_API_KEY environment variable.');
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Invalid session ID');
    }

    try {
      const modelName = session.model || this.defaultModel;
      
      // Validate model name
      if (!this.isValidModel(modelName)) {
        console.warn(`Model ${modelName} not in pricing list, using default ${this.defaultModel}`);
      }
      
      // Configure generation settings for better transcription accuracy
      // Lower temperature for more accurate, deterministic transcription
      const generationConfig = {
        temperature: 0.1, // Lower temperature for more accurate transcription
        topP: 0.95,
        topK: 40,
      };
      
      // Create model with generation config optimized for transcription
      const model = this.genAI.getGenerativeModel({ 
        model: modelName,
        generationConfig: generationConfig
      });
      
      // Get previous answers for context
      const previousAnswers = session.answeredQuestions || [];
      
      // Prepare the prompt for analysis with video/audio data
      const prompt = this.buildAnalysisPrompt(
        questionId, 
        questionText,
        imageFrames, 
        mediaData, 
        session.interviewData.passPercentage,
        session.interviewData,
        previousAnswers,
        isVideo,
        timestamps
      );
      
      // Use the actual video/audio data for analysis
      const parts = [
        { text: prompt }
      ];

      // Add video or audio data if provided
      if (mediaData) {
        // Determine mime type: if isVideo flag is set or we detect it's likely video, use video/webm
        // Otherwise fall back to audio/webm
        const mimeType = isVideo ? "video/webm" : "audio/webm";
        
        parts.push({
          inlineData: {
            mimeType: mimeType,
            data: mediaData
          }
        });
      }

      // Add image frames if provided
      if (imageFrames && imageFrames.length > 0) {
        imageFrames.forEach(frame => {
          parts.push({
            inlineData: {
              mimeType: "image/jpeg",
              data: frame
            }
          });
        });
      }

      // Generate content with optimized settings for transcription
      const result = await model.generateContent(parts);
      
      // Get response first to ensure we have it
      const response = await result.response;
      const text = response.text();
      
      // Extract actual token usage from API response (after getting response)
      const tokenUsage = this.extractTokenUsage(result);

      // Parse the response and validate against our schema
      const analysisResult = this.parseGeminiResponse(text, questionId);
      
      // Use actual token usage from API instead of parsed (which may be 0)
      analysisResult.token_usage = tokenUsage;
      
      // Store the answer in session
      session.answeredQuestions.push({
        questionId,
        questionText,
        transcript: analysisResult.transcript,
        evaluation: analysisResult.evaluation,
        cheating: analysisResult.cheating
      });
      
      // Update session token usage with actual values
      session.totalTokens.input += tokenUsage.input_tokens;
      session.totalTokens.output += tokenUsage.output_tokens;
      
      // Calculate and add cost
      const cost = this.calculateCost(tokenUsage.input_tokens, tokenUsage.output_tokens, session.model);
      session.totalCost += cost;

      return analysisResult;
    } catch (error) {
      console.error('Gemini processing error:', error);
      throw new Error(`Failed to process audio with Gemini: ${error.message}`);
    }
  }

  buildQuestionGenerationPrompt(interview, previousAnswer, isFirst) {
    // Build skills list with topics included
    const skillsList = interview.expectedSkills.map(s => {
      const topicsStr = s.topics && s.topics.length > 0 
        ? `\n  Topics: ${s.topics.join(', ')}` 
        : '';
      return `- ${s.skill} (weight: ${s.weight}%)${topicsStr}`;
    }).join('\n');
    const experienceLevel = interview.experienceRange;
    const mandatoryQuestions = interview.mandatoryQuestions || [];
    const optionalQuestions = interview.optionalQuestions || [];
    
    // Calculate skill coverage from mandatory questions
    const mandatorySkillCoverage = {};
    mandatoryQuestions.forEach(q => {
      const questionText = typeof q === 'string' ? q : q.text;
      const questionSkills = typeof q === 'string' ? [] : (q.skills || []);
      questionSkills.forEach(skill => {
        if (!mandatorySkillCoverage[skill]) {
          mandatorySkillCoverage[skill] = [];
        }
        mandatorySkillCoverage[skill].push(questionText);
      });
    });
    
    // Calculate skill coverage from already asked questions
    const askedSkillCoverage = {};
    if (!isFirst && previousAnswer) {
      // Get skills from the previous question
      const previousSkills = previousAnswer.skillsTargeted || previousAnswer.skillsAssessed || [];
      if (Array.isArray(previousSkills)) {
        previousSkills.forEach(skill => {
          askedSkillCoverage[skill] = (askedSkillCoverage[skill] || 0) + 1;
        });
      }
      
      // Also get skills from all interview questions if available
      const interviewQuestions = previousAnswer.interviewQuestions || [];
      interviewQuestions.forEach(q => {
        const qSkills = q.skillsTargeted || [];
        if (Array.isArray(qSkills)) {
          qSkills.forEach(skill => {
            askedSkillCoverage[skill] = (askedSkillCoverage[skill] || 0) + 1;
          });
        }
      });
    }
    
    // Build mandatory questions info with skills
    let mandatoryQuestionsInfo = '';
    if (mandatoryQuestions.length > 0) {
      mandatoryQuestionsInfo = `\nMANDATORY QUESTIONS POOL (${mandatoryQuestions.length} questions):
These questions will be asked to candidates based on weightage settings. You should generate questions that complement these, focusing on skills that may not be fully covered.
${Object.keys(mandatorySkillCoverage).length > 0 ? `
Skills covered by mandatory questions:
${Object.entries(mandatorySkillCoverage).map(([skill, questions]) => 
  `- ${skill}: ${questions.length} question(s)`
).join('\n')}
` : ''}
`;
    }
    
    // Build optional questions info with skills
    let optionalQuestionsInfo = '';
    if (optionalQuestions.length > 0) {
      const optionalSkillMap = {};
      optionalQuestions.forEach(q => {
        const questionText = typeof q === 'string' ? q : q.text;
        const questionSkills = typeof q === 'string' ? [] : (q.skills || []);
        questionSkills.forEach(skill => {
          if (!optionalSkillMap[skill]) {
            optionalSkillMap[skill] = [];
          }
          optionalSkillMap[skill].push(questionText);
        });
      });
      
      optionalQuestionsInfo = `\nSAMPLE QUESTIONS FOR REFERENCE (generate similar style questions):
${optionalQuestions.slice(0, 10).map((q, idx) => {
  const questionText = typeof q === 'string' ? q : q.text;
  const questionSkills = typeof q === 'string' ? [] : (q.skills || []);
  const skillsStr = questionSkills.length > 0 ? ` [Skills: ${questionSkills.join(', ')}]` : '';
  return `${idx + 1}. ${questionText}${skillsStr}`;
}).join('\n')}
${optionalQuestions.length > 10 ? `\n... and ${optionalQuestions.length - 10} more sample questions` : ''}
${Object.keys(optionalSkillMap).length > 0 ? `
Skills in sample questions (use as reference for style and focus):
${Object.entries(optionalSkillMap).map(([skill, questions]) => 
  `- ${skill}: ${questions.length} sample question(s)`
).join('\n')}
` : ''}
`;
    }
    
    // Determine which skills need more coverage
    const skillWeights = {};
    interview.expectedSkills.forEach(s => {
      skillWeights[s.skill] = s.weight || 0;
    });
    
    // Calculate priority skills (high weight, low coverage)
    const prioritySkills = Object.entries(skillWeights)
      .map(([skill, weight]) => {
        const mandatoryCount = mandatorySkillCoverage[skill]?.length || 0;
        const askedCount = askedSkillCoverage[skill] || 0;
        const totalCoverage = mandatoryCount + askedCount;
        // Higher weight + lower coverage = higher priority
        const priority = weight * (1 / (1 + totalCoverage));
        return { skill, weight, priority, coverage: totalCoverage };
      })
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 3)
      .map(s => s.skill);
    
    let prompt = `You are an expert technical interviewer conducting a ${experienceLevel}-level interview.

INTERVIEW CONTEXT:
- Job Title/Description: ${interview.title}
- Description: ${interview.description}
- Experience Level: ${experienceLevel}
- Expected Skills (with weights):
${skillsList}
- Maximum Questions: ${interview.maxQuestions}
- Interview Duration: ${interview.duration} minutes
- Pass Percentage: ${interview.passPercentage}%
${mandatoryQuestionsInfo}${optionalQuestionsInfo}
${prioritySkills.length > 0 && !isFirst ? `
PRIORITY SKILLS TO FOCUS ON (high weight, low coverage):
${prioritySkills.map((skill, idx) => `${idx + 1}. ${skill} (weight: ${skillWeights[skill]}%, coverage: ${(mandatorySkillCoverage[skill]?.length || 0) + (askedSkillCoverage[skill] || 0)} question(s))`).join('\n')}
` : ''}

${isFirst ? `
TASK: Generate the FIRST interview question.

GUIDELINES:
1. Create a relevant, real-world technical question appropriate for ${experienceLevel} level
2. The question should assess the most important skills (highest weight) first
3. When topics are specified for a skill, focus your question on those specific topics/sub-topics
4. Keep questions concise (1-2 sentences max) - avoid lengthy or irrelevant questions
5. Focus on practical, scenario-based questions that reveal problem-solving ability
6. Make it conversational and natural, like a real interview
${optionalQuestions.length > 0 ? `7. If sample questions are provided, generate questions in a similar style and format, matching the skills they target` : ''}
${prioritySkills.length > 0 ? `8. Prioritize skills that have high weightage but low coverage: ${prioritySkills.join(', ')}` : ''}
${Object.keys(mandatorySkillCoverage).length > 0 ? `9. Complement mandatory questions - focus on skills that aren't fully covered by mandatory questions` : ''}

EXAMPLE GOOD QUESTIONS:
- "Walk me through how you would design a scalable authentication system."
- "How would you optimize a slow database query in production?"
- "Describe a challenging bug you've fixed and your debugging process."

EXAMPLE BAD QUESTIONS (TOO LONG/IRRELEVANT):
- "Please provide a comprehensive explanation of all the technologies, frameworks, and methodologies you have ever used in your entire career, including detailed explanations of each one, their pros and cons, and specific use cases..."
` : `
TASK: Generate the NEXT interview question based on the candidate's previous answer.

PREVIOUS QUESTION: ${previousAnswer.questionText}
CANDIDATE'S RESPONSE: ${previousAnswer.transcript || 'No transcript available'}
RESPONSE ANALYSIS: ${previousAnswer.evaluation?.comment || 'Not analyzed yet'}
CURRENT SKILLS ASSESSED: ${previousAnswer.skillsAssessed || 'Unknown'}

GUIDELINES:
1. Based on the candidate's answer, ask a follow-up or move to the next skill area
2. If the answer was strong, probe deeper or move to a different skill
3. If the answer was weak, ask a clarifying question or test a related concept
4. When topics are specified for a skill, focus your question on those specific topics/sub-topics
5. Keep questions concise (1-2 sentences max) - avoid lengthy questions
6. Ensure questions are relevant and practical
7. Don't repeat the same skill area if already well-assessed
8. Cover remaining skills based on their weights - prioritize high-weight skills with low coverage
${optionalQuestions.length > 0 ? `9. If sample questions are provided, generate questions in a similar style and format, matching the skills they target` : ''}
${prioritySkills.length > 0 ? `10. Focus on priority skills that need more coverage: ${prioritySkills.join(', ')}` : ''}
${Object.keys(mandatorySkillCoverage).length > 0 ? `11. Complement mandatory questions - ensure good coverage of all skills, especially those not fully covered by mandatory questions` : ''}

QUESTIONS ASKED SO FAR: ${previousAnswer.questionsAsked || 1}
MAX QUESTIONS: ${interview.maxQuestions}
${mandatoryQuestions.length > 0 ? `NOTE: Some questions may be selected from the mandatory questions pool based on weightage settings. Your generated questions should complement these.` : ''}
${Object.keys(askedSkillCoverage).length > 0 ? `
SKILLS ALREADY COVERED IN THIS INTERVIEW:
${Object.entries(askedSkillCoverage).map(([skill, count]) => `- ${skill}: ${count} question(s)`).join('\n')}
` : ''}
`}

REQUIRED JSON RESPONSE FORMAT:
{
  "question_id": "q_${Date.now()}",
  "question_text": "Your concise, relevant question here",
  "type": "${isFirst ? 'dynamic' : 'dynamic'}",
  "order": ${isFirst ? 1 : (previousAnswer?.order || 0) + 1},
  "skills_targeted": ["skill1", "skill2"],
  "expected_level": "${experienceLevel}",
  "token_usage": {
    "input_tokens": 0,
    "output_tokens": 0
  }
}

IMPORTANT: 
- Return ONLY valid JSON, no markdown formatting
- Keep question_text brief and practical
- Target skills that haven't been well-assessed yet
- When topics are provided for a skill, ensure your question addresses those specific topics
- Questions should feel natural and conversational
`;

    return prompt;
  }

  buildAnalysisPrompt(questionId, questionText, imageFrames, mediaData, passPercentage, interviewContext, previousAnswers = [], isVideo = false, timestamps = null) {
    // Build skills list with topics included for better context
    const skillsList = interviewContext.expectedSkills.map(s => {
      const topicsStr = s.topics && s.topics.length > 0 
        ? ` (topics: ${s.topics.join(', ')})` 
        : '';
      return `${s.skill} (${s.weight}%)${topicsStr}`;
    }).join(', ');
    
    let previousContext = '';
    if (previousAnswers.length > 0) {
      previousContext = '\nPREVIOUS ANSWERS:\n';
      previousAnswers.forEach((ans, idx) => {
        previousContext += `${idx + 1}. Q: ${ans.questionText}\n   A: ${ans.transcript || 'N/A'}\n   Score: ${ans.evaluation?.overall_score || 'N/A'}\n`;
      });
    }

    return `You are an expert technical interviewer evaluating a candidate's response.

INTERVIEW CONTEXT:
- Experience Level: ${interviewContext.experienceRange}
- Expected Skills with Topics: ${skillsList}
- Pass Threshold: ${passPercentage}%
${previousContext}

CURRENT QUESTION: ${questionText}

TASK: Analyze the candidate's response and provide comprehensive evaluation.

You will receive:
1. ${isVideo ? 'Full video recording' : 'Audio recording'} of the candidate's response
2. Multiple image frames captured throughout the response for comprehensive cheating detection

CRITICAL TRANSCRIPTION REQUIREMENTS:
- The candidate may have an Indian accent - be aware of common Indian English pronunciation patterns
- Pay EXTREME attention to technical terms and programming/IT vocabulary
- Common technical terms that may be mispronounced: "API", "SQL", "JSON", "REST", "HTTP", "HTTPS", "DOM", "CSS", "HTML", "JavaScript", "TypeScript", "React", "Node.js", "Python", "Java", "database", "algorithm", "asynchronous", "callback", "promise", "async/await", "framework", "library", "dependency", "package", "module", "component", "function", "variable", "array", "object", "class", "interface", "inheritance", "polymorphism", "encapsulation", "abstraction", "authentication", "authorization", "encryption", "decryption", "hash", "token", "session", "cookie", "cache", "optimization", "performance", "scalability", "microservices", "container", "Docker", "Kubernetes", "CI/CD", "Git", "GitHub", "deployment", "server", "client", "frontend", "backend", "fullstack", "MVC", "MVP", "RESTful", "GraphQL", "WebSocket", "middleware", "routing", "endpoint", "query", "mutation", "subscription", "schema", "validation", "error handling", "exception", "try-catch", "logging", "debugging", "testing", "unit test", "integration test", "regression", "refactoring", "code review", "pull request", "merge", "branch", "commit", "repository"
- Listen carefully for technical acronyms and abbreviations
- If unsure about a technical term, use context clues from the question and interview skills to determine the most likely term
- Preserve the candidate's exact phrasing and sentence structure when transcribing
- Do NOT correct grammar or pronunciation in the transcript - transcribe exactly as spoken
- For Indian accents, be aware of: "th" sounds (may sound like "d" or "t"), "v" and "w" distinctions, "r" pronunciation, and stress patterns

EVALUATION CRITERIA:
1. Relevance (0-100): How directly and completely does the answer address the question?
   - 90-100: Directly addresses all aspects, shows deep understanding
   - 70-89: Addresses most aspects, shows good understanding
   - 50-69: Partially addresses, shows basic understanding
   - 0-49: Misses key aspects, shows poor understanding

2. Technical Accuracy (0-100): How technically correct and accurate is the response?
   - Consider correctness of concepts, terminology, and reasoning
   
3. Fluency (0-100): How clear, articulate, and well-structured is the communication?
   - Consider clarity, organization, use of examples, confidence

4. Overall Score (0-100): Weighted combination considering:
   - Relevance: 40%
   - Technical Accuracy: 40%
   - Fluency: 20%
   
5. Score Label:
   - "pass": overall_score >= ${passPercentage}
   - "weak": overall_score >= ${passPercentage * 0.7} but < ${passPercentage}
   - "fail": overall_score < ${passPercentage * 0.7}

6. Cheating Detection (0-1):
   - CRITICAL: The video includes the ENTIRE period from when the question started being spoken until the candidate finished answering.
   - This is a natural conversational interview flow where:
     * Question period: When the interviewer (AI bot) was speaking the question
     * Gap period: The time between when the question finished and when the candidate naturally started speaking (THIS IS CRITICAL FOR CHEATING DETECTION)
     * Answer period: When the candidate was actively speaking and answering
   - IMPORTANT: This is a conversational interview - recording starts automatically when the question begins, and the candidate responds naturally without any buttons or manual triggers.
   - Pay SPECIAL ATTENTION to the gap period (between question end and when candidate starts speaking) as this is when candidates are most likely to cheat:
     * Looking at phones, other devices, or external sources
     * Consulting with other people
     * Reading from notes or screens
     * Any suspicious behavior during this gap
   - Also monitor for suspicious behavior during natural pauses in the candidate's answer (5+ second pauses where they might be consulting external sources)
   - Analyze ALL visual frames throughout the ENTIRE video for comprehensive detection:
     * Multiple faces or people in frame
     * Absence of candidate's face
     * Looking away from screen frequently or for extended periods
     * Reading from external sources (papers, phones, second screen)
     * Suspicious eye movements or patterns
     * Inconsistent behavior across frames
     * Any other suspicious activities
   - Consider patterns across multiple frames, not just individual frames
   - Flag any suspicious behavior during the gap period as HIGH PRIORITY
   - 0.0-0.3: Normal behavior, candidate appears engaged throughout
   - 0.4-0.6: Some concerns, occasional suspicious behavior (especially during gap period or long pauses)
   - 0.7-1.0: Strong indicators of cheating, consistent suspicious patterns (especially during gap period or long pauses)
${timestamps ? `\nTIMESTAMP INFORMATION (for reference):
   - Question started at: ${new Date(timestamps.questionStartTime).toISOString()}
   - Question ended at: ${new Date(timestamps.questionEndTime).toISOString()}
   - Answer started at: ${new Date(timestamps.answerStartTime).toISOString()}
   - Answer ended at: ${new Date(timestamps.answerEndTime).toISOString()}
   - Gap duration: ${((timestamps.answerStartTime - timestamps.questionEndTime) / 1000).toFixed(1)} seconds
   - Pay special attention to the ${((timestamps.answerStartTime - timestamps.questionEndTime) / 1000).toFixed(1)} second gap period for cheating detection` : ''}

7. Next Action Decision:
   - "ask_followup": If the answer needs clarification or deeper exploration (provide next_text as follow-up)
   - "next_question": If answer is sufficient and we should move to next skill/question
   - "end_interview": If we've covered all skills or reached max questions

REQUIRED JSON RESPONSE FORMAT:
{
  "question_id": "${questionId}",
  "transcript": "Accurate transcript of the audio response",
  "evaluation": {
    "relevance": 85,
    "technical_accuracy": 80,
    "fluency": 75,
    "overall_score": 82,
    "score_label": "pass",
    "comment": "Detailed, specific feedback on strengths and weaknesses. Be constructive and specific."
  },
  "cheating": {
    "cheat_score": 0.15,
    "cheat_flags": [],
    "summary": "Brief analysis of visual behavior"
  },
  "token_usage": {
    "input_tokens": 0,
    "output_tokens": 0
  },
  "next_action": "next_question",
  "next_text": "Only if next_action is 'ask_followup', provide a concise follow-up question (1-2 sentences max)"
}

IMPORTANT TRANSCRIPTION GUIDELINES:
- Return ONLY valid JSON, no markdown formatting
- Transcript must be accurate and complete - transcribe directly from ${isVideo ? 'the video audio' : 'the audio'}, do NOT rely on any external transcripts
- CRITICAL: The candidate likely has an Indian accent - adapt your transcription accordingly
- For technical terms, prioritize accuracy over perfect spelling - use context from the question and interview skills to identify the correct technical term
- Common mispronunciations to watch for with Indian accents:
  * "API" might sound like "A-P-I" or "appy"
  * "SQL" might sound like "sequel" or "S-Q-L"
  * "JSON" might sound like "jason" or "J-S-O-N"
  * "HTTP" might sound like "H-T-T-P" or "http"
  * Technical words ending in "-tion" may have different stress patterns
  * "th" sounds may be pronounced as "d" or "t" (e.g., "the" as "de", "that" as "dat")
- When in doubt about a technical term, use the interview context (question text, expected skills) to determine the most appropriate term
- Preserve the candidate's natural speech patterns and sentence structure
- Do NOT correct grammar or "improve" the transcript - transcribe verbatim
- Analyze ALL provided image frames for cheating detection, not just one
- Comments should be specific and actionable
- Keep next_text concise if provided
- Ensure all scores are within valid ranges
`;
  }

  parseQuestionResponse(text) {
    try {
      // Extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate required fields
      const requiredFields = ['question_id', 'question_text', 'type', 'order'];
      for (const field of requiredFields) {
        if (!parsed[field]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      // Ensure question_text is not too long
      if (parsed.question_text && parsed.question_text.length > 500) {
        parsed.question_text = parsed.question_text.substring(0, 500).trim();
      }

      return {
        id: parsed.question_id,
        text: parsed.question_text,
        type: parsed.type || 'dynamic',
        order: parsed.order || 1,
        skillsTargeted: parsed.skills_targeted || [],
        token_usage: parsed.token_usage || { input_tokens: 0, output_tokens: 0 }
      };
    } catch (error) {
      console.error('Error parsing question response:', error);
      throw new Error(`Failed to parse question response: ${error.message}`);
    }
  }

  parseGeminiResponse(text, questionId) {
    try {
      // Extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate required fields
      const requiredFields = ['question_id', 'transcript', 'evaluation', 'cheating', 'token_usage', 'next_action'];
      for (const field of requiredFields) {
        if (!parsed[field]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      // Validate evaluation scores
      const evaluation = parsed.evaluation;
      
      // Handle relevance (0-100)
      if (evaluation.relevance !== undefined) {
        if (evaluation.relevance < 0 || evaluation.relevance > 100) {
          evaluation.relevance = Math.max(0, Math.min(100, evaluation.relevance));
        }
      } else {
        evaluation.relevance = 50; // Default
      }

      // Handle technical_accuracy (new field, 0-100) - map to relevance if not present
      if (evaluation.technical_accuracy !== undefined) {
        if (evaluation.technical_accuracy < 0 || evaluation.technical_accuracy > 100) {
          evaluation.technical_accuracy = Math.max(0, Math.min(100, evaluation.technical_accuracy));
        }
      }

      // Handle fluency (0-100)
      if (evaluation.fluency !== undefined) {
        if (evaluation.fluency < 0 || evaluation.fluency > 100) {
          evaluation.fluency = Math.max(0, Math.min(100, evaluation.fluency));
        }
      } else {
        evaluation.fluency = 50; // Default
      }

      // Calculate overall_score if not provided
      if (!evaluation.overall_score && evaluation.relevance !== undefined && evaluation.fluency !== undefined) {
        const techAccuracy = evaluation.technical_accuracy || evaluation.relevance;
        evaluation.overall_score = Math.round(
          (evaluation.relevance * 0.4) + 
          (techAccuracy * 0.4) + 
          (evaluation.fluency * 0.2)
        );
      }
      
      if (evaluation.overall_score < 0 || evaluation.overall_score > 100) {
        evaluation.overall_score = Math.max(0, Math.min(100, evaluation.overall_score));
      }

      // Validate score_label
      if (!evaluation.score_label || !['pass', 'weak', 'fail'].includes(evaluation.score_label)) {
        evaluation.score_label = 'fail';
      }

      // Validate cheat score
      if (parsed.cheating.cheat_score < 0 || parsed.cheating.cheat_score > 1) {
        parsed.cheating.cheat_score = Math.max(0, Math.min(1, parsed.cheating.cheat_score));
      }

      // Ensure next_action is valid
      if (!['ask_followup', 'next_question', 'end_interview'].includes(parsed.next_action)) {
        parsed.next_action = 'next_question';
      }

      return parsed;
    } catch (error) {
      console.error('Error parsing Gemini response:', error);
      throw new Error(`Failed to parse Gemini response: ${error.message}`);
    }
  }


  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  /**
   * Get session summary with token usage and cost
   * @param {string} sessionId - Session ID
   * @returns {Object} Session summary with token usage and cost
   */
  getSessionSummary(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    return {
      sessionId: session.id,
      interviewId: session.interviewId,
      model: session.model,
      totalTokens: {
        input: session.totalTokens.input,
        output: session.totalTokens.output,
        total: session.totalTokens.input + session.totalTokens.output
      },
      totalCost: session.totalCost,
      startTime: session.startTime,
      endTime: session.endTime || new Date()
    };
  }

  async generateOverallRecommendation(interview) {
    if (!this.genAI) {
      throw new Error('Gemini API not configured');
    }

    try {
      const answeredQuestions = interview.questions.filter(q => q.answeredAt && q.evaluation);
      
      // Minimum 3 questions required for a reliable recommendation
      const MIN_QUESTIONS_FOR_RECOMMENDATION = 3;
      
      if (answeredQuestions.length === 0) {
        // Return null fitStatus to indicate no recommendation can be generated
        throw new Error('No answered questions found. Cannot generate recommendation.');
      }
      
      if (answeredQuestions.length < MIN_QUESTIONS_FOR_RECOMMENDATION) {
        // Return null fitStatus to indicate insufficient data
        throw new Error(`Insufficient data: Only ${answeredQuestions.length} question(s) answered. At least ${MIN_QUESTIONS_FOR_RECOMMENDATION} questions are required for a reliable recommendation.`);
      }

      // Build comprehensive interview summary
      const skillsList = interview.expectedSkills.map(s => {
        const topicsStr = s.topics && s.topics.length > 0 
          ? ` (topics: ${s.topics.join(', ')})` 
          : '';
        return `- ${s.skill} (weight: ${s.weight}%)${topicsStr}`;
      }).join('\n');

      // Build question-by-question summary
      const questionsSummary = answeredQuestions.map((q, idx) => {
        const skillsStr = q.skillsTargeted && q.skillsTargeted.length > 0 
          ? ` [Skills: ${q.skillsTargeted.join(', ')}]` 
          : '';
        return `${idx + 1}. Q: ${q.text}${skillsStr}
   Answer: ${q.transcript || 'No transcript'}
   Scores: Relevance=${q.evaluation?.relevance || 0}%, Technical=${q.evaluation?.technical_accuracy || 0}%, Fluency=${q.evaluation?.fluency || 0}%, Overall=${q.evaluation?.overall_score || 0}%
   Comment: ${q.evaluation?.comment || 'No comment'}
   Cheat Risk: ${((q.cheating?.cheat_score || 0) * 100).toFixed(1)}%`;
      }).join('\n\n');

      const aggregateScores = interview.aggregateScores || {};
      const passPercentage = interview.passPercentage || 70;

      const prompt = `You are an expert technical recruiter providing a comprehensive hiring recommendation for a candidate.

INTERVIEW CONTEXT:
- Job Title: ${interview.title}
- Job Description: ${interview.description}
- Experience Level Required: ${interview.experienceRange}
- Expected Skills (with weights and topics):
${skillsList}
- Pass Threshold: ${passPercentage}%

CANDIDATE PERFORMANCE SUMMARY:
- Overall Score: ${aggregateScores.overallScore || 0}/100
- Average Relevance: ${aggregateScores.averageRelevance || 0}/100
- Average Technical Accuracy: ${aggregateScores.averageTechnicalAccuracy || 0}/100
- Average Fluency: ${aggregateScores.averageFluency || 0}/100
- Overall Cheat Risk: ${((aggregateScores.overallCheatRisk || 0) * 100).toFixed(1)}%
- Total Questions Answered: ${answeredQuestions.length}
- Total Questions Asked: ${interview.questions.length}

DETAILED QUESTION-BY-QUESTION ANALYSIS:
${questionsSummary}

TASK: Provide a comprehensive hiring recommendation based on the candidate's performance.

EVALUATION CRITERIA:
1. Overall Fit Status:
   - "good_fit": Overall score >= ${passPercentage}%, strong technical accuracy, low cheat risk, demonstrates required skills
   - "moderate_fit": Overall score >= ${passPercentage * 0.7}% but < ${passPercentage}%, shows potential but needs improvement, acceptable cheat risk
   - "not_fit": Overall score < ${passPercentage * 0.7}%, weak technical performance, high cheat risk, missing key skills

2. Consider:
   - Technical competency across all required skills
   - Consistency of performance
   - Communication and fluency
   - Cheating indicators (high risk is a red flag)
   - Alignment with experience level required
   - Areas of strength and weakness

REQUIRED JSON RESPONSE FORMAT:
{
  "fitStatus": "good_fit" | "moderate_fit" | "not_fit",
  "recommendationSummary": "A comprehensive 2-3 paragraph summary explaining the overall assessment, key strengths, concerns, and hiring recommendation. Be specific and actionable.",
  "strengths": [
    "Specific strength 1 (e.g., 'Strong understanding of OOPs concepts')",
    "Specific strength 2",
    "Specific strength 3"
  ],
  "weaknesses": [
    "Specific weakness 1 (e.g., 'Struggled with database optimization questions')",
    "Specific weakness 2",
    "Specific weakness 3"
  ]
}

IMPORTANT:
- Return ONLY valid JSON, no markdown formatting
- Be specific and reference actual performance data
- Provide actionable insights for the recruiter
- Consider all factors: scores, skills coverage, cheating risk, consistency
- Recommendation should be clear and decisive`;

      const modelName = this.defaultModel;
      const model = this.genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      
      const response = await result.response;
      const text = response.text();
      
      // Extract token usage
      const tokenUsage = this.extractTokenUsage(result);
      
      // Parse the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in recommendation response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate required fields
      if (!parsed.fitStatus || !['good_fit', 'moderate_fit', 'not_fit'].includes(parsed.fitStatus)) {
        throw new Error('Invalid fitStatus in recommendation response');
      }
      if (!parsed.recommendationSummary) {
        throw new Error('Missing recommendationSummary in response');
      }
      if (!Array.isArray(parsed.strengths)) {
        parsed.strengths = [];
      }
      if (!Array.isArray(parsed.weaknesses)) {
        parsed.weaknesses = [];
      }

      return {
        ...parsed,
        token_usage: tokenUsage
      };
    } catch (error) {
      console.error('Error generating overall recommendation:', error);
      throw new Error(`Failed to generate recommendation: ${error.message}`);
    }
  }

  /**
   * Process transcript chunk for fast follow-up question generation
   * Uses lightweight model (gemini-1.5-flash) for quick response
   * @param {string} sessionId - Session ID
   * @param {string} transcriptChunk - Transcript chunk from candidate
   * @param {string} questionId - Current question ID
   * @param {string} questionText - Current question text
   * @returns {Promise<Object>} Analysis result with potential follow-up
   */
  async processTranscriptChunk(sessionId, transcriptChunk, questionId, questionText) {
    if (!this.genAI) {
      throw new Error('Gemini API not configured');
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Invalid session ID');
    }

    try {
      // Use lightweight model for fast processing
      const fastModel = 'gemini-1.5-flash';
      const model = this.genAI.getGenerativeModel({ 
        model: fastModel,
        generationConfig: {
          temperature: 0.3, // Lower temperature for more focused responses
          topP: 0.95,
          topK: 40
        }
      });

      const interview = session.interviewData;
      const previousAnswers = session.answeredQuestions || [];

      // Build context from previous answers
      let previousContext = '';
      if (previousAnswers.length > 0) {
        previousContext = '\nPREVIOUS ANSWERS:\n';
        previousAnswers.slice(-3).forEach((ans, idx) => {
          previousContext += `${idx + 1}. Q: ${ans.questionText}\n   A: ${ans.transcript || 'N/A'}\n`;
        });
      }

      const prompt = `You are an AI interviewer conducting a technical interview.

INTERVIEW CONTEXT:
- Job Title: ${interview.title}
- Experience Level: ${interview.experienceRange}
- Current Question: "${questionText}"
${previousContext}

CANDIDATE'S RESPONSE (partial transcript): "${transcriptChunk}"

TASK: Analyze this transcript chunk and determine:
1. Is the candidate providing a meaningful answer? (not just "um", "uh", etc.)
2. Should we ask a follow-up question based on what they've said so far?
3. What would be an appropriate follow-up question?

GUIDELINES:
- Only suggest follow-ups if the candidate has provided substantial content (not just filler words)
- Follow-ups should probe deeper or clarify specific points
- Keep follow-up questions concise (1-2 sentences max)
- If transcript is too short or unclear, indicate we should wait for more

Return JSON:
{
  "has_substantial_content": boolean,
  "should_ask_followup": boolean,
  "followup_question": "string or null",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Extract token usage
      const tokenUsage = this.extractTokenUsage(result);

      // Parse response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in transcript chunk response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Update session token usage
      session.totalTokens.input += tokenUsage.input_tokens;
      session.totalTokens.output += tokenUsage.output_tokens;
      const cost = this.calculateCost(tokenUsage.input_tokens, tokenUsage.output_tokens, fastModel);
      session.totalCost += cost;

      return {
        ...parsed,
        token_usage: tokenUsage,
        model: fastModel
      };
    } catch (error) {
      console.error('Error processing transcript chunk:', error);
      throw new Error(`Failed to process transcript chunk: ${error.message}`);
    }
  }

  /**
   * Generate real-time acknowledgment for candidate's response
   * Phase 2: Quick acknowledgments for natural conversation flow
   * @param {string} sessionId - Session ID
   * @param {string} transcriptChunk - Recent transcript chunk
   * @param {string} questionId - Current question ID
   * @returns {Promise<Object>} Acknowledgment result
   */
  async generateRealTimeAcknowledgment(sessionId, transcriptChunk, questionId) {
    if (!this.genAI) {
      return null; // Don't throw, just return null if not configured
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    try {
      // Use very fast model for quick acknowledgments
      const fastModel = 'gemini-1.5-flash';
      const model = this.genAI.getGenerativeModel({ 
        model: fastModel,
        generationConfig: {
          temperature: 0.5, // Slightly higher for more natural responses
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 50 // Keep acknowledgments short
        }
      });

      const prompt = `You are an AI interviewer. The candidate just said: "${transcriptChunk}"

Generate a brief, natural acknowledgment (1-5 words max). Examples:
- "I see"
- "Interesting"
- "Go on"
- "That makes sense"
- "Tell me more"

Only respond if the candidate has provided substantial content (not just "um", "uh"). If transcript is too short or unclear, return null.

Return JSON:
{
  "should_acknowledge": boolean,
  "acknowledgment": "string or null",
  "confidence": 0.0-1.0
}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Extract token usage
      const tokenUsage = this.extractTokenUsage(result);

      // Parse response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Update session token usage
      session.totalTokens.input += tokenUsage.input_tokens;
      session.totalTokens.output += tokenUsage.output_tokens;
      const cost = this.calculateCost(tokenUsage.input_tokens, tokenUsage.output_tokens, fastModel);
      session.totalCost += cost;

      return {
        ...parsed,
        token_usage: tokenUsage,
        model: fastModel
      };
    } catch (error) {
      console.error('Error generating real-time acknowledgment:', error);
      return null; // Don't throw, just return null
    }
  }

  /**
   * Detect if candidate is asking a question (for interview integrity)
   * Uses pattern-based detection first, then Gemini for accuracy
   * @param {string} transcript - Candidate's transcript
   * @param {string} currentQuestionText - Current interview question
   * @returns {Promise<Object>} Intent detection result
   */
  async detectQuestionIntent(transcript, currentQuestionText) {
    if (!this.genAI) {
      throw new Error('Gemini API not configured');
    }

    // Pattern-based detection (fast, first pass)
    const QUESTION_PATTERNS = {
      directQuestions: [
        /^(what|how|why|when|where|can you|could you|would you|tell me|explain)/i,
        /^(what is|how do|why does|when should|where can)/i,
        /^(can you tell|could you explain|would you help)/i
      ],
      answerRequests: [
        /(give me|provide|show me|tell me) (the )?(answer|solution|hint|clue)/i,
        /(what is|what's) (the )?(answer|solution|correct|right)/i,
        /(help me|assist me) (with|to|in)/i,
        /(can|could|would) (you )?(give|provide|tell|show|explain)/i
      ],
      roleReversal: [
        /(you should|you need to|you can|you could)/i,
        /(what would you do|how would you|your approach)/i,
        /(your answer|your solution|your opinion)/i
      ],
      revealingClarification: [
        /(is it|is this|does it|should it|must it) (the )?(answer|solution|correct|right|way)/i,
        /(is the answer|is the solution|does this mean)/i,
        /(confirm|verify|check) (if|that|whether) (it|this|the)/i
      ]
    };

    const isQuestion = QUESTION_PATTERNS.directQuestions.some(pattern => pattern.test(transcript));
    const isAnswerRequest = QUESTION_PATTERNS.answerRequests.some(pattern => pattern.test(transcript));
    const isRoleReversal = QUESTION_PATTERNS.roleReversal.some(pattern => pattern.test(transcript));
    const isRevealingClarification = QUESTION_PATTERNS.revealingClarification.some(pattern => pattern.test(transcript));
    const patternRequiresDeflection = isQuestion || isAnswerRequest || isRoleReversal || isRevealingClarification;

    // If pattern-based detection suggests deflection, use Gemini for confirmation and better response
    if (patternRequiresDeflection || transcript.length > 20) {
      try {
        // Use fast model for quick response
        const fastModel = 'gemini-1.5-flash';
        const model = this.genAI.getGenerativeModel({ 
          model: fastModel,
          generationConfig: {
            temperature: 0.2, // Low temperature for accurate classification
            topP: 0.95,
            topK: 40
          }
        });

        const prompt = `You are an AI interviewer. A candidate just said: "${transcript}"

Current interview question: "${currentQuestionText}"

Determine:
1. Is the candidate answering the question? (normal)
2. Is the candidate asking YOU a question? (deflect)
3. Is the candidate requesting hints/answers? (deflect)
4. Is the candidate trying to reverse roles? (deflect)
5. Is the candidate asking for legitimate clarification? (can help)

Rules:
- Legitimate clarification: Questions about wording, scope, format, constraints
- NOT legitimate: Questions that would reveal the answer or confirm approaches
- If transcript is clearly an answer, classify as "answering"

Return JSON:
{
  "intent": "answering" | "asking_question" | "requesting_answer" | "role_reversal" | "legitimate_clarification",
  "confidence": 0.0-1.0,
  "requires_deflection": boolean,
  "can_clarify": boolean,
  "suggested_bot_response": "Professional, polite deflection or clarification (1-2 sentences max)"
}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          
          // Validate intent
          const validIntents = ['answering', 'asking_question', 'requesting_answer', 'role_reversal', 'legitimate_clarification'];
          if (!validIntents.includes(parsed.intent)) {
            parsed.intent = 'answering'; // Default to safe option
          }

          return {
            ...parsed,
            detection_method: 'gemini',
            pattern_detected: patternRequiresDeflection
          };
        }
      } catch (error) {
        console.error('Error in Gemini question intent detection:', error);
        // Fallback to pattern-based
      }
    }

    // Pattern-based fallback or if no deflection needed
    let intent = 'answering';
    let requiresDeflection = false;
    let canClarify = false;
    let suggestedBotResponse = '';

    if (isAnswerRequest) {
      intent = 'requesting_answer';
      requiresDeflection = true;
      suggestedBotResponse = "I can't provide the answer, but I'd love to hear your approach. What would you do?";
    } else if (isRoleReversal) {
      intent = 'role_reversal';
      requiresDeflection = true;
      suggestedBotResponse = "I appreciate the question, but I'm here to evaluate your skills. Could you share your own approach?";
    } else if (isRevealingClarification) {
      intent = 'requesting_answer';
      requiresDeflection = true;
      suggestedBotResponse = "I can't confirm or deny specific approaches. What's your solution?";
    } else if (isQuestion) {
      intent = 'asking_question';
      requiresDeflection = true;
      suggestedBotResponse = "I appreciate your question, but I'm here to assess your knowledge. Could you share your thoughts on the question I asked?";
    }

    return {
      intent,
      confidence: patternRequiresDeflection ? 0.7 : 0.9,
      requires_deflection: requiresDeflection,
      can_clarify: canClarify,
      suggested_bot_response: suggestedBotResponse || '',
      detection_method: 'pattern',
      pattern_detected: patternRequiresDeflection
    };
  }

  /**
   * Detect candidate response intent (thinking/skip/answering)
   * Used for silence handling
   * @param {string} transcript - Candidate's transcript
   * @returns {Promise<Object>} Response intent result
   */
  async detectResponseIntent(transcript) {
    if (!this.genAI) {
      throw new Error('Gemini API not configured');
    }

    // Quick pattern-based check first
    const lowerTranscript = transcript.toLowerCase().trim();
    
    // Continue indicators (wants to keep answering)
    const continuePatterns = [
      /^(yes|yeah|yep|sure|okay|ok|continue|more|keep going|go ahead)\b/i,
      /(want|would like|will) (to )?(continue|keep going|say more|add more|elaborate)/i,
      /(still|more|another) (point|thing|thought|idea)/i,
      /(let me|i'll|i will) (continue|keep going|say more|add)/i
    ];

    // Done indicators (finished with answer)
    const donePatterns = [
      /^(no|nope|nah|that's all|that's it|done|finished|complete)\b/i,
      /(that's|that is) (all|it|everything|complete|done|finished)/i,
      /(i'm|i am) (done|finished|complete)/i,
      /(nothing|no more|no further) (to add|to say)/i,
      /(move on|next question|skip|pass)/i
    ];

    // Thinking indicators (needs more time to think)
    const thinkingPatterns = [
      /(thinking|moment|time|wait|give me)/i,
      /(need|want|let me) (more )?(time|moment)/i
    ];

    // Skip indicators (doesn't know, wants to skip)
    const skipPatterns = [
      /(don't know|dunno|not sure|unsure)/i,
      /(can't|cannot) (answer|know|think)/i
    ];

    const isContinue = continuePatterns.some(pattern => pattern.test(lowerTranscript));
    const isDone = donePatterns.some(pattern => pattern.test(lowerTranscript));
    const isThinking = thinkingPatterns.some(pattern => pattern.test(lowerTranscript));
    const isSkip = skipPatterns.some(pattern => pattern.test(lowerTranscript));

    // Priority: continue > done > thinking > skip
    if (isContinue && !isDone) {
      return {
        intent: 'continue',
        confidence: 0.9,
        detection_method: 'pattern'
      };
    }

    if (isDone) {
      return {
        intent: 'done',
        confidence: 0.9,
        detection_method: 'pattern'
      };
    }

    // If clear pattern match, return quickly
    if (isThinking && !isSkip && !isDone) {
      return {
        intent: 'thinking',
        confidence: 0.85,
        detection_method: 'pattern'
      };
    }

    if (isSkip) {
      return {
        intent: 'skip',
        confidence: 0.85,
        detection_method: 'pattern'
      };
    }

    // If transcript is substantial (likely an answer), use Gemini for confirmation
    if (transcript.length > 30) {
      try {
        const fastModel = 'gemini-1.5-flash';
        const model = this.genAI.getGenerativeModel({ 
          model: fastModel,
          generationConfig: {
            temperature: 0.2,
            topP: 0.95,
            topK: 40
          }
        });

        const prompt = `Analyze this candidate response to a check-in question ("Would you like to continue with your answer, or are you done?") and determine intent:

Transcript: "${transcript}"

Determine if the candidate is:
1. "continue" - wants to keep answering (e.g., "yes", "continue", "I want to say more", "let me add")
2. "done" - finished with their answer (e.g., "that's all", "done", "no more", "that's it")
3. "thinking" - still thinking, needs more time (e.g., "thinking", "give me a moment", "wait")
4. "skip" - doesn't know, wants to skip (e.g., "I don't know", "skip", "can't answer")
5. "answering" - has started giving a substantial answer (technical content, explanation)

Return JSON:
{
  "intent": "continue" | "done" | "thinking" | "skip" | "answering",
  "confidence": 0.0-1.0,
  "suggested_bot_response": "string (only if intent is thinking or skip)"
}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          
          // Validate intent
          const validIntents = ['continue', 'done', 'thinking', 'skip', 'answering', 'clarification'];
          if (!validIntents.includes(parsed.intent)) {
            parsed.intent = 'answering'; // Default to safe option
          }

          return {
            ...parsed,
            detection_method: 'gemini'
          };
        }
      } catch (error) {
        console.error('Error in Gemini response intent detection:', error);
      }
    }

    // Default: assume answering if substantial content
    return {
      intent: transcript.length > 20 ? 'answering' : 'thinking',
      confidence: 0.7,
      detection_method: 'heuristic'
    };
  }

  endSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.endTime = new Date();
      const summary = this.getSessionSummary(sessionId);
      this.sessions.delete(sessionId);
      return summary || session;
    }
    return null;
  }


}

// Singleton instance
const geminiService = new GeminiService();

// Export functions for use in routes
const initializeGemini = (interviewId, candidateId, interviewData) => {
  return geminiService.initializeGemini(interviewId, candidateId, interviewData);
};

const generateFirstQuestion = (sessionId) => {
  return geminiService.generateFirstQuestion(sessionId);
};

const generateNextQuestion = (sessionId, previousAnswer) => {
  return geminiService.generateNextQuestion(sessionId, previousAnswer);
};

const processGeminiAudio = (sessionId, mediaData, questionId, questionText, imageFrames, isVideo) => {
  return geminiService.processAudio(sessionId, mediaData, questionId, questionText, imageFrames, isVideo);
};

const getSessionSummary = (sessionId) => {
  return geminiService.getSessionSummary(sessionId);
};

const calculateCost = (inputTokens, outputTokens, model) => {
  return geminiService.calculateCost(inputTokens, outputTokens, model);
};

const convertToINR = (usdCost) => {
  return geminiService.convertToINR(usdCost);
};

const generateOverallRecommendation = (interview) => {
  return geminiService.generateOverallRecommendation(interview);
};

const processTranscriptChunk = (sessionId, transcriptChunk, questionId, questionText) => {
  return geminiService.processTranscriptChunk(sessionId, transcriptChunk, questionId, questionText);
};

const detectQuestionIntent = (transcript, currentQuestionText) => {
  return geminiService.detectQuestionIntent(transcript, currentQuestionText);
};

const detectResponseIntent = (transcript) => {
  return geminiService.detectResponseIntent(transcript);
};

const generateRealTimeAcknowledgment = (sessionId, transcriptChunk, questionId) => {
  return geminiService.generateRealTimeAcknowledgment(sessionId, transcriptChunk, questionId);
};

module.exports = {
  initializeGemini,
  generateFirstQuestion,
  generateNextQuestion,
  processGeminiAudio,
  getSessionSummary,
  calculateCost,
  convertToINR,
  generateOverallRecommendation,
  processTranscriptChunk,
  detectQuestionIntent,
  detectResponseIntent,
  generateRealTimeAcknowledgment,
  geminiService
};
