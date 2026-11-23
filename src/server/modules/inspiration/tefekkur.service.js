'use strict';

const fs = require('fs');
const path = require('path');

// Tefekkür sekmesindeki kaydırmalı okuyucunun metin kaynakları. Anahtarlar istemcideki
// bölüm anahtarlarıyla aynıdır; değerler inspiration.models.js içindeki model adlarıdır.
// Risale-i Nur bölümü metin olarak "vecizeler" koleksiyonunu kullanır.
const TEXT_CATEGORY_MODELS = Object.freeze({
  ayet: 'Ayet',
  hadis: 'Hadis',
  dua: 'Dua',
  risale: 'Vecize'
});

// Görsel modunda kaydırılan klasörler (public/ altında).
const IMAGE_CATEGORY_FOLDERS = Object.freeze({
  risale: 'quotes'
});

// Radyo yayın adresleri koddan değil ortam değişkenlerinden gelir; adres boşsa istemci
// "yayın adresi henüz eklenmedi" durumunu gösterir.
const RADIO_STATIONS = Object.freeze([
  { key: 'kuran-radyo', name: 'Diyanet Kur\'an Radyo', envKey: 'TEFEKKUR_KURAN_RADYO_URL' },
  { key: 'risalet-radyo', name: 'Diyanet Risalet Radyo', envKey: 'TEFEKKUR_RISALET_RADYO_URL' }
]);

const IMAGE_FILE_PATTERN = /\.(?:jpe?g|png|gif|webp)$/i;
const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_ITEMS = 5000;

function isTefekkurTextCategory(category) {
  return typeof category === 'string' && Object.hasOwn(TEXT_CATEGORY_MODELS, category);
}

function isTefekkurImageCategory(category) {
  return typeof category === 'string' && Object.hasOwn(IMAGE_CATEGORY_FOLDERS, category);
}

function normalizeStreamUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch (_error) {
    return null;
  }
}

function normalizeTextDocument(document) {
  const text = typeof document?.sentence === 'string' ? document.sentence.trim() : '';
  if (!text) return null;
  const item = { id: String(document._id), text };
  const source = typeof document.source === 'string' ? document.source.trim() : '';
  if (source) item.source = source;
  return item;
}

function compareFileNames(a, b) {
  return a.localeCompare(b, 'tr', { numeric: true, sensitivity: 'base' });
}

function createTefekkurService({
  models,
  publicPath,
  env = process.env,
  now = Date.now,
  readdir = fs.promises.readdir,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  maxItems = DEFAULT_MAX_ITEMS
}) {
  // Koleksiyonlar seyrek değişir; her açılışta tüm listeyi veritabanından çekmemek için
  // kısa süreli bellek önbelleği kullanılır. Hatalı istekler önbelleğe yazılmaz.
  const cache = new Map();

  function cached(key, loader) {
    const entry = cache.get(key);
    if (entry && entry.expiresAt > now()) return entry.promise;
    const promise = Promise.resolve().then(loader);
    cache.set(key, { promise, expiresAt: now() + cacheTtlMs });
    promise.catch(() => {
      if (cache.get(key)?.promise === promise) cache.delete(key);
    });
    return promise;
  }

  async function listTefekkurTexts(category) {
    if (!isTefekkurTextCategory(category)) return null;
    const Model = models[TEXT_CATEGORY_MODELS[category]];
    if (!Model) return [];
    return cached(`text:${category}`, async () => {
      const documents = await Model.find({}, { sentence: 1, source: 1 })
        .sort({ _id: 1 })
        .limit(maxItems)
        .lean();
      return documents.map(normalizeTextDocument).filter(Boolean);
    });
  }

  async function listTefekkurImages(category) {
    if (!isTefekkurImageCategory(category)) return null;
    const folder = IMAGE_CATEGORY_FOLDERS[category];
    return cached(`image:${category}`, async () => {
      const files = await readdir(path.join(publicPath, folder));
      return files
        .filter(file => IMAGE_FILE_PATTERN.test(file))
        .sort(compareFileNames)
        .map(file => ({ name: file, url: `/${folder}/${encodeURIComponent(file)}` }));
    });
  }

  function listTefekkurRadios() {
    return RADIO_STATIONS.map(station => ({
      key: station.key,
      name: station.name,
      streamUrl: normalizeStreamUrl(env[station.envKey])
    }));
  }

  return {
    listTefekkurImages,
    listTefekkurRadios,
    listTefekkurTexts
  };
}

module.exports = {
  IMAGE_CATEGORY_FOLDERS,
  RADIO_STATIONS,
  TEXT_CATEGORY_MODELS,
  createTefekkurService,
  isTefekkurImageCategory,
  isTefekkurTextCategory,
  normalizeStreamUrl
};
