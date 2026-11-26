'use strict';

const VIDEO_TYPES = new Set(['video', 'shorts']);
const FEED_DEFAULT_LIMIT = 12;
const FEED_MAX_LIMIT = 24;
// Ana akışın ilk sayfası; istemci en yeni üçte biri eskilerle karıştırdığından (ns.mixFresh) geniş tutulur.
const HOME_VIDEO_LIMIT = 24;
const HOME_SHORTS_LIMIT = 12;
const RELATED_CHANNEL_LIMIT = 6;
const RELATED_MAX = 12;
// Abone olunan ve önerilmeyen kanallar istemcide en çok 200'er tutulur (videos-store.js).
const MAX_CHANNEL_LIST = 200;
// Abone olunan kanal varken bir akış sayfasının yaklaşık bu kadarı abone olunan kanallardan gelir.
const SUBSCRIBED_SHARE = 0.5;
const MAX_HOME_CACHE_KEYS = 50;
const DEFAULT_FEED_CACHE_TTL_MS = 60 * 1000;
const DEFAULT_CHANNEL_CACHE_TTL_MS = 10 * 60 * 1000;
const AVATAR_SIZE = 88;

const VIDEO_ID_PATTERN = /^[\w-]{11}$/;
const CHANNEL_ID_PATTERN = /^UC[\w-]{22}$/;
const CURSOR_PATTERN = /^(\d{1,15})_([\w-]{11})$/;
// Karışık akış cursor'ı: "<abonelikler>~<diğerleri>"; her parça bir cursor, boş (baştan) ya da `end`.
const MIXED_CURSOR_PATTERN = /^((?:\d{1,15}_[\w-]{11})|end)?~((?:\d{1,15}_[\w-]{11})|end)?$/;
const CURSOR_END = 'end';

const VIDEO_PROJECTION = {
  _id: 0,
  videoId: 1,
  baslik: 1,
  kanalId: 1,
  kanalAdi: 1,
  sureSaniye: 1,
  izlenmeSayisi: 1,
  videoTuru: 1,
  yuklenmeTarihi: 1
};

const CHANNEL_PROJECTION = { _id: 0, kanalId: 1, kanalAdi: 1, kanalHandle: 1, kanalLogoUrl: 1 };

// Akışlar yalnız geçerli kimliği ve tarihi olan kayıtları gösterir; cursor sayfalaması tarihe dayanır.
// Süresi olmayan kayıtlar canlı yayın / prömiyerdir ve gösterilmez.
const VALID_VIDEO_FILTER = {
  videoId: { $type: 'string', $ne: '' },
  yuklenmeTarihi: { $type: 'date' },
  sureSaniye: { $gt: 0 }
};

const FEED_SORT = { yuklenmeTarihi: -1, videoId: -1 };

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function isVideoId(value) {
  return typeof value === 'string' && VIDEO_ID_PATTERN.test(value);
}

function normalizeVideoType(value) {
  if (value === undefined || value === null || value === '') return 'video';
  return typeof value === 'string' && VIDEO_TYPES.has(value) ? value : null;
}

// `?exclude=UC..,UC..` (önerilmeyen kanallar) ve `?include=UC..,UC..` (abone olunan kanallar) listeleri.
// Geçersiz kimlikler sessizce atlanır; nesne/dizi gibi beklenmeyen değerler sorguya sızmasın diye
// yalnız düz metin okunur.
function parseChannelList(value) {
  if (typeof value !== 'string' || !value) return [];
  const ids = new Set();
  for (const part of value.split(',')) {
    const id = part.trim();
    if (CHANNEL_ID_PATTERN.test(id)) ids.add(id);
    if (ids.size >= MAX_CHANNEL_LIST) break;
  }
  return [...ids].sort();
}

const parseExcludedChannels = parseChannelList;

// Boş değer `null`, geçersiz değer `false` döner; böylece rota 400 verebilir.
function normalizeChannelId(value) {
  if (value === undefined || value === null || value === '') return null;
  return typeof value === 'string' && CHANNEL_ID_PATTERN.test(value) ? value : false;
}

function encodeCursor(video) {
  if (!video?.publishedAt || !video.id) return null;
  const time = Date.parse(video.publishedAt);
  return Number.isFinite(time) ? `${time}_${video.id}` : null;
}

// Geçersiz cursor `undefined` değil `false` döner; böylece rota 400 verebilir.
function parseCursor(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return false;
  const match = CURSOR_PATTERN.exec(value);
  if (!match) return false;
  return { date: new Date(Number(match[1])), videoId: match[2] };
}

