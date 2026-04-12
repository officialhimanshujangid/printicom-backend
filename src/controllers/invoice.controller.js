const Invoice = require('../models/Invoice.model');
const SiteSettings = require('../models/SiteSettings.model');
const User = require('../models/User.model');
const Product = require('../models/Product.model');
const nodemailer = require('nodemailer');
const { successResponse, errorResponse } = require('../utils/response.utils');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute GST type based on client state vs business state.
 * If same state → CGST + SGST, else → IGST
 */
function computeGstType(clientState, businessState) {
  if (!clientState || !businessState) return 'none';
  const normalize = (s) => s.trim().toLowerCase().replace(/\s+/g, '');
  return normalize(clientState) === normalize(businessState) ? 'cgst_sgst' : 'igst';
}

/**
 * Compute totals for each line item and overall invoice.
 */
function computeInvoiceTotals(items, clientState, businessState, shippingCharge = 0, invoiceDiscount = 0) {
  let subtotal = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0;

  const processedItems = items.map(item => {
    const taxableAmount = ((item.unitPrice || 0) - (item.discount || 0)) * (item.qty || 1);
    const gstType = (item.gstRate || 0) > 0 ? computeGstType(clientState, businessState) : 'none';

    let cgst = 0, sgst = 0, igst = 0;
    if (gstType === 'cgst_sgst') {
      cgst = Math.round(taxableAmount * (item.gstRate / 2) / 100 * 100) / 100;
      sgst = cgst;
    } else if (gstType === 'igst') {
      igst = Math.round(taxableAmount * item.gstRate / 100 * 100) / 100;
    }

    const lineTotal = taxableAmount + cgst + sgst + igst;
    subtotal   += taxableAmount;
    totalCgst  += cgst;
    totalSgst  += sgst;
    totalIgst  += igst;

    return { ...item, taxableAmount, gstType, cgst, sgst, igst, lineTotal };
  });

  const totalGst   = totalCgst + totalSgst + totalIgst;
  const grandTotal = Math.round((subtotal + totalGst + (shippingCharge || 0) - (invoiceDiscount || 0)) * 100) / 100;
  const roundOff   = Math.round(grandTotal) - grandTotal;

  return {
    items: processedItems,
    subtotal:   Math.round(subtotal * 100) / 100,
    totalCgst:  Math.round(totalCgst * 100) / 100,
    totalSgst:  Math.round(totalSgst * 100) / 100,
    totalIgst:  Math.round(totalIgst * 100) / 100,
    totalGst:   Math.round(totalGst * 100) / 100,
    grandTotal: Math.round(grandTotal * 100) / 100,
    roundOff:   Math.round(roundOff * 100) / 100,
  };
}

/**
 * Get business snapshot from settings + settings invoice config.
 */
async function getBusinessSnapshot() {
  const settings = await SiteSettings.findOne().lean();
  return {
    name:    settings?.siteName || 'Business',
    logo:    settings?.logoUrl || '',
    address: settings?.address || '',
    phone:   settings?.supportPhone || '',
    email:   settings?.supportEmail || '',
    gstin:   settings?.tax?.gstNumber || '',
    state:   settings?.invoice?.businessState || '',
  };
}

/**
 * Generate HTML for invoice PDF/email.
 */
