'use strict';

const crypto = require('node:crypto');
const mongoose = require('mongoose');

const TESBIHAT_VAKITLERI = Object.freeze(['sabah', 'ogle', 'ikindi', 'aksam', 'yatsi']);
const TESBIHAT_TURLERI = Object.freeze(['kisa', 'uzun', 'arapca-uzun']);
const PRAYER_TIME_FIELDS = Object.freeze(['imsak', 'gunes', 'ogle', 'ikindi', 'aksam', 'yatsi']);
const DEFAULT_PRAYER_DAY_COUNT = 7;
const MAX_PRAYER_DAY_COUNT = 31;
const STATIC_CONTENT_CACHE_MS = 10 * 60 * 1000;
const PROVINCE_PLATES = Object.freeze([
  'Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Amasya', 'Ankara', 'Antalya', 'Artvin', 'Aydın',
  'Balıkesir', 'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa', 'Çanakkale', 'Çankırı',
  'Çorum', 'Denizli', 'Diyarbakır', 'Edirne', 'Elazığ', 'Erzincan', 'Erzurum', 'Eskişehir',
  'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkari', 'Hatay', 'Isparta', 'Mersin', 'İstanbul', 'İzmir',
  'Kars', 'Kastamonu', 'Kayseri', 'Kırklareli', 'Kırşehir', 'Kocaeli', 'Konya', 'Kütahya', 'Malatya',
  'Manisa', 'Kahramanmaraş', 'Mardin', 'Muğla', 'Muş', 'Nevşehir', 'Niğde', 'Ordu', 'Rize', 'Sakarya',
  'Samsun', 'Siirt', 'Sinop', 'Sivas', 'Tekirdağ', 'Tokat', 'Trabzon', 'Tunceli', 'Şanlıurfa', 'Uşak',
  'Van', 'Yozgat', 'Zonguldak', 'Aksaray', 'Bayburt', 'Karaman', 'Kırıkkale', 'Batman', 'Şırnak',
  'Bartın', 'Ardahan', 'Iğdır', 'Yalova', 'Karabük', 'Kilis', 'Osmaniye', 'Düzce'
].reduce((plates, province, index) => {
  plates[province] = String(index + 1).padStart(2, '0');
  return plates;
}, {}));

function parseLocationId(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{1,7}$/.test(text)) return null;
  return Number(text);
}

function parseDayCount(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return DEFAULT_PRAYER_DAY_COUNT;
  return Math.min(Math.max(parsed, 1), MAX_PRAYER_DAY_COUNT);
}

// Koordinatlar ilçe tespiti için yeterli hassasiyete (~1 km) yuvarlanır; konum servisine daha
// ayrıntılı bir iz gönderilmez.
function parseCoordinate(value, limit) {
  const text = String(value ?? '').trim();
  if (!/^-?\d{1,3}(\.\d+)?$/.test(text)) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > limit) return null;
  return parsed.toFixed(2);
}

