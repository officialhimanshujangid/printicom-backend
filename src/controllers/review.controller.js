const Review = require('../models/Review.model');
const Order = require('../models/Order.model');
const Product = require('../models/Product.model');
const mongoose = require('mongoose');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response.utils');
const { upload } = require('../utils/upload.utils');

// ─── Add Review ────────────────────────────────────────
exports.addReview = async (req, res) => {
  try {
    const { productId, orderId, rating, title, body } = req.body;

    const product = await Product.findById(productId);
    if (!product) return errorResponse(res, 404, 'Product not found');

    // Check if already reviewed
    const existing = await Review.findOne({ product: productId, user: req.user._id });
    if (existing) return errorResponse(res, 400, 'You have already reviewed this product');

    // Check verified purchase
    let isVerifiedPurchase = false;
    if (orderId) {
      const order = await Order.findOne({
        _id: orderId,
        user: req.user._id,
        status: 'delivered',
        'items.product': productId,
      });
      isVerifiedPurchase = !!order;
    } else {
      // Auto-check if user has a delivered order containing this product
      const deliveredOrder = await Order.findOne({
        user: req.user._id,
        status: 'delivered',
        'items.product': productId,
      });
      isVerifiedPurchase = !!deliveredOrder;
    }

    const reviewData = {
      product: productId,
      user: req.user._id,
      order: orderId || null,
      rating: parseInt(rating),
      title: title || null,
      body: body || null,
      isVerifiedPurchase,
    };

    // Handle review images
    if (req.files && req.files.length > 0) {
      reviewData.images = req.files.map((f) => f.path.replace(/\\/g, '/'));
    }

    const review = await Review.create(reviewData);
    await review.populate('user', 'name profilePhoto');

    return successResponse(res, 201, 'Review submitted successfully', { review });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Get Reviews for a Product ─────────────────────────
exports.getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    if (!require('mongoose').Types.ObjectId.isValid(productId)) {
      return errorResponse(res, 400, 'Invalid product id');
    }
    const { page = 1, limit = 10, sortBy = 'createdAt', order = 'desc' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = { product: productId, isApproved: true };
    const sortOpts = { [sortBy]: order === 'asc' ? 1 : -1 };

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate('user', 'name profilePhoto')
        .sort(sortOpts)
        .skip(skip)
        .limit(parseInt(limit)),
      Review.countDocuments(filter),
    ]);

    // Rating distribution
    const ratingDist = await Review.aggregate([
      { $match: { product: require('mongoose').Types.ObjectId.createFromHexString(productId), isApproved: true } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));
    return paginatedResponse(res, 'Reviews fetched', reviews, {
      total, page: parseInt(page), limit: parseInt(limit), totalPages, ratingDistribution: ratingDist,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Update Review ─────────────────────────────────────
exports.updateReview = async (req, res) => {
  try {
    const { rating, title, body } = req.body;
    const review = await Review.findOne({ _id: req.params.id, user: req.user._id });
    if (!review) return errorResponse(res, 404, 'Review not found');

    if (rating) review.rating = parseInt(rating);
    if (title !== undefined) review.title = title;
    if (body !== undefined) review.body = body;
    if (req.files && req.files.length > 0) {
      review.images = req.files.map((f) => f.path.replace(/\\/g, '/'));
    }

    await review.save(); // triggers post-save for rating update
    await review.populate('user', 'name profilePhoto');

    return successResponse(res, 200, 'Review updated', { review });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Delete Review ─────────────────────────────────────
exports.deleteReview = async (req, res) => {
  try {
    const review = await Review.findOne({ _id: req.params.id, user: req.user._id });
    if (!review) return errorResponse(res, 404, 'Review not found');
    await review.deleteOne();
    return successResponse(res, 200, 'Review deleted');
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Get My Reviews ────────────────────────────────────
exports.getMyReviews = async (req, res) => {
  try {
    const reviews = await Review.find({ user: req.user._id })
      .populate('product', 'name slug thumbnailImage')
      .sort({ createdAt: -1 });
    return successResponse(res, 200, 'My reviews', { reviews });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Admin: Approve / Reject Review ───────────────────
exports.adminToggleReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return errorResponse(res, 404, 'Review not found');
    review.isApproved = !review.isApproved;
    await review.save();
    return successResponse(res, 200, `Review ${review.isApproved ? 'approved' : 'hidden'}`, { review });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Admin: Reply to Review ────────────────────────────
exports.adminReplyReview = async (req, res) => {
  try {
    const { reply } = req.body;
    if (!reply) return errorResponse(res, 400, 'Reply text is required');

    const review = await Review.findById(req.params.id);
    if (!review) return errorResponse(res, 404, 'Review not found');

    review.adminReply = reply;
    await review.save();
    return successResponse(res, 200, 'Reply added', { review });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Admin: List All Reviews (paginated) ───────────────
exports.adminListReviews = async (req, res) => {
  try {
    const { page = 1, limit = 15, status, rating, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = {};
    if (status === 'approved') filter.isApproved = true;
    else if (status === 'hidden') filter.isApproved = false;
    if (rating) filter.rating = parseInt(rating);

    // If searching, first find matching products/users
    if (search && search.trim()) {
      // do a loose search – handled below via aggregate
    }

    let query = Review.find(filter)
      .populate('user', 'name email profilePhoto')
      .populate('product', 'name slug thumbnailImage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const [reviews, total] = await Promise.all([
      query,
      Review.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));
    return paginatedResponse(res, 'Reviews fetched', reviews, {
      total, page: parseInt(page), limit: parseInt(limit), totalPages,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Admin: Delete any Review ──────────────────────────
exports.adminDeleteReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return errorResponse(res, 404, 'Review not found');
    await review.deleteOne();
    return successResponse(res, 200, 'Review deleted by admin');
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};
