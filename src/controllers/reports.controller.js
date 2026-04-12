/**
 * Reports Controller — Printicom Admin
 * Covers: Orders · GST/Tax · Product Performance · Customers · Stock · Coupons
 * All endpoints support: ?from=YYYY-MM-DD&to=YYYY-MM-DD&status=&paymentMethod=&category=
 */

const Order    = require('../models/Order.model');
const Product  = require('../models/Product.model');
const User     = require('../models/User.model');
const Coupon   = require('../models/Coupon.model');
const Category = require('../models/Category.model');
const { successResponse, errorResponse } = require('../utils/response.utils');

// ─── helpers ──────────────────────────────────────────────────────────
const round2 = (n) => Math.round((n || 0) * 100) / 100;

const parseRange = (from, to) => {
  const getIstBound = (dateStr, isEnd) => {
    const [y, m, d] = dateStr.split('-');
    const utcDate = new Date(Date.UTC(y, m - 1, d));
    const istMidnightUtc = new Date(utcDate.getTime() - (5 * 60 * 60 * 1000 + 30 * 60 * 1000));
    return isEnd ? new Date(istMidnightUtc.getTime() + (24 * 60 * 60 * 1000 - 1)) : istMidnightUtc;
  };

  const getIstDateStr = (d) => {
    const dIst = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    return `${dIst.getFullYear()}-${String(dIst.getMonth() + 1).padStart(2, '0')}-${String(dIst.getDate()).padStart(2, '0')}`;
  };

  const fromStr = from ? from : getIstDateStr(new Date(Date.now() - 30 * 86400000));
  const toStr   = to ? to : getIstDateStr(new Date());

  return { start: getIstBound(fromStr, false), end: getIstBound(toStr, true) };
};

