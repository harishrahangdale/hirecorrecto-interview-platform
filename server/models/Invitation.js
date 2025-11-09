const mongoose = require('mongoose');

const invitationSchema = new mongoose.Schema({
  interviewId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Interview',
    required: true
  },
  candidateEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  candidateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  inviteToken: {
    type: String,
    required: true,
    unique: true
  },
  temporaryPassword: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'started', 'completed', 'expired'],
    default: 'pending'
  },
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  invitedAt: {
    type: Date,
    default: Date.now
  },
  acceptedAt: {
    type: Date
  },
  startedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  expiresAt: {
    type: Date,
    required: true
  },
  isTemporary: {
    type: Boolean,
    default: true
  }
});

// Index for faster lookups
invitationSchema.index({ interviewId: 1, candidateEmail: 1 });
invitationSchema.index({ inviteToken: 1 });
invitationSchema.index({ candidateId: 1 });

// Check if invitation is expired
invitationSchema.methods.isExpired = function() {
  return new Date() > this.expiresAt;
};

// Check if invitation can be used
invitationSchema.methods.canBeUsed = function() {
  return this.status === 'pending' && !this.isExpired();
};

module.exports = mongoose.model('Invitation', invitationSchema);

