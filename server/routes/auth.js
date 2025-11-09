const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

// Lazy load Invitation model to avoid breaking login if model has issues
// We'll load it dynamically when needed
const getInvitationModel = () => {
  try {
    return require('../models/Invitation');
  } catch (error) {
    console.warn('Invitation model could not be loaded:', error.message);
    return null;
  }
};

const router = express.Router();

// Rate limiter for login (more lenient in development)
const isDevelopment = process.env.NODE_ENV !== 'production';
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 50 : 10, // limit each IP to 10 login attempts per windowMs (50 in dev)
  message: 'Too many login attempts from this IP, please try again after 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful logins
  skip: (req) => {
    // In development, allow more attempts
    return isDevelopment && process.env.DISABLE_RATE_LIMIT === 'true';
  }
});

// Register
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('firstName').trim().notEmpty(),
  body('lastName').trim().notEmpty(),
  body('role').isIn(['recruiter', 'candidate'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, firstName, lastName, role } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create new user
    const user = new User({
      email,
      password,
      firstName,
      lastName,
      role
    });

    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// Login
router.post('/login', loginLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check password - first try regular password, then check temporary password from invitations
    let isMatch = await user.comparePassword(password);
    
    // Only check invitations if regular password doesn't match and user is a candidate
    if (!isMatch && user.role === 'candidate') {
      try {
        // Dynamically load Invitation model only when needed
        const Invitation = getInvitationModel();
        if (Invitation) {
          // Check if password matches any active invitation's temporary password
          // Check both by candidateId and candidateEmail to handle all cases
          const invitation = await Invitation.findOne({
            $or: [
              { candidateId: user._id },
              { candidateEmail: user.email.toLowerCase() }
            ],
            temporaryPassword: password,
            status: { $in: ['pending', 'accepted'] },
            expiresAt: { $gt: new Date() }
          });
          
          if (invitation) {
            // Mark invitation as accepted if it's still pending
            if (invitation.status === 'pending') {
              invitation.status = 'accepted';
              invitation.acceptedAt = new Date();
              await invitation.save();
            }
            isMatch = true; // Allow login with temporary password
          }
        }
        // If model can't be loaded, just continue with regular password check
        // Don't fail login
      } catch (invitationError) {
        // If invitation lookup fails, just log it and continue with regular password check
        console.error('Error checking invitation:', invitationError);
        // Don't fail login if invitation check has an error
      }
    }
    
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Check if temporary account has expired
    if (user.isTemporary && user.temporaryExpiresAt && new Date() > user.temporaryExpiresAt) {
      return res.status(401).json({ message: 'Your temporary account has expired. Please contact the recruiter for a new invitation.' });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ message: 'Account is deactivated' });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        lastLogin: user.lastLogin
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    res.json({
      user: {
        id: req.user._id,
        email: req.user.email,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        role: req.user.role,
        lastLogin: req.user.lastLogin,
        createdAt: req.user.createdAt
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Seed dummy accounts (development only)
router.post('/seed', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ message: 'Seeding not allowed in production' });
  }

  try {
    // Check if users already exist
    const existingRecruiter = await User.findOne({ email: 'recruiter@hirecorrecto.com' });
    const existingCandidate = await User.findOne({ email: 'candidate@hirecorrecto.com' });

    if (existingRecruiter && existingCandidate) {
      return res.json({ message: 'Dummy accounts already exist' });
    }

    // Create recruiter account
    if (!existingRecruiter) {
      const recruiter = new User({
        email: 'recruiter@hirecorrecto.com',
        password: 'Recruiter123',
        firstName: 'John',
        lastName: 'Recruiter',
        role: 'recruiter'
      });
      await recruiter.save();
    }

    // Create candidate account
    if (!existingCandidate) {
      const candidate = new User({
        email: 'candidate@hirecorrecto.com',
        password: 'Candidate123',
        firstName: 'Jane',
        lastName: 'Candidate',
        role: 'candidate'
      });
      await candidate.save();
    }

    res.json({ message: 'Dummy accounts created successfully' });
  } catch (error) {
    console.error('Seeding error:', error);
    res.status(500).json({ message: 'Server error during seeding' });
  }
});

module.exports = router;
