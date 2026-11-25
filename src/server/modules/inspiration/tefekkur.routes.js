'use strict';

const {
  isTefekkurImageCategory,
  isTefekkurTextCategory
} = require('./tefekkur.service');

function registerTefekkurRoutes(app, {
  ilahiReportLimiter,
  ilahiSuggestionLimiter,
  listTefekkurIlahiler,
  listTefekkurImages,
  listTefekkurRadios,
  listTefekkurTexts,
  reportTefekkurIlahi,
  submitTefekkurIlahiOnerisi
}) {
  app.get('/api/tefekkur/texts/:category', async (req, res) => {
    const { category } = req.params;
    if (!isTefekkurTextCategory(category)) {
      return res.status(404).json({ success: false, message: 'Bölüm bulunamadı' });
    }
    try {
      const items = await listTefekkurTexts(category);
      res.setHeader('Cache-Control', 'public, max-age=600');
      return res.json({ success: true, category, items });
    } catch (error) {
      console.error(`Tefekkür metinleri (${category}) yüklenemedi:`, error);
      return res.status(500).json({ success: false, message: 'İçerik yüklenemedi' });
    }
  });

  app.get('/api/tefekkur/images/:category', async (req, res) => {
    const { category } = req.params;
    if (!isTefekkurImageCategory(category)) {
      return res.status(404).json({ success: false, message: 'Bölüm bulunamadı' });
    }
    try {
      const items = await listTefekkurImages(category);
      res.setHeader('Cache-Control', 'public, max-age=600');
      return res.json({ success: true, category, items });
    } catch (error) {
      console.error(`Tefekkür görselleri (${category}) yüklenemedi:`, error);
      return res.status(500).json({ success: false, message: 'Görseller yüklenemedi' });
    }
  });

  app.get('/api/tefekkur/radios', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.json({ success: true, radios: listTefekkurRadios() });
  });

  app.get('/api/tefekkur/ilahiler', async (req, res) => {
    try {
      const items = await listTefekkurIlahiler();
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.json({ success: true, items });
    } catch (error) {
      console.error('Tefekkür ilahileri yüklenemedi:', error);
      return res.status(500).json({ success: false, message: 'İlahiler yüklenemedi' });
    }
  });

  app.post('/api/tefekkur/ilahi-onerileri', ilahiSuggestionLimiter, async (req, res) => {
    try {
      const result = await submitTefekkurIlahiOnerisi(req.body?.url);
      if (!result.ok) {
        return res.status(400).json({ success: false, message: 'Geçerli bir YouTube bağlantısı girin' });
      }
      // `existing`: ilahi zaten listede olduğundan öneri kaydedilmedi.
      return res.json({ success: true, existing: result.existing === true });
    } catch (error) {
      console.error('Tefekkür ilahi önerisi kaydedilemedi:', error);
      return res.status(500).json({ success: false, message: 'Öneri gönderilemedi' });
    }
  });

  app.post('/api/tefekkur/ilahi-bildirimleri', ilahiReportLimiter, async (req, res) => {
    try {
      const result = await reportTefekkurIlahi(req.body?.videoId, req.body?.reason);
      if (!result.ok) {
        return res.status(400).json({ success: false, message: 'Bildirim gönderilemedi' });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error('Tefekkür ilahi bildirimi kaydedilemedi:', error);
      return res.status(500).json({ success: false, message: 'Bildirim gönderilemedi' });
    }
  });
}

module.exports = {
  registerTefekkurRoutes
};
