const express = require('express');
const router = express.Router();
const { protect, requireEmailVerified, authorize } = require('../middleware/auth.middleware');
const { upload } = require('../utils/upload.utils');
const settingsController = require('../controllers/settings.controller');

const adminOnly = [protect, requireEmailVerified, authorize('admin')];

// ─── PUBLIC ────────────────────────────────────────────
router.get('/public', settingsController.getPublicSettings);

// ─── ADMIN ─────────────────────────────────────────────
router.get('/', ...adminOnly, settingsController.getFullSettings);
router.put('/general', ...adminOnly,
  upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'favicon', maxCount: 1 }]),
  settingsController.updateGeneral
);
router.put('/payment-methods', ...adminOnly, settingsController.updatePaymentMethods);
router.put('/shipping', ...adminOnly, settingsController.updateShipping);
router.put('/homepage', ...adminOnly, settingsController.updateHomepage);
router.put('/seo', ...adminOnly, settingsController.updateSEO);
router.put('/social-links', ...adminOnly, settingsController.updateSocialLinks);
router.put('/tax', ...adminOnly, settingsController.updateTax);
router.put('/order-settings', ...adminOnly, settingsController.updateOrderSettings);
router.put('/theme', ...adminOnly, settingsController.updateTheme);
router.patch('/maintenance', ...adminOnly, settingsController.toggleMaintenance);
router.put('/invoice',        ...adminOnly, settingsController.updateInvoiceSettings);
router.put('/reports-visibility', ...adminOnly, settingsController.updateReportsVisibility);

module.exports = router;
