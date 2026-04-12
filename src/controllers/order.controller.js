const crypto = require('crypto');
const Order = require('../models/Order.model');
const Cart = require('../models/Cart.model');
const Product = require('../models/Product.model');
const Coupon = require('../models/Coupon.model');
const Address = require('../models/Address.model');
const User = require('../models/User.model');
const { logActivity } = require('./auditLog.controller');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response.utils');
const sendEmail = require('../config/email');
const { 
  orderConfirmationTemplate, orderShippedTemplate, 
  orderDeliveredTemplate, orderCancelledTemplate 
} = require('../utils/emailTemplates');

const SHIPPING_CHARGE_THRESHOLD = 499; // free shipping above ₹499
const STANDARD_SHIPPING = 49;

// ─── Helper: calculate shipping ───────────────────────
const calcShipping = (subtotal, threshold = SHIPPING_CHARGE_THRESHOLD, charge = STANDARD_SHIPPING) => {
  return subtotal >= threshold ? 0 : charge;
};

// ─── Helper: compute GST for a product at a given selling price ─────
// Returns { baseUnitPrice, gstRate, gstAmountPerUnit, effectiveUnitPrice }
// effectiveUnitPrice is what the customer pays per unit
const computeGst = (sellingPrice, product, gstSettings) => {
  if (!gstSettings?.enabled || !product.isGstApplicable) {
    return { baseUnitPrice: sellingPrice, gstRate: 0, gstAmountPerUnit: 0, effectiveUnitPrice: sellingPrice };
  }
  const rate = (product.gstPercentage != null) ? product.gstPercentage : (gstSettings.gstPercentage ?? 18);
  
  // check product level override for included in price
  let includedInPrice = gstSettings.includedInPrice;
  if (product.gstIncludedInPrice === 'yes') includedInPrice = true;
  else if (product.gstIncludedInPrice === 'no') includedInPrice = false;

  if (includedInPrice) {
    // Price already includes GST — extract base
    const base = sellingPrice / (1 + rate / 100);
    const gstPerUnit = sellingPrice - base;
    return { baseUnitPrice: parseFloat(base.toFixed(2)), gstRate: rate, gstAmountPerUnit: parseFloat(gstPerUnit.toFixed(2)), effectiveUnitPrice: sellingPrice };
  } else {
    // GST added on top
    const gstPerUnit = sellingPrice * rate / 100;
    return { baseUnitPrice: sellingPrice, gstRate: rate, gstAmountPerUnit: parseFloat(gstPerUnit.toFixed(2)), effectiveUnitPrice: parseFloat((sellingPrice + gstPerUnit).toFixed(2)) };
  }
};

