const express = require('express');
const router = express.Router();
const faqController = require('../controllers/faq.controller');
const { protect, requireEmailVerified, authorize } = require('../middleware/auth.middleware');

const adminOnly = [protect, requireEmailVerified, authorize('admin')];

// ─── PUBLIC ───────────────────────────────────────────
router.get('/', faqController.getPublicFAQs);

// ─── ADMIN ────────────────────────────────────────────
router.get('/admin', ...adminOnly, faqController.adminGetFAQs);
router.post('/admin', ...adminOnly, faqController.createFAQ);
router.put('/admin/reorder', ...adminOnly, faqController.reorderFAQs);
router.put('/admin/:id', ...adminOnly, faqController.updateFAQ);
router.delete('/admin/:id', ...adminOnly, faqController.deleteFAQ);

module.exports = router;
