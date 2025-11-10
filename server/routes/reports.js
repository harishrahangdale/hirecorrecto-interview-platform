const express = require('express');
const Interview = require('../models/Interview');
const Invitation = require('../models/Invitation');
const { requireRole } = require('../middleware/auth');
const { convertToINR } = require('../services/gemini');

const router = express.Router();

// Get interview-level summary - all candidates who took this interview (Level 2)
router.get('/interviews/:id/summary', requireRole(['recruiter']), async (req, res) => {
  try {
    const interviewTemplate = await Interview.findById(req.params.id)
      .populate('recruiterId', 'firstName lastName email');

    if (!interviewTemplate) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    // Check if recruiter owns this interview
    if (interviewTemplate.recruiterId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Find all invitations for this interview
    const invitations = await Invitation.find({ interviewId: req.params.id })
      .populate('candidateId', 'firstName lastName email')
      .sort({ completedAt: -1, startedAt: -1 });

    // Find all interview attempts (interviews with candidateId/candidateEmail linked to this template)
    // We'll use invitations to find candidate attempts
    const candidateAttempts = [];
    
    for (const invitation of invitations) {
      // Find interview attempts for this candidate
      const attempts = await Interview.find({
        recruiterId: req.user._id,
        $or: [
          { candidateId: invitation.candidateId },
          { candidateEmail: invitation.candidateEmail }
        ],
        status: { $in: ['in_progress', 'completed'] }
      })
      .populate('candidateId', 'firstName lastName email')
      .sort({ completedAt: -1, startedAt: -1 });

      // Filter to find attempts that match this interview template (by title or other criteria)
      const matchingAttempts = attempts.filter(attempt => 
        attempt.title === interviewTemplate.title || 
        attempt._id.toString() === req.params.id
      );

      matchingAttempts.forEach(attempt => {
        candidateAttempts.push({
          interviewId: attempt._id,
          candidate: attempt.candidateId ? {
            id: attempt.candidateId._id,
            name: `${attempt.candidateId.firstName} ${attempt.candidateId.lastName}`,
            email: attempt.candidateId.email
          } : {
            email: attempt.candidateEmail
          },
          status: attempt.status,
          startedAt: attempt.startedAt,
          completedAt: attempt.completedAt,
          aggregateScores: attempt.aggregateScores || {},
          aiRecommendation: attempt.aiRecommendation || {},
          totalTokenUsage: attempt.totalTokenUsage || { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
          totalCost: attempt.totalCost || 0,
          totalCostINR: attempt.totalCost ? convertToINR(attempt.totalCost) : 0,
          questionsAnswered: attempt.questions.filter(q => q.answeredAt).length,
          totalQuestions: attempt.questions.length
        });
      });
    }

    // Calculate aggregate metrics across all candidates
    const completedAttempts = candidateAttempts.filter(a => a.status === 'completed');
    const aggregateMetrics = {
      totalCandidates: candidateAttempts.length,
      completedCandidates: completedAttempts.length,
      inProgressCandidates: candidateAttempts.filter(a => a.status === 'in_progress').length,
      averageOverallScore: completedAttempts.length > 0
        ? completedAttempts.reduce((sum, a) => sum + (a.aggregateScores.overallScore || 0), 0) / completedAttempts.length
        : 0,
      averageRelevance: completedAttempts.length > 0
        ? completedAttempts.reduce((sum, a) => sum + (a.aggregateScores.averageRelevance || 0), 0) / completedAttempts.length
        : 0,
      averageTechnicalAccuracy: completedAttempts.length > 0
        ? completedAttempts.reduce((sum, a) => sum + (a.aggregateScores.averageTechnicalAccuracy || 0), 0) / completedAttempts.length
        : 0,
      averageFluency: completedAttempts.length > 0
        ? completedAttempts.reduce((sum, a) => sum + (a.aggregateScores.averageFluency || 0), 0) / completedAttempts.length
        : 0,
      averageCheatRisk: completedAttempts.length > 0
        ? completedAttempts.reduce((sum, a) => sum + (a.aggregateScores.overallCheatRisk || 0), 0) / completedAttempts.length
        : 0,
      totalTokenUsage: candidateAttempts.reduce((sum, a) => ({
        input_tokens: sum.input_tokens + (a.totalTokenUsage.input_tokens || 0),
        output_tokens: sum.output_tokens + (a.totalTokenUsage.output_tokens || 0),
        total_tokens: sum.total_tokens + (a.totalTokenUsage.total_tokens || 0)
      }), { input_tokens: 0, output_tokens: 0, total_tokens: 0 }),
      totalCost: candidateAttempts.reduce((sum, a) => sum + (a.totalCost || 0), 0),
      totalCostINR: candidateAttempts.reduce((sum, a) => sum + (a.totalCostINR || 0), 0)
    };

    res.json({
      interviewTemplate: {
        id: interviewTemplate._id,
        title: interviewTemplate.title,
        description: interviewTemplate.description,
        expectedSkills: interviewTemplate.expectedSkills,
        createdAt: interviewTemplate.createdAt,
        isPublished: interviewTemplate.isPublished
      },
      aggregateMetrics,
      candidateAttempts
    });
  } catch (error) {
    console.error('Get interview summary error:', error);
    res.status(500).json({ message: 'Server error fetching interview summary' });
  }
});

// Get interview results - detailed results for one candidate attempt (Level 3)
router.get('/interviews/:id/results', requireRole(['recruiter']), async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id)
      .populate('recruiterId', 'firstName lastName email')
      .populate('candidateId', 'firstName lastName email');

    if (!interview) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    // Check if recruiter owns this interview
    if (interview.recruiterId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Handle both completed and in-progress interviews
    const isCompleted = interview.status === 'completed';
    const isInProgress = interview.status === 'in_progress';
    
    if (!isCompleted && !isInProgress) {
      return res.status(400).json({ 
        message: 'Interview results are only available for in-progress or completed interviews',
        status: interview.status
      });
    }

    // Only calculate scores and stats for completed interviews
    let aggregateScores = interview.aggregateScores || {};
    let stats = {};
    
    if (isCompleted) {
      // Ensure aggregate scores are calculated if they don't exist
      if (!interview.aggregateScores || Object.keys(interview.aggregateScores).length === 0) {
        interview.calculateAggregateScores();
        // Recalculate if still empty (might be because no questions have evaluations)
        if (!interview.aggregateScores || Object.keys(interview.aggregateScores).length === 0) {
          // Set default empty scores
          interview.aggregateScores = {
            averageRelevance: 0,
            averageTechnicalAccuracy: 0,
            averageFluency: 0,
            overallScore: 0,
            overallCheatRisk: 0
          };
        }
        await interview.save();
        aggregateScores = interview.aggregateScores;
      }

      // Calculate detailed statistics
      stats = calculateInterviewStats(interview);
    } else {
      // For in-progress interviews, provide basic stats
      const answeredQuestions = interview.questions.filter(q => q.answeredAt);
      stats = {
        totalQuestions: interview.questions.length,
        answeredQuestions: answeredQuestions.length,
        completionRate: interview.questions.length > 0 
          ? (answeredQuestions.length / interview.questions.length) * 100 
          : 0,
        isInProgress: true
      };
    }

    res.json({
      interview: {
        id: interview._id,
        title: interview.title,
        description: interview.description,
        expectedSkills: interview.expectedSkills,
        status: interview.status,
        createdAt: interview.createdAt,
        startedAt: interview.startedAt,
        completedAt: interview.completedAt,
        recruiter: {
          id: interview.recruiterId._id,
          name: `${interview.recruiterId.firstName} ${interview.recruiterId.lastName}`,
          email: interview.recruiterId.email
        },
        candidate: interview.candidateId ? {
          id: interview.candidateId._id,
          name: `${interview.candidateId.firstName} ${interview.candidateId.lastName}`,
          email: interview.candidateId.email
        } : {
          email: interview.candidateEmail
        },
        questions: interview.questions.map(q => ({
          id: q.id,
          text: q.text,
          type: q.type,
          order: q.order,
          skillsTargeted: q.skillsTargeted || [],
          videoUrl: q.videoUrl,
          transcript: q.transcript,
          // Phase 3: Include conversation data
          finalTranscript: q.finalTranscript || q.transcript, // Fallback to transcript if finalTranscript not available
          conversationTurns: q.conversationTurns || [],
          videoSegment: q.videoSegment || null,
          evaluation: q.evaluation,
          cheating: q.cheating,
          token_usage: q.token_usage,
          answeredAt: q.answeredAt
        })),
        aggregateScores: aggregateScores,
        aiRecommendation: isCompleted ? (interview.aiRecommendation || {}) : null,
        totalTokenUsage: interview.totalTokenUsage || { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
        totalCost: interview.totalCost || 0,
        totalCostINR: interview.totalCost ? convertToINR(interview.totalCost) : 0,
        geminiModel: interview.geminiModel || 'gemini-2.5-pro',
        fullSessionVideoUrl: interview.fullSessionVideoUrl || null,
        statistics: stats
      }
    });
  } catch (error) {
    console.error('Get interview results error:', error);
    res.status(500).json({ message: 'Server error fetching interview results' });
  }
});

// Get overall recruiter metrics (Level 1: All interviews aggregate)
router.get('/overall', requireRole(['recruiter']), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Build date filter
    let dateFilter = { recruiterId: req.user._id };
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    const interviews = await Interview.find(dateFilter)
      .populate('candidateId', 'firstName lastName email');

    const metrics = calculateDashboardMetrics(interviews);

    // Get unique interview templates (group by title or use isPublished to identify templates)
    const interviewTemplates = await Interview.find({
      recruiterId: req.user._id,
      isPublished: true
    }).select('_id title createdAt');

    res.json({
      metrics: {
        ...metrics,
        totalInterviewTemplates: interviewTemplates.length,
        totalCandidateAttempts: interviews.filter(i => i.candidateId || i.candidateEmail).length
      },
      interviewTemplates: interviewTemplates.map(t => ({
        id: t._id,
        title: t.title,
        createdAt: t.createdAt
      })),
      recentInterviews: interviews
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 10)
        .map(interview => ({
          id: interview._id,
          title: interview.title,
          status: interview.status,
          candidate: interview.candidateId ? {
            name: `${interview.candidateId.firstName} ${interview.candidateId.lastName}`,
            email: interview.candidateId.email
          } : {
            email: interview.candidateEmail
          },
          createdAt: interview.createdAt,
          completedAt: interview.completedAt,
          aggregateScores: interview.aggregateScores
        }))
    });
  } catch (error) {
    console.error('Get overall metrics error:', error);
    res.status(500).json({ message: 'Server error fetching overall metrics' });
  }
});

