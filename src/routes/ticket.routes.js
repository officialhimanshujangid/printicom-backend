const express = require('express');
const { protect, authorize } = require('../middleware/auth.middleware');
const {
  getAllTickets,
  updateTicket,
  addResponse,
  createTicket,
} = require('../controllers/ticket.controller');

const router = express.Router();

// Protect all routes
router.use(protect);

// Client/Admin shared route for replies
router.post('/:id/responses', addResponse);

// Admin routes
router.use(authorize('admin'));
router.route('/').get(getAllTickets).post(createTicket); // Can also create as admin
router.patch('/:id', updateTicket);

module.exports = router;
