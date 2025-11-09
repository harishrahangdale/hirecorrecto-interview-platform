const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const Interview = require('../models/Interview');
const User = require('../models/User');

async function resetInterviews() {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find or create test users
    console.log('\n👥 Ensuring test users exist...');
    
    let recruiter = await User.findOne({ email: 'recruiter@hirecorrecto.com' });
    if (!recruiter) {
      console.log('Creating recruiter account...');
      recruiter = new User({
        email: 'recruiter@hirecorrecto.com',
        password: 'Recruiter123',
        firstName: 'John',
        lastName: 'Recruiter',
        role: 'recruiter'
      });
      await recruiter.save();
      console.log('✅ Recruiter account created');
    } else {
      console.log('✅ Recruiter account exists');
    }

    let candidate = await User.findOne({ email: 'candidate@hirecorrecto.com' });
    if (!candidate) {
      console.log('Creating candidate account...');
      candidate = new User({
        email: 'candidate@hirecorrecto.com',
        password: 'Candidate123',
        firstName: 'Jane',
        lastName: 'Candidate',
        role: 'candidate'
      });
      await candidate.save();
      console.log('✅ Candidate account created');
    } else {
      console.log('✅ Candidate account exists');
    }

    // Delete all existing interviews
    console.log('\n🗑️  Deleting all existing interviews...');
    const deleteResult = await Interview.deleteMany({});
    console.log(`✅ Deleted ${deleteResult.deletedCount} interview(s)`);

    // Create a fresh test interview
    console.log('\n📝 Creating fresh test interview...');
    
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30); // Valid for 30 days

    const newInterview = new Interview({
      title: 'Test Automation Engineer - Technical Interview',
      description: 'We are looking for an experienced Test Automation Engineer to join our quality assurance team. This interview will assess your expertise in test automation frameworks, API testing, and your ability to design and implement robust test automation solutions. You should be proficient in Java and have hands-on experience with Selenium and Playwright for web automation, as well as API testing methodologies.',
      expectedSkills: [
        { skill: 'Java', weight: 30 },
        { skill: 'Selenium', weight: 30 },
        { skill: 'API Testing', weight: 25 },
        { skill: 'Playwright', weight: 15 }
      ],
      experienceRange: 'mid',
      dateWindow: {
        start: startDate,
        end: endDate
      },
      passPercentage: 70,
      duration: 45,
      maxQuestions: 5,
      recruiterId: recruiter._id,
      candidateId: candidate._id,
      candidateEmail: candidate.email,
      status: 'invited',
      inviteToken: uuidv4(),
      inviteSentAt: new Date(),
      geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-pro',
      totalTokenUsage: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0
      },
      totalCost: 0
    });

    await newInterview.save();
    console.log('✅ Fresh interview created successfully!');
    console.log('\n📋 Interview Details:');
    console.log(`   ID: ${newInterview._id}`);
    console.log(`   Title: ${newInterview.title}`);
    console.log(`   Status: ${newInterview.status}`);
    console.log(`   Candidate: ${candidate.email}`);
    console.log(`   Valid until: ${endDate.toLocaleDateString()}`);
    console.log('\n📚 Expected Skills:');
    newInterview.expectedSkills.forEach((skill, index) => {
      console.log(`   ${index + 1}. ${skill.skill} (${skill.weight}%)`);
    });

    console.log('\n🎯 Test Credentials:');
    console.log('   Recruiter: recruiter@hirecorrecto.com / Recruiter123');
    console.log('   Candidate: candidate@hirecorrecto.com / Candidate123');
    console.log('\n✨ Ready for testing!');
    
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
resetInterviews();

