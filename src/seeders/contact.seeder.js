require('dotenv').config();
const mongoose = require('mongoose');
const ContactSubmission = require('../models/ContactSubmission.model');

const submissions = [
  {
    name: 'Rahul Sharma',
    email: 'rahul.s@example.com',
    phone: '+91-9876543210',
    subject: 'Bulk Order Query',
    category: 'Bulk Order',
    message: 'Hello, I am looking to order 500 personalized mugs for my company employees. Please let me know the bulk pricing and delivery timeline for Mumbai location.',
    priority: 'High',
    status: 'new',
  },
  {
    name: 'Priya Singh',
    email: 'priya.s@example.com',
    phone: '+91-8877665544',
    subject: 'Design Help Needed',
    category: 'Design Help',
    message: 'I want to create a custom photobook but I am facing issues with the image resolution warning. Can someone help me with the ideal dimensions?',
    priority: 'Normal',
    status: 'new',
  },
  {
    name: 'Amit Patel',
    email: 'amit.p@outlook.com',
    phone: '+91-7766554433',
    subject: 'Partnership Proposal',
    category: 'Partnership',
    message: 'We have a retail chain in Gujarat and we are interested in partnering with Printicom for offline orders. Looking forward to discussing this.',
    priority: 'Normal',
    status: 'read',
    adminNote: 'Sent to management for review.',
  },
  {
    name: 'Sneha Reddy',
    email: 'sneha.r@gmail.com',
    phone: '+91-9988776655',
    subject: 'Order Status #ORD-1234',
    category: 'General Inquiry',
    message: 'My order was supposed to be delivered today but the tracking shows it is still in transit. Can you please check?',
    priority: 'High',
    status: 'replied',
    repliedAt: new Date(Date.now() - 86400000), // 1 day ago
    adminNote: 'Called her and updated that delivery agent was delayed due to rain.',
  },
  {
    name: 'John Doe',
    email: 'john.d@example.com',
    phone: '+1-555-0199',
    subject: 'Spam Message',
    category: 'Other',
    message: 'Win 1,000,000 dollars by clicking this link! Limited time offer.',
    priority: 'Normal',
    status: 'closed',
    adminNote: 'Spam - system auto-flagged.',
  },
];

const seedContactSubmissions = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing (optional - maybe don't clear if user has real data, but for seeding we usually do)
    await ContactSubmission.deleteMany({});
    console.log('🗑️  Cleared existing contact submissions');

    await ContactSubmission.insertMany(submissions);
    console.log(`🎉 Successfully seeded ${submissions.length} contact submissions!`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeder Error:', error.message);
    process.exit(1);
  }
};

seedContactSubmissions();
