'use strict';

const mongoose = require('mongoose');

const { createArticleService } = require('./article.service');

const VIDEO_LIST_TYPES = new Set(['random', 'latest', 'most-viewed']);
const DEFAULT_VIDEO_LIMIT = 6;
const MAX_VIDEO_LIMIT = 24;

function registerVideoRoutes(app) {
  app.get('/api/videos', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const type = String(req.query.type || 'random');
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), MAX_VIDEO_LIMIT)
      : DEFAULT_VIDEO_LIMIT;

    if (!VIDEO_LIST_TYPES.has(type)) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz video liste türü'
      });
    }

    if (!mongoose.connection.db || mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Veritabanı hazır değil, lütfen tekrar deneyin.'
      });
    }

    try {
      const videosCollection = mongoose.connection.db.collection('videolar');
      const validVideoQuery = { videoId: { $type: 'string', $ne: '' } };
      const projection = {
        _id: 0,
        videoId: 1,
        baslik: 1,
        createdAt: 1,
        izlenmeSayisi: 1,
        kanalAdi: 1,
        kanalId: 1,
        link: 1,
        sureSaniye: 1,
        videoTuru: 1,
        yuklenmeTarihi: 1
      };

      let videos;
      if (type === 'random') {
        videos = await videosCollection.aggregate([
          { $match: validVideoQuery },
          { $sample: { size: limit } },
          { $project: projection }
        ]).toArray();
      } else {
        const sort = type === 'latest'
          ? { yuklenmeTarihi: -1, createdAt: -1, _id: -1 }
          : { izlenmeSayisi: -1, yuklenmeTarihi: -1, _id: -1 };

        videos = await videosCollection
          .find(validVideoQuery, { projection })
          .sort(sort)
          .limit(limit)
          .toArray();
      }

      return res.json({ success: true, videos });
    } catch (error) {
      console.error('Videolar yüklenirken hata:', error);
      return res.status(500).json({
        success: false,
        message: 'Videolar yüklenemedi'
      });
    }
  });
}

function waitForDatabase(timeoutMs = 3000) {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timeoutId = null;
    const cleanup = () => {
      clearTimeout(timeoutId);
      mongoose.connection.off('connected', onConnected);
      mongoose.connection.off('error', onError);
    };
    const onConnected = () => {
      cleanup();
      resolve();
    };
    const onError = error => {
      cleanup();
      reject(error);
    };
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('DB not ready in time'));
    }, timeoutMs);

    mongoose.connection.once('connected', onConnected);
    mongoose.connection.once('error', onError);
  });
}

async function getArticlesCollection() {
  if (!mongoose.connection.db || mongoose.connection.readyState !== 1) {
    await waitForDatabase();
  }
  const db = mongoose.connection.db;
  if (!db) throw new Error('Veritabanı bağlantısı kurulamadı');
  return db.collection('articles');
}

function registerArticleRoutes(app, { articleService = createArticleService({ getCollection: getArticlesCollection }) } = {}) {
  function respondWithFailure(res, error, logMessage) {
    if (/DB not ready/i.test(error?.message || '')) {
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
  registerVideoRoutes(app);
  registerArticleRoutes(app, options);
}

module.exports = {
  registerContentRoutes
};
