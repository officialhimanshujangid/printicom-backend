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

    // ── Third-Party Shipping API ───────────────────────────
    shiprocket: {
      enabled: { type: Boolean, default: false },
      email: { type: String, default: null },
      password: { type: String, default: null },
      token: { type: String, default: null },           // Cached API token
      tokenExpiresAt: { type: Date, default: null },    // Token expiry (cache invalidation)
    },

    // ── Tax ────────────────────────────────────────────────
    tax: {
      enabled: { type: Boolean, default: false },
      gstPercentage: { type: Number, default: 18 },
      gstNumber: { type: String, default: null },
      includedInPrice: { type: Boolean, default: true }, // if false, added at checkout
    },

    // ── Theme Colors ───────────────────────────────────────
    // All CSS variables controllable from Admin → Settings → Homepage/Theme
    theme: {
      primary:        { type: String, default: '#FF6B35' },
      primaryLight:   { type: String, default: '#FF8C5A' },
      primaryDark:    { type: String, default: '#E05520' },
      accent:         { type: String, default: '#FFB347' },
      accentLight:    { type: String, default: '#FFC875' },
      bgBase:         { type: String, default: '#09090F' },
      bgSurface:      { type: String, default: '#111118' },
      bgElevated:     { type: String, default: '#18181F' },
      textPrimary:    { type: String, default: '#F2F2F7' },
      textSecondary:  { type: String, default: 'rgba(242,242,247,0.7)' },
      textMuted:      { type: String, default: 'rgba(242,242,247,0.4)' },
      borderColor:    { type: String, default: 'rgba(255,255,255,0.08)' },
      borderFocus:    { type: String, default: 'rgba(255,107,53,0.5)' },
    },
    // When theme was last changed — used by client to detect staleness
    themeUpdatedAt: { type: Date, default: null },

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

    // ── SEO ────────────────────────────────────────────────────────
    seo: {
      metaTitle:       { type: String, default: 'Printicom – Custom Photo Printing & Personalized Gifts' },
      metaDescription: { type: String, default: 'Print your memories on mugs, calendars, photo prints & more. Best custom gifting store in India.' },
      metaKeywords:    { type: String, default: 'custom mugs, photo prints, personalized gifts, photo calendar, canvas print' },
      ogTitle:         { type: String, default: '' },
      ogDescription:   { type: String, default: '' },
      ogImage:         { type: String, default: '' },        // URL to OG image
      twitterCard:     { type: String, default: 'summary_large_image', enum: ['summary', 'summary_large_image', 'app', 'player'] },
      robots:          { type: String, default: 'index, follow' }, // e.g. 'noindex, nofollow'
      canonicalUrl:    { type: String, default: '' },
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

    // ── Reports Visibility ──────────────────────────────────
    reports: {
      ordersReport:   { type: Boolean, default: true },
      gstReport:      { type: Boolean, default: true },
      productsReport: { type: Boolean, default: true },
      customersReport:{ type: Boolean, default: true },
      stockReport:    { type: Boolean, default: true },
      couponsReport:  { type: Boolean, default: true },
      invoicesReport: { type: Boolean, default: true },
    },

    // ── Invoice Module ─────────────────────────────────────
    invoice: {
      enabled:              { type: Boolean, default: false },
      invoicePrefix:        { type: String,  default: 'INV' },
      businessState:        { type: String,  default: '' },  // e.g. 'Rajasthan' — for GST logic
      defaultDueDays:       { type: Number,  default: 15 },
      defaultTerms:         { type: String,  default: 'Payment is due within 15 days of invoice date.' },
      cancellationPolicy:   { type: String,  default: '' },
      allowCancellation:    { type: Boolean, default: true },
      allowRevoke:          { type: Boolean, default: true },
      emailOnCreate:        { type: Boolean, default: false },
      sendWhatsApp:         { type: Boolean, default: false },
      whatsAppApiKey:       { type: String,  default: '' },  // Meta Cloud API Bearer Token
      whatsAppPhoneNumberId:{ type: String,  default: '' },  // Meta Phone Number ID
      // Auto-deduct stock when invoice linked to product item
      autoDeductStock:      { type: Boolean, default: false },
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SiteSettings', siteSettingsSchema);
