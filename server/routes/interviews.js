const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const multer = require('multer');
const Interview = require('../models/Interview');
const User = require('../models/User');
const Invitation = require('../models/Invitation');
const { requireRole } = require('../middleware/auth');
const { sendInviteEmailWithCredentials } = require('../services/email');
const { generateFirstQuestion, generateNextQuestion, geminiService, getSessionSummary, calculateCost, convertToINR, generateOverallRecommendation } = require('../services/gemini');

const router = express.Router();

// Configure multer for text file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/plain' || file.originalname.endsWith('.txt')) {
      cb(null, true);
    } else {
      cb(new Error('Only .txt files are allowed'), false);
    }
  }
});

// Helper function to parse text file
const parseTextFile = (buffer) => {
  if (!buffer) return [];
  const text = buffer.toString('utf-8');
  return text
    .split('\n')
    .map(q => q.trim())
    .filter(q => q.length > 0);
};

// Create interview template (recruiter only)
router.post('/', requireRole(['recruiter']), upload.fields([
  { name: 'mandatoryQuestionsFile', maxCount: 1 },
  { name: 'optionalQuestionsFile', maxCount: 1 }
]), async (req, res) => {
  try {
    // Handle both JSON and multipart/form-data
    let bodyData = req.body;
    
    // If dateWindow is a string, parse it
    if (typeof bodyData.dateWindow === 'string') {
      try {
        bodyData.dateWindow = JSON.parse(bodyData.dateWindow);
      } catch (e) {
        return res.status(400).json({ message: 'Invalid dateWindow format' });
      }
    }
    
    // If expectedSkills is a string, parse it
    if (typeof bodyData.expectedSkills === 'string') {
      try {
        bodyData.expectedSkills = JSON.parse(bodyData.expectedSkills);
      } catch (e) {
        return res.status(400).json({ message: 'Invalid expectedSkills format' });
      }
    }

    // Validate required fields
    if (!bodyData.title || !bodyData.title.trim()) {
      return res.status(400).json({ message: 'Title is required' });
    }
    if (!bodyData.description || !bodyData.description.trim()) {
      return res.status(400).json({ message: 'Description is required' });
    }
    if (!bodyData.expectedSkills || !Array.isArray(bodyData.expectedSkills) || bodyData.expectedSkills.length === 0) {
      return res.status(400).json({ message: 'At least one skill is required' });
    }
    if (!bodyData.experienceRange) {
      return res.status(400).json({ message: 'Experience range is required' });
    }
    if (!bodyData.dateWindow || !bodyData.dateWindow.start || !bodyData.dateWindow.end) {
      return res.status(400).json({ message: 'Date window is required' });
    }

    // Parse questions with skills (sent as JSON from frontend)
    let mandatoryQuestions = [];
    let optionalQuestions = [];
    
    if (bodyData.mandatoryQuestions) {
      try {
        mandatoryQuestions = typeof bodyData.mandatoryQuestions === 'string' 
          ? JSON.parse(bodyData.mandatoryQuestions)
          : bodyData.mandatoryQuestions;
        // Validate structure
        if (!Array.isArray(mandatoryQuestions)) {
          return res.status(400).json({ message: 'Invalid mandatory questions format' });
        }
        // Ensure all questions have text and skills array
        mandatoryQuestions = mandatoryQuestions.map(q => ({
          text: typeof q === 'string' ? q : (q.text || q),
          skills: Array.isArray(q.skills) ? q.skills : []
        }));
      } catch (e) {
        return res.status(400).json({ message: 'Invalid mandatory questions JSON format' });
      }
    }
    
    if (bodyData.optionalQuestions) {
      try {
        optionalQuestions = typeof bodyData.optionalQuestions === 'string'
          ? JSON.parse(bodyData.optionalQuestions)
          : bodyData.optionalQuestions;
        // Validate structure
        if (!Array.isArray(optionalQuestions)) {
          return res.status(400).json({ message: 'Invalid optional questions format' });
        }
        // Ensure all questions have text and skills array
        optionalQuestions = optionalQuestions.map(q => ({
          text: typeof q === 'string' ? q : (q.text || q),
          skills: Array.isArray(q.skills) ? q.skills : []
        }));
      } catch (e) {
        return res.status(400).json({ message: 'Invalid optional questions JSON format' });
      }
    }
    
    // Validate that all questions have at least one skill assigned
    const mandatoryWithoutSkills = mandatoryQuestions.filter(q => !q.skills || q.skills.length === 0);
    const optionalWithoutSkills = optionalQuestions.filter(q => !q.skills || q.skills.length === 0);
    
    if (mandatoryWithoutSkills.length > 0) {
      return res.status(400).json({ 
        message: `${mandatoryWithoutSkills.length} mandatory question(s) have no skills assigned. Please assign skills to all questions.`
      });
    }
    
    if (optionalWithoutSkills.length > 0) {
      return res.status(400).json({ 
        message: `${optionalWithoutSkills.length} optional question(s) have no skills assigned. Please assign skills to all questions.`
      });
    }

    // Validate weightage if questions are uploaded
    const mandatoryWeightage = parseFloat(bodyData.mandatoryWeightage) || 0;
    const optionalWeightage = parseFloat(bodyData.optionalWeightage) || 0;
    
    if ((mandatoryQuestions.length > 0 || optionalQuestions.length > 0)) {
      const totalWeightage = mandatoryWeightage + optionalWeightage;
      if (Math.abs(totalWeightage - 100) > 0.01) {
        return res.status(400).json({ 
          message: 'Mandatory and optional question weightage must sum to 100%',
          currentSum: totalWeightage
        });
      }
    }

    // Validate skill weights sum to 100%
    const totalWeight = bodyData.expectedSkills.reduce((sum, skill) => sum + (parseFloat(skill.weight) || 0), 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      return res.status(400).json({ 
        message: 'Skill weights must sum to 100%',
        currentSum: totalWeight
      });
    }

    const interview = new Interview({
      title: bodyData.title.trim(),
      description: bodyData.description.trim(),
      expectedSkills: bodyData.expectedSkills,
      experienceRange: bodyData.experienceRange,
      dateWindow: {
        start: new Date(bodyData.dateWindow.start),
        end: new Date(bodyData.dateWindow.end)
      },
      passPercentage: parseFloat(bodyData.passPercentage) || 70,
      duration: parseInt(bodyData.duration) || 30,
      maxQuestions: parseInt(bodyData.maxQuestions) || 5,
      mandatoryQuestions: mandatoryQuestions,
      optionalQuestions: optionalQuestions,
      mandatoryWeightage: mandatoryWeightage,
      optionalWeightage: optionalWeightage,
      recruiterId: req.user._id,
      questions: [] // Questions will be generated in real-time during interview
    });

    await interview.save();

    res.status(201).json({
      message: 'Interview template created successfully',
      interview: {
        id: interview._id,
        title: interview.title,
        description: interview.description,
        expectedSkills: interview.expectedSkills,
        experienceRange: interview.experienceRange,
        dateWindow: interview.dateWindow,
        passPercentage: interview.passPercentage,
        duration: interview.duration,
        maxQuestions: interview.maxQuestions,
        mandatoryQuestions: interview.mandatoryQuestions,
        optionalQuestions: interview.optionalQuestions,
        mandatoryWeightage: interview.mandatoryWeightage,
        optionalWeightage: interview.optionalWeightage,
        status: interview.status,
        questions: [], // Questions generated in real-time
        createdAt: interview.createdAt
      }
    });
  } catch (error) {
    console.error('Create interview error:', error);
    res.status(500).json({ message: 'Server error creating interview', error: error.message });
  }
});

