'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createCeteleService,
  defaultCeteleFields,
  getCeteleConfig,
  parseRange,
  readingStatusForEntry,
  sanitizeEntryValues,
  validateCeteleFields
} = require('../../../src/server/modules/cetele/cetele.service');
const { registerCeteleRoutes } = require('../../../src/server/modules/cetele/cetele.routes');
const readingEditPolicy = require('../../../src/server/modules/readings/reading-edit-policy');
const { shiftDateKey } = require('../../../src/server/shared/date-time');

const USER_A = '64b000000000000000000001';
const USER_B = '64b000000000000000000002';

function matches(document, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === 'object' && ('$gte' in value || '$ne' in value)) {
      if ('$ne' in value) return document[key] !== value.$ne;
      return document[key] >= value.$gte && document[key] <= value.$lte;
    }
    return String(document[key]) === String(value);
  });
}

function query(result) {
  return {
    select() { return this; },
    sort() { return this; },
    lean: async () => (Array.isArray(result) ? result.map(item => ({ ...item })) : result && { ...result })
  };
}

function createFakeModel(documents = []) {
  return {
    documents,
    find(filter = {}) { return query(documents.filter(document => matches(document, filter))); },
    findOne(filter = {}) { return query(documents.find(document => matches(document, filter)) || null); },
    async findOneAndUpdate(filter, update) {
      let document = documents.find(item => matches(item, filter));
      if (!document) {
        document = { ...filter };
        documents.push(document);
      }
      Object.assign(document, update.$set || {});
      return { ...document };
    },
    async updateOne(filter, update) {
      let document = documents.find(item => matches(item, filter));
      if (!document) {
        document = { ...filter };
        documents.push(document);
      }
      Object.assign(document, update.$set || {});
      Object.keys(update.$unset || {}).forEach(key => delete document[key]);
    },
    async deleteOne(filter) {
      const index = documents.findIndex(item => matches(item, filter));
      if (index >= 0) documents.splice(index, 1);
    }
  };
}

function createWorld(groupOverrides = {}) {
  const group = { groupId: 'demo', readingEditPolicy: 'all', amountType: 'sayfa', ...groupOverrides };
  const collections = {
    users: createFakeModel([
      { _id: USER_A, name: 'Ali', visibility: 'aktif' },
      { _id: USER_B, name: 'Zeynep', visibility: 'aktif' }
    ]),
    readingStatuses: createFakeModel([]),
    ceteleEntries: createFakeModel([])
  };
  const UserGroup = {
    findOne: () => query(group),
    findOneAndUpdate(_filter, update) {
      Object.assign(group, update.$set);
      return query(group);
    }
  };
  const { ceteleService } = createCeteleService({
    UserGroup,
    activeUserQuery: () => ({ visibility: { $ne: 'pasif' } }),
    getGroupCollections: () => collections
  });
  return { group, collections, UserGroup, ceteleService };
}

const KURAN = { key: 'kuran', label: 'Kur\'an-ı Kerim', type: 'sayi', unit: 'sayfa', options: [2, 5, 10], step: 1, max: 604, allowCustom: true };
const NAMAZ = { key: 'namaz', label: 'Namaz', type: 'sayi', unit: 'vakit', options: [1, 2, 3, 4, 5], step: 1, max: 5, allowCustom: false };
const HIZMET = { key: 'hizmet', label: 'Hizmet', type: 'sayi', unit: 'saat', options: [0.5, 1, 2], step: 0.5, max: 24, allowCustom: true };
const NOT = { key: 'not', label: 'Not', type: 'metin' };

function multiFieldGroup(overrides = {}) {
  return { ceteleFields: [defaultCeteleFields()[0], KURAN, NAMAZ, HIZMET, NOT], ...overrides };
}

test('varsayılan yapılandırma tek "Kitap okuma" alanıdır ve okuma birimini kullanır', () => {
  const fields = defaultCeteleFields();
  assert.deepEqual(fields.map(field => field.key), ['kitap']);
  assert.equal(fields[0].label, 'Kitap okuma');
  assert.deepEqual(validateCeteleFields(fields).fields, fields);

  const config = getCeteleConfig({});
  assert.equal(config.readField, 'kitap');
  assert.equal(config.fields[0].unit, 'sayfa');
  assert.equal('trackingMode' in config, false);
  assert.equal(getCeteleConfig({ amountType: 'dakika' }).fields[0].unit, 'dakika');
});

