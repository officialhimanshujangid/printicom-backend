const crypto = require('crypto');
const Order = require('../models/Order.model');
const Cart = require('../models/Cart.model');
const Product = require('../models/Product.model');
const Coupon = require('../models/Coupon.model');
const Address = require('../models/Address.model');
const User = require('../models/User.model');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response.utils');
const sendEmail = require('../config/email');
const { 
  orderConfirmationTemplate, orderShippedTemplate, 
  orderDeliveredTemplate, orderCancelledTemplate 
} = require('../utils/emailTemplates');

const SHIPPING_CHARGE_THRESHOLD = 499; // free shipping above ₹499
const STANDARD_SHIPPING = 49;

// ─── Helper: calculate shipping ───────────────────────
const calcShipping = (subtotal) => {
  return subtotal >= SHIPPING_CHARGE_THRESHOLD ? 0 : STANDARD_SHIPPING;
};

// ─── Place Order ───────────────────────────────────────
exports.placeOrder = async (req, res) => {
  try {
    const { addressId, paymentMethod, customerNote } = req.body;

    if (!addressId) return errorResponse(res, 400, 'Delivery address is required');
    if (!paymentMethod) return errorResponse(res, 400, 'Payment method is required');

    const validMethods = ['razorpay', 'cod', 'bank_transfer', 'stripe', 'wallet'];
    if (!validMethods.includes(paymentMethod))
      return errorResponse(res, 400, 'Invalid payment method');

    // Fetch address
    const address = await Address.findOne({ _id: addressId, user: req.user._id });
    if (!address) return errorResponse(res, 404, 'Delivery address not found');

    // Fetch cart with products
    const cart = await Cart.findOne({ user: req.user._id }).populate('items.product');
    if (!cart || cart.items.length === 0) return errorResponse(res, 400, 'Cart is empty');

    // Validate all items
    const orderItems = [];
    for (const item of cart.items) {
      const product = item.product;
      if (!product || !product.isActive)
        return errorResponse(res, 400, `Product "${item.product?.name || item.product}" is not available`);

      // ─── Stock check per item ───────────────────────────────────
      if (product.stock !== undefined && product.stock !== null && product.stock < item.quantity) {
        return errorResponse(res, 400, `Insufficient stock for "${product.name}" (available: ${product.stock})`);
      }

      orderItems.push({
        product: product._id,
        productSnapshot: {
          name: product.name,
          thumbnailImage: product.thumbnailImage,
          productType: product.productType,
          slug: product.slug,
        },
        variantId: item.variantId || null,
        variantName: item.variantName || null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.unitPrice * item.quantity,
        customization: item.customization,
      });
    }

    const subtotal = orderItems.reduce((s, i) => s + i.lineTotal, 0);
    const shippingCharge = calcShipping(subtotal);
    const couponDiscount = cart.appliedCoupon?.discountAmount || 0;
    const totalAmount = Math.max(0, subtotal + shippingCharge - couponDiscount);

    // Estimated delivery date (max deliveryDays from all products)
    const maxDeliveryDays = Math.max(
      ...cart.items.map((i) => i.product.deliveryDays || 5)
    );
    const estimatedDeliveryDate = new Date(Date.now() + maxDeliveryDays * 24 * 60 * 60 * 1000);

    const orderData = {
      user: req.user._id,
      items: orderItems,
      subtotal,
      shippingCharge,
      couponDiscount,
      totalAmount,
      shippingAddress: {
        fullName: address.fullName,
        phone: address.phone,
        street: address.street,
        landmark: address.landmark,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        country: address.country,
      },
      coupon: cart.appliedCoupon?.code
        ? { code: cart.appliedCoupon.code, discountAmount: couponDiscount }
        : { code: null, discountAmount: 0 },
      paymentMethod,
      paymentStatus: paymentMethod === 'cod' ? 'pending' : paymentMethod === 'bank_transfer' ? 'pending' : 'pending',
      status: 'pending',
      estimatedDeliveryDate,
      customerNote: customerNote || null,
      statusHistory: [{ status: 'pending', note: 'Order placed by customer' }],
    };

    const order = await Order.create(orderData);

    // ─── Deduct stock for each product item ───────────────────
    for (const item of cart.items) {
      const product = item.product;
      if (product.stock !== undefined && product.stock !== null) {
        await Product.findByIdAndUpdate(product._id, {
          $inc: { stock: -item.quantity },
        });
      }
    }

    // Update coupon usage if applied
    if (cart.appliedCoupon?.code) {
      await Coupon.findOneAndUpdate(
        { code: cart.appliedCoupon.code },
        {
          $inc: { usageCount: 1 },
          $push: { usedBy: { user: req.user._id } },
        }
      );
    }

    // Clear cart after order
    cart.items = [];
    cart.appliedCoupon = { code: null, discountAmount: 0 };
    await cart.save();

    await order.populate('items.product', 'name slug thumbnailImage');

    // If Razorpay — create Razorpay order
    let razorpayOrder = null;
    if (paymentMethod === 'razorpay') {
      try {
        const Razorpay = require('razorpay');
        const rzp = new Razorpay({
          key_id: process.env.RAZORPAY_KEY_ID,
          key_secret: process.env.RAZORPAY_KEY_SECRET,
        });
        razorpayOrder = await rzp.orders.create({
          amount: Math.round(totalAmount * 100), // paise
          currency: 'INR',
          receipt: order.orderNumber,
          notes: { orderId: order._id.toString() },
        });
        order.paymentDetails = { razorpayOrderId: razorpayOrder.id };
        await order.save();
      } catch (rzpError) {
        // Continue without Razorpay if keys not configured
        console.warn('Razorpay not configured:', rzpError.message);
      }
    }

    // Send confirmation email for COD orders immediately
    if (paymentMethod === 'cod') {
      try {
        const user = await User.findById(req.user._id);
        await sendEmail({
          to: user.email,
          subject: `🛒 Order Confirmed: #${order.orderNumber}`,
          html: orderConfirmationTemplate(user.name, order),
        });
      } catch (e) { console.error('Email error:', e.message); }
    }

    return successResponse(res, 201, 'Order placed successfully', {
      order,
      razorpayOrder,
      pricing: { subtotal, shippingCharge, couponDiscount, totalAmount },
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Verify Razorpay Payment ───────────────────────────
exports.verifyPayment = async (req, res) => {
  try {
    const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    const order = await Order.findOne({ _id: orderId, user: req.user._id });
    if (!order) return errorResponse(res, 404, 'Order not found');

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'secret')
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (expectedSignature !== razorpaySignature)
      return errorResponse(res, 400, 'Payment verification failed. Invalid signature.');

    order.paymentStatus = 'paid';
    order.status = 'confirmed';
    order.paymentDetails = {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      paidAt: new Date(),
    };
    order.statusHistory.push({ status: 'confirmed', note: 'Payment verified successfully' });
    await order.save();

    // Send confirmation email after payment
    try {
      const user = await User.findById(req.user._id);
      await sendEmail({
        to: user.email,
        subject: `✅ Payment Verified & Order Confirmed: #${order.orderNumber}`,
        html: orderConfirmationTemplate(user.name, order),
      });
    } catch (e) { console.error('Email error:', e.message); }

    return successResponse(res, 200, 'Payment verified successfully', { order });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Get My Orders ─────────────────────────────────────
exports.getMyOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = { user: req.user._id };
    if (status) filter.status = status;

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('-statusHistory -adminNote'),
      Order.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));
    return paginatedResponse(res, 'Orders fetched', orders, {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages,
      hasNextPage: parseInt(page) < totalPages,
      hasPrevPage: parseInt(page) > 1,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Get Single Order ──────────────────────────────────
exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id }).populate(
      'items.product',
      'name slug thumbnailImage productType'
    );
    if (!order) return errorResponse(res, 404, 'Order not found');
    return successResponse(res, 200, 'Order fetched', { order });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Track Order by Order Number ──────────────────────
exports.trackOrder = async (req, res) => {
  try {
    const { orderNumber } = req.params;

    const order = await Order.findOne({ orderNumber }).select(
      'orderNumber status statusHistory estimatedDeliveryDate deliveredAt trackingNumber trackingUrl courierName shippingAddress items.productSnapshot items.quantity createdAt'
    );

    if (!order) return errorResponse(res, 404, 'Order not found with this Order Number');

    return successResponse(res, 200, 'Order tracking info', { order });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Request Order Cancellation (Client) ──────────────────────
exports.requestCancellation = async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!order) return errorResponse(res, 404, 'Order not found');

    const notCancellableStatuses = ['shipped', 'delivered', 'cancelled', 'refunded', 'refund_initiated'];
    if (notCancellableStatuses.includes(order.status))
      return errorResponse(res, 400, `Order cannot be cancelled at this stage (${order.status}).`);

    if (order.cancellationRequest?.requested)
      return errorResponse(res, 400, 'Cancellation request already submitted.');

    // If order is just pending COD, we can cancel instantly, otherwise lodge a request
    if (order.status === 'pending' && order.paymentMethod === 'cod') {
       order.status = 'cancelled';
       order.cancellationReason = reason || 'Cancelled by customer';
       order.cancelledAt = new Date();
        order.statusHistory.push({ status: 'cancelled', note: 'Customer instantly cancelled COD order', updatedBy: req.user._id });

        // Restore stock for cancelled order
        for (const item of order.items) {
          await Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity } });
        }

        // Restore Coupon if used
        if (order.coupon && order.coupon.code) {
          await Coupon.findOneAndUpdate(
            { code: order.coupon.code },
            { 
              $inc: { usageCount: -1 },
              $pull: { usedBy: { user: order.user } } 
            }
          );
        }
    } else {
       order.cancellationRequest = {
         requested: true,
         reason: reason || 'Customer requested cancellation',
         status: 'pending'
       };
       order.statusHistory.push({ status: order.status, note: 'Cancellation requested by customer', updatedBy: req.user._id });
    }

    await order.save();
    return successResponse(res, 200, 'Cancellation request submitted successfully', { order });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Request Order Return (Client) ──────────────────────────
exports.requestReturn = async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!order) return errorResponse(res, 404, 'Order not found');

    if (order.status !== 'delivered')
      return errorResponse(res, 400, 'Only delivered orders can be returned.');

    if (order.returnRequest?.requested)
      return errorResponse(res, 400, 'Return request already submitted.');

    order.returnRequest = {
      requested: true,
      reason: reason || 'Customer requested return',
      status: 'pending',
      refundStatus: 'pending'
    };
    order.statusHistory.push({ status: order.status, note: 'Return requested by customer', updatedBy: req.user._id });

    await order.save();
    return successResponse(res, 200, 'Return request submitted successfully', { order });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Admin: Get All Orders ─────────────────────────────