// ─────────────────────────────────────────────────────────────────────
// 1. ORDER REPORT
// GET /api/reports/orders?from=&to=&status=&paymentMethod=&page=&limit=
// ─────────────────────────────────────────────────────────────────────
exports.orderReport = async (req, res) => {
  try {
    const { from, to, status, paymentMethod, page = 1, limit = 50 } = req.query;
    const { start, end } = parseRange(from, to);

    const match = { createdAt: { $gte: start, $lte: end } };
    if (status)        match.status        = status;
    if (paymentMethod) match.paymentMethod = paymentMethod;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [orders, total, summary] = await Promise.all([
      Order.find(match)
        .populate('user', 'name email phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Order.countDocuments(match),
      Order.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalRevenue:    { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$totalAmount', 0] } },
            totalGst:        { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$gstTotal', 0] } },
            totalShipping:   { $sum: '$shippingCharge' },
            totalDiscount:   { $sum: '$couponDiscount' },
            totalOrders:     { $sum: 1 },
            paidOrders:      { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] } },
            pendingOrders:   { $sum: { $cond: [{ $eq: ['$paymentStatus', 'pending'] }, 1, 0] } },
            cancelledOrders: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
            avgOrderValue:   { $avg: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$totalAmount', null] } },
          },
        },
      ]),
      // status breakdown
      Order.aggregate([
        { $match: match },
        { $group: { _id: '$status', count: { $sum: 1 }, revenue: { $sum: '$totalAmount' } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    // daily trend within range
    const dailyTrend = await Order.aggregate([
      { $match: { ...match, paymentStatus: 'paid' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } },
          revenue: { $sum: '$totalAmount' },
          orders:  { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { date: '$_id', revenue: { $round: ['$revenue', 2] }, orders: 1, _id: 0 } },
    ]);

    const s = summary[0] || {};
    return successResponse(res, 200, 'Order report', {
      summary: {
        totalOrders:     s.totalOrders     || 0,
        paidOrders:      s.paidOrders      || 0,
        pendingOrders:   s.pendingOrders   || 0,
        cancelledOrders: s.cancelledOrders || 0,
        totalRevenue:    round2(s.totalRevenue),
        totalGst:        round2(s.totalGst),
        totalShipping:   round2(s.totalShipping),
        totalDiscount:   round2(s.totalDiscount),
        avgOrderValue:   round2(s.avgOrderValue),
      },
      dailyTrend,
      orders,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─────────────────────────────────────────────────────────────────────
// 2. GST / TAX REPORT
// GET /api/reports/gst?from=&to=
// ─────────────────────────────────────────────────────────────────────
exports.gstReport = async (req, res) => {
  try {
    const { from, to } = req.query;
    const { start, end } = parseRange(from, to);

    const match = { paymentStatus: { $in: ['paid', 'refunded'] }, createdAt: { $gte: start, $lte: end } };

    const [summary, byProduct, monthlyGst] = await Promise.all([
      // Overall GST summary accounting for refunds
      Order.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            grossGst:      { $sum: '$gstTotal' },
            refundedGst:   { $sum: { $cond: [{ $eq: ['$paymentStatus', 'refunded'] }, '$gstTotal', 0] } },
            grossRevenue:  { $sum: '$totalAmount' },
            refundedRev:   { $sum: { $cond: [{ $eq: ['$paymentStatus', 'refunded'] }, '$totalAmount', 0] } },
            totalOrders:   { $sum: 1 },
            refundedCount: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'refunded'] }, 1, 0] } },
          },
        },
      ]),
      // GST breakdown per product, net of refunds
      Order.aggregate([
        { $match: match },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.product',
            productName:  { $first: '$items.productSnapshot.name' },
            grossUnits:   { $sum: '$items.quantity' },
            refundUnits:  { $sum: { $cond: [{ $eq: ['$paymentStatus', 'refunded'] }, '$items.quantity', 0] } },
            grossRev:     { $sum: { $multiply: ['$items.baseUnitPrice', '$items.quantity'] } },
            refundRev:    { $sum: { $cond: [{ $eq: ['$paymentStatus', 'refunded'] }, { $multiply: ['$items.baseUnitPrice', '$items.quantity'] }, 0] } },
            grossGst:     { $sum: '$items.gstAmount' },
            refundGst:    { $sum: { $cond: [{ $eq: ['$paymentStatus', 'refunded'] }, '$items.gstAmount', 0] } },
            grossTotal:   { $sum: '$items.lineTotal' },
            refundTotal:  { $sum: { $cond: [{ $eq: ['$paymentStatus', 'refunded'] }, '$items.lineTotal', 0] } },
            gstRate:      { $first: '$items.gstRate' },
            orderCount:   { $sum: 1 },
          },
        },
        { $sort: { grossGst: -1 } },
        { $limit: 50 },
        {
          $project: {
            productId:    '$_id',
            productName:  1,
            unitsSold:    { $subtract: ['$grossUnits', '$refundUnits'] },
            baseRevenue:  { $round: [{ $subtract: ['$grossRev', '$refundRev'] }, 2] },
            gstCollected: { $round: [{ $subtract: ['$grossGst', '$refundGst'] }, 2] },
            gstRate:      1,
            lineTotal:    { $round: [{ $subtract: ['$grossTotal', '$refundTotal'] }, 2] },
            orderCount:   1,
            _id: 0,
          },
        },
      ]),
      // Monthly GST trend (Net)
      Order.aggregate([
        { $match: match },
        {
          $group: {
            _id:         { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'Asia/Kolkata' } },
            grossGst:    { $sum: '$gstTotal' },
            refundGst:   { $sum: { $cond: [{ $eq: ['$paymentStatus', 'refunded'] }, '$gstTotal', 0] } },
            grossRev:    { $sum: '$totalAmount' },
            refundRev:   { $sum: { $cond: [{ $eq: ['$paymentStatus', 'refunded'] }, '$totalAmount', 0] } },
            orderCount:  { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { 
          $project: { 
            month: '$_id', 
            gstTotal: { $round: [{ $subtract: ['$grossGst', '$refundGst'] }, 2] }, 
            revenue: { $round: [{ $subtract: ['$grossRev', '$refundRev'] }, 2] }, 
            orderCount: 1, 
            _id: 0 
          } 
        },
      ]),
    ]);

    const s = summary[0] || {};
    const netGst = (s.grossGst || 0) - (s.refundedGst || 0);
    const netRevenue = (s.grossRevenue || 0) - (s.refundedRev || 0);

    const effectiveGstRate = netRevenue > 0
      ? round2((netGst / netRevenue) * 100)
      : 0;

    return successResponse(res, 200, 'GST/Tax report', {
      summary: {
        totalGstCollected: round2(netGst),
        grossGst:          round2(s.grossGst),
        refundedGst:       round2(s.refundedGst),
        totalRevenue:      round2(netRevenue),
        totalOrders:       s.totalOrders || 0,
        refundedCount:     s.refundedCount || 0,
        effectiveGstRate:  `${effectiveGstRate}%`,
      },
      byProduct,
      monthlyGst,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─────────────────────────────────────────────────────────────────────
// 3. PRODUCT PERFORMANCE REPORT
// GET /api/reports/products?from=&to=&category=&limit=
// ─────────────────────────────────────────────────────────────────────
exports.productReport = async (req, res) => {
  try {
    const { from, to, category, limit = 50 } = req.query;
    const { start, end } = parseRange(from, to);

    const orderMatch = { paymentStatus: 'paid', createdAt: { $gte: start, $lte: end } };

    // Top products by revenue + units sold
    const topProducts = await Order.aggregate([
      { $match: orderMatch },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.product',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      ...(category ? [{ $match: { 'product.category': new (require('mongoose').Types.ObjectId)(category) } }] : []),
      {
        $group: {
          _id:           '$items.product',
          productName:   { $first: '$items.productSnapshot.name' },
          thumbnail:     { $first: '$items.productSnapshot.thumbnailImage' },
          productType:   { $first: '$items.productSnapshot.productType' },
          categoryId:    { $first: '$product.category' },
          unitsSold:     { $sum: '$items.quantity' },
          revenue:       { $sum: '$items.lineTotal' },
          gstCollected:  { $sum: '$items.gstAmount' },
          orderCount:    { $sum: 1 },
          avgUnitPrice:  { $avg: '$items.unitPrice' },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'categories',
          localField: 'categoryId',
          foreignField: '_id',
          as: 'category',
        },
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          productId:    '$_id',
          productName:  1,
          thumbnail:    1,
          productType:  1,
          categoryName: { $ifNull: ['$category.name', 'Uncategorized'] },
          unitsSold:    1,
          revenue:      { $round: ['$revenue', 2] },
          gstCollected: { $round: ['$gstCollected', 2] },
          orderCount:   1,
          avgUnitPrice: { $round: ['$avgUnitPrice', 2] },
          _id: 0,
        },
      },
    ]);

    // 0-revenue products (never sold) from Product collection
    const soldProductIds = topProducts.map(p => p.productId);
    const zeroSalesProducts = await Product.find({
      _id: { $nin: soldProductIds },
      isActive: true,
    })
      .select('name thumbnailImage productType category stock')
      .populate('category', 'name')
      .limit(20)
      .lean();

    // Category performance
    const byCategory = await Order.aggregate([
      { $match: orderMatch },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.product',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id:         '$product.category',
          revenue:     { $sum: '$items.lineTotal' },
          unitsSold:   { $sum: '$items.quantity' },
          orderCount:  { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'cat',
        },
      },
      { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          categoryName: { $ifNull: ['$cat.name', 'Unknown'] },
          revenue: { $round: ['$revenue', 2] },
          unitsSold: 1,
          orderCount: 1,
          _id: 0,
        },
      },
    ]);

    return successResponse(res, 200, 'Product performance report', {
      topProducts: topProducts.map((p, i) => ({ rank: i + 1, ...p })),
      byCategory,
      zeroSalesProducts: zeroSalesProducts.map(p => ({
        productId:    p._id,
        productName:  p.name,
        thumbnail:    p.thumbnailImage,
        productType:  p.productType,
        categoryName: p.category?.name || 'Uncategorized',
        stock:        p.stock,
      })),
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─────────────────────────────────────────────────────────────────────
// 4. CUSTOMER REPORT
// GET /api/reports/customers?from=&to=&page=&limit=
// ─────────────────────────────────────────────────────────────────────
exports.customerReport = async (req, res) => {
  try {
    const { from, to, page = 1, limit = 50 } = req.query;
    const { start, end } = parseRange(from, to);

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [totalUsers, newUsers, topBuyers, registrationTrend, repeatCustomers] = await Promise.all([
      User.countDocuments({ role: 'client' }),
      User.countDocuments({ role: 'client', createdAt: { $gte: start, $lte: end } }),
      // Top buyers in range
      Order.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id:          '$user',
            totalSpent:   { $sum: '$totalAmount' },
            orderCount:   { $sum: 1 },
            avgOrderVal:  { $avg: '$totalAmount' },
            lastOrderAt:  { $max: '$createdAt' },
          },
        },
        { $sort: { totalSpent: -1 } },
        { $skip: skip },
        { $limit: parseInt(limit) },
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
            userId:      '$_id',
            name:        '$user.name',
            email:       '$user.email',
            phone:       '$user.phone',
            joinedAt:    '$user.createdAt',
            totalSpent:  { $round: ['$totalSpent', 2] },
            orderCount:  1,
            avgOrderVal: { $round: ['$avgOrderVal', 2] },
            lastOrderAt: 1,
            _id: 0,
          },
        },
      ]),
      // Daily new registrations
      User.aggregate([
        { $match: { role: 'client', createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id:   { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { date: '$_id', count: 1, _id: 0 } },
      ]),
      // Repeat customer count
      Order.aggregate([
        { $match: { paymentStatus: 'paid' } },
        { $group: { _id: '$user', orderCount: { $sum: 1 } } },
        { $group: { _id: null, repeatCustomers: { $sum: { $cond: [{ $gt: ['$orderCount', 1] }, 1, 0] } }, oneTimeCustomers: { $sum: { $cond: [{ $eq: ['$orderCount', 1] }, 1, 0] } } } },
      ]),
    ]);

    const totalBuyers = await Order.distinct('user', { paymentStatus: 'paid', createdAt: { $gte: start, $lte: end } });

    return successResponse(res, 200, 'Customer report', {
      summary: {
        totalUsers,
        newUsersInRange:  newUsers,
        activeBuyers:     totalBuyers.length,
        repeatCustomers:  repeatCustomers[0]?.repeatCustomers || 0,
        oneTimeCustomers: repeatCustomers[0]?.oneTimeCustomers || 0,
      },
      topBuyers,
      registrationTrend,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─────────────────────────────────────────────────────────────────────
// 5. STOCK REPORT
// GET /api/reports/stock?category=&lowStockThreshold=
// ─────────────────────────────────────────────────────────────────────
exports.stockReport = async (req, res) => {
  try {
    const { category, lowStockThreshold = 10 } = req.query;
    const threshold = parseInt(lowStockThreshold);

    const productFilter = { isActive: true };
    if (category) productFilter.category = category;

    const [allProducts, lowStock, outOfStock, stockByCategory] = await Promise.all([
      Product.find(productFilter)
        .select('name thumbnailImage category stock productType isActive')
        .populate('category', 'name')
        .sort({ stock: 1 })
        .lean(),
      Product.countDocuments({ ...productFilter, stock: { $gt: 0, $lte: threshold } }),
      Product.countDocuments({ ...productFilter, stock: { $lte: 0 } }),
      Product.aggregate([
        { $match: productFilter },
        {
          $group: {
            _id:          '$category',
            totalProducts: { $sum: 1 },
            totalStock:    { $sum: '$stock' },
            lowStock:      { $sum: { $cond: [{ $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', threshold] }] }, 1, 0] } },
            outOfStock:    { $sum: { $cond: [{ $lte: ['$stock', 0] }, 1, 0] } },
            inventoryValue: { $sum: { $multiply: ['$stock', { $ifNull: ['$salePrice', '$price'] }] } },
          },
        },
        {
          $lookup: {
            from: 'categories',
            localField: '_id',
            foreignField: '_id',
            as: 'cat',
          },
        },
        { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            categoryName:   { $ifNull: ['$cat.name', 'Uncategorized'] },
            totalProducts:  1,
            totalStock:     1,
            lowStock:       1,
            outOfStock:     1,
            inventoryValue: { $round: ['$inventoryValue', 2] },
            _id: 0,
          },
        },
        { $sort: { outOfStock: -1 } },
      ]),
    ]);

    const totalInventoryValue = allProducts.reduce((sum, p) => {
      return sum + ((p.stock || 0) * (p.salePrice || p.price || 0));
    }, 0);

    return successResponse(res, 200, 'Stock report', {
      summary: {
        totalProducts:    allProducts.length,
        lowStockCount:    lowStock,
        outOfStockCount:  outOfStock,
        inStockCount:     allProducts.length - lowStock - outOfStock,
        totalInventoryValue: round2(totalInventoryValue),
        threshold,
      },
      products: allProducts.map(p => ({
        productId:    p._id,
        productName:  p.name,
        thumbnail:    p.thumbnailImage,
        categoryName: p.category?.name || 'Uncategorized',
        productType:  p.productType,
        stock:        p.stock || 0,
        status:       p.stock <= 0 ? 'Out of Stock' : p.stock <= threshold ? 'Low Stock' : 'In Stock',
      })),
      byCategory: stockByCategory,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─────────────────────────────────────────────────────────────────────
// 6. COUPON REPORT
// GET /api/reports/coupons?from=&to=
// ─────────────────────────────────────────────────────────────────────
exports.couponReport = async (req, res) => {
  try {
    const { from, to } = req.query;
    const { start, end } = parseRange(from, to);

    const match = { paymentStatus: 'paid', createdAt: { $gte: start, $lte: end }, 'coupon.code': { $ne: null } };

    const [couponsUsed, summary, topCoupons, allCoupons] = await Promise.all([
      // Per-coupon performance from orders
      Order.aggregate([
        { $match: match },
        {
          $group: {
            _id:            '$coupon.code',
            usageCount:     { $sum: 1 },
            totalDiscount:  { $sum: '$couponDiscount' },
            totalRevenue:   { $sum: '$totalAmount' },
            avgOrderValue:  { $avg: '$totalAmount' },
          },
        },
        { $sort: { usageCount: -1 } },
        {
          $project: {
            couponCode:    '$_id',
            usageCount:    1,
            totalDiscount: { $round: ['$totalDiscount', 2] },
            totalRevenue:  { $round: ['$totalRevenue', 2] },
            avgOrderValue: { $round: ['$avgOrderValue', 2] },
            _id: 0,
          },
        },
      ]),
      // Overall summary
      Order.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id:             null,
            totalOrders:     { $sum: 1 },
            ordersWithCoupon: { $sum: { $cond: [{ $ne: ['$coupon.code', null] }, 1, 0] } },
            totalDiscount:   { $sum: '$couponDiscount' },
            totalRevenue:    { $sum: '$totalAmount' },
          },
        },
      ]),
      // Top 5 coupon codes
      Order.aggregate([
        { $match: match },
        {
          $group: {
            _id:           '$coupon.code',
            usageCount:    { $sum: 1 },
            totalDiscount: { $sum: '$couponDiscount' },
          },
        },
        { $sort: { usageCount: -1 } },
        { $limit: 5 },
      ]),
      // All coupons with their status from Coupon collection
      Coupon.find({}).select('code discountType discountValue isActive usageCount usageLimit expiresAt').lean(),
    ]);

    const s = summary[0] || {};
    return successResponse(res, 200, 'Coupon report', {
      summary: {
        totalOrders:       s.totalOrders     || 0,
        ordersWithCoupon:  s.ordersWithCoupon || 0,
        couponUsageRate:   s.totalOrders > 0 ? round2((s.ordersWithCoupon / s.totalOrders) * 100) : 0,
        totalDiscountGiven: round2(s.totalDiscount),
        totalRevenue:      round2(s.totalRevenue),
      },
      couponsUsed,
      topCoupons,
      allCoupons: allCoupons.map(c => ({
        code:          c.code,
        type:          c.discountType,
        value:         c.discountValue,
        isActive:      c.isActive,
        usageCount:    c.usageCount,
        usageLimit:    c.usageLimit,
        expiresAt:     c.expiresAt,
        isExpired:     c.expiresAt ? new Date(c.expiresAt) < new Date() : false,
      })),
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─────────────────────────────────────────────────────────────────────
// 7. UPDATE REPORT VISIBILITY SETTINGS
// PUT /api/reports/settings
// ─────────────────────────────────────────────────────────────────────
exports.updateReportSettings = async (req, res) => {
  try {
    const SiteSettings = require('../models/SiteSettings.model');
    const { reports } = req.body;
    const settings = await SiteSettings.findOne();
    if (!settings) return errorResponse(res, 404, 'Settings not found');

    if (reports) {
      settings.set('reports', reports);
      settings.markModified('reports');
    }
    settings.updatedBy = req.user._id;
    await settings.save();

    const { logActivity } = require('./auditLog.controller');
    await logActivity(req.user._id, 'Settings Updated', 'Settings', settings._id, 'Updated Report visibility configuration', req.ip);

    return successResponse(res, 200, 'Report settings updated', { reports: settings.reports });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};
