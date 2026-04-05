const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    // Target: null = broadcast to all users, or specific user
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // null = global/broadcast
    },
    type: {
      type: String,
      enum: [
        // Order lifecycle
        'order_confirmed',
        'order_processing',
        'order_shipped',
        'order_delivered',
        'order_cancelled',
        // Payment
        'payment_success',
        'payment_failed',
        'refund_initiated',
        'refund_completed',
        // Admin broadcasts
        'new_offer',
        'promotion',
        'info',
        'success',
        'warning',
        'order_update',
        // General
        'account_update',
        'review_reply',
        'system',
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 100,
    },
    message: {
      type: String,
      required: true,
      maxlength: 500,
    },
    link: {
      type: String,
      default: null, // e.g. "/orders/PTC-12345"
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    relatedOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // null = system-generated
    },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
