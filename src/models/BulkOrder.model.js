const mongoose = require('mongoose');

const bulkOrderSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    company: { type: String, default: '' },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    productName: { type: String, default: '' },
    quantityEstimate: { type: Number, default: null },
    budgetRange: { type: String, default: '' },
    timeline: { type: String, default: '' },
    message: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'contacted', 'quote-sent', 'negotiating', 'converted', 'closed'],
      default: 'pending',
    },
    priority: { type: String, enum: ['Normal', 'High', 'Urgent'], default: 'Normal' },
    adminNotes: [
      {
        note: String,
        admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now },
      }
    ],
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // if logged-in user
    whatsappNumber: { type: String, default: '' },
    preferredContactMethod: { type: String, enum: ['Email', 'Phone', 'WhatsApp'], default: 'Email' },
    attachmentUrl: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('BulkOrder', bulkOrderSchema);