// Get recruiter dashboard metrics (kept for backward compatibility)
router.get('/dashboard', requireRole(['recruiter']), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Build date filter
    let dateFilter = { recruiterId: req.user._id };
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    const interviews = await Interview.find(dateFilter)
      .populate('candidateId', 'firstName lastName email');

    const metrics = calculateDashboardMetrics(interviews);

    res.json({
      metrics,
      interviews: interviews.map(interview => ({
        id: interview._id,
        title: interview.title,
        status: interview.status,
        candidate: interview.candidateId ? {
          name: `${interview.candidateId.firstName} ${interview.candidateId.lastName}`,
          email: interview.candidateId.email
        } : {
          email: interview.candidateEmail
        },
        createdAt: interview.createdAt,
        completedAt: interview.completedAt,
        totalTokenUsage: interview.totalTokenUsage,
        totalCost: interview.totalCost,
        totalCostINR: interview.totalCost ? convertToINR(interview.totalCost) : 0,
        geminiModel: interview.geminiModel,
        aggregateScores: interview.aggregateScores
      }))
    });
  } catch (error) {
    console.error('Get dashboard metrics error:', error);
    res.status(500).json({ message: 'Server error fetching dashboard metrics' });
  }
});

// Export interview results as CSV
router.get('/interviews/:id/export/csv', requireRole(['recruiter']), async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id)
      .populate('recruiterId', 'firstName lastName email')
      .populate('candidateId', 'firstName lastName email');

    if (!interview) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    if (interview.recruiterId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const csvData = generateCSV(interview);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="interview-${interview._id}-results.csv"`);
    res.send(csvData);
  } catch (error) {
    console.error('Export CSV error:', error);
    res.status(500).json({ message: 'Server error exporting CSV' });
  }
});

// Export interview results as JSON
router.get('/interviews/:id/export/json', requireRole(['recruiter']), async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id)
      .populate('recruiterId', 'firstName lastName email')
      .populate('candidateId', 'firstName lastName email');

    if (!interview) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    if (interview.recruiterId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const exportData = {
      interview: {
        id: interview._id,
        title: interview.title,
        description: interview.description,
        expectedSkills: interview.expectedSkills,
        status: interview.status,
        createdAt: interview.createdAt,
        startedAt: interview.startedAt,
        completedAt: interview.completedAt,
        recruiter: {
          name: `${interview.recruiterId.firstName} ${interview.recruiterId.lastName}`,
          email: interview.recruiterId.email
        },
        candidate: interview.candidateId ? {
          name: `${interview.candidateId.firstName} ${interview.candidateId.lastName}`,
          email: interview.candidateId.email
        } : {
          email: interview.candidateEmail
        },
        questions: interview.questions.map(q => ({
          id: q.id,
          text: q.text,
          type: q.type,
          order: q.order,
          skillsTargeted: q.skillsTargeted || [],
          videoUrl: q.videoUrl,
          transcript: q.transcript,
          // Phase 3: Include conversation data
          finalTranscript: q.finalTranscript || q.transcript, // Fallback to transcript if finalTranscript not available
          conversationTurns: q.conversationTurns || [],
          videoSegment: q.videoSegment || null,
          evaluation: q.evaluation,
          cheating: q.cheating,
          token_usage: q.token_usage,
          answeredAt: q.answeredAt
        })),
        aggregateScores: interview.aggregateScores,
        totalTokenUsage: interview.totalTokenUsage,
        totalCost: interview.totalCost,
        totalCostINR: interview.totalCost ? convertToINR(interview.totalCost) : 0,
        geminiModel: interview.geminiModel
      },
      exportedAt: new Date().toISOString()
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="interview-${interview._id}-results.json"`);
    res.json(exportData);
  } catch (error) {
    console.error('Export JSON error:', error);
    res.status(500).json({ message: 'Server error exporting JSON' });
  }
});

