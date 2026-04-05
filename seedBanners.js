const mongoose = require('mongoose');
const Banner = require('./src/models/Banner.model');
const User = require('./src/models/User.model');
require('dotenv').config();

const banners = [
  {
    title: 'Custom Photo Calendars 2025',
    subtitle: 'Start your year with beautiful memories.',
    imageUrl: 'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?q=80&w=2068&auto=format&fit=crop',
    ctaText: 'Design Now',
    ctaLink: '/products/custom-photo-calendar-2025',
    placement: 'hero_slider',
    sortOrder: 1,
    badgeText: 'NEW',
    isActive: true,
  },
  {
    title: 'Premium Photo Mugs',
    subtitle: 'The perfect gift for your loved ones.',
    imageUrl: 'https://images.unsplash.com/photo-1517256011271-101Ad9d63633?q=80&w=1974&auto=format&fit=crop',
    ctaText: 'Shop Mugs',
    ctaLink: '/products?search=mug',
    placement: 'hero_slider',
    sortOrder: 2,
    isActive: true,
  },
  {
    title: 'Wall Art & Canvas Prints',
    subtitle: 'High quality prints that last a lifetime.',
    imageUrl: 'https://images.unsplash.com/photo-1582555172866-f73bb12a2ab3?q=80&w=2080&auto=format&fit=crop',
    ctaText: 'Explore Art',
    ctaLink: '/products?search=canvas',
    placement: 'hero_slider',
    sortOrder: 3,
    isActive: true,
  },
  {
    title: 'Buy 2 Get 1 FREE on Polaroids',
    subtitle: 'Limited time offer on all mini prints!',
    imageUrl: 'https://images.unsplash.com/photo-1526045478516-99145907023c?q=80&w=2070&auto=format&fit=crop',
    ctaText: 'Grab Offer',
    ctaLink: '/products',
    placement: 'homepage_grid',
    badgeText: 'SALE',
    isActive: true,
  },
  {
    title: 'Custom Phone Cases',
    subtitle: 'Sleek designs with maximum protection.',
    imageUrl: 'https://images.unsplash.com/photo-1586105449897-20b5efeb3233?q=80&w=2070&auto=format&fit=crop',
    ctaText: 'Customize',
    ctaLink: '/products',
    placement: 'homepage_grid',
    isActive: true,
  }
];

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    let admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      console.log('No admin found, creating a system admin...');
      admin = await User.create({
        name: 'System Admin',
        email: 'admin@printicom.in',
        password: 'AdminPassword123!',
        role: 'admin',
        isEmailVerified: true,
      });
    }

    await Banner.deleteMany({});
    console.log('Cleared existing banners');

    const bannersToSave = banners.map(b => ({ ...b, createdBy: admin._id }));
    await Banner.insertMany(bannersToSave);
    console.log('Successfully seeded banners!');

    process.exit(0);
  } catch (err) {
    console.error('Error seeding banners:', err);
    process.exit(1);
  }
};

seed();