function generateInvoiceHTML(invoice) {
  const fmt = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const gstSection = (() => {
    const hasIgst = invoice.totalIgst > 0;
    const hasCgstSgst = invoice.totalCgst > 0 || invoice.totalSgst > 0;
    if (!hasIgst && !hasCgstSgst) return '';
    if (hasIgst) return `<tr><td>IGST</td><td style="text-align:right">${fmt(invoice.totalIgst)}</td></tr>`;
    return `<tr><td>CGST</td><td style="text-align:right">${fmt(invoice.totalCgst)}</td></tr>
            <tr><td>SGST</td><td style="text-align:right">${fmt(invoice.totalSgst)}</td></tr>`;
  })();

  const itemRows = invoice.items.map(item => `
    <tr>
      <td>${item.description}${item.hsn ? ` <small style="color:#888">(HSN: ${item.hsn})</small>` : ''}</td>
      <td style="text-align:center">${item.qty}</td>
      <td style="text-align:right">${fmt(item.unitPrice)}</td>
      ${item.discount > 0 ? `<td style="text-align:right">${fmt(item.discount)}</td>` : '<td></td>'}
      <td style="text-align:right">${item.gstRate > 0 ? `${item.gstRate}%` : '—'}</td>
      <td style="text-align:right"><strong>${fmt(item.lineTotal)}</strong></td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Invoice ${invoice.invoiceNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1a1a2e; background: #fff; padding: 32px; }
    .invoice-wrapper { max-width: 800px; margin: auto; background: #fff; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 3px solid #FF6B35; }
    .brand-logo { max-height: 60px; max-width: 180px; object-fit: contain; }
    .brand-name { font-size: 26px; font-weight: 800; color: #FF6B35; letter-spacing: -0.5px; }
    .brand-sub  { font-size: 11px; color: #888; margin-top: 2px; }
    .invoice-title { text-align: right; }
    .invoice-title h1 { font-size: 28px; font-weight: 900; color: #1a1a2e; letter-spacing: 1px; text-transform: uppercase; }
    .invoice-title .inv-num { font-size: 15px; color: #FF6B35; font-weight: 700; margin-top: 4px; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
    .badge-paid { background: #dcfce7; color: #16a34a; }
    .badge-sent { background: #dbeafe; color: #2563eb; }
    .badge-draft { background: #f3f4f6; color: #6b7280; }
    .badge-cancelled { background: #fee2e2; color: #dc2626; }
    .badge-revoked { background: #fef3c7; color: #d97706; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
    .party-block h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #888; margin-bottom: 8px; font-weight: 700; }
    .party-block p { font-size: 13px; color: #1a1a2e; line-height: 1.6; }
    .party-block .company { font-size: 15px; font-weight: 700; color: #1a1a2e; margin-bottom: 2px; }
    .party-block .gstin { font-size: 11px; color: #FF6B35; font-weight: 600; margin-top: 4px; }
    .dates-row { display: flex; gap: 24px; margin-bottom: 24px; }
    .date-item { background: #f8f9fa; border-radius: 8px; padding: 10px 16px; flex: 1; }
    .date-item .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #888; font-weight: 700; }
    .date-item .value { font-size: 14px; font-weight: 700; color: #1a1a2e; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    thead tr { background: #1a1a2e; color: #fff; }
    thead th { padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
    tbody tr:nth-child(even) { background: #f8f9fa; }
    tbody td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid #e5e7eb; }
    .totals { margin-left: auto; width: 300px; }
    .totals table td { padding: 7px 12px; border-bottom: 1px solid #f0f0f0; }
    .totals table td:first-child { color: #666; }
    .totals table td:last-child { font-weight: 600; }
    .total-row { background: #1a1a2e !important; color: #fff !important; }
    .total-row td { font-size: 15px !important; font-weight: 800 !important; padding: 12px !important; }
    .notes-section { margin-top: 28px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
    .notes-section h4 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #888; font-weight: 700; margin-bottom: 6px; }
    .notes-section p { font-size: 12px; color: #555; line-height: 1.6; white-space: pre-line; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 2px solid #FF6B35; display: flex; justify-content: space-between; align-items: center; }
    .footer .tagline { font-size: 11px; color: #aaa; }
    .footer .site { font-size: 13px; color: #FF6B35; font-weight: 700; }
    .cancelled-stamp { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%) rotate(-30deg); font-size: 72px; font-weight: 900; color: rgba(220,38,38,0.12); pointer-events: none; text-transform: uppercase; letter-spacing: 4px; z-index: 0; }
  </style>
</head>
<body>
  ${invoice.status === 'cancelled' ? '<div class="cancelled-stamp">CANCELLED</div>' : ''}
  ${invoice.status === 'revoked' ? '<div class="cancelled-stamp">REVOKED</div>' : ''}
  <div class="invoice-wrapper">
    <div class="header">
      <div class="brand">
        ${invoice.business?.logo ? `<img src="${invoice.business.logo}" class="brand-logo" alt="logo"/>` : `<div class="brand-name">${invoice.business?.name || 'Business'}</div>`}
        <div class="brand-sub">${invoice.business?.gstin ? `GSTIN: ${invoice.business.gstin}` : ''}</div>
      </div>
      <div class="invoice-title">
        <h1>Invoice</h1>
        <div class="inv-num">${invoice.invoiceNumber}</div>
        <div style="margin-top:6px"><span class="badge badge-${invoice.status}">${invoice.status.toUpperCase()}</span></div>
      </div>
    </div>

    <div class="parties">
      <div class="party-block">
        <h3>From</h3>
        <p class="company">${invoice.business?.name || ''}</p>
        <p>${invoice.business?.address || ''}</p>
        <p>${invoice.business?.phone ? `📞 ${invoice.business.phone}` : ''}</p>
        <p>${invoice.business?.email ? `✉ ${invoice.business.email}` : ''}</p>
        ${invoice.business?.gstin ? `<p class="gstin">GSTIN: ${invoice.business.gstin}</p>` : ''}
        ${invoice.business?.state ? `<p style="font-size:11px;color:#888">State: ${invoice.business.state}</p>` : ''}
      </div>
      <div class="party-block">
        <h3>Bill To</h3>
        <p class="company">${invoice.client?.name || ''}</p>
        <p>${invoice.client?.address || ''}</p>
        ${invoice.client?.city ? `<p>${invoice.client.city}${invoice.client?.state ? `, ${invoice.client.state}` : ''}${invoice.client?.pincode ? ` - ${invoice.client.pincode}` : ''}</p>` : ''}
        ${invoice.client?.phone ? `<p>📞 ${invoice.client.phone}</p>` : ''}
        ${invoice.client?.email ? `<p>✉ ${invoice.client.email}</p>` : ''}
        ${invoice.client?.gstin ? `<p class="gstin">GSTIN: ${invoice.client.gstin}</p>` : ''}
      </div>
    </div>

    <div class="dates-row">
      <div class="date-item">
        <div class="label">Invoice Date</div>
        <div class="value">${fmtDate(invoice.issueDate)}</div>
      </div>
      <div class="date-item">
        <div class="label">Due Date</div>
        <div class="value">${fmtDate(invoice.dueDate)}</div>
      </div>
      ${invoice.linkedOrder ? `<div class="date-item"><div class="label">Order Reference</div><div class="value" style="font-size:12px">${invoice.linkedOrder?.orderNumber || String(invoice.linkedOrder)}</div></div>` : ''}
    </div>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align:center">Qty</th>
          <th style="text-align:right">Unit Price</th>
          <th style="text-align:right">Discount</th>
          <th style="text-align:right">GST</th>
          <th style="text-align:right">Total</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div class="totals">
      <table>
        <tr><td>Subtotal</td><td style="text-align:right">${fmt(invoice.subtotal)}</td></tr>
        ${invoice.shippingCharge > 0 ? `<tr><td>Shipping</td><td style="text-align:right">${fmt(invoice.shippingCharge)}</td></tr>` : ''}
        ${invoice.discount > 0 ? `<tr><td>Discount</td><td style="text-align:right">-${fmt(invoice.discount)}</td></tr>` : ''}
        ${gstSection}
        ${invoice.roundOff !== 0 ? `<tr><td>Round Off</td><td style="text-align:right">${fmt(invoice.roundOff)}</td></tr>` : ''}
        <tr class="total-row"><td>Grand Total</td><td style="text-align:right">${fmt(invoice.grandTotal + invoice.roundOff)}</td></tr>
      </table>
    </div>

    ${invoice.notes ? `<div class="notes-section"><h4>Notes</h4><p>${invoice.notes}</p></div>` : ''}
    ${invoice.terms ? `<div class="notes-section"><h4>Terms & Conditions</h4><p>${invoice.terms}</p></div>` : ''}

    <div class="footer">
      <div class="tagline">Thank you for your business!</div>
      <div class="site">${invoice.business?.name || 'Printicom'}</div>
    </div>
  </div>
</body>
</html>`;
}

// ─── Generate PDF Buffer ──────────────────────────────────────────────────────
async function generatePDFBuffer(invoice) {
  try {
    const puppeteer = require('puppeteer-core');
    let chromium;
    try {
      chromium = require('@sparticuz/chromium');
    } catch (_) { chromium = null; }

    const launchArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];
    const fs = require('fs');
    let browser;

    // Always check for system Chrome first (works perfectly for local Windows/Mac development)
    const paths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
    ];
    const execPath = paths.find(p => fs.existsSync(p));

    if (execPath) {
      browser = await puppeteer.launch({ executablePath: execPath, headless: 'new', args: launchArgs });
    } else if (chromium) {
      // Fallback to Sparticuz (typically for Serverless/Linux environments)
      browser = await puppeteer.launch({
        args: chromium.args || launchArgs,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless ?? true,
      });
    } else {
      throw new Error('Chrome executable not found. Install Google Chrome or chromium.');
    }

    const page = await browser.newPage();
    await page.setContent(generateInvoiceHTML(invoice), { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } });
    await browser.close();
    return Buffer.from(pdf);
  } catch (err) {
    console.error('[Invoice PDF Error]', err.message);
    throw new Error('PDF generation failed: ' + err.message);
  }
}

