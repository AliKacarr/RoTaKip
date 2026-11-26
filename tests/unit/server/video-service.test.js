'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FEED_DEFAULT_LIMIT,
  SUBSCRIBED_SHARE,
  createVideoService,
  parseChannelList,
  parseCursor,
  parseExcludedChannels,
  parseFeedCursor,
  resizeChannelLogo,
  toPublicVideo
} = require('../../../src/server/modules/content/video.service');
const { registerVideoRoutes } = require('../../../src/server/modules/content/video.routes');

const CHANNEL_A = 'UCaaaaaaaaaaaaaaaaaaaaaa';
const CHANNEL_B = 'UCbbbbbbbbbbbbbbbbbbbbbb';
const CHANNEL_C = 'UCcccccccccccccccccccccc';

// Servisin kullandığı sorgu işleçlerinin küçük bir taklidi ($and, $or, $type, $ne, $in, $nin, $lt, $gt).
function matchesCondition(value, condition) {
  if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
    return Object.entries(condition).every(([operator, expected]) => {
      switch (operator) {
        case '$type':
          return expected === 'date' ? value instanceof Date : typeof value === expected;
        case '$ne':
          return value !== expected;
        case '$in':
          return expected.includes(value);
        case '$nin':
          return !expected.includes(value);
        case '$lt':
          return value < expected;
        case '$gt':
          return value > expected;
        default:
          throw new Error(`Desteklenmeyen işleç: ${operator}`);
      }
    });
  }
  if (condition instanceof Date) return value instanceof Date && value.getTime() === condition.getTime();
  return value === condition;
}

function matches(document, filter) {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === '$and') return condition.every(part => matches(document, part));
    if (key === '$or') return condition.some(part => matches(document, part));
    return matchesCondition(document[key], condition);
  });
}

function createFakeDb(videos, channels) {
  const calls = { find: 0, findOne: 0, filters: [] };
  function sortVideos(list) {
    return [...list].sort((left, right) =>
      right.yuklenmeTarihi - left.yuklenmeTarihi || (left.videoId < right.videoId ? 1 : -1));
  }
  const collections = {
    videolar: {
      find(filter) {
        calls.find += 1;
        calls.filters.push(filter);
        let limit = Infinity;
        return {
          sort() { return this; },
          limit(value) { limit = value; return this; },
          async toArray() {
            return sortVideos(videos.filter(document => matches(document, filter))).slice(0, limit);
          }
        };
      },
      async findOne(filter) {
        calls.findOne += 1;
        return videos.find(document => matches(document, filter)) || null;
      }
    },
    video_channels: {
      find() {
        return { async toArray() { return channels; } };
      }
    }
  };
  return { calls, getCollection: async name => collections[name] };
}

function makeVideo(index, overrides = {}) {
  return {
    videoId: `vid${String(index).padStart(8, '0')}`,
    baslik: `Video ${index}`,
    kanalId: index % 2 ? CHANNEL_A : CHANNEL_B,
    kanalAdi: index % 2 ? 'Kanal A' : 'Kanal B',
    sureSaniye: 120 + index,
    izlenmeSayisi: 1000 + index,
    videoTuru: 'video',
    yuklenmeTarihi: new Date(Date.UTC(2026, 0, 1) + index * 60 * 1000),
    ...overrides
  };
}

const CHANNELS = [
  { kanalId: CHANNEL_B, kanalAdi: 'Zeytin ', kanalHandle: ' zeytin ', kanalLogoUrl: 'https://yt3.ggpht.com/x=s800-c-k-c0x00ffffff-no-rj' },
  { kanalId: CHANNEL_A, kanalAdi: 'Çınar', kanalHandle: '@cinar', kanalLogoUrl: 'http://guvensiz' },
  { kanalId: 'gecersiz', kanalAdi: 'Bozuk' }
];

