const mongoose = require('mongoose');

/**
 * Banner / Advertisement Model
 * Admin controls what promotional content shows where across the storefront.
 *
 * Placement types:
 *  - hero_slider       : Main homepage hero carousel
 *  - offer_strip       : Top-of-page announcement/offer bar
 *  - homepage_grid     : Homepage promotional grid cards
 *  - category_page     : Banners shown inside a category page
 *  - product_page      : Sidebar/top banner on product detail page
 *  - popup             : One-time popup shown to visitors
 *  - sidebar           : Sidebar promotional block
 *  - checkout_offer    : Offer shown during checkout
 */
const bannerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Banner title is required'],
      trim: true,
      maxlength: [150, 'Title cannot exceed 150 characters'],
    },
    subtitle: {
      type: String,
      trim: true,
      maxlength: [300, 'Subtitle cannot exceed 300 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },

    // ── Image ─────────────────────────────────────────────
    imageUrl: {
      type: String,
      required: [true, 'Banner image is required'],
    },
    mobileImageUrl: {
      type: String, // separate mobile-optimized image
      default: null,
    },
    altText: {
      type: String,
      default: '',
    },

    // ── CTA (Call To Action) ───────────────────────────────
    ctaText: {
      type: String,
      default: null, // e.g. "Shop Now", "View Offer"
      maxlength: 50,
    },
    ctaLink: {
      type: String,
      default: null, // internal route or external URL
    },
    ctaTarget: {
      type: String,
      enum: ['_self', '_blank'],
      default: '_self',
    },

    // ── Placement ──────────────────────────────────────────
    placement: {
      type: String,
      enum: [
        'hero_slider',
        'offer_strip',
        'homepage_grid',
        'category_page',
        'product_page',
        'popup',
        'sidebar',
        'checkout_offer',
      ],
      required: [true, 'Placement is required'],
    },

    // ── Targeting (optional) ────────────────────────────────
    targetCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null, // if set, show this banner only on that category's page
    },
    targetProduct: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
    },

    // ── Styling & Display ──────────────────────────────────
    backgroundColor: {
      type: String,
      default: null, // hex color, used for offer_strip
    },
    textColor: {
      type: String,
      default: null,
    },
    badgeText: {
      type: String,
      default: null, // e.g. "NEW", "HOT", "LIMITED"
      maxlength: 20,
    },

    // ── Scheduling ─────────────────────────────────────────
    startDate: {
      type: Date,
      default: null, // null = active immediately
    },
    endDate: {
      type: Date,
      default: null, // null = no expiry
    },

    // ── Control ────────────────────────────────────────────
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0, // lower = shown first (for sliders)
    },

    // ── Analytics ──────────────────────────────────────────
    impressions: {
      type: Number,
      default: 0,
    },
    clicks: {
      type: Number,
      default: 0,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

// ── Virtual: CTR ────────────────────────────────────────
bannerSchema.virtual('ctr').get(function () {
  if (this.impressions === 0) return 0;
  return Math.round((this.clicks / this.impressions) * 10000) / 100; // percentage
});

// ── Virtual: isLive ─────────────────────────────────────
bannerSchema.virtual('isLive').get(function () {
  const now = new Date();
  const afterStart = !this.startDate || now >= this.startDate;
  const beforeEnd = !this.endDate || now <= this.endDate;
  return this.isActive && afterStart && beforeEnd;
});

bannerSchema.set('toJSON', { virtuals: true });

bannerSchema.index({ placement: 1, isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('Banner', bannerSchema);
