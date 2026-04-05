const Notification = require('../models/Notification.model');
const User = require('../models/User.model');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response.utils');

// ─── CLIENT: Get My Notifications ─────────────────────
exports.getMyNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = {
      $or: [{ user: req.user._id }, { user: null }], // personal + broadcast
    };
    if (unreadOnly === 'true') filter.isRead = false;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Notification.countDocuments(filter),
      Notification.countDocuments({ ...filter, isRead: false }),
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));
    return paginatedResponse(res, 'Notifications fetched', notifications, {
      total, page: parseInt(page), limit: parseInt(limit), totalPages, unreadCount,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── CLIENT: Mark as Read ──────────────────────────────
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    await Notification.updateOne(
      { _id: id, $or: [{ user: req.user._id }, { user: null }] },
      { isRead: true }
    );
    return successResponse(res, 200, 'Notification marked as read');
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── CLIENT: Mark All as Read ──────────────────────────
exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { $or: [{ user: req.user._id }, { user: null }], isRead: false },
      { isRead: true }
    );
    return successResponse(res, 200, 'All notifications marked as read');
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── CLIENT: Delete Notification ──────────────────────
exports.deleteNotification = async (req, res) => {
  try {
    await Notification.deleteOne({
      _id: req.params.id,
      user: req.user._id, // can only delete own
    });
    return successResponse(res, 200, 'Notification deleted');
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── ADMIN: Send Broadcast Notification ───────────────
exports.adminBroadcast = async (req, res) => {
  try {
    const { title, message, link, type = 'new_offer', targetUserId } = req.body;

    if (!title || !message) return errorResponse(res, 400, 'title and message are required');

    if (targetUserId) {
      // Send to specific user
      const user = await User.findById(targetUserId);
      if (!user) return errorResponse(res, 404, 'User not found');

      const notification = await Notification.create({
        user: targetUserId,
        type,
        title,
        message,
        link: link || null,
        createdBy: req.user._id,
      });
      return successResponse(res, 201, 'Notification sent to user', { notification });
    } else {
      // Broadcast to ALL (user: null = global)
      const notification = await Notification.create({
        user: null,
        type,
        title,
        message,
        link: link || null,
        createdBy: req.user._id,
      });
      return successResponse(res, 201, 'Broadcast notification sent to all users', { notification });
    }
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── ADMIN: Get All Notifications ─────────────────────
exports.adminGetAll = async (req, res) => {
  try {
    const { page = 1, limit = 30, type } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filter = {};
    if (type) filter.type = type;

    const [notifications, total] = await Promise.all([
      Notification.find(filter)
        .populate('user', 'name email')
        .populate('createdBy', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Notification.countDocuments(filter),
    ]);

    return paginatedResponse(res, 'All notifications', notifications, {
      total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── ADMIN: Delete Notification ────────────────────────
exports.adminDelete = async (req, res) => {
  try {
    const n = await Notification.findByIdAndDelete(req.params.id);
    if (!n) return errorResponse(res, 404, 'Notification not found');
    return successResponse(res, 200, 'Notification deleted');
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── HELPER: Create system notification (used internally) ─
exports.createSystemNotification = async ({ userId, type, title, message, link, orderId }) => {
  try {
    await Notification.create({
      user: userId || null,
      type,
      title,
      message,
      link: link || null,
      relatedOrder: orderId || null,
      createdBy: null,
    });
  } catch (err) {
    console.error('Failed to create notification:', err.message);
  }
};