test('video dokümanı istemci biçimine çevrilir, süresiz kayıt canlı sayılır', () => {
  const video = toPublicVideo(makeVideo(3, { sureSaniye: 0, videoTuru: 'shorts', baslik: '  Başlık ' }));
  assert.deepEqual(video, {
    id: 'vid00000003',
    title: 'Başlık',
    channelId: CHANNEL_A,
    channelName: 'Kanal A',
    publishedAt: '2026-01-01T00:03:00.000Z',
    views: 1003,
    duration: 0,
    type: 'shorts',
    isLive: true
  });
});

test('kanal logosu avatar boyutuna küçültülür, https olmayan adres atılır', () => {
  assert.equal(
    resizeChannelLogo('https://yt3.ggpht.com/abc=s800-c-k-c0x00ffffff-no-rj'),
    'https://yt3.ggpht.com/abc=s88-c-k-c0x00ffffff-no-rj'
  );
  assert.equal(resizeChannelLogo('https://yt3.ggpht.com/abc=s240'), 'https://yt3.ggpht.com/abc=s88');
  assert.equal(resizeChannelLogo('http://example.com/logo.png'), '');
  assert.equal(resizeChannelLogo(undefined), '');
});

test('önerilmeyen / abone olunan kanal listesi yalnız geçerli kimlikleri sıralı ve tekil tutar', () => {
  assert.deepEqual(parseExcludedChannels(`${CHANNEL_B}, ${CHANNEL_A},${CHANNEL_B},kotu,`), [CHANNEL_A, CHANNEL_B]);
  assert.deepEqual(parseExcludedChannels(['dizi']), []);
  assert.deepEqual(parseExcludedChannels({ $ne: 'x' }), []);
  assert.equal(parseChannelList, parseExcludedChannels);
  const many = Array.from({ length: 250 }, (_, index) => `UC${String(index).padStart(22, '0')}`).join(',');
  assert.equal(parseChannelList(many).length, 200);
});

test('karışık akış imleci iki parçalıdır; düz cursor iki akışın ortak başlangıcı olur', () => {
  const start = parseFeedCursor(undefined);
  assert.equal(start.subscribed.cursor, null);
  assert.equal(start.others.done, false);
  const plain = parseFeedCursor('1700000000000_vid00000001');
  assert.deepEqual(plain.subscribed.cursor, plain.others.cursor);
  const mixed = parseFeedCursor('end~1700000000000_vid00000001');
  assert.equal(mixed.subscribed.done, true);
  assert.equal(mixed.others.cursor.videoId, 'vid00000001');
  assert.equal(parseFeedCursor('~').subscribed.done, false);
  assert.equal(parseFeedCursor('bozuk~'), false);
  assert.equal(parseFeedCursor(['~']), false);
});

test('cursor biçimi doğrulanır', () => {
  assert.equal(parseCursor(undefined), null);
  assert.equal(parseCursor('abc'), false);
  assert.equal(parseCursor(['1_vid00000001']), false);
  assert.deepEqual(parseCursor('1700000000000_vid00000001'), {
    date: new Date(1700000000000),
    videoId: 'vid00000001'
  });
});

test('akış en yeniden eskiye cursor ile tekrarsız sayfalanır', async () => {
  const videos = Array.from({ length: 30 }, (_, index) => makeVideo(index + 1));
  const db = createFakeDb(videos, CHANNELS);
  const service = createVideoService({ getCollection: db.getCollection });

  const seen = [];
  let before;
  let pages = 0;
  do {
    const page = await service.listFeed({ type: 'video', before, limit: '7' });
    seen.push(...page.videos.map(video => video.id));
    before = page.nextCursor;
    assert.equal(page.hasMore, Boolean(page.nextCursor));
    pages += 1;
  } while (before);

  assert.equal(pages, 5);
  assert.equal(seen.length, 30);
  assert.equal(new Set(seen).size, 30);
  assert.equal(seen[0], 'vid00000030');
  assert.equal(seen.at(-1), 'vid00000001');
});

