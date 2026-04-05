const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validation.middleware');
const { protect, requireEmailVerified, authorize } = require('../middleware/auth.middleware');
const couponController = require('../controllers/coupon.controller');

const couponCreateRules = [
  body('code').trim().notEmpty().withMessage('Coupon code is required')
    .matches(/^[A-Z0-9]{3,20}$/i).withMessage('Code must be 3-20 alphanumeric characters'),
  body('discountType').isIn(['percentage', 'flat']).withMessage('Must be percentage or flat'),
  body('discountValue').isFloat({ min: 1 }).withMessage('Discount value must be at least 1'),
  body('validFrom').isISO8601().withMessage('Valid validFrom date required'),
  body('validUntil').isISO8601().withMessage('Valid validUntil date required'),
];

// ─── Admin Routes ──────────────────────────────────────
router.use(protect, requireEmailVerified);

router.post('/validate', couponController.validateCoupon);

router.use(authorize('admin'));
router.post('/targeted-campaign', couponController.createTargetedCampaign);
router.get('/', couponController.getAllCoupons);
router.post('/', couponCreateRules, validate, couponController.createCoupon);
router.get('/:id', couponController.getCouponById);
router.put('/:id', couponController.updateCoupon);
router.delete('/:id', couponController.deleteCoupon);
router.patch('/:id/toggle-status', couponController.toggleCouponStatus);

module.exports = router;
