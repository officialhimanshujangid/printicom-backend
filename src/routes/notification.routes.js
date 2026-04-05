const express = require('express');
const router = express.Router();
const { protect, requireEmailVerified, authorize } = require('../middleware/auth.middleware');
const notificationController = require('../controllers/notification.controller');

const adminOnly = [protect, requireEmailVerified, authorize('admin')];

// ─── CLIENT ────────────────────────────────────────────
router.use(protect, requireEmailVerified);
router.get('/', notificationController.getMyNotifications);
router.patch('/:id/read', notificationController.markAsRead);
router.patch('/read-all', notificationController.markAllAsRead);
router.delete('/:id', notificationController.deleteNotification);

// ─── ADMIN ─────────────────────────────────────────────
router.post('/broadcast', ...adminOnly, notificationController.adminBroadcast);
router.get('/admin/all', ...adminOnly, notificationController.adminGetAll);
router.delete('/admin/:id', ...adminOnly, notificationController.adminDelete);

module.exports = router;
