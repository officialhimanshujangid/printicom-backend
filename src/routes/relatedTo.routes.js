const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth.middleware');
const { upload } = require('../utils/upload.utils');
const relatedToController = require('../controllers/relatedTo.controller');

const adminOnly = [protect, authorize('admin')];

// ─── Public Routes ──────────────────────────────────────────
// Get all active RelatedTos (for client browsing)
router.get('/', relatedToController.getAllRelatedTos);

// Get products belonging to a specific occasion (by slug or id)
router.get('/products/:slugOrId', relatedToController.getProductsByRelatedTo);

// Get single RelatedTo by slug (public — used by client app)
router.get('/slug/:slug', relatedToController.getRelatedToBySlug);

// Get single RelatedTo by id
router.get('/:id', relatedToController.getRelatedToById);

// ─── Admin Only Routes ──────────────────────────────────────
// Create RelatedTo
router.post(
  '/',
  ...adminOnly,
  (req, res, next) => { req.uploadType = 'relatedto'; next(); },
  upload.single('coverImage'),
  relatedToController.createRelatedTo
);

// Update RelatedTo
router.put(
  '/:id',
  ...adminOnly,
  (req, res, next) => { req.uploadType = 'relatedto'; next(); },
  upload.single('coverImage'),
  relatedToController.updateRelatedTo
);

// Delete RelatedTo
router.delete('/:id', ...adminOnly, relatedToController.deleteRelatedTo);

// Toggle active status
router.patch('/:id/toggle-status', ...adminOnly, relatedToController.toggleRelatedToStatus);

module.exports = router;
