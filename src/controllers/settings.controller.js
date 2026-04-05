const SiteSettings = require('../models/SiteSettings.model');
const { successResponse, errorResponse } = require('../utils/response.utils');
const { upload } = require('../utils/upload.utils');

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
    return successResponse(res, 200, 'Full site settings', { settings });
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
      Object.keys(shipping).forEach((key) => {
        if (settings.shipping[key] !== undefined) {
          settings.shipping[key] =
            typeof settings.shipping[key] === 'boolean'
              ? shipping[key] === true || shipping[key] === 'true'
              : parseFloat(shipping[key]) || settings.shipping[key];
        }
      });
    }

    settings.updatedBy = req.user._id;
    settings.markModified('shipping');
    await settings.save();

    return successResponse(res, 200, 'Shipping rules updated', { shipping: settings.shipping });
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

    return successResponse(res, 200, 'Homepage config updated', { homepage: settings.homepage });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── ADMIN: Update SEO ─────────────────────────────────
exports.updateSEO = async (req, res) => {
  try {
    const settings = await getOrInit();
    const { seo } = req.body;

    if (seo) {
      if (seo.metaTitle) settings.seo.metaTitle = seo.metaTitle;
      if (seo.metaDescription) settings.seo.metaDescription = seo.metaDescription;
      if (seo.metaKeywords) settings.seo.metaKeywords = seo.metaKeywords;
    }

    settings.updatedBy = req.user._id;
    settings.markModified('seo');
    await settings.save();

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
      if (tax.gstPercentage !== undefined) settings.tax.gstPercentage = parseFloat(tax.gstPercentage);
      if (tax.gstNumber !== undefined) settings.tax.gstNumber = tax.gstNumber || null;
      if (tax.includedInPrice !== undefined)
        settings.tax.includedInPrice = tax.includedInPrice === true || tax.includedInPrice === 'true';
    }

    settings.updatedBy = req.user._id;
    settings.markModified('tax');
    await settings.save();

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
          settings.orderSettings[key] = parseFloat(orderSettings[key]) || settings.orderSettings[key];
        }
      });
    }

    settings.updatedBy = req.user._id;
    settings.markModified('orderSettings');
    await settings.save();

    return successResponse(res, 200, 'Order settings updated', { orderSettings: settings.orderSettings });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};