// Helper function to calculate interview statistics
function calculateInterviewStats(interview) {
  const answeredQuestions = interview.questions.filter(q => q.answeredAt);
  const totalQuestions = interview.questions.length;
  
  // Calculate skill-wise statistics
  const skillStats = {};
  const expectedSkills = interview.expectedSkills || [];
  
  // Initialize skill stats
  expectedSkills.forEach(skill => {
    skillStats[skill.skill] = {
      skillName: skill.skill,
      weight: skill.weight || 0,
      questionsCount: 0,
      questions: [],
      averageScores: {
        relevance: 0,
        technical_accuracy: 0,
        fluency: 0,
        overall: 0
      },
      minScore: 100,
      maxScore: 0,
      scoreDistribution: {
        excellent: 0,
        good: 0,
        fair: 0,
        poor: 0
      }
    };
  });
  
  // Process each answered question and assign to skills
  answeredQuestions.forEach(q => {
    const skills = q.skillsTargeted || [];
    const overallScore = q.evaluation?.overall_score || 0;
    const relevance = q.evaluation?.relevance || 0;
    const technicalAccuracy = q.evaluation?.technical_accuracy || q.evaluation?.relevance || 0;
    const fluency = q.evaluation?.fluency || 0;
    
    skills.forEach(skillName => {
      if (skillStats[skillName]) {
        const skillStat = skillStats[skillName];
        skillStat.questionsCount++;
        skillStat.questions.push({
          questionId: q.id,
          questionText: q.text,
          overallScore,
          relevance,
          technical_accuracy: technicalAccuracy,
          fluency
        });
        
        // Update min/max scores
        if (overallScore < skillStat.minScore) skillStat.minScore = overallScore;
        if (overallScore > skillStat.maxScore) skillStat.maxScore = overallScore;
        
        // Update score distribution
        if (overallScore >= 80) skillStat.scoreDistribution.excellent++;
        else if (overallScore >= 60) skillStat.scoreDistribution.good++;
        else if (overallScore >= 40) skillStat.scoreDistribution.fair++;
        else skillStat.scoreDistribution.poor++;
      }
    });
  });
  
  // Calculate averages for each skill
  Object.keys(skillStats).forEach(skillName => {
    const skillStat = skillStats[skillName];
    if (skillStat.questionsCount > 0) {
      skillStat.averageScores.overall = skillStat.questions.reduce((sum, q) => sum + q.overallScore, 0) / skillStat.questionsCount;
      skillStat.averageScores.relevance = skillStat.questions.reduce((sum, q) => sum + q.relevance, 0) / skillStat.questionsCount;
      skillStat.averageScores.technical_accuracy = skillStat.questions.reduce((sum, q) => sum + q.technical_accuracy, 0) / skillStat.questionsCount;
      skillStat.averageScores.fluency = skillStat.questions.reduce((sum, q) => sum + q.fluency, 0) / skillStat.questionsCount;
    } else {
      skillStat.minScore = 0;
    }
  });
  
  const stats = {
    totalQuestions,
    answeredQuestions: answeredQuestions.length,
    completionRate: totalQuestions > 0 ? (answeredQuestions.length / totalQuestions) * 100 : 0,
    averageScores: {
      relevance: 0,
      technical_accuracy: 0,
      fluency: 0,
      overall: 0,
      minScore: 0,
      maxScore: 0
    },
    skillStatistics: skillStats,
    scoreDistribution: {
      excellent: 0, // >= 80
      good: 0,      // 60-79
      fair: 0,      // 40-59
      poor: 0       // < 40
    },
    cheatingAnalysis: {
      averageCheatScore: 0,
      highRiskQuestions: 0,
      mediumRiskQuestions: 0,
      lowRiskQuestions: 0,
      totalFlags: 0,
      flagBreakdown: {
        multi_face: 0,
        absent_face: 0,
        looking_away: 0,
        suspicious_behavior: 0
      }
    },
    tokenAnalysis: {
      totalInputTokens: interview.totalTokenUsage?.input_tokens || 0,
      totalOutputTokens: interview.totalTokenUsage?.output_tokens || 0,
      totalTokens: (interview.totalTokenUsage?.input_tokens || 0) + (interview.totalTokenUsage?.output_tokens || 0),
      averageTokensPerQuestion: 0,
      minTokensPerQuestion: 0,
      maxTokensPerQuestion: 0,
      tokenEfficiency: 0
    },
    timeAnalysis: {
      totalDuration: 0,
      totalDurationMinutes: 0,
      averageTimePerQuestion: 0,
      averageTimePerQuestionMinutes: 0
    },
    questionTypeBreakdown: {
      static: 0,
      dynamic: 0,
      followup: 0
    },
    videoAnalysis: {
      totalVideos: 0,
      videosWithTranscripts: 0,
      videoCoverageRate: 0
    }
  };

  if (answeredQuestions.length > 0) {
    // Calculate average scores
    const scores = answeredQuestions.map(q => q.evaluation?.overall_score || 0);
    stats.averageScores.relevance = answeredQuestions.reduce((sum, q) => sum + (q.evaluation?.relevance || 0), 0) / answeredQuestions.length;
    stats.averageScores.technical_accuracy = answeredQuestions.reduce((sum, q) => sum + (q.evaluation?.technical_accuracy || q.evaluation?.relevance || 0), 0) / answeredQuestions.length;
    stats.averageScores.fluency = answeredQuestions.reduce((sum, q) => sum + (q.evaluation?.fluency || 0), 0) / answeredQuestions.length;
    stats.averageScores.overall = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    stats.averageScores.minScore = Math.min(...scores);
    stats.averageScores.maxScore = Math.max(...scores);

    // Calculate score distribution
    scores.forEach(score => {
      if (score >= 80) stats.scoreDistribution.excellent++;
      else if (score >= 60) stats.scoreDistribution.good++;
      else if (score >= 40) stats.scoreDistribution.fair++;
      else stats.scoreDistribution.poor++;
    });

    // Calculate cheating analysis
    const cheatScores = answeredQuestions.map(q => q.cheating?.cheat_score || 0);
    stats.cheatingAnalysis.averageCheatScore = cheatScores.reduce((sum, s) => sum + s, 0) / cheatScores.length;
    stats.cheatingAnalysis.highRiskQuestions = cheatScores.filter(s => s > 0.7).length;
    stats.cheatingAnalysis.mediumRiskQuestions = cheatScores.filter(s => s > 0.3 && s <= 0.7).length;
    stats.cheatingAnalysis.lowRiskQuestions = cheatScores.filter(s => s <= 0.3).length;
    stats.cheatingAnalysis.totalFlags = answeredQuestions.reduce((sum, q) => sum + (q.cheating?.cheat_flags?.length || 0), 0);
    
    // Flag breakdown
    answeredQuestions.forEach(q => {
      if (q.cheating?.cheat_flags) {
        q.cheating.cheat_flags.forEach(flag => {
          if (stats.cheatingAnalysis.flagBreakdown[flag] !== undefined) {
            stats.cheatingAnalysis.flagBreakdown[flag]++;
          }
        });
      }
    });

    // Calculate token analysis
    const tokenCounts = answeredQuestions.map(q => 
      (q.token_usage?.input_tokens || 0) + (q.token_usage?.output_tokens || 0)
    );
    const totalTokens = tokenCounts.reduce((sum, t) => sum + t, 0);
    stats.tokenAnalysis.averageTokensPerQuestion = totalTokens / answeredQuestions.length;
    stats.tokenAnalysis.minTokensPerQuestion = Math.min(...tokenCounts);
    stats.tokenAnalysis.maxTokensPerQuestion = Math.max(...tokenCounts);
    stats.tokenAnalysis.tokenEfficiency = interview.tokenBudget > 0 ? (totalTokens / interview.tokenBudget) * 100 : 0;

    // Calculate time analysis
    if (interview.startedAt && interview.completedAt) {
      stats.timeAnalysis.totalDuration = interview.completedAt - interview.startedAt;
      stats.timeAnalysis.totalDurationMinutes = Math.round(stats.timeAnalysis.totalDuration / 60000);
      stats.timeAnalysis.averageTimePerQuestion = stats.timeAnalysis.totalDuration / answeredQuestions.length;
      stats.timeAnalysis.averageTimePerQuestionMinutes = Math.round(stats.timeAnalysis.averageTimePerQuestion / 60000);
    }

    // Question type breakdown
    answeredQuestions.forEach(q => {
      if (stats.questionTypeBreakdown[q.type] !== undefined) {
        stats.questionTypeBreakdown[q.type]++;
      }
    });

    // Video analysis
    stats.videoAnalysis.totalVideos = answeredQuestions.filter(q => q.videoUrl).length;
    stats.videoAnalysis.videosWithTranscripts = answeredQuestions.filter(q => q.videoUrl && q.transcript).length;
    stats.videoAnalysis.videoCoverageRate = answeredQuestions.length > 0 
      ? (stats.videoAnalysis.totalVideos / answeredQuestions.length) * 100 
      : 0;
  }

  return stats;
}

