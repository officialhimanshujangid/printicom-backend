const Cart = require('../models/Cart.model');
const Product = require('../models/Product.model');
const Coupon = require('../models/Coupon.model');
const { successResponse, errorResponse } = require('../utils/response.utils');

// ─── Helper: get effective price ──────────────────────
const getEffectivePrice = (product, variantId, quantity = 1) => {
  let effective = product.discountPrice && product.discountPrice < product.basePrice
    ? product.discountPrice
    : product.basePrice;

  if (variantId && product.variants && product.variants.length > 0) {
    const variant = product.variants.id(variantId);
    if (variant && variant.isAvailable) {
      effective = variant.discountPrice && variant.discountPrice < variant.basePrice
        ? variant.discountPrice
        : variant.basePrice;
    }
  }

  if (product.pricingTiers && product.pricingTiers.length > 0) {
    const sortedTiers = [...product.pricingTiers].sort((a, b) => b.minQuantity - a.minQuantity);
    for (const tier of sortedTiers) {
      if (quantity >= tier.minQuantity) {
        return Math.min(effective, tier.pricePerUnit);
      }
    }
  }

  return effective;
};

// ─── Get Cart ──────────────────────────────────────────
exports.getCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id }).populate(
      'items.product',
      'name slug thumbnailImage basePrice discountPrice isActive productType isCustomizable customizationOptions'
    );

    if (!cart) {
      cart = await Cart.create({ user: req.user._id, items: [] });
    }

    return successResponse(res, 200, 'Cart fetched', { cart });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Upload Customization Images ──────────────────────
