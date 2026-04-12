const mongoose = require('mongoose');
const Product = require('../models/Product.model');
const Category = require('../models/Category.model');
const Order = require('../models/Order.model');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response.utils');
const { logActivity } = require('./auditLog.controller');

// ─── Helper: parse relatedTo entries from request ──────────
// Supports two formats from multipart/form-data:
//  1. relatedTos = JSON string of array  e.g. '[{"relatedTo":"abc","images":[]}]'
//  2. relatedTos[0][relatedTo], relatedTos[0][images][] etc.
//
// Per-occasion image files are keyed as:  relatedToImages_<relatedToId>[]
function parseRelatedTos(body, files = []) {
  let entries = [];
  if (body.relatedTos) {
    try {
      entries = typeof body.relatedTos === 'string' ? JSON.parse(body.relatedTos) : body.relatedTos;
    } catch (_) {
      entries = [];
    }
  }

  // Map uploaded per-occasion image files into the entries
  // files from upload.any() have field names like "relatedToImages_<relatedToId>"
  const imageFiles = files.filter((f) => f.fieldname.startsWith('relatedToImages_'));
  imageFiles.forEach((file) => {
    const relatedToId = file.fieldname.replace('relatedToImages_', '');
    const existing = entries.find((e) => e.relatedTo === relatedToId);
    const imageUrl = file.path ? file.path.replace(/\\/g, '/') : file.path;
    if (existing) {
      existing.images = existing.images || [];
      existing.images.push(imageUrl);
      if (!existing.thumbnailImage) existing.thumbnailImage = imageUrl;
    } else {
      entries.push({ relatedTo: relatedToId, images: [imageUrl], thumbnailImage: imageUrl });
    }
  });

  return entries;
}

// ─── Create Product ────────────────────────────────────────────
exports.createProduct = async (req, res) => {
  try {
    const {
      name,
      category,
      shortDescription,
      description,
      productType,
      variants,
      basePrice,
      discountPrice,
      customizationOptions,
      tags,
      isFeatured,
      minOrderQuantity,
      maxOrderQuantity,
      deliveryDays,
      pricingTiers,
      stock,
      lowStockThreshold,
      isCustomizable,
    } = req.body;

    // Check category exists
    const categoryDoc = await Category.findById(category);
    if (!categoryDoc) return errorResponse(res, 404, 'Category not found');
    if (!categoryDoc.isActive) return errorResponse(res, 400, 'Cannot add product to inactive category');

    const productData = {
      name,
      category,
      shortDescription,
      description,
      productType,
      basePrice: parseFloat(basePrice),
      discountPrice: discountPrice ? parseFloat(discountPrice) : null,
      tags: tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : [],
      variants: variants ? (typeof variants === 'string' ? JSON.parse(variants) : variants) : [],
      isCustomizable: isCustomizable === 'true' || isCustomizable === true,
      customizationOptions: customizationOptions
        ? typeof customizationOptions === 'string'
          ? JSON.parse(customizationOptions)
          : customizationOptions
        : [],
      isGstApplicable: req.body.isGstApplicable === 'true' || req.body.isGstApplicable === true,
      gstPercentage: req.body.gstPercentage !== '' && req.body.gstPercentage != null
        ? parseFloat(req.body.gstPercentage) : null,
      gstIncludedInPrice: req.body.gstIncludedInPrice || 'global',
      isFeatured: isFeatured === 'true' || isFeatured === true,
      minOrderQuantity: parseInt(minOrderQuantity) || 1,
      maxOrderQuantity: parseInt(maxOrderQuantity) || 100,
      deliveryDays: parseInt(deliveryDays) || 5,
      pricingTiers: pricingTiers ? (typeof pricingTiers === 'string' ? JSON.parse(pricingTiers) : pricingTiers) : [],
      stock: parseInt(stock) || 0,
      lowStockThreshold: parseInt(lowStockThreshold) || 5,
      createdBy: req.user._id,
    };

    // Handle base product images (field name: 'images')
    const baseImages = (req.files || []).filter((f) => f.fieldname === 'images');
    if (baseImages.length > 0) {
      productData.images = baseImages.map((f) => f.path.replace(/\\/g, '/'));
      productData.thumbnailImage = productData.images[0];
    }

    // Handle relatedTos with per-occasion images
    productData.relatedTos = parseRelatedTos(req.body, req.files || []);

    const product = await Product.create(productData);
    await product.populate('category', 'name slug');
    await product.populate('relatedTos.relatedTo', 'name slug icon');

    await logActivity(req.user._id, 'Product Created', 'Product', product._id, `Product "${product.name}" created`, req.ip);

    return successResponse(res, 201, 'Product created successfully', { product });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Get All Products ──────────────────────────────────────────
exports.getProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      search,
      category,
      productType,
      relatedTo,        // filter by occasion id or slug
      minPrice,
      maxPrice,
      isFeatured,
      isActive,
      sortBy = 'createdAt',
      order = 'desc',
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filter = {};

    if (search) filter.name = { $regex: search, $options: 'i' };
    if (category) filter.category = category;
    if (productType) filter.productType = productType;
    if (isFeatured !== undefined) filter.isFeatured = isFeatured === 'true';
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (relatedTo) filter['relatedTos.relatedTo'] = relatedTo;
    if (minPrice || maxPrice) {
      filter.basePrice = {};
      if (minPrice) filter.basePrice.$gte = parseFloat(minPrice);
      if (maxPrice) filter.basePrice.$lte = parseFloat(maxPrice);
    }

    const sortOptions = { [sortBy]: order === 'asc' ? 1 : -1 };

    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate('category', 'name slug icon')
        .populate('relatedTos.relatedTo', 'name slug icon')
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit)),
      Product.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    return paginatedResponse(res, 'Products fetched successfully', products, {
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

// ─── Get Single Product by ID ──────────────────────────────────
exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category', 'name slug icon')
      .populate('relatedTos.relatedTo', 'name slug icon coverImage');
    if (!product) return errorResponse(res, 404, 'Product not found');
    return successResponse(res, 200, 'Product fetched', { product });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Get Product by Slug ───────────────────────────────────────
exports.getProductBySlug = async (req, res) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug, isActive: true })
      .populate('category', 'name slug icon')
      .populate('relatedTos.relatedTo', 'name slug icon coverImage');
    if (!product) return errorResponse(res, 404, 'Product not found');
    return successResponse(res, 200, 'Product fetched', { product });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Update Product ────────────────────────────────────────────
