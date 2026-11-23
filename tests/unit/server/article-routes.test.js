'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PAGE_MAX_LIMIT,
  PREVIEW_MAX_PER_CATEGORY,
  createArticleService,
  normalizeCategory,
  toPublicArticle,
  truncateText
} = require('../../../src/server/modules/content/article.service');
const { registerContentRoutes } = require('../../../src/server/modules/content/content.routes');

function createFakeCollection(documents) {
  const calls = { find: 0, distinct: 0, filters: [], skips: [], limits: [], sorts: [] };
  return {
    calls,
    async distinct() {
      calls.distinct += 1;
      return [...new Set(documents.map(document => document.category))];
    },
    async countDocuments(filter) {
      return documents.filter(document => document.category === filter.category).length;
    },
    find(filter, options) {
      calls.find += 1;
      calls.filters.push(filter);
      calls.projection = options.projection;
      let skip = 0;
      let limit = Infinity;
      return {
        sort(order) {
          calls.sorts.push(order);
          return this;
        },
        skip(value) {
          skip = value;
          calls.skips.push(value);
          return this;
        },
        limit(value) {
          limit = value;
          calls.limits.push(value);
          return this;
        },
        async toArray() {
          return documents
            .filter(document => document.category === filter.category)
            .slice(skip, skip + limit);
        }
      };
    }
  };
}

function makeArticles(category, count) {
  return Array.from({ length: count }, (_, index) => ({
    _id: `${category}-${index + 1}`,
    title: `${category} makalesi ${index + 1}`,
    text: 'Uzun metin '.repeat(60),
    category,
    category_url: 'https://example.com/kategori',
    image_url: 'https://example.com/resim.jpg',
    destination_url: `https://example.com/${category}/${index + 1}`
  }));
}

