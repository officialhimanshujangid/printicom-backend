const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contact.controller');
const { protect, requireEmailVerified, authorize } = require('../middleware/auth.middleware');

const adminOnly = [protect, requireEmailVerified, authorize('admin')];

// ─── PUBLIC ───────────────────────────────────────────
router.post('/submit', contactController.submitContact);
router.post('/bulk-order', contactController.submitBulkOrder);

// ─── ADMIN ────────────────────────────────────────────
router.get('/admin', ...adminOnly, contactController.adminListSubmissions);
router.get('/admin/stats', ...adminOnly, contactController.adminStats);
router.put('/admin/:id', ...adminOnly, contactController.adminUpdateStatus);
router.delete('/admin/:id', ...adminOnly, contactController.adminDeleteSubmission);

module.exports = router;
