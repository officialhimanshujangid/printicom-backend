const Banner = require('../models/Banner.model');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response.utils');
const { upload } = require('../utils/upload.utils');

// ─── Admin: Create Banner ──────────────────────────────
exports.createBanner = async (req, res) => {
  try {
    const {
      title, subtitle, description, altText,
      ctaText, ctaLink, ctaTarget,
      placement, targetCategory, targetProduct,
      backgroundColor, textColor, badgeText,
      startDate, endDate, isActive, sortOrder,
      mobileImageUrl,
    } = req.body;

    let imageUrl = req.body.imageUrl || null;
    let mobileImg = mobileImageUrl || null;

    if (req.files) {
      if (req.files.imageUrl && req.files.imageUrl[0]) {
        imageUrl = req.files.imageUrl[0].path.replace(/\\/g, '/');
      }
      if (req.files.mobileImageUrl && req.files.mobileImageUrl[0]) {
        mobileImg = req.files.mobileImageUrl[0].path.replace(/\\/g, '/');
      }
    } else if (req.file) {
      imageUrl = req.file.path.replace(/\\/g, '/');
    }

    if (!imageUrl) return errorResponse(res, 400, 'Banner image is required');

    const banner = await Banner.create({
      title, subtitle, description, altText,
      imageUrl, mobileImageUrl: mobileImg,
      ctaText, ctaLink, ctaTarget: ctaTarget || '_self',
      placement,
      targetCategory: targetCategory || null,
      targetProduct: targetProduct || null,
      backgroundColor, textColor, badgeText,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      isActive: isActive !== 'false' && isActive !== false,
      sortOrder: parseInt(sortOrder) || 0,
      createdBy: req.user._id,
    });

    return successResponse(res, 201, 'Banner created successfully', { banner });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Admin: Get All Banners ────────────────────────────
exports.getAllBanners = async (req, res) => {
  try {
    const { placement, isActive, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = {};
    if (placement) filter.placement = placement;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const [banners, total] = await Promise.all([
      Banner.find(filter)
        .populate('targetCategory', 'name slug')
        .populate('targetProduct', 'name slug')
        .populate('createdBy', 'name')
        .sort({ placement: 1, sortOrder: 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Banner.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));
    return paginatedResponse(res, 'Banners fetched', banners, {
      total, page: parseInt(page), limit: parseInt(limit), totalPages,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Admin: Update Banner ──────────────────────────────
exports.updateBanner = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    if (!banner) return errorResponse(res, 404, 'Banner not found');

    const allowedFields = [
      'title', 'subtitle', 'description', 'altText',
      'ctaText', 'ctaLink', 'ctaTarget', 'placement',
      'targetCategory', 'targetProduct',
      'backgroundColor', 'textColor', 'badgeText',
      'startDate', 'endDate', 'sortOrder',
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        banner[field] = req.body[field];
      }
    });

    if (req.body.isActive !== undefined) {
      banner.isActive = req.body.isActive === true || req.body.isActive === 'true';
    }

    // Handle new image uploads
    if (req.files) {
      if (req.files.imageUrl && req.files.imageUrl[0]) {
        banner.imageUrl = req.files.imageUrl[0].path.replace(/\\/g, '/');
      }
      if (req.files.mobileImageUrl && req.files.mobileImageUrl[0]) {
        banner.mobileImageUrl = req.files.mobileImageUrl[0].path.replace(/\\/g, '/');
      }
    } else if (req.file) {
      banner.imageUrl = req.file.path.replace(/\\/g, '/');
    }

    banner.updatedBy = req.user._id;
    await banner.save();

    return successResponse(res, 200, 'Banner updated', { banner });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Admin: Delete Banner ──────────────────────────────
exports.deleteBanner = async (req, res) => {
  try {
    const banner = await Banner.findByIdAndDelete(req.params.id);
    if (!banner) return errorResponse(res, 404, 'Banner not found');
    return successResponse(res, 200, 'Banner deleted');
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Admin: Toggle Banner Status ──────────────────────
exports.toggleBannerStatus = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    if (!banner) return errorResponse(res, 404, 'Banner not found');
    banner.isActive = !banner.isActive;
    banner.updatedBy = req.user._id;
    await banner.save();
    return successResponse(res, 200, `Banner ${banner.isActive ? 'activated' : 'deactivated'}`, { banner });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Admin: Reorder Banners ────────────────────────────
exports.reorderBanners = async (req, res) => {
  try {
    const { orders } = req.body; // [{ id, sortOrder }]
    if (!Array.isArray(orders)) return errorResponse(res, 400, 'orders array is required');

    const bulkOps = orders.map((item) => ({
      updateOne: {
        filter: { _id: item.id },
        update: { $set: { sortOrder: item.sortOrder } },
      },
    }));

    await Banner.bulkWrite(bulkOps);
    return successResponse(res, 200, 'Banner order updated');
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Admin: Track Click ───────────────────────────────
exports.trackBannerClick = async (req, res) => {
  try {
    await Banner.findByIdAndUpdate(req.params.id, { $inc: { clicks: 1 } });
    return successResponse(res, 200, 'Click tracked');
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── PUBLIC: Get Banners by Placement (for storefront) ─
exports.getPublicBanners = async (req, res) => {
  try {
    const { placement } = req.params;
    const now = new Date();

    const filter = {
      placement,
      isActive: true,
      $or: [{ startDate: null }, { startDate: { $lte: now } }],
      $and: [{ $or: [{ endDate: null }, { endDate: { $gte: now } }] }],
    };

    const banners = await Banner.find(filter)
      .select('-createdBy -updatedBy -impressions -clicks')
      .sort({ sortOrder: 1 });

    // Increment impressions in background
    Banner.updateMany({ _id: { $in: banners.map((b) => b._id) } }, { $inc: { impressions: 1 } }).exec();

    return successResponse(res, 200, `Banners for ${placement}`, { banners });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};
