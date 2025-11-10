const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const Interview = require('../models/Interview');

async function checkInterviewStatus() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    const interviews = await Interview.find({});
    
    console.log(`📋 Found ${interviews.length} interview(s):\n`);
    
    interviews.forEach((interview, index) => {
      console.log(`${index + 1}. Interview ID: ${interview._id}`);
      console.log(`   Title: ${interview.title}`);
      console.log(`   Status: ${interview.status}`);
      console.log(`   Is Published: ${interview.isPublished}`);
      console.log(`   Candidate ID: ${interview.candidateId || 'None'}`);
      console.log(`   Candidate Email: ${interview.candidateEmail || 'None'}`);
      console.log(`   Started At: ${interview.startedAt || 'None'}`);
      console.log(`   Completed At: ${interview.completedAt || 'None'}`);
      console.log(`   Questions Count: ${interview.questions.length}`);
      console.log(`   Questions with answers: ${interview.questions.filter(q => q.answeredAt).length}`);
      console.log(`   Total Token Usage: ${interview.totalTokenUsage?.total_tokens || 0}`);
      console.log(`   Total Cost: ${interview.totalCost || 0}`);
      console.log(`   Aggregate Scores: ${JSON.stringify(interview.aggregateScores)}`);
      console.log('');
    });
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

checkInterviewStatus();

