const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth.middleware');
const adminController = require('../controllers/admin.controller');

const adminOnly = [protect, authorize('admin')];

// ─── Dashboard ─────────────────────────────────────────────
router.get('/dashboard', ...adminOnly, adminController.getDashboardStats);

// ─── User Management ───────────────────────────────────────
router.get('/users', ...adminOnly, adminController.getAllUsers);
router.get('/users/:id', ...adminOnly, adminController.getUserById);
router.get('/users/:id/wishlist', ...adminOnly, adminController.getUserWishlist);
router.get('/users/:id/addresses', ...adminOnly, adminController.getUserAddresses);
router.patch('/users/:id/toggle-status', ...adminOnly, adminController.toggleUserStatus);

// ─── Order Detail (admin) ──────────────────────────────────
router.get('/orders/:orderId', ...adminOnly, adminController.getOrderDetail);

// ─── Wishlist Management ───────────────────────────────────
router.get('/wishlist', ...adminOnly, adminController.getWishlistOverview);
router.get('/wishlist/product/:productId', ...adminOnly, adminController.getProductWishlistStats);

module.exports = router;
