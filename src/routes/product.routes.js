const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validation.middleware');
const { protect, authorize } = require('../middleware/auth.middleware');
const { upload } = require('../utils/upload.utils');
const productController = require('../controllers/product.controller');

const adminOnly = [protect, authorize('admin')];

const productRules = [
  body('name').trim().notEmpty().withMessage('Product name is required').isLength({ max: 120 }),
  body('category').notEmpty().withMessage('Category is required').isMongoId().withMessage('Invalid category ID'),
  body('productType')
    .notEmpty()
    .withMessage('Product type is required')
    .isIn(['mug', 'calendar', 'photo_print', 'canvas_print', 'pillow', 'keychain', 'frame', 'poster', 'card', 'custom'])
    .withMessage('Invalid product type'),
  body('basePrice').isFloat({ min: 0 }).withMessage('Base price must be a positive number'),
  body('discountPrice').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('Discount price must be a positive number'),
];

// ─── Public Routes ─────────────────────────────────────────
router.get('/search/smart', productController.smartSearch);
router.get('/featured', productController.getFeaturedProducts);
router.get('/', productController.getProducts);
router.get('/by-category/:categoryId', productController.getProductsByCategory);
router.get('/slug/:slug', productController.getProductBySlug);
router.get('/:productId/recommendations', productController.getRecommendations);
router.get('/:id', productController.getProductById);

// ─── Admin Only Routes ─────────────────────────────────────

router.post('/bulk-pricing', ...adminOnly, productController.bulkUpdatePricing);
router.get('/admin/stock-overview', ...adminOnly, productController.getStockOverview);
router.patch('/:id/stock', ...adminOnly, productController.adjustStock);

// upload.any() allows both 'images' field and dynamic 'relatedToImages_<id>' fields
router.post(
  '/',
  ...adminOnly,
  (req, res, next) => { req.uploadType = 'product'; next(); },
  upload.any(),
  productRules,
  validate,
  productController.createProduct
);

router.put(
  '/:id',
  ...adminOnly,
  (req, res, next) => { req.uploadType = 'product'; next(); },
  upload.any(),
  productController.updateProduct
);

router.delete('/:id', ...adminOnly, productController.deleteProduct);
router.patch('/:id/toggle-status', ...adminOnly, productController.toggleProductStatus);

module.exports = router;

