const Ticket = require('../models/Ticket.model');

// ─── ADMIN: Get all tickets ─────────────────────────────────
exports.getAllTickets = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.priority) filter.priority = req.query.priority;

    const tickets = await Ticket.find(filter)
      .populate('user', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: tickets.length,
      data: tickets,
    });
  } catch (error) {
    next(error);
  }
};

// ─── ADMIN: Update ticket status/priority ──────────────────
exports.updateTicket = async (req, res, next) => {
  try {
    const ticket = await Ticket.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    res.json({ success: true, data: ticket });
  } catch (error) {
    next(error);
  }
};

// ─── ADMIN/CLIENT: Add a response (reply) ──────────────────
exports.addResponse = async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    ticket.responses.push({
      sender: req.user.id,
      message,
    });
    
    ticket.status = 'In Progress'; // auto-update status when replied
    await ticket.save();

    res.json({ success: true, data: ticket });
  } catch (error) {
    next(error);
  }
};

// ─── CLIENT: Create Ticket ──────────────────────────────────
exports.createTicket = async (req, res, next) => {
  try {
    const { subject, category, priority, description } = req.body;
    const ticket = await Ticket.create({
      user: req.user.id,
      subject,
      category,
      priority,
      description,
    });

    res.status(201).json({ success: true, data: ticket });
  } catch (error) {
    next(error);
  }
};
