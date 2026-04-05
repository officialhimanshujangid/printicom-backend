const express = require('express');
const router = express.Router();
const { protect, requireEmailVerified, authorize } = require('../middleware/auth.middleware');
const { upload } = require('../utils/upload.utils');
const reviewController = require('../controllers/review.controller');

// Public: anyone can read approved reviews for a product (detail page)
router.get('/product/:productId', reviewController.getProductReviews);

router.use(protect, requireEmailVerified);

// ─── Admin Routes (MUST be before /:id wildcard) ──────
router.get('/admin/all', authorize('admin'), reviewController.adminListReviews);
router.delete('/admin/:id', authorize('admin'), reviewController.adminDeleteReview);
router.patch('/:id/toggle', authorize('admin'), reviewController.adminToggleReview);
router.post('/:id/reply', authorize('admin'), reviewController.adminReplyReview);

// ─── Client Routes ─────────────────────────────────────
router.get('/my', reviewController.getMyReviews);
router.post(
  '/',
  (req, res, next) => { req.uploadType = 'review'; next(); },
  upload.array('images', 5),
  reviewController.addReview
);
router.put(
  '/:id',
  (req, res, next) => { req.uploadType = 'review'; next(); },
  upload.array('images', 5),
  reviewController.updateReview
);
router.delete('/:id', reviewController.deleteReview);

module.exports = router;