// ─── Send Invoice Email ───────────────────────────────────────────────────────
async function sendInvoiceEmail(invoice, pdfBuffer) {
  const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const html = `
  <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;background:#f8f9fa;border-radius:12px">
    <div style="background:#1a1a2e;padding:20px 24px;border-radius:10px 10px 0 0;margin:-24px -24px 24px">
      <h2 style="color:#FF6B35;margin:0;font-size:22px">Invoice ${invoice.invoiceNumber}</h2>
      <p style="color:#aaa;margin:4px 0 0;font-size:12px">from ${invoice.business?.name}</p>
    </div>
    <p style="color:#333">Dear <strong>${invoice.client?.name}</strong>,</p>
    <p style="color:#555">Please find your invoice attached. Here's a summary:</p>
    <table style="width:100%;background:#fff;border-radius:8px;padding:16px;margin:16px 0">
      <tr><td style="color:#888;padding:6px 0">Invoice #</td><td style="font-weight:700">${invoice.invoiceNumber}</td></tr>
      <tr><td style="color:#888;padding:6px 0">Issue Date</td><td>${new Date(invoice.issueDate).toLocaleDateString('en-IN')}</td></tr>
      <tr><td style="color:#888;padding:6px 0">Due Date</td><td>${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('en-IN') : 'On Receipt'}</td></tr>
      <tr><td style="color:#888;padding:6px 0">Amount Due</td><td style="font-size:18px;font-weight:900;color:#FF6B35">₹${(invoice.grandTotal || 0).toLocaleString('en-IN')}</td></tr>
    </table>
    <p style="color:#555;font-size:13px">For any queries, feel free to reach out to us at <a href="mailto:${invoice.business?.email}" style="color:#FF6B35">${invoice.business?.email}</a></p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/>
    <p style="color:#aaa;font-size:11px;text-align:center">${invoice.business?.name} · ${invoice.business?.address}</p>
  </div>`;

  await transporter.sendMail({
    from:        `"${invoice.business?.name || process.env.EMAIL_FROM_NAME}" <${process.env.SMTP_USER}>`,
    to:          invoice.client?.email,
    subject:     `Invoice ${invoice.invoiceNumber} from ${invoice.business?.name}`,
    html,
    attachments: pdfBuffer ? [{ filename: `${invoice.invoiceNumber}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }] : [],
  });
}

// ─── Send WhatsApp via Meta Cloud API ────────────────────────────────────────
async function sendInvoiceWhatsApp(invoice, settings) {
  const apiKey    = settings?.invoice?.whatsAppApiKey;
  const phoneId   = settings?.invoice?.whatsAppPhoneNumberId;
  const clientPhone = invoice.client?.phone?.replace(/[^0-9]/g, '');

  if (!apiKey || !phoneId || !clientPhone) {
    throw new Error('WhatsApp not configured or client phone missing');
  }

  const response = await fetch(
    `https://graph.facebook.com/v19.0/${phoneId}/messages`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: clientPhone,
        type: 'text',
        text: {
          body: `Hello ${invoice.client?.name}! 🙏\n\nYour invoice *${invoice.invoiceNumber}* from *${invoice.business?.name}* is ready.\n\n*Amount: ₹${(invoice.grandTotal || 0).toLocaleString('en-IN')}*\n\nThank you for your business!`
        }
      })
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err?.error?.message || 'WhatsApp send failed');
  }
  return response.json();
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /api/invoices?page=&limit=&status=&type=&search=&fy=
 */
exports.listInvoices = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, type, search, fy } = req.query;
    const query = {};
    if (status) query.status = status;
    if (type)   query.type = type;
    if (fy)     query.financialYear = fy;
    if (search) {
      query.$or = [
        { invoiceNumber: new RegExp(search, 'i') },
        { 'client.name': new RegExp(search, 'i') },
        { 'client.email': new RegExp(search, 'i') },
      ];
    }

    const [invoices, total] = await Promise.all([
      Invoice.find(query)
        .sort({ createdAt: -1 })
        .skip((+page - 1) * +limit)
        .limit(+limit)
        .lean(),
      Invoice.countDocuments(query),
    ]);

    return successResponse(res, 200, 'Invoices fetched', {
      invoices,
      pagination: { page: +page, limit: +limit, total, totalPages: Math.ceil(total / +limit) },
    });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
};

