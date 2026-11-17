'use strict';

const mongoose = require('mongoose');

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

function registerArticleRoutes(app) {
  app.get('/api/articles', async (req, res) => {
    try {
      if (!mongoose.connection.db || mongoose.connection.readyState !== 1) {
        try {
          await waitForDatabase();
        } catch (_) {
          return res.status(503).json({
            success: false,
            message: 'Veritabanı hazır değil, lütfen tekrar deneyin.'
          });
        }
      }

      const db = mongoose.connection.db;
      if (!db) {
        return res.status(503).json({
          success: false,
          message: 'Veritabanı bağlantısı kurulamadı'
        });
      }

      const articles = await db.collection('articles').find({}).toArray();
      const categories = [...new Set(articles.map(article => article.category))];

      return res.json({
        success: true,
        articles,
        categories
      });
    } catch (error) {
      console.error('Makaleler yüklenirken hata:', error);
      return res.status(500).json({
        success: false,
        message: 'Makaleler yüklenemedi'
      });
    }
  });
}

function registerContentRoutes(app) {
  registerVideoRoutes(app);
  registerArticleRoutes(app);
}

module.exports = {
  registerContentRoutes
};