test('aynı tarihli videolar videoId ile ayrışır ve atlanmaz', async () => {
  const sameDate = new Date(Date.UTC(2026, 5, 1));
  const videos = Array.from({ length: 5 }, (_, index) => makeVideo(index + 1, { yuklenmeTarihi: sameDate }));
  const service = createVideoService({ getCollection: createFakeDb(videos, CHANNELS).getCollection });
  const first = await service.listFeed({ type: 'video', limit: 2 });
  const second = await service.listFeed({ type: 'video', limit: 2, before: first.nextCursor });
  const third = await service.listFeed({ type: 'video', limit: 2, before: second.nextCursor });
  const ids = [...first.videos, ...second.videos, ...third.videos].map(video => video.id);
  assert.deepEqual(ids, ['vid00000005', 'vid00000004', 'vid00000003', 'vid00000002', 'vid00000001']);
  assert.equal(third.hasMore, false);
});

test('akış türü, kanal hariç tutma ve geçersiz kayıtları uygular', async () => {
  const videos = [
    makeVideo(1),
    makeVideo(2),
    makeVideo(3, { videoTuru: 'shorts' }),
    makeVideo(4, { videoId: '' }),
    makeVideo(5, { yuklenmeTarihi: null }),
    makeVideo(6, { sureSaniye: 0 })
  ];
  const service = createVideoService({ getCollection: createFakeDb(videos, CHANNELS).getCollection });

  const page = await service.listFeed({ type: 'video', exclude: CHANNEL_B });
  assert.deepEqual(page.videos.map(video => video.id), ['vid00000001']);
  const shorts = await service.listFeed({ type: 'shorts' });
  assert.deepEqual(shorts.videos.map(video => video.id), ['vid00000003']);
  const channelPage = await service.listFeed({ type: 'video', channel: CHANNEL_B, exclude: CHANNEL_B });
  assert.deepEqual(channelPage.videos.map(video => video.id), ['vid00000002']);
  assert.equal(await service.listFeed({ type: 'video', channel: 'UCkisa' }), null);
  assert.equal(await service.listFeed({ type: 'canli' }), null);
  assert.equal(await service.listFeed({ type: 'video', before: 'bozuk' }), null);
});

test('abone olunan kanallar sayfanın çoğunu doldurur, biri bitince diğeri tamamlar ve hiçbir video atlanmaz', async () => {
  // 30 video: tekler Kanal A, çiftler Kanal B. Yalnız A'ya abone olunur.
  const videos = Array.from({ length: 30 }, (_, index) => makeVideo(index + 1));
  const service = createVideoService({ getCollection: createFakeDb(videos, CHANNELS).getCollection });

  const first = await service.listFeed({ type: 'video', include: CHANNEL_A, limit: 10 });
  const fromA = first.videos.filter(video => video.channelId === CHANNEL_A).length;
  assert.equal(fromA, Math.round(10 * SUBSCRIBED_SHARE), 'sayfanın SUBSCRIBED_SHARE kadarı abone olunan kanaldan gelmeli');
  assert.equal(first.videos.length, 10);
  assert.match(first.nextCursor, /^\d+_vid\d{8}~\d+_vid\d{8}$/);
  const times = first.videos.map(video => Date.parse(video.publishedAt));
  assert.deepEqual(times, [...times].sort((left, right) => right - left), 'sayfa en yeniden eskiye sıralı');

  const seen = [...first.videos.map(video => video.id)];
  let before = first.nextCursor;
  while (before) {
    const page = await service.listFeed({ type: 'video', include: CHANNEL_A, before, limit: 10 });
    seen.push(...page.videos.map(video => video.id));
    before = page.nextCursor;
  }
  assert.equal(seen.length, 30);
  assert.equal(new Set(seen).size, 30);
});

