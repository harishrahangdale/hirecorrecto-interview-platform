const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  text: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['static', 'dynamic', 'followup'],
    required: true
  },
  order: {
    type: Number,
    required: true
  },
  skillsTargeted: [{
    type: String,
    trim: true
  }],
  videoUrl: {
    type: String
  },
  transcript: {
    type: String
  },
  evaluation: {
    relevance: {
      type: Number,
      min: 0,
      max: 100
    },
    technical_accuracy: {
      type: Number,
      min: 0,
      max: 100
    },
    fluency: {
      type: Number,
      min: 0,
      max: 100
    },
    overall_score: {
      type: Number,
      min: 0,
      max: 100
    },
    score_label: {
      type: String,
      enum: ['pass', 'weak', 'fail']
    },
    comment: {
      type: String
    }
  },
  cheating: {
    cheat_score: {
      type: Number,
      min: 0,
      max: 1
    },
    cheat_flags: [{
      type: String,
      enum: ['multi_face', 'absent_face', 'looking_away', 'suspicious_behavior']
    }],
    summary: {
      type: String
    }
  },
  token_usage: {
    input_tokens: {
      type: Number,
      default: 0
    },
    output_tokens: {
      type: Number,
      default: 0
    }
  },
  answeredAt: {
    type: Date
  },
  // Phase 1: Real-time conversation features
  conversationTurns: [{
    turnId: {
      type: String,
      required: true
    },
    speaker: {
      type: String,
      enum: ['bot', 'candidate'],
      required: true
    },
    text: {
      type: String,
      required: true
    },
    timestamp: {
      type: Number,
      required: true
    },
    audioUrl: {
      type: String
    },
    transcript: {
      type: String
    }
  }],
  interventionHistory: [{
    timestamp: {
      type: Number,
      required: true
    },
    type: {
      type: String,
      enum: ['thinking_check', 'suggest_move_on', 'force_move'],
      required: true
    },
    botMessage: {
      type: String,
      required: true
    },
    candidateResponse: {
      type: String
    },
    responseTimestamp: {
      type: Number
    }
  }],
  integrity: {
    questionAttempts: {
      type: Number,
      default: 0
    },
    deflectionHistory: [{
      timestamp: {
        type: Number,
        required: true
      },
      type: {
        type: String,
        enum: ['asking_question', 'requesting_answer', 'role_reversal', 'legitimate_clarification'],
        required: true
      },
      candidateQuestion: {
        type: String,
        required: true
      },
      botResponse: {
        type: String,
        required: true
      },
      intent: {
        detected: {
          type: String
        },
        confidence: {
          type: Number,
          min: 0,
          max: 1
        }
      }
    }],
    severity: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'low'
    },
    legitimateClarifications: {
      type: Number,
      default: 0
    }
  },
  skipped: {
    type: Boolean,
    default: false
  },
  skipReason: {
    type: String,
    enum: ['candidate_requested', 'timeout', 'max_silence', null],
    default: null
  },
  skippedAt: {
    type: Date
  }
});

const interviewSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  expectedSkills: [{
    skill: {
      type: String,
      trim: true,
      required: true
    },
    topics: [{
      type: String,
      trim: true
    }],
    weight: {
      type: Number,
      min: 0,
      max: 100,
      default: 20
    }
  }],
  experienceRange: {
    type: String,
    enum: ['entry', 'junior', 'mid', 'senior', 'lead', 'principal'],
    required: true,
    default: 'mid'
  },
  dateWindow: {
    start: {
      type: Date,
      required: true
    },
    end: {
      type: Date,
      required: true
    }
  },
  passPercentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    default: 70
  },
  duration: {
    type: Number,
    required: true,
    min: 5,
    default: 30
  },
  maxQuestions: {
    type: Number,
    required: true,
    min: 1,
    default: 5
  },
  mandatoryQuestions: [{
    text: {
      type: String,
      trim: true,
      required: true
    },
    skills: [{
      type: String,
      trim: true
    }]
  }],
  optionalQuestions: [{
    text: {
      type: String,
      trim: true,
      required: true
    },
    skills: [{
      type: String,
      trim: true
    }]
  }],
  mandatoryWeightage: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  optionalWeightage: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  questionHealth: [{
    questionId: {
      type: String,
      required: true
    },
    questionText: {
      type: String,
      required: true
    },
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    candidateEmail: {
      type: String
    },
    askedAt: {
      type: Date,
      default: Date.now
    },
    questionType: {
      type: String,
      enum: ['mandatory', 'optional', 'generated'],
      required: true
    }
  }],
  recruiterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  candidateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  candidateEmail: {
    type: String,
    lowercase: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['draft', 'invited', 'in_progress', 'completed', 'cancelled'],
    default: 'draft'
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  questions: [questionSchema],
  inviteToken: {
    type: String,
    unique: true,
    sparse: true
  },
  inviteSentAt: {
    type: Date
  },
  startedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  fullSessionVideoUrl: {
    type: String
  },
  geminiModel: {
    type: String,
    default: process.env.GEMINI_MODEL || 'gemini-2.5-pro'
  },
  totalTokenUsage: {
    input_tokens: {
      type: Number,
      default: 0
    },
    output_tokens: {
      type: Number,
      default: 0
    },
    total_tokens: {
      type: Number,
      default: 0
    }
  },
  totalCost: {
    type: Number,
    default: 0,
    min: 0
  },
  aggregateScores: {
    averageRelevance: {
      type: Number,
      min: 0,
      max: 100
    },
    averageTechnicalAccuracy: {
      type: Number,
      min: 0,
      max: 100
    },
    averageFluency: {
      type: Number,
      min: 0,
      max: 100
    },
    overallScore: {
      type: Number,
      min: 0,
      max: 100
    },
    overallCheatRisk: {
      type: Number,
      min: 0,
      max: 1
    }
  },
  aiRecommendation: {
    fitStatus: {
      type: String,
      enum: ['good_fit', 'moderate_fit', 'not_fit'],
      default: null
    },
    recommendationSummary: {
      type: String
    },
    strengths: [{
      type: String
    }],
    weaknesses: [{
      type: String
    }],
    generatedAt: {
      type: Date
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
interviewSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Calculate aggregate scores
interviewSchema.methods.calculateAggregateScores = function() {
  const answeredQuestions = this.questions.filter(q => q.evaluation && q.evaluation.overall_score !== undefined);
  
  if (answeredQuestions.length === 0) {
    return;
  }

  const totalRelevance = answeredQuestions.reduce((sum, q) => sum + (q.evaluation.relevance || 0), 0);
  const totalTechnicalAccuracy = answeredQuestions.reduce((sum, q) => sum + (q.evaluation.technical_accuracy || q.evaluation.relevance || 0), 0);
  const totalFluency = answeredQuestions.reduce((sum, q) => sum + (q.evaluation.fluency || 0), 0);
  const totalScore = answeredQuestions.reduce((sum, q) => sum + (q.evaluation.overall_score || 0), 0);
  const totalCheatScore = answeredQuestions.reduce((sum, q) => sum + (q.cheating?.cheat_score || 0), 0);

  this.aggregateScores = {
    averageRelevance: Math.round(totalRelevance / answeredQuestions.length),
    averageTechnicalAccuracy: Math.round(totalTechnicalAccuracy / answeredQuestions.length),
    averageFluency: Math.round(totalFluency / answeredQuestions.length),
    overallScore: Math.round(totalScore / answeredQuestions.length),
    overallCheatRisk: totalCheatScore / answeredQuestions.length
  };
};

// Calculate total token usage
interviewSchema.methods.calculateTokenUsage = function() {
  const totalInput = this.questions.reduce((sum, q) => sum + (q.token_usage?.input_tokens || 0), 0);
  const totalOutput = this.questions.reduce((sum, q) => sum + (q.token_usage?.output_tokens || 0), 0);
  const totalTokens = totalInput + totalOutput;
  
  this.totalTokenUsage = {
    input_tokens: totalInput,
    output_tokens: totalOutput,
    total_tokens: totalTokens
  };
};

module.exports = mongoose.model('Interview', interviewSchema);
