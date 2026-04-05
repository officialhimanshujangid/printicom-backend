const BulkOrder = require('../models/BulkOrder.model');
const Product = require('../models/Product.model');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response.utils');
const sendEmail = require('../config/email');

// ─── PUBLIC: Submit a bulk order inquiry ─────────────────────
exports.submitBulkOrder = async (req, res) => {
  try {
    const {
      name, email, phone, productId, quantityEstimate,
      company, message, budgetRange, timeline,
      preferredContactMethod, whatsappNumber
    } = req.body;

    if (!name || !email || !productId) {
      return errorResponse(res, 400, 'Name, email and product are required');
    }

    const product = await Product.findById(productId).select('name');
    if (!product) return errorResponse(res, 404, 'Product not found');

    const qty = parseInt(quantityEstimate, 10);
    const priority = qty >= 100 ? 'Urgent' : (qty >= 50 ? 'High' : 'Normal');

    const bulkOrder = await BulkOrder.create({
      name, email, phone: phone || '', company: company || '',
      product: product._id, productName: product.name,
      quantityEstimate: Number.isFinite(qty) ? qty : null,
      budgetRange: budgetRange || '',
      timeline: timeline || '',
      message: message || `Enquiry for ${product.name}`,
      whatsappNumber: whatsappNumber || '',
      preferredContactMethod: preferredContactMethod || 'Email',
      priority,
      userId: req.user?._id || null,
    });

    // Send confirmation email to user
    try {
      await sendEmail({
        to: email,
        subject: `📋 Bulk Inquiry Received: ${product.name} — Printicom`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:32px;background:#fdfdfd;border:1px solid #eee;border-radius:12px;">
            <h2 style="color:#FF6B35;">Hi ${name},</h2>
            <p>Thank you for requesting a bulk quote for <strong>${product.name}</strong>. Our custom sales team has received your inquiry and will provide a personalized proposal with tiered pricing and estimated delivery timelines within <strong>24 hours</strong>.</p>
            <div style="background:#fef5f0;border-left:4px solid #FF6B35;padding:16px;border-radius:8px;margin:20px 0;">
              <p style="margin:0;font-size:14px;color:#666;">Estimate Qty: <strong>${qty || 'N/A'}</strong></p>
              <p style="margin:0;font-size:14px;color:#666;">Requirement: <em>${message || '—'}</em></p>
            </div>
            <p style="color:#888;font-size:13px;">If you have immediate questions, feel free to reply to this email or reach us on WhatsApp at +91-XXXXXXXXXX.</p>
            <hr style="border:none;border-top:1px solid #eee;margin:24px 0;"/>
            <p style="text-align:center;font-size:12px;color:#aaa;">© Printicom B2B Support</p>
          </div>
        `,
      });
    } catch (_) {}

    return successResponse(res, 201, 'Request received! Our team will contact you shortly with custom pricing.', {
      id: bulkOrder._id,
    });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
};

// ─── ADMIN: List bulk order inquiries ─────────────────────────
exports.adminListBulkOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, priority } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (priority) filter.priority = priority;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [orders, total] = await Promise.all([
      BulkOrder.find(filter)
        .populate('product', 'name slug thumbnailImage')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      BulkOrder.countDocuments(filter),
    ]);

    return paginatedResponse(res, 'Bulk order inquiries', orders, {
      total, page: parseInt(page), limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
};

// ─── ADMIN: Get details ───────────────────────────────────────
exports.adminGetDetail = async (req, res) => {
  try {
    const order = await BulkOrder.findById(req.params.id)
      .populate('product', 'name slug thumbnailImage basePrice discountPrice');
    if (!order) return errorResponse(res, 404, 'Enquiry not found');
    return successResponse(res, 200, 'Details found', { order });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
};

// ─── ADMIN: Update status / notes ─────────────────────────────
exports.adminUpdateOrder = async (req, res) => {
  try {
    const { status, note, priority } = req.body;
    const update = {};
    if (status) update.status = status;
    if (priority) update.priority = priority;
    
    const push = note ? { adminNotes: { note, admin: req.user._id } } : null;

    const order = await BulkOrder.findByIdAndUpdate(
      req.params.id, 
      { $set: update, ...(push ? { $push: push } : {}) }, 
      { new: true }
    );

    if (!order) return errorResponse(res, 404, 'Enquiry not found');
    return successResponse(res, 200, 'Updated successfully', { order });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
};

// ─── ADMIN: Stats ─────────────────────────────────────────────
exports.adminStats = async (req, res) => {
  try {
    const [total, pending, converted] = await Promise.all([
      BulkOrder.countDocuments(),
      BulkOrder.countDocuments({ status: 'pending' }),
      BulkOrder.countDocuments({ status: 'converted' }),
    ]);
    return successResponse(res, 200, 'Bulk stats', { total, pending, converted });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
};