// Get all interviews for current user
router.get('/', async (req, res) => {
  try {
    let query = {};
    
    if (req.user.role === 'recruiter') {
      query.recruiterId = req.user._id;
    } else if (req.user.role === 'candidate') {
      // For candidates, only show published interviews
      query.isPublished = true;
      
      // For candidates, check both direct assignment and invitations
      try {
        // First, find all invitations for this candidate
        const invitations = await Invitation.find({
          $or: [
            { candidateId: req.user._id },
            { candidateEmail: req.user.email.toLowerCase() }
          ],
          status: { $in: ['pending', 'accepted', 'started', 'completed'] }
        }).select('interviewId');
        
        // Get interview IDs from invitations
        const interviewIdsFromInvitations = invitations.map(inv => inv.interviewId);
        
        // Build query to include both direct assignments and invitations
        if (interviewIdsFromInvitations.length > 0) {
          query.$or = [
            { candidateId: req.user._id },
            { candidateEmail: req.user.email.toLowerCase() },
            { _id: { $in: interviewIdsFromInvitations } }
          ];
        } else {
          // If no invitations, just check direct assignment
          query.$or = [
            { candidateId: req.user._id },
            { candidateEmail: req.user.email.toLowerCase() }
          ];
        }
      } catch (invitationError) {
        // If Invitation model has issues, fall back to direct assignment only
        console.warn('Error fetching invitations, using direct assignment only:', invitationError.message);
        query.$or = [
          { candidateId: req.user._id },
          { candidateEmail: req.user.email.toLowerCase() }
        ];
      }
    }

    const interviews = await Interview.find(query)
      .populate('recruiterId', 'firstName lastName email')
      .populate('candidateId', 'firstName lastName email')
      .sort({ createdAt: -1 });

    // For recruiters, fetch invitations for each interview to show invited candidates
    let interviewsWithInvitations = interviews;
    if (req.user.role === 'recruiter') {
      const interviewIds = interviews.map(interview => interview._id);
      const allInvitations = await Invitation.find({ 
        interviewId: { $in: interviewIds } 
      })
        .populate('candidateId', 'firstName lastName email isTemporary')
        .sort({ invitedAt: -1 });

      // Group invitations by interviewId
      const invitationsByInterview = {};
      allInvitations.forEach(invitation => {
        const interviewId = invitation.interviewId.toString();
        if (!invitationsByInterview[interviewId]) {
          invitationsByInterview[interviewId] = [];
        }
        invitationsByInterview[interviewId].push(invitation);
      });

      // Attach invitations to interviews
      interviewsWithInvitations = interviews.map(interview => {
        const interviewObj = interview.toObject();
        interviewObj.invitations = invitationsByInterview[interview._id.toString()] || [];
        return interviewObj;
      });
    } else {
      // For candidates, convert Mongoose documents to plain objects
      interviewsWithInvitations = interviews.map(interview => interview.toObject());
    }

    // Transform interviews to include id field
    const transformedInterviews = interviewsWithInvitations.map(interview => ({
      ...interview,
      id: interview._id.toString()
    }));

    res.json({ interviews: transformedInterviews });
  } catch (error) {
    console.error('Get interviews error:', error);
    res.status(500).json({ message: 'Server error fetching interviews' });
  }
});

