'use strict';

const PREVIEW_DEFAULT_PER_CATEGORY = 4;
const PREVIEW_MAX_PER_CATEGORY = 8;
const PAGE_DEFAULT_LIMIT = 6;
const PAGE_MAX_LIMIT = 12;
const MAX_CATEGORY_LENGTH = 80;
const MAX_TEXT_LENGTH = 220;
const DEFAULT_CACHE_TTL_MS = 60 * 1000;
const SEARCH_DEFAULT_LIMIT = 20;
const SEARCH_MAX_LIMIT = 40;
const SEARCH_MIN_LENGTH = 2;
const SEARCH_MAX_LENGTH = 100;
const SEARCH_CORPUS_MAX = 5000;

// Soru kalıplarındaki sözcükler ("Kader nedir?", "Allah neden ...") sonucu daraltmasın diye
// sorguda başka sözcük varsa yok sayılır. Değerler katlanmış (küçük harf, Türkçe karaktersiz) yazılır.
const SEARCH_STOPWORDS = new Set([
  'acaba', 'bir', 'bu', 'da', 'de', 'gibi', 'hakkinda', 'icin', 'ile', 'ki', 'mi', 'midir', 'mu', 'mudur',
  'nasil', 'ne', 'neden', 'nedir', 'nicin', 'niye', 'o', 'olan', 'olur', 'su', 've', 'var', 'veya', 'ya'
]);
const APOSTROPHES = new Set(["'", '’', '‘', '`', '´']);
const SEARCH_FIELD_WEIGHTS = { title: 4, category: 2, text: 1 };

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

// ---------- Arama ----------

// Tek karakteri aramaya uygun biçime getirir: Türkçe küçük harf, aksan/çengel yok ("Kâinat" → "kainat",
// "İslam'da" → "islamda"). Kesme işareti silinir, harf/rakam dışı her şey boşluk olur.
function foldChar(character) {
  if (APOSTROPHES.has(character)) return '';
  const folded = character
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i');
  return /^[\p{L}\p{N}]+$/u.test(folded) ? folded : ' ';
}

// Katlanmış metinle birlikte, katlanmış her karakterin özgün metindeki [başlangıç, bitiş) aralığını döner;
// vurgu aralıkları bu sayede özgün başlık/metin üzerinde işaretlenebilir. Ardışık boşluklar teke iner.
function foldWithMap(value) {
  const source = String(value || '');
  let folded = '';
  const map = [];
  let offset = 0;
  for (const character of source) {
    const end = offset + character.length;
    for (const piece of foldChar(character)) {
      if (piece === ' ' && (folded === '' || folded.endsWith(' '))) continue;
      folded += piece;
      map.push([offset, end]);
    }
    offset = end;
  }
  if (folded.endsWith(' ')) {
    folded = folded.slice(0, -1);
    map.pop();
  }
  return { folded, map };
}

function foldText(value) {
  return foldWithMap(value).folded;
}

// `?q[$ne]=x` gibi nesne değerleri reddedilir; çok uzun sorgu kırpılır.
function normalizeSearchQuery(value) {
  if (typeof value !== 'string') return null;
  return value.trim().slice(0, SEARCH_MAX_LENGTH);
}

function searchTokens(query) {
  const words = [...new Set(foldText(query).split(' ').filter(word => word.length >= SEARCH_MIN_LENGTH))];
  const meaningful = words.filter(word => !SEARCH_STOPWORDS.has(word));
  return meaningful.length ? meaningful : words;
}

function findOccurrences(haystack, needle, wordStartOnly) {
  const hits = [];
  let index = haystack.indexOf(needle);
  while (index !== -1 && hits.length < 20) {
    const atWordStart = index === 0 || haystack[index - 1] === ' ';
    if (!wordStartOnly || atWordStart) hits.push({ index, atWordStart });
    index = haystack.indexOf(needle, index + 1);
  }
  return hits;
}

// Bir sözcüğün alanda nasıl geçtiğini bulur. Tam geçiş tam puan alır; Türkçe çekim ekleri nedeniyle
// ("kötülüğe" / "kötülük") uzun sözcüklerin son iki harfi atılmış kökü sözcük başında aranır (yarım puan).
// Kısa sözcükler ("ruh", "can") yalnız sözcük başında eşleşir ki "kader" içinde "ad" bulunmasın.
function matchToken(haystack, token) {
  const exact = findOccurrences(haystack, token, token.length <= 3);
  if (exact.length) {
    return { needle: token, hits: exact, factor: exact.some(hit => hit.atWordStart) ? 1.5 : 1 };
  }
  if (token.length >= 5) {
    const stem = token.slice(0, Math.max(4, token.length - 2));
    const partial = findOccurrences(haystack, stem, true);
    if (partial.length) return { needle: stem, hits: partial, factor: 0.6 };
  }
  return null;
}

