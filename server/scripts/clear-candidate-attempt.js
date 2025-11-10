const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const Interview = require('../models/Interview');
const Invitation = require('../models/Invitation');

async function clearCandidateAttempt() {
  try {
    const candidateEmail = 'harishrahang@gmail.com';
    
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // First, try to find interviews by candidateEmail
    console.log(`\n🔍 Searching for published interviews for candidate: ${candidateEmail}...`);
    let interviews = await Interview.find({
      candidateEmail: candidateEmail.toLowerCase(),
      isPublished: true
    });

    // If not found by email, try to find via Invitation model
    if (interviews.length === 0) {
      console.log(`\n🔍 No interviews found by email. Searching via invitations...`);
      const invitations = await Invitation.find({
        candidateEmail: candidateEmail.toLowerCase()
      });
      
      if (invitations.length > 0) {
        console.log(`\n📋 Found ${invitations.length} invitation(s) for this candidate.`);
        const interviewIds = invitations.map(inv => inv.interviewId);
        interviews = await Interview.find({
          _id: { $in: interviewIds },
          isPublished: true
        });
        console.log(`\n📋 Found ${interviews.length} published interview(s) linked via invitations.`);
      }
    }

    if (interviews.length === 0) {
      console.log(`\n⚠️  No published interviews found for candidate: ${candidateEmail}`);
      await mongoose.connection.close();
      process.exit(0);
    }

    console.log(`\n📋 Found ${interviews.length} published interview(s):`);
    interviews.forEach((interview, index) => {
      console.log(`\n  ${index + 1}. Interview ID: ${interview._id}`);
      console.log(`     Title: ${interview.title}`);
      console.log(`     Status: ${interview.status}`);
      console.log(`     Started At: ${interview.startedAt || 'Not started'}`);
      console.log(`     Completed At: ${interview.completedAt || 'Not completed'}`);
      console.log(`     Questions Attempted: ${interview.questions.length}`);
    });

    // Process each interview
    for (const interview of interviews) {
      console.log(`\n🧹 Clearing attempt data for interview: ${interview._id} (${interview.title})...`);
      
      // Clear candidate attempt data
      interview.questions = [];
      interview.startedAt = null;
      interview.completedAt = null;
      interview.status = 'invited'; // Reset to invited so candidate can attempt again
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
      
      // Keep candidateId and candidateEmail so the interview is still linked to the candidate
      // This allows them to attempt it again
      
      await interview.save();
      console.log(`✅ Cleared attempt data for interview: ${interview._id}`);
    }

    console.log(`\n✨ Successfully cleared attempt data for ${interviews.length} interview(s)!`);
    console.log(`\n📝 Note: The interview(s) are now reset to 'invited' status and ready for the candidate to attempt again.`);
    
    // Close connection
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run the script
clearCandidateAttempt();

