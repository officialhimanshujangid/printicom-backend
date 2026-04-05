const express = require('express');
const router = express.Router();
const legalPageController = require('../controllers/legalPage.controller');
const { protect, requireEmailVerified, authorize } = require('../middleware/auth.middleware');

const adminOnly = [protect, requireEmailVerified, authorize('admin')];

// ─── PUBLIC ───────────────────────────────────────────
router.get('/', legalPageController.listPublicPages);
router.get('/:slug', legalPageController.getPublicPage);

// ─── ADMIN ────────────────────────────────────────────
router.get('/admin/list', ...adminOnly, legalPageController.adminListPages);
router.get('/admin/:slug', ...adminOnly, legalPageController.adminGetPage);
router.put('/admin/:slug', ...adminOnly, legalPageController.adminUpdatePage);

module.exports = router;
