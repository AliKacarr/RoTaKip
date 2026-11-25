'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createIlahiService } = require('../../../src/server/modules/inspiration/ilahi.service');
const {
  extractYoutubeVideoId,
  parseIsoDurationSeconds
} = require('../../../src/server/shared/youtube-links');
const { buildIlahiDocument, chunk, readVideoIds } = require('../../../scripts/import-ilahiler');

test('YouTube bağlantılarından video kimliği ayıklanır', () => {
  assert.equal(extractYoutubeVideoId('https://youtu.be/-dEsKKKflOk?si=y54pQ9V7AUt4EjOq'), '-dEsKKKflOk');
  assert.equal(extractYoutubeVideoId('https://www.youtube.com/watch?v=DUPkB8799Ao&list=PL1'), 'DUPkB8799Ao');
  assert.equal(extractYoutubeVideoId('https://m.youtube.com/shorts/DUPkB8799Ao'), 'DUPkB8799Ao');
  assert.equal(extractYoutubeVideoId('youtube.com/embed/DUPkB8799Ao'), 'DUPkB8799Ao');
  assert.equal(extractYoutubeVideoId('youtu.be/DUPkB8799Ao'), 'DUPkB8799Ao');
  assert.equal(extractYoutubeVideoId('https://www.youtube.com/live/DUPkB8799Ao?feature=share'), 'DUPkB8799Ao');
});

test('geçersiz ya da YouTube dışı bağlantılar reddedilir', () => {
  assert.equal(extractYoutubeVideoId(''), null);
  assert.equal(extractYoutubeVideoId(undefined), null);
  assert.equal(extractYoutubeVideoId('https://example.com/watch?v=DUPkB8799Ao'), null);
  assert.equal(extractYoutubeVideoId('https://evilyoutube.com/watch?v=DUPkB8799Ao'), null);
  assert.equal(extractYoutubeVideoId('javascript:alert(1)'), null);
  assert.equal(extractYoutubeVideoId('https://www.youtube.com/watch?v=kisa'), null);
  assert.equal(extractYoutubeVideoId('https://www.youtube.com/@kanal'), null);
  assert.equal(extractYoutubeVideoId(`https://youtu.be/${'a'.repeat(400)}`), null);
  // Çıplak kimlik yalnız açıkça istenirse kabul edilir.
  assert.equal(extractYoutubeVideoId('DUPkB8799Ao'), null);
  assert.equal(extractYoutubeVideoId('DUPkB8799Ao', { allowBareId: true }), 'DUPkB8799Ao');
});

test('ISO 8601 süreler saniyeye çevrilir', () => {
  assert.equal(parseIsoDurationSeconds('PT4M5S'), 245);
  assert.equal(parseIsoDurationSeconds('PT1H2M3S'), 3723);
  assert.equal(parseIsoDurationSeconds('PT45S'), 45);
  assert.equal(parseIsoDurationSeconds('P1DT1S'), 86401);
  assert.equal(parseIsoDurationSeconds('P0D'), 0);
  assert.equal(parseIsoDurationSeconds('saçma'), 0);
  assert.equal(parseIsoDurationSeconds(undefined), 0);
});

function createFakeCollections(initial = {}) {
  const data = { ilahiler: [], ilahi_onerileri: [], ...initial };
  const calls = { find: 0, updates: [] };
  return {
    data,
    calls,
    getCollection: async name => ({
      find(filter, options) {
        calls.find += 1;
        calls.lastFilter = filter;
        calls.lastProjection = options.projection;
        let documents = data[name].filter(document => document.aktif === true);
        return {
          sort(order) {
            calls.lastSort = order;
            return this;
          },
          limit(value) {
            documents = documents.slice(0, value);
            return this;
          },
          toArray: async () => documents.map(document => ({ ...document }))
        };
      },
      findOne: async filter => data[name].find(document => document.videoId === filter.videoId) || null,
      updateOne: async (filter, update, options) => {
        calls.updates.push({ name, filter, update, options });
      }
    })
  };
}

test('ilahi listesi yalnız gerekli alanlarla, bozuk kayıtlar ayıklanarak ve önbellekli döner', async () => {
  let currentTime = 1000;
  const fake = createFakeCollections({
    ilahiler: [
      { videoId: 'DUPkB8799Ao', baslik: ' İlahi 1 ', kanalAdi: ' Kanal ', sureSaniye: 245, aktif: true, gizli: 'x' },
      { videoId: 'aaaaaaaaaaa', baslik: '   ', kanalAdi: 'Kanal', sureSaniye: 100, aktif: true },
      { videoId: 'bbbbbbbbbbb', baslik: 'Pasif', sureSaniye: 100, aktif: false }
    ]
  });
  const service = createIlahiService({ getCollection: fake.getCollection, now: () => currentTime, cacheTtlMs: 500 });

  const items = await service.listTefekkurIlahiler();
  assert.deepEqual(items, [{ videoId: 'DUPkB8799Ao', baslik: 'İlahi 1', kanalAdi: 'Kanal', sureSaniye: 245 }]);
  assert.equal(fake.calls.lastFilter.aktif, true);

  await service.listTefekkurIlahiler();
  assert.equal(fake.calls.find, 1);

  currentTime += 501;
  await service.listTefekkurIlahiler();
  assert.equal(fake.calls.find, 2);
});

