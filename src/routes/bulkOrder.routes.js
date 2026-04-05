const express = require('express');
const router = express.Router();
const bulkOrderController = require('../controllers/bulkOrder.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

// ─── PUBLIC ───────────────────────────────────────────────
router.post('/', bulkOrderController.submitBulkOrder);

// ─── ADMIN ────────────────────────────────────────────────
router.get('/admin', protect, authorize('admin'), bulkOrderController.adminListBulkOrders);
router.get('/admin/stats', protect, authorize('admin'), bulkOrderController.adminStats);
router.get('/admin/:id', protect, authorize('admin'), bulkOrderController.adminGetDetail);
router.put('/admin/:id', protect, authorize('admin'), bulkOrderController.adminUpdateOrder);

module.exports = router;
