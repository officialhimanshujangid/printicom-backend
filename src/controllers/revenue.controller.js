/**
 * Revenue Analytics Controller
 * Covers all revenue perspectives:
 *  - Summary (all-time, this month, last month, growth %)
 *  - Daily / weekly / monthly trends
 *  - By category, by product type, by payment method
 *  - By Occasion (RelatedTo)
 *  - Top products by revenue
 *  - Top spending clients
 *  - Average Order Value (AOV) trend
 *  - Coupon impact on revenue
 *  - Refunds / cancellations impact
 *  - Monthly comparison (YoY / MoM)
 */

const Order = require('../models/Order.model');
const Product = require('../models/Product.model');
const Category = require('../models/Category.model');
const RelatedTo = require('../models/RelatedTo.model');
const User = require('../models/User.model');
const { successResponse, errorResponse } = require('../utils/response.utils');

// ─── helper: date ranges ──────────────────────────────────────────
const startOf = (unit) => {
  const d = new Date();
  if (unit === 'month') { d.setDate(1); d.setHours(0, 0, 0, 0); }
  if (unit === 'year')  { d.setMonth(0, 1); d.setHours(0, 0, 0, 0); }
  if (unit === 'week')  { d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0); }
  return d;
};
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const round2 = (n) => Math.round((n || 0) * 100) / 100;

