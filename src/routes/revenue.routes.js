const express = require('express');
const router = express.Router();
const { protect, requireEmailVerified, authorize } = require('../middleware/auth.middleware');
const revenueController = require('../controllers/revenue.controller');

const adminOnly = [protect, requireEmailVerified, authorize('admin')];

// ─── Revenue Endpoints (all admin-only) ────────────────────────────
router.get('/summary',            ...adminOnly, revenueController.revenueSummary);
router.get('/trend',              ...adminOnly, revenueController.revenueTrend);
router.get('/by-category',        ...adminOnly, revenueController.revenueByCategory);
router.get('/by-product-type',    ...adminOnly, revenueController.revenueByProductType);
router.get('/by-occasion',        ...adminOnly, revenueController.revenueByOccasion);
router.get('/by-payment-method',  ...adminOnly, revenueController.revenueByPaymentMethod);
router.get('/top-products',       ...adminOnly, revenueController.topRevenueProducts);
router.get('/top-clients',        ...adminOnly, revenueController.topRevenueClients);
router.get('/monthly-comparison', ...adminOnly, revenueController.monthlyComparison);
router.get('/refunds',            ...adminOnly, revenueController.refundImpact);

module.exports = router;