function normalizePlaceName(value) {
  return String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/İ/g, 'i')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/̇/g, '')
    .replace(/\b(province|district|merkez|ili|ilcesi|belediyesi)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isTesbihatSelection(vakit, tur) {
  return TESBIHAT_VAKITLERI.includes(vakit) && TESBIHAT_TURLERI.includes(tur);
}

function defaultGetDb() {
  return mongoose.connection.readyState === 1 ? mongoose.connection.db : null;
}

function createTesbihatService({
  getDb = defaultGetDb,
  now = () => Date.now(),
  reverseGeocode = null
} = {}) {
  const cache = new Map();

  function requireDb() {
    const db = getDb();
    if (!db) {
      const error = new Error('Veritabanı hazır değil, lütfen tekrar deneyin.');
      error.statusCode = 503;
      throw error;
    }
    return db;
  }

  async function cached(key, load) {
    const entry = cache.get(key);
    if (entry && entry.expiresAt > now()) return entry.value;
    const value = await load();
    if (value) cache.set(key, { value, expiresAt: now() + STATIC_CONTENT_CACHE_MS });
    return value;
  }

  function listPrayerLocations() {
    return cached('prayer-locations', async () => {
      const locations = await requireDb().collection('prayer_locations')
        .find({}, { projection: { _id: 0, locationId: 1, il: 1, ilce: 1 } })
        .toArray();
      return locations
        .map(location => ({ ...location, plaka: PROVINCE_PLATES[location.il] || '' }))
        .sort((a, b) => (a.plaka || '99').localeCompare(b.plaka || '99')
          || a.il.localeCompare(b.il, 'tr')
          || a.ilce.localeCompare(b.ilce, 'tr'));
    });
  }

  async function findPrayerLocation(locationId) {
    const locations = await listPrayerLocations();
    return locations.find(location => location.locationId === locationId) || null;
  }

  // Koordinatı Diyanet konum listesindeki il/ilçeye eşler. Ağ hatası 502, Türkiye dışı
  // veya eşleşmeyen konum `null` (`outsideTurkey` ile birlikte) döner.
  async function resolvePrayerLocation(latitude, longitude) {
    if (!reverseGeocode) {
      const error = new Error('Konum servisi yapılandırılmamış');
      error.statusCode = 502;
      throw error;
    }
    const place = await reverseGeocode(latitude, longitude);
    if (place.countryCode !== 'TR') return { outsideTurkey: true, location: null };

    const locations = await listPrayerLocations();
    const names = new Set(place.names.map(normalizePlaceName).filter(Boolean));
    const provinceName = place.plate
      ? locations.find(location => location.plaka === place.plate)?.il
      : locations.find(location => names.has(normalizePlaceName(location.il)))?.il;
    if (!provinceName) return { outsideTurkey: false, location: null };

    const districts = locations.filter(location => location.il === provinceName);
    const exact = districts.find(location => location.ilce !== location.il
      && names.has(normalizePlaceName(location.ilce)));
    const center = districts.find(location => location.ilce === location.il) || districts[0];
    return { outsideTurkey: false, location: exact || center, exact: Boolean(exact) };
  }

  function listPrayerTimes(locationId, startDateKey, endDateKey) {
    const projection = { _id: 0, tarih: 1 };
    PRAYER_TIME_FIELDS.forEach(field => { projection[field] = 1; });
    return requireDb().collection('prayer_times')
      .find({ locationId, tarih: { $gte: startDateKey, $lte: endDateKey } }, { projection })
      .sort({ tarih: 1 })
      .toArray();
  }

  function getTesbihat(vakit, tur) {
    return cached(`tesbihat:${vakit}:${tur}`, () => requireDb().collection('tesbihatlar')
      .findOne({ vakit, tur }, { projection: { _id: 0, vakit: 1, tur: 1, baslik: 1, adimlar: 1 } }));
  }

  // Tüm tesbihatlar tek paket olarak döner. `version`, içeriğin özetidir: istemci
  // elindeki sürümü gönderip yalnız değiştiyse yeni içeriği indirir.
  function listTesbihat() {
    return cached('tesbihat:all', async () => {
      const documents = await requireDb().collection('tesbihatlar')
        .find({}, { projection: { _id: 0, vakit: 1, tur: 1, baslik: 1, adimlar: 1 } })
        .toArray();
      const tesbihat = documents
        .filter(document => isTesbihatSelection(document.vakit, document.tur))
        .sort((a, b) => TESBIHAT_VAKITLERI.indexOf(a.vakit) - TESBIHAT_VAKITLERI.indexOf(b.vakit)
          || TESBIHAT_TURLERI.indexOf(a.tur) - TESBIHAT_TURLERI.indexOf(b.tur));
      if (!tesbihat.length) return null;
      const version = crypto.createHash('sha1').update(JSON.stringify(tesbihat)).digest('hex').slice(0, 16);
      return { version, tesbihat };
    });
  }

  return {
    findPrayerLocation,
    getTesbihat,
    listPrayerLocations,
    listPrayerTimes,
    listTesbihat,
    resolvePrayerLocation
  };
}

module.exports = {
  createTesbihatService,
  isTesbihatSelection,
  normalizePlaceName,
  parseCoordinate,
  parseDayCount,
  parseLocationId
};