function createFakeApp() {
  const routes = new Map();
  return {
    routes,
    get(routePath, ...handlers) {
      routes.set(routePath, handlers.at(-1));
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

test('makale kategorisi yalnız düz ve makul uzunlukta metin olarak kabul edilir', () => {
  assert.equal(normalizeCategory('  Kader '), 'Kader');
  assert.equal(normalizeCategory(''), null);
  assert.equal(normalizeCategory('   '), null);
  assert.equal(normalizeCategory({ $ne: 'Kader' }), null);
  assert.equal(normalizeCategory(['Kader']), null);
  assert.equal(normalizeCategory('a'.repeat(81)), null);
  assert.equal(normalizeCategory(undefined), null);
});

test('liste yanıtında makale metni kısaltılır ve yalnız kart alanları döner', () => {
  assert.equal(truncateText('kısa'), 'kısa');
  assert.equal(truncateText('a'.repeat(300)).length, 221);

  const article = toPublicArticle({
    _id: 'x1', title: 'Başlık', text: 'b'.repeat(500), category: 'Kader', secret: 'gizli'
  });
  assert.deepEqual(Object.keys(article).sort(), [
    'category', 'category_url', 'destination_url', 'id', 'image_url', 'text', 'title'
  ]);
  assert.equal(article.id, 'x1');
  assert.equal(article.text.length, 221);
});

test('kategori sayfası sıralı, offset/limit ile sayfalanır ve hasMore doğru hesaplanır', async () => {
  const collection = createFakeCollection(makeArticles('Kader', 10));
  const service = createArticleService({ getCollection: async () => collection });

  const first = await service.listCategoryPage('Kader', { offset: 0, limit: 4 });
  assert.equal(first.articles.length, 4);
  assert.equal(first.total, 10);
  assert.equal(first.hasMore, true);
  assert.deepEqual(collection.calls.sorts.at(-1), { _id: 1 });
  assert.deepEqual(collection.calls.filters.at(-1), { category: 'Kader' });
  assert.equal(collection.calls.projection.text, 1);

  const last = await service.listCategoryPage('Kader', { offset: 8, limit: 4 });
  assert.deepEqual(last.articles.map(article => article.id), ['Kader-9', 'Kader-10']);
  assert.equal(last.hasMore, false);

  await service.listCategoryPage('Kader', { offset: -5, limit: 100000 });
  assert.equal(collection.calls.skips.at(-1), 0);
  assert.equal(collection.calls.limits.at(-1), PAGE_MAX_LIMIT);

  assert.equal(await service.listCategoryPage({ $ne: 'Kader' }), null);
  assert.equal(await service.listCategoryPage(''), null);
});

test('önizleme her kategorinin ilk makalelerini döner ve kısa süre önbelleğe alınır', async () => {
  let currentTime = 1000;
  const collection = createFakeCollection([
    ...makeArticles('Kader', 6),
    ...makeArticles('Evrim', 2)
  ]);
  const service = createArticleService({
    getCollection: async () => collection,
    now: () => currentTime,
    cacheTtlMs: 500
  });

  const preview = await service.listPreview('3');
  assert.deepEqual(preview.categories.map(item => item.category), ['Evrim', 'Kader']);
  const kader = preview.categories.find(item => item.category === 'Kader');
  assert.equal(kader.total, 6);
  assert.equal(kader.articles.length, 3);
  const evrim = preview.categories.find(item => item.category === 'Evrim');
  assert.equal(evrim.articles.length, 2);

  await service.listPreview('3');
  assert.equal(collection.calls.distinct, 1);

  currentTime += 501;
  await service.listPreview('3');
  assert.equal(collection.calls.distinct, 2);

  await service.listPreview('999');
  assert.equal(collection.calls.limits.at(-1), PREVIEW_MAX_PER_CATEGORY);
});

test('makale API rotaları önizleme ve sayfalı kategori listesini döner', async () => {
  const collection = createFakeCollection(makeArticles('Kader', 5));
  const articleService = createArticleService({ getCollection: async () => collection });
  const app = createFakeApp();
  registerContentRoutes(app, { articleService });

  const previewResponse = createResponse();
  await app.routes.get('/api/articles/preview')({ query: { perCategory: '2' } }, previewResponse);
  assert.equal(previewResponse.body.success, true);
  assert.equal(previewResponse.body.categories[0].articles.length, 2);
  assert.match(previewResponse.headers['Cache-Control'], /max-age=60/);

  const pageResponse = createResponse();
  await app.routes.get('/api/articles')({ query: { category: 'Kader', offset: '2', limit: '2' } }, pageResponse);
  assert.equal(pageResponse.body.success, true);
  assert.deepEqual(pageResponse.body.articles.map(article => article.id), ['Kader-3', 'Kader-4']);
  assert.equal(pageResponse.body.hasMore, true);
  assert.equal(pageResponse.body.total, 5);

  const invalidResponse = createResponse();
  await app.routes.get('/api/articles')({ query: { category: { $ne: 'x' } } }, invalidResponse);
  assert.equal(invalidResponse.statusCode, 400);
  assert.equal(invalidResponse.body.success, false);
});

test('makale API veritabanı hatasında 500, bağlantı hazır değilse 503 döner', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const failing = createArticleService({
      getCollection: async () => { throw new Error('boom'); }
    });
    const notReady = createArticleService({
      getCollection: async () => { throw new Error('DB not ready in time'); }
    });

    const failingApp = createFakeApp();
    registerContentRoutes(failingApp, { articleService: failing });
    const failingResponse = createResponse();
    await failingApp.routes.get('/api/articles')({ query: { category: 'Kader' } }, failingResponse);
    assert.equal(failingResponse.statusCode, 500);

    const notReadyApp = createFakeApp();
    registerContentRoutes(notReadyApp, { articleService: notReady });
    const notReadyResponse = createResponse();
    await notReadyApp.routes.get('/api/articles/preview')({ query: {} }, notReadyResponse);
    assert.equal(notReadyResponse.statusCode, 503);
  } finally {
    console.error = originalError;
  }
});
