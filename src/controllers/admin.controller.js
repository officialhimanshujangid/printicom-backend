const User = require('../models/User.model');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response.utils');

// ─── Get All Users (clients) ───────────────────────────────
exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role, isActive } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }
    if (role && role !== 'all') filter.role = role;
    if (isActive !== undefined && isActive !== '' && isActive !== 'all') {
      filter.isActive = isActive === 'true';
    }

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      User.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    return paginatedResponse(res, 'Users fetched successfully', users, {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages,
      hasNextPage: parseInt(page) < totalPages,
      hasPrevPage: parseInt(page) > 1,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Get User by ID (rich — orders + wishlist) ────────────────
exports.getUserById = async (req, res) => {
  try {
    const Order = require('../models/Order.model');
    const Wishlist = require('../models/Wishlist.model');

    const user = await User.findById(req.params.id);
    if (!user) return errorResponse(res, 404, 'User not found');

    // Fetch orders for this client
    const orders = await Order.find({ user: req.params.id })
      .sort({ createdAt: -1 })
      .select('orderNumber status totalAmount paymentStatus paymentMethod items subtotal shippingCharge couponDiscount shippingAddress coupon createdAt estimatedDeliveryDate trackingNumber');

    // Fetch wishlist for this client (with full product details)
    const wishlist = await Wishlist.findOne({ user: req.params.id }).populate(
      'products.product',
      'name slug thumbnailImage basePrice discountPrice isActive productType category rating'
    );

    // Summary stats
    const totalSpent = orders
      .filter((o) => o.paymentStatus === 'paid')
      .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    const orderStats = {
      total: orders.length,
      pending: orders.filter((o) => o.status === 'pending').length,
      delivered: orders.filter((o) => o.status === 'delivered').length,
      cancelled: orders.filter((o) => o.status === 'cancelled').length,
      totalSpent: Math.round(totalSpent * 100) / 100,
    };

    // Fetch addresses
    const Address = require('../models/Address.model');
    const addresses = await Address.find({ user: req.params.id }).sort({ isDefault: -1, createdAt: -1 });

    return successResponse(res, 200, 'Client details fetched', {
      user: { ...user.toObject(), addresses },
      orders,
      wishlist: wishlist || { products: [] },
      orderStats,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Toggle User Active Status ─────────────────────────────
exports.toggleUserStatus = async (req, res) => {
  try {
    if (req.params.id.toString() === req.user._id.toString()) {
      return errorResponse(res, 400, 'You cannot deactivate your own account.');
    }

    const user = await User.findById(req.params.id);
    if (!user) return errorResponse(res, 404, 'User not found');

    user.isActive = !user.isActive;
    await user.save({ validateBeforeSave: false });

    return successResponse(res, 200, `User ${user.isActive ? 'activated' : 'deactivated'} successfully`, {
      user,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Dashboard Stats (Enhanced with Orders) ───────────────
exports.getDashboardStats = async (req, res) => {
  try {
    const Product = require('../models/Product.model');
    const Category = require('../models/Category.model');
    const Order = require('../models/Order.model');
    const Review = require('../models/Review.model');
    const ContactSubmission = require('../models/ContactSubmission.model');

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalUsers,
      activeUsers,
      totalProducts,
      totalCategories,
      totalOrders,
      pendingOrders,
      processingOrders,
      deliveredOrders,
      cancelledOrders,
      revenueData,
      monthlyRevenueData,
      todayOrdersCount,
      todayRevenueData,
      todayOrdersList,
      attentionOrders,
      recentOrders,
      recentUsers,
      recentContacts,
      totalReviews,
      lowStockProducts,
      newContactCount,
    ] = await Promise.all([
      User.countDocuments({ role: 'client' }),
      User.countDocuments({ role: 'client', isActive: true }),
      Product.countDocuments({ isActive: true }),
      Category.countDocuments({ isActive: true }),
      Order.countDocuments(),
      Order.countDocuments({ status: 'pending' }),
      Order.countDocuments({ status: { $in: ['confirmed', 'processing', 'ready_to_ship'] } }),
      Order.countDocuments({ status: 'delivered' }),
      Order.countDocuments({ status: 'cancelled' }),
      Order.aggregate([
        { $match: { paymentStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      Order.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      Order.countDocuments({ createdAt: { $gte: startOfToday } }),
      Order.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: startOfToday } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      Order.find({ createdAt: { $gte: startOfToday } })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('user', 'name email')
        .select('orderNumber status totalAmount createdAt paymentMethod paymentStatus'),
      Order.find({ status: { $in: ['pending', 'payment_failed'] } })
        .sort({ createdAt: -1 })
        .limit(8)
        .populate('user', 'name email')
        .select('orderNumber status totalAmount createdAt paymentMethod paymentStatus'),
      Order.find()
        .sort({ createdAt: -1 })
        .limit(8)
        .populate('user', 'name email')
        .select('orderNumber status totalAmount createdAt paymentMethod paymentStatus'),
      User.find({ role: 'client' }).sort({ createdAt: -1 }).limit(5).select('name email createdAt isEmailVerified'),
      ContactSubmission.find().sort({ createdAt: -1 }).limit(5).select('name email subject status createdAt category'),
      Review.countDocuments(),
      Product.find({ 
        $expr: { $lte: ["$stock", "$lowStockThreshold"] } 
      }).limit(10).select('name stock lowStockThreshold thumbnailImage'),
      ContactSubmission.countDocuments({ status: 'new' }),
    ]);

    const totalRevenue = revenueData[0]?.total || 0;
    const monthlyRevenue = monthlyRevenueData[0]?.total || 0;
    const todayRevenue = todayRevenueData[0]?.total || 0;

    return successResponse(res, 200, 'Dashboard stats fetched', {
      stats: {
        users: {
          total: totalUsers,
          active: activeUsers,
          inactive: totalUsers - activeUsers,
        },
        products: {
          total: totalProducts,
        },
        categories: {
          total: totalCategories,
        },
        orders: {
          total: totalOrders,
          pending: pendingOrders,
          processing: processingOrders,
          delivered: deliveredOrders,
          cancelled: cancelledOrders,
          today: todayOrdersCount,
        },
        revenue: {
          total: Math.round(totalRevenue * 100) / 100,
          thisMonth: Math.round(monthlyRevenue * 100) / 100,
          today: Math.round(todayRevenue * 100) / 100,
        },
        reviews: {
          total: totalReviews,
        },
        contact: {
          new: newContactCount,
        },
      },
      recentOrders,
      recentUsers,
      recentContacts,
      todayOrders: todayOrdersList,
      attentionOrders,
      lowStockProducts,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};
// ─── Get Single Order Detail (admin full view) ────────────────
exports.getOrderDetail = async (req, res) => {
  try {
    const Order = require('../models/Order.model');
    const order = await Order.findById(req.params.orderId)
      .populate('user', 'name email phone')
      .populate('items.product', 'name slug thumbnailImage basePrice productType');
    if (!order) return errorResponse(res, 404, 'Order not found');
    return successResponse(res, 200, 'Order detail', { order });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Get User Wishlist (admin) ─────────────────────────────────
exports.getUserWishlist = async (req, res) => {
  try {
    const Wishlist = require('../models/Wishlist.model');
    const wishlist = await Wishlist.findOne({ user: req.params.id })
      .populate({
        path: 'products.product',
        select: 'name slug thumbnailImage basePrice discountPrice isActive productType category rating',
        populate: { path: 'category', select: 'name icon' },
      });
    return successResponse(res, 200, 'User wishlist', { wishlist: wishlist || { products: [] } });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Get Product Wishlist Stats (how many / who wishlisted it) ─
exports.getProductWishlistStats = async (req, res) => {
  try {
    const Wishlist = require('../models/Wishlist.model');
    const Product = require('../models/Product.model');
    const { productId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const product = await Product.findById(productId).select('name slug thumbnailImage basePrice discountPrice productType').lean();
    if (!product) return errorResponse(res, 404, 'Product not found');

    // All wishlists that contain this product
    const [wishlists, total] = await Promise.all([
      Wishlist.find({ 'products.product': productId })
        .populate('user', 'name email phone isActive createdAt')
        .select('user products createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Wishlist.countDocuments({ 'products.product': productId }),
    ]);

    const users = wishlists.map(w => ({
      userId: w.user?._id,
      name: w.user?.name,
      email: w.user?.email,
      phone: w.user?.phone,
      isActive: w.user?.isActive,
      addedAt: w.products.find(p => p.product?.toString() === productId)?.addedAt,
    }));

    return successResponse(res, 200, 'Product wishlist stats', {
      product,
      totalWishlisted: total,
      users,
      pagination: {
        page: parseInt(page), limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
        hasNextPage: parseInt(page) < Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Admin: Wishlist Overview (all products + wishlist counts) ─
exports.getWishlistOverview = async (req, res) => {
  try {
    const Wishlist = require('../models/Wishlist.model');
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Aggregate: count how many users wishlisted each product
    const [topWishlisted, total] = await Promise.all([
      Wishlist.aggregate([
        { $unwind: '$products' },
        { $group: { _id: '$products.product', count: { $sum: 1 }, latestAddedAt: { $max: '$products.addedAt' } } },
        { $sort: { count: -1 } },
        { $skip: skip },
        { $limit: parseInt(limit) },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'product',
          },
        },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            productId: '$_id',
            wishlisted: '$count',
            latestAddedAt: 1,
            name: '$product.name',
            slug: '$product.slug',
            thumbnailImage: '$product.thumbnailImage',
            basePrice: '$product.basePrice',
            discountPrice: '$product.discountPrice',
            productType: '$product.productType',
            isActive: '$product.isActive',
          },
        },
      ]),
      Wishlist.aggregate([
        { $unwind: '$products' },
        { $group: { _id: '$products.product' } },
        { $count: 'total' },
      ]),
    ]);

    // Overall stats
    const [totalWishlistUsers, totalWishlistItems] = await Promise.all([
      Wishlist.countDocuments({ 'products.0': { $exists: true } }),
      Wishlist.aggregate([{ $project: { count: { $size: '$products' } } }, { $group: { _id: null, total: { $sum: '$count' } } }]),
    ]);

    return successResponse(res, 200, 'Wishlist overview', {
      stats: {
        totalWishlistUsers,
        totalWishlistItems: totalWishlistItems[0]?.total || 0,
        uniqueProductsWishlisted: total[0]?.total || 0,
      },
      topWishlisted,
      pagination: {
        page: parseInt(page), limit: parseInt(limit),
        totalPages: Math.ceil((total[0]?.total || 0) / parseInt(limit)),
      },
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Get User Addresses ──────────────────────────────────────
exports.getUserAddresses = async (req, res) => {
  try {
    const Address = require('../models/Address.model');
    const addresses = await Address.find({ user: req.params.id }).sort({ isDefault: -1, createdAt: -1 });
    return successResponse(res, 200, 'User addresses fetched', { addresses });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};
