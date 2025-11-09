const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const Interview = require('../models/Interview');
const Invitation = require('../models/Invitation');

async function deleteAllInterviews() {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Delete all invitations first (since they reference interviews)
    console.log('\n🗑️  Deleting all invitations...');
    const invitationDeleteResult = await Invitation.deleteMany({});
    console.log(`✅ Deleted ${invitationDeleteResult.deletedCount} invitation(s)`);

    // Delete all interviews
    console.log('\n🗑️  Deleting all interviews...');
    const interviewDeleteResult = await Interview.deleteMany({});
    console.log(`✅ Deleted ${interviewDeleteResult.deletedCount} interview(s)`);

    console.log('\n✨ All interview data has been deleted successfully!');
    
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
deleteAllInterviews();

