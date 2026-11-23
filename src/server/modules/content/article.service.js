'use strict';

const PREVIEW_DEFAULT_PER_CATEGORY = 4;
const PREVIEW_MAX_PER_CATEGORY = 8;
const PAGE_DEFAULT_LIMIT = 6;
const PAGE_MAX_LIMIT = 12;
const MAX_CATEGORY_LENGTH = 80;
const MAX_TEXT_LENGTH = 220;
const DEFAULT_CACHE_TTL_MS = 60 * 1000;

const ARTICLE_PROJECTION = {
  title: 1,
  text: 1,
  category: 1,
  category_url: 1,
  image_url: 1,
  destination_url: 1
};

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

// `?category[$ne]=x` gibi nesne değerleri sorguya sızmasın diye yalnız düz metin kabul edilir.
function normalizeCategory(value) {
  if (typeof value !== 'string') return null;
  const category = value.trim();
  if (!category || category.length > MAX_CATEGORY_LENGTH) return null;
  return category;
}

function truncateText(value, maxLength = MAX_TEXT_LENGTH) {
  const text = String(value || '').trim();
  return text.length <= maxLength ? text : `${text.slice(0, maxLength).trimEnd()}…`;
}

// Liste yanıtlarında makalenin tam metni taşınmaz; kartlarda yalnız kısa özet görünür.
function toPublicArticle(document) {
  return {
    id: String(document._id),
    title: String(document.title || ''),
    text: truncateText(document.text),
    category: document.category || '',
    category_url: document.category_url || '',
    image_url: document.image_url || '',
    destination_url: document.destination_url || ''
  };
}

function createArticleService({ getCollection, now = Date.now, cacheTtlMs = DEFAULT_CACHE_TTL_MS }) {
  const previewCache = new Map();

  async function listCategoryPage(category, options = {}) {
    const normalized = normalizeCategory(category);
    if (!normalized) return null;
    const offset = clampInteger(options.offset, 0, 0, 100000);
    const limit = clampInteger(options.limit, PAGE_DEFAULT_LIMIT, 1, PAGE_MAX_LIMIT);

    const collection = await getCollection();
    const filter = { category: normalized };
    const [documents, total] = await Promise.all([
      collection.find(filter, { projection: ARTICLE_PROJECTION })
        .sort({ _id: 1 })
        .skip(offset)
        .limit(limit)
        .toArray(),
      collection.countDocuments(filter)
    ]);

    return {
      articles: documents.map(toPublicArticle),
      total,
      hasMore: offset + documents.length < total
    };
  }

  async function buildPreview(perCategory) {
    const collection = await getCollection();
    const names = (await collection.distinct('category'))
      .map(normalizeCategory)
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, 'tr'));

    const categories = await Promise.all(names.map(async category => {
      const filter = { category };
      const [documents, total] = await Promise.all([
        collection.find(filter, { projection: ARTICLE_PROJECTION })
          .sort({ _id: 1 })
          .limit(perCategory)
          .toArray(),
        collection.countDocuments(filter)
      ]);
      return { category, total, articles: documents.map(toPublicArticle) };
    }));
    return { categories };
  }

  // Her kategorinin ilk birkaç makalesi tek yanıtta döner; sekme açılırken önceden hazırlanır.
  async function listPreview(requestedPerCategory) {
    const perCategory = clampInteger(
      requestedPerCategory,
      PREVIEW_DEFAULT_PER_CATEGORY,
      1,
      PREVIEW_MAX_PER_CATEGORY
    );
    const cached = previewCache.get(perCategory);
    if (cached && now() - cached.createdAt < cacheTtlMs) return cached.value;

    const value = await buildPreview(perCategory);
    previewCache.set(perCategory, { value, createdAt: now() });
    return value;
  }

  return { listCategoryPage, listPreview };
}

module.exports = {
  ARTICLE_PROJECTION,
  PAGE_DEFAULT_LIMIT,
  PAGE_MAX_LIMIT,
  PREVIEW_DEFAULT_PER_CATEGORY,
  PREVIEW_MAX_PER_CATEGORY,
  clampInteger,
  createArticleService,
  normalizeCategory,
  toPublicArticle,
  truncateText
};
