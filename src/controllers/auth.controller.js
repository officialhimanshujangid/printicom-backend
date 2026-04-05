const crypto = require('crypto');
const User = require('../models/User.model');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt.utils');
const { successResponse, errorResponse } = require('../utils/response.utils');
const sendEmail = require('../config/email');
const { emailVerificationTemplate, passwordResetTemplate, welcomeTemplate } = require('../utils/emailTemplates');

// ─── Register (Client only) ────────────────────────────────
exports.register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return errorResponse(res, 409, 'An account with this email already exists.');
    }

    // Create user
    const user = await User.create({ name, email, password, phone, role: 'client' });

    // Generate email verification token
    const verificationToken = user.generateEmailVerificationToken();
    await user.save({ validateBeforeSave: false });

    // Send verification email
    const verificationUrl = `${process.env.CLIENT_URL}/verify-email/${verificationToken}`;
    await sendEmail({
      to: user.email,
      subject: '✅ Verify Your Printicom Account',
      html: emailVerificationTemplate(user.name, verificationUrl),
    });

    return successResponse(res, 201, 'Registration successful! Please check your email to verify your account.', {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Verify Email ──────────────────────────────────────────
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() },
    });

    if (!user) {
      return errorResponse(res, 400, 'Invalid or expired verification link. Please request a new one.');
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save({ validateBeforeSave: false });

    // Send welcome email
    await sendEmail({
      to: user.email,
      subject: '🎉 Welcome to Printicom!',
      html: welcomeTemplate(user.name),
    });

    return successResponse(res, 200, 'Email verified successfully! You can now login.');
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Resend Verification Email ─────────────────────────────
exports.resendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) return errorResponse(res, 404, 'No account found with this email.');
    if (user.isEmailVerified) return errorResponse(res, 400, 'Email is already verified.');

    const verificationToken = user.generateEmailVerificationToken();
    await user.save({ validateBeforeSave: false });

    const verificationUrl = `${process.env.CLIENT_URL}/verify-email/${verificationToken}`;
    await sendEmail({
      to: user.email,
      subject: '✅ Verify Your Printicom Account',
      html: emailVerificationTemplate(user.name, verificationUrl),
    });

    return successResponse(res, 200, 'Verification email resent. Please check your inbox.');
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Login ─────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user with password
    const user = await User.findOne({ email }).select('+password +refreshToken');
    if (!user) return errorResponse(res, 401, 'Invalid email or password.');

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) return errorResponse(res, 401, 'Invalid email or password.');

    // Check account status
    if (!user.isActive) return errorResponse(res, 403, 'Your account has been deactivated.');

    // Warn if email not verified (but still allow login — optional: block login here)
    if (!user.isEmailVerified) {
      return errorResponse(res, 403, 'Please verify your email address before logging in.');
    }

    // Generate tokens
    const accessToken = generateAccessToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);

    // Save refresh token to DB
    user.refreshToken = refreshToken;
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    return successResponse(res, 200, 'Login successful', {
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        profilePhoto: user.profilePhoto,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Refresh Token ─────────────────────────────────────────
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return errorResponse(res, 400, 'Refresh token is required.');

    const decoded = verifyRefreshToken(refreshToken);
    const user = await User.findById(decoded.id).select('+refreshToken');

    if (!user || user.refreshToken !== refreshToken) {
      return errorResponse(res, 401, 'Invalid refresh token.');
    }

    const newAccessToken = generateAccessToken(user._id, user.role);
    const newRefreshToken = generateRefreshToken(user._id);

    user.refreshToken = newRefreshToken;
    await user.save({ validateBeforeSave: false });

    return successResponse(res, 200, 'Token refreshed', {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    return errorResponse(res, 401, 'Invalid or expired refresh token.');
  }
};

// ─── Logout ────────────────────────────────────────────────
exports.logout = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('+refreshToken');
    if (user) {
      user.refreshToken = undefined;
      await user.save({ validateBeforeSave: false });
    }
    return successResponse(res, 200, 'Logged out successfully.');
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Forgot Password ───────────────────────────────────────
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    // Don't reveal if user exists (security best practice)
    if (!user) {
      return successResponse(res, 200, 'If an account with this email exists, a reset link has been sent.');
    }

    const resetToken = user.generatePasswordResetToken();
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;
    await sendEmail({
      to: user.email,
      subject: '🔐 Reset Your Printicom Password',
      html: passwordResetTemplate(user.name, resetUrl),
    });

    return successResponse(res, 200, 'Password reset email sent. Please check your inbox.');
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Reset Password ────────────────────────────────────────
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) return errorResponse(res, 400, 'Invalid or expired reset link.');

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    return successResponse(res, 200, 'Password reset successfully. You can now login with your new password.');
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Get My Profile ────────────────────────────────────────
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    return successResponse(res, 200, 'Profile fetched', { user });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Update My Profile ─────────────────────────────────────
exports.updateProfile = async (req, res) => {
  try {
    const { name, phone, address } = req.body;
    const updateData = { name, phone, address };

    if (req.file) {
      updateData.profilePhoto = req.file.path.replace(/\\/g, '/');
    }

    const user = await User.findByIdAndUpdate(req.user._id, updateData, {
      new: true,
      runValidators: true,
    });

    return successResponse(res, 200, 'Profile updated successfully', { user });
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};

// ─── Change Password ───────────────────────────────────────
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) return errorResponse(res, 400, 'Current password is incorrect.');

    user.password = newPassword;
    await user.save();

    return successResponse(res, 200, 'Password changed successfully.');
  } catch (error) {
    return errorResponse(res, 500, error.message);
  }
};