/**
 * GET /api/invoices/:id
 */
exports.getInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('linkedOrder', 'orderNumber')
      .populate('linkedUser', 'name email phone')
      .lean();
    if (!invoice) return errorResponse(res, 404, 'Invoice not found');
    return successResponse(res, 200, 'Invoice fetched', { invoice });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
};

/**
 * POST /api/invoices
 * Create a manual invoice.
 * If client details provided and no linkedUser, auto-creates client (no password account).
 */
exports.createInvoice = async (req, res) => {
  try {
    const {
      client, items, shippingCharge, discount: invoiceDiscount,
      notes, terms, issueDate, dueDate,
      linkedOrder, linkedUser: linkedUserId,
      status = 'draft',
    } = req.body;

    if (!client?.name) return errorResponse(res, 400, 'Client name is required');
    if (!items || !items.length) return errorResponse(res, 400, 'At least one line item is required');

    const settings   = await SiteSettings.findOne().lean();
    const business   = await getBusinessSnapshot();
    const clientState = client.state || '';

    // Compute totals
    const computed = computeInvoiceTotals(items, clientState, business.state, shippingCharge, invoiceDiscount);

    // Auto-create client user if email provided and no linkedUser
    let resolvedLinkedUser = linkedUserId || null;
    if (!resolvedLinkedUser && client.email) {
      const existingUser = await User.findOne({ email: client.email }).lean();
      if (existingUser) {
        resolvedLinkedUser = existingUser._id;
      }
      // (Don't auto-create a User account with role — just link if found)
    }

    const invoice = new Invoice({
      type: linkedOrder ? 'order' : 'manual',
      status,
      client,
      business,
      items: computed.items,
      subtotal: computed.subtotal,
      totalCgst: computed.totalCgst,
      totalSgst: computed.totalSgst,
      totalIgst: computed.totalIgst,
      totalGst:  computed.totalGst,
      grandTotal: computed.grandTotal,
      roundOff:  computed.roundOff,
      shippingCharge: shippingCharge || 0,
      discount: invoiceDiscount || 0,
      notes,
      terms: terms || settings?.invoice?.defaultTerms || '',
      issueDate: issueDate || new Date(),
      dueDate:   dueDate || null,
      linkedOrder: linkedOrder || null,
      linkedUser:  resolvedLinkedUser,
      createdBy: req.user._id,
    });

    await invoice.save();

    // Auto-send email if enabled
    if (settings?.invoice?.emailOnCreate && client?.email && status !== 'draft') {
      try {
        await sendInvoiceEmail(invoice, null);
        invoice.emailSentAt = new Date();
        await invoice.save();
      } catch (emailErr) {
        console.error('[Invoice Email Error]', emailErr.message);
      }
    }

    return successResponse(res, 201, 'Invoice created', { invoice });
  } catch (err) {
    console.error('[Invoice Create Error]', err);
    return errorResponse(res, 500, err.message);
  }
};