// Get all invitations for an interview
router.get('/:id/invitations', requireRole(['recruiter']), async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id);

    if (!interview) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    if (interview.recruiterId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const invitations = await Invitation.find({ interviewId: interview._id })
      .populate('candidateId', 'firstName lastName email isTemporary')
      .populate('invitedBy', 'firstName lastName email')
      .sort({ invitedAt: -1 });

    res.json({ invitations });
  } catch (error) {
    console.error('Get invitations error:', error);
    res.status(500).json({ message: 'Server error fetching invitations' });
  }
});

// Toggle publish status (recruiter only) - MUST come before /:id route
router.patch('/:id/publish', requireRole(['recruiter']), async (req, res) => {
  console.log('PATCH /:id/publish route hit', req.params.id);
  try {
    const interview = await Interview.findById(req.params.id);

    if (!interview) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    if (interview.recruiterId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    interview.isPublished = !interview.isPublished;
    await interview.save();

    res.json({
      message: interview.isPublished ? 'Interview published successfully' : 'Interview unpublished successfully',
      interview: {
        id: interview._id,
        isPublished: interview.isPublished
      }
    });
  } catch (error) {
    console.error('Toggle publish error:', error);
    res.status(500).json({ message: 'Server error toggling publish status', error: error.message });
  }
});

// Revoke invitation (only if interview hasn't started)
router.delete('/:id/invitations/:invitationId', requireRole(['recruiter']), async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id);

    if (!interview) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    if (interview.recruiterId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const invitation = await Invitation.findById(req.params.invitationId);

    if (!invitation) {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    if (invitation.interviewId.toString() !== interview._id.toString()) {
      return res.status(400).json({ message: 'Invitation does not belong to this interview' });
    }

    // Check if interview has been started or completed
    if (invitation.status === 'started' || invitation.status === 'completed') {
      return res.status(400).json({ 
        message: 'Cannot revoke invitation. Interview has already been started or completed.',
        status: invitation.status
      });
    }

    // Check if interview itself has been started
    if (interview.status === 'in_progress' || interview.status === 'completed') {
      return res.status(400).json({ 
        message: 'Cannot revoke invitation. Interview is already in progress or completed.',
        interviewStatus: interview.status
      });
    }

    // Delete the invitation
    await Invitation.findByIdAndDelete(invitation._id);

    // If this was the only invitation and interview status is 'invited', revert to 'draft'
    const remainingInvitations = await Invitation.countDocuments({ interviewId: interview._id });
    if (remainingInvitations === 0 && interview.status === 'invited') {
      interview.status = 'draft';
      await interview.save();
    }

    res.json({ 
      message: 'Invitation revoked successfully',
      revokedInvitation: {
        id: invitation._id,
        candidateEmail: invitation.candidateEmail
      }
    });
  } catch (error) {
    console.error('Revoke invitation error:', error);
    res.status(500).json({ message: 'Server error revoking invitation', error: error.message });
  }
});

// Get specific interview
router.get('/:id', async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id)
      .populate('recruiterId', 'firstName lastName email')
      .populate('candidateId', 'firstName lastName email');

    if (!interview) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    // Check permissions
    const isRecruiter = req.user.role === 'recruiter' && interview.recruiterId._id.toString() === req.user._id.toString();
    let isCandidate = req.user.role === 'candidate' && (
      (interview.candidateId && interview.candidateId._id.toString() === req.user._id.toString()) ||
      interview.candidateEmail === req.user.email
    );

    // Also check if candidate has an invitation for this interview
    if (!isCandidate && req.user.role === 'candidate') {
      try {
        const invitation = await Invitation.findOne({
          interviewId: interview._id,
          $or: [
            { candidateId: req.user._id },
            { candidateEmail: req.user.email.toLowerCase() }
          ],
          status: { $in: ['pending', 'accepted', 'started', 'completed'] }
        });
        if (invitation) {
          isCandidate = true;
        }
      } catch (invitationError) {
        // If invitation check fails, continue with existing check
        console.warn('Error checking invitation for access:', invitationError.message);
      }
    }

    // For candidates, also check if interview is published
    if (req.user.role === 'candidate' && !interview.isPublished) {
      return res.status(403).json({ message: 'This interview is not published yet' });
    }

    if (!isRecruiter && !isCandidate) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ interview });
  } catch (error) {
    console.error('Get interview error:', error);
    res.status(500).json({ message: 'Server error fetching interview' });
  }
});

