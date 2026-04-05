const mongoose = require('mongoose');
require('dotenv').config();
const ContactSubmission = require('../src/models/ContactSubmission.model');
const User = require('../src/models/User.model');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/printicom';

const seedAdvancedContacts = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB for advanced seeding...');

    const admin = await User.findOne({ role: 'admin' });

    const contacts = [
      {
        name: 'The Grand Hotel',
        email: 'hotel@example.com',
        phone: '9000012345',
        subject: 'Branded Keychains for All Rooms',
        category: 'Bulk Order',
        message: 'Looking for 250 high-quality keychains with our room numbers. Needs to be durable.',
        priority: 'High',
        status: 'new',
      },
      {
        name: 'Creative Agency X',
        email: 'agency@example.com',
        phone: '9111122222',
        subject: 'API for Custom Orders?',
        category: 'Partnership',
        message: 'Do you offer an API for third-party design tools to push orders directly into your system?',
        priority: 'Normal',
        status: 'read',
        adminNote: 'Need to discuss with lead dev.',
      },
      {
        name: 'Amit Kumar',
        email: 'amit@example.com',
        phone: '9222233333',
        subject: 'Mug Arrived Damp?',
        category: 'Other',
        message: 'The packaging for my mug was excellent but the interior was damp. No damage, just curious.',
        priority: 'Normal',
        status: 'replied',
        adminNote: 'Explained it is condensation from heat-press cooling.',
        repliedAt: new Date(Date.now() - 3600000),
      },
      {
        name: 'Modern Art Gallery',
        email: 'art@example.com',
        phone: '9333344444',
        subject: 'Canvas Prints for Exhibition',
        category: 'Design Help',
        message: 'We have 15 large scale digital paintings we need printed on premium canvas. Can we visit your facility?',
        priority: 'High',
        status: 'new',
        assignedTo: admin?._id,
      },
      {
        name: 'Priya Verma',
        email: 'priya@example.com',
        phone: '9444455555',
        subject: 'Wrong Item in Checkout',
        category: 'Other',
        message: 'I keep adding a blue pillow but the cart shows red. Help!',
        priority: 'High',
        status: 'replied',
        adminNote: 'UI bug fixed for her specific variant.',
        repliedAt: new Date(Date.now() - 7200000),
      },
      {
        name: 'Eco-Friendly NGO',
        email: 'eco@example.com',
        phone: '9555566666',
        subject: 'Recycled Paper Options?',
        category: 'Feedback',
        message: 'Do you plan to introduce recycled cardstocks for your greeting cards?',
        priority: 'Normal',
        status: 'closed',
        adminNote: 'Sent them our future eco-roadmap.',
      }
    ];

    await ContactSubmission.insertMany(contacts);
    console.log(`Successfully added ${contacts.length} advanced contact submissions.`);

    await mongoose.connection.close();
    console.log('Connection closed.');
  } catch (error) {
    console.error('Error seeding contacts:', error);
    process.exit(1);
  }
};

seedAdvancedContacts();
