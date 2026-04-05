const express = require('express');
const router = express.Router();
const { protect, requireEmailVerified, authorize } = require('../middleware/auth.middleware');
const analyticsController = require('../controllers/analytics.controller');

const adminOnly = [protect, requireEmailVerified, authorize('admin')];

router.get('/carts', ...adminOnly, analyticsController.cartAnalytics);
router.get('/sales', ...adminOnly, analyticsController.salesReport);
router.get('/customers', ...adminOnly, analyticsController.customerAnalytics);
router.get('/reviews', ...adminOnly, analyticsController.reviewAnalytics);

module.exports = router;
