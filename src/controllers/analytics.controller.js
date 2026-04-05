const Cart = require('../models/Cart.model');
const Order = require('../models/Order.model');
const User = require('../models/User.model');
const Product = require('../models/Product.model');
const Coupon = require('../models/Coupon.model');
const Review = require('../models/Review.model');
const { successResponse, errorResponse } = require('../utils/response.utils');

// ─── Admin: Cart Analytics ─────────────────────────────
exports.cartAnalytics = async (req, res) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [
      totalCartsWithItems,
      abandondedCarts,
      cartsWithCoupon,
      topCartedProducts,
      avgCartValue,
    ] = await Promise.all([
      // Active carts with at least 1 item
      Cart.countDocuments({ 'items.0': { $exists: true } }),

      // Carts not converted to orders and older than 24h (abandoned)
      Cart.aggregate([
        {
          $match: {
            'items.0': { $exists: true },
            updatedAt: { $lt: new Date(now - 24 * 60 * 60 * 1000) },
          },
        },
        {
          $lookup: {
            from: 'orders',
            localField: 'user',
            foreignField: 'user',
            as: 'orders',
          },
        },
        {
          $match: { 'orders.0': { $exists: false } }, // no orders from this user
        },
        { $count: 'total' },
      ]),

      // Carts that have a coupon applied
      Cart.countDocuments({ 'appliedCoupon.code': { $ne: null } }),

      // Most carted products (top 10)
      Cart.aggregate([
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.product',
            timesAdded: { $sum: 1 },
            totalQuantity: { $sum: '$items.quantity' },
          },
        },
        { $sort: { timesAdded: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'product',
          },
        },
        { $unwind: '$product' },
        {
          $project: {
            _id: 1,
            timesAdded: 1,
            totalQuantity: 1,
            name: '$product.name',
            slug: '$product.slug',
            thumbnailImage: '$product.thumbnailImage',
          },
        },
      ]),

      // Average cart value
      Cart.aggregate([
        { $match: { 'items.0': { $exists: true } } },
        {
          $project: {
            subtotal: {
              $sum: {
                $map: {
                  input: '$items',
                  as: 'item',
                  in: { $multiply: ['$$item.unitPrice', '$$item.quantity'] },
                },
              },
            },
          },
        },
        { $group: { _id: null, avgValue: { $avg: '$subtotal' } } },
      ]),
    ]);

    return successResponse(res, 200, 'Cart analytics', {
      totalCartsWithItems,
      abandondedCarts: abandondedCarts[0]?.total || 0,
      cartsWithCoupon,
      avgCartValue: Math.round((avgCartValue[0]?.avgValue || 0) * 100) / 100,
      topCartedProducts,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Admin: Full Sales Report ──────────────────────────
exports.salesReport = async (req, res) => {
  try {
    const { period = '30' } = req.query; // days
    const from = new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000);

    const [
      revenueByDay,
      ordersByStatus,
      topSellingProducts,
      topCategories,
      paymentMethodBreakdown,
      couponUsageStats,
      avgOrderValue,
    ] = await Promise.all([
      // Revenue by day (last N days)
      Order.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: from } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            revenue: { $sum: '$totalAmount' },
            orders: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Orders by status
      Order.aggregate([
        { $match: { createdAt: { $gte: from } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Top selling products by revenue
      Order.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: from } } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.product',
            totalSold: { $sum: '$items.quantity' },
            totalRevenue: { $sum: '$items.lineTotal' },
            productName: { $first: '$items.productSnapshot.name' },
          },
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: 10 },
      ]),

      // Top categories by order count
      Order.aggregate([
        { $unwind: '$items' },
        {
          $lookup: {
            from: 'products',
            localField: 'items.product',
            foreignField: '_id',
            as: 'productInfo',
          },
        },
        { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: '$productInfo.category',
            orderCount: { $sum: 1 },
            revenue: { $sum: '$items.lineTotal' },
          },
        },
        { $sort: { orderCount: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'categories',
            localField: '_id',
            foreignField: '_id',
            as: 'category',
          },
        },
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 1, orderCount: 1, revenue: 1, categoryName: '$category.name' } },
      ]),

      // Payment method breakdown
      Order.aggregate([
        { $match: { createdAt: { $gte: from } } },
        {
          $group: {
            _id: '$paymentMethod',
            count: { $sum: 1 },
            revenue: { $sum: '$totalAmount' },
          },
        },
        { $sort: { count: -1 } },
      ]),

      // Coupon usage
      Coupon.find({ usageCount: { $gt: 0 } })
        .sort({ usageCount: -1 })
        .limit(10)
        .select('code discountType discountValue usageCount'),

      // Average order value
      Order.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: from } } },
        { $group: { _id: null, avg: { $avg: '$totalAmount' }, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      ]),
    ]);

    return successResponse(res, 200, `Sales report for last ${period} days`, {
      period: `${period} days`,
      summary: {
        totalRevenue: Math.round((avgOrderValue[0]?.total || 0) * 100) / 100,
        totalOrders: avgOrderValue[0]?.count || 0,
        avgOrderValue: Math.round((avgOrderValue[0]?.avg || 0) * 100) / 100,
      },
      revenueByDay,
      ordersByStatus,
      topSellingProducts,
      topCategories,
      paymentMethodBreakdown,
      topCoupons: couponUsageStats,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Admin: Customer Analytics ─────────────────────────
exports.customerAnalytics = async (req, res) => {
  try {
    const [
      totalCustomers,
      verifiedCustomers,
      repeatCustomers,
      newCustomersThisMonth,
      topCustomers,
    ] = await Promise.all([
      User.countDocuments({ role: 'client' }),
      User.countDocuments({ role: 'client', isEmailVerified: true }),

      // Repeat customers (placed more than 1 order)
      Order.aggregate([
        { $group: { _id: '$user', orderCount: { $sum: 1 } } },
        { $match: { orderCount: { $gt: 1 } } },
        { $count: 'total' },
      ]),

      User.countDocuments({
        role: 'client',
        createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      }),

      // Top customers by spend
      Order.aggregate([
        { $match: { paymentStatus: 'paid' } },
        {
          $group: {
            _id: '$user',
            totalSpend: { $sum: '$totalAmount' },
            orderCount: { $sum: 1 },
          },
        },
        { $sort: { totalSpend: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user',
          },
        },
        { $unwind: '$user' },
        {
          $project: {
            _id: 1,
            totalSpend: 1,
            orderCount: 1,
            name: '$user.name',
            email: '$user.email',
            phone: '$user.phone',
          },
        },
      ]),
    ]);

    return successResponse(res, 200, 'Customer analytics', {
      totalCustomers,
      verifiedCustomers,
      unverifiedCustomers: totalCustomers - verifiedCustomers,
      repeatCustomers: repeatCustomers[0]?.total || 0,
      newCustomersThisMonth,
      topCustomers,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Admin: Review Analytics ────────────────────────────
exports.reviewAnalytics = async (req, res) => {
  try {
    const [totalReviews, ratingBreakdown, pendingApproval, verifiedPurchaseReviews] = await Promise.all([
      Review.countDocuments(),
      Review.aggregate([
        { $group: { _id: '$rating', count: { $sum: 1 } } },
        { $sort: { _id: -1 } },
      ]),
      Review.countDocuments({ isApproved: false }),
      Review.countDocuments({ isVerifiedPurchase: true }),
    ]);

    return successResponse(res, 200, 'Review analytics', {
      totalReviews,
      pendingApproval,
      verifiedPurchaseReviews,
      ratingBreakdown,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};