// ─── GET /api/revenue/summary ──────────────────────────────────────
// All-time + period-based + calendar month comparisons + growth %
exports.revenueSummary = async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const now = new Date();
    const periodStart = daysAgo(parseInt(period));        // last N days
    const prevPeriodStart = daysAgo(parseInt(period) * 2); // preceding N days
    const prevPeriodEnd = periodStart;

    const thisMonthStart = startOf('month');
    const lastMonthStart = new Date(thisMonthStart);
    lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
    const lastMonthEnd = new Date(thisMonthStart);

    const [allTime, periodData, prevPeriodData, thisMonth, lastMonth, todayStats, weekStats, yearStats] = await Promise.all([
      // All-time paid revenue
      Order.aggregate([
        { $match: { paymentStatus: 'paid' } },
        { $group: { _id: null, revenue: { $sum: '$totalAmount' }, orders: { $sum: 1 }, avg: { $avg: '$totalAmount' } } },
      ]),
      // Selected period (last N days)
      Order.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: periodStart } } },
        { $group: { _id: null, revenue: { $sum: '$totalAmount' }, orders: { $sum: 1 }, avg: { $avg: '$totalAmount' } } },
      ]),
      // Preceding period (for growth comparison)
      Order.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: prevPeriodStart, $lt: prevPeriodEnd } } },
        { $group: { _id: null, revenue: { $sum: '$totalAmount' }, orders: { $sum: 1 } } },
      ]),
      // This calendar month
      Order.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: thisMonthStart } } },
        { $group: { _id: null, revenue: { $sum: '$totalAmount' }, orders: { $sum: 1 }, avg: { $avg: '$totalAmount' } } },
      ]),
      // Last calendar month
      Order.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: lastMonthStart, $lt: lastMonthEnd } } },
        { $group: { _id: null, revenue: { $sum: '$totalAmount' }, orders: { $sum: 1 }, avg: { $avg: '$totalAmount' } } },
      ]),
      // Today
      Order.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: daysAgo(1) } } },
        { $group: { _id: null, revenue: { $sum: '$totalAmount' }, orders: { $sum: 1 } } },
      ]),
      // This week
      Order.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: startOf('week') } } },
        { $group: { _id: null, revenue: { $sum: '$totalAmount' }, orders: { $sum: 1 } } },
      ]),
      // This year
      Order.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: startOf('year') } } },
        { $group: { _id: null, revenue: { $sum: '$totalAmount' }, orders: { $sum: 1 } } },
      ]),
    ]);

    const periodRev     = periodData[0]?.revenue || 0;
    const prevPeriodRev = prevPeriodData[0]?.revenue || 0;
    const growthPercent = prevPeriodRev === 0
      ? (periodRev > 0 ? 100 : 0)
      : round2(((periodRev - prevPeriodRev) / prevPeriodRev) * 100);

    const thisMonthRev = thisMonth[0]?.revenue || 0;
    const lastMonthRev = lastMonth[0]?.revenue || 0;
    const momGrowth = lastMonthRev === 0
      ? (thisMonthRev > 0 ? 100 : 0)
      : round2(((thisMonthRev - lastMonthRev) / lastMonthRev) * 100);

    return successResponse(res, 200, 'Revenue summary', {
      allTime: {
        revenue: round2(allTime[0]?.revenue),
        orders: allTime[0]?.orders || 0,
        avgOrderValue: round2(allTime[0]?.avg),
      },
      thisYear: {
        revenue: round2(yearStats[0]?.revenue),
        orders: yearStats[0]?.orders || 0,
      },
      // Period-based (respects 7D / 30D / 60D / 90D selector)
      thisPeriod: {
        revenue: round2(periodRev),
        orders: periodData[0]?.orders || 0,
        avgOrderValue: round2(periodData[0]?.avg),
        label: `Last ${period} days`,
      },
      prevPeriod: {
        revenue: round2(prevPeriodRev),
        orders: prevPeriodData[0]?.orders || 0,
        label: `Prev ${period} days`,
      },
      // Calendar month
      thisMonth: {
        revenue: round2(thisMonthRev),
        orders: thisMonth[0]?.orders || 0,
        avgOrderValue: round2(thisMonth[0]?.avg),
      },
      lastMonth: {
        revenue: round2(lastMonthRev),
        orders: lastMonth[0]?.orders || 0,
        avgOrderValue: round2(lastMonth[0]?.avg),
      },
      thisWeek: {
        revenue: round2(weekStats[0]?.revenue),
        orders: weekStats[0]?.orders || 0,
      },
      today: {
        revenue: round2(todayStats[0]?.revenue),
        orders: todayStats[0]?.orders || 0,
      },
      growth: {
        percent: growthPercent,
        isPositive: growthPercent >= 0,
        label: `${growthPercent >= 0 ? '+' : ''}${growthPercent}% vs prev ${period} days`,
        momPercent: momGrowth,
        momLabel: `${momGrowth >= 0 ? '+' : ''}${momGrowth}% vs last month`,
      },
      period: `${period} days`,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── GET /api/revenue/trend?period=30&groupBy=day ─────────────────
// Revenue trend chart data — daily / weekly / monthly
exports.revenueTrend = async (req, res) => {
  try {
    const { period = '30', groupBy = 'day' } = req.query;
    const from = daysAgo(parseInt(period));

    let dateFormat = '%Y-%m-%d';
    if (groupBy === 'week') dateFormat = '%Y-W%V';
    if (groupBy === 'month') dateFormat = '%Y-%m';

    const [trend, aovTrend] = await Promise.all([
      Order.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: from } } },
        {
          $group: {
            _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
            revenue: { $sum: '$totalAmount' },
            orders: { $sum: 1 },
            avgOrderValue: { $avg: '$totalAmount' },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { date: '$_id', revenue: 1, orders: 1, avgOrderValue: { $round: ['$avgOrderValue', 2] }, _id: 0 } },
      ]),

      // Compare: same period last period
      Order.aggregate([
        {
          $match: {
            paymentStatus: 'paid',
            createdAt: {
              $gte: new Date(from.getTime() - parseInt(period) * 86400000),
              $lt: from,
            },
          },
        },
        { $group: { _id: null, revenue: { $sum: '$totalAmount' }, orders: { $sum: 1 } } },
      ]),
    ]);

    const currentPeriodRevenue = trend.reduce((s, d) => s + d.revenue, 0);
    const prevPeriodRevenue = aovTrend[0]?.revenue || 0;
    const trendGrowth = prevPeriodRevenue === 0
      ? 100
      : round2(((currentPeriodRevenue - prevPeriodRevenue) / prevPeriodRevenue) * 100);

    return successResponse(res, 200, `Revenue trend (${period} days, by ${groupBy})`, {
      period: `${period} days`,
      groupBy,
      trend,
      periodSummary: {
        currentRevenue: round2(currentPeriodRevenue),
        prevRevenue: round2(prevPeriodRevenue),
        growthPercent: trendGrowth,
      },
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── GET /api/revenue/by-category ─────────────────────────────────
exports.revenueByCategory = async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const from = daysAgo(parseInt(period));

    const data = await Order.aggregate([
      { $match: { paymentStatus: 'paid', createdAt: { $gte: from } } },
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
          _id: '$product.category',
          revenue: { $sum: '$items.lineTotal' },
          unitsSold: { $sum: '$items.quantity' },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'category',
        },
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          revenue: { $round: ['$revenue', 2] },
          unitsSold: 1,
          orderCount: 1,
          categoryName: { $ifNull: ['$category.name', 'Unknown'] },
          categoryIcon: '$category.icon',
        },
      },
    ]);

    const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);
    const withPercent = data.map(d => ({
      ...d,
      percent: totalRevenue > 0 ? round2((d.revenue / totalRevenue) * 100) : 0,
    }));

    return successResponse(res, 200, 'Revenue by category', {
      period: `${period} days`,
      totalRevenue: round2(totalRevenue),
      categories: withPercent,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── GET /api/revenue/by-product-type ─────────────────────────────
exports.revenueByProductType = async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const from = daysAgo(parseInt(period));

    const data = await Order.aggregate([
      { $match: { paymentStatus: 'paid', createdAt: { $gte: from } } },
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
          _id: { $ifNull: ['$product.productType', 'unknown'] },
          revenue: { $sum: '$items.lineTotal' },
          unitsSold: { $sum: '$items.quantity' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
      { $project: { productType: '$_id', revenue: { $round: ['$revenue', 2] }, unitsSold: 1, orders: 1, _id: 0 } },
    ]);

    const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);
    return successResponse(res, 200, 'Revenue by product type', {
      period: `${period} days`,
      totalRevenue: round2(totalRevenue),
      productTypes: data.map(d => ({ ...d, percent: totalRevenue > 0 ? round2((d.revenue / totalRevenue) * 100) : 0 })),
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── GET /api/revenue/by-occasion ──────────────────────────────────
// Revenue attributed to RelatedTo (Occasion) tags
exports.revenueByOccasion = async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const from = daysAgo(parseInt(period));

    // Get all paid orders → expand items → lookup product → expand relatedTos
    const data = await Order.aggregate([
      { $match: { paymentStatus: 'paid', createdAt: { $gte: from } } },
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
      { $unwind: { path: '$product.relatedTos', preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: '$product.relatedTos.relatedTo',
          revenue: { $sum: '$items.lineTotal' },
          unitsSold: { $sum: '$items.quantity' },
          orders: { $addToSet: '$_id' },
        },
      },
      {
        $project: {
          revenue: { $round: ['$revenue', 2] },
          unitsSold: 1,
          orderCount: { $size: '$orders' },
        },
      },
      { $sort: { revenue: -1 } },
      {
        $lookup: {
          from: 'relatedtos',
          localField: '_id',
          foreignField: '_id',
          as: 'occasion',
        },
      },
      { $unwind: { path: '$occasion', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          revenue: 1,
          unitsSold: 1,
          orderCount: 1,
          occasionName: { $ifNull: ['$occasion.name', 'Unknown'] },
          occasionIcon: '$occasion.icon',
        },
      },
    ]);

    const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);
    return successResponse(res, 200, 'Revenue by occasion', {
      period: `${period} days`,
      totalRevenue: round2(totalRevenue),
      occasions: data.map(d => ({ ...d, percent: totalRevenue > 0 ? round2((d.revenue / totalRevenue) * 100) : 0 })),
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── GET /api/revenue/by-payment-method ────────────────────────────
exports.revenueByPaymentMethod = async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const from = daysAgo(parseInt(period));

    const data = await Order.aggregate([
      { $match: { createdAt: { $gte: from } } },
      {
        $group: {
          _id: '$paymentMethod',
          totalRevenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$totalAmount', 0] } },
          orders: { $sum: 1 },
          paidOrders: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] } },
          failedOrders: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'failed'] }, 1, 0] } },
          pendingOrders: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'pending'] }, 1, 0] } },
        },
      },
      { $sort: { totalRevenue: -1 } },
      {
        $project: {
          paymentMethod: '$_id',
          totalRevenue: { $round: ['$totalRevenue', 2] },
          orders: 1,
          paidOrders: 1,
          failedOrders: 1,
          pendingOrders: 1,
          successRate: {
            $round: [{ $multiply: [{ $divide: ['$paidOrders', '$orders'] }, 100] }, 1],
          },
          _id: 0,
        },
      },
    ]);

    const totalRevenue = data.reduce((s, d) => s + d.totalRevenue, 0);
    return successResponse(res, 200, 'Revenue by payment method', {
      period: `${period} days`,
      totalRevenue: round2(totalRevenue),
      methods: data.map(d => ({ ...d, percent: totalRevenue > 0 ? round2((d.totalRevenue / totalRevenue) * 100) : 0 })),
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── GET /api/revenue/top-products ─────────────────────────────────
exports.topRevenueProducts = async (req, res) => {
  try {
    const { period = '30', limit = 10 } = req.query;
    const from = daysAgo(parseInt(period));

    const products = await Order.aggregate([
      { $match: { paymentStatus: 'paid', createdAt: { $gte: from } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          revenue: { $sum: '$items.lineTotal' },
          unitsSold: { $sum: '$items.quantity' },
          orders: { $sum: 1 },
          productName: { $first: '$items.productSnapshot.name' },
          thumbnailImage: { $first: '$items.productSnapshot.thumbnailImage' },
          productType: { $first: '$items.productSnapshot.productType' },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: parseInt(limit) },
      {
        $project: {
          productId: '$_id',
          revenue: { $round: ['$revenue', 2] },
          unitsSold: 1,
          orders: 1,
          avgUnitPrice: { $round: [{ $divide: ['$revenue', '$unitsSold'] }, 2] },
          productName: 1,
          thumbnailImage: 1,
          productType: 1,
          _id: 0,
        },
      },
    ]);

    const totalRevenue = products.reduce((s, p) => s + p.revenue, 0);
    return successResponse(res, 200, 'Top revenue products', {
      period: `${period} days`,
      totalRevenue: round2(totalRevenue),
      products: products.map((p, i) => ({
        rank: i + 1,
        ...p,
        percent: totalRevenue > 0 ? round2((p.revenue / totalRevenue) * 100) : 0,
      })),
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── GET /api/revenue/top-clients ──────────────────────────────────
exports.topRevenueClients = async (req, res) => {
  try {
    const { period = '30', limit = 10 } = req.query;
    const from = daysAgo(parseInt(period));

    const clients = await Order.aggregate([
      { $match: { paymentStatus: 'paid', createdAt: { $gte: from } } },
      {
        $group: {
          _id: '$user',
          revenue: { $sum: '$totalAmount' },
          orders: { $sum: 1 },
          avgOrderValue: { $avg: '$totalAmount' },
          lastOrderAt: { $max: '$createdAt' },
        },
      },
      { $sort: { revenue: -1 } },
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
          userId: '$_id',
          revenue: { $round: ['$revenue', 2] },
          orders: 1,
          avgOrderValue: { $round: ['$avgOrderValue', 2] },
          lastOrderAt: 1,
          name: '$user.name',
          email: '$user.email',
          phone: '$user.phone',
          _id: 0,
        },
      },
    ]);

    const totalRevenue = clients.reduce((s, c) => s + c.revenue, 0);
    return successResponse(res, 200, 'Top revenue clients', {
      period: `${period} days`,
      totalRevenue: round2(totalRevenue),
      clients: clients.map((c, i) => ({
        rank: i + 1,
        ...c,
        percent: totalRevenue > 0 ? round2((c.revenue / totalRevenue) * 100) : 0,
      })),
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── GET /api/revenue/monthly-comparison ───────────────────────────
// Last 12 months revenue, orders, AOV
exports.monthlyComparison = async (req, res) => {
  try {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const monthly = await Order.aggregate([
      { $match: { paymentStatus: 'paid', createdAt: { $gte: twelveMonthsAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          revenue: { $sum: '$totalAmount' },
          orders: { $sum: 1 },
          avgOrderValue: { $avg: '$totalAmount' },
          couponDiscount: { $sum: '$couponDiscount' },
          shipping: { $sum: '$shippingCharge' },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          month: '$_id',
          revenue: { $round: ['$revenue', 2] },
          orders: 1,
          avgOrderValue: { $round: ['$avgOrderValue', 2] },
          couponDiscount: { $round: ['$couponDiscount', 2] },
          shipping: { $round: ['$shipping', 2] },
          _id: 0,
        },
      },
    ]);

    return successResponse(res, 200, 'Monthly revenue comparison (12 months)', {
      monthly,
      totalRevenue: round2(monthly.reduce((s, m) => s + m.revenue, 0)),
      totalOrders: monthly.reduce((s, m) => s + m.orders, 0),
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── GET /api/revenue/refunds ──────────────────────────────────────
// Refunds & cancellations impact on revenue
exports.refundImpact = async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const from = daysAgo(parseInt(period));

    const [refunds, cancelled, couponImpact] = await Promise.all([
      Order.aggregate([
        { $match: { paymentStatus: 'refunded', createdAt: { $gte: from } } },
        { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$totalAmount' } } },
      ]),
      Order.aggregate([
        { $match: { status: 'cancelled', createdAt: { $gte: from } } },
        { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$totalAmount' } } },
      ]),
      Order.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: from }, 'coupon.code': { $ne: null } } },
        { $group: { _id: null, totalDiscount: { $sum: '$couponDiscount' }, ordersWithCoupon: { $sum: 1 } } },
      ]),
    ]);

    return successResponse(res, 200, 'Revenue impact (refunds & cancellations)', {
      period: `${period} days`,
      refunds: {
        count: refunds[0]?.count || 0,
        amount: round2(refunds[0]?.amount),
        label: 'Refunded Orders',
      },
      cancellations: {
        count: cancelled[0]?.count || 0,
        lostRevenue: round2(cancelled[0]?.amount),
        label: 'Cancelled Orders',
      },
      couponImpact: {
        ordersWithCoupon: couponImpact[0]?.ordersWithCoupon || 0,
        totalDiscountGiven: round2(couponImpact[0]?.totalDiscount),
        label: 'Discount given via coupons',
      },
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};