test('ilk açık alan okuma alanı olamıyorsa başa Kitap okuma eklenir', () => {
  const config = getCeteleConfig({ ceteleFields: [NAMAZ, KURAN] });
  assert.deepEqual(config.fields.map(field => field.key), ['kitap', 'namaz', 'kuran']);
  assert.equal(config.readField, 'kitap');

  const custom = getCeteleConfig({ ceteleFields: [{ ...KURAN }, NAMAZ] });
  assert.equal(custom.readField, 'kuran');
});

test('alan listesi doğrulanır; ilk alan okuma alanıdır, kaldırılan eski alan arşivlenir', () => {
  const previous = [defaultCeteleFields()[0], KURAN, NAMAZ];
  const result = validateCeteleFields([previous[0], NAMAZ], previous);
  assert.equal(result.error, undefined);
  assert.equal(result.fields.find(field => field.key === 'kuran').archived, true);

  assert.match(validateCeteleFields([NAMAZ, previous[0]]).error, /İlk alışkanlık lig/);
  assert.match(validateCeteleFields([{ ...previous[0], archived: true }, KURAN]).error, /İlk alışkanlık lig/);
  assert.match(validateCeteleFields([HIZMET]).error, /İlk alışkanlık lig/);
  assert.match(validateCeteleFields([previous[0], { ...KURAN }, { ...KURAN }]).error, /Aynı anahtar/);
  assert.match(validateCeteleFields([previous[0], { ...NAMAZ, options: [0, 1, 2, 3, 4, 5, 6, 7, 8], max: 10 }]).error, /en çok 8/);
  assert.match(validateCeteleFields([{ ...previous[0], label: '' }]).error, /Alışkanlık adı/);
  assert.match(validateCeteleFields([previous[0], { ...KURAN, key: 'Kuran!' }]).error, /anahtarı/);
  assert.match(validateCeteleFields([previous[0], { ...KURAN, type: 'metin' }], previous).error, /türü sonradan/);
  assert.match(validateCeteleFields([previous[0], { ...HIZMET, options: [0, 0.3] }]).error, /hızlı seçimleri/);
  assert.match(validateCeteleFields([]).error, /En az bir/);
});

test('kayıt değerleri alan tanımlarına göre temizlenir', () => {
  const { fields } = getCeteleConfig(multiFieldGroup());
  assert.deepEqual(sanitizeEntryValues(fields, {
    kitap: '20', namaz: 5, hizmet: 1.5, not: '  ders  ', bilinmeyen: 3, kuran: ''
  }).values, { kitap: 20, namaz: 5, hizmet: 1.5, not: 'ders' });
  assert.match(sanitizeEntryValues(fields, { namaz: 6 }).error, /Namaz/);
  assert.match(sanitizeEntryValues(fields, { namaz: 0 }).error, /Namaz/);
  assert.match(sanitizeEntryValues(fields, { hizmet: 1.3 }).error, /Hizmet/);
  assert.match(sanitizeEntryValues(fields, { kitap: -1 }).error, /Kitap/);
  assert.match(sanitizeEntryValues(fields, { not: 'x'.repeat(281) }).error, /280/);
  assert.match(sanitizeEntryValues(fields, null).error, /geçersiz/);
  const archived = fields.map(field => (field.key === 'kuran' ? { ...field, archived: true } : field));
  assert.deepEqual(sanitizeEntryValues(archived, { kuran: 5 }).values, {});
});

test('okuma alanının değeri okuma satırına çevrilir', () => {
  assert.deepEqual(readingStatusForEntry('kitap', { kitap: 20 }), { status: 'okudum', amount: 20 });
  assert.deepEqual(readingStatusForEntry('kitap', { kitap: 0 }), { status: 'okumadım', amount: null });
  assert.equal(readingStatusForEntry('kitap', { namaz: 5 }), null);
  assert.equal(readingStatusForEntry(null, { kitap: 20 }), null);
});

test('tarih aralığı varsayılanı 35 gündür ve en çok 400 gün olabilir', () => {
  const options = { isValidDate: value => /^\d{4}-\d{2}-\d{2}$/.test(value), todayKey: '2026-11-27', shiftDateKey };
  assert.deepEqual(parseRange({}, options), { from: '2026-10-24', to: '2026-11-27' });
  assert.match(parseRange({ from: '2025-01-01', to: '2026-11-27' }, options).error, /400/);
  assert.match(parseRange({ from: '2026-11-28', to: '2026-11-27' }, options).error, /Geçersiz/);
});

