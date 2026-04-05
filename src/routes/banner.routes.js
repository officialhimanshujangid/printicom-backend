const express = require('express');
const router = express.Router();
const { protect, requireEmailVerified, authorize } = require('../middleware/auth.middleware');
const { upload } = require('../utils/upload.utils');
const bannerController = require('../controllers/banner.controller');

const adminOnly = [protect, requireEmailVerified, authorize('admin')];

// ─── PUBLIC: storefront fetches banners by placement ──
router.get('/public/:placement', bannerController.getPublicBanners);
router.post('/track-click/:id', bannerController.trackBannerClick);  // lightweight, no auth needed

// ─── ADMIN ─────────────────────────────────────────────
router.get('/', ...adminOnly, bannerController.getAllBanners);
router.post(
  '/',
  ...adminOnly,
  (req, res, next) => { req.uploadType = 'banner'; next(); },
  upload.fields([{ name: 'imageUrl', maxCount: 1 }, { name: 'mobileImageUrl', maxCount: 1 }]),
  bannerController.createBanner
);
router.put(
  '/:id',
  ...adminOnly,
  (req, res, next) => { req.uploadType = 'banner'; next(); },
  upload.fields([{ name: 'imageUrl', maxCount: 1 }, { name: 'mobileImageUrl', maxCount: 1 }]),
  bannerController.updateBanner
);
router.delete('/:id', ...adminOnly, bannerController.deleteBanner);
router.patch('/:id/toggle', ...adminOnly, bannerController.toggleBannerStatus);
router.post('/reorder', ...adminOnly, bannerController.reorderBanners);

module.exports = router;