// Helper function to calculate dashboard metrics
function calculateDashboardMetrics(interviews) {
  const completedInterviews = interviews.filter(i => i.status === 'completed');
  const totalInterviews = interviews.length;
  
  const metrics = {
    totalInterviews,
    completedInterviews: completedInterviews.length,
    inProgressInterviews: interviews.filter(i => i.status === 'in_progress').length,
    invitedInterviews: interviews.filter(i => i.status === 'invited').length,
    completionRate: totalInterviews > 0 ? (completedInterviews.length / totalInterviews) * 100 : 0,
    averageScores: {
      overall: 0,
      relevance: 0,
      fluency: 0
    },
    tokenUsage: {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      averagePerInterview: 0
    },
    cheatingAnalysis: {
      averageCheatScore: 0,
      highRiskInterviews: 0
    },
    timeAnalysis: {
      averageDuration: 0
    }
  };

  if (completedInterviews.length > 0) {
    // Calculate average scores across all completed interviews
    let totalOverall = 0, totalRelevance = 0, totalFluency = 0;
    let totalInputTokens = 0, totalOutputTokens = 0;
    let totalCheatScore = 0, totalDuration = 0;

    completedInterviews.forEach(interview => {
      if (interview.aggregateScores) {
        totalOverall += interview.aggregateScores.overallScore || 0;
        totalRelevance += interview.aggregateScores.averageRelevance || 0;
        totalFluency += interview.aggregateScores.averageFluency || 0;
      }

      if (interview.totalTokenUsage) {
        totalInputTokens += interview.totalTokenUsage.input_tokens || 0;
        totalOutputTokens += interview.totalTokenUsage.output_tokens || 0;
      }

      if (interview.aggregateScores) {
        totalCheatScore += interview.aggregateScores.overallCheatRisk || 0;
      }

      if (interview.startedAt && interview.completedAt) {
        totalDuration += interview.completedAt - interview.startedAt;
      }
    });

    const count = completedInterviews.length;
    metrics.averageScores.overall = totalOverall / count;
    metrics.averageScores.relevance = totalRelevance / count;
    metrics.averageScores.fluency = totalFluency / count;

    metrics.tokenUsage.totalInputTokens = totalInputTokens;
    metrics.tokenUsage.totalOutputTokens = totalOutputTokens;
    metrics.tokenUsage.averagePerInterview = (totalInputTokens + totalOutputTokens) / count;

    metrics.cheatingAnalysis.averageCheatScore = totalCheatScore / count;
    metrics.cheatingAnalysis.highRiskInterviews = completedInterviews.filter(i => 
      (i.aggregateScores?.overallCheatRisk || 0) > 0.7
    ).length;

    metrics.timeAnalysis.averageDuration = totalDuration / count;
  }

  return metrics;
}