test('okuma alanı okuma satırına, diğer alanlar çetele kaydına yazılır', async () => {
  const { group, collections, ceteleService } = createWorld(multiFieldGroup());
  const saved = await ceteleService.saveEntry({ group, userId: USER_A, date: '2026-11-27', values: { kitap: 25, namaz: 5 } });
  assert.equal(saved.status, 200);
  assert.equal(saved.readingChanged, true);
  assert.deepEqual(saved.entry.values, { namaz: 5 });
  assert.deepEqual(collections.ceteleEntries.documents[0].values, { namaz: 5 });
  assert.deepEqual(
    { status: collections.readingStatuses.documents[0].status, amount: collections.readingStatuses.documents[0].amount },
    { status: 'okudum', amount: 25 }
  );

  await ceteleService.saveEntry({ group, userId: USER_A, date: '2026-11-27', values: { kitap: 0, namaz: 5 } });
  assert.equal(collections.readingStatuses.documents[0].status, 'okumadım');
  assert.equal('amount' in collections.readingStatuses.documents[0], false);

  // Okuma alanı gövdede yoksa okuma satırına dokunulmaz (ör. yalnız Namaz değişti).
  const untouched = await ceteleService.saveEntry({ group, userId: USER_A, date: '2026-11-27', values: { namaz: 3 } });
  assert.equal(untouched.readingChanged, false);
  assert.equal(collections.readingStatuses.documents.length, 1);

  // Yalnız gönderilen alanlar güncellenir; diğerleri korunur.
  const merged = await ceteleService.saveEntry({ group, userId: USER_A, date: '2026-11-27', values: { kuran: 4 } });
  assert.deepEqual(merged.entry.values, { namaz: 3, kuran: 4 });
  await ceteleService.saveEntry({ group, userId: USER_A, date: '2026-11-27', values: { kitap: 12 } });
  assert.deepEqual(collections.ceteleEntries.documents[0].values, { namaz: 3, kuran: 4 });

  // null gönderilen alan silinir; hiç değer kalmayınca iki kayıt da kalkar.
  await ceteleService.saveEntry({ group, userId: USER_A, date: '2026-11-27', values: { kitap: null, namaz: null, kuran: null } });
  assert.equal(collections.ceteleEntries.documents.length, 0);
  assert.equal(collections.readingStatuses.documents.length, 0);

  const missing = await ceteleService.saveEntry({ group, userId: '64b0000000000000000000ff', date: '2026-11-27', values: { kitap: 1 } });
  assert.equal(missing.status, 404);
});

test('tek alanlı grupta kayıt yalnız okuma satırı üretir', async () => {
  const { group, collections, ceteleService } = createWorld();
  const saved = await ceteleService.saveEntry({ group, userId: USER_A, date: '2026-11-27', values: { kitap: 10 } });
  assert.equal(saved.entry, null);
  assert.equal(collections.ceteleEntries.documents.length, 0);
  assert.equal(collections.readingStatuses.documents[0].amount, 10);
});

test('her üye gruptaki herkesin okuma dışı alan değerlerini görür', async () => {
  const { group, collections, ceteleService } = createWorld(multiFieldGroup());
  collections.ceteleEntries.documents.push(
    { userId: USER_A, date: '2026-11-27', values: { namaz: 5, kitap: 9 } },
    { userId: USER_B, date: '2026-11-27', values: { namaz: 3 } },
    { userId: USER_B, date: '2026-11-26', values: { kitap: 4 } }
  );
  const view = await ceteleService.listEntries({ group, from: '2026-11-01', to: '2026-11-27' });
  assert.equal(Object.hasOwn(view, 'canViewAll'), false);
  // Okuma alanının (eski) değeri listede yer almaz; kaynağı okuma satırlarıdır.
  assert.deepEqual(view.entries.find(entry => entry.userId === USER_A).values, { namaz: 5 });
  assert.deepEqual(view.entries.find(entry => entry.userId === USER_B && entry.date === '2026-11-27').values, { namaz: 3 });
  assert.equal(view.entries.length, 2);
});

