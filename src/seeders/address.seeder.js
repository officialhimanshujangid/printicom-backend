require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User.model');
const Address = require('../models/Address.model');

const indianCities = [
  { city: 'Mumbai', state: 'Maharashtra', pincode: '400001' },
  { city: 'Delhi', state: 'Delhi', pincode: '110001' },
  { city: 'Bangalore', state: 'Karnataka', pincode: '560001' },
  { city: 'Hyderabad', state: 'Telangana', pincode: '500001' },
  { city: 'Ahmedabad', state: 'Gujarat', pincode: '380001' },
  { city: 'Pune', state: 'Maharashtra', pincode: '411001' },
  { city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' },
];

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('🔐 MongoDB Connected for Seeding...');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
};

const seedAddresses = async () => {
  await connectDB();

  try {
    const clients = await User.find({ role: 'client' });
    if (clients.length === 0) {
      console.log('⚠️ No clients found. Please create a user first.');
      process.exit();
    }

    console.log(`📦 Found ${clients.length} clients. Purging old addresses and cleanly seeding 2 realistic addresses per client...`);
    
    // Clear existing to avoid infinite bloating from multiple runs
    await Address.deleteMany({});

    for (const client of clients) {
      const city1 = indianCities[Math.floor(Math.random() * indianCities.length)];
      let city2 = indianCities[Math.floor(Math.random() * indianCities.length)];
      while (city1.city === city2.city) {
         city2 = indianCities[Math.floor(Math.random() * indianCities.length)];
      }

      const phoneToUse = client.phone && client.phone.length === 10 ? client.phone : '9876543210';

      const addressesToInsert = [
        {
          user: client._id,
          label: 'Home',
          fullName: client.name,
          phone: phoneToUse,
          street: 'Flat 402, Sunshine Apartments, MG Road Sector',
          landmark: 'Near Central Mall',
          city: city1.city,
          state: city1.state,
          pincode: city1.pincode,
          country: 'India',
          isDefault: true,
        },
        {
          user: client._id,
          label: 'Office',
          fullName: client.name,
          phone: phoneToUse,
          street: 'Cyber Hub Tech Park, Building B, 4th Floor Workspace',
          landmark: 'Opposite Metro Station',
          city: city2.city,
          state: city2.state,
          pincode: city2.pincode,
          country: 'India',
          isDefault: false,
        }
      ];

      await Address.insertMany(addressesToInsert);
    }

    console.log('✅ Successfully seeded 2 realistic addresses for EVERY client!');
    process.exit();
  } catch (error) {
    console.error('❌ Error seeding addresses:', error);
    process.exit(1);
  }
};

seedAddresses();
