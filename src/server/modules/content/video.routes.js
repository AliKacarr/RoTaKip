'use strict';

const { getContentCollection, isDatabaseNotReadyError } = require('./content-db');
const { createVideoService } = require('./video.service');

const FEED_CACHE_CONTROL = 'public, max-age=60';
const CHANNEL_CACHE_CONTROL = 'public, max-age=600';
const DETAIL_CACHE_CONTROL = 'public, max-age=300';

function registerVideoRoutes(app, { videoService = createVideoService({ getCollection: getContentCollection }) } = {}) {
  function respondWithFailure(res, error, logMessage) {
    res.setHeader('Cache-Control', 'no-store');
    if (isDatabaseNotReadyError(error)) {
      return res.status(503).json({
        success: false,
        message: 'Veritabanı hazır değil, lütfen tekrar deneyin.'
      });
    }
    console.error(logMessage, error);
    return res.status(500).json({
      success: false,
      message: 'Videolar yüklenemedi'
    });
  }

  // Sekme açılırken (veya başka sekmede ısınırken) kanallar + ilk videolar + ilk shorts'lar.
  app.get('/api/videos/home', async (req, res) => {
    try {
      const home = await videoService.getHome({ exclude: req.query.exclude, include: req.query.include });
      res.setHeader('Cache-Control', FEED_CACHE_CONTROL);
      return res.json({ success: true, ...home });
    } catch (error) {
      return respondWithFailure(res, error, 'Video ana akışı yüklenirken hata:');
    }
  });

  // Kaydırdıkça sonraki sayfalar: `before` bir önceki yanıtın `nextCursor` değeridir;
  // `channel` tek kanala süzer (kanal seçimi), `exclude` önerilmeyen kanalları dışarıda bırakır,
  // `include` abone olunan kanallardır (sayfanın çoğu onlardan gelir).
  app.get('/api/videos/feed', async (req, res) => {
    try {
      const page = await videoService.listFeed({
        type: req.query.type,
        channel: req.query.channel,
        exclude: req.query.exclude,
        include: req.query.include,
        before: req.query.before,
        limit: req.query.limit
      });
      if (!page) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(400).json({
          success: false,
          message: 'Geçersiz video akışı isteği'
        });
      }
      res.setHeader('Cache-Control', FEED_CACHE_CONTROL);
      return res.json({ success: true, ...page });
    } catch (error) {
      return respondWithFailure(res, error, 'Video akışı yüklenirken hata:');
    }
  });

  app.get('/api/videos/channels', async (_req, res) => {
    try {
      const channels = await videoService.listChannels();
      res.setHeader('Cache-Control', CHANNEL_CACHE_CONTROL);
      return res.json({ success: true, channels });
    } catch (error) {
      return respondWithFailure(res, error, 'Video kanalları yüklenirken hata:');
    }
  });

  app.get('/api/videos/:videoId', async (req, res) => {
    try {
      const detail = await videoService.getVideoDetail(req.params.videoId);
      if (!detail) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(400).json({ success: false, message: 'Geçersiz video kimliği' });
      }
      if (!detail.video) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(404).json({ success: false, message: 'Video bulunamadı' });
      }
      res.setHeader('Cache-Control', DETAIL_CACHE_CONTROL);
      return res.json({ success: true, ...detail });
    } catch (error) {
      return respondWithFailure(res, error, 'Video ayrıntısı yüklenirken hata:');
    }
  });
}

module.exports = {
  registerVideoRoutes
};
