const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null, // link to verified purchase
    },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating cannot exceed 5'],
    },
    title: {
      type: String,
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    body: {
      type: String,
      trim: true,
      maxlength: [1000, 'Review cannot exceed 1000 characters'],
    },
    images: [String], // review photos uploaded by user
    isVerifiedPurchase: {
      type: Boolean,
      default: false,
    },
    isApproved: {
      type: Boolean,
      default: true, // auto-approve; admin can un-approve
    },
    adminReply: {
      type: String,
      default: null,
    },
    helpfulVotes: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// One review per user per product
reviewSchema.index({ product: 1, user: 1 }, { unique: true });

// ── Static: Recalculate product rating ─────────────────
reviewSchema.statics.updateProductRating = async function (productId) {
  const Product = require('./Product.model');
  const stats = await this.aggregate([
    { $match: { product: productId, isApproved: true } },
    {
      $group: {
        _id: '$product',
        avgRating: { $avg: '$rating' },
        count: { $sum: 1 },
      },
    },
  ]);

  if (stats.length > 0) {
    await Product.findByIdAndUpdate(productId, {
      'rating.average': Math.round(stats[0].avgRating * 10) / 10,
      'rating.count': stats[0].count,
    });
  } else {
    await Product.findByIdAndUpdate(productId, {
      'rating.average': 0,
      'rating.count': 0,
    });
  }
};

reviewSchema.post('save', async function () {
  await this.constructor.updateProductRating(this.product);
});

reviewSchema.post('deleteOne', { document: true }, async function () {
  await this.constructor.updateProductRating(this.product);
});

module.exports = mongoose.model('Review', reviewSchema);
