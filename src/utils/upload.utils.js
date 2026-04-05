const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const path = require('path');

// ─── Cloudinary Config ─────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── Storage Configuration ─────────────────────────────────
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    let folderName = 'printicom/misc';
    if (req.uploadType === 'product') folderName = 'printicom/products';
    if (req.uploadType === 'category') folderName = 'printicom/categories';
    if (req.uploadType === 'profile') folderName = 'printicom/profiles';
    if (req.uploadType === 'customization') folderName = 'printicom/customizations';
    if (req.uploadType === 'relatedto') folderName = 'printicom/relatedto';
    if (req.uploadType === 'relatedto_product') folderName = 'printicom/relatedto_products';
    
    return {
      folder: folderName,
      allowed_formats: ['jpeg', 'jpg', 'png', 'gif', 'webp'],
      // Cloudinary unique filename logic happens automatically
    };
  },
});

// ─── File Filter ───────────────────────────────────────────
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const mimeValid = allowedTypes.test(file.mimetype);
  if (mimeValid) return cb(null, true);
  cb(new Error('Only images are allowed (jpeg, jpg, png, gif, webp)'));
};

// ─── Multer Instances ──────────────────────────────────────
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter,
});

module.exports = { upload, cloudinary };
