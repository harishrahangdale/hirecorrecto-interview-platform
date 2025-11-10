const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const Interview = require('../models/Interview');
const User = require('../models/User');

async function checkInterviewData() {
  try {
    const interviewId = '69104d888e788547485d29da';
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    const interview = await Interview.findById(interviewId)
      .populate('recruiterId', 'firstName lastName email')
      .populate('candidateId', 'firstName lastName email');
    
    if (!interview) {
      console.log('❌ Interview not found');
      process.exit(1);
    }
    
    console.log('\n📋 Interview Data:');
    console.log('ID:', interview._id);
    console.log('Title:', interview.title);
    console.log('Status:', interview.status);
    console.log('Is Published:', interview.isPublished);
    console.log('Started At:', interview.startedAt);
    console.log('Completed At:', interview.completedAt);
    console.log('\n📊 Aggregate Scores:');
    console.log(JSON.stringify(interview.aggregateScores, null, 2));
    console.log('\n💰 Token Usage:');
    console.log(JSON.stringify(interview.totalTokenUsage, null, 2));
    console.log('\n💵 Total Cost:', interview.totalCost);
    console.log('\n🤖 AI Recommendation:');
    console.log(JSON.stringify(interview.aiRecommendation, null, 2));
    console.log('\n📹 Full Session Video URL:', interview.fullSessionVideoUrl);
    console.log('\n❓ Questions Count:', interview.questions.length);
    
    if (interview.questions.length > 0) {
      console.log('\n📝 Questions Details:');
      interview.questions.forEach((q, idx) => {
        console.log(`\n  Question ${idx + 1}:`);
        console.log(`    ID: ${q.id}`);
        console.log(`    Text: ${q.text?.substring(0, 50)}...`);
        console.log(`    Type: ${q.type}`);
        console.log(`    Video URL: ${q.videoUrl || 'N/A'}`);
        console.log(`    Transcript: ${q.transcript ? 'Yes (' + q.transcript.length + ' chars)' : 'No'}`);
        console.log(`    Evaluation:`, q.evaluation ? {
          overall_score: q.evaluation.overall_score,
          relevance: q.evaluation.relevance,
          technical_accuracy: q.evaluation.technical_accuracy,
          fluency: q.evaluation.fluency
        } : 'N/A');
        console.log(`    Answered At: ${q.answeredAt || 'N/A'}`);
      });
    }
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

checkInterviewData();

