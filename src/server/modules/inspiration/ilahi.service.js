'use strict';

const { extractYoutubeVideoId, isYoutubeVideoId } = require('../../shared/youtube-links');

const ILAHI_COLLECTION = 'ilahiler';
const ILAHI_SUGGESTION_COLLECTION = 'ilahi_onerileri';
const ILAHI_REPORT_COLLECTION = 'ilahi_bildirimleri';
// İstemcideki "Videoyu bildir" penceresinin seçenekleriyle aynı kalmalıdır.
const REPORT_REASONS = Object.freeze(['acilmiyor', 'kalite', 'uygunsuz', 'diger']);
const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_ILAHI = 1000;

const ILAHI_PROJECTION = { _id: 0, videoId: 1, baslik: 1, kanalAdi: 1, sureSaniye: 1 };
const ACTIVE_ILAHI_FILTER = {
  aktif: true,
  videoId: { $type: 'string', $ne: '' },
  sureSaniye: { $gt: 0 }
};

function toPublicIlahi(document) {
  const baslik = typeof document?.baslik === 'string' ? document.baslik.trim() : '';
  if (!document?.videoId || !baslik) return null;
  return {
    videoId: document.videoId,
    baslik,
    kanalAdi: typeof document.kanalAdi === 'string' ? document.kanalAdi.trim() : '',
    sureSaniye: Number(document.sureSaniye) || 0
  };
}

function createIlahiService({ getCollection, now = Date.now, cacheTtlMs = DEFAULT_CACHE_TTL_MS }) {
  let cache = null;

  // İlahi listesi seyrek değişir; kısa süreli bellek önbelleği her açılışta veritabanına gitmeyi önler.
  async function listTefekkurIlahiler() {
    if (cache && cache.expiresAt > now()) return cache.promise;
    const promise = (async () => {
      const collection = await getCollection(ILAHI_COLLECTION);
      const documents = await collection
        .find(ACTIVE_ILAHI_FILTER, { projection: ILAHI_PROJECTION })
        .sort({ eklenmeTarihi: 1, videoId: 1 })
        .limit(MAX_ILAHI)
        .toArray();
      return documents.map(toPublicIlahi).filter(Boolean);
    })();
    const entry = { promise, expiresAt: now() + cacheTtlMs };
    cache = entry;
    promise.catch(() => {
      if (cache === entry) cache = null;
    });
    return promise;
  }

  // Kullanıcı önerileri yalnız video kimliğiyle ve sayaçla saklanır; ham metin tutulmaz.
  // Listede zaten olan bir ilahi tekrar kaydedilmez.
  async function submitTefekkurIlahiOnerisi(input) {
    const videoId = extractYoutubeVideoId(input);
    if (!videoId) return { ok: false, reason: 'invalid' };

    const ilahiler = await getCollection(ILAHI_COLLECTION);
    if (await ilahiler.findOne({ videoId }, { projection: { _id: 1 } })) {
      return { ok: true, videoId, existing: true };
    }

    const suggestions = await getCollection(ILAHI_SUGGESTION_COLLECTION);
    const date = new Date(now());
    await suggestions.updateOne(
      { videoId },
      {
        $inc: { oneriSayisi: 1 },
        $set: { sonTarih: date },
        $setOnInsert: { url: `https://youtu.be/${videoId}`, ilkTarih: date, durum: 'beklemede' }
      },
      { upsert: true }
    );
    return { ok: true, videoId, existing: false };
  }

  // Kullanıcı bildirimi yalnız listedeki bir ilahi için ve izinli bir sebeple kabul edilir;
  // aynı video tekrar bildirilirse yeni kayıt açılmaz, sayaçlar artar.
  async function reportTefekkurIlahi(videoId, reason) {
    if (!isYoutubeVideoId(videoId) || !REPORT_REASONS.includes(reason)) return { ok: false, reason: 'invalid' };

    const ilahiler = await getCollection(ILAHI_COLLECTION);
    if (!(await ilahiler.findOne({ videoId }, { projection: { _id: 1 } }))) return { ok: false, reason: 'unknown' };

    const reports = await getCollection(ILAHI_REPORT_COLLECTION);
    const date = new Date(now());
    await reports.updateOne(
      { videoId },
      {
        $inc: { bildirimSayisi: 1, [`sebepler.${reason}`]: 1 },
        $set: { sonTarih: date },
        $setOnInsert: { ilkTarih: date, durum: 'beklemede' }
      },
      { upsert: true }
    );
    return { ok: true, videoId };
  }

  return {
    listTefekkurIlahiler,
    reportTefekkurIlahi,
    submitTefekkurIlahiOnerisi
  };
}

module.exports = {
  ILAHI_COLLECTION,
  ILAHI_REPORT_COLLECTION,
  ILAHI_SUGGESTION_COLLECTION,
  REPORT_REASONS,
  createIlahiService
};
