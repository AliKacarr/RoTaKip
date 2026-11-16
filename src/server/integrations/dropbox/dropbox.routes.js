'use strict';

function registerDropboxRoutes(app, { checkDropboxToken }) {
  app.get('/api/dropbox-status', async (req, res) => {
    const tokenStatus = await checkDropboxToken();

    if (tokenStatus.valid) {
      return res.json({
        status: 'connected',
        message: 'Dropbox bağlantısı aktif',
        timestamp: Date.now()
      });
    }

    let status = 'connection_error';
    let message = 'Dropbox bağlantı hatası - İnternet bağlantısını kontrol edin';

    if (tokenStatus.error === 'Token süresi dolmuş') {
      status = 'expired';
      message = 'Dropbox access token süresi dolmuş - .env dosyasında DROPBOX_ACCESS_TOKEN güncelleyin';
    } else if (tokenStatus.error === 'Yetki hatası') {
      status = 'forbidden';
      message = 'Dropbox yetki hatası - Token yetkilerini kontrol edin';
    }

    return res.json({ status, message, timestamp: Date.now() });
  });
}

module.exports = {
  registerDropboxRoutes
};
