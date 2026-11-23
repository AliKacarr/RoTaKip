'use strict';

const {
  isTefekkurImageCategory,
  isTefekkurTextCategory
} = require('./tefekkur.service');

function registerTefekkurRoutes(app, {
  listTefekkurImages,
  listTefekkurRadios,
  listTefekkurTexts
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
}

module.exports = {
  registerTefekkurRoutes
};
