'use strict';

const { createArticleService } = require('./article.service');
const { getContentCollection, isDatabaseNotReadyError } = require('./content-db');

function getArticlesCollection() {
  return getContentCollection('articles');
}

function registerArticleRoutes(app, { articleService = createArticleService({ getCollection: getArticlesCollection }) } = {}) {
  function respondWithFailure(res, error, logMessage) {
    if (isDatabaseNotReadyError(error)) {
      return res.status(503).json({
        success: false,
        message: 'Veritabanı hazır değil, lütfen tekrar deneyin.'
      });
    }
    console.error(logMessage, error);
    return res.status(500).json({
      success: false,
      message: 'Makaleler yüklenemedi'
    });
  }

  // Sekme açılırken her kategorinin ilk birkaç makalesi tek istekte hazırlanır.
  app.get('/api/articles/preview', async (req, res) => {
    try {
      const preview = await articleService.listPreview(req.query.perCategory);
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.json({ success: true, ...preview });
    } catch (error) {
      return respondWithFailure(res, error, 'Makale önizlemeleri yüklenirken hata:');
    }
  });

  // Kategori sayfası kalan makaleleri kaydırdıkça `offset` / `limit` ile ister.
  app.get('/api/articles', async (req, res) => {
    try {
      const page = await articleService.listCategoryPage(req.query.category, {
        offset: req.query.offset,
        limit: req.query.limit
      });
      if (!page) {
        return res.status(400).json({
          success: false,
          message: 'Geçerli bir makale kategorisi belirtin'
        });
      }
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.json({ success: true, ...page });
    } catch (error) {
      return respondWithFailure(res, error, 'Makaleler yüklenirken hata:');
    }
  });
}

function registerContentRoutes(app, options = {}) {
  registerArticleRoutes(app, options);
}

module.exports = {
  registerContentRoutes
};
