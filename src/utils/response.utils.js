/**
 * Standardized API response helper
 */

const transformImagePath = (path) => {
  if (path && typeof path === 'string') {
    if (path.startsWith('http://') || path.startsWith('https://')) return path; // Skip if already complete URL
    
    // Normalize path to forward slashes just in case windows saved it wrong
    const normalizedPath = path.replace(/\\/g, '/');
    if (normalizedPath.startsWith('uploads/')) {
      const baseUrl = process.env.API_BASE_URL || 'http://localhost:5000';
      return `${baseUrl}/${normalizedPath}`;
    }
  }
  return path;
};

const formatResponseData = (data) => {
  if (!data) return data;
  
  // deeply clone to resolve all Mongoose documents to raw JS objects
  // (identical to what express's res.json does inherently)
  let parsedData = data;
  if (typeof data === 'object') {
    parsedData = JSON.parse(JSON.stringify(data));
  } else if (typeof data === 'string') {
    return transformImagePath(data);
  }

  // Define recursive traversal
  const traverse = (obj) => {
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        if (typeof obj[i] === 'string') {
          obj[i] = transformImagePath(obj[i]);
        } else if (typeof obj[i] === 'object' && obj[i] !== null) {
          traverse(obj[i]);
        }
      }
    } else if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          obj[key] = transformImagePath(obj[key]);
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          traverse(obj[key]);
        }
      }
    }
    return obj;
  };

  return traverse(parsedData);
};

const successResponse = (res, statusCode = 200, message = 'Success', data = null) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data: formatResponseData(data),
  });
};

const errorResponse = (res, statusCode = 500, message = 'Internal Server Error', errors = null) => {
  const response = { success: false, message };
  if (errors) response.errors = errors;
  return res.status(statusCode).json(response);
};

const paginatedResponse = (res, message = 'Success', data = [], pagination = {}) => {
  return res.status(200).json({
    success: true,
    message,
    data: formatResponseData(data),
    pagination,
  });
};

module.exports = { successResponse, errorResponse, paginatedResponse, formatResponseData };
