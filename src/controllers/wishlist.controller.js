const Wishlist = require('../models/Wishlist.model');
const Product = require('../models/Product.model');
const { successResponse, errorResponse } = require('../utils/response.utils');

// ─── Get Wishlist ──────────────────────────────────────
exports.getWishlist = async (req, res) => {
  try {
    let wishlist = await Wishlist.findOne({ user: req.user._id }).populate(
      'products.product',
      'name slug thumbnailImage basePrice discountPrice isActive productType rating'
    );

    if (!wishlist) {
      wishlist = await Wishlist.create({ user: req.user._id, products: [] });
    }

    return successResponse(res, 200, 'Wishlist fetched', { wishlist });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Add to Wishlist ───────────────────────────────────
exports.addToWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) return errorResponse(res, 400, 'Product ID is required');

    const product = await Product.findById(productId);
    if (!product) return errorResponse(res, 404, 'Product not found');

    let wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) {
      wishlist = await Wishlist.create({ user: req.user._id, products: [] });
    }

    const alreadyAdded = wishlist.products.some(
      (p) => p.product.toString() === productId
    );

    if (alreadyAdded) return errorResponse(res, 400, 'Product already in wishlist');

    wishlist.products.push({ product: productId });
    await wishlist.save();

    await wishlist.populate('products.product', 'name slug thumbnailImage basePrice discountPrice isActive productType rating');

    return successResponse(res, 200, 'Product added to wishlist', { wishlist });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Remove from Wishlist ──────────────────────────────
exports.removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.params;

    const wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) return errorResponse(res, 404, 'Wishlist not found');

    const initialLength = wishlist.products.length;
    wishlist.products = wishlist.products.filter(
      (p) => p.product.toString() !== productId
    );

    if (wishlist.products.length === initialLength)
      return errorResponse(res, 404, 'Product not found in wishlist');

    await wishlist.save();
    return successResponse(res, 200, 'Product removed from wishlist');
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Toggle Wishlist ───────────────────────────────────
exports.toggleWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) return errorResponse(res, 400, 'Product ID is required');

    const product = await Product.findById(productId);
    if (!product) return errorResponse(res, 404, 'Product not found');

    let wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) {
      wishlist = await Wishlist.create({ user: req.user._id, products: [] });
    }

    const index = wishlist.products.findIndex(
      (p) => p.product.toString() === productId
    );

    let action;
    if (index > -1) {
      wishlist.products.splice(index, 1);
      action = 'removed';
    } else {
      wishlist.products.push({ product: productId });
      action = 'added';
    }

    await wishlist.save();
    return successResponse(res, 200, `Product ${action} ${action === 'added' ? 'to' : 'from'} wishlist`, {
      action,
      productId,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Clear Wishlist ────────────────────────────────────
exports.clearWishlist = async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) return errorResponse(res, 404, 'Wishlist not found');
    wishlist.products = [];
    await wishlist.save();
    return successResponse(res, 200, 'Wishlist cleared');
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};
