const express = require('express');
const router = express.Router();
const { protect, requireEmailVerified, authorize } = require('../middleware/auth.middleware');
const { upload } = require('../utils/upload.utils');
const orderController = require('../controllers/order.controller');

// ─── Client Routes ─────────────────────────────────────
router.use(protect, requireEmailVerified);

router.post('/', orderController.placeOrder);
router.post('/verify-payment', orderController.verifyPayment);
router.get('/my', orderController.getMyOrders);
router.get('/track/:orderNumber', orderController.trackOrder);
router.get('/:id', orderController.getOrderById);
router.patch('/:id/cancel', orderController.requestCancellation);
router.patch('/:id/return', orderController.requestReturn);

// ─── Admin Routes ──────────────────────────────────────
router.get('/', authorize('admin'), orderController.adminGetAllOrders);
router.get('/admin/:id', authorize('admin'), orderController.adminGetOrderById);
router.patch('/admin/:id/status', authorize('admin'), orderController.adminUpdateOrderStatus);
router.patch('/admin/:id/tracking', authorize('admin'), orderController.adminAddTracking);
router.post('/admin/:id/process-shipment', authorize('admin'), orderController.adminProcessShipment);
router.post('/admin/:id/sync-tracking', authorize('admin'), orderController.adminSyncShiprocketTracking);
router.patch('/admin/:id/cancellation-request', authorize('admin'), orderController.adminHandleCancellationRequest);
router.patch('/admin/:id/return-request', authorize('admin'), orderController.adminHandleReturnRequest);

module.exports = router;