test('alan ayarı kaydedilir ve okuma birimi ilk alanın birimine eşitlenir', async () => {
  const { group, ceteleService } = createWorld({ amountType: 'sayfa' });
  const reading = { ...defaultCeteleFields()[0], unit: 'dakika', label: 'Risale-i Nur' };
  const result = await ceteleService.updateConfig({ group, body: { fields: [reading, KURAN] } });
  assert.equal(result.status, 200);
  assert.deepEqual(group.ceteleFields.map(field => field.key), ['kitap', 'kuran']);
  assert.equal(group.amountType, 'dakika');
  assert.equal(result.config.readField, 'kitap');

  // Listeden çıkarılan alan arşivlenir; geçmiş kayıtları anlamını korur.
  await ceteleService.updateConfig({ group, body: { fields: [reading] } });
  assert.equal(group.ceteleFields.find(field => field.key === 'kuran').archived, true);

  assert.equal((await ceteleService.updateConfig({ group, body: { fields: [KURAN, HIZMET] } })).status, 200);
  assert.equal((await ceteleService.updateConfig({ group, body: { fields: [HIZMET] } })).status, 400);
  assert.equal((await ceteleService.updateConfig({ group, body: {} })).status, 400);
});

function createFakeApp() {
  const routes = new Map();
  const register = method => (routePath, ...handlers) => routes.set(`${method} ${routePath}`, handlers);
  return { routes, get: register('GET'), put: register('PUT'), delete: register('DELETE'), post: register('POST') };
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader(name, value) { this.headers[name] = value; }
  };
}

async function callRoute(app, key, req) {
  const handlers = app.routes.get(key);
  const res = createResponse();
  // Yetki ara katmanlarını atla; req.auth testte verilir.
  await handlers.at(-1)(req, res);
  return res;
}

function registerWithWorld(world) {
  const app = createFakeApp();
  const passthrough = (_req, _res, next) => next();
  registerCeteleRoutes(app, {
    UserGroup: world.UserGroup,
    ceteleService: world.ceteleService,
    isReadingDateAllowedByPolicy: readingEditPolicy.isReadingDateAllowedByPolicy,
    isValidReadingDate: value => /^\d{4}-\d{2}-\d{2}$/.test(String(value)),
    istanbulDateKey: () => '2026-11-27',
    istanbulYesterdayKey: () => '2026-11-26',
    normalizeReadingEditPolicy: readingEditPolicy.normalizeReadingEditPolicy,
    requireGroupAdmin: passthrough,
    requireGroupAuth: passthrough,
    requireSelfOrAdmin: passthrough,
    shiftDateKey
  });
  return app;
}

test('çetele rotaları her grupta çalışır; tarih ve düzenleme aralığını denetler', async () => {
  const world = createWorld({ readingEditPolicy: 'today' });
  const app = registerWithWorld(world);
  assert.ok(app.routes.has('GET /api/cetele/:groupId'));
  assert.ok(app.routes.has('PUT /api/cetele/:groupId/config'));
  assert.equal(app.routes.has('GET /api/cetele/:groupId/summary'), false);
  const member = { userId: USER_A, authority: 'member' };

  // Hiç alan ayarı yapılmamış (eski okuma) grubunda da okuma girilebilir.
  const saved = await callRoute(app, 'PUT /api/cetele/:groupId/entry', {
    params: { groupId: 'demo' }, auth: member, body: { userId: USER_A, date: '2026-11-27', values: { kitap: 20 } }
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.body.readingChanged, true);
  assert.deepEqual(saved.body.reading, { status: 'okudum', amount: 20 });

  const restricted = await callRoute(app, 'PUT /api/cetele/:groupId/entry', {
    params: { groupId: 'demo' }, auth: member, body: { userId: USER_A, date: '2026-11-26', values: { kitap: 5 } }
  });
  assert.equal(restricted.statusCode, 403);
  assert.equal(restricted.body.code, 'READING_EDIT_DATE_RESTRICTED');

  const admin = await callRoute(app, 'PUT /api/cetele/:groupId/entry', {
    params: { groupId: 'demo' }, auth: { userId: USER_B, authority: 'admin' }, body: { userId: USER_A, date: '2026-11-20', values: { kitap: 5 } }
  });
  assert.equal(admin.statusCode, 200);

  const badUser = await callRoute(app, 'PUT /api/cetele/:groupId/entry', {
    params: { groupId: 'demo' }, auth: member, body: { userId: 'x', date: '2026-11-27', values: {} }
  });
  assert.equal(badUser.statusCode, 400);

  const config = await callRoute(app, 'PUT /api/cetele/:groupId/config', {
    params: { groupId: 'demo' }, auth: { userId: USER_B, authority: 'admin' },
    body: { fields: [defaultCeteleFields()[0], KURAN] }
  });
  assert.equal(config.statusCode, 200);
  assert.deepEqual(config.body.config.fields.map(field => field.key), ['kitap', 'kuran']);
});

test('zorunlu alan: alan tanımında korunur, arşivlenince kalkar', () => {
  const read = defaultCeteleFields()[0];
  const result = validateCeteleFields([{ ...read, required: true }, { ...KURAN, required: true }, NAMAZ], [read]);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.fields.map(field => [field.key, field.required]), [['kitap', true], ['kuran', true], ['namaz', false]]);

  const archived = validateCeteleFields([read, NAMAZ], result.fields);
  assert.equal(archived.fields.find(field => field.key === 'kuran').required, false);
  assert.equal(archived.fields.find(field => field.key === 'kuran').archived, true);
  // required yalnız true değeriyle açılır.
  assert.equal(validateCeteleFields([{ ...read, required: 'evet' }]).fields[0].required, false);
});

