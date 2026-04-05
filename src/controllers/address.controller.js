const Address = require('../models/Address.model');
const { successResponse, errorResponse } = require('../utils/response.utils');

// ─── Add Address ───────────────────────────────────────
exports.addAddress = async (req, res) => {
  try {
    const { label, fullName, phone, street, landmark, city, state, pincode, isDefault } = req.body;

    // If new address is default, unset existing default
    if (isDefault === true || isDefault === 'true') {
      await Address.updateMany({ user: req.user._id }, { isDefault: false });
    }

    const address = await Address.create({
      user: req.user._id,
      label,
      fullName,
      phone,
      street,
      landmark,
      city,
      state,
      pincode,
      isDefault: isDefault === true || isDefault === 'true',
    });

    return successResponse(res, 201, 'Address added successfully', { address });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Get My Addresses ──────────────────────────────────
exports.getMyAddresses = async (req, res) => {
  try {
    const addresses = await Address.find({ user: req.user._id }).sort({ isDefault: -1, createdAt: -1 });
    return successResponse(res, 200, 'Addresses fetched', { addresses });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Get Address By ID ─────────────────────────────────
exports.getAddressById = async (req, res) => {
  try {
    const address = await Address.findOne({ _id: req.params.id, user: req.user._id });
    if (!address) return errorResponse(res, 404, 'Address not found');
    return successResponse(res, 200, 'Address fetched', { address });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Update Address ────────────────────────────────────
exports.updateAddress = async (req, res) => {
  try {
    const { label, fullName, phone, street, landmark, city, state, pincode, isDefault } = req.body;

    const address = await Address.findOne({ _id: req.params.id, user: req.user._id });
    if (!address) return errorResponse(res, 404, 'Address not found');

    if (isDefault === true || isDefault === 'true') {
      await Address.updateMany({ user: req.user._id, _id: { $ne: address._id } }, { isDefault: false });
    }

    Object.assign(address, {
      label: label || address.label,
      fullName: fullName || address.fullName,
      phone: phone || address.phone,
      street: street || address.street,
      landmark: landmark !== undefined ? landmark : address.landmark,
      city: city || address.city,
      state: state || address.state,
      pincode: pincode || address.pincode,
      isDefault: isDefault === true || isDefault === 'true',
    });

    await address.save();
    return successResponse(res, 200, 'Address updated successfully', { address });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Delete Address ────────────────────────────────────
exports.deleteAddress = async (req, res) => {
  try {
    const address = await Address.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!address) return errorResponse(res, 404, 'Address not found');
    return successResponse(res, 200, 'Address deleted successfully');
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Set Default Address ───────────────────────────────
exports.setDefaultAddress = async (req, res) => {
  try {
    const address = await Address.findOne({ _id: req.params.id, user: req.user._id });
    if (!address) return errorResponse(res, 404, 'Address not found');

    await Address.updateMany({ user: req.user._id }, { isDefault: false });
    address.isDefault = true;
    await address.save();

    return successResponse(res, 200, 'Default address updated', { address });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};
