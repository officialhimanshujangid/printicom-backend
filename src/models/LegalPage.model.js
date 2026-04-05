const mongoose = require('mongoose');

/**
 * LegalPage — singleton-per-slug (one doc per legal page type)
 * slug is the identifier: privacy-policy, terms, refund-policy, shipping-policy, about-us
 */
const legalPageSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      enum: ['privacy-policy', 'terms-and-conditions', 'refund-policy', 'shipping-policy', 'about-us'],
    },
    title: { type: String, required: true },
    content: { type: String, default: '' }, // rich HTML content
    metaTitle: { type: String, default: '' },
    metaDescription: { type: String, default: '' },
    isPublished: { type: Boolean, default: true },
    lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('LegalPage', legalPageSchema);