// Invite candidate to interview
router.post('/:id/invite', requireRole(['recruiter']), [
  body('candidateEmail').isEmail().normalizeEmail(),
  body('firstName').optional().trim(),
  body('lastName').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { candidateEmail, firstName, lastName } = req.body;
    const interview = await Interview.findById(req.params.id);

    if (!interview) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    if (interview.recruiterId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Check if invitation already exists for this email
    const existingInvitation = await Invitation.findOne({
      interviewId: interview._id,
      candidateEmail: candidateEmail.toLowerCase()
    });

    if (existingInvitation) {
      return res.status(400).json({ 
        message: 'Candidate has already been invited to this interview',
        invitation: {
          id: existingInvitation._id,
          candidateEmail: existingInvitation.candidateEmail,
          status: existingInvitation.status,
          invitedAt: existingInvitation.invitedAt
        }
      });
    }

    // Find or create candidate user
    let candidate = await User.findOne({ email: candidateEmail.toLowerCase(), role: 'candidate' });
    let passwordToSend = null;
    
    if (candidate) {
      // Existing candidate - generate one-time password for this invitation
      passwordToSend = crypto.randomBytes(4).toString('hex').toUpperCase();
    } else {
      // New candidate - generate temporary password
      passwordToSend = crypto.randomBytes(4).toString('hex').toUpperCase();
      
      // Extract name from email if not provided
      const emailName = candidateEmail.split('@')[0];
      const candidateFirstName = firstName || emailName.split('.')[0] || emailName.substring(0, 1).toUpperCase() + emailName.substring(1);
      const candidateLastName = lastName || (emailName.includes('.') ? emailName.split('.').slice(1).join(' ') : 'Candidate');
      
      // Create temporary candidate account
      candidate = new User({
        email: candidateEmail.toLowerCase(),
        password: passwordToSend, // Will be hashed by pre-save hook
        firstName: candidateFirstName,
        lastName: candidateLastName,
        role: 'candidate',
        isTemporary: true,
        temporaryExpiresAt: interview.dateWindow.end // Expires when interview window closes
      });
      await candidate.save();
    }

    // Generate invite token
    const inviteToken = uuidv4();
    
    // Create invitation
    const expiresAt = interview.dateWindow.end;
    
    const invitation = new Invitation({
      interviewId: interview._id,
      candidateEmail: candidateEmail.toLowerCase(),
      candidateId: candidate._id,
      inviteToken: inviteToken,
      temporaryPassword: passwordToSend,
      invitedBy: req.user._id,
      expiresAt: expiresAt
    });

    await invitation.save();

    // Update interview status to invited if it's still draft
    if (interview.status === 'draft') {
      interview.status = 'invited';
      await interview.save();
    }

    // Send invite email with credentials
    let emailSent = false;
    let emailError = null;
    try {
      await sendInviteEmailWithCredentials(
        candidateEmail,
        interview.title,
        inviteToken,
        candidate.email,
        passwordToSend,
        interview.dateWindow
      );
      emailSent = true;
      console.log(`✅ Email sent successfully to ${candidateEmail}`);
    } catch (error) {
      emailError = error;
      console.error('❌ Email sending error:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        command: error.command,
        response: error.response,
        responseCode: error.responseCode
      });
    }

    // Return response with email status
    const response = {
      message: emailSent ? 'Invitation sent successfully' : 'Invitation created but email failed to send',
      invitation: {
        id: invitation._id,
        candidateEmail: invitation.candidateEmail,
        status: invitation.status,
        invitedAt: invitation.invitedAt,
        expiresAt: invitation.expiresAt,
        isTemporary: candidate.isTemporary
      }
    };

    // Include email error details in development mode
    if (!emailSent && emailError) {
      response.emailError = process.env.NODE_ENV === 'development' ? {
        message: emailError.message,
        code: emailError.code,
        hint: emailError.code === 'EAUTH' ? 'Check your SMTP credentials (SMTP_USER and SMTP_PASS)' : 
              emailError.code === 'ECONNECTION' ? 'Check your SMTP_HOST and SMTP_PORT settings' :
              'Check your email configuration in .env file'
      } : {
        message: 'Email service is not properly configured'
      };
    }

    // Return 200 even if email fails (invitation is still created)
    // But include warning in the response
    res.json(response);
  } catch (error) {
    console.error('Invite candidate error:', error);
    res.status(500).json({ message: 'Server error sending invitation', error: error.message });
  }
});