// Helper function to generate CSV data
function generateCSV(interview) {
  const headers = [
    'Question ID',
    'Question Text',
    'Question Type',
    'Order',
    'Skills Targeted',
    'Video URL',
    'Transcript',
    'Final Transcript (Conversation Format)', // Phase 3
    'Video Segment Start Time (ms)', // Phase 3
    'Video Segment End Time (ms)', // Phase 3
    'Relevance Score',
    'Technical Accuracy Score',
    'Fluency Score',
    'Overall Score',
    'Score Label',
    'Comment',
    'Cheat Score',
    'Cheat Flags',
    'Cheat Summary',
    'Input Tokens',
    'Output Tokens',
    'Total Tokens',
    'Answered At'
  ];

  const rows = interview.questions.map(q => [
    q.id,
    `"${(q.text || '').replace(/"/g, '""')}"`,
    q.type,
    q.order,
    `"${(q.skillsTargeted || []).join('; ')}"`,
    q.videoUrl || '',
    `"${(q.transcript || '').replace(/"/g, '""')}"`,
    `"${((q.finalTranscript || q.transcript || '').replace(/"/g, '""'))}"`, // Phase 3: Final transcript
    q.videoSegment?.startTime || '', // Phase 3: Video segment start
    q.videoSegment?.endTime || '', // Phase 3: Video segment end
    q.evaluation?.relevance || '',
    q.evaluation?.technical_accuracy || '',
    q.evaluation?.fluency || '',
    q.evaluation?.overall_score || '',
    q.evaluation?.score_label || '',
    `"${(q.evaluation?.comment || '').replace(/"/g, '""')}"`,
    q.cheating?.cheat_score || '',
    `"${(q.cheating?.cheat_flags || []).join(';')}"`,
    `"${(q.cheating?.summary || '').replace(/"/g, '""')}"`,
    q.token_usage?.input_tokens || '',
    q.token_usage?.output_tokens || '',
    (q.token_usage?.input_tokens || 0) + (q.token_usage?.output_tokens || 0),
    q.answeredAt ? new Date(q.answeredAt).toISOString() : ''
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.join(','))
    .join('\n');

  return csvContent;
}

module.exports = router;
