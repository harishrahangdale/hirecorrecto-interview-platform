const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const Interview = require('../models/Interview');

async function clearAllInterviewAttemptData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    const interviews = await Interview.find({});
    
    console.log(`📋 Found ${interviews.length} interview(s)\n`);
    
    let clearedCount = 0;
    
    for (const interview of interviews) {
      let needsUpdate = false;
      
      // Check if interview has attempt data
      const hasAttemptData = 
        interview.status !== 'draft' ||
        interview.startedAt !== null ||
        interview.completedAt !== null ||
        interview.questions.length > 0 ||
        (interview.totalTokenUsage && interview.totalTokenUsage.total_tokens > 0) ||
        interview.totalCost > 0 ||
        (interview.aggregateScores && Object.keys(interview.aggregateScores).length > 0);
      
      if (hasAttemptData) {
        console.log(`🧹 Clearing attempt data from: ${interview._id} (${interview.title})`);
        console.log(`   Current status: ${interview.status}`);
        console.log(`   Questions: ${interview.questions.length}`);
        console.log(`   Started: ${interview.startedAt || 'None'}`);
        console.log(`   Completed: ${interview.completedAt || 'None'}`);
        
        // Clear all attempt data
        interview.questions = [];
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
        interview.candidateId = null;
        interview.candidateEmail = null;
        // Remove inviteToken field instead of setting to null (to avoid unique index conflict)
        interview.inviteToken = undefined;
        interview.inviteSentAt = null;
        
        await interview.save();
        
        // Use $unset to remove inviteToken field completely if it exists
        await Interview.updateOne(
          { _id: interview._id },
          { $unset: { inviteToken: "" } }
        );
        
        clearedCount++;
        console.log(`   ✅ Cleared - Status set to: draft\n`);
      } else {
        console.log(`✓ Interview ${interview._id} is already clean (draft status, no attempt data)\n`);
      }
    }
    
    console.log(`\n✨ Summary:`);
    console.log(`   - Cleared attempt data from ${clearedCount} interview(s)`);
    console.log(`   - All interviews are now in 'draft' status with no attempt data`);
    
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

clearAllInterviewAttemptData();

