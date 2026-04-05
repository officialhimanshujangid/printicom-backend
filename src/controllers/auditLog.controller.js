const AuditLog = require('../models/AuditLog.model');

// ─── ADMIN: Get recent audit logs ────────────────────────────
exports.getAuditLogs = async (req, res, next) => {
  try {
    const logs = await AuditLog.find()
      .populate('user', 'name email role')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({
      success: true,
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    next(error);
  }
};

// Log a new activity internally (helper for other controllers)
exports.logActivity = async (userId, action, entityType, entityId, details = '', ipAddress = '') => {
  try {
    await AuditLog.create({
      user: userId,
      action,
      entityType,
      entityId,
      details,
      ipAddress,
    });
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
};
