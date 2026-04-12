const mongoose = require('mongoose');

/**
 * Invoice Model — Printicom Invoicing System
 * Supports both auto-generated (from orders) and manual invoices.
 * Handles GST logic: CGST+SGST for intrastate, IGST for interstate.
 */

const invoiceItemSchema = new mongoose.Schema({
  description:  { type: String, required: true },
  hsn:          { type: String, default: '' },          // HSN/SAC code
  qty:          { type: Number, required: true, min: 1 },
  unitPrice:    { type: Number, required: true, min: 0 },
  discount:     { type: Number, default: 0 },           // ₹ discount on this line
  gstRate:      { type: Number, default: 0 },           // e.g. 18 (%)
  // GST type applied (computed at save based on state comparison)
  gstType:      { type: String, enum: ['none', 'cgst_sgst', 'igst'], default: 'none' },
  // Computed amounts (stored for immutability/reporting)
  taxableAmount:{ type: Number, default: 0 },           // (unitPrice - discount) * qty
  cgst:         { type: Number, default: 0 },
  sgst:         { type: Number, default: 0 },
  igst:         { type: Number, default: 0 },
  lineTotal:    { type: Number, required: true },        // taxableAmount + total gst
  // Optional link to product for inventory deduction
  product:      { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  variantId:    { type: mongoose.Schema.Types.ObjectId, default: null },
}, { _id: true });

const invoiceSchema = new mongoose.Schema(
  {
    // ── Invoice Identity ────────────────────────────────────────────
    invoiceNumber: { type: String, unique: true },       // INV-2025-0001
    financialYear: { type: String },                      // e.g. "2025-26" (for yearly reset)
    type: {
      type: String,
      enum: ['order', 'manual'],
      default: 'manual',
    },
    status: {
      type: String,
      enum: ['draft', 'sent', 'payment_pending', 'paid', 'cancelled', 'refunded', 'revoked'],
      default: 'draft',
    },

    // ── Linked Order (optional) ──────────────────────────────────────
    linkedOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    // Linked user account (optional — for manual invoices with no account)
    linkedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // ── Client Details (snapshot) ────────────────────────────────────
    client: {
      name:     { type: String, required: true },
      email:    { type: String, default: '' },
      phone:    { type: String, default: '' },
      address:  { type: String, default: '' },
      city:     { type: String, default: '' },
      state:    { type: String, default: '' },
      pincode:  { type: String, default: '' },
      country:  { type: String, default: 'India' },
      gstin:    { type: String, default: '' },           // Client GSTIN (optional)
    },

    // ── Business Details (snapshot from settings at creation time) ───
    business: {
      name:     { type: String, default: '' },
      logo:     { type: String, default: '' },
      address:  { type: String, default: '' },
      phone:    { type: String, default: '' },
      email:    { type: String, default: '' },
      gstin:    { type: String, default: '' },
      state:    { type: String, default: '' },           // For GST computation
    },

    // ── Line Items ───────────────────────────────────────────────────
    items: [invoiceItemSchema],

    // ── GST Breakdown ────────────────────────────────────────────────
    subtotal:   { type: Number, default: 0 },            // Sum of taxable amounts
    totalCgst:  { type: Number, default: 0 },
    totalSgst:  { type: Number, default: 0 },
    totalIgst:  { type: Number, default: 0 },
    totalGst:   { type: Number, default: 0 },            // cgst+sgst+igst combined
    grandTotal: { type: Number, default: 0 },            // subtotal + totalGst

    // ── Other Charges ────────────────────────────────────────────────
    shippingCharge: { type: Number, default: 0 },
    discount:       { type: Number, default: 0 },        // Overall invoice discount
    roundOff:       { type: Number, default: 0 },        // Rounding diff

    // ── Dates ────────────────────────────────────────────────────────
    issueDate:  { type: Date, default: Date.now },
    dueDate:    { type: Date, default: null },

    // ── Notes / Terms ────────────────────────────────────────────────
    notes:      { type: String, default: '' },
    terms:      { type: String, default: '' },

    // ── Delivery Tracking ────────────────────────────────────────────
    emailSentAt:    { type: Date, default: null },
    whatsappSentAt: { type: Date, default: null },
    paidAt:         { type: Date, default: null },

    // ── Cancellation / Revocation ────────────────────────────────────
    cancelledAt:   { type: Date, default: null },
    cancelReason:  { type: String, default: '' },
    revokedAt:     { type: Date, default: null },
    revokeReason:  { type: String, default: '' },

    // ── Audit ────────────────────────────────────────────────────────
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// ── Auto-generate invoice number ─────────────────────────────────────
// Format: INV-2025-0001 (resets per financial year April-March)
invoiceSchema.pre('save', async function () {
  if (this.isNew && !this.invoiceNumber) {
    const now = new Date();
    const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const fy = `${year}-${String(year + 1).slice(-2)}`; // e.g. "2025-26"
    this.financialYear = fy;

    // Get prefix from settings (default INV)
    try {
      const SiteSettings = require('./SiteSettings.model');
      const settings = await SiteSettings.findOne().select('invoice').lean();
      const prefix = settings?.invoice?.invoicePrefix || 'INV';

      // Count invoices in this FY
      const count = await mongoose.model('Invoice').countDocuments({ financialYear: fy });
      const serial = String(count + 1).padStart(4, '0');
      this.invoiceNumber = `${prefix}-${year}-${serial}`;
    } catch (err) {
      // Fallback
      console.error('Failed to generate invoice number with settings', err);
      const count = await mongoose.model('Invoice').countDocuments();
      this.invoiceNumber = `INV-${year}-${String(count + 1).padStart(4, '0')}`;
    }
  }
});

// ── Indexes ──────────────────────────────────────────────────────────
invoiceSchema.index({ status: 1, createdAt: -1 });
invoiceSchema.index({ 'client.email': 1 });
invoiceSchema.index({ linkedOrder: 1 });
invoiceSchema.index({ linkedUser: 1 });
invoiceSchema.index({ financialYear: 1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
