const express = require('express');
const router = express.Router();
const { protect, requireEmailVerified } = require('../middleware/auth.middleware');
const wishlistController = require('../controllers/wishlist.controller');

router.use(protect, requireEmailVerified);

router.get('/', wishlistController.getWishlist);
router.post('/add', wishlistController.addToWishlist);
router.post('/toggle', wishlistController.toggleWishlist);
router.delete('/clear', wishlistController.clearWishlist);
router.delete('/:productId', wishlistController.removeFromWishlist);

module.exports = router;
