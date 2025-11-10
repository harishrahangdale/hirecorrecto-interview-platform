const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const Interview = require('../models/Interview');
const Invitation = require('../models/Invitation');
const User = require('../models/User');

async function verifyDeletion() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Check interviews with candidate data
    const interviewsWithCandidates = await Interview.find({
      $or: [
        { candidateId: { $exists: true, $ne: null } },
        { candidateEmail: { $exists: true, $ne: null } }
      ]
    });
    
    // Check invitations
    const invitations = await Invitation.find({});
    
    // Check temporary candidates
    const tempCandidates = await User.find({
      role: 'candidate',
      isTemporary: true
    });
    
    // Check interviews with attempt data (questions answered)
    const interviewsWithAttempts = await Interview.find({
      'questions.0': { $exists: true },
      $expr: { $gt: [{ $size: '$questions' }, 0] }
    });
    
    console.log('📊 Verification Results:');
    console.log(`   Interviews with candidateId/candidateEmail: ${interviewsWithCandidates.length}`);
    console.log(`   Invitations: ${invitations.length}`);
    console.log(`   Temporary candidate accounts: ${tempCandidates.length}`);
    console.log(`   Interviews with answered questions: ${interviewsWithAttempts.length}`);
    
    if (interviewsWithCandidates.length === 0 && 
        invitations.length === 0 && 
        tempCandidates.length === 0) {
      console.log('\n✅ All candidate data has been successfully deleted!');
    } else {
      console.log('\n⚠️  Some candidate data still exists:');
      if (interviewsWithCandidates.length > 0) {
        console.log(`   - ${interviewsWithCandidates.length} interview(s) still have candidate data`);
        interviewsWithCandidates.forEach(i => {
          console.log(`     * ${i._id}: ${i.title} (${i.candidateEmail || 'candidateId: ' + i.candidateId})`);
        });
      }
      if (invitations.length > 0) {
        console.log(`   - ${invitations.length} invitation(s) still exist`);
      }
      if (tempCandidates.length > 0) {
        console.log(`   - ${tempCandidates.length} temporary candidate account(s) still exist`);
      }
    }
    
    if (interviewsWithAttempts.length > 0) {
      console.log(`\n📝 Note: ${interviewsWithAttempts.length} interview(s) still have question data.`);
      console.log('   These are interview templates with questions but no candidate assignment.');
    }
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

verifyDeletion();