// Start interview (candidate)
router.post('/:id/start', requireRole(['candidate']), async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id);

    if (!interview) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    // Check if candidate is authorized (check both direct assignment and invitations)
    let isAuthorized = (interview.candidateId && interview.candidateId.toString() === req.user._id.toString()) ||
                        interview.candidateEmail === req.user.email.toLowerCase();

    // Also check if candidate has an invitation for this interview
    let invitation = null;
    if (!isAuthorized) {
      try {
        invitation = await Invitation.findOne({
          interviewId: interview._id,
          $or: [
            { candidateId: req.user._id },
            { candidateEmail: req.user.email.toLowerCase() }
          ],
          status: { $in: ['pending', 'accepted'] },
          expiresAt: { $gt: new Date() }
        });
        if (invitation) {
          isAuthorized = true;
        }
      } catch (invitationError) {
        console.warn('Error checking invitation:', invitationError.message);
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Check if interview can be started (status should be 'invited' or have a valid invitation)
    const canStart = interview.status === 'invited' || (invitation && invitation.status === 'pending' || invitation.status === 'accepted');
    if (!canStart) {
      return res.status(400).json({ message: 'Interview cannot be started' });
    }

    // Check if within date window
    const now = new Date();
    if (now < interview.dateWindow.start || now > interview.dateWindow.end) {
      return res.status(400).json({ message: 'Interview is not available at this time' });
    }

    // Update invitation status if it exists
    if (invitation && (invitation.status === 'pending' || invitation.status === 'accepted')) {
      invitation.status = 'started';
      invitation.startedAt = new Date();
      await invitation.save();
    }

    // Update interview status
    interview.status = 'in_progress';
    interview.startedAt = new Date();
    await interview.save();

    // Note: First question will be generated via Socket.IO when Gemini session is initialized
    // This ensures the question is generated in real-time with proper context

    res.json({
      message: 'Interview started successfully',
      interview: {
        id: interview._id,
        title: interview.title,
        questions: interview.questions, // Will be empty initially, populated dynamically
        status: interview.status,
        startedAt: interview.startedAt,
        maxQuestions: interview.maxQuestions,
        duration: interview.duration
      }
    });
  } catch (error) {
    console.error('Start interview error:', error);
    res.status(500).json({ message: 'Server error starting interview' });
  }
});

// Generate first question
router.post('/:id/generate-first-question', requireRole(['candidate']), async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id);

    if (!interview) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    // Check if candidate is authorized
    const isAuthorized = (interview.candidateId && interview.candidateId.toString() === req.user._id.toString()) ||
                        interview.candidateEmail === req.user.email;

    if (!isAuthorized) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (interview.status !== 'in_progress') {
      return res.status(400).json({ message: 'Interview is not in progress' });
    }

    // Check if first question already exists
    if (interview.questions.length > 0) {
      return res.json({
        question: {
          id: interview.questions[0].id,
          text: interview.questions[0].text,
          type: interview.questions[0].type,
          order: interview.questions[0].order
        }
      });
    }

    // Generate first question using Gemini
    // Note: This requires a sessionId from Socket.IO, so we'll handle it differently
    // For now, return an error asking to use Socket.IO
    res.status(400).json({ 
      message: 'Please use Socket.IO to generate questions. The session must be initialized first.' 
    });
  } catch (error) {
    console.error('Generate first question error:', error);
    res.status(500).json({ message: 'Server error generating question' });
  }
});

