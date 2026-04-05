const mongoose = require('mongoose');

// Sub-schema for dynamic product customization fields (form-builder style)
// Each field the admin creates becomes a labeled input on the client
const customizationFieldSchema = new mongoose.Schema({
  fieldId:   { type: String, required: true },
  label:     { type: String, required: true },
  fieldType: { type: String, enum: ['image_upload', 'text_input'], required: true },
  isRequired:{ type: Boolean, default: true },
  placeholder:{ type: String, default: '' },
  maxLength:  { type: Number, default: null },
  sortOrder:  { type: Number, default: 0 },
});

// Sub-schema for dynamic pricing tiers (e.g., 10+ mugs = ₹249 each)
const pricingTierSchema = new mongoose.Schema({
  minQuantity: { type: Number, required: true, min: 2 },
  pricePerUnit: { type: Number, required: true, min: 0 },
});

// Sub-schema for per-occasion (RelatedTo) image sets
const relatedToEntrySchema = new mongoose.Schema({
  relatedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RelatedTo',
    required: true,
  },
  // Images specific to this occasion (overrides product base images when browsing by occasion)
  images: { type: [String], default: [] },
  // Optional: a dedicated thumbnail for this occasion
  thumbnailImage: { type: String, default: null },
});

// Sub-schema for price variants
const priceVariantSchema = new mongoose.Schema({
  variantName: { type: String, required: true }, // e.g., "11oz Mug", "A4 Print"
  sku: { type: String, unique: true, sparse: true },
  basePrice: { type: Number, required: true, min: 0 },
  discountPrice: { type: Number, default: null },
  stock: { type: Number, default: 0, min: 0 },
  isAvailable: { type: Boolean, default: true },
});

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: [120, 'Product name cannot exceed 120 characters'],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
    },
    shortDescription: {
      type: String,
      maxlength: [300, 'Short description cannot exceed 300 characters'],
    },
    description: {
      type: String,
    },
    images: {
      type: [String], // array of image URLs/paths
      default: [],
    },
    thumbnailImage: {
      type: String,
      default: null,
    },
    productType: {
      type: String,
      enum: [
        'mug',
        'calendar',
        'photo_print',
        'canvas_print',
        'pillow',
        'keychain',
        'frame',
        'poster',
        'card',
        'custom',
      ],
      required: true,
    },
    variants: [priceVariantSchema],
    basePrice: {
      type: Number,
      required: [true, 'Base price is required'],
      min: 0,
    },
    discountPrice: {
      type: Number,
      default: null,
    },
    pricingTiers: [pricingTierSchema],
    isCustomizable: { type: Boolean, default: false },
    customizationOptions: [customizationFieldSchema],
    // Occasions / themes this product is related to (with per-occasion images)
    relatedTos: [relatedToEntrySchema],
    tags: [String],
    isActive: {
      type: Boolean,
      default: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    stock: {
      type: Number,
      default: 0,
    },
    lowStockThreshold: {
      type: Number,
      default: 5,
    },
    minOrderQuantity: {
      type: Number,
      default: 1,
      min: 1,
    },
    maxOrderQuantity: {
      type: Number,
      default: 100,
    },
    deliveryDays: {
      type: Number,
      default: 5, // estimated delivery in days
    },
    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0 },
    },
    // Used by Fabric.js to store the base product template (background, text/image boundaries)
    canvasTemplate: {
      type: Object,
      default: null,
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
  {
    timestamps: true,
  }
);

// ─── Auto-generate slug ───────────────────────────────────
productSchema.pre('save', async function () {
  if (this.isModified('name')) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .trim();
  }
});

// ─── Free Smart Search Index ──────────────────────────────
productSchema.index(
  { name: 'text', shortDescription: 'text', tags: 'text' },
  { weights: { name: 10, tags: 5, shortDescription: 1 } }
);

// ─── Virtual: Effective Price ─────────────────────────────
productSchema.virtual('effectivePrice').get(function () {
  return this.discountPrice && this.discountPrice < this.basePrice
    ? this.discountPrice
    : this.basePrice;
});

productSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Product', productSchema);
