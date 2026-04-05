const mongoose = require('mongoose');

/**
 * RelatedTo — Occasion / Theme tags
 * Examples: "Father's Gift", "Mother's Gift", "Valentine / Love", "Birthday", "Wedding"
 *
 * Products are linked to multiple RelatedTos.
 * Each product–RelatedTo pair can carry its own image gallery.
 */
const relatedToSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'RelatedTo name is required'],
      unique: true,
      trim: true,
      maxlength: [80, 'Name cannot exceed 80 characters'],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      maxlength: [400, 'Description cannot exceed 400 characters'],
    },
    // Cover image for this occasion (shown on occasion landing / browse page)
    coverImage: {
      type: String,
      default: null,
    },
    icon: {
      type: String, // emoji or icon class
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

// Auto-generate slug from name
relatedToSchema.pre('save', function () {
  if (this.isModified('name')) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .trim();
  }
});

module.exports = mongoose.model('RelatedTo', relatedToSchema);
