const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  variantId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },
  variantName: {
    type: String,
    default: null,
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, 'Quantity must be at least 1'],
    default: 1,
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  // Dynamic customization data - keyed by fieldId matching product's customizationOptions
  // { fieldId: { label, type, value } }
  // For image_upload: value = uploaded Cloudinary URL string
  // For text_input: value = text string
  customization: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
});

// Virtual: line total
cartItemSchema.virtual('lineTotal').get(function () {
  return this.unitPrice * this.quantity;
});
cartItemSchema.set('toJSON', { virtuals: true });

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    items: [cartItemSchema],
    appliedCoupon: {
      code: { type: String, default: null },
      discountAmount: { type: Number, default: 0 },
      discountType: { type: String, enum: ['percentage', 'flat'], default: 'flat' },
    },
  },
  { timestamps: true }
);

// Virtual: subtotal
cartSchema.virtual('subtotal').get(function () {
  return this.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
});

// Virtual: item count
cartSchema.virtual('itemCount').get(function () {
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

cartSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Cart', cartSchema);
