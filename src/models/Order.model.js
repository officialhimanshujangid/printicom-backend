const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  productSnapshot: {
    name: String,
    thumbnailImage: String,
    productType: String,
    slug: String,
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
    min: 1,
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  lineTotal: {
    type: Number,
    required: true,
    min: 0,
  },
  // Dynamic customization data snapshot - keyed by fieldId
  // { fieldId: { label, type, value } }
  customization: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
});

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    items: [orderItemSchema],

    // ── Pricing ────────────────────────────────────────────
    subtotal: { type: Number, required: true, min: 0 },
    shippingCharge: { type: Number, default: 0, min: 0 },
    couponDiscount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },

    // ── Shipping Address (snapshot) ──────────────────────
    shippingAddress: {
      fullName: String,
      phone: String,
      street: String,
      landmark: String,
      city: String,
      state: String,
      pincode: String,
      country: { type: String, default: 'India' },
    },

    // ── Coupon ────────────────────────────────────────────
    coupon: {
      code: { type: String, default: null },
      discountAmount: { type: Number, default: 0 },
    },

    // ── Order Status (Zoomin-style flow) ──────────────────
    status: {
      type: String,
      enum: [
        'pending',          // order placed, payment pending
        'payment_failed',   // payment failed
        'confirmed',        // payment done
        'processing',       // in production/printing
        'ready_to_ship',    // printed, ready for dispatch
        'shipped',          // out for delivery
        'delivered',        // delivered
        'cancelled',        // cancelled by user/admin
        'refund_initiated', // refund started
        'refunded',         // refund completed
      ],
      default: 'pending',
    },

    // ── Status History / Timeline ─────────────────────────
    statusHistory: [
      {
        status: String,
        timestamp: { type: Date, default: Date.now },
        note: String,
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      },
    ],

    // ── Payment ───────────────────────────────────────────
    paymentMethod: {
      type: String,
      enum: ['razorpay', 'cod', 'stripe', 'wallet'],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    paymentDetails: {
      razorpayOrderId: String,
      razorpayPaymentId: String,
      razorpaySignature: String,
      paidAt: Date,
    },

    // ── Delivery / Tracking ───────────────────────────────
    estimatedDeliveryDate: Date,
    deliveredAt: Date,
    trackingNumber: String,
    trackingUrl: String,
    courierName: String,

    // ── Cancellation Management ──────────────────────────────────────
    cancellationRequest: {
      requested: { type: Boolean, default: false },
      reason: String,
      status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
      processedAt: Date,
      processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    
    // ── Return Management ──────────────────────────────────────
    returnRequest: {
      requested: { type: Boolean, default: false },
      reason: String,
      status: { type: String, enum: ['pending', 'approved', 'rejected', 'items_received'], default: 'pending' },
      refundStatus: { type: String, enum: ['pending', 'refunded'], default: 'pending' },
      processedAt: Date,
      processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    cancelledAt: Date,
    cancellationReason: String,

    // ── Notes ────────────────────────────────────────────
    customerNote: String,
    adminNote: String,
  },
  { timestamps: true }
);

// ── Auto-generate order number ──────────────────────────
orderSchema.pre('save', async function () {
  if (!this.orderNumber) {
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(1000 + Math.random() * 9000);
    this.orderNumber = `PTC-${timestamp}-${random}`;
  }
});

// ── Index for common queries ────────────────────────────
// Note: orderNumber already has a unique index via { unique: true } in the field definition
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1 });

module.exports = mongoose.model('Order', orderSchema);