exports.updateProduct = async (req, res) => {
  try {
    const {
      name,
      category,
      shortDescription,
      description,
      productType,
      variants,
      basePrice,
      discountPrice,
      customizationOptions,
      tags,
      isFeatured,
      isActive,
      minOrderQuantity,
      maxOrderQuantity,
      deliveryDays,
      pricingTiers,
      stock,
      lowStockThreshold,
    } = req.body;

    const updateData = {
      name,
      category,
      shortDescription,
      description,
      productType,
      isFeatured: isFeatured !== undefined ? isFeatured === 'true' || isFeatured === true : undefined,
      isActive: isActive !== undefined ? isActive === 'true' || isActive === true : undefined,
      updatedBy: req.user._id,
    };

    if (req.body.canvasTemplate) {
      updateData.canvasTemplate = typeof req.body.canvasTemplate === 'string' 
        ? JSON.parse(req.body.canvasTemplate) 
        : req.body.canvasTemplate;
    }

    if (basePrice) updateData.basePrice = parseFloat(basePrice);
    if (discountPrice !== undefined) updateData.discountPrice = discountPrice ? parseFloat(discountPrice) : null;
    if (tags) updateData.tags = typeof tags === 'string' ? JSON.parse(tags) : tags;
    if (variants) updateData.variants = typeof variants === 'string' ? JSON.parse(variants) : variants;
    if (customizationOptions)
      updateData.customizationOptions =
        typeof customizationOptions === 'string' ? JSON.parse(customizationOptions) : customizationOptions;
    // Handle isCustomizable flag
    if (req.body.isCustomizable !== undefined) {
      updateData.isCustomizable = req.body.isCustomizable === 'true' || req.body.isCustomizable === true;
    }
    // Handle GST fields
    if (req.body.isGstApplicable !== undefined) {
      updateData.isGstApplicable = req.body.isGstApplicable === 'true' || req.body.isGstApplicable === true;
    }
    if (req.body.gstPercentage !== undefined) {
      updateData.gstPercentage = req.body.gstPercentage !== '' && req.body.gstPercentage != null
        ? parseFloat(req.body.gstPercentage) : null;
    }
    if (req.body.gstIncludedInPrice !== undefined) {
      updateData.gstIncludedInPrice = req.body.gstIncludedInPrice;
    }
    if (minOrderQuantity) updateData.minOrderQuantity = parseInt(minOrderQuantity);
    if (maxOrderQuantity) updateData.maxOrderQuantity = parseInt(maxOrderQuantity);
    if (deliveryDays) updateData.deliveryDays = parseInt(deliveryDays);
    if (stock !== undefined) updateData.stock = parseInt(stock);
    if (lowStockThreshold !== undefined) updateData.lowStockThreshold = parseInt(lowStockThreshold);
    if (pricingTiers) updateData.pricingTiers = typeof pricingTiers === 'string' ? JSON.parse(pricingTiers) : pricingTiers;

    // Handle base product images (field name: 'images')
    const baseImages = (req.files || []).filter((f) => f.fieldname === 'images');
    if (baseImages.length > 0) {
      updateData.images = baseImages.map((f) => f.path.replace(/\\/g, '/'));
      updateData.thumbnailImage = updateData.images[0];
    }

    // Handle relatedTos update (only if provided in request)
    if (req.body.relatedTos !== undefined || (req.files || []).some((f) => f.fieldname.startsWith('relatedToImages_'))) {
      updateData.relatedTos = parseRelatedTos(req.body, req.files || []);
    }

    // Remove undefined fields
    Object.keys(updateData).forEach((k) => updateData[k] === undefined && delete updateData[k]);

    const product = await Product.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate('category', 'name slug icon')
      .populate('relatedTos.relatedTo', 'name slug icon');

    if (!product) return errorResponse(res, 404, 'Product not found');

    await logActivity(req.user._id, 'Product Updated', 'Product', product._id, `Product "${product.name}" updated`, req.ip);

    return successResponse(res, 200, 'Product updated successfully', { product });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Delete Product ────────────────────────────────────────────
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return errorResponse(res, 404, 'Product not found');
    
    await logActivity(req.user._id, 'Product Deleted', 'Product', product._id, `Product "${product.name}" deleted`, req.ip);
    
    return successResponse(res, 200, 'Product deleted successfully');
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Toggle Product Status ─────────────────────────────────────
exports.toggleProductStatus = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return errorResponse(res, 404, 'Product not found');

    product.isActive = !product.isActive;
    await product.save();

    await logActivity(req.user._id, 'Product Status Toggled', 'Product', product._id, `Product "${product.name}" ${product.isActive ? 'activated' : 'deactivated'}`, req.ip);

    return successResponse(
      res,
      200,
      `Product ${product.isActive ? 'activated' : 'deactivated'} successfully`,
      { product }
    );
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Get Featured Products ─────────────────────────────────────
exports.getFeaturedProducts = async (req, res) => {
  try {
    const products = await Product.find({ isActive: true, isFeatured: true })
      .populate('category', 'name slug icon')
      .populate('relatedTos.relatedTo', 'name slug icon')
      .sort({ createdAt: -1 })
      .limit(12);
    return successResponse(res, 200, 'Featured products fetched', { products });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Get Products by Category ──────────────────────────────────
exports.getProductsByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { page = 1, limit = 12 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [products, total] = await Promise.all([
      Product.find({ category: categoryId, isActive: true })
        .populate('category', 'name slug icon')
        .populate('relatedTos.relatedTo', 'name slug icon')
        .sort({ isFeatured: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Product.countDocuments({ category: categoryId, isActive: true }),
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    return paginatedResponse(res, 'Products fetched', products, {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Bulk Update Pricing ───────────────────────────────────────
exports.bulkUpdatePricing = async (req, res) => {
  try {
    const { categoryId, percentage, operation = 'increase' } = req.body;
    if (!categoryId || !percentage) {
      return errorResponse(res, 400, 'Category ID and percentage are required');
    }
    
    const factor = operation === 'increase' ? (1 + (percentage/100)) : (1 - (percentage/100));
    
    // Find all products in category
    const products = await Product.find({ category: categoryId });
    let updateCount = 0;
    
    for (const product of products) {
      product.basePrice = Math.round(product.basePrice * factor);
      if (product.discountPrice) {
         product.discountPrice = Math.round(product.discountPrice * factor);
      }
      await product.save();
      updateCount++;
    }
    
    return successResponse(res, 200, `Successfully updated pricing for ${updateCount} products.`);
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Free Smart Search Filter (Mongoose $text) ─────────────────
exports.smartSearch = async (req, res) => {
  try {
    const { q, limit = 5 } = req.query;
    if (!q) return successResponse(res, 200, 'Empty query', { products: [] });

    // Use MongoDB native full-text search index (0 server cost)
    const products = await Product.find(
      { $text: { $search: q }, isActive: true },
      { score: { $meta: 'textScore' } }
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(parseInt(limit))
      .select('name slug thumbnailImage basePrice discountPrice');
    
    return successResponse(res, 200, 'Smart search completed', { products });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── AI-style Recommendations (Customers Also Bought) ──────────
exports.getRecommendations = async (req, res) => {
  try {
    const { productId } = req.params;
    
    // 1. Find up to 4 products frequently bought with this one using Aggregation
    const recommendations = await Order.aggregate([
      { $match: { 'items.product': new mongoose.Types.ObjectId(productId) } },
      { $unwind: '$items' },
      { $match: { 'items.product': { $ne: new mongoose.Types.ObjectId(productId) } } },
      { $group: { _id: '$items.product', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 4 }
    ]);
    
    let productIds = recommendations.map(r => r._id);
    
    // 2. Fallback: If no related orders exist yet, just recommend from same category
    if (productIds.length === 0) {
       const currProd = await Product.findById(productId);
       if(currProd) {
         const related = await Product.find({ category: currProd.category, _id: { $ne: currProd._id }, isActive: true }).limit(4);
         productIds = related.map(p => p._id);
       }
    }

    const products = await Product.find({ _id: { $in: productIds }, isActive: true })
        .populate('category', 'name slug')
        .select('name slug thumbnailImage basePrice discountPrice');

    return successResponse(res, 200, 'Recommendations fetched', { products });
  } catch(error) {
    return errorResponse(res, 500, error.message);
  }
};


// ─── Admin: Adjust Stock ───────────────────────────────────────────────
exports.adjustStock = async (req, res) => {
  try {
    const { action = 'set', quantity } = req.body;
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty < 0) return errorResponse(res, 400, 'quantity must be a non-negative integer');

    const product = await Product.findById(req.params.id);
    if (!product) return errorResponse(res, 404, 'Product not found');

    let newStock;
    if (action === 'set') newStock = qty;
    else if (action === 'add') newStock = (product.stock || 0) + qty;
    else if (action === 'remove') newStock = Math.max(0, (product.stock || 0) - qty);
    else return errorResponse(res, 400, "action must be 'set', 'add', or 'remove'");

    await Product.findByIdAndUpdate(req.params.id, { stock: newStock, updatedBy: req.user._id });

    return successResponse(res, 200, `Stock updated to ${newStock}`, {
      productId: req.params.id,
      previousStock: product.stock,
      newStock,
      action,
      quantity: qty,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Admin: Stock Overview ────────────────────────────────────────────
exports.getStockOverview = async (req, res) => {
  try {
    const { filter = 'all', page = 1, limit = 20, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const matchFilter = {};
    if (filter === 'out_of_stock') matchFilter.stock = { $lte: 0 };
    else if (filter === 'low_stock') matchFilter.$expr = { $lte: ['$stock', '$lowStockThreshold'] };
    if (search) matchFilter.name = { $regex: search, $options: 'i' };

    const [products, total, outOfStock, lowStock] = await Promise.all([
      Product.find(matchFilter)
        .select('name slug thumbnailImage stock lowStockThreshold basePrice discountPrice isActive productType category')
        .populate('category', 'name')
        .sort({ stock: 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Product.countDocuments(matchFilter),
      Product.countDocuments({ stock: { $lte: 0 } }),
      Product.countDocuments({ $expr: { $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', '$lowStockThreshold'] }] } }),
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));
    return successResponse(res, 200, 'Stock overview', {
      products,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages },
      summary: { outOfStock, lowStock },
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};