exports.adminGetAllOrders = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      paymentMethod,
      paymentStatus,
      search,
      sortBy = 'createdAt',
      order = 'desc',
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filter = {};
    if (status) filter.status = status;
    if (paymentMethod) filter.paymentMethod = paymentMethod;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (search) filter.orderNumber = { $regex: search, $options: 'i' };

    const sortOpts = { [sortBy]: order === 'asc' ? 1 : -1 };

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('user', 'name email phone')
        .sort(sortOpts)
        .skip(skip)
        .limit(parseInt(limit)),
      Order.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));
    return paginatedResponse(res, 'All orders fetched', orders, {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Admin: Get Order Detail ───────────────────────────
exports.adminGetOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email phone')
      .populate('items.product', 'name slug thumbnailImage');
    if (!order) return errorResponse(res, 404, 'Order not found');
    return successResponse(res, 200, 'Order detail', { order });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Admin: Update Order Status ────────────────────────
exports.adminUpdateOrderStatus = async (req, res) => {
  try {
    const { status, note, trackingNumber, trackingUrl, courierName } = req.body;

    const validStatuses = [
      'pending', 'payment_failed', 'confirmed', 'processing',
      'ready_to_ship', 'shipped', 'delivered', 'cancelled',
      'refund_initiated', 'refunded',
    ];

    if (!validStatuses.includes(status))
      return errorResponse(res, 400, 'Invalid order status');

    const order = await Order.findById(req.params.id);
    if (!order) return errorResponse(res, 404, 'Order not found');

    order.status = status;
    order.statusHistory.push({
      status,
      note: note || `Status updated to ${status}`,
      updatedBy: req.user._id,
    });

    if (status === 'shipped') {
      if (trackingNumber) order.trackingNumber = trackingNumber;
      if (trackingUrl) order.trackingUrl = trackingUrl;
      if (courierName) order.courierName = courierName;
    }

    if (status === 'delivered') {
      order.deliveredAt = new Date();
      order.paymentStatus = 'paid';
    }

    if (status === 'refunded') {
      order.paymentStatus = 'refunded';
    }

    await order.save();
    
    // Send status update emails
    try {
      const user = await User.findById(order.user);
      let subject = '';
      let html = '';
      
      if (status === 'shipped') {
        subject = `🚀 Your Order #${order.orderNumber} has been Shipped!`;
        html = orderShippedTemplate(user.name, order);
      } else if (status === 'delivered') {
        subject = `🎁 Delivered: Your Order #${order.orderNumber}`;
        html = orderDeliveredTemplate(user.name, order);
      } else if (status === 'cancelled') {
        subject = `❌ Order Cancelled: #${order.orderNumber}`;
        html = orderCancelledTemplate(user.name, order, note);
      }
      
      if (subject && html) {
        await sendEmail({ to: user.email, subject, html });
      }
    } catch (e) { console.error('Email error during status update:', e.message); }

    return successResponse(res, 200, 'Order status updated', { order });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Admin: Add Tracking ───────────────────────────────
exports.adminAddTracking = async (req, res) => {
  try {
    const { trackingNumber, trackingUrl, courierName } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return errorResponse(res, 404, 'Order not found');

    order.trackingNumber = trackingNumber || order.trackingNumber;
    order.trackingUrl = trackingUrl || order.trackingUrl;
    order.courierName = courierName || order.courierName;
    if (trackingNumber && order.status === 'processing') {
      order.status = 'shipped';
      order.statusHistory.push({ status: 'shipped', note: `Shipped via ${courierName || 'courier'}` });
    }
    await order.save();

    return successResponse(res, 200, 'Tracking info updated', { order });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Admin: Handle Cancellation Request ──────────────────
exports.adminHandleCancellationRequest = async (req, res) => {
  try {
    const { action } = req.body; // 'approve' or 'reject'
    const order = await Order.findById(req.params.id);
    if (!order) return errorResponse(res, 404, 'Order not found');

    if (!order.cancellationRequest || !order.cancellationRequest.requested) {
      return errorResponse(res, 400, 'No cancellation request found for this order');
    }

    if (action === 'approve') {
       order.cancellationRequest.status = 'approved';
       order.cancellationRequest.processedAt = new Date();
       order.cancellationRequest.processedBy = req.user._id;

       order.status = 'cancelled';
       order.cancelledAt = new Date();
       order.cancellationReason = order.cancellationRequest.reason;
       order.statusHistory.push({ status: 'cancelled', note: 'Cancellation request approved by admin', updatedBy: req.user._id });
       
       if (order.paymentStatus === 'paid') {
          order.status = 'refund_initiated';
          order.statusHistory.push({ status: 'refund_initiated', note: 'Refund initiated for approved cancellation', updatedBy: req.user._id });
       }

       // ─── Restore stock for cancelled order ────────────────────────────────
       for (const item of order.items) {
         await Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity } });
       }

       // ─── Restore Coupon if used ──────────────────────────────────────────
       if (order.coupon && order.coupon.code) {
         await Coupon.findOneAndUpdate(
           { code: order.coupon.code },
           { 
             $inc: { usageCount: -1 },
             $pull: { usedBy: { user: order.user } } 
           }
         );
       }
    } else if (action === 'reject') {
       order.cancellationRequest.status = 'rejected';
       order.cancellationRequest.processedAt = new Date();
       order.cancellationRequest.processedBy = req.user._id;
       order.statusHistory.push({ status: order.status, note: 'Cancellation request rejected by admin', updatedBy: req.user._id });
    } else {
       return errorResponse(res, 400, 'Invalid action');
    }

    await order.save();
    return successResponse(res, 200, `Cancellation request ${action}d successfully`, { order });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Admin: Handle Return Request ────────────────────────
exports.adminHandleReturnRequest = async (req, res) => {
  try {
    const { action } = req.body; // 'approve', 'reject', 'receive_items', 'issue_refund'
    const order = await Order.findById(req.params.id);
    if (!order) return errorResponse(res, 404, 'Order not found');

    if (!order.returnRequest || !order.returnRequest.requested) {
      return errorResponse(res, 400, 'No return request found for this order');
    }

    order.returnRequest.processedAt = new Date();
    order.returnRequest.processedBy = req.user._id;

    if (action === 'approve') {
       order.returnRequest.status = 'approved';
       order.statusHistory.push({ status: order.status, note: 'Return request approved by admin', updatedBy: req.user._id });
    } else if (action === 'reject') {
       order.returnRequest.status = 'rejected';
       order.statusHistory.push({ status: order.status, note: 'Return request rejected by admin', updatedBy: req.user._id });
    } else if (action === 'receive_items') {
       order.returnRequest.status = 'items_received';
       order.statusHistory.push({ status: order.status, note: 'Returned items received by admin', updatedBy: req.user._id });
    } else if (action === 'issue_refund') {
       order.returnRequest.refundStatus = 'refunded';
       order.status = 'refunded';
       order.paymentStatus = 'refunded';
       order.statusHistory.push({ status: 'refunded', note: 'Refund issued for returned order', updatedBy: req.user._id });
    } else {
       return errorResponse(res, 400, 'Invalid action');
    }

    await order.save();
    return successResponse(res, 200, `Return request action '${action}' processed successfully`, { order });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

