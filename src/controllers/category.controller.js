const Category = require('../models/Category.model');
const Product = require('../models/Product.model');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response.utils');

// ─── Create Category ───────────────────────────────────────
exports.createCategory = async (req, res) => {
  try {
    const { name, description, icon, sortOrder } = req.body;

    const categoryData = {
      name,
      description,
      icon,
      sortOrder: sortOrder || 0,
      createdBy: req.user._id,
    };

    if (req.file) {
      categoryData.image = req.file.path.replace(/\\/g, '/');
    }

    const category = await Category.create(categoryData);
    return successResponse(res, 201, 'Category created successfully', { category });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Get All Categories ────────────────────────────────────
exports.getCategories = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, isActive } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = {};
    if (search) filter.name = { $regex: search, $options: 'i' };
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const [categories, total] = await Promise.all([
      Category.find(filter)
        .populate('createdBy', 'name email')
        .sort({ sortOrder: 1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Category.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    return paginatedResponse(res, 'Categories fetched successfully', categories, {
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

// ─── Get Single Category ───────────────────────────────────
exports.getCategoryById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id).populate('createdBy', 'name email');
    if (!category) return errorResponse(res, 404, 'Category not found');
    return successResponse(res, 200, 'Category fetched', { category });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Get Category by Slug ──────────────────────────────────
exports.getCategoryBySlug = async (req, res) => {
  try {
    const category = await Category.findOne({ slug: req.params.slug, isActive: true });
    if (!category) return errorResponse(res, 404, 'Category not found');
    return successResponse(res, 200, 'Category fetched', { category });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Update Category ───────────────────────────────────────
exports.updateCategory = async (req, res) => {
  try {
    const { name, description, icon, sortOrder, isActive } = req.body;
    const updateData = { name, description, icon, sortOrder, isActive };

    if (req.file) {
      updateData.image = req.file.path.replace(/\\/g, '/');
    }

    // Remove undefined fields
    Object.keys(updateData).forEach((k) => updateData[k] === undefined && delete updateData[k]);

    const category = await Category.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!category) return errorResponse(res, 404, 'Category not found');
    return successResponse(res, 200, 'Category updated successfully', { category });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Delete Category ───────────────────────────────────────
exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return errorResponse(res, 404, 'Category not found');

    // Check if products exist under this category
    const productCount = await Product.countDocuments({ category: req.params.id });
    if (productCount > 0) {
      return errorResponse(
        res,
        400,
        `Cannot delete category. It has ${productCount} product(s) associated. Please reassign or delete them first.`
      );
    }

    await category.deleteOne();
    return successResponse(res, 200, 'Category deleted successfully');
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Toggle Category Active Status ────────────────────────
exports.toggleCategoryStatus = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return errorResponse(res, 404, 'Category not found');

    category.isActive = !category.isActive;
    await category.save();

    return successResponse(res, 200, `Category ${category.isActive ? 'activated' : 'deactivated'} successfully`, {
      category,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};
