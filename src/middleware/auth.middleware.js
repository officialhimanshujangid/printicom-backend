const { verifyAccessToken } = require('../utils/jwt.utils');
const { errorResponse } = require('../utils/response.utils');
const User = require('../models/User.model');

/**
 * Protect routes — verifies JWT and attaches user to req
 */
const protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return errorResponse(res, 401, 'Access denied. No token provided.');
    }

    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return errorResponse(res, 401, 'Token invalid. User not found.');
    }

    if (!user.isActive) {
      return errorResponse(res, 403, 'Your account has been deactivated. Please contact support.');
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return errorResponse(res, 401, 'Token expired. Please login again.');
    }
    return errorResponse(res, 401, 'Invalid token.');
  }
};

/**
 * Restrict by role(s)
 * Usage: authorize('admin') or authorize('admin', 'client')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return errorResponse(
        res,
        403,
        `Access denied. Role '${req.user.role}' is not authorized for this action.`
      );
    }
    next();
  };
};

/**
 * Ensure email is verified before accessing protected routes
 */
const requireEmailVerified = (req, res, next) => {
  if (!req.user.isEmailVerified) {
    return errorResponse(
      res,
      403,
      'Please verify your email address before accessing this resource.'
    );
  }
  next();
};

module.exports = { protect, authorize, requireEmailVerified };