/**
 * PUT /api/invoices/:id
 */
exports.updateInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return errorResponse(res, 404, 'Invoice not found');
    if (['cancelled', 'revoked'].includes(invoice.status)) {
      return errorResponse(res, 400, `Cannot edit a ${invoice.status} invoice`);
    }

    const { client, items, shippingCharge, discount: invoiceDiscount, notes, terms, issueDate, dueDate, status } = req.body;

    const business    = invoice.business;
    const clientState = (client || invoice.client)?.state || '';

    if (items) {
      const computed = computeInvoiceTotals(items, clientState, business.state, shippingCharge, invoiceDiscount);
      invoice.items      = computed.items;
      invoice.subtotal   = computed.subtotal;
      invoice.totalCgst  = computed.totalCgst;
      invoice.totalSgst  = computed.totalSgst;
      invoice.totalIgst  = computed.totalIgst;
      invoice.totalGst   = computed.totalGst;
      invoice.grandTotal = computed.grandTotal;
      invoice.roundOff   = computed.roundOff;
    }

    if (client)         invoice.client         = { ...invoice.client, ...client };
    if (shippingCharge !== undefined) invoice.shippingCharge = shippingCharge;
    if (invoiceDiscount !== undefined) invoice.discount      = invoiceDiscount;
    if (notes !== undefined) invoice.notes = notes;
    if (terms !== undefined) invoice.terms = terms;
    if (issueDate)      invoice.issueDate      = issueDate;
    if (dueDate !== undefined) invoice.dueDate = dueDate;
    if (status  && !['cancelled', 'revoked'].includes(status)) invoice.status = status;
    invoice.updatedBy = req.user._id;

    await invoice.save();
    return successResponse(res, 200, 'Invoice updated', { invoice });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
};

