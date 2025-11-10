const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const Interview = require('../models/Interview');
const Invitation = require('../models/Invitation');
const User = require('../models/User');

async function deleteAllCandidateData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Step 1: Find all interviews with candidates
    const candidateInterviews = await Interview.find({
      $or: [
        { candidateId: { $exists: true, $ne: null } },
        { candidateEmail: { $exists: true, $ne: null } }
      ]
    });
    
    console.log(`\n📋 Found ${candidateInterviews.length} interview(s) with candidate data:`);
    candidateInterviews.forEach((interview, index) => {
      console.log(`  ${index + 1}. Interview ID: ${interview._id}`);
      console.log(`     Title: ${interview.title}`);
      console.log(`     Candidate: ${interview.candidateEmail || (interview.candidateId ? 'User ID: ' + interview.candidateId : 'N/A')}`);
      console.log(`     Status: ${interview.status}`);
      console.log(`     Questions Attempted: ${interview.questions.length}`);
    });

    // Step 2: Find all invitations
    const invitations = await Invitation.find({});
    console.log(`\n📧 Found ${invitations.length} invitation(s):`);
    invitations.forEach((invitation, index) => {
      console.log(`  ${index + 1}. Invitation ID: ${invitation._id}`);
      console.log(`     Interview ID: ${invitation.interviewId}`);
      console.log(`     Candidate Email: ${invitation.candidateEmail}`);
      console.log(`     Status: ${invitation.status}`);
    });

    // Step 3: Find temporary candidate accounts
    const temporaryCandidates = await User.find({
      role: 'candidate',
      isTemporary: true
    });
    console.log(`\n👤 Found ${temporaryCandidates.length} temporary candidate account(s):`);
    temporaryCandidates.forEach((candidate, index) => {
      console.log(`  ${index + 1}. User ID: ${candidate._id}`);
      console.log(`     Email: ${candidate.email}`);
      console.log(`     Name: ${candidate.firstName} ${candidate.lastName}`);
    });

    // Confirmation prompt
    console.log('\n⚠️  WARNING: This will delete:');
    console.log(`   - ${candidateInterviews.length} interview attempt(s)`);
    console.log(`   - ${invitations.length} invitation(s)`);
    console.log(`   - ${temporaryCandidates.length} temporary candidate account(s)`);
    console.log('\nThis action cannot be undone!');
    
    // Auto-confirm for script execution (you can add manual confirmation if needed)
    const confirmDelete = process.argv.includes('--confirm');
    if (!confirmDelete) {
      console.log('\n❌ To proceed, run with --confirm flag:');
      console.log('   node server/scripts/delete-all-candidate-data.js --confirm');
      await mongoose.connection.close();
      process.exit(0);
    }

    console.log('\n🗑️  Starting deletion...\n');

    // Delete candidate interview data (clear candidate fields and attempt data)
    let deletedInterviewData = 0;
    for (const interview of candidateInterviews) {
      // Clear candidate attempt data but keep the interview template
      interview.questions = [];
      interview.candidateId = null;
      interview.candidateEmail = null;
      interview.status = 'draft';
      interview.startedAt = null;
      interview.completedAt = null;
      interview.fullSessionVideoUrl = null;
      interview.aggregateScores = {};
      interview.aiRecommendation = {
        fitStatus: null,
        recommendationSummary: null,
        strengths: [],
        weaknesses: [],
        generatedAt: null
      };
      interview.totalTokenUsage = {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0
      };
      interview.totalCost = 0;
      // Remove inviteToken field instead of setting to null (to avoid unique index conflict)
      interview.inviteToken = undefined;
      interview.inviteSentAt = null;
      
      await interview.save();
      
      // Use $unset to remove inviteToken field completely if it exists
      await Interview.updateOne(
        { _id: interview._id },
        { $unset: { inviteToken: "" } }
      );
      
      deletedInterviewData++;
      console.log(`✅ Cleared candidate data from interview: ${interview._id} (${interview.title})`);
    }

    // Delete all invitations
    const invitationDeleteResult = await Invitation.deleteMany({});
    console.log(`✅ Deleted ${invitationDeleteResult.deletedCount} invitation(s)`);

    // Delete temporary candidate accounts
    const candidateDeleteResult = await User.deleteMany({
      role: 'candidate',
      isTemporary: true
    });
    console.log(`✅ Deleted ${candidateDeleteResult.deletedCount} temporary candidate account(s)`);

    console.log('\n✨ Cleanup Summary:');
    console.log(`   - Cleared candidate data from ${deletedInterviewData} interview(s)`);
    console.log(`   - Deleted ${invitationDeleteResult.deletedCount} invitation(s)`);
    console.log(`   - Deleted ${candidateDeleteResult.deletedCount} temporary candidate account(s)`);
    console.log('\n✅ All candidate data has been deleted successfully!');
    console.log('\n📝 Note: Interview templates (without candidate data) have been preserved.');
    
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

deleteAllCandidateData();

