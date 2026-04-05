const RelatedTo = require('../models/RelatedTo.model');
const Product = require('../models/Product.model');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response.utils');

// ─── Create RelatedTo ──────────────────────────────────────
exports.createRelatedTo = async (req, res) => {
  try {
    const { name, description, icon, sortOrder } = req.body;

    const data = {
      name,
      description,
      icon,
      sortOrder: parseInt(sortOrder) || 0,
      createdBy: req.user._id,
    };

    // Handle uploaded cover image
    if (req.file) {
      data.coverImage = req.file.path.replace(/\\/g, '/');
    }

    const relatedTo = await RelatedTo.create(data);
    return successResponse(res, 201, 'RelatedTo created successfully', { relatedTo });
  } catch (error) {
    if (error.code === 11000) return errorResponse(res, 400, 'A RelatedTo with this name already exists');
    return errorResponse(res, 500, error.message);
  }
};

// ─── Get All RelatedTos ────────────────────────────────────
exports.getAllRelatedTos = async (req, res) => {
  try {
    const { isActive, search } = req.query;

    const filter = {};
    if (isActive !== undefined && isActive !== 'all') filter.isActive = isActive === 'true';
    if (search) filter.name = { $regex: search, $options: 'i' };

    const relatedTos = await RelatedTo.find(filter).sort({ sortOrder: 1, name: 1 });

    return successResponse(res, 200, 'RelatedTos fetched', { relatedTos });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Get RelatedTo by ID ───────────────────────────────────
exports.getRelatedToById = async (req, res) => {
  try {
    const relatedTo = await RelatedTo.findById(req.params.id);
    if (!relatedTo) return errorResponse(res, 404, 'RelatedTo not found');
    return successResponse(res, 200, 'RelatedTo fetched', { relatedTo });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Get RelatedTo by Slug ─────────────────────────────────
exports.getRelatedToBySlug = async (req, res) => {
  try {
    const relatedTo = await RelatedTo.findOne({ slug: req.params.slug, isActive: true });
    if (!relatedTo) return errorResponse(res, 404, 'RelatedTo not found');
    return successResponse(res, 200, 'RelatedTo fetched', { relatedTo });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Update RelatedTo ──────────────────────────────────────
exports.updateRelatedTo = async (req, res) => {
  try {
    const { name, description, icon, sortOrder, isActive } = req.body;

    const updateData = { name, description, icon };
    if (sortOrder !== undefined) updateData.sortOrder = parseInt(sortOrder);
    if (isActive !== undefined) updateData.isActive = isActive === 'true' || isActive === true;

    if (req.file) {
      updateData.coverImage = req.file.path.replace(/\\/g, '/');
    }

    // Remove undefined fields
    Object.keys(updateData).forEach((k) => updateData[k] === undefined && delete updateData[k]);

    const relatedTo = await RelatedTo.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!relatedTo) return errorResponse(res, 404, 'RelatedTo not found');
    return successResponse(res, 200, 'RelatedTo updated successfully', { relatedTo });
  } catch (error) {
    if (error.code === 11000) return errorResponse(res, 400, 'A RelatedTo with this name already exists');
    return errorResponse(res, 500, error.message);
  }
};

// ─── Delete RelatedTo ──────────────────────────────────────
exports.deleteRelatedTo = async (req, res) => {
  try {
    // Remove this relatedTo from all products that reference it
    await Product.updateMany(
      { 'relatedTos.relatedTo': req.params.id },
      { $pull: { relatedTos: { relatedTo: req.params.id } } }
    );

    const relatedTo = await RelatedTo.findByIdAndDelete(req.params.id);
    if (!relatedTo) return errorResponse(res, 404, 'RelatedTo not found');

    return successResponse(res, 200, 'RelatedTo deleted successfully');
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Toggle RelatedTo Status ───────────────────────────────
exports.toggleRelatedToStatus = async (req, res) => {
  try {
    const relatedTo = await RelatedTo.findById(req.params.id);
    if (!relatedTo) return errorResponse(res, 404, 'RelatedTo not found');

    relatedTo.isActive = !relatedTo.isActive;
    await relatedTo.save();

    return successResponse(
      res,
      200,
      `RelatedTo ${relatedTo.isActive ? 'activated' : 'deactivated'} successfully`,
      { relatedTo }
    );
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Get Products by RelatedTo (slug or id) ─────────────────
// Returns all active products tagged with this occasion,
// and for each product injects the occasion-specific images.
exports.getProductsByRelatedTo = async (req, res) => {
  try {
    const { slugOrId } = req.params;
    const { page = 1, limit = 12 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Resolve RelatedTo
    const isObjectId = /^[a-f\d]{24}$/i.test(slugOrId);
    const relatedTo = isObjectId
      ? await RelatedTo.findById(slugOrId)
      : await RelatedTo.findOne({ slug: slugOrId, isActive: true });

    if (!relatedTo) return errorResponse(res, 404, 'RelatedTo not found');

    const [products, total] = await Promise.all([
      Product.find({
        isActive: true,
        'relatedTos.relatedTo': relatedTo._id,
      })
        .populate('category', 'name slug icon')
        .sort({ isFeatured: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Product.countDocuments({ isActive: true, 'relatedTos.relatedTo': relatedTo._id }),
    ]);

    // Inject occasion-specific images into each product response
    const enriched = products.map((p) => {
      const pObj = p.toJSON();
      const entry = pObj.relatedTos?.find(
        (r) => r.relatedTo?.toString() === relatedTo._id.toString()
      );
      if (entry?.images?.length > 0) {
        pObj.occasionImages = entry.images;
        pObj.occasionThumbnail = entry.thumbnailImage || entry.images[0];
      } else {
        pObj.occasionImages = pObj.images;
        pObj.occasionThumbnail = pObj.thumbnailImage;
      }
      return pObj;
    });

    const totalPages = Math.ceil(total / parseInt(limit));

    return paginatedResponse(res, `Products for "${relatedTo.name}" fetched`, enriched, {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages,
      hasNextPage: parseInt(page) < totalPages,
      hasPrevPage: parseInt(page) > 1,
      relatedTo: {
        _id: relatedTo._id,
        name: relatedTo.name,
        slug: relatedTo.slug,
        coverImage: relatedTo.coverImage,
      },
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};