function toSearchEntry(document) {
  const article = toPublicArticle(document);
  return {
    article,
    folded: {
      title: foldText(document.title),
      category: foldText(document.category),
      text: foldText(document.text)
    }
  };
}

function scoreEntry(entry, tokens, phrase) {
  let score = 0;
  let matched = 0;
  for (const token of tokens) {
    let best = 0;
    for (const field of Object.keys(SEARCH_FIELD_WEIGHTS)) {
      const match = matchToken(entry.folded[field], token);
      if (match) best = Math.max(best, SEARCH_FIELD_WEIGHTS[field] * match.factor);
    }
    if (best > 0) {
      matched += 1;
      score += best;
    }
  }
  if (!matched) return null;
  if (matched === tokens.length) score += 3;
  if (phrase) {
    if (entry.folded.title.includes(phrase)) score += 8;
    else if (entry.folded.text.includes(phrase)) score += 4;
  }
  return { score, matched };
}

function mergeRanges(ranges) {
  const sorted = ranges.slice().sort((left, right) => left[0] - right[0]);
  const merged = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push(range.slice());
  }
  return merged;
}

// İstemcinin vurgulayacağı aralıklar, yanıttaki (kısaltılmış) başlık ve metin üzerinden hesaplanır.
function highlightRanges(value, tokens) {
  const { folded, map } = foldWithMap(value);
  const ranges = [];
  for (const token of tokens) {
    const match = matchToken(folded, token);
    if (!match) continue;
    for (const hit of match.hits) {
      ranges.push([map[hit.index][0], map[hit.index + match.needle.length - 1][1]]);
    }
  }
  return mergeRanges(ranges);
}

function createArticleService({ getCollection, now = Date.now, cacheTtlMs = DEFAULT_CACHE_TTL_MS }) {
  const previewCache = new Map();
  let searchCorpus = null;

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

  // Makale sayısı küçük olduğundan (yüzlerce) arama, kısa süre önbelleğe alınan katlanmış bir
  // kopya üzerinde bellekte yapılır; Mongo regex'i Türkçe harfleri (ı/İ, â) doğru eşleyemez.
  async function loadSearchCorpus() {
    if (searchCorpus && now() - searchCorpus.createdAt < cacheTtlMs) return searchCorpus.promise;
    const promise = (async () => {
      const collection = await getCollection();
      const documents = await collection.find({}, { projection: ARTICLE_PROJECTION })
        .sort({ _id: 1 })
        .limit(SEARCH_CORPUS_MAX)
        .toArray();
      return documents.map(toSearchEntry);
    })();
    searchCorpus = { promise, createdAt: now() };
    promise.catch(() => {
      if (searchCorpus?.promise === promise) searchCorpus = null;
    });
    return promise;
  }

  async function searchArticles(rawQuery, options = {}) {
    const query = normalizeSearchQuery(rawQuery);
    if (query === null) return null;
    const limit = clampInteger(options.limit, SEARCH_DEFAULT_LIMIT, 1, SEARCH_MAX_LIMIT);
    const tokens = searchTokens(query);
    if (!tokens.length) return { query, total: 0, articles: [] };

    const phrase = tokens.length > 1 ? foldText(query) : '';
    const required = Math.ceil(tokens.length / 2);
    const corpus = await loadSearchCorpus();
    const ranked = [];
    for (const entry of corpus) {
      const result = scoreEntry(entry, tokens, phrase);
      if (result && result.matched >= required) ranked.push({ entry, ...result });
    }
    ranked.sort((left, right) => right.matched - left.matched
      || right.score - left.score
      || left.entry.article.title.localeCompare(right.entry.article.title, 'tr'));

    return {
      query,
      total: ranked.length,
      articles: ranked.slice(0, limit).map(({ entry }) => ({
        ...entry.article,
        matches: {
          title: highlightRanges(entry.article.title, tokens),
          text: highlightRanges(entry.article.text, tokens)
        }
      }))
    };
  }

  return { listCategoryPage, listPreview, searchArticles };
}

module.exports = {
  ARTICLE_PROJECTION,
  PAGE_DEFAULT_LIMIT,
  PAGE_MAX_LIMIT,
  PREVIEW_DEFAULT_PER_CATEGORY,
  PREVIEW_MAX_PER_CATEGORY,
  SEARCH_MAX_LIMIT,
  clampInteger,
  createArticleService,
  foldText,
  foldWithMap,
  normalizeCategory,
  normalizeSearchQuery,
  searchTokens,
  toPublicArticle,
  truncateText
};
