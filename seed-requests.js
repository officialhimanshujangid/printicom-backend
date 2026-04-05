require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User.model');
const Order = require('./src/models/Order.model');
const Product = require('./src/models/Product.model');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/printicom';

const seedOrders = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const adminUser = await User.findOne({ role: 'admin' });
    const clientUser = await User.findOne({ role: 'client' });
    const product = await Product.findOne({});

    if (!adminUser || !clientUser || !product) {
       console.log('Need admin, client, and product to seed');
       process.exit(1);
    }

    // Create an order asking for cancellation
    const cancelOrder = await Order.create({
      orderNumber: `PTC-CANCEL-${Date.now().toString().slice(-4)}`,
      user: clientUser._id,
      items: [{
         product: product._id,
         productSnapshot: { name: product.name, productType: product.productType },
         quantity: 1,
         unitPrice: 500,
         lineTotal: 500,
         customization: {}
      }],
      subtotal: 500,
      totalAmount: 500,
      paymentMethod: 'razorpay',
      paymentStatus: 'paid',
      status: 'confirmed',
      cancellationRequest: {
         requested: true,
         reason: 'I changed my mind',
         status: 'pending'
      },
      statusHistory: [{ status: 'confirmed', note: 'Payment verified' }, { status: 'confirmed', note: 'Cancellation requested by customer', updatedBy: clientUser._id }]
    });

    // Create an order asking for return
    const returnOrder = await Order.create({
      orderNumber: `PTC-RETURN-${Date.now().toString().slice(-4)}`,
      user: clientUser._id,
      items: [{
         product: product._id,
         productSnapshot: { name: product.name, productType: product.productType },
         quantity: 2,
         unitPrice: 500,
         lineTotal: 1000,
         customization: {}
      }],
      subtotal: 1000,
      totalAmount: 1000,
      paymentMethod: 'razorpay',
      paymentStatus: 'paid',
      status: 'delivered',
      deliveredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      returnRequest: {
         requested: true,
         reason: 'Item was damaged during shipping',
         status: 'pending',
         refundStatus: 'pending'
      },
      statusHistory: [
         { status: 'confirmed', note: 'Payment verified' }, 
         { status: 'shipped', note: 'Shipped' }, 
         { status: 'delivered', note: 'Delivered' },
         { status: 'delivered', note: 'Return requested by customer', updatedBy: clientUser._id }
      ]
    });

    console.log('✅ Seeded Return/Cancel request orders successfully');
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

seedOrders();
