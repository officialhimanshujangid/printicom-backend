const mongoose = require('mongoose');

const contactSubmissionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    subject: { type: String, trim: true },
    category: {
      type: String,
      enum: ['General Inquiry', 'Bulk Order', 'Design Help', 'Feedback', 'Partnership', 'Other'],
      default: 'General Inquiry',
    },
    message: { type: String, required: true },
    priority: {
      type: String,
      enum: ['Normal', 'High'],
      default: 'Normal',
    },
    status: {
      type: String,
      enum: ['new', 'read', 'replied', 'closed'],
      default: 'new',
    },
    adminNote: { type: String, default: '' },
    repliedAt: { type: Date },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // if logged-in user
    // Bulk / B2B quote requests (from product page)
    bulkProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    bulkProductName: { type: String, default: '' },
    bulkProductSlug: { type: String, default: '' },
    bulkQuantityEstimate: { type: Number, default: null },
    bulkCompany: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ContactSubmission', contactSubmissionSchema);