test('zorunlu alan boş bırakılırsa gün kaydedilemez; boş gün (temizleme) serbesttir', async () => {
  const group = multiFieldGroup();
  group.ceteleFields = [defaultCeteleFields()[0], { ...KURAN, required: true }, NAMAZ];
  const { collections, ceteleService } = createWorld(group);
  const base = { group, userId: USER_A, date: '2026-11-27' };

  const blocked = await ceteleService.saveEntry({ ...base, values: { kitap: 20 } });
  assert.equal(blocked.status, 400);
  assert.equal(blocked.code, 'REQUIRED_FIELDS_MISSING');
  assert.match(blocked.error, /Kur'an-ı Kerim/);
  assert.equal(collections.readingStatuses.documents.length, 0);
  assert.equal(collections.ceteleEntries.documents.length, 0);

  const saved = await ceteleService.saveEntry({ ...base, values: { kitap: 20, kuran: 5 } });
  assert.equal(saved.status, 200);

  // Kayıtlı zorunlu alan silinip başka alan duruyorsa reddedilir.
  const removed = await ceteleService.saveEntry({ ...base, values: { kuran: null } });
  assert.equal(removed.status, 400);
  assert.equal(collections.ceteleEntries.documents[0].values.kuran, 5);

  // Kayıtlı değerler korunduğu için yalnız başka alan değişince zorunlu denetim geçer.
  const partial = await ceteleService.saveEntry({ ...base, values: { namaz: 3 } });
  assert.equal(partial.status, 200);

  // Tüm alanlar birlikte temizlenirse gün silinir.
  const cleared = await ceteleService.saveEntry({ ...base, values: { kitap: null, kuran: null, namaz: null } });
  assert.equal(cleared.status, 200);
  assert.equal(collections.readingStatuses.documents.length, 0);
  assert.equal(collections.ceteleEntries.documents.length, 0);
});

test('okuma alanı zorunluyken 0 ("Okumadım") dolu sayılır', async () => {
  const group = multiFieldGroup();
  group.ceteleFields = [{ ...defaultCeteleFields()[0], required: true }, NAMAZ];
  const { ceteleService } = createWorld(group);
  const base = { group, userId: USER_A, date: '2026-11-27' };
  assert.equal((await ceteleService.saveEntry({ ...base, values: { namaz: 2 } })).status, 400);
  assert.equal((await ceteleService.saveEntry({ ...base, values: { kitap: 0, namaz: 2 } })).status, 200);
});

test('"Yapmadım" seçeneği (zeroLabel) olan alışkanlıkta 0 değeri kabul edilir, olmayanda hızlı seçim dışı sayılır', () => {
  const withZero = { ...NAMAZ, zeroLabel: 'Kılmadım', required: true };
  const validated = validateCeteleFields([defaultCeteleFields()[0], withZero]);
  assert.equal(validated.error, undefined);
  assert.equal(validated.fields[1].zeroLabel, 'Kılmadım');
  assert.deepEqual(sanitizeEntryValues(validated.fields, { namaz: 0 }).values, { namaz: 0 });
  assert.match(sanitizeEntryValues([defaultCeteleFields()[0], NAMAZ], { namaz: 0 }).error, /hızlı seçimlerden/);
  assert.match(validateCeteleFields([defaultCeteleFields()[0], { ...NAMAZ, zeroLabel: 'x'.repeat(21) }]).error, /en çok 20 karakter/);
  assert.equal(validateCeteleFields([defaultCeteleFields()[0], { ...NAMAZ, zeroLabel: '  Kılmadım  ' }]).fields[1].zeroLabel, 'Kılmadım');
});