/**
 * POST /api/invoices/:id/cancel
 */
exports.cancelInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return errorResponse(res, 404, 'Invoice not found');
    if (invoice.status === 'cancelled') return errorResponse(res, 400, 'Invoice already cancelled');
    if (invoice.status === 'revoked')  return errorResponse(res, 400, 'Invoice is revoked and cannot be cancelled');

    const settings = await SiteSettings.findOne().select('invoice').lean();
    // Check cancellation policy
    const allowCancel = settings?.invoice?.allowCancellation !== false;
    if (!allowCancel) return errorResponse(res, 403, 'Invoice cancellation is disabled');

    invoice.status       = 'cancelled';
    invoice.cancelledAt  = new Date();
    invoice.cancelReason = req.body.reason || '';
    invoice.updatedBy    = req.user._id;
    await invoice.save();

    return successResponse(res, 200, 'Invoice cancelled', { invoice });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
};

/**
 * POST /api/invoices/:id/revoke
 * Revoke a cancelled invoice (restore to draft).
 */
exports.revokeInvoice = async (req, res) => {
  try {
    const settings = await SiteSettings.findOne().select('invoice').lean();
    if (!settings?.invoice?.allowRevoke) return errorResponse(res, 403, 'Invoice revocation is not enabled');

    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return errorResponse(res, 404, 'Invoice not found');
    if (invoice.status !== 'cancelled') return errorResponse(res, 400, 'Only cancelled invoices can be revoked');

    invoice.status      = 'draft';
    invoice.revokedAt   = new Date();
    invoice.revokeReason = req.body.reason || '';
    invoice.cancelledAt = null;
    invoice.cancelReason = '';
    invoice.updatedBy   = req.user._id;
    await invoice.save();

    return successResponse(res, 200, 'Invoice revoked (restored to draft)', { invoice });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
};

/**
 * GET /api/invoices/:id/pdf
 * Stream PDF as download or inline
 */
exports.downloadInvoicePDF = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).populate('linkedOrder', 'orderNumber').lean();
    if (!invoice) return errorResponse(res, 404, 'Invoice not found');

    const pdfBuffer = await generatePDFBuffer(invoice);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoice.invoiceNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    return res.end(pdfBuffer);
  } catch (err) {
    return errorResponse(res, 500, 'PDF generation failed: ' + err.message);
  }
};

/**
 * POST /api/invoices/:id/send-email
 */
exports.sendEmail = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).lean();
    if (!invoice) return errorResponse(res, 404, 'Invoice not found');
    if (!invoice.client?.email) return errorResponse(res, 400, 'Client email is required to send invoice');

    let pdfBuffer = null;
    try { pdfBuffer = await generatePDFBuffer(invoice); } catch (_) {}

    await sendInvoiceEmail(invoice, pdfBuffer);
    await Invoice.findByIdAndUpdate(req.params.id, { emailSentAt: new Date(), status: invoice.status === 'draft' ? 'sent' : invoice.status });

    return successResponse(res, 200, 'Invoice emailed successfully');
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
};

/**
 * POST /api/invoices/:id/send-whatsapp
 */
