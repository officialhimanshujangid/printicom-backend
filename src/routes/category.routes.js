const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validation.middleware');
const { protect, authorize, requireEmailVerified } = require('../middleware/auth.middleware');
const { upload } = require('../utils/upload.utils');
const categoryController = require('../controllers/category.controller');

// ─── All category routes require admin ─────────────────────
const adminOnly = [protect, authorize('admin')];

// ─── Validation Rules ──────────────────────────────────────
const categoryRules = [
  body('name').trim().notEmpty().withMessage('Category name is required').isLength({ max: 80 }),
  body('description').optional().isLength({ max: 500 }),
  body('sortOrder').optional().isNumeric().withMessage('Sort order must be a number'),
];

// ─── Public Routes (clients can view active categories) ────
router.get('/', categoryController.getCategories);
router.get('/slug/:slug', categoryController.getCategoryBySlug);
router.get('/:id', categoryController.getCategoryById);

// ─── Admin Only Routes ─────────────────────────────────────
router.post(
  '/',
  ...adminOnly,
  (req, res, next) => { req.uploadType = 'category'; next(); },
  upload.single('image'),
  categoryRules,
  validate,
  categoryController.createCategory
);

router.put(
  '/:id',
  ...adminOnly,
  (req, res, next) => { req.uploadType = 'category'; next(); },
  upload.single('image'),
  categoryRules,
  validate,
  categoryController.updateCategory
);

router.delete('/:id', ...adminOnly, categoryController.deleteCategory);
router.patch('/:id/toggle-status', ...adminOnly, categoryController.toggleCategoryStatus);

module.exports = router;