// ─── Place Order ───────────────────────────────────────
exports.placeOrder = async (req, res) => {
  try {
    const { addressId, paymentMethod, customerNote, shippingMethod = 'standard' } = req.body;

    if (!addressId) return errorResponse(res, 400, 'Delivery address is required');
    if (!paymentMethod) return errorResponse(res, 400, 'Payment method is required');

    const validMethods = ['razorpay', 'cod', 'bank_transfer', 'stripe', 'wallet'];
    if (!validMethods.includes(paymentMethod))
      return errorResponse(res, 400, 'Invalid payment method');

    // Fetch address
    const address = await Address.findOne({ _id: addressId, user: req.user._id });
    if (!address) return errorResponse(res, 404, 'Delivery address not found');

    // Fetch cart — include GST fields in product snapshot
    const cart = await Cart.findOne({ user: req.user._id }).populate(
      'items.product',
      'name slug thumbnailImage productType deliveryDays stock maxOrderQuantity isActive isGstApplicable gstPercentage gstIncludedInPrice'
    );
    if (!cart || cart.items.length === 0) return errorResponse(res, 400, 'Cart is empty');

    // Load site settings for GST + shipping from DB (source of truth)
    const SiteSettings = require('../models/SiteSettings.model');
    const siteSettings = await SiteSettings.findOne();
    const gstSettings = siteSettings?.tax || {};
    const freeShippingThreshold = siteSettings?.shipping?.freeShippingThreshold || SHIPPING_CHARGE_THRESHOLD;
    const standardShippingCharge = siteSettings?.shipping?.standardShippingCharge || STANDARD_SHIPPING;
    const expressShippingCharge = siteSettings?.shipping?.expressShippingCharge || 99;
    const expressShippingEnabled = siteSettings?.shipping?.expressShippingEnabled || false;

    // Validate items and compute GST breakdown per item
    const orderItems = [];
    let orderGstTotal = 0;

    for (const item of cart.items) {
      const product = item.product;
      if (!product || !product.isActive)
        return errorResponse(res, 400, `Product "${item.product?.name || item.product}" is not available`);

      // Stock check
      if (product.stock !== undefined && product.stock !== null && product.stock < item.quantity) {
        return errorResponse(res, 400, `Insufficient stock for "${product.name}" (available: ${product.stock})`);
      }

      // GST computed on the effective selling price stored in cart (discountPrice already applied by cart controller)
      const { baseUnitPrice, gstRate, gstAmountPerUnit, effectiveUnitPrice } = computeGst(item.unitPrice, product, gstSettings);
      const lineGst = parseFloat((gstAmountPerUnit * item.quantity).toFixed(2));
      const lineTotal = parseFloat((effectiveUnitPrice * item.quantity).toFixed(2));
      orderGstTotal += lineGst;

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
        unitPrice: effectiveUnitPrice,  // per-unit price customer pays (GST inclusive if applicable)
        baseUnitPrice,                   // pre-GST price (equals unitPrice when GST not applicable)
        gstRate,                         // % applied (0 if N/A)
        gstAmount: lineGst,              // total GST for this line
        lineTotal,
        customization: item.customization,
      });
    }

    orderGstTotal = parseFloat(orderGstTotal.toFixed(2));
    const subtotal = parseFloat(orderItems.reduce((s, i) => s + i.lineTotal, 0).toFixed(2));

    let shippingCharge = 0;
    if (shippingMethod === 'express' && expressShippingEnabled) {
      shippingCharge = expressShippingCharge;
    } else {
      shippingCharge = calcShipping(subtotal, freeShippingThreshold, standardShippingCharge);
    }
    
    const couponDiscount = cart.appliedCoupon?.discountAmount || 0;
    const totalAmount = parseFloat(Math.max(0, subtotal + shippingCharge - couponDiscount).toFixed(2));

    // Estimated delivery date
    const maxDeliveryDays = Math.max(...cart.items.map((i) => i.product.deliveryDays || 5));
    const estimatedDeliveryDate = new Date(Date.now() + maxDeliveryDays * 24 * 60 * 60 * 1000);

    const orderData = {
      user: req.user._id,
      items: orderItems,
      subtotal,
      shippingCharge,
      couponDiscount,
      gstTotal: orderGstTotal,
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
      shippingMethod,
      coupon: cart.appliedCoupon?.code
        ? { code: cart.appliedCoupon.code, discountAmount: couponDiscount }
        : { code: null, discountAmount: 0 },
      paymentMethod,
      paymentStatus: 'pending',
      status: 'pending',
      estimatedDeliveryDate,
      customerNote: customerNote || null,
      statusHistory: [{ status: 'pending', note: 'Order placed by customer' }],
    };

    const order = await Order.create(orderData);

    // Stock deduction is now deferred to order confirmation if autoDeductStock is enabled.

    // Update coupon usage
    if (cart.appliedCoupon?.code) {
      await Coupon.findOneAndUpdate(
        { code: cart.appliedCoupon.code },
        { $inc: { usageCount: 1 }, $push: { usedBy: { user: req.user._id } } }
      );
    }

    // Clear cart
    cart.items = [];
    cart.appliedCoupon = { code: null, discountAmount: 0 };
    await cart.save();

    await logActivity(req.user._id, 'Order Placed', 'Order', order._id, `Order #${order.orderNumber} placed for ₹${order.totalAmount}`, req.ip);

    await order.populate('items.product', 'name slug thumbnailImage');

    // Razorpay
    let razorpayOrder = null;
    if (paymentMethod === 'razorpay') {
      try {
        const Razorpay = require('razorpay');
        const rzp = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
        razorpayOrder = await rzp.orders.create({
          amount: Math.round(totalAmount * 100),
          currency: 'INR',
          receipt: order.orderNumber,
          notes: { orderId: order._id.toString() },
        });
        order.paymentDetails = { razorpayOrderId: razorpayOrder.id };
        await order.save();
      } catch (rzpError) {
        console.warn('Razorpay not configured:', rzpError.message);
      }
    }

    // Confirmation email (COD)
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
      pricing: { subtotal, shippingCharge, couponDiscount, gstTotal: orderGstTotal, totalAmount },
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Shared Confirmation Logic ───────────────────────
const processOrderConfirmation = async (order, reqUser) => {
  try {
    const SiteSettings = require('../models/SiteSettings.model');
    const { createInvoiceFromOrder } = require('./invoice.controller');
    
    const settings = await SiteSettings.findOne().lean();
    
    // Auto-create Invoice
    if (settings?.invoice?.enabled) {
      if (!order.invoiceProcessed) {
        await createInvoiceFromOrder(order, reqUser._id);
        order.invoiceProcessed = true;
      } else {
        // Sync invoice status if payment status changed
        try {
          const Invoice = require('../models/Invoice.model');
          const invoiceStatus = order.paymentStatus === 'paid' ? 'paid' : 'payment_pending';
          await Invoice.findOneAndUpdate({ linkedOrder: order._id }, { status: invoiceStatus });
        } catch (e) {
          console.error('[Invoice Sync Error]:', e.message);
        }
      }
    }

    // Deduct Stock
    if (settings?.invoice?.autoDeductStock && !order.stockDeducted) {
      for (const item of order.items) {
        if (item.product) {
          await Product.findByIdAndUpdate(item.product, { $inc: { stock: -item.quantity } });
        }
      }
      order.stockDeducted = true;
    }
    
    order.invoiceProcessed = true;
    await order.save();
  } catch (error) {
    console.error('[Confirmation Logic Error]:', error.message);
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

    await processOrderConfirmation(order, req.user);

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

    const previousStatus = order.status;

    order.status = status;
    order.statusHistory.push({
      status,
      note: note || `Status updated to ${status}`,
      updatedBy: req.user._id,
    });

    if (req.body.markPaid) {
      order.paymentStatus = 'paid';
    }

    if (status === 'cancelled' && previousStatus !== 'cancelled') {
       if (order.stockDeducted) {
         for (const item of order.items) {
           if (item.product) {
             const Product = require('../models/Product.model');
             await Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity } });
           }
         }
         order.stockDeducted = false;
       }

       if (order.coupon && order.coupon.code) {
         const Coupon = require('../models/Coupon.model');
         await Coupon.findOneAndUpdate(
           { code: order.coupon.code },
           { $inc: { usageCount: -1 }, $pull: { usedBy: { user: order.user } } }
         );
       }

       order.cancelledAt = new Date();
       order.cancellationReason = note || 'Manually cancelled by admin';

       try {
         const Invoice = require('../models/Invoice.model');
         await Invoice.findOneAndUpdate({ linkedOrder: order._id }, { status: 'cancelled', cancelReason: 'Order cancelled' });
       } catch (e) {
         console.error('Failed to cancel invoice:', e.message);
       }
    }

    if (status === 'shipped') {
      if (trackingNumber) order.trackingNumber = trackingNumber;
      if (trackingUrl) order.trackingUrl = trackingUrl;
      if (courierName) order.courierName = courierName;
    }

    if (status === 'delivered') {
      order.deliveredAt = new Date();
      order.paymentStatus = 'paid';

      try {
        const Invoice = require('../models/Invoice.model');
        await Invoice.findOneAndUpdate({ linkedOrder: order._id }, { status: 'paid' });
      } catch (e) {
        console.error('Failed to update invoice paid status:', e.message);
      }
    }

    if (status === 'refunded') {
      order.paymentStatus = 'refunded';
      
      // Update Invoice status to refunded if exists
      try {
        const Invoice = require('../models/Invoice.model');
        await Invoice.findOneAndUpdate({ linkedOrder: order._id }, { status: 'refunded' });
      } catch (e) {
        console.error('Failed to update invoice refund status:', e.message);
      }
    }

    await order.save();
    
    // Call confirmation logic if confirming, or as a fallback on delivery if skipped
    if ((status === 'confirmed' && previousStatus !== 'confirmed') || (status === 'delivered' && !order.invoiceProcessed)) {
      await processOrderConfirmation(order, req.user);
    }
    
    await logActivity(req.user._id, `Order Status Updated`, 'Order', order._id, `Order #${order.orderNumber} status changed to ${status}`, req.ip);
    
    // Send status update emails
    try {
      const user = await User.findById(order.user);
      let subject = '';
      let html = '';

      if (status === 'shipped') {
        subject = `\u{1F680} Your Order #${order.orderNumber} has been Shipped!`;
        html = orderShippedTemplate(user.name, order);
      } else if (status === 'delivered') {
        subject = `\u{1F381} Delivered: Your Order #${order.orderNumber}`;
        html = orderDeliveredTemplate(user.name, order);
      } else if (status === 'cancelled') {
        subject = `\u{274C} Order Cancelled: #${order.orderNumber}`;
        html = orderCancelledTemplate(user.name, order, note);
      }

      if (subject && html) {
        await sendEmail({ to: user.email, subject, html });
      }
    } catch (e) { console.error('[Email] Status update email error:', e.message); }

    return successResponse(res, 200, 'Order status updated', { order });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

