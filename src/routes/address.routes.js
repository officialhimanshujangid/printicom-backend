const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validation.middleware');
const { protect, requireEmailVerified } = require('../middleware/auth.middleware');
const addressController = require('../controllers/address.controller');

const addressRules = [
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('phone').matches(/^[6-9]\d{9}$/).withMessage('Valid Indian mobile number required'),
  body('street').trim().notEmpty().withMessage('Street address is required'),
  body('city').trim().notEmpty().withMessage('City is required'),
  body('state').trim().notEmpty().withMessage('State is required'),
  body('pincode').matches(/^\d{6}$/).withMessage('Valid 6-digit pincode required'),
];

router.use(protect, requireEmailVerified);

router.get('/', addressController.getMyAddresses);
router.post('/', addressRules, validate, addressController.addAddress);
router.get('/:id', addressController.getAddressById);
router.put('/:id', addressRules, validate, addressController.updateAddress);
router.delete('/:id', addressController.deleteAddress);
router.patch('/:id/set-default', addressController.setDefaultAddress);

module.exports = router;
