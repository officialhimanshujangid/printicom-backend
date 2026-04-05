const { validationResult } = require('express-validator');
const { errorResponse } = require('../utils/response.utils');

/**
 * Runs after express-validator rules and returns formatted errors
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((err) => ({
      field: err.path,
      message: err.msg,
    }));
    return errorResponse(res, 422, 'Validation failed', formattedErrors);
  }
  next();
};

module.exports = { validate };
