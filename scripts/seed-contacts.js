const mongoose = require('mongoose');
require('dotenv').config();
const ContactSubmission = require('../src/models/ContactSubmission.model');
const User = require('../src/models/User.model');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/printicom';

const seedContacts = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB for seeding...');

    // Delete existing contacts
    await ContactSubmission.deleteMany({});
    console.log('Existing contacts cleared.');

    const admin = await User.findOne({ role: 'admin' });

    const contacts = [
      {
        name: 'Rahul Sharma',
        email: 'rahul@example.com',
        phone: '9888877777',
        subject: 'Bulk Mug Order for Wedding',
        category: 'Bulk Order',
        message: 'I want to order 500 custom mugs for a wedding reception. Can I get a special discount?',
        priority: 'High',
        status: 'new',
      },
      {
        name: 'Anjali Gupta',
        email: 'anjali@example.com',
        phone: '9777766666',
        subject: 'Design Help for Calendar',
        category: 'Design Help',
        message: 'I am trying to upload photos for the calendar but the resolution warning keeps showing up. Can you help?',
        priority: 'Normal',
        status: 'read',
        adminNote: 'Likely an image DPI issue.',
      },
      {
        name: 'Vikram Singh',
        email: 'vikram@example.com',
        phone: '9666655555',
        subject: 'Corporate Partnership',
        category: 'Partnership',
        message: 'Our company is looking for a regular printing partner for monthly employee recognition awards.',
        priority: 'High',
        status: 'replied',
        repliedAt: new Date(Date.now() - 86400000),
        assignedTo: admin?._id,
      },
      {
        name: 'Sneha Patel',
        email: 'sneha@example.com',
        phone: '9555544444',
        subject: 'Feedback on Wall Frame',
        category: 'Feedback',
        message: 'The wall frame I received was amazing! The quality exceeded my expectations. Thank you!',
        priority: 'Normal',
        status: 'closed',
      }
    ];

    await ContactSubmission.insertMany(contacts);
    console.log('Successfully seeded 4 contact submissions.');

    await mongoose.connection.close();
    console.log('Connection closed.');
  } catch (error) {
    console.error('Error seeding contacts:', error);
    process.exit(1);
  }
};

seedContacts();