function parseCursorPart(raw) {
  if (!raw) return { cursor: null, raw: '', done: false };
  if (raw === CURSOR_END) return { cursor: null, raw: CURSOR_END, done: true };
  return { cursor: parseCursor(raw), raw, done: false };
}

// Akış cursor'ı düz (tek akış) ya da karışık (abonelikler + diğerleri) olabilir; ikisi de iki parçalı
// biçime çevrilir. Abonelik listesi kaydırırken değişirse eski biçimdeki cursor da kabul edilir:
// düz cursor iki akışın ortak başlangıcı olur. Geçersiz cursor `false` döner.
function parseFeedCursor(value) {
  if (value === undefined || value === null || value === '') {
    return { subscribed: parseCursorPart(''), others: parseCursorPart('') };
  }
  if (typeof value !== 'string') return false;
  if (CURSOR_PATTERN.test(value)) {
    return { subscribed: parseCursorPart(value), others: parseCursorPart(value) };
  }
  const match = MIXED_CURSOR_PATTERN.exec(value);
  if (!match) return false;
  return { subscribed: parseCursorPart(match[1]), others: parseCursorPart(match[2]) };
}

function isNewerCursor(left, right) {
  if (left.date.getTime() !== right.date.getTime()) return left.date > right.date;
  return left.videoId > right.videoId;
}

// Abonelik kalmadıysa karışık cursor tek akışa döner: bitmemiş parçalardan en yenisinden devam edilir
// (tekrar eden videoları istemci zaten eler). İki parça da bittiyse `undefined` (akış sonu) döner.
function toSingleCursor(feedCursor) {
  const parts = [feedCursor.subscribed, feedCursor.others].filter(part => !part.done);
  if (!parts.length) return undefined;
  if (parts.some(part => !part.cursor)) return null;
  return parts.reduce((newest, part) => (isNewerCursor(part.cursor, newest) ? part.cursor : newest), parts[0].cursor);
}

// Sayfa en yeniden eskiye sıralanır (tek akıştaki sırayla aynı).
function compareFeedOrder(left, right) {
  const leftTime = Date.parse(left.publishedAt) || 0;
  const rightTime = Date.parse(right.publishedAt) || 0;
  if (leftTime !== rightTime) return rightTime - leftTime;
  if (left.id === right.id) return 0;
  return left.id < right.id ? 1 : -1;
}

// YouTube kanal logoları `=s800-...` boyut ekiyle gelir; avatar için küçük boyut istenir.
function resizeChannelLogo(url, size = AVATAR_SIZE) {
  if (typeof url !== 'string' || !url.startsWith('https://')) return '';
  return url.replace(/=s\d+(-|$)/, `=s${size}$1`);
}

// YouTube kanal adı (@kullanici). Kayıtta `@` olmadan tutulmuş olsa da başına eklenir; boşsa boş döner.
function normalizeChannelHandle(value) {
  const handle = typeof value === 'string' ? value.trim() : '';
  if (!handle) return '';
  return handle.startsWith('@') ? handle : `@${handle}`;
}

function toPublicChannel(document) {
  return {
    id: document.kanalId,
    name: String(document.kanalAdi || '').trim(),
    handle: normalizeChannelHandle(document.kanalHandle),
    logo: resizeChannelLogo(document.kanalLogoUrl)
  };
}

function toPublicVideo(document) {
  const duration = Number.isFinite(document.sureSaniye) ? Math.max(0, Math.round(document.sureSaniye)) : 0;
  const publishedAt = document.yuklenmeTarihi instanceof Date
    ? document.yuklenmeTarihi.toISOString()
    : (document.yuklenmeTarihi ? new Date(document.yuklenmeTarihi).toISOString() : null);
  return {
    id: document.videoId,
    title: String(document.baslik || '').trim(),
    channelId: document.kanalId || '',
    channelName: String(document.kanalAdi || '').trim(),
    publishedAt,
    views: Number.isFinite(document.izlenmeSayisi) ? document.izlenmeSayisi : 0,
    duration,
    type: document.videoTuru === 'shorts' ? 'shorts' : 'video',
    isLive: duration === 0
  };
}

function buildFeedFilter({ type, exclude = [], include = [], cursor = null, channelId = null, excludeVideoId = null }) {
  const conditions = [VALID_VIDEO_FILTER, { videoTuru: type }];
  if (channelId) conditions.push({ kanalId: channelId });
  else {
    if (include.length) conditions.push({ kanalId: { $in: include } });
    if (exclude.length) conditions.push({ kanalId: { $nin: exclude } });
  }
  if (excludeVideoId) conditions.push({ videoId: { $ne: excludeVideoId } });
  if (cursor) {
    conditions.push({
      $or: [
        { yuklenmeTarihi: { $lt: cursor.date } },
        { yuklenmeTarihi: cursor.date, videoId: { $lt: cursor.videoId } }
      ]
    });
  }
  return { $and: conditions };
}