test('önerilmeyen kanal abonelikte olsa da gösterilmez; abonelik kaydırırken değişirse eski cursor kabul edilir', async () => {
  const videos = [
    ...Array.from({ length: 6 }, (_, index) => makeVideo(index + 1)),
    makeVideo(7, { kanalId: CHANNEL_C, kanalAdi: 'Kanal C' }),
    makeVideo(8, { kanalId: CHANNEL_C, kanalAdi: 'Kanal C' })
  ];
  const service = createVideoService({ getCollection: createFakeDb(videos, CHANNELS).getCollection });

  const page = await service.listFeed({ type: 'video', include: `${CHANNEL_A},${CHANNEL_C}`, exclude: CHANNEL_C, limit: 24 });
  assert.equal(page.videos.some(video => video.channelId === CHANNEL_C), false);
  assert.equal(page.videos.length, 6);

  // Düz cursor + abonelik: iki akış aynı noktadan devam eder.
  const plainFirst = await service.listFeed({ type: 'video', limit: 3 });
  const afterSubscribe = await service.listFeed({ type: 'video', include: CHANNEL_A, before: plainFirst.nextCursor, limit: 24 });
  const plainIds = new Set(plainFirst.videos.map(video => video.id));
  assert.equal(afterSubscribe.videos.some(video => plainIds.has(video.id)), false);
  assert.equal(afterSubscribe.videos.length, 5);

  // Karışık cursor + abonelik yok: bitmemiş parçaların en yenisinden tek akış sürer.
  const mixedFirst = await service.listFeed({ type: 'video', include: CHANNEL_A, limit: 3 });
  const afterUnsubscribe = await service.listFeed({ type: 'video', before: mixedFirst.nextCursor, limit: 24 });
  const allIds = new Set([...mixedFirst.videos, ...afterUnsubscribe.videos].map(video => video.id));
  assert.equal(allIds.size, 8, 'tekrar olabilir ama video kaybolmamalı');
  assert.deepEqual(await service.listFeed({ type: 'video', before: 'end~end' }), { videos: [], hasMore: false, nextCursor: null });
});

test('süresi olmayan canlı yayın kayıtları akışta ve ayrıntıda gösterilmez', async () => {
  const videos = [makeVideo(1), makeVideo(2, { sureSaniye: 0 })];
  const service = createVideoService({ getCollection: createFakeDb(videos, CHANNELS).getCollection });

  const page = await service.listFeed({ type: 'video' });
  assert.deepEqual(page.videos.map(video => video.id), ['vid00000001']);
  assert.equal((await service.getVideoDetail('vid00000002')).video, null);
});

test('limit varsayılana döner ve üst sınıra sıkıştırılır', async () => {
  const videos = Array.from({ length: 40 }, (_, index) => makeVideo(index + 1));
  const service = createVideoService({ getCollection: createFakeDb(videos, CHANNELS).getCollection });
  assert.equal((await service.listFeed({ type: 'video' })).videos.length, FEED_DEFAULT_LIMIT);
  assert.equal((await service.listFeed({ type: 'video', limit: '999' })).videos.length, 24);
  assert.equal((await service.listFeed({ type: 'video', limit: '0' })).videos.length, 1);
});

test('ana akış kanalları, videoları ve shortsları birlikte hazırlar ve önbelleğe alır', async () => {
  let time = 0;
  const videos = [makeVideo(1), makeVideo(2), makeVideo(3, { videoTuru: 'shorts' })];
  const db = createFakeDb(videos, CHANNELS);
  const service = createVideoService({ getCollection: db.getCollection, now: () => time, feedCacheTtlMs: 1000 });

  const home = await service.getHome({});
  assert.deepEqual(home.channels.map(channel => channel.name), ['Çınar', 'Zeytin']);
  assert.equal(home.channels[0].logo, '');
  assert.deepEqual(home.channels.map(channel => channel.handle), ['@cinar', '@zeytin']);
  assert.equal(home.channels[1].logo, 'https://yt3.ggpht.com/x=s88-c-k-c0x00ffffff-no-rj');
  assert.deepEqual(home.videos.videos.map(video => video.id), ['vid00000002', 'vid00000001']);
  assert.deepEqual(home.shorts.videos.map(video => video.id), ['vid00000003']);
  assert.equal(home.videos.hasMore, false);

  const findCalls = db.calls.find;
  await service.getHome({});
  assert.equal(db.calls.find, findCalls, 'süre dolmadan tekrar sorgulanmamalı');

  time = 2000;
  await service.getHome({});
  assert.ok(db.calls.find > findCalls, 'süre dolunca yeniden sorgulanmalı');
});