exports.sendWhatsApp = async (req, res) => {
  try {
    const invoice  = await Invoice.findById(req.params.id).lean();
    if (!invoice) return errorResponse(res, 404, 'Invoice not found');

    const settings = await SiteSettings.findOne().select('invoice').lean();
    await sendInvoiceWhatsApp(invoice, settings);
    await Invoice.findByIdAndUpdate(req.params.id, { whatsappSentAt: new Date() });

    return successResponse(res, 200, 'Invoice sent via WhatsApp');
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
};

/**
 * GET /api/invoices/report/summary?fy=&from=&to=
 */
exports.getInvoiceReport = async (req, res) => {
  try {
    const { fy, from, to } = req.query;
    const match = {};
    if (fy) match.financialYear = fy;
    if (from || to) {
      match.issueDate = {};
      if (from) match.issueDate.$gte = new Date(from);
      if (to)   match.issueDate.$lte = new Date(to);
    }

    const [summary, byStatus, byMonth] = await Promise.all([
      Invoice.aggregate([
        { $match: match },
        { $group: { _id: null, count: { $sum: 1 }, totalAmount: { $sum: '$grandTotal' }, totalGst: { $sum: '$totalGst' }, totalCgst: { $sum: '$totalCgst' }, totalSgst: { $sum: '$totalSgst' }, totalIgst: { $sum: '$totalIgst' } } }
      ]),
      Invoice.aggregate([
        { $match: match },
        { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$grandTotal' } } }
      ]),
      Invoice.aggregate([
        { $match: match },
        { $group: { _id: { month: { $month: '$issueDate' }, year: { $year: '$issueDate' } }, count: { $sum: 1 }, amount: { $sum: '$grandTotal' }, gst: { $sum: '$totalGst' } } },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),
    ]);

    return successResponse(res, 200, 'Invoice report fetched', {
      summary: summary[0] || {},
      byStatus,
      byMonth,
    });
  } catch (err) {
    return errorResponse(res, 500, err.message);
  }
};

/**
 * Helper exported for order controller to auto-create invoice.
 */
exports.createInvoiceFromOrder = async (order, adminUser) => {
  try {
    const settings = await SiteSettings.findOne().select('invoice tax').lean();
    if (!settings?.invoice?.enabled) return null;

    const business = await getBusinessSnapshot();
    const user = await User.findById(order.user).lean();
    const clientState = order.shippingAddress?.state || '';

    const items = (order.items || []).map(item => ({
      description: item.productSnapshot?.name || 'Product',
      hsn:        '',
      qty:         item.quantity,
      unitPrice:   item.baseUnitPrice || item.unitPrice,
      discount:    0,
      gstRate:     item.gstRate || 0,
      product:     item.product,
    }));

    const computed = computeInvoiceTotals(items, clientState, business.state, order.shippingCharge, order.couponDiscount);

    const invoiceStatus = order.paymentStatus === 'paid' ? 'paid' : 'payment_pending';

    const invoice = new Invoice({
      type: 'order',
      status: invoiceStatus,
      linkedOrder: order._id,
      linkedUser:  order.user,
      client: {
        name:    order.shippingAddress?.fullName || user?.name || 'Customer',
        email:   user?.email || '',
        phone:   order.shippingAddress?.phone || user?.phone || '',
        address: [order.shippingAddress?.street, order.shippingAddress?.landmark].filter(Boolean).join(', '),
        city:    order.shippingAddress?.city || '',
        state:   clientState,
        pincode: order.shippingAddress?.pincode || '',
        country: order.shippingAddress?.country || 'India',
        gstin:   '',
      },
      business,
      items: computed.items,
      subtotal: computed.subtotal,
      totalCgst: computed.totalCgst,
      totalSgst: computed.totalSgst,
      totalIgst: computed.totalIgst,
      totalGst:  computed.totalGst,
      grandTotal: computed.grandTotal,
      roundOff:  computed.roundOff,
      shippingCharge: order.shippingCharge || 0,
      discount: order.couponDiscount || 0,
      issueDate: new Date(),
      dueDate:   null,
      terms:     settings?.invoice?.defaultTerms || '',
      createdBy: adminUser || order.user,
    });

    await invoice.save();

    // Auto-send email
    if (settings?.invoice?.emailOnCreate && user?.email) {
      try {
        let pdfBuffer = null;
        try { pdfBuffer = await generatePDFBuffer(invoice.toObject()); } catch (_) {}
        await sendInvoiceEmail(invoice.toObject(), pdfBuffer);
        invoice.emailSentAt = new Date();
        await invoice.save();
      } catch (emailErr) {
        console.error('[Auto Invoice Email Error]', emailErr.message);
      }
    }

    return invoice;
  } catch (err) {
    console.error('[Auto Invoice Creation Error]', err.message);
    return null;
  }
};

exports.generateInvoiceHTML = generateInvoiceHTML;