// Submit answer for a question
router.post('/:id/questions/:questionId/answer', requireRole(['candidate']), [
  body('videoUrl').optional().isString(), // Allow empty string for cases without video
  body('transcript').optional(),
  body('geminiResponse').isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { videoUrl, transcript, geminiResponse } = req.body;
    const questionText = geminiResponse?.questionText || req.body.questionText;
    const interview = await Interview.findById(req.params.id);

    if (!interview) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    // Check if candidate is authorized
    const isAuthorized = (interview.candidateId && interview.candidateId.toString() === req.user._id.toString()) ||
                        interview.candidateEmail === req.user.email;

    if (!isAuthorized) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (interview.status !== 'in_progress') {
      return res.status(400).json({ message: 'Interview is not in progress' });
    }

    // Find and update the question, or create if it doesn't exist (for dynamic questions)
    let question = interview.questions.id(req.params.questionId);
    
    if (!question) {
      // Create new question entry for dynamic questions
      const newQuestion = {
        id: req.params.questionId,
        text: questionText || geminiResponse?.questionText || 'Dynamic question',
        type: 'dynamic',
        order: interview.questions.length + 1,
        videoUrl: videoUrl, // Ensure videoUrl is saved
        transcript: transcript || geminiResponse?.transcript || '',
        evaluation: geminiResponse?.evaluation || {},
        cheating: geminiResponse?.cheating || {},
        token_usage: geminiResponse?.token_usage || { input_tokens: 0, output_tokens: 0 },
        answeredAt: new Date()
      };
      interview.questions.push(newQuestion);
      question = interview.questions[interview.questions.length - 1]; // Get the newly added question
    } else {
      // Update existing question
      // Update question text if provided (for follow-up questions)
      if (geminiResponse?.questionText) {
        question.text = geminiResponse.questionText;
      }
      // Always update videoUrl - this is critical for per-question video recording
      question.videoUrl = videoUrl;
      question.transcript = transcript || geminiResponse?.transcript || question.transcript;
      question.evaluation = geminiResponse?.evaluation || question.evaluation;
      question.cheating = geminiResponse?.cheating || question.cheating;
      question.token_usage = geminiResponse?.token_usage || question.token_usage;
      question.answeredAt = new Date();
    }

    // Update total token usage with actual values
    const inputTokens = geminiResponse?.token_usage?.input_tokens || 0;
    const outputTokens = geminiResponse?.token_usage?.output_tokens || 0;
    
    interview.totalTokenUsage.input_tokens += inputTokens;
    interview.totalTokenUsage.output_tokens += outputTokens;
    interview.totalTokenUsage.total_tokens = interview.totalTokenUsage.input_tokens + interview.totalTokenUsage.output_tokens;
    
    // Calculate and update cost if model is set
    if (interview.geminiModel) {
      const cost = calculateCost(inputTokens, outputTokens, interview.geminiModel);
      interview.totalCost += cost;
    }

    // Check if we should continue or end the interview
    const answeredQuestions = interview.questions.filter(q => q.answeredAt);
    
    // End interview if:
    // 1. We've reached max questions
    // 2. Gemini indicated to end (next_action === 'end_interview')
    // 3. All questions have been answered (if questions were pre-generated)
    if (geminiResponse?.next_action === 'end_interview' || 
        answeredQuestions.length >= interview.maxQuestions) {
      interview.status = 'completed';
      interview.completedAt = new Date();
      
      // Calculate aggregate scores
      interview.calculateAggregateScores();
      
      // Generate overall AI recommendation
      try {
        const recommendation = await generateOverallRecommendation(interview);
        interview.aiRecommendation = {
          fitStatus: recommendation.fitStatus,
          recommendationSummary: recommendation.recommendationSummary,
          strengths: recommendation.strengths || [],
          weaknesses: recommendation.weaknesses || [],
          generatedAt: new Date()
        };
        
        // Update token usage and cost for recommendation generation
        const recInputTokens = recommendation.token_usage?.input_tokens || 0;
        const recOutputTokens = recommendation.token_usage?.output_tokens || 0;
        interview.totalTokenUsage.input_tokens += recInputTokens;
        interview.totalTokenUsage.output_tokens += recOutputTokens;
        interview.totalTokenUsage.total_tokens = interview.totalTokenUsage.input_tokens + interview.totalTokenUsage.output_tokens;
        
        if (interview.geminiModel) {
          const recCost = calculateCost(recInputTokens, recOutputTokens, interview.geminiModel);
          interview.totalCost += recCost;
        }
      } catch (error) {
        console.error('Error generating overall recommendation:', error);
        // Don't fail the interview completion if recommendation generation fails
      }
    }

    await interview.save();

    res.json({
      message: 'Answer submitted successfully',
      question: {
        id: question.id,
        videoUrl: question.videoUrl, // Ensure videoUrl is returned
        transcript: question.transcript,
        evaluation: question.evaluation,
        cheating: question.cheating,
        token_usage: question.token_usage,
        answeredAt: question.answeredAt
      },
      interviewStatus: interview.status,
      nextAction: geminiResponse?.next_action,
      nextText: geminiResponse?.next_text
    });
  } catch (error) {
    console.error('Submit answer error:', error);
    res.status(500).json({ message: 'Server error submitting answer' });
  }
});