// POST /api/cart/upload-customization
// Body: multipart/form-data with files keyed by fieldId
// Returns: { uploads: { [fieldId]: cloudinaryUrl } }
exports.uploadCustomizationImages = async (req, res) => {
  try {
    const uploads = {};
    (req.files || []).forEach((file) => {
      const url = file.path ? file.path.replace(/\\/g, '/') : file.path;
      uploads[file.fieldname] = url;
    });
    return successResponse(res, 200, 'Images uploaded successfully', { uploads });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Add Item to Cart ──────────────────────────────────
exports.addToCart = async (req, res) => {
  try {
    const { productId, variantId, quantity = 1, customization } = req.body;

    if (!productId) return errorResponse(res, 400, 'Product ID is required');

    const product = await Product.findById(productId);
    if (!product) return errorResponse(res, 404, 'Product not found');
    if (!product.isActive) return errorResponse(res, 400, 'Product is not available');

    const qty = parseInt(quantity);
    if (qty < 1) return errorResponse(res, 400, 'Quantity must be at least 1');
    if (qty > product.maxOrderQuantity)
      return errorResponse(res, 400, `Maximum order quantity is ${product.maxOrderQuantity}`);

    // ─── Stock check ────────────────────────────────────
    if (product.stock !== undefined && product.stock !== null && product.stock <= 0) {
      return errorResponse(res, 400, 'Product is out of stock');
    }

    // ─── Customization validation ────────────────────────
    if (product.isCustomizable && product.customizationOptions?.length > 0) {
      const missingFields = [];
      for (const field of product.customizationOptions) {
        if (!field.isRequired) continue;
        const provided = customization?.[field.fieldId];
        if (!provided || (typeof provided === 'object' && !provided.value)) {
          missingFields.push(field.label);
        }
      }
      if (missingFields.length > 0) {
        return errorResponse(
          res,
          400,
          `Please complete customization: ${missingFields.join(', ')} ${missingFields.length === 1 ? 'is' : 'are'} required`
        );
      }
    }

    let variantName = null;
    if (variantId && product.variants.length > 0) {
      const variant = product.variants.id(variantId);
      if (!variant) return errorResponse(res, 404, 'Variant not found');
      if (!variant.isAvailable) return errorResponse(res, 400, 'This variant is not available');
      variantName = variant.variantName;
    }

    const unitPrice = getEffectivePrice(product, variantId, qty);

    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      cart = await Cart.create({ user: req.user._id, items: [] });
    }

    // For customizable products, always add as a new line (each customization is unique)
    const isCustomizable = product.isCustomizable && customization && Object.keys(customization).length > 0;

    // Check if same product+variant already in cart (only merge non-customizable)
    const existingIndex = !isCustomizable
      ? cart.items.findIndex(
          (item) =>
            item.product.toString() === productId &&
            String(item.variantId || '') === String(variantId || '')
        )
      : -1;

    if (existingIndex > -1) {
      const newQty = cart.items[existingIndex].quantity + qty;
      if (newQty > product.maxOrderQuantity)
        return errorResponse(res, 400, `Maximum order quantity is ${product.maxOrderQuantity}`);
      cart.items[existingIndex].quantity = newQty;
      cart.items[existingIndex].unitPrice = getEffectivePrice(product, variantId, newQty);
    } else {
      cart.items.push({
        product: productId,
        variantId: variantId || null,
        variantName,
        quantity: qty,
        unitPrice,
        customization: customization || {},
      });
    }

    // Reset coupon when cart changes
    cart.appliedCoupon = { code: null, discountAmount: 0 };
    await cart.save();

    await cart.populate('items.product', 'name slug thumbnailImage basePrice discountPrice isActive productType isCustomizable customizationOptions');

    return successResponse(res, 200, 'Item added to cart', { cart });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Update Cart Item Quantity ─────────────────────────
exports.updateCartItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity, customization } = req.body;

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return errorResponse(res, 404, 'Cart not found');

    const item = cart.items.id(itemId);
    if (!item) return errorResponse(res, 404, 'Cart item not found');

    if (quantity !== undefined) {
      const qty = parseInt(quantity);
      if (qty < 1) return errorResponse(res, 400, 'Quantity must be at least 1');

      const product = await Product.findById(item.product);
      if (qty > product.maxOrderQuantity)
        return errorResponse(res, 400, `Maximum order quantity is ${product.maxOrderQuantity}`);

      item.quantity = qty;
      // Update unit price in case it changed due to dynamic pricing
      item.unitPrice = getEffectivePrice(product, item.variantId, qty);
    }

    if (customization) {
      item.customization = { ...item.customization, ...customization };
    }

    cart.appliedCoupon = { code: null, discountAmount: 0 };
    await cart.save();

    await cart.populate('items.product', 'name slug thumbnailImage basePrice discountPrice isActive productType isCustomizable customizationOptions');
    return successResponse(res, 200, 'Cart item updated', { cart });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Remove Cart Item ──────────────────────────────────
exports.removeCartItem = async (req, res) => {
  try {
    const { itemId } = req.params;

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return errorResponse(res, 404, 'Cart not found');

    const item = cart.items.id(itemId);
    if (!item) return errorResponse(res, 404, 'Cart item not found');

    item.deleteOne();
    cart.appliedCoupon = { code: null, discountAmount: 0 };
    await cart.save();

    await cart.populate('items.product', 'name slug thumbnailImage basePrice discountPrice isActive productType isCustomizable customizationOptions');
    return successResponse(res, 200, 'Item removed from cart', { cart });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Clear Cart ────────────────────────────────────────
exports.clearCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return errorResponse(res, 404, 'Cart not found');

    cart.items = [];
    cart.appliedCoupon = { code: null, discountAmount: 0 };
    await cart.save();

    return successResponse(res, 200, 'Cart cleared');
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Apply Coupon ──────────────────────────────────────
exports.applyCoupon = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return errorResponse(res, 400, 'Coupon code is required');

    const cart = await Cart.findOne({ user: req.user._id }).populate('items.product');
    if (!cart || cart.items.length === 0) return errorResponse(res, 400, 'Cart is empty');

    const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
    if (!coupon) return errorResponse(res, 404, 'Invalid or expired coupon code');

    const now = new Date();
    if (now < coupon.validFrom || now > coupon.validUntil)
      return errorResponse(res, 400, 'Coupon has expired or is not yet valid');

    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit)
      return errorResponse(res, 400, 'Coupon usage limit reached');

    if (coupon.targetedUsers && coupon.targetedUsers.length > 0) {
      const isTargeted = coupon.targetedUsers.some(
        (userId) => userId.toString() === req.user._id.toString()
      );
      if (!isTargeted) return errorResponse(res, 403, 'This coupon is not applicable to your account');
    }

    // Per-user usage check
    const userUsage = coupon.usedBy.filter(
      (u) => u.user.toString() === req.user._id.toString()
    ).length;
    if (userUsage >= coupon.perUserLimit)
      return errorResponse(res, 400, `You have already used this coupon ${coupon.perUserLimit} time(s)`);

    const subtotal = cart.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

    if (subtotal < coupon.minOrderAmount)
      return errorResponse(
        res,
        400,
        `Minimum order amount of ₹${coupon.minOrderAmount} required for this coupon`
      );

    let discountAmount = 0;
    if (coupon.discountType === 'flat') {
      discountAmount = Math.min(coupon.discountValue, subtotal);
    } else {
      discountAmount = (subtotal * coupon.discountValue) / 100;
      if (coupon.maxDiscountAmount) {
        discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);
      }
    }
    discountAmount = Math.round(discountAmount * 100) / 100;

    cart.appliedCoupon = {
      code: coupon.code,
      discountAmount,
      discountType: coupon.discountType,
    };
    await cart.save();

    return successResponse(res, 200, `Coupon applied! You save ₹${discountAmount}`, {
      cart,
      couponInfo: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountAmount,
        subtotal,
        finalAmount: subtotal - discountAmount,
      },
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Remove Coupon ─────────────────────────────────────
exports.removeCoupon = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return errorResponse(res, 404, 'Cart not found');

    cart.appliedCoupon = { code: null, discountAmount: 0 };
    await cart.save();

    return successResponse(res, 200, 'Coupon removed');
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};
