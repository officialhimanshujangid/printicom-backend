const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/invoice.controller');

const adminOnly = [protect, authorize('admin')];

// ── List & Create ─────────────────────────────────────────────
router.get('/',           ...adminOnly, ctrl.listInvoices);
router.post('/',          ...adminOnly, ctrl.createInvoice);

// ── Report ────────────────────────────────────────────────────
router.get('/report/summary', ...adminOnly, ctrl.getInvoiceReport);

// ── Single Invoice ────────────────────────────────────────────
router.get('/:id',        ...adminOnly, ctrl.getInvoice);
router.put('/:id',        ...adminOnly, ctrl.updateInvoice);

// ── Actions ───────────────────────────────────────────────────
router.post('/:id/cancel',        ...adminOnly, ctrl.cancelInvoice);
router.post('/:id/revoke',        ...adminOnly, ctrl.revokeInvoice);
router.get('/:id/pdf',            ...adminOnly, ctrl.downloadInvoicePDF);
router.post('/:id/send-email',    ...adminOnly, ctrl.sendEmail);
router.post('/:id/send-whatsapp', ...adminOnly, ctrl.sendWhatsApp);

module.exports = router;