// Update interview (recruiter only)
router.put('/:id', requireRole(['recruiter']), upload.fields([
  { name: 'mandatoryQuestionsFile', maxCount: 1 },
  { name: 'optionalQuestionsFile', maxCount: 1 }
]), async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id);

    if (!interview) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    if (interview.recruiterId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Check if any candidate has completed this interview
    const hasCompletedInvitations = await Invitation.exists({
      interviewId: interview._id,
      status: 'completed'
    });

    if (hasCompletedInvitations || interview.status === 'completed') {
      return res.status(400).json({ 
        message: 'Cannot edit interview. At least one candidate has completed it.' 
      });
    }

    // Handle both JSON and multipart/form-data
    let bodyData = req.body;
    
    // If dateWindow is a string, parse it
    if (typeof bodyData.dateWindow === 'string') {
      try {
        bodyData.dateWindow = JSON.parse(bodyData.dateWindow);
      } catch (e) {
        return res.status(400).json({ message: 'Invalid dateWindow format' });
      }
    }
    
    // If expectedSkills is a string, parse it
    if (typeof bodyData.expectedSkills === 'string') {
      try {
        bodyData.expectedSkills = JSON.parse(bodyData.expectedSkills);
      } catch (e) {
        return res.status(400).json({ message: 'Invalid expectedSkills format' });
      }
    }

    // Update allowed fields
    if (bodyData.title !== undefined) {
      if (!bodyData.title || !bodyData.title.trim()) {
        return res.status(400).json({ message: 'Title is required' });
      }
      interview.title = bodyData.title.trim();
    }

    if (bodyData.description !== undefined) {
      if (!bodyData.description || !bodyData.description.trim()) {
        return res.status(400).json({ message: 'Description is required' });
      }
      interview.description = bodyData.description.trim();
    }

    if (bodyData.expectedSkills !== undefined) {
      if (!Array.isArray(bodyData.expectedSkills) || bodyData.expectedSkills.length === 0) {
        return res.status(400).json({ message: 'At least one skill is required' });
      }
      interview.expectedSkills = bodyData.expectedSkills;
    }

    if (bodyData.experienceRange !== undefined) {
      interview.experienceRange = bodyData.experienceRange;
    }

    if (bodyData.dateWindow !== undefined) {
      if (!bodyData.dateWindow.start || !bodyData.dateWindow.end) {
        return res.status(400).json({ message: 'Date window is required' });
      }
      interview.dateWindow = {
        start: new Date(bodyData.dateWindow.start),
        end: new Date(bodyData.dateWindow.end)
      };
    }

    if (bodyData.passPercentage !== undefined) {
      interview.passPercentage = parseFloat(bodyData.passPercentage) || 70;
    }

    if (bodyData.duration !== undefined) {
      interview.duration = parseInt(bodyData.duration) || 30;
    }

    if (bodyData.maxQuestions !== undefined) {
      interview.maxQuestions = parseInt(bodyData.maxQuestions) || 5;
    }

    // Parse questions with skills
    let mandatoryQuestions = [];
    let optionalQuestions = [];
    
    if (bodyData.mandatoryQuestions !== undefined) {
      try {
        mandatoryQuestions = typeof bodyData.mandatoryQuestions === 'string' 
          ? JSON.parse(bodyData.mandatoryQuestions)
          : bodyData.mandatoryQuestions;
        if (!Array.isArray(mandatoryQuestions)) {
          return res.status(400).json({ message: 'Invalid mandatory questions format' });
        }
        mandatoryQuestions = mandatoryQuestions.map(q => ({
          text: typeof q === 'string' ? q : (q.text || q),
          skills: Array.isArray(q.skills) ? q.skills : []
        }));
      } catch (e) {
        return res.status(400).json({ message: 'Invalid mandatory questions JSON format' });
      }
    } else {
      mandatoryQuestions = interview.mandatoryQuestions;
    }
    
    if (bodyData.optionalQuestions !== undefined) {
      try {
        optionalQuestions = typeof bodyData.optionalQuestions === 'string'
          ? JSON.parse(bodyData.optionalQuestions)
          : bodyData.optionalQuestions;
        if (!Array.isArray(optionalQuestions)) {
          return res.status(400).json({ message: 'Invalid optional questions format' });
        }
        optionalQuestions = optionalQuestions.map(q => ({
          text: typeof q === 'string' ? q : (q.text || q),
          skills: Array.isArray(q.skills) ? q.skills : []
        }));
      } catch (e) {
        return res.status(400).json({ message: 'Invalid optional questions JSON format' });
      }
    } else {
      optionalQuestions = interview.optionalQuestions;
    }
    
    // Validate that all questions have at least one skill assigned
    const mandatoryWithoutSkills = mandatoryQuestions.filter(q => !q.skills || q.skills.length === 0);
    const optionalWithoutSkills = optionalQuestions.filter(q => !q.skills || q.skills.length === 0);
    
    if (mandatoryWithoutSkills.length > 0) {
      return res.status(400).json({ 
        message: `${mandatoryWithoutSkills.length} mandatory question(s) have no skills assigned. Please assign skills to all questions.`
      });
    }
    
    if (optionalWithoutSkills.length > 0) {
      return res.status(400).json({ 
        message: `${optionalWithoutSkills.length} optional question(s) have no skills assigned. Please assign skills to all questions.`
      });
    }

    // Validate weightage if questions are uploaded
    const mandatoryWeightage = bodyData.mandatoryWeightage !== undefined 
      ? parseFloat(bodyData.mandatoryWeightage) || 0 
      : interview.mandatoryWeightage;
    const optionalWeightage = bodyData.optionalWeightage !== undefined
      ? parseFloat(bodyData.optionalWeightage) || 0
      : interview.optionalWeightage;
    
    if ((mandatoryQuestions.length > 0 || optionalQuestions.length > 0)) {
      const totalWeightage = mandatoryWeightage + optionalWeightage;
      if (Math.abs(totalWeightage - 100) > 0.01) {
        return res.status(400).json({ 
          message: 'Mandatory and optional question weightage must sum to 100%',
          currentSum: totalWeightage
        });
      }
    }

    // Validate skill weights sum to 100%
    if (bodyData.expectedSkills !== undefined) {
      const totalWeight = bodyData.expectedSkills.reduce((sum, skill) => sum + (parseFloat(skill.weight) || 0), 0);
      if (Math.abs(totalWeight - 100) > 0.01) {
        return res.status(400).json({ 
          message: 'Skill weights must sum to 100%',
          currentSum: totalWeight
        });
      }
    }

    interview.mandatoryQuestions = mandatoryQuestions;
    interview.optionalQuestions = optionalQuestions;
    interview.mandatoryWeightage = mandatoryWeightage;
    interview.optionalWeightage = optionalWeightage;

    await interview.save();

    res.json({
      message: 'Interview updated successfully',
      interview: {
        id: interview._id,
        title: interview.title,
        description: interview.description,
        expectedSkills: interview.expectedSkills,
        experienceRange: interview.experienceRange,
        dateWindow: interview.dateWindow,
        passPercentage: interview.passPercentage,
        duration: interview.duration,
        maxQuestions: interview.maxQuestions,
        mandatoryQuestions: interview.mandatoryQuestions,
        optionalQuestions: interview.optionalQuestions,
        mandatoryWeightage: interview.mandatoryWeightage,
        optionalWeightage: interview.optionalWeightage,
        status: interview.status,
        isPublished: interview.isPublished,
        updatedAt: interview.updatedAt
      }
    });
  } catch (error) {
    console.error('Update interview error:', error);
    res.status(500).json({ message: 'Server error updating interview', error: error.message });
  }
});