test('ilahi önerisi video kimliğiyle saklanır, tekrarında sayaç artar, listedekiler atlanır', async () => {
  const fake = createFakeCollections({
    ilahiler: [{ videoId: 'DUPkB8799Ao', baslik: 'Var', sureSaniye: 10, aktif: true }]
  });
  const service = createIlahiService({ getCollection: fake.getCollection, now: () => Date.UTC(2026, 10, 25) });

  assert.deepEqual(await service.submitTefekkurIlahiOnerisi('https://example.com/x'), { ok: false, reason: 'invalid' });
  assert.equal(fake.calls.updates.length, 0);

  const existing = await service.submitTefekkurIlahiOnerisi('https://youtu.be/DUPkB8799Ao');
  assert.deepEqual(existing, { ok: true, videoId: 'DUPkB8799Ao', existing: true });
  assert.equal(fake.calls.updates.length, 0);

  const result = await service.submitTefekkurIlahiOnerisi('https://youtu.be/-dEsKKKflOk?si=abc');
  assert.deepEqual(result, { ok: true, videoId: '-dEsKKKflOk', existing: false });
  const [update] = fake.calls.updates;
  assert.equal(update.name, 'ilahi_onerileri');
  assert.deepEqual(update.filter, { videoId: '-dEsKKKflOk' });
  assert.deepEqual(update.update.$inc, { oneriSayisi: 1 });
  assert.equal(update.update.$setOnInsert.url, 'https://youtu.be/-dEsKKKflOk');
  assert.equal(update.update.$setOnInsert.durum, 'beklemede');
  assert.equal(update.options.upsert, true);
});

test('ilahi bildirimi yalnız listedeki ilahi ve izinli sebeple kaydedilir, tekrarında sayaç artar', async () => {
  const fake = createFakeCollections({
    ilahiler: [{ videoId: 'DUPkB8799Ao', baslik: 'Var', sureSaniye: 10, aktif: true }]
  });
  const service = createIlahiService({ getCollection: fake.getCollection, now: () => Date.UTC(2026, 10, 25) });

  assert.deepEqual(await service.reportTefekkurIlahi('kisa', 'acilmiyor'), { ok: false, reason: 'invalid' });
  assert.deepEqual(await service.reportTefekkurIlahi('DUPkB8799Ao', 'saçma'), { ok: false, reason: 'invalid' });
  assert.deepEqual(await service.reportTefekkurIlahi('DUPkB8799Ao', undefined), { ok: false, reason: 'invalid' });
  assert.deepEqual(await service.reportTefekkurIlahi('-dEsKKKflOk', 'kalite'), { ok: false, reason: 'unknown' });
  assert.equal(fake.calls.updates.length, 0);

  assert.deepEqual(await service.reportTefekkurIlahi('DUPkB8799Ao', 'uygunsuz'), { ok: true, videoId: 'DUPkB8799Ao' });
  const [update] = fake.calls.updates;
  assert.equal(update.name, 'ilahi_bildirimleri');
  assert.deepEqual(update.filter, { videoId: 'DUPkB8799Ao' });
  assert.deepEqual(update.update.$inc, { bildirimSayisi: 1, 'sebepler.uygunsuz': 1 });
  assert.equal(update.update.$setOnInsert.durum, 'beklemede');
  assert.equal(update.options.upsert, true);
});

test('içe aktarma betiği YouTube öğesini koleksiyon belgesine çevirir', () => {
  const playable = buildIlahiDocument({
    id: 'DUPkB8799Ao',
    snippet: { title: ' İlahi ', channelTitle: ' Kanal ' },
    contentDetails: { duration: 'PT4M5S' },
    status: { embeddable: true, privacyStatus: 'public' }
  });
  assert.deepEqual(playable, {
    videoId: 'DUPkB8799Ao',
    baslik: 'İlahi',
    kanalAdi: 'Kanal',
    sureSaniye: 245,
    gomulebilir: true,
    aktif: true
  });

  const base = { id: 'aaaaaaaaaaa', snippet: { title: 'x' }, contentDetails: { duration: 'PT1M' } };
  assert.equal(buildIlahiDocument({ ...base, status: { embeddable: false, privacyStatus: 'public' } }).aktif, false);
  assert.equal(buildIlahiDocument({ ...base, status: { embeddable: true, privacyStatus: 'private' } }).aktif, false);
  assert.equal(buildIlahiDocument({ ...base, contentDetails: { duration: 'P0D' }, status: { embeddable: true, privacyStatus: 'public' } }).aktif, false);
});

test('içe aktarma betiği bağlantı dosyasını okur: yorum, tekrar ve geçersiz satırlar ayıklanır', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ilahi-'));
  const file = path.join(dir, 'linkler.txt');
  fs.writeFileSync(file, [
    '# yorum',
    '',
    'https://youtu.be/-dEsKKKflOk?si=abc',
    'https://www.youtube.com/watch?v=-dEsKKKflOk',
    'DUPkB8799Ao',
    'https://example.com/degil'
  ].join('\r\n'));
  try {
    const { ids, invalid } = readVideoIds(file);
    assert.deepEqual(ids, ['-dEsKKKflOk', 'DUPkB8799Ao']);
    assert.deepEqual(invalid, ['https://example.com/degil']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});
