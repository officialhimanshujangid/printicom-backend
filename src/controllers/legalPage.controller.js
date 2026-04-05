const LegalPage = require('../models/LegalPage.model');
const { successResponse, errorResponse } = require('../utils/response.utils');

const DEFAULT_PAGES = [
  { slug: 'privacy-policy', title: 'Privacy Policy' },
  { slug: 'terms-and-conditions', title: 'Terms & Conditions' },
  { slug: 'refund-policy', title: 'Refund & Return Policy' },
  { slug: 'shipping-policy', title: 'Shipping Policy' },
  { slug: 'about-us', title: 'About Us' },
];

// Auto-seed if missing or fix incorrect titles
async function ensureDefaults() {
  for (const page of DEFAULT_PAGES) {
    const existing = await LegalPage.findOne({ slug: page.slug });
    if (!existing) {
      await LegalPage.create({ ...page, content: '', isPublished: true });
    } else if (existing.title !== page.title) {
       // Force update titles for system-defined slugs to ensure UI consistency
       existing.title = page.title;
       await existing.save();
    }
  }
}

// ─── PUBLIC: Get one legal page ──────────────────────────────
exports.getPublicPage = async (req, res) => {
  try {
    await ensureDefaults();
    const page = await LegalPage.findOne({ slug: req.params.slug, isPublished: true });
    if (!page) return errorResponse(res, 404, 'Page not found');
    return successResponse(res, 200, 'Legal page', { page });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
};

// ─── PUBLIC: List all published pages (metadata only) ────────
exports.listPublicPages = async (req, res) => {
  try {
    await ensureDefaults();
    const pages = await LegalPage.find({ isPublished: true }).select('slug title updatedAt metaTitle metaDescription');
    return successResponse(res, 200, 'Legal pages', { pages });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
};

// ─── ADMIN: Get all pages (including unpublished) ────────────
exports.adminListPages = async (req, res) => {
  try {
    await ensureDefaults();
    const pages = await LegalPage.find().sort({ slug: 1 });
    return successResponse(res, 200, 'All legal pages', { pages });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
};

// ─── ADMIN: Get one page ─────────────────────────────────────
exports.adminGetPage = async (req, res) => {
  try {
    await ensureDefaults();
    const page = await LegalPage.findOne({ slug: req.params.slug });
    if (!page) return errorResponse(res, 404, 'Page not found');
    return successResponse(res, 200, 'Legal page', { page });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
};

// ─── ADMIN: Update / create a page ──────────────────────────
exports.adminUpdatePage = async (req, res) => {
  try {
    const { title, content, metaTitle, metaDescription, isPublished } = req.body;
    const { slug } = req.params;

    const validSlugs = DEFAULT_PAGES.map(p => p.slug);
    if (!validSlugs.includes(slug)) return errorResponse(res, 400, 'Invalid page slug');

    const page = await LegalPage.findOneAndUpdate(
      { slug },
      {
        title: title || slug,
        content: content || '',
        metaTitle: metaTitle || '',
        metaDescription: metaDescription || '',
        isPublished: isPublished !== undefined ? isPublished : true,
        lastUpdatedBy: req.user._id,
      },
      { upsert: true, new: true }
    );

    return successResponse(res, 200, 'Legal page updated', { page });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
};