// Delete interview (recruiter only)
router.delete('/:id', requireRole(['recruiter']), async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id);

    if (!interview) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    if (interview.recruiterId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Check if any candidate has completed this interview
    const completedInvitations = await Invitation.find({
      interviewId: interview._id,
      status: 'completed'
    });

    if (completedInvitations.length > 0 || interview.status === 'completed') {
      return res.status(400).json({ 
        message: 'Cannot delete interview. At least one candidate has completed it.',
        completedCount: completedInvitations.length
      });
    }

    // Delete all invitations for this interview
    await Invitation.deleteMany({ interviewId: interview._id });

    // Delete the interview
    await Interview.findByIdAndDelete(interview._id);

    res.json({
      message: 'Interview deleted successfully',
      deletedInterview: {
        id: interview._id,
        title: interview.title
      }
    });
  } catch (error) {
    console.error('Delete interview error:', error);
    res.status(500).json({ message: 'Server error deleting interview', error: error.message });
  }
});

// Complete interview
router.post('/:id/complete', requireRole(['candidate']), async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id);

    if (!interview) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    // Check if candidate is authorized
    const isAuthorized = (interview.candidateId && interview.candidateId.toString() === req.user._id.toString()) ||
                        interview.candidateEmail === req.user.email;

    if (!isAuthorized) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (interview.status !== 'in_progress') {
      return res.status(400).json({ message: 'Interview is not in progress' });
    }

    // Update interview status
    interview.status = 'completed';
    interview.completedAt = new Date();
    
    // Save full session video URL if provided
    if (req.body.fullSessionVideoUrl) {
      interview.fullSessionVideoUrl = req.body.fullSessionVideoUrl;
    }
    
      // Calculate final scores
      interview.calculateAggregateScores();
      interview.calculateTokenUsage();
      
      // Generate overall AI recommendation
      try {
        const recommendation = await generateOverallRecommendation(interview);
        interview.aiRecommendation = {
          fitStatus: recommendation.fitStatus,
          recommendationSummary: recommendation.recommendationSummary,
          strengths: recommendation.strengths || [],
          weaknesses: recommendation.weaknesses || [],
          generatedAt: new Date()
        };
        
        // Update token usage and cost for recommendation generation
        const recInputTokens = recommendation.token_usage?.input_tokens || 0;
        const recOutputTokens = recommendation.token_usage?.output_tokens || 0;
        interview.totalTokenUsage.input_tokens += recInputTokens;
        interview.totalTokenUsage.output_tokens += recOutputTokens;
        interview.totalTokenUsage.total_tokens = interview.totalTokenUsage.input_tokens + interview.totalTokenUsage.output_tokens;
        
        if (interview.geminiModel) {
          const recCost = calculateCost(recInputTokens, recOutputTokens, interview.geminiModel);
          interview.totalCost += recCost;
        }
      } catch (error) {
        console.error('Error generating overall recommendation:', error);
        // Don't fail the interview completion if recommendation generation fails
      }
      
      // Ensure total tokens is calculated
      if (!interview.totalTokenUsage.total_tokens) {
        interview.totalTokenUsage.total_tokens = 
          interview.totalTokenUsage.input_tokens + interview.totalTokenUsage.output_tokens;
      }

      await interview.save();

    res.json({
      message: 'Interview completed successfully',
      interview: {
        id: interview._id,
        status: interview.status,
        completedAt: interview.completedAt,
        aggregateScores: interview.aggregateScores,
        totalTokenUsage: interview.totalTokenUsage,
        totalCost: interview.totalCost,
        totalCostINR: interview.totalCost ? convertToINR(interview.totalCost) : 0,
        geminiModel: interview.geminiModel
      }
    });
  } catch (error) {
    console.error('Complete interview error:', error);
    res.status(500).json({ message: 'Server error completing interview' });
  }
});

module.exports = router;
