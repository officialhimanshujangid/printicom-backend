require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const connectDB = require('./config/db');
const { errorHandler, notFound } = require('./middleware/error.middleware');

// ─── Route imports ─────────────────────────────────────────
const authRoutes = require('./routes/auth.routes');
const categoryRoutes = require('./routes/category.routes');
const productRoutes = require('./routes/product.routes');
const adminRoutes = require('./routes/admin.routes');
const addressRoutes = require('./routes/address.routes');
const cartRoutes = require('./routes/cart.routes');
const orderRoutes = require('./routes/order.routes');
const couponRoutes = require('./routes/coupon.routes');
const reviewRoutes = require('./routes/review.routes');
const wishlistRoutes = require('./routes/wishlist.routes');
const bannerRoutes = require('./routes/banner.routes');
const settingsRoutes = require('./routes/settings.routes');
const notificationRoutes = require('./routes/notification.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const relatedToRoutes = require('./routes/relatedTo.routes');
const revenueRoutes = require('./routes/revenue.routes');
const legalPageRoutes = require('./routes/legalPage.routes');
const faqRoutes = require('./routes/faq.routes');
const contactRoutes = require('./routes/contact.routes');
const ticketRoutes = require('./routes/ticket.routes');
const auditLogRoutes = require('./routes/auditLog.routes');
const bulkOrderRoutes = require('./routes/bulkOrder.routes');

connectDB();

const app = express();

// ─── Rate Limiters ──────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts. Try again in 15 minutes.' },
});

// ─── Security & Core Middleware ─────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
// app.use(cors({
//   origin: (origin, callback) => {
//     const allowed = [
//       process.env.CLIENT_URL || 'http://localhost:3000',
//       process.env.CLIENT_URL || 'http://localhost:4000',
//       process.env.ADMIN_URL || 'http://localhost:4000',
//       process.env.ADMIN_URL || 'http://localhost:5173',
//       process.env.ADMIN_URL || 'http://localhost:5174',
//     ];
//     if (!origin || allowed.includes(origin)) return callback(null, true);
//     return callback(new Error('CORS: origin not allowed'));
//   },
//   credentials: true,
//   methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization'],
// }));
app.use(cors());
app.use(globalLimiter);
app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Static Files ───────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ─── Maintenance Mode Guard ─────────────────────────────────
app.use(async (req, res, next) => {
  // Skip health check and admin routes
  if (req.path === '/api/health' || req.path.startsWith('/api/admin') || req.path.startsWith('/api/settings')) {
    return next();
  }
  try {
    const SiteSettings = require('./models/SiteSettings.model');
    const settings = await SiteSettings.findOne().select('maintenanceMode').lean();
    if (settings?.maintenanceMode?.enabled) {
      return res.status(503).json({
        success: false,
        message: settings.maintenanceMode.message || 'Site is under maintenance. Back soon!',
        maintenanceMode: true,
      });
    }
  } catch (_) { /* continue if settings not found */ }
  next();
});

// ─── Health Check ───────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: '🖨️ Printicom API is running',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    version: '2.1.0',
    modules: [
      'Auth & Email Verification',
      'Products & Categories',
      'Related To (Occasion Tags + Per-Occasion Images)',
      'Cart + Coupon Engine',
      'Orders (Zoomin-style flow)',
      'Razorpay Payment + Verification',
      'Order Tracking',
      'Reviews & Ratings',
      'Wishlist',
      'Saved Addresses',
      'Banner / Advertisement Management',
      'Site Settings (Payments, Shipping, Tax, SEO)',
      'Notifications & Broadcasts',
      'Analytics (Sales, Cart, Customer, Reviews)',
      'Admin Dashboard (Client Detail: Orders + Wishlist)',
    ],
  });
});

// ─── API Routes ─────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/related-to', relatedToRoutes);
app.use('/api/revenue', revenueRoutes);
app.use('/api/legal', legalPageRoutes);
app.use('/api/faqs', faqRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/bulk-orders', bulkOrderRoutes);

// ─── Error Handlers ─────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