test('hatalı yükleme önbellekte kalmaz', async () => {
  let fail = true;
  const db = createFakeDb([makeVideo(1)], CHANNELS);
  const service = createVideoService({
    getCollection: async name => {
      if (fail) throw new Error('geçici hata');
      return db.getCollection(name);
    }
  });
  await assert.rejects(service.listFeed({ type: 'video' }), /geçici hata/);
  fail = false;
  assert.equal((await service.listFeed({ type: 'video' })).videos.length, 1);
});

test('video ayrıntısı önce aynı kanalı sonra en yenileri tekrarsız döner', async () => {
  const videos = Array.from({ length: 20 }, (_, index) => makeVideo(index + 1));
  const service = createVideoService({ getCollection: createFakeDb(videos, CHANNELS).getCollection });

  const detail = await service.getVideoDetail('vid00000005');
  assert.equal(detail.video.id, 'vid00000005');
  assert.equal(detail.related.length, 12);
  assert.ok(detail.related.slice(0, 6).every(video => video.channelId === CHANNEL_A));
  assert.ok(detail.related.every(video => video.id !== 'vid00000005'));
  assert.equal(new Set(detail.related.map(video => video.id)).size, 12);

  assert.deepEqual(await service.getVideoDetail('yokyokyokyo'), { video: null, related: [] });
  assert.equal(await service.getVideoDetail('kısa'), null);
});

function createFakeApp() {
  const routes = [];
  return {
    routes,
    get(routePath, ...handlers) {
      routes.push({ path: routePath, handler: handlers.at(-1) });
    }
  };
}

function createResponse() {
  return {
    body: null,
    headers: {},
    statusCode: 200,
    json(body) { this.body = body; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; }
  };
}

async function callRoute(service, routePath, req) {
  const app = createFakeApp();
  registerVideoRoutes(app, { videoService: service });
  const route = app.routes.find(item => item.path === routePath);
  const response = createResponse();
  await route.handler({ query: {}, params: {}, ...req }, response);
  return response;
}

test('video rotaları önbellek başlıklarını ve durum kodlarını doğru verir', async () => {
  const videos = [makeVideo(1), makeVideo(2, { videoTuru: 'shorts' })];
  const service = createVideoService({ getCollection: createFakeDb(videos, CHANNELS).getCollection });

  const home = await callRoute(service, '/api/videos/home', {});
  assert.equal(home.statusCode, 200);
  assert.equal(home.headers['Cache-Control'], 'public, max-age=60');
  assert.equal(home.body.success, true);
  assert.equal(home.body.videos.videos.length, 1);

  const channels = await callRoute(service, '/api/videos/channels', {});
  assert.equal(channels.headers['Cache-Control'], 'public, max-age=600');
  assert.equal(channels.body.channels.length, 2);

  const detail = await callRoute(service, '/api/videos/:videoId', { params: { videoId: 'vid00000001' } });
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.headers['Cache-Control'], 'public, max-age=300');

  const missing = await callRoute(service, '/api/videos/:videoId', { params: { videoId: 'yokyokyokyo' } });
  assert.equal(missing.statusCode, 404);

  const invalid = await callRoute(service, '/api/videos/:videoId', { params: { videoId: '../x' } });
  assert.equal(invalid.statusCode, 400);
});

test('veritabanı hazır değilse video rotaları 503 döner', async () => {
  const service = createVideoService({
    getCollection: async () => {
      throw new Error('DB not ready in time');
    }
  });
  const response = await callRoute(service, '/api/videos/home', {});
  assert.equal(response.statusCode, 503);
  assert.equal(response.headers['Cache-Control'], 'no-store');
});