function createVideoService({
  getCollection,
  now = Date.now,
  feedCacheTtlMs = DEFAULT_FEED_CACHE_TTL_MS,
  channelCacheTtlMs = DEFAULT_CHANNEL_CACHE_TTL_MS
}) {
  // Video listesi dışarıdaki bir süreçle güncellenir; aynı akışı her açılışta tekrar sorgulamamak
  // için kısa ömürlü bellek önbelleği kullanılır. Promise saklanır ki eş zamanlı istekler tek
  // sorguyu paylaşsın; hatalı yüklemeler önbellekten silinir.
  const cache = new Map();

  function cached(key, ttlMs, loader) {
    const entry = cache.get(key);
    if (entry && entry.expiresAt > now()) return entry.promise;
    if (cache.size >= MAX_HOME_CACHE_KEYS * 2) {
      for (const [cacheKey, value] of cache) {
        if (value.expiresAt <= now()) cache.delete(cacheKey);
      }
      if (cache.size >= MAX_HOME_CACHE_KEYS * 2) cache.delete(cache.keys().next().value);
    }
    const promise = Promise.resolve().then(loader);
    cache.set(key, { promise, expiresAt: now() + ttlMs });
    promise.catch(() => {
      if (cache.get(key)?.promise === promise) cache.delete(key);
    });
    return promise;
  }

  async function findVideos(filter, limit) {
    const collection = await getCollection('videolar');
    const documents = await collection
      .find(filter, { projection: VIDEO_PROJECTION })
      .sort(FEED_SORT)
      .limit(limit)
      .toArray();
    return documents.map(toPublicVideo);
  }

  // Bir fazlası istenir; fazladan kayıt geldiyse sonraki sayfa vardır.
  async function queryPage(options, limit) {
    const videos = await findVideos(buildFeedFilter(options), limit + 1);
    const hasMore = videos.length > limit;
    const page = hasMore ? videos.slice(0, limit) : videos;
    return {
      videos: page,
      hasMore,
      nextCursor: hasMore ? encodeCursor(page[page.length - 1]) : null
    };
  }

  // Abone olunan kanal varken sayfa iki akıştan doldurulur: yaklaşık SUBSCRIBED_SHARE kadarı abone
  // olunan kanallardan, kalanı diğer (önerilmeyenler hariç) kanallardan. Akışlardan biri biterse diğeri
  // sayfayı doldurur. Her akış kendi tarih cursor'ıyla ilerler; ikisi birlikte tek cursor'da taşınır.
  async function queryMixedPage({ type, include, exclude, feedCursor }, limit) {
    const others = [...new Set([...exclude, ...include])];
    const [subscribed, rest] = await Promise.all([
      feedCursor.subscribed.done
        ? []
        : findVideos(buildFeedFilter({ type, include, exclude, cursor: feedCursor.subscribed.cursor }), limit + 1),
      feedCursor.others.done
        ? []
        : findVideos(buildFeedFilter({ type, exclude: others, cursor: feedCursor.others.cursor }), limit + 1)
    ]);
    const wanted = Math.max(1, Math.round(limit * SUBSCRIBED_SHARE));
    let takeSubscribed = Math.min(subscribed.length, wanted);
    const takeRest = Math.min(rest.length, limit - takeSubscribed);
    takeSubscribed = Math.min(subscribed.length, limit - takeRest);
    const subscribedPage = subscribed.slice(0, takeSubscribed);
    const restPage = rest.slice(0, takeRest);
    const nextPart = (all, page, part) => {
      if (all.length <= page.length) return CURSOR_END;
      return page.length ? (encodeCursor(page[page.length - 1]) || CURSOR_END) : part.raw;
    };
    const subscribedPart = nextPart(subscribed, subscribedPage, feedCursor.subscribed);
    const restPart = nextPart(rest, restPage, feedCursor.others);
    const hasMore = subscribedPart !== CURSOR_END || restPart !== CURSOR_END;
    return {
      videos: [...subscribedPage, ...restPage].sort(compareFeedOrder),
      hasMore,
      nextCursor: hasMore ? `${subscribedPart}~${restPart}` : null
    };
  }

  // `include` (abonelikler) doluysa karışık, boşsa tek akış sayfası döner.
  function queryFeedPage({ type, include, exclude, feedCursor }, limit) {
    if (include.length) return queryMixedPage({ type, include, exclude, feedCursor }, limit);
    const cursor = toSingleCursor(feedCursor);
    if (cursor === undefined) return { videos: [], hasMore: false, nextCursor: null };
    return queryPage({ type, exclude, cursor }, limit);
  }

  function listChannels() {
    return cached('channels', channelCacheTtlMs, async () => {
      const collection = await getCollection('video_channels');
      const documents = await collection.find({}, { projection: CHANNEL_PROJECTION }).toArray();
      return documents
        .filter(document => typeof document.kanalId === 'string' && CHANNEL_ID_PATTERN.test(document.kanalId))
        .map(toPublicChannel)
        .sort((left, right) => left.name.localeCompare(right.name, 'tr'));
    });
  }

  // Önerilmeyen kanallar abonelik listesinde olamaz (istemci de böyle tutar).
  function parseChannelFilters(options) {
    const exclude = parseChannelList(options.exclude);
    const excluded = new Set(exclude);
    const include = parseChannelList(options.include).filter(id => !excluded.has(id));
    return { exclude, include };
  }

  // `channel` verilirse yalnız o kanalın videoları döner (kanal seçimi); yoksa `exclude` (önerilmeyen
  // kanallar) uygulanır ve `include` (abone olunan kanallar) doluysa sayfa karışık hazırlanır.
  async function listFeed(options = {}) {
    const type = normalizeVideoType(options.type);
    const channelId = normalizeChannelId(options.channel);
    if (!type || channelId === false) return null;
    const limit = clampInteger(options.limit, FEED_DEFAULT_LIMIT, 1, FEED_MAX_LIMIT);
    if (channelId) {
      const cursor = parseCursor(options.before);
      if (cursor === false) return null;
      const key = `feed:${type}:${channelId}:${options.before || ''}:${limit}`;
      return cached(key, feedCacheTtlMs, () => queryPage({ type, cursor, channelId }, limit));
    }
    const feedCursor = parseFeedCursor(options.before);
    if (feedCursor === false) return null;
    const { exclude, include } = parseChannelFilters(options);
    const key = `feed:${type}::${exclude.join(',')}:${include.join(',')}:${options.before || ''}:${limit}`;
    return cached(key, feedCacheTtlMs, () => queryFeedPage({ type, include, exclude, feedCursor }, limit));
  }

  // Sekme ilk açılırken kanallar, ilk videolar ve ilk shorts'lar tek yanıtta hazırlanır.
  async function getHome(options = {}) {
    const { exclude, include } = parseChannelFilters(options);
    const feedCursor = parseFeedCursor(null);
    return cached(`home:${exclude.join(',')}:${include.join(',')}`, feedCacheTtlMs, async () => {
      const [channels, videos, shorts] = await Promise.all([
        listChannels(),
        queryFeedPage({ type: 'video', include, exclude, feedCursor }, HOME_VIDEO_LIMIT),
        queryFeedPage({ type: 'shorts', include, exclude, feedCursor }, HOME_SHORTS_LIMIT)
      ]);
      return { channels, videos, shorts };
    });
  }

  // İzleme sayfası: videonun kendisi ve "Sıradaki" listesi (önce aynı kanal, sonra en yeniler).
  async function getVideoDetail(videoId) {
    if (!isVideoId(videoId)) return null;
    return cached(`detail:${videoId}`, feedCacheTtlMs, async () => {
      const collection = await getCollection('videolar');
      const document = await collection.findOne(
        { $and: [VALID_VIDEO_FILTER, { videoId }] },
        { projection: VIDEO_PROJECTION }
      );
      if (!document) return { video: null, related: [] };
      const video = toPublicVideo(document);
      const [sameChannel, latest] = await Promise.all([
        video.channelId
          ? findVideos(buildFeedFilter({ type: video.type, channelId: video.channelId, excludeVideoId: videoId }), RELATED_CHANNEL_LIMIT)
          : [],
        findVideos(buildFeedFilter({ type: video.type, excludeVideoId: videoId }), RELATED_MAX)
      ]);
      const seen = new Set();
      const related = [...sameChannel, ...latest].filter(item => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      }).slice(0, RELATED_MAX);
      return { video, related };
    });
  }

  function clearCache() {
    cache.clear();
  }

  return { clearCache, getHome, getVideoDetail, listChannels, listFeed };
}

module.exports = {
  FEED_DEFAULT_LIMIT,
  FEED_MAX_LIMIT,
  HOME_SHORTS_LIMIT,
  HOME_VIDEO_LIMIT,
  SUBSCRIBED_SHARE,
  buildFeedFilter,
  createVideoService,
  encodeCursor,
  isVideoId,
  normalizeChannelHandle,
  normalizeChannelId,
  normalizeVideoType,
  parseChannelList,
  parseCursor,
  parseExcludedChannels,
  parseFeedCursor,
  resizeChannelLogo,
  toPublicChannel,
  toPublicVideo
};
