const mongoose = require('mongoose');

/**
 * Singleton Site Settings Model
 * Only ONE document ever exists. Admin edits these to control global behavior.
 */
const siteSettingsSchema = new mongoose.Schema(
  {
    // ── General ────────────────────────────────────────────
    siteName: { type: String, default: 'Printicom' },
    tagline: { type: String, default: 'Print Your Memories' },
    logoUrl: { type: String, default: null },
    faviconUrl: { type: String, default: null },
    supportEmail: { type: String, default: 'support@printicom.in' },
    supportPhone: { type: String, default: '+91-9876543210' },
    address: { type: String, default: 'Jaipur, Rajasthan, India' },

    // ── Payment Methods ────────────────────────────────────
    paymentMethods: {
      cod: { enabled: { type: Boolean, default: true }, label: { type: String, default: 'Cash on Delivery' } },
      razorpay: { enabled: { type: Boolean, default: true }, label: { type: String, default: 'Pay Online (UPI / Cards / NetBanking)' } },
      stripe: { enabled: { type: Boolean, default: false }, label: { type: String, default: 'Credit / Debit Card (International)' } },
      wallet: { enabled: { type: Boolean, default: false }, label: { type: String, default: 'Printicom Wallet' } },
    },

    // ── Shipping ───────────────────────────────────────────
    shipping: {
      freeShippingThreshold: { type: Number, default: 499 }, // ₹499 and above = free
      standardShippingCharge: { type: Number, default: 49 },
      expressShippingCharge: { type: Number, default: 99 },
      expressShippingEnabled: { type: Boolean, default: false },
      codExtraCharge: { type: Number, default: 0 }, // extra for COD
      codMaxOrderAmount: { type: Number, default: 5000 }, // COD allowed up to ₹5000
    },

    // ── Tax ────────────────────────────────────────────────
    tax: {
      enabled: { type: Boolean, default: false },
      gstPercentage: { type: Number, default: 18 },
      gstNumber: { type: String, default: null },
      includedInPrice: { type: Boolean, default: true }, // if false, added at checkout
    },

    // ── Homepage Config ────────────────────────────────────
    homepage: {
      showOfferStrip: { type: Boolean, default: true },
      offerStripText: { type: String, default: '🎉 Free Shipping on orders above ₹499! Use code WELCOME10 for 10% off.' },
      offerStripBgColor: { type: String, default: '#FF6B35' },
      offerStripTextColor: { type: String, default: '#FFFFFF' },
      heroSliderAutoplay: { type: Boolean, default: true },
      heroSliderInterval: { type: Number, default: 4000 }, // ms
      features: [
        {
          icon: { type: String, default: '🚚' },
          title: { type: String, default: 'Fast Delivery' },
          desc: { type: String, default: '2-5 days across India' },
        },
        {
          icon: { type: String, default: '🎨' },
          title: { type: String, default: 'Custom Design' },
          desc: { type: String, default: 'Upload your photos & text' },
        },
        {
          icon: { type: String, default: '💎' },
          title: { type: String, default: 'Premium Quality' },
          desc: { type: String, default: 'HD print, long-lasting ink' },
        },
        {
          icon: { type: String, default: '🔒' },
          title: { type: String, default: 'Secure Payments' },
          desc: { type: String, default: 'Razorpay, UPI, COD' },
        },
      ],
      featuredProductsLimit: { type: Number, default: 8 },
      showPopupBanner: { type: Boolean, default: false },
      popupDelaySeconds: { type: Number, default: 5 },
    },

    // ── Social Links ───────────────────────────────────────
    socialLinks: {
      instagram: { type: String, default: null },
      facebook: { type: String, default: null },
      twitter: { type: String, default: null },
      youtube: { type: String, default: null },
      whatsapp: { type: String, default: null },
      pinterest: { type: String, default: null },
    },

    // ── SEO ────────────────────────────────────────────────
    seo: {
      metaTitle: { type: String, default: 'Printicom – Custom Photo Printing & Personalized Gifts' },
      metaDescription: { type: String, default: 'Print your memories on mugs, calendars, photo prints & more. Best custom gifting store in India.' },
      metaKeywords: { type: String, default: 'custom mugs, photo prints, personalized gifts, photo calendar, canvas print' },
    },

    // ── Order Settings ─────────────────────────────────────
    orderSettings: {
      minOrderAmount: { type: Number, default: 99 },
      allowCancellationAfterHours: { type: Number, default: 24 }, // can cancel within 24h of placing
      autoConfirmCODOrders: { type: Boolean, default: true },
      notifyAdminOnOrder: { type: Boolean, default: true },
      notifyCustomerOnStatusChange: { type: Boolean, default: true },
    },

    // ── Maintenance ────────────────────────────────────────
    maintenanceMode: {
      enabled: { type: Boolean, default: false },
      message: { type: String, default: 'We are currently upgrading our systems. Back soon!' },
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SiteSettings', siteSettingsSchema);
