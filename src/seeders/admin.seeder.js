require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User.model');

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: process.env.ADMIN_EMAIL });
    if (existingAdmin) {
      console.log('ℹ️  Admin already exists:', existingAdmin.email);
      process.exit(0);
    }

    // Create admin user
    const admin = await User.create({
      name: process.env.ADMIN_NAME || 'Printicom Admin',
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
      role: 'admin',
      isEmailVerified: true, // Admin is pre-verified
      isActive: true,
    });

    console.log('🎉 Admin created successfully!');
    console.log('   Email   :', admin.email);
    console.log('   Name    :', admin.name);
    console.log('   Role    :', admin.role);
    console.log('\n⚠️  IMPORTANT: Change the default admin password immediately after first login!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeder Error:', error.message);
    process.exit(1);
  }
};

seedAdmin();
