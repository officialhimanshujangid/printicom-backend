const Coupon = require('../models/Coupon.model');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response.utils');

// ─── Create Coupon (Admin) ─────────────────────────────
exports.createCoupon = async (req, res) => {
  try {
    const {
      code,
      description,
      discountType,
      discountValue,
      maxDiscountAmount,
      minOrderAmount,
      usageLimit,
      perUserLimit,
      validFrom,
      validUntil,
      applicableProducts,
      applicableCategories,
    } = req.body;

    const existing = await Coupon.findOne({ code: code.toUpperCase() });
    if (existing) return errorResponse(res, 400, 'Coupon code already exists');

    if (new Date(validFrom) >= new Date(validUntil))
      return errorResponse(res, 400, 'validUntil must be after validFrom');

    const coupon = await Coupon.create({
      code: code.toUpperCase(),
      description,
      discountType,
      discountValue: parseFloat(discountValue),
      maxDiscountAmount: maxDiscountAmount ? parseFloat(maxDiscountAmount) : null,
      minOrderAmount: parseFloat(minOrderAmount) || 0,
      maxOrderAmount: req.body.maxOrderAmount ? parseFloat(req.body.maxOrderAmount) : null,
      usageLimit: usageLimit ? parseInt(usageLimit) : null,
      perUserLimit: parseInt(perUserLimit) || 1,
      validFrom: new Date(validFrom),
      validUntil: new Date(validUntil),
      isFirstOrderOnly: req.body.isFirstOrderOnly === true || req.body.isFirstOrderOnly === 'true',
      minAccountAgeDays: req.body.minAccountAgeDays ? parseInt(req.body.minAccountAgeDays) : null,
      applicableProducts: applicableProducts || [],
      applicableCategories: applicableCategories || [],
      createdBy: req.user._id,
    });

    return successResponse(res, 201, 'Coupon created successfully', { coupon });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Get All Coupons (Admin) ───────────────────────────
exports.getAllCoupons = async (req, res) => {
  try {
    const { page = 1, limit = 20, isActive } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filter = {};
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const [coupons, total] = await Promise.all([
      Coupon.find(filter)
        .populate('createdBy', 'name email')
        .populate('targetedUsers', 'name email')
        .populate('usedBy.user', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Coupon.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));
    return paginatedResponse(res, 'Coupons fetched', coupons, {
      total, page: parseInt(page), limit: parseInt(limit), totalPages,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Get Coupon by ID (Admin) ──────────────────────────
exports.getCouponById = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('targetedUsers', 'name email')
      .populate('usedBy.user', 'name email');
    if (!coupon) return errorResponse(res, 404, 'Coupon not found');
    return successResponse(res, 200, 'Coupon fetched', { coupon });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Update Coupon (Admin) ─────────────────────────────
exports.updateCoupon = async (req, res) => {
  try {
    const { description, discountValue, maxDiscountAmount, minOrderAmount, usageLimit, perUserLimit, validUntil, isActive } = req.body;

    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return errorResponse(res, 404, 'Coupon not found');

    if (description !== undefined) coupon.description = description;
    if (discountValue !== undefined) coupon.discountValue = parseFloat(discountValue);
    if (maxDiscountAmount !== undefined) coupon.maxDiscountAmount = maxDiscountAmount ? parseFloat(maxDiscountAmount) : null;
    if (minOrderAmount !== undefined) coupon.minOrderAmount = parseFloat(minOrderAmount);
    if (req.body.maxOrderAmount !== undefined) coupon.maxOrderAmount = req.body.maxOrderAmount ? parseFloat(req.body.maxOrderAmount) : null;
    if (usageLimit !== undefined) coupon.usageLimit = usageLimit ? parseInt(usageLimit) : null;
    if (perUserLimit !== undefined) coupon.perUserLimit = parseInt(perUserLimit);
    if (validUntil !== undefined) coupon.validUntil = new Date(validUntil);
    if (isActive !== undefined) coupon.isActive = isActive === true || isActive === 'true';
    if (req.body.isFirstOrderOnly !== undefined) coupon.isFirstOrderOnly = req.body.isFirstOrderOnly === true || req.body.isFirstOrderOnly === 'true';
    if (req.body.minAccountAgeDays !== undefined) coupon.minAccountAgeDays = req.body.minAccountAgeDays ? parseInt(req.body.minAccountAgeDays) : null;

    await coupon.save();
    return successResponse(res, 200, 'Coupon updated', { coupon });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Delete Coupon (Admin) ─────────────────────────────
exports.deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) return errorResponse(res, 404, 'Coupon not found');
    return successResponse(res, 200, 'Coupon deleted');
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Toggle Coupon Status (Admin) ──────────────────────
exports.toggleCouponStatus = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return errorResponse(res, 404, 'Coupon not found');
    coupon.isActive = !coupon.isActive;
    await coupon.save();
    return successResponse(res, 200, `Coupon ${coupon.isActive ? 'activated' : 'deactivated'}`, { coupon });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Validate Coupon (Client - just check without applying) ──────
 exports.validateCoupon = async (req, res) => {
  try {
    const { code, cartTotal } = req.body;
    if (!code) return errorResponse(res, 400, 'Coupon code is required');

    const Order = require('../models/Order.model');
    const User = require('../models/User.model');

    const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
    if (!coupon) return errorResponse(res, 404, 'Invalid coupon code');

    // 1. Targeted users check
    if (coupon.targetedUsers && coupon.targetedUsers.length > 0) {
      const isTargeted = coupon.targetedUsers.some(uid => uid.toString() === req.user._id.toString());
      if (!isTargeted) return errorResponse(res, 403, 'This coupon is not applicable to your account');
    }

    // 2. Date validity
    const now = new Date();
    if (now < coupon.validFrom || now > coupon.validUntil)
      return errorResponse(res, 400, 'Coupon is expired or not yet active');

    // 3. Global usage cap
    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit)
      return errorResponse(res, 400, 'Coupon has reached its usage limit');

    // 4. Per-user usage
    const userUsage = coupon.usedBy.filter(u => u.user.toString() === req.user._id.toString()).length;
    if (userUsage >= coupon.perUserLimit)
      return errorResponse(res, 400, 'You have already used this coupon the maximum number of times');

    // 5. Min order amount
    const orderTotal = cartTotal ? parseFloat(cartTotal) : 0;
    if (orderTotal < coupon.minOrderAmount)
      return errorResponse(res, 400, `Minimum order amount of ₹${coupon.minOrderAmount} required`);

    // 6. Max order amount
    if (coupon.maxOrderAmount !== null && orderTotal > coupon.maxOrderAmount)
      return errorResponse(res, 400, `This coupon is only valid for orders up to ₹${coupon.maxOrderAmount}`);

    // 7. First order only
    if (coupon.isFirstOrderOnly) {
      const prevOrders = await Order.countDocuments({ user: req.user._id, status: { $ne: 'cancelled' } });
      if (prevOrders > 0) return errorResponse(res, 400, 'This coupon is only valid on your first order');
    }

    // 8. Min account age (in days)
    if (coupon.minAccountAgeDays !== null) {
      const user = await User.findById(req.user._id).select('createdAt');
      const accountAgeDays = (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      if (accountAgeDays < coupon.minAccountAgeDays)
        return errorResponse(res, 400, `Your account must be at least ${coupon.minAccountAgeDays} days old to use this coupon`);
    }

    return successResponse(res, 200, 'Coupon is valid', {
      coupon: {
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        maxDiscountAmount: coupon.maxDiscountAmount,
        minOrderAmount: coupon.minOrderAmount,
      },
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Get Eligible Coupons for current user ─────────────────────────────
 exports.getEligibleCoupons = async (req, res) => {
  try {
    const Order = require('../models/Order.model');
    const User = require('../models/User.model');
    const now = new Date();
    const userId = req.user._id;

    const user = await User.findById(userId).select('createdAt');
    const accountAgeDays = (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    const prevOrderCount = await Order.countDocuments({ user: userId, status: { $ne: 'cancelled' } });
    const cartTotal = parseFloat(req.query.cartTotal || 0);

    // Find all publicly-eligible or user-targeted active coupons
    const allCoupons = await Coupon.find({
      isActive: true,
      validFrom: { $lte: now },
      validUntil: { $gte: now },
      $or: [
        { targetedUsers: { $size: 0 } },
        { targetedUsers: userId },
      ],
    }).select('-usedBy');

    const eligible = allCoupons.filter(c => {
      // Per-user usage check
      const usedByUser = c.usedBy?.filter(u => u.user?.toString() === userId.toString()).length || 0;
      if (usedByUser >= c.perUserLimit) return false;
      // Usage cap
      if (c.usageLimit !== null && c.usageCount >= c.usageLimit) return false;
      // Min order
      if (cartTotal > 0 && cartTotal < c.minOrderAmount) return false;
      // Max order
      if (c.maxOrderAmount !== null && cartTotal > 0 && cartTotal > c.maxOrderAmount) return false;
      // First order only
      if (c.isFirstOrderOnly && prevOrderCount > 0) return false;
      // Min account age
      if (c.minAccountAgeDays !== null && accountAgeDays < c.minAccountAgeDays) return false;
      return true;
    });

    return successResponse(res, 200, 'Eligible coupons', { coupons: eligible });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── ADMIN: Create Targeted Campaign ───────────────────────────
exports.createTargetedCampaign = async (req, res) => {
  try {
    const { 
      code, discountType, discountValue, validDays = 7, 
      targetCriteria // { wishlistProductId, state, minTotalSpent, specificEmails }
    } = req.body;

    if (!code || !discountValue || !targetCriteria) {
      return errorResponse(res, 400, 'Code, discountValue, and targetCriteria are required');
    }

    const { createSystemNotification } = require('./notification.controller');
    const Wishlist = require('../models/Wishlist.model');
    const Product = require('../models/Product.model');
    const Address = require('../models/Address.model');
    const Order = require('../models/Order.model');
    const User = require('../models/User.model');
    
    let targetUserIds = [];

    // 1. Specific Users array
    if (targetCriteria.specificEmails && targetCriteria.specificEmails.length > 0) {
      const users = await User.find({ email: { $in: targetCriteria.specificEmails } });
      targetUserIds = users.map(u => u._id.toString());
    } 
    // 2. Wishlist Product
    else if (targetCriteria.wishlistProductId) {
      const wishlists = await Wishlist.find({ 'products.product': targetCriteria.wishlistProductId });
      targetUserIds = wishlists.map(w => w.user.toString());
    }
    // 3. State-based targeting
    else if (targetCriteria.state) {
      const addresses = await Address.find({ state: { $regex: new RegExp(`^${targetCriteria.state}$`, 'i') } });
      targetUserIds = addresses.map(a => a.user.toString());
    }
    // 4. Min Order Value (LTV / Total Spent)
    else if (targetCriteria.minTotalSpent) {
      const usersSpent = await Order.aggregate([
        { $match: { status: 'delivered', paymentStatus: 'paid' } },
        { $group: { _id: '$user', totalSpent: { $sum: '$totalAmount' } } },
        { $match: { totalSpent: { $gte: parseFloat(targetCriteria.minTotalSpent) } } }
      ]);
      targetUserIds = usersSpent.map(u => u._id.toString());
    }

    // De-duplicate users
    targetUserIds = [...new Set(targetUserIds)];

    if (targetUserIds.length === 0) {
      return errorResponse(res, 404, 'No users match the given criteria');
    }

    // Create coupon
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + validDays);
    
    let descriptionStr = `Targeted Campaign Coupon`;
    if (targetCriteria.wishlistProductId) {
      const product = await Product.findById(targetCriteria.wishlistProductId);
      if (product) descriptionStr = `Special discount for ${product.name}`;
    }
    
    const coupon = await Coupon.create({
      code: code.toUpperCase(),
      description: descriptionStr,
      discountType,
      discountValue: parseFloat(discountValue),
      validFrom: new Date(),
      validUntil,
      perUserLimit: 1,
      targetedUsers: targetUserIds,
      createdBy: req.user._id,
      applicableProducts: targetCriteria.wishlistProductId ? [targetCriteria.wishlistProductId] : [],
    });

    // Notify users
    let notifyCount = 0;
    for (const userId of targetUserIds) {
       await createSystemNotification({
         userId: userId,
         type: 'new_offer',
         title: 'A Special Offer Just For You!',
         message: `Use code ${coupon.code} to get ${discountType === 'percentage' ? discountValue+'%' : '₹'+discountValue} off. Valid for ${validDays} days!`,
         link: targetCriteria.wishlistProductId ? `/account/wishlist` : `/products`
       });
       notifyCount++;
    }

    return successResponse(res, 200, `Targeted Campaign launched: Coupon sent to ${notifyCount} users.`);
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

