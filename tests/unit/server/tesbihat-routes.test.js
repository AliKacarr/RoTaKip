'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { registerTesbihatRoutes } = require('../../../src/server/modules/tesbihat/tesbihat.routes');
const {
  createTesbihatService,
  parseDayCount,
  parseLocationId
} = require('../../../src/server/modules/tesbihat/tesbihat.service');
const { shiftDateKey } = require('../../../src/server/shared/date-time');

function createFakeApp() {
  const routes = new Map();
  const middlewares = new Map();
  return {
    routes,
    middlewares,
    get(routePath, ...handlers) {
      routes.set(routePath, handlers.at(-1));
      middlewares.set(routePath, handlers.slice(0, -1));
    }
  };
}

function createResponse() {
  return {
    body: null,
    headers: {},
    statusCode: 200,
    json(body) {
      this.body = body;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    }
  };
}

function createFakeDb(collections) {
  const queries = [];
  return {
    queries,
    collection(name) {
      const documents = collections[name] || [];
      return {
        find(filter = {}) {
          queries.push({ name, filter });
          let result = documents.filter(document => Object.entries(filter).every(([key, value]) => {
            if (value && typeof value === 'object' && '$gte' in value) {
              return document[key] >= value.$gte && document[key] <= value.$lte;
            }
            return document[key] === value;
          }));
          return {
            sort() {
              result = [...result].sort((a, b) => a.tarih.localeCompare(b.tarih));
              return this;
            },
            toArray: async () => result.map(document => ({ ...document }))
          };
        },
        async findOne(filter) {
          queries.push({ name, filter });
          return documents.find(document => Object.entries(filter)
            .every(([key, value]) => document[key] === value)) || null;
        }
      };
    }
  };
}

const locationLookupLimiter = (_req, _res, next) => next();

function registerWith(service, today = '2026-11-22') {
  const app = createFakeApp();
  registerTesbihatRoutes(app, {
    ...service,
    locationLookupLimiter,
    istanbulDateKey: () => today,
    shiftDateKey
  });
  return app;
}

const prayerTimes = ['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-30'].map(tarih => ({
  locationId: 9432,
  tarih,
  imsak: '05:40',
  gunes: '07:05',
  ogle: '12:15',
  ikindi: '14:50',
  aksam: '17:15',
  yatsi: '18:35'
}));

const fakeDb = createFakeDb({
  prayer_locations: [
    { locationId: 9432, il: 'Elazığ', ilce: 'Elazığ' },
    { locationId: 9146, il: 'Adana', ilce: 'Adana' }
  ],
  prayer_times: prayerTimes,
  tesbihatlar: [
    { vakit: 'ogle', tur: 'kisa', baslik: 'Öğle Namazı Tesbihatı (Kısa)', adimlar: [{ bolum: 'ana', tur: 'turkce', metin: 'Selam verdikten sonra:' }] }
  ]
});

test('konum ve gün sayısı parametreleri güvenli şekilde ayrıştırılır', () => {
  assert.equal(parseLocationId('9432'), 9432);
  assert.equal(parseLocationId('94a32'), null);
  assert.equal(parseLocationId({ $gt: 0 }), null);
  assert.equal(parseLocationId(''), null);
  assert.equal(parseDayCount(undefined), 7);
  assert.equal(parseDayCount('0'), 1);
  assert.equal(parseDayCount('500'), 31);
});

test('konum listesi plaka koduyla birlikte plaka sırasına göre döner', async () => {
  const db = createFakeDb({
    prayer_locations: [
      { locationId: 9541, il: 'İstanbul', ilce: 'İstanbul' },
      { locationId: 9432, il: 'Elazığ', ilce: 'Elazığ' },
      { locationId: 9146, il: 'Adana', ilce: 'Adana' }
    ]
  });
  const app = registerWith(createTesbihatService({ getDb: () => db }));
  const response = createResponse();
  await app.routes.get('/api/prayer-locations')({}, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    response.body.locations.map(location => `${location.plaka} ${location.il}`),
    ['01 Adana', '23 Elazığ', '34 İstanbul']
  );
});

