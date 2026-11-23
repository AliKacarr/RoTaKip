'use strict';

const {
  isTesbihatSelection,
  parseCoordinate,
  parseDayCount,
  parseLocationId
} = require('./tesbihat.service');

function sendServiceError(res, error, fallbackMessage) {
  if (error.statusCode === 503) {
    return res.status(503).json({ success: false, message: error.message });
  }
  if (error.statusCode === 502) {
    console.warn(`${fallbackMessage}:`, error.message);
    return res.status(502).json({ success: false, message: fallbackMessage });
  }
  console.error(`${fallbackMessage}:`, error);
  return res.status(500).json({ success: false, message: fallbackMessage });
}

function registerTesbihatRoutes(app, {
  findPrayerLocation,
  getTesbihat,
  istanbulDateKey,
  listPrayerLocations,
  listPrayerTimes,
  listTesbihat,
  locationLookupLimiter,
  resolvePrayerLocation,
  shiftDateKey
}) {
  app.get('/api/prayer-locations', async (req, res) => {
    try {
      const locations = await listPrayerLocations();
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.json({ success: true, locations });
    } catch (error) {
      return sendServiceError(res, error, 'Konumlar yüklenemedi');
    }
  });

  app.get('/api/prayer-locations/resolve', locationLookupLimiter, async (req, res) => {
    const latitude = parseCoordinate(req.query.latitude, 90);
    const longitude = parseCoordinate(req.query.longitude, 180);
    if (latitude === null || longitude === null) {
      return res.status(400).json({ success: false, message: 'Geçerli bir konum gönderin' });
    }

    try {
      const result = await resolvePrayerLocation(latitude, longitude);
      res.setHeader('Cache-Control', 'no-store');
      if (result.outsideTurkey) {
        return res.status(404).json({ success: false, outsideTurkey: true, message: 'Şimdilik yalnızca Türkiye\'deki konumlar destekleniyor' });
      }
      if (!result.location) {
        return res.status(404).json({ success: false, message: 'Konumunuza uygun il bulunamadı' });
      }
      return res.json({ success: true, location: result.location, exact: result.exact });
    } catch (error) {
      return sendServiceError(res, error, 'Konum servisine ulaşılamadı');
    }
  });

  app.get('/api/prayer-times', async (req, res) => {
    const locationId = parseLocationId(req.query.locationId);
    if (locationId === null) {
      return res.status(400).json({ success: false, message: 'Geçerli bir konum seçin' });
    }

    try {
      const location = await findPrayerLocation(locationId);
      if (!location) {
        return res.status(404).json({ success: false, message: 'Konum bulunamadı' });
      }

      const today = istanbulDateKey();
      const endDate = shiftDateKey(today, parseDayCount(req.query.days) - 1);
      const times = await listPrayerTimes(locationId, today, endDate);
      res.setHeader('Cache-Control', 'private, max-age=600');
      return res.json({ success: true, today, location, times });
    } catch (error) {
      return sendServiceError(res, error, 'Namaz vakitleri yüklenemedi');
    }
  });

  // `?version=` istemcinin elindeki sürümdür; eşleşirse içerik tekrar gönderilmez.
  // Tarayıcı cache'i sürüm kontrolünü bayatlatmasın diye her seferinde doğrulanır.
  app.get('/api/tesbihat', async (req, res) => {
    try {
      const bundle = await listTesbihat();
      if (!bundle) {
        return res.status(404).json({ success: false, message: 'Tesbihat bulunamadı' });
      }
      res.setHeader('Cache-Control', 'no-cache');
      if (typeof req.query?.version === 'string' && req.query.version === bundle.version) {
        return res.json({ success: true, version: bundle.version, unchanged: true });
      }
      return res.json({ success: true, version: bundle.version, tesbihat: bundle.tesbihat });
    } catch (error) {
      return sendServiceError(res, error, 'Tesbihat yüklenemedi');
    }
  });

  app.get('/api/tesbihat/:vakit/:tur', async (req, res) => {
    const { vakit, tur } = req.params;
    if (!isTesbihatSelection(vakit, tur)) {
      return res.status(400).json({ success: false, message: 'Geçersiz tesbihat seçimi' });
    }

    try {
      const tesbihat = await getTesbihat(vakit, tur);
      if (!tesbihat) {
        return res.status(404).json({ success: false, message: 'Tesbihat bulunamadı' });
      }
      res.setHeader('Cache-Control', 'public, max-age=600');
      return res.json({ success: true, tesbihat });
    } catch (error) {
      return sendServiceError(res, error, 'Tesbihat yüklenemedi');
    }
  });
}

module.exports = {
  registerTesbihatRoutes
};
