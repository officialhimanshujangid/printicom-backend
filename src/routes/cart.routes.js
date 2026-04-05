const express = require('express');
const router = express.Router();
const { protect, requireEmailVerified } = require('../middleware/auth.middleware');
const cartController = require('../controllers/cart.controller');
const { upload } = require('../utils/upload.utils');

router.use(protect, requireEmailVerified);

router.get('/', cartController.getCart);
router.post('/add', cartController.addToCart);
// Upload customization images - returns URLs to include when adding to cart
router.post(
  '/upload-customization',
  (req, res, next) => { req.uploadType = 'customization'; next(); },
  upload.any(),
  cartController.uploadCustomizationImages
);
router.put('/item/:itemId', cartController.updateCartItem);
router.delete('/item/:itemId', cartController.removeCartItem);
router.delete('/clear', cartController.clearCart);
router.post('/apply-coupon', cartController.applyCoupon);
router.delete('/remove-coupon', cartController.removeCoupon);

module.exports = router;
