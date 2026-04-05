/**
 * Email templates for Printicom
 */

const baseLayout = (content) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Printicom</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f4f4; color: #333; }
    .wrapper { max-width: 600px; margin: 30px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #FF6B35 0%, #F7C59F 100%); padding: 32px; text-align: center; }
    .header h1 { color: #fff; font-size: 28px; font-weight: 800; letter-spacing: 2px; }
    .header p { color: rgba(255,255,255,0.85); font-size: 13px; margin-top: 4px; }
    .body { padding: 36px; }
    .body h2 { font-size: 22px; color: #1a1a2e; margin-bottom: 12px; }
    .body p { font-size: 15px; line-height: 1.7; color: #555; margin-bottom: 16px; }
    .btn { display: inline-block; padding: 14px 32px; background: #FF6B35; color: #fff !important; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 15px; margin: 16px 0; }
    .otp-box { background: #fff4ee; border: 2px dashed #FF6B35; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0; }
    .otp-code { font-size: 36px; font-weight: 900; color: #FF6B35; letter-spacing: 8px; }
    .footer { background: #1a1a2e; color: #aaa; padding: 20px; text-align: center; font-size: 12px; }
    .footer a { color: #FF6B35; text-decoration: none; }
    .divider { border: none; border-top: 1px solid #eee; margin: 24px 0; }
    .highlight { color: #FF6B35; font-weight: 700; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>🖨️ PRINTICOM</h1>
      <p>Your Custom Printing Partner</p>
    </div>
    <div class="body">
      ${content}
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Printicom. All rights reserved.</p>
      <p>Customized Mugs • Calendars • Photo Prints & More</p>
      <p style="margin-top:8px;"><a href="#">Privacy Policy</a> · <a href="#">Contact Us</a></p>
    </div>
  </div>
</body>
</html>
`;

/**
 * Email Verification Template
 */
const emailVerificationTemplate = (name, verificationUrl) =>
  baseLayout(`
    <h2>👋 Welcome to Printicom, ${name}!</h2>
    <p>Thank you for registering. To get started, please verify your email address by clicking the button below.</p>
    <div style="text-align:center;">
      <a href="${verificationUrl}" class="btn">✅ Verify My Email</a>
    </div>
    <p>Or copy and paste this link in your browser:</p>
    <p style="word-break:break-all; background:#f9f9f9; padding:10px; border-radius:6px; font-size:13px;">${verificationUrl}</p>
    <hr class="divider"/>
    <p style="font-size:13px; color:#999;">This link will expire in <strong>24 hours</strong>. If you did not create an account, you can safely ignore this email.</p>
  `);

/**
 * Password Reset Template
 */
const passwordResetTemplate = (name, resetUrl) =>
  baseLayout(`
    <h2>🔐 Password Reset Request</h2>
    <p>Hi <span class="highlight">${name}</span>, we received a request to reset your Printicom account password.</p>
    <div style="text-align:center;">
      <a href="${resetUrl}" class="btn">🔑 Reset My Password</a>
    </div>
    <p>Or copy and paste this link in your browser:</p>
    <p style="word-break:break-all; background:#f9f9f9; padding:10px; border-radius:6px; font-size:13px;">${resetUrl}</p>
    <hr class="divider"/>
    <p style="font-size:13px; color:#999;">This link expires in <strong>30 minutes</strong>. If you didn't request this, please ignore this email or contact support if concerned.</p>
  `);

/**
 * Welcome email after verification
 */
const welcomeTemplate = (name) =>
  baseLayout(`
    <h2>🎉 Email Verified Successfully!</h2>
    <p>Hi <span class="highlight">${name}</span>, your email has been verified and your Printicom account is now fully active.</p>
    <p>You can now explore our full range of custom printing products:</p>
    <ul style="padding-left:20px; line-height:2; color:#555;">
      <li>🫖 Customized Mugs</li>
      <li>📅 Photo Calendars</li>
      <li>🖼️ Canvas & Photo Prints</li>
      <li>🛏️ Printed Pillows & Cushions</li>
      <li>🔑 Photo Keychains & Frames</li>
    </ul>
    <div style="text-align:center; margin-top:24px;">
      <a href="${process.env.CLIENT_URL}" class="btn">🛒 Start Shopping</a>
    </div>
  `);

/**
 * Order Confirmation Template
 */
const orderConfirmationTemplate = (name, order) =>
  baseLayout(`
    <h2>📦 Order Confirmed!</h2>
    <p>Hi <span class="highlight">${name}</span>, thank you for your order! We've received it and are now getting it ready for printing.</p>
    <div style="background:#f9f9f1; border-radius:12px; padding:24px; margin-bottom:24px;">
      <h3 style="margin-bottom:12px; color:#1a1a2e;">Order Summary</h3>
      <p style="margin-bottom:6px;"><strong>Order ID:</strong> #${order.orderNumber}</p>
      <p style="margin-bottom:6px;"><strong>Amount:</strong> ₹${order.totalAmount}</p>
      <p style="margin-bottom:6px;"><strong>Payment:</strong> ${order.paymentMethod.toUpperCase()} (${order.paymentStatus})</p>
      <p><strong>Estimated Delivery:</strong> ${new Date(order.estimatedDeliveryDate).toDateString()}</p>
    </div>
    <div style="text-align:center;">
      <a href="${process.env.CLIENT_URL}/my-account/orders/${order._id}" class="btn">🚚 Track My Order</a>
    </div>
  `);

/**
 * Order Shipped Template
 */
const orderShippedTemplate = (name, order) =>
  baseLayout(`
    <h2>🚀 Your order is on its way!</h2>
    <p>Great news <span class="highlight">${name}</span>! Your customized items have been shipped and are coming to you soon.</p>
    <div style="background:#eefbff; border-radius:12px; padding:24px; margin-bottom:24px;">
      <h3 style="margin-bottom:12px; color:#1a1a2e;">Shipping Details</h3>
      <p style="margin-bottom:6px;"><strong>Courier:</strong> ${order.courierName || 'Standard Partner'}</p>
      <p style="margin-bottom:6px;"><strong>Tracking ID:</strong> ${order.trackingNumber || 'N/A'}</p>
      ${order.trackingUrl ? `<p><a href="${order.trackingUrl}" style="color:#FF6B35; font-weight:700;">Click here to track online</a></p>` : ''}
    </div>
    <p>Expected arrival: Within 2–3 business days.</p>
  `);

/**
 * Order Delivered Template
 */
const orderDeliveredTemplate = (name, order) =>
  baseLayout(`
    <h2>🎁 Order Delivered!</h2>
    <p>Hi <span class="highlight">${name}</span>, your order <strong>#${order.orderNumber}</strong> has been successfully delivered. We hope you love your custom prints!</p>
    <div style="text-align:center; margin-top:24px;">
      <a href="${process.env.CLIENT_URL}/products" class="btn">🛒 Continue Shopping</a>
    </div>
    <p style="text-align:center; margin-top:16px;">Don't forget to <a href="${process.env.CLIENT_URL}/my-account/orders/${order._id}" style="color:#FF6B35;">leave a review</a> and share your photos with us!</p>
  `);

/**
 * Order Cancelled Template
 */
const orderCancelledTemplate = (name, order, reason) =>
  baseLayout(`
    <h2>❌ Order Cancelled</h2>
    <p>Hi <span class="highlight">${name}</span>, your order <strong>#${order.orderNumber}</strong> has been cancelled.</p>
    <p><strong>Reason:</strong> ${reason || 'Cancelled by seller'}</p>
    ${order.paymentStatus === 'paid' ? '<p style="color:#d97706; font-weight:600;">Your refund of ₹' + order.totalAmount + ' has been initiated and will reflect in your account in 5–7 business days.</p>' : ''}
    <p>If you have any questions, please reply to this email.</p>
  `);

module.exports = {
  emailVerificationTemplate,
  passwordResetTemplate,
  welcomeTemplate,
  orderConfirmationTemplate,
  orderShippedTemplate,
  orderDeliveredTemplate,
  orderCancelledTemplate,
};
