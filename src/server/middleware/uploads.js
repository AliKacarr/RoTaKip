'use strict';

const fs = require('fs');
const multer = require('multer');
const path = require('path');
const sharp = require('sharp');

function createUploadMiddleware({ unlinkWithRetry }) {
  // Multer konfigürasyonları
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const ALLOWED_IMAGE_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ]);

  function imageFileFilter(req, file, cb) {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
    }
    cb(null, true);
  }

  const imageUploadOptions = {
    limits: { fileSize: MAX_IMAGE_BYTES, files: 2 },
    fileFilter: imageFileFilter
  };

  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      const dir = 'public/uploads';
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
      }
      cb(null, dir);
    },
    filename: function (req, file, cb) {
      cb(null, Date.now() + path.extname(file.originalname));
    }
  });
  const upload = multer({ storage, ...imageUploadOptions });

  // Grup resmi yükleme konfigürasyonu
  const groupImageStorage = multer.diskStorage({
    destination: function (req, file, cb) {
      const dir = 'public/groupImages';
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      cb(null, dir);
    },
    filename: function (req, file, cb) {
      // Rastgele dosya adı oluştur
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, 'group-' + uniqueSuffix + path.extname(file.originalname));
    }
  });

  const uploadGroupImage = multer({ storage: groupImageStorage, ...imageUploadOptions });

  function getUploadedFiles(req) {
    if (req.file) return [req.file];
    if (!req.files) return [];
    return Object.values(req.files).flat();
  }

  async function removeUploadedFiles(req) {
    await Promise.all(getUploadedFiles(req).map(file => unlinkWithRetry(file.path)));
  }

  async function requireValidUploadedImages(req, res, next) {
    res.once('finish', () => {
      removeUploadedFiles(req).catch(error => console.error('Geçici yükleme dosyası silinemedi:', error.message));
    });
    try {
      for (const file of getUploadedFiles(req)) {
        const metadata = await sharp(file.path).metadata();
        if (!['jpeg', 'png', 'webp', 'gif'].includes(metadata.format)) {
          await removeUploadedFiles(req);
          return res.status(415).json({ error: 'Yalnızca JPEG, PNG, WebP veya GIF görselleri yüklenebilir.' });
        }
      }
      next();
    } catch (_) {
      await removeUploadedFiles(req);
      res.status(415).json({ error: 'Yüklenen dosya geçerli bir görsel değil.' });
    }
  }



  return {
    removeUploadedFiles,
    requireValidUploadedImages,
    upload,
    uploadGroupImage
  };
}

module.exports = {
  createUploadMiddleware
};

