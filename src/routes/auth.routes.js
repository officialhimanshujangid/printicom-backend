const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validation.middleware');
const { protect, requireEmailVerified } = require('../middleware/auth.middleware');
const { upload } = require('../utils/upload.utils');
const authController = require('../controllers/auth.controller');

// ─── Validation Rules ──────────────────────────────────────
const registerRules = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 60 }),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase, and a number'),
  body('phone').optional().matches(/^[6-9]\d{9}$/).withMessage('Invalid Indian mobile number'),
];

const loginRules = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

const forgotPasswordRules = [body('email').isEmail().withMessage('Valid email is required')];

const resetPasswordRules = [
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase, and a number'),
];

// ─── Public Routes ─────────────────────────────────────────
router.post('/register', registerRules, validate, authController.register);
router.post('/login', loginRules, validate, authController.login);
router.get('/verify-email/:token', authController.verifyEmail);
router.post('/resend-verification', forgotPasswordRules, validate, authController.resendVerificationEmail);
router.post('/forgot-password', forgotPasswordRules, validate, authController.forgotPassword);
router.post('/reset-password/:token', resetPasswordRules, validate, authController.resetPassword);
router.post('/refresh-token', authController.refreshToken);

// ─── Protected Routes ──────────────────────────────────────
router.use(protect);
router.post('/logout', authController.logout);
router.get('/profile', requireEmailVerified, authController.getProfile);
router.put(
  '/profile',
  requireEmailVerified,
  (req, res, next) => {
    req.uploadType = 'profile';
    next();
  },
  upload.single('profilePhoto'),
  authController.updateProfile
);
router.put(
  '/change-password',
  requireEmailVerified,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Must contain uppercase, lowercase, and number'),
  ],
  validate,
  authController.changePassword
);

module.exports = router;
