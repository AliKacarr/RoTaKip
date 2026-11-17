'use strict';

const multer = require('multer');

function uploadErrorHandler(error, req, res, next) {
  if (!(error instanceof multer.MulterError)) return next(error);
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Görsel en fazla 5 MB olabilir.' });
  }
  return res.status(400).json({ error: 'Yalnızca JPEG, PNG, WebP veya GIF görselleri yüklenebilir.' });
}

module.exports = {
  uploadErrorHandler
};