exports.adminProcessShipment = async (req, res) => {
  try {
    const { method, trackingNumber, trackingUrl, courierName } = req.body;
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email phone')
      .populate('items.product', 'name slug thumbnailImage isGstApplicable gstPercentage');
    
    if (!order) return errorResponse(res, 404, 'Order not found');
    
    if (['shipped', 'delivered', 'cancelled', 'refunded'].includes(order.status)) {
      return errorResponse(res, 400, `Cannot process shipment for order in '${order.status}' status.`);
    }

    if (method === 'shiprocket') {
      const { createOrderAndAwb } = require('../utils/shiprocket.utils');
      try {
         const srData = await createOrderAndAwb(order, order.items);
         
         order.isManualShipped = false;
         order.shipmentId = srData.shipmentId;
         order.trackingNumber = srData.awbCode || null;
         order.courierName = srData.courierName || 'Shiprocket Partner';
         order.labelUrl = srData.labelUrl || null;
         order.trackingUrl = srData.awbCode ? `https://shiprocket.co/tracking/${srData.awbCode}` : null;
         order.status = srData.awbCode ? 'shipped' : 'ready_to_ship';
         order.statusHistory.push({
           status: order.status,
           note: `Shipment created via Shiprocket. Shipment ID: ${srData.shipmentId}. ${srData.awbCode ? `AWB: ${srData.awbCode}` : 'AWB pending assignment.'}`,
           updatedBy: req.user._id
         });
      } catch (err) {
         return errorResponse(res, 500, err.message);
      }
    } else if (method === 'manual') {
       if (!trackingNumber || !courierName) {
          return errorResponse(res, 400, 'Tracking number and courier name are required for manual shipment.');
       }
       order.isManualShipped = true;
       order.trackingNumber = trackingNumber;
       order.courierName = courierName;
       order.trackingUrl = trackingUrl || null;
       order.status = 'shipped';
       order.statusHistory.push({
         status: 'shipped',
         note: `Manually shipped via ${courierName}. AWB: ${trackingNumber}`,
         updatedBy: req.user._id
       });
    } else {
       return errorResponse(res, 400, 'Invalid shipment method. Use "shiprocket" or "manual".');
    }

    await order.save();
    await logActivity(req.user._id, 'Shipment Processed', 'Order', order._id, `Shipment for #${order.orderNumber} processed via ${method}`, req.ip);

    // Send shipment confirmation email
    if (order.status === 'shipped') {
       try {
         const user = order.user;
         if (user?.email) {
           await sendEmail({
             to: user.email,
             subject: `\u{1F680} Your Order #${order.orderNumber} Has Been Shipped!`,
             html: orderShippedTemplate(user.name, order)
           });
         }
       } catch (e) {
          console.error('[Email] Shipment email error:', e.message);
       }
    }

    return successResponse(res, 200, 'Shipment processed successfully', { order });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Admin: Sync Tracking from Shiprocket ─────────────────────
exports.adminSyncShiprocketTracking = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('user', 'name email');
    if (!order) return errorResponse(res, 404, 'Order not found');
    if (order.isManualShipped !== false) {
      return errorResponse(res, 400, 'This order was not shipped via Shiprocket.');
    }
    if (!order.trackingNumber) {
      return errorResponse(res, 400, 'No AWB code found. Cannot sync tracking.');
    }

    const { getTrackingStatus, mapShiprocketStatusToOrderStatus } = require('../utils/shiprocket.utils');
    
    const trackingResult = await getTrackingStatus(order.trackingNumber);
    const { currentStatus, etd, shipmentTrack, shipmentActivity } = trackingResult;
    
    // Determine if status should be auto-updated
    const mappedStatus = mapShiprocketStatusToOrderStatus(currentStatus);
    let statusChanged = false;

    if (mappedStatus && mappedStatus !== order.status) {
      const previousStatus = order.status;
      order.status = mappedStatus;
      order.statusHistory.push({
        status: mappedStatus,
        note: `Auto-synced from Shiprocket: "${currentStatus}"`,
        updatedBy: req.user._id
      });
      statusChanged = true;

      // Handle delivered status
      if (mappedStatus === 'delivered' && !order.deliveredAt) {
        order.deliveredAt = new Date();
        order.paymentStatus = 'paid';
      }

      await order.save();

      // Send delivery email if just delivered
      if (mappedStatus === 'delivered' && previousStatus !== 'delivered') {
        try {
          const user = order.user;
          if (user?.email) {
            await sendEmail({
              to: user.email,
              subject: `\u{1F381} Delivered: Your Order #${order.orderNumber}`,
              html: orderDeliveredTemplate(user.name, order)
            });
          }
        } catch (e) {
          console.error('[Email] Delivery email error:', e.message);
        }
      }
    }

    await logActivity(req.user._id, 'Tracking Synced', 'Order', order._id, `Shiprocket tracking synced for #${order.orderNumber}. Status: ${currentStatus}`, req.ip);

    return successResponse(res, 200, 'Tracking synced from Shiprocket', {
      order,
      tracking: {
        currentStatus,
        etd,
        statusChanged,
        mappedStatus,
        latestEvents: (shipmentTrack || []).slice(0, 5),
      }
    });
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

// ─── Admin: Handle Return Request ──────────────────
exports.adminHandleReturnRequest = async (req, res) => {
  try {
    const { action } = req.body;
    const order = await Order.findById(req.params.id).populate('user', 'name email');
    if (!order) return errorResponse(res, 404, 'Order not found');

    if (!order.returnRequest?.requested) {
      return errorResponse(res, 400, 'No return request found for this order');
    }

    order.returnRequest.processedAt = new Date();
    order.returnRequest.processedBy = req.user._id;

    let emailSubject = '';
    let emailNote = '';

    if (action === 'approve') {
       if (['approved', 'rejected'].includes(order.returnRequest.status)) {
         return errorResponse(res, 400, `Return is already ${order.returnRequest.status}.`);
       }
       order.returnRequest.status = 'approved';
       emailSubject = `\u{2705} Return Approved: Order #${order.orderNumber}`;
       emailNote = 'Your return request has been approved. Please ship the items back to us within 7 days.';
       order.statusHistory.push({ status: order.status, note: 'Return approved. Customer notified to ship items back.', updatedBy: req.user._id });
    } else if (action === 'reject') {
       order.returnRequest.status = 'rejected';
       emailSubject = `\u{274C} Return Request Declined: Order #${order.orderNumber}`;
       emailNote = 'We are sorry, your return request could not be approved at this time. Please contact support for assistance.';
       order.statusHistory.push({ status: order.status, note: 'Return request rejected by admin.', updatedBy: req.user._id });
    } else if (action === 'receive_items') {
       if (order.returnRequest.status !== 'approved') {
         return errorResponse(res, 400, 'Return must be approved before marking items as received.');
       }
       order.returnRequest.status = 'items_received';
       order.statusHistory.push({ status: order.status, note: 'Returned items received and inspected by warehouse.', updatedBy: req.user._id });
    } else if (action === 'issue_refund') {
       if (order.returnRequest.status !== 'items_received') {
         return errorResponse(res, 400, 'Items must be received before issuing a refund.');
       }
       order.returnRequest.refundStatus = 'refunded';
       order.status = 'refunded';
       order.paymentStatus = 'refunded';
       emailSubject = `\u{1F4B8} Refund Processed: Order #${order.orderNumber}`;
       emailNote = `Your refund of \u20B9${order.totalAmount?.toFixed(2)} has been initiated and should reflect within 5-7 business days.`;
       order.statusHistory.push({ status: 'refunded', note: 'Refund issued after successful return inspection. Order closed.', updatedBy: req.user._id });
    } else {
       return errorResponse(res, 400, 'Invalid action. Valid: approve, reject, receive_items, issue_refund');
    }

    await order.save();
    await logActivity(req.user._id, 'Return Request Actioned', 'Order', order._id, `Return '${action}' on Order #${order.orderNumber}`, req.ip);

    // Email customer
    if (emailSubject && order.user?.email) {
      try {
        await sendEmail({
          to: order.user.email,
          subject: emailSubject,
          html: `<div style="font-family:sans-serif;max-width:560px;padding:32px;background:#f9f9f9;border-radius:12px"><h2 style="margin-bottom:8px">${emailSubject}</h2><p style="color:#555">${emailNote}</p><p>Order Number: <strong>#${order.orderNumber}</strong></p><p style="color:#888;font-size:13px">If you have any questions, contact us at support@printicom.in</p></div>`
        });
      } catch (e) { console.error('[Email] Return notification error:', e.message); }
    }

    return successResponse(res, 200, `Return '${action}' processed successfully`, { order });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

