const { errorResponse } = require('../utils/response.utils');

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  console.error('🔥 Error:', err);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return errorResponse(res, 422, 'Validation Error', errors);
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return errorResponse(res, 409, `${field} already exists`);
  }

  // Mongoose CastError (invalid ID)
  if (err.name === 'CastError') {
    return errorResponse(res, 400, `Invalid ${err.path}: ${err.value}`);
  }

  // Multer errors
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return errorResponse(res, 400, 'File too large. Maximum size is 5MB.');
    }
    return errorResponse(res, 400, err.message);
  }

  // JWT error
  if (err.name === 'JsonWebTokenError') {
    return errorResponse(res, 401, 'Invalid token');
  }

  if (err.name === 'TokenExpiredError') {
    return errorResponse(res, 401, 'Token expired');
  }

  // Default server error
  return errorResponse(
    res,
    err.statusCode || 500,
    err.message || 'Internal Server Error'
  );
};

/**
 * 404 Not Found Handler
 */
const notFound = (req, res, next) => {
  return errorResponse(res, 404, `Route not found: ${req.originalUrl}`);
};

module.exports = { errorHandler, notFound };
