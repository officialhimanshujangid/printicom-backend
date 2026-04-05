const FAQ = require('../models/FAQ.model');
const { successResponse, errorResponse } = require('../utils/response.utils');

// ─── PUBLIC: Get all published FAQs ──────────────────────────
exports.getPublicFAQs = async (req, res) => {
  try {
    const { category } = req.query;
    const filter = { isPublished: true };
    if (category) filter.category = category;
    const faqs = await FAQ.find(filter).sort({ category: 1, order: 1 }).select('-createdBy');
    return successResponse(res, 200, 'FAQs', { faqs });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
};

// ─── ADMIN: Get all FAQs ─────────────────────────────────────
exports.adminGetFAQs = async (req, res) => {
  try {
    const faqs = await FAQ.find().sort({ category: 1, order: 1 });
    return successResponse(res, 200, 'All FAQs', { faqs });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
};

// ─── ADMIN: Create FAQ ───────────────────────────────────────
exports.createFAQ = async (req, res) => {
  try {
    const { question, answer, category, order, isPublished } = req.body;
    if (!question || !answer) return errorResponse(res, 400, 'Question and answer are required');
    const faq = await FAQ.create({
      question, answer,
      category: category || 'general',
      order: order || 0,
      isPublished: isPublished !== undefined ? isPublished : true,
      createdBy: req.user._id,
    });
    return successResponse(res, 201, 'FAQ created', { faq });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
};

// ─── ADMIN: Update FAQ ───────────────────────────────────────
exports.updateFAQ = async (req, res) => {
  try {
    const { question, answer, category, order, isPublished } = req.body;
    const faq = await FAQ.findByIdAndUpdate(
      req.params.id,
      { question, answer, category, order, isPublished },
      { new: true, runValidators: true }
    );
    if (!faq) return errorResponse(res, 404, 'FAQ not found');
    return successResponse(res, 200, 'FAQ updated', { faq });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
};

// ─── ADMIN: Delete FAQ ───────────────────────────────────────
exports.deleteFAQ = async (req, res) => {
  try {
    const faq = await FAQ.findByIdAndDelete(req.params.id);
    if (!faq) return errorResponse(res, 404, 'FAQ not found');
    return successResponse(res, 200, 'FAQ deleted');
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
};

// ─── ADMIN: Bulk reorder FAQs ────────────────────────────────
exports.reorderFAQs = async (req, res) => {
  try {
    const { items } = req.body; // [{ id, order }]
    if (!Array.isArray(items)) return errorResponse(res, 400, 'items array required');
    await Promise.all(items.map(({ id, order }) => FAQ.findByIdAndUpdate(id, { order })));
    return successResponse(res, 200, 'FAQs reordered');
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
};
