/**
 * Customizable Products Seeder
 * Seeds 3 demo customizable products: Calendar, Mug, Photo Frame
 * Run: node src/seeders/customizable-products.seeder.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product.model');
const Category = require('../models/Category.model');
const User = require('../models/User.model');

const seedCustomizableProducts = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Get admin user
    const admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      console.error('❌ No admin user found. Run admin.seeder.js first.');
      process.exit(1);
    }

    // Find or create "Personalised Gifts" category
    let cat = await Category.findOne({ slug: 'personalised-gifts' });
    if (!cat) {
      cat = await Category.create({
        name: 'Personalised Gifts',
        slug: 'personalised-gifts',
        description: 'Custom printed gifts for every occasion',
        isActive: true,
        createdBy: admin._id,
      });
      console.log('✅ Created category: Personalised Gifts');
    }

    const products = [
      {
        name: 'Custom Photo Calendar 2025',
        shortDescription: 'Create a beautiful 12-month wall calendar with your cherished photos',
        description:
          'Design a personalised wall calendar with your favourite photos. Each month can feature a different image. Perfect for gifting to family and friends. Premium quality print on 300 GSM art paper.',
        productType: 'calendar',
        basePrice: 699,
        discountPrice: 549,
        stock: 200,
        lowStockThreshold: 20,
        deliveryDays: 7,
        isFeatured: true,
        isCustomizable: true,
        tags: ['calendar', 'custom', 'photo', 'gift', '2025'],
        customizationOptions: [
          { fieldId: 'cover-photo', label: 'Cover Photo', type: 'image_upload', isRequired: true, placeholder: 'Upload your favourite cover photo (best: portrait, 4:3 ratio)', sortOrder: 0 },
          { fieldId: 'january-image', label: 'January Image', type: 'image_upload', isRequired: true, placeholder: 'Photo for January page', sortOrder: 1 },
          { fieldId: 'february-image', label: 'February Image', type: 'image_upload', isRequired: true, placeholder: 'Photo for February page', sortOrder: 2 },
          { fieldId: 'march-image', label: 'March Image', type: 'image_upload', isRequired: true, placeholder: 'Photo for March page', sortOrder: 3 },
          { fieldId: 'april-image', label: 'April Image', type: 'image_upload', isRequired: true, placeholder: 'Photo for April page', sortOrder: 4 },
          { fieldId: 'may-image', label: 'May Image', type: 'image_upload', isRequired: true, placeholder: 'Photo for May page', sortOrder: 5 },
          { fieldId: 'june-image', label: 'June Image', type: 'image_upload', isRequired: true, placeholder: 'Photo for June page', sortOrder: 6 },
          { fieldId: 'july-image', label: 'July Image', type: 'image_upload', isRequired: true, placeholder: 'Photo for July page', sortOrder: 7 },
          { fieldId: 'august-image', label: 'August Image', type: 'image_upload', isRequired: true, placeholder: 'Photo for August page', sortOrder: 8 },
          { fieldId: 'september-image', label: 'September Image', type: 'image_upload', isRequired: false, placeholder: 'Photo for September (optional – we\'ll reuse a favourite if left blank)', sortOrder: 9 },
          { fieldId: 'october-image', label: 'October Image', type: 'image_upload', isRequired: false, placeholder: 'Photo for October (optional)', sortOrder: 10 },
          { fieldId: 'november-image', label: 'November Image', type: 'image_upload', isRequired: false, placeholder: 'Photo for November (optional)', sortOrder: 11 },
          { fieldId: 'december-image', label: 'December Image', type: 'image_upload', isRequired: false, placeholder: 'Photo for December (optional)', sortOrder: 12 },
          { fieldId: 'calendar-title', label: 'Calendar Title / Year Text', type: 'text_input', isRequired: false, placeholder: 'e.g. "Our Family 2025" or leave blank for default', maxLength: 50, sortOrder: 13 },
        ],
        category: cat._id,
        createdBy: admin._id,
      },
      {
        name: 'Personalised Photo Mug',
        shortDescription: 'Premium 11oz ceramic mug printed with your photo and message',
        description:
          'A perfect everyday companion — personalise this premium ceramic mug with a cherished photo and a heartfelt message. Dishwasher safe, food-grade ceramic. Available in 11oz and 15oz sizes.',
        productType: 'mug',
        basePrice: 349,
        discountPrice: 299,
        stock: 500,
        lowStockThreshold: 30,
        deliveryDays: 5,
        isFeatured: true,
        isCustomizable: true,
        tags: ['mug', 'custom', 'photo', 'gift', 'ceramic'],
        customizationOptions: [
          { fieldId: 'mug-photo', label: 'Your Photo', type: 'image_upload', isRequired: true, placeholder: 'Upload the photo to print on the mug (min. 500×500 px for best quality)', sortOrder: 0 },
          { fieldId: 'mug-name', label: 'Name / Caption', type: 'text_input', isRequired: false, placeholder: 'e.g. "Happy Birthday, Priya!" or just a name', maxLength: 40, sortOrder: 1 },
          { fieldId: 'mug-message', label: 'Personal Message', type: 'text_input', isRequired: false, placeholder: 'Short quote or message printed below the photo (optional)', maxLength: 120, sortOrder: 2 },
        ],
        category: cat._id,
        createdBy: admin._id,
      },
      {
        name: 'Custom Photo Frame (Collage)',
        shortDescription: 'Beautiful collage photo frame with up to 4 photos and a personal message',
        description:
          'Relive your favourite memories in one stunning collage frame. Upload up to 4 photos and add a personalised caption. Printed on high-quality canvas backing, ready to hang.',
        productType: 'frame',
        basePrice: 499,
        discountPrice: 399,
        stock: 150,
        lowStockThreshold: 15,
        deliveryDays: 6,
        isFeatured: false,
        isCustomizable: true,
        tags: ['frame', 'collage', 'photo', 'custom', 'wall-art'],
        customizationOptions: [
          { fieldId: 'photo-1', label: 'Photo 1 (Main)', type: 'image_upload', isRequired: true, placeholder: 'Upload the primary photo — this will be the largest in the collage', sortOrder: 0 },
          { fieldId: 'photo-2', label: 'Photo 2', type: 'image_upload', isRequired: true, placeholder: 'Upload second photo', sortOrder: 1 },
          { fieldId: 'photo-3', label: 'Photo 3', type: 'image_upload', isRequired: false, placeholder: 'Upload third photo (optional)', sortOrder: 2 },
          { fieldId: 'photo-4', label: 'Photo 4', type: 'image_upload', isRequired: false, placeholder: 'Upload fourth photo (optional)', sortOrder: 3 },
          { fieldId: 'frame-caption', label: 'Caption / Quote', type: 'text_input', isRequired: false, placeholder: 'e.g. "Forever in our hearts" or names + year', maxLength: 80, sortOrder: 4 },
          { fieldId: 'frame-names', label: 'Names to Print', type: 'text_input', isRequired: false, placeholder: 'e.g. "Arjun & Meera" (printed elegantly on the frame)', maxLength: 40, sortOrder: 5 },
        ],
        category: cat._id,
        createdBy: admin._id,
      },
    ];

    let created = 0;
    for (const p of products) {
      const existing = await Product.findOne({ name: p.name });
      if (existing) {
        console.log(`⚡ Skipped (already exists): ${p.name}`);
        continue;
      }
      await Product.create(p);
      console.log(`✅ Created: ${p.name}`);
      created++;
    }

    console.log(`\n🎉 Done! ${created} customizable product(s) seeded.`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeder Error:', error.message);
    process.exit(1);
  }
};

seedCustomizableProducts();
