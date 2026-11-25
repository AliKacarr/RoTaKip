'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { registerTefekkurRoutes } = require('../../../src/server/modules/inspiration/tefekkur.routes');
const {
  createTefekkurService,
  isTefekkurImageCategory,
  isTefekkurTextCategory,
  normalizeStreamUrl
} = require('../../../src/server/modules/inspiration/tefekkur.service');

function createFakeApp() {
  const routes = new Map();
  return {
    routes,
    get(routePath, handler) {
      routes.set(routePath, handler);
    },
    post(routePath, ...handlers) {
      routes.set(`POST ${routePath}`, handlers[handlers.length - 1]);
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

function createFakeModel(documents) {
  const calls = { find: 0 };
  const model = {
    calls,
    find(filter, projection) {
      calls.find += 1;
      calls.lastProjection = projection;
      let limit = Infinity;
      return {
        sort(order) {
          calls.lastSort = order;
          return this;
        },
        limit(value) {
          limit = value;
          return this;
        },
        lean: async () => documents.slice(0, limit).map(document => ({ ...document }))
      };
    }
  };
  return model;
}

test('tefekkür kategori doğrulayıcıları yalnız tanımlı bölümleri kabul eder', () => {
  ['ayet', 'hadis', 'dua', 'risale'].forEach(category => {
    assert.equal(isTefekkurTextCategory(category), true);
  });
  assert.equal(isTefekkurTextCategory('esma'), false);
  assert.equal(isTefekkurTextCategory('__proto__'), false);
  assert.equal(isTefekkurTextCategory(undefined), false);
  assert.equal(isTefekkurImageCategory('risale'), true);
  assert.equal(isTefekkurTextCategory('vecize'), false);
  assert.equal(isTefekkurImageCategory('vecize'), false);
  assert.equal(isTefekkurImageCategory('ayet'), false);
  assert.equal(isTefekkurImageCategory('constructor'), false);
});

test('radyo yayın adresi yalnız http(s) olarak kabul edilir', () => {
  assert.equal(normalizeStreamUrl(' https://yayin.example.com/canli '), 'https://yayin.example.com/canli');
  assert.equal(normalizeStreamUrl('http://yayin.example.com:8000/stream'), 'http://yayin.example.com:8000/stream');
  assert.equal(normalizeStreamUrl('javascript:alert(1)'), null);
  assert.equal(normalizeStreamUrl('yayin.example.com'), null);
  assert.equal(normalizeStreamUrl(''), null);
  assert.equal(normalizeStreamUrl(undefined), null);
});

test('tefekkür metinleri sıralı, boşlar ayıklanmış ve önbellekli döner', async () => {
  let currentTime = 1000;
  const Ayet = createFakeModel([
    { _id: 'a1', sentence: '  Birinci ayet  ' },
    { _id: 'a2', sentence: '   ' },
    { _id: 'a3', sentence: 'Üçüncü ayet', source: ' Bakara 2/255 ' }
  ]);
  const service = createTefekkurService({
    models: { Ayet },
    publicPath: '/public',
    now: () => currentTime,
    cacheTtlMs: 500
  });

  const items = await service.listTefekkurTexts('ayet');
  assert.deepEqual(items, [
    { id: 'a1', text: 'Birinci ayet' },
    { id: 'a3', text: 'Üçüncü ayet', source: 'Bakara 2/255' }
  ]);
  assert.deepEqual(Ayet.calls.lastSort, { _id: 1 });
  assert.deepEqual(Ayet.calls.lastProjection, { sentence: 1, source: 1 });

  await service.listTefekkurTexts('ayet');
  assert.equal(Ayet.calls.find, 1);

  currentTime += 501;
  await service.listTefekkurTexts('ayet');
  assert.equal(Ayet.calls.find, 2);

  assert.equal(await service.listTefekkurTexts('bilinmeyen'), null);
  assert.deepEqual(await service.listTefekkurTexts('risale'), []);
});

test('tefekkür görselleri yalnız resim dosyalarını doğal sırayla listeler', async () => {
  const readPaths = [];
  const service = createTefekkurService({
    models: {},
    publicPath: path.join('kok', 'public'),
    readdir: async folder => {
      readPaths.push(folder);
      return ['10.jpg', 'not.txt', '2.webp', 'Ä.png', '1.JPG'];
    }
  });

  const items = await service.listTefekkurImages('risale');
  assert.deepEqual(readPaths, [path.join('kok', 'public', 'quotes')]);
  assert.deepEqual(items.map(item => item.name), ['1.JPG', '2.webp', '10.jpg', 'Ä.png']);
  assert.equal(items[3].url, '/quotes/%C3%84.png');
  assert.equal(await service.listTefekkurImages('ayet'), null);
});

test('tefekkür radyoları ortam değişkenlerinden okunur', () => {
  const service = createTefekkurService({
    models: {},
    publicPath: '/public',
    env: { TEFEKKUR_KURAN_RADYO_URL: 'https://radyo.example.com/kuran', TEFEKKUR_RISALET_RADYO_URL: 'ftp://x' }
  });
  assert.deepEqual(service.listTefekkurRadios(), [
    { key: 'kuran-radyo', name: 'Diyanet Kur\'an Radyo', streamUrl: 'https://radyo.example.com/kuran' },
    { key: 'risalet-radyo', name: 'Diyanet Risalet Radyo', streamUrl: null }
  ]);
});

test('tefekkür rotaları geçersiz bölümü 404, hatayı 500 olarak döndürür', async () => {
  const app = createFakeApp();
  registerTefekkurRoutes(app, {
    listTefekkurTexts: async category => {
      if (category === 'dua') throw new Error('db kapalı');
      return [{ id: '1', text: 'Metin' }];
    },
    listTefekkurImages: async () => [{ name: '1.jpg', url: '/quotes/1.jpg' }],
    listTefekkurRadios: () => [{ key: 'kuran-radyo', name: 'Diyanet Kur\'an Radyo', streamUrl: null }]
  });

  const ok = createResponse();
  await app.routes.get('/api/tefekkur/texts/:category')({ params: { category: 'ayet' } }, ok);
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(ok.body, { success: true, category: 'ayet', items: [{ id: '1', text: 'Metin' }] });
  assert.equal(ok.headers['Cache-Control'], 'public, max-age=600');

  const invalid = createResponse();
  await app.routes.get('/api/tefekkur/texts/:category')({ params: { category: 'esma' } }, invalid);
  assert.equal(invalid.statusCode, 404);

  const originalConsoleError = console.error;
  console.error = () => {};
  const failed = createResponse();
  try {
    await app.routes.get('/api/tefekkur/texts/:category')({ params: { category: 'dua' } }, failed);
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(failed.statusCode, 500);
  assert.equal(failed.body.success, false);

  const images = createResponse();
  await app.routes.get('/api/tefekkur/images/:category')({ params: { category: 'risale' } }, images);
  assert.equal(images.body.items.length, 1);

  const invalidImages = createResponse();
  await app.routes.get('/api/tefekkur/images/:category')({ params: { category: 'hadis' } }, invalidImages);
  assert.equal(invalidImages.statusCode, 404);

  const radios = createResponse();
  app.routes.get('/api/tefekkur/radios')({}, radios);
  assert.equal(radios.body.radios[0].key, 'kuran-radyo');
});

test('ilahi rotaları listeyi döner, geçersiz öneriyi 400, hatayı 500 yapar', async () => {
  const app = createFakeApp();
  const submitted = [];
  const reported = [];
  registerTefekkurRoutes(app, {
    ilahiReportLimiter: (_req, _res, next) => next(),
    reportTefekkurIlahi: async (videoId, reason) => {
      if (reason === 'patla') throw new Error('db kapalı');
      reported.push([videoId, reason]);
      return videoId === 'DUPkB8799Ao' ? { ok: true } : { ok: false, reason: 'unknown' };
    },
    ilahiSuggestionLimiter: (_req, _res, next) => next(),
    listTefekkurIlahiler: async () => [{ videoId: 'DUPkB8799Ao', baslik: 'İlahi', kanalAdi: 'Kanal', sureSaniye: 245 }],
    submitTefekkurIlahiOnerisi: async url => {
      if (url === 'patla') throw new Error('db kapalı');
      submitted.push(url);
      if (url === 'https://youtu.be/-dEsKKKflOk') return { ok: true, existing: true };
      return url === 'https://youtu.be/DUPkB8799Ao' ? { ok: true } : { ok: false, reason: 'invalid' };
    }
  });

  const list = createResponse();
  await app.routes.get('/api/tefekkur/ilahiler')({}, list);
  assert.equal(list.body.items[0].videoId, 'DUPkB8799Ao');
  assert.equal(list.headers['Cache-Control'], 'public, max-age=300');

  const submit = app.routes.get('POST /api/tefekkur/ilahi-onerileri');
  const ok = createResponse();
  await submit({ body: { url: 'https://youtu.be/DUPkB8799Ao' } }, ok);
  assert.deepEqual(ok.body, { success: true, existing: false });

  const existing = createResponse();
  await submit({ body: { url: 'https://youtu.be/-dEsKKKflOk' } }, existing);
  assert.deepEqual(existing.body, { success: true, existing: true });

  const report = app.routes.get('POST /api/tefekkur/ilahi-bildirimleri');
  const reportOk = createResponse();
  await report({ body: { videoId: 'DUPkB8799Ao', reason: 'acilmiyor' } }, reportOk);
  assert.deepEqual(reportOk.body, { success: true });
  assert.deepEqual(reported, [['DUPkB8799Ao', 'acilmiyor']]);

  const reportUnknown = createResponse();
  await report({ body: { videoId: 'aaaaaaaaaaa', reason: 'kalite' } }, reportUnknown);
  assert.equal(reportUnknown.statusCode, 400);

  const reportNoBody = createResponse();
  await report({}, reportNoBody);
  assert.equal(reportNoBody.statusCode, 400);

  const originalError = console.error;
  console.error = () => {};
  const reportFailed = createResponse();
  try {
    await report({ body: { videoId: 'DUPkB8799Ao', reason: 'patla' } }, reportFailed);
  } finally {
    console.error = originalError;
  }
  assert.equal(reportFailed.statusCode, 500);

  const invalid = createResponse();
  await submit({ body: { url: 'https://example.com' } }, invalid);
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.body.success, false);

  const noBody = createResponse();
  await submit({}, noBody);
  assert.equal(noBody.statusCode, 400);

  const originalConsoleError = console.error;
  console.error = () => {};
  const failed = createResponse();
  try {
    await submit({ body: { url: 'patla' } }, failed);
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(failed.statusCode, 500);
});
