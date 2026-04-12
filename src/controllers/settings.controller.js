const SiteSettings = require('../models/SiteSettings.model');
const { successResponse, errorResponse } = require('../utils/response.utils');
const { upload } = require('../utils/upload.utils');
const { logActivity } = require('./auditLog.controller');

// ─── Get or Initialise Settings ────────────────────────
const getOrInit = async () => {
  let settings = await SiteSettings.findOne();
  if (!settings) {
    settings = await SiteSettings.create({});
  }
  return settings;
};

// ─── PUBLIC: Get Storefront Settings ──────────────────
// Returns only the data the frontend needs (no secrets)
exports.getPublicSettings = async (req, res) => {
  try {
    const settings = await getOrInit();

    const publicData = {
      siteName: settings.siteName,
      tagline: settings.tagline,
      logoUrl: settings.logoUrl,
      faviconUrl: settings.faviconUrl,
      supportEmail: settings.supportEmail,
      supportPhone: settings.supportPhone,
      socialLinks: settings.socialLinks,
      seo: settings.seo,
      homepage: settings.homepage,
      theme: settings.theme,
      themeUpdatedAt: settings.themeUpdatedAt,
      updatedAt: settings.updatedAt,
      shipping: {
        freeShippingThreshold: settings.shipping.freeShippingThreshold,
        standardShippingCharge: settings.shipping.standardShippingCharge,
        expressShippingEnabled: settings.shipping.expressShippingEnabled,
        expressShippingCharge: settings.shipping.expressShippingCharge,
        codExtraCharge: settings.shipping.codExtraCharge,
        codMaxOrderAmount: settings.shipping.codMaxOrderAmount,
      },
      paymentMethods: {
        cod: settings.paymentMethods.cod,
        razorpay: settings.paymentMethods.razorpay,
        stripe: settings.paymentMethods.stripe,
        wallet: settings.paymentMethods.wallet,
      },
      tax: settings.tax,
      orderSettings: {
        minOrderAmount: settings.orderSettings.minOrderAmount,
        allowCancellationAfterHours: settings.orderSettings.allowCancellationAfterHours,
      },
      maintenanceMode: settings.maintenanceMode,
    };

    return successResponse(res, 200, 'Site settings', { settings: publicData });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── ADMIN: Get Full Settings ──────────────────────────
exports.getFullSettings = async (req, res) => {
  try {
    const settings = await getOrInit();
    const s = settings.toObject();
    // Mask sensitive passwords from API responses even for admins
    if (s.shiprocket && s.shiprocket.password) {
      s.shiprocket.password = '••••••••';
    }
    return successResponse(res, 200, 'Full site settings', { settings: s });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── ADMIN: Update General Info ────────────────────────
exports.updateGeneral = async (req, res) => {
  try {
    const settings = await getOrInit();
    const { siteName, tagline, supportEmail, supportPhone, address } = req.body;

    if (siteName) settings.siteName = siteName;
    if (tagline) settings.tagline = tagline;
    if (supportEmail) settings.supportEmail = supportEmail;
    if (supportPhone) settings.supportPhone = supportPhone;
    if (address) settings.address = address;

    // Logo upload
    if (req.files && req.files.logo && req.files.logo[0]) {
      settings.logoUrl = req.files.logo[0].path.replace(/\\/g, '/');
    }
    if (req.files && req.files.favicon && req.files.favicon[0]) {
      settings.faviconUrl = req.files.favicon[0].path.replace(/\\/g, '/');
    }

    settings.updatedBy = req.user._id;
    await settings.save();

    await logActivity(req.user._id, 'Settings Updated', 'Settings', settings._id, 'Updated General site settings (name, tagline, contact)', req.ip);

    return successResponse(res, 200, 'General settings updated', { settings });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── ADMIN: Update Payment Methods ────────────────────
exports.updatePaymentMethods = async (req, res) => {
  try {
    const settings = await getOrInit();
    const { paymentMethods } = req.body;

    if (paymentMethods) {
      if (paymentMethods.cod !== undefined) {
        settings.paymentMethods.cod.enabled =
          paymentMethods.cod.enabled === true || paymentMethods.cod.enabled === 'true';
        if (paymentMethods.cod.label) settings.paymentMethods.cod.label = paymentMethods.cod.label;
        
        // Map COD specific charges to shipping sub-object
        if (paymentMethods.cod.extraCharge !== undefined) {
          settings.shipping.codExtraCharge = parseFloat(paymentMethods.cod.extraCharge) || 0;
        }
        if (paymentMethods.cod.maxOrderAmount !== undefined) {
          settings.shipping.codMaxOrderAmount = parseFloat(paymentMethods.cod.maxOrderAmount) || 0;
        }
      }
      if (paymentMethods.razorpay !== undefined) {
        settings.paymentMethods.razorpay.enabled =
          paymentMethods.razorpay.enabled === true || paymentMethods.razorpay.enabled === 'true';
      }
      if (paymentMethods.stripe !== undefined) {
        settings.paymentMethods.stripe.enabled =
          paymentMethods.stripe.enabled === true || paymentMethods.stripe.enabled === 'true';
      }
      if (paymentMethods.wallet !== undefined) {
        settings.paymentMethods.wallet.enabled =
          paymentMethods.wallet.enabled === true || paymentMethods.wallet.enabled === 'true';
      }
    }

    settings.updatedBy = req.user._id;
    settings.markModified('paymentMethods');
    await settings.save();

    await logActivity(req.user._id, 'Settings Updated', 'Settings', settings._id, 'Updated Payment Methods configuration', req.ip);

    return successResponse(res, 200, 'Payment methods updated', {
      paymentMethods: settings.paymentMethods,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── ADMIN: Update Shipping Rules ──────────────────────
exports.updateShipping = async (req, res) => {
  try {
    const settings = await getOrInit();
    const { shipping } = req.body;

    if (shipping) {
      if (shipping.freeShippingThreshold !== undefined) settings.set('shipping.freeShippingThreshold', parseFloat(shipping.freeShippingThreshold) || 0);
      if (shipping.standardShippingCharge !== undefined) settings.set('shipping.standardShippingCharge', parseFloat(shipping.standardShippingCharge) || 0);
      if (shipping.expressShippingCharge !== undefined) settings.set('shipping.expressShippingCharge', parseFloat(shipping.expressShippingCharge) || 0);
      if (shipping.expressShippingEnabled !== undefined) settings.set('shipping.expressShippingEnabled', shipping.expressShippingEnabled === true || shipping.expressShippingEnabled === 'true');
      if (shipping.codExtraCharge !== undefined) settings.set('shipping.codExtraCharge', parseFloat(shipping.codExtraCharge) || 0);
      if (shipping.codMaxOrderAmount !== undefined) settings.set('shipping.codMaxOrderAmount', parseFloat(shipping.codMaxOrderAmount) || 0);
    }
    
    const { shiprocket } = req.body;
    if (shiprocket) {
      // Create a fresh clone of the subdocument to break Proxy cache memory loops
      const sr = settings.shiprocket ? { ...settings.shiprocket } : {};
      
      if (shiprocket.enabled !== undefined) sr.enabled = shiprocket.enabled === true || shiprocket.enabled === 'true';
      if (shiprocket.email !== undefined) sr.email = shiprocket.email;
      if (shiprocket.password && shiprocket.password !== '••••••••') {
        sr.password = shiprocket.password;
      }
      
      // Reassign to document object natively
      settings.shiprocket = sr;
    }

    settings.updatedBy = req.user._id;
    settings.markModified('shipping');
    settings.markModified('shiprocket');
    await settings.save();

    await logActivity(req.user._id, 'Settings Updated', 'Settings', settings._id, 'Updated Global Shipping rules', req.ip);

    const refreshed = await getOrInit();
    return successResponse(res, 200, 'Shipping rules updated', { shipping: refreshed.shipping, shiprocket: { enabled: refreshed.shiprocket?.enabled, email: refreshed.shiprocket?.email } });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── ADMIN: Update Homepage Config ─────────────────────
exports.updateHomepage = async (req, res) => {
  try {
    const settings = await getOrInit();
    const { homepage } = req.body;

    if (homepage) {
      Object.keys(homepage).forEach((key) => {
        if (settings.homepage[key] !== undefined || key in settings.homepage) {
          settings.homepage[key] = homepage[key];
        }
      });
    }

    settings.updatedBy = req.user._id;
    settings.markModified('homepage');
    await settings.save();

    await logActivity(req.user._id, 'Settings Updated', 'Settings', settings._id, 'Updated Homepage configuration', req.ip);

    return successResponse(res, 200, 'Homepage settings updated', { homepage: settings.homepage });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── ADMIN: Update SEO ──────────────────────────────────────────────────────
exports.updateSEO = async (req, res) => {
  try {
    const settings = await getOrInit();
    const { seo } = req.body;

    if (seo) {
      const fields = ['metaTitle','metaDescription','metaKeywords','ogTitle','ogDescription','ogImage','twitterCard','robots','canonicalUrl'];
      fields.forEach(f => { if (seo[f] !== undefined) settings.seo[f] = seo[f]; });
    }

    settings.updatedBy = req.user._id;
    settings.markModified('seo');
    await settings.save();

    await logActivity(req.user._id, 'Settings Updated', 'Settings', settings._id, 'Updated SEO Meta settings', req.ip);

    return successResponse(res, 200, 'SEO settings updated', { seo: settings.seo });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── ADMIN: Update Social Links ────────────────────────
exports.updateSocialLinks = async (req, res) => {
  try {
    const settings = await getOrInit();
    const { socialLinks } = req.body;

    if (socialLinks) {
      Object.keys(socialLinks).forEach((key) => {
        settings.socialLinks[key] = socialLinks[key] || null;
      });
    }

    settings.updatedBy = req.user._id;
    settings.markModified('socialLinks');
    await settings.save();

    await logActivity(req.user._id, 'Settings Updated', 'Settings', settings._id, 'Updated Social Media links', req.ip);

    return successResponse(res, 200, 'Social links updated', { socialLinks: settings.socialLinks });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── ADMIN: Toggle Maintenance Mode ───────────────────
exports.toggleMaintenance = async (req, res) => {
  try {
    const settings = await getOrInit();
    const { enabled, message } = req.body;

    settings.maintenanceMode.enabled =
      enabled !== undefined
        ? enabled === true || enabled === 'true'
        : !settings.maintenanceMode.enabled;

    if (message) settings.maintenanceMode.message = message;
    settings.updatedBy = req.user._id;
    settings.markModified('maintenanceMode');
    await settings.save();

    await logActivity(req.user._id, 'Settings Updated', 'Settings', settings._id, `Maintenance Mode ${settings.maintenanceMode.enabled ? 'Enabled' : 'Disabled'}`, req.ip);

    return successResponse(
      res,
      200,
      `Maintenance mode ${settings.maintenanceMode.enabled ? 'ENABLED' : 'DISABLED'}`,
      { maintenanceMode: settings.maintenanceMode }
    );
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── ADMIN: Update Tax Settings ────────────────────────
exports.updateTax = async (req, res) => {
  try {
    const settings = await getOrInit();
    const { tax } = req.body;

    if (tax) {
      if (tax.enabled !== undefined)
        settings.tax.enabled = tax.enabled === true || tax.enabled === 'true';
      if (tax.gstPercentage !== undefined) {
        const val = parseFloat(tax.gstPercentage);
        settings.tax.gstPercentage = !isNaN(val) ? val : settings.tax.gstPercentage;
      }
      if (tax.gstNumber !== undefined) settings.tax.gstNumber = tax.gstNumber || null;
      if (tax.includedInPrice !== undefined)
        settings.tax.includedInPrice = tax.includedInPrice === true || tax.includedInPrice === 'true';
    }

    settings.updatedBy = req.user._id;
    settings.markModified('tax');
    await settings.save();

    await logActivity(req.user._id, 'Settings Updated', 'Settings', settings._id, 'Updated Tax & GST configuration', req.ip);

    return successResponse(res, 200, 'Tax settings updated', { tax: settings.tax });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── ADMIN: Update Order Settings ──────────────────────
exports.updateOrderSettings = async (req, res) => {
  try {
    const settings = await getOrInit();
    const { orderSettings } = req.body;

    if (orderSettings) {
      Object.keys(orderSettings).forEach((key) => {
        if (typeof settings.orderSettings[key] === 'boolean') {
          settings.orderSettings[key] =
            orderSettings[key] === true || orderSettings[key] === 'true';
        } else {
          const val = parseFloat(orderSettings[key]);
          settings.orderSettings[key] = !isNaN(val) ? val : settings.orderSettings[key];
        }
      });
    }

    settings.updatedBy = req.user._id;
    settings.markModified('orderSettings');
    await settings.save();

    await logActivity(req.user._id, 'Settings Updated', 'Settings', settings._id, 'Updated Global Order flow settings', req.ip);

    return successResponse(res, 200, 'Order settings updated', {
      orderSettings: settings.orderSettings,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── ADMIN: Update Theme Colors ────────────────────────────
exports.updateTheme = async (req, res) => {
  try {
    const settings = await getOrInit();
    const { theme } = req.body;

    if (theme) {
      const allowed = [
        'primary', 'primaryLight', 'primaryDark',
        'accent', 'accentLight',
        'bgBase', 'bgSurface', 'bgElevated',
        'textPrimary', 'textSecondary', 'textMuted',
        'borderColor', 'borderFocus',
      ];

      // Initialize theme sub-doc if it doesn't exist on old DB documents
      if (!settings.theme) {
        settings.theme = {
          primary: '#FF6B35', primaryLight: '#FF8C5A', primaryDark: '#E05520',
          accent: '#FFB347', accentLight: '#FFC875',
          bgBase: '#09090F', bgSurface: '#111118', bgElevated: '#18181F',
          textPrimary: '#F2F2F7', textSecondary: 'rgba(242,242,247,0.7)',
          textMuted: 'rgba(242,242,247,0.4)', borderColor: 'rgba(255,255,255,0.08)',
          borderFocus: 'rgba(255,107,53,0.5)',
        };
      }

      allowed.forEach((key) => {
        if (theme[key] !== undefined) settings.theme[key] = theme[key];
      });
    }

    // Bump themeUpdatedAt so all clients know to reload theme
    settings.themeUpdatedAt = new Date();
    settings.updatedBy = req.user._id;
    settings.themeUpdatedAt = new Date(); // important for client cache busting
    settings.markModified('theme');
    await settings.save();

    await logActivity(req.user._id, 'Theme Updated', 'Settings', settings._id, 'Updated Client Site Branding Colors', req.ip);

    return successResponse(res, 200, 'Theme updated successfully', {
      theme: settings.theme,
      themeUpdatedAt: settings.themeUpdatedAt,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};
// ─── ADMIN: Update Invoice Module Settings ─────────────────────────────────
exports.updateInvoiceSettings = async (req, res) => {
  try {
    const settings = await getOrInit();
    const { invoice } = req.body;
    if (!invoice) return errorResponse(res, 400, 'invoice payload required');

    const boolFields = ['enabled','allowCancellation','allowRevoke','emailOnCreate','sendWhatsApp','autoDeductStock'];
    const strFields  = ['invoicePrefix','businessState','defaultTerms','cancellationPolicy','whatsAppApiKey','whatsAppPhoneNumberId'];
    const numFields  = ['defaultDueDays'];

    // Initialize if missing
    if (!settings.invoice) settings.invoice = {};
    const inv = settings.invoice;

    boolFields.forEach(f => { if (invoice[f] !== undefined) inv[f] = invoice[f] === true || invoice[f] === 'true'; });
    strFields.forEach(f  => { if (invoice[f] !== undefined) inv[f] = invoice[f]; });
    numFields.forEach(f  => { if (invoice[f] !== undefined) inv[f] = parseInt(invoice[f]) || 0; });

    settings.invoice = inv;
    settings.updatedBy = req.user._id;
    settings.markModified('invoice');
    await settings.save();

    await logActivity(req.user._id, 'Settings Updated', 'Settings', settings._id, 'Updated Invoice Module settings', req.ip);

    // Mask API key in response
    const respInv = { ...settings.invoice.toObject?.() || settings.invoice };
    if (respInv.whatsAppApiKey) respInv.whatsAppApiKey = '••••••••';
    return successResponse(res, 200, 'Invoice settings updated', { invoice: respInv });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── ADMIN: Update Reports Visibility ──────────────────────────────────────
exports.updateReportsVisibility = async (req, res) => {
  try {
    const settings = await getOrInit();
    const { reports } = req.body;
    if (reports) {
      const keys = ['ordersReport','gstReport','productsReport','customersReport','stockReport','couponsReport','invoicesReport'];
      keys.forEach(k => { if (reports[k] !== undefined) settings.reports[k] = reports[k] === true || reports[k] === 'true'; });
    }
    settings.updatedBy = req.user._id;
    settings.markModified('reports');
    await settings.save();
    return successResponse(res, 200, 'Reports visibility updated', { reports: settings.reports });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};
