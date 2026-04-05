const ContactSubmission = require('../models/ContactSubmission.model');
const Product = require('../models/Product.model');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response.utils');
const sendEmail = require('../config/email');

// ─── PUBLIC: Submit contact form ─────────────────────────────
exports.submitContact = async (req, res) => {
  try {
    const { name, email, phone, subject, message, category, priority } = req.body;
    if (!name || !email || !message) return errorResponse(res, 400, 'Name, email and message are required');

    const submission = await ContactSubmission.create({
      name, email, phone, subject, message,
      category: category || 'General Inquiry',
      priority: priority || 'Normal',
      userId: req.user?._id || null,
    });

    // Auto-reply to user
    try {
      await sendEmail({
        to: email,
        subject: '✅ We received your message — Printicom',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:32px;background:#f9f9f9;border-radius:12px;">
            <h2 style="color:#6366f1;">Hi ${name}! 👋</h2>
            <p style="color:#555;">Thank you for reaching out to <strong>Printicom</strong>. We've received your message and will get back to you within <strong>24–48 hours</strong>.</p>
            <div style="background:#fff;border-left:4px solid #6366f1;padding:16px;border-radius:8px;margin:20px 0;">
              <p style="color:#333;font-weight:600;">Your message:</p>
              <p style="color:#666;">${message}</p>
            </div>
            <p style="color:#999;font-size:13px;">If you have any urgent queries, WhatsApp us at <strong>+91-9876543210</strong></p>
            <hr style="border:none;border-top:1px solid #eee;margin:24px 0;"/>
            <p style="color:#aaa;font-size:12px;text-align:center;">© ${new Date().getFullYear()} Printicom · Print Your Memories</p>
          </div>
        `,
      });
    } catch (_) { /* silently fail auto-reply */ }

    return successResponse(res, 201, 'Message sent! We will get back to you shortly.', {
      id: submission._id,
    });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
};

// ─── PUBLIC: Bulk / B2B quote from product page ────────────────
exports.submitBulkOrder = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      productId,
      quantityEstimate,
      company,
      message,
    } = req.body;
    if (!name || !email || !productId) {
      return errorResponse(res, 400, 'Name, email and product are required');
    }
    const product = await Product.findById(productId).select('name slug');
    if (!product) return errorResponse(res, 404, 'Product not found');

    const qty = quantityEstimate != null && quantityEstimate !== ''
      ? parseInt(quantityEstimate, 10)
      : null;
    const bodyText =
      message?.trim() ||
      `Bulk order enquiry for "${product.name}" (estimated quantity: ${qty || 'not specified'}).`;

    const submission = await ContactSubmission.create({
      name,
      email,
      phone: phone || '',
      subject: `Bulk order: ${product.name}`,
      message: bodyText,
      category: 'Bulk Order',
      priority: qty && qty >= 50 ? 'High' : 'Normal',
      userId: req.user?._id || null,
      bulkProduct: product._id,
      bulkProductName: product.name,
      bulkProductSlug: product.slug || '',
      bulkQuantityEstimate: Number.isFinite(qty) ? qty : null,
      bulkCompany: company || '',
    });

    try {
      await sendEmail({
        to: email,
        subject: '✅ Bulk order request received — Printicom',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:32px;">
            <h2>Hi ${name},</h2>
            <p>We received your bulk order request for <strong>${product.name}</strong>. Our team will share pricing and timelines within <strong>24–48 hours</strong>.</p>
            <p style="color:#666;">${bodyText}</p>
          </div>
        `,
      });
    } catch (_) {}

    return successResponse(res, 201, 'Bulk order request sent. We will contact you shortly.', {
      id: submission._id,
    });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
};

// ─── ADMIN: List all contact submissions ─────────────────────
exports.adminListSubmissions = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, category } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;

    const [submissions, total] = await Promise.all([
      ContactSubmission.find(filter)
        .populate('assignedTo', 'name')
        .populate('bulkProduct', 'name slug thumbnailImage')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      ContactSubmission.countDocuments(filter),
    ]);

    return paginatedResponse(res, 'Contact submissions', submissions, {
      total, page: parseInt(page), limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
      hasNextPage: parseInt(page) < Math.ceil(total / parseInt(limit)),
      hasPrevPage: parseInt(page) > 1,
    });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
};

// ─── ADMIN: Update status ─────────────────────────────────────
exports.adminUpdateStatus = async (req, res) => {
  try {
    const { status, adminNote, assignedTo, priority } = req.body;
    const validStatuses = ['new', 'read', 'replied', 'closed'];
    if (status && !validStatuses.includes(status)) return errorResponse(res, 400, 'Invalid status');

    const update = {};
    if (status) update.status = status;
    if (adminNote !== undefined) update.adminNote = adminNote;
    if (assignedTo !== undefined) update.assignedTo = assignedTo;
    if (priority !== undefined) update.priority = priority;
    if (status === 'replied') update.repliedAt = new Date();

    const submission = await ContactSubmission.findByIdAndUpdate(req.params.id, update, { new: true }).populate('assignedTo', 'name');
    if (!submission) return errorResponse(res, 404, 'Submission not found');
    return successResponse(res, 200, 'Status updated', { submission });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
};

// ─── ADMIN: Delete submission ─────────────────────────────────
exports.adminDeleteSubmission = async (req, res) => {
  try {
    await ContactSubmission.findByIdAndDelete(req.params.id);
    return successResponse(res, 200, 'Submission deleted');
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
};

// ─── ADMIN: Stats ─────────────────────────────────────────────
exports.adminStats = async (req, res) => {
  try {
    const [total, newCount, readCount, repliedCount] = await Promise.all([
      ContactSubmission.countDocuments(),
      ContactSubmission.countDocuments({ status: 'new' }),
      ContactSubmission.countDocuments({ status: 'read' }),
      ContactSubmission.countDocuments({ status: 'replied' }),
    ]);
    return successResponse(res, 200, 'Contact stats', { total, new: newCount, read: readCount, replied: repliedCount });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
};
