const express = require('express');
const router = express.Router();
const { protect, requireEmailVerified, authorize } = require('../middleware/auth.middleware');
const reportsController = require('../controllers/reports.controller');

const adminOnly = [protect, requireEmailVerified, authorize('admin')];

// ─── Report Endpoints (all admin-only) ─────────────────────────────
router.get('/orders',    ...adminOnly, reportsController.orderReport);
router.get('/gst',       ...adminOnly, reportsController.gstReport);
router.get('/products',  ...adminOnly, reportsController.productReport);
router.get('/customers', ...adminOnly, reportsController.customerReport);
router.get('/stock',     ...adminOnly, reportsController.stockReport);
router.get('/coupons',   ...adminOnly, reportsController.couponReport);
router.put('/settings',  ...adminOnly, reportsController.updateReportSettings);

module.exports = router;
