const express = require('express');
const { protect, authorize } = require('../middleware/auth.middleware');
const { getAuditLogs } = require('../controllers/auditLog.controller');

const router = express.Router();

router.use(protect);
router.use(authorize('admin'));

router.get('/', getAuditLogs);

module.exports = router;