test('namaz vakitleri bugünden başlayarak istenen gün aralığını döndürür', async () => {
  const app = registerWith(createTesbihatService({ getDb: () => fakeDb }));
  const response = createResponse();
  await app.routes.get('/api/prayer-times')({ query: { locationId: '9432', days: '2' } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.today, '2026-11-22');
  assert.deepEqual(response.body.location, { locationId: 9432, il: 'Elazığ', ilce: 'Elazığ', plaka: '23' });
  assert.deepEqual(response.body.times.map(row => row.tarih), ['2026-11-22', '2026-11-23']);
});

test('namaz vakitleri geçersiz veya bilinmeyen konumu reddeder', async () => {
  const app = registerWith(createTesbihatService({ getDb: () => fakeDb }));
  const handler = app.routes.get('/api/prayer-times');

  const invalid = createResponse();
  await handler({ query: { locationId: 'abc' } }, invalid);
  assert.equal(invalid.statusCode, 400);

  const unknown = createResponse();
  await handler({ query: { locationId: '1' } }, unknown);
  assert.equal(unknown.statusCode, 404);
});

test('tesbihat yalnız tanımlı vakit ve türleri kabul eder', async () => {
  const db = createFakeDb({ tesbihatlar: [] });
  const app = registerWith(createTesbihatService({ getDb: () => db }));
  const response = createResponse();
  await app.routes.get('/api/tesbihat/:vakit/:tur')({ params: { vakit: 'ogle', tur: '$where' } }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(db.queries.length, 0);
});

test('tesbihat belgesi adımlarıyla döner, bulunamazsa 404 verir', async () => {
  const app = registerWith(createTesbihatService({ getDb: () => fakeDb }));
  const handler = app.routes.get('/api/tesbihat/:vakit/:tur');

  const found = createResponse();
  await handler({ params: { vakit: 'ogle', tur: 'kisa' } }, found);
  assert.equal(found.statusCode, 200);
  assert.equal(found.body.tesbihat.adimlar[0].tur, 'turkce');

  const missing = createResponse();
  await handler({ params: { vakit: 'yatsi', tur: 'uzun' } }, missing);
  assert.equal(missing.statusCode, 404);
});

test('toplu tesbihat paketi sürümle döner; sürüm eşleşirse içerik tekrar gönderilmez', async () => {
  const db = createFakeDb({
    tesbihatlar: [
      { vakit: 'yatsi', tur: 'kisa', baslik: 'Yatsı', adimlar: [] },
      { vakit: 'sabah', tur: 'uzun', baslik: 'Sabah', adimlar: [] },
      { vakit: 'gecersiz', tur: 'kisa', baslik: 'Yok sayılır', adimlar: [] }
    ]
  });
  const app = registerWith(createTesbihatService({ getDb: () => db }));
  const handler = app.routes.get('/api/tesbihat');

  const full = createResponse();
  await handler({ query: {} }, full);
  assert.equal(full.statusCode, 200);
  assert.equal(full.headers['Cache-Control'], 'no-cache');
  assert.deepEqual(full.body.tesbihat.map(item => `${item.vakit}:${item.tur}`), ['sabah:uzun', 'yatsi:kisa']);
  assert.match(full.body.version, /^[0-9a-f]{16}$/);

  const unchanged = createResponse();
  await handler({ query: { version: full.body.version } }, unchanged);
  assert.equal(unchanged.body.unchanged, true);
  assert.equal(unchanged.body.tesbihat, undefined);

  const outdated = createResponse();
  await handler({ query: { version: 'eski-surum' } }, outdated);
  assert.equal(outdated.body.tesbihat.length, 2);
});

test('toplu tesbihat paketi içerik değişince yeni sürüm üretir', async () => {
  const collections = { tesbihatlar: [{ vakit: 'ogle', tur: 'kisa', baslik: 'Eski', adimlar: [] }] };
  let clock = 0;
  const app = registerWith(createTesbihatService({
    getDb: () => createFakeDb(collections),
    now: () => clock
  }));
  const handler = app.routes.get('/api/tesbihat');

  const before = createResponse();
  await handler({ query: {} }, before);

  collections.tesbihatlar = [{ vakit: 'ogle', tur: 'kisa', baslik: 'Yeni', adimlar: [] }];
  clock += 11 * 60 * 1000;
  const after = createResponse();
  await handler({ query: { version: before.body.version } }, after);

  assert.notEqual(after.body.version, before.body.version);
  assert.equal(after.body.tesbihat[0].baslik, 'Yeni');
});

test('toplu tesbihat paketi boşsa 404 verir', async () => {
  const app = registerWith(createTesbihatService({ getDb: () => createFakeDb({ tesbihatlar: [] }) }));
  const response = createResponse();
  await app.routes.get('/api/tesbihat')({ query: {} }, response);
  assert.equal(response.statusCode, 404);
});

const resolveDb = () => createFakeDb({
  prayer_locations: [
    { locationId: 9432, il: 'Elazığ', ilce: 'Elazığ' },
    { locationId: 9440, il: 'Elazığ', ilce: 'Palu' },
    { locationId: 9146, il: 'Adana', ilce: 'Adana' }
  ]
});

test('konum çözümleme ucu hız sınırlayıcıyla korunur', () => {
  const app = registerWith(createTesbihatService({ getDb: () => fakeDb }));
  assert.deepEqual(app.middlewares.get('/api/prayer-locations/resolve'), [locationLookupLimiter]);
});

function resolveWith(place) {
  const reverseGeocode = typeof place === 'function' ? place : async () => place;
  return registerWith(createTesbihatService({ getDb: resolveDb, reverseGeocode }))
    .routes.get('/api/prayer-locations/resolve');
}

test('koordinat ilçeye, ilçe bulunamazsa il merkezine eşlenir', async () => {
  const exact = createResponse();
  await resolveWith({ countryCode: 'TR', plate: '23', names: ['Elazığ Province', 'Palu'] })(
    { query: { latitude: '38.72', longitude: '39.93' } }, exact);
  assert.equal(exact.body.location.locationId, 9440);
  assert.equal(exact.body.exact, true);

  const fallback = createResponse();
  await resolveWith({ countryCode: 'TR', plate: '', names: ['Elazığ Province', 'Bilinmeyen'] })(
    { query: { latitude: '38.72', longitude: '39.93' } }, fallback);
  assert.equal(fallback.body.location.locationId, 9432);
  assert.equal(fallback.body.exact, false);
});

test('konum çözümleme geçersiz koordinatı, yurt dışını ve servis hatasını ayırt eder', async () => {
  const invalid = createResponse();
  await resolveWith({ countryCode: 'TR', names: [] })({ query: { latitude: 'abc', longitude: '39' } }, invalid);
  assert.equal(invalid.statusCode, 400);

  const abroad = createResponse();
  await resolveWith({ countryCode: 'DE', names: ['Berlin'] })({ query: { latitude: '52.52', longitude: '13.40' } }, abroad);
  assert.equal(abroad.statusCode, 404);
  assert.equal(abroad.body.outsideTurkey, true);

  const down = createResponse();
  await resolveWith(async () => { throw Object.assign(new Error('ağ'), { statusCode: 502 }); })(
    { query: { latitude: '38.72', longitude: '39.93' } }, down);
  assert.equal(down.statusCode, 502);
});

test('veritabanı hazır değilse 503 döner', async () => {
  const app = registerWith(createTesbihatService({ getDb: () => null }));
  const response = createResponse();
  await app.routes.get('/api/prayer-locations')({}, response);

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.success, false);
});
