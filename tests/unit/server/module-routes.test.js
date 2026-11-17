'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { registerContentRoutes } = require('../../../src/server/modules/content/content.routes');
const { registerHealthRoutes } = require('../../../src/server/modules/system/health.routes');
const { registerPublicPageRoutes } = require('../../../src/server/modules/pages/page.routes');
const { isSafeGroupId } = require('../../../src/server/shared/group-id');

function createFakeApp() {
  const routes = [];
  return {
    routes,
    get(routePath, ...handlers) {
      routes.push({ method: 'GET', path: routePath, handlers });
    }
  };
}

function createResponse() {
  return {
    body: null,
    filePath: null,
    headers: {},
    redirectLocation: null,
    statusCode: 200,
    json(body) {
      this.body = body;
      return this;
    },
    redirect(statusCode, location) {
      this.statusCode = statusCode;
      this.redirectLocation = location;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
    sendFile(filePath) {
      this.filePath = filePath;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    type() {
      return this;
    }
  };
}

test('grup kimliği prototip anahtarlarını ve geçersiz karakterleri reddeder', () => {
  assert.equal(isSafeGroupId('bozok-universitesi'), true);
  assert.equal(isSafeGroupId('__proto__'), false);
  assert.equal(isSafeGroupId('../bozok'), false);
});

test('sağlık endpointi veritabanı durumunu HTTP durumuna yansıtır', () => {
  [
    { connected: true, expectedStatus: 200, expectedDatabase: 'connected' },
    { connected: false, expectedStatus: 503, expectedDatabase: 'disconnected' }
  ].forEach(({ connected, expectedStatus, expectedDatabase }) => {
    const app = createFakeApp();
    registerHealthRoutes(app, { isDatabaseConnected: () => connected });
    const route = app.routes.find(item => item.path === '/api/health');
    const response = createResponse();

    route.handlers.at(-1)({}, response);

    assert.equal(response.statusCode, expectedStatus);
    assert.equal(response.body.ok, connected);
    assert.equal(response.body.database, expectedDatabase);
    assert.equal(typeof response.body.timestamp, 'number');
  });
});

test('grup sayfası geçerli kimlikte uygulama kabuğunu sunar', () => {
  const app = createFakeApp();
  const publicPath = path.resolve('public');
  registerPublicPageRoutes(app, {
    publicPath,
    imageProxyLimiter: (_req, _res, next) => next()
  });

  const route = app.routes.find(item => item.path === '/grup/:groupId/');
  const response = createResponse();
  route.handlers.at(-1)({ params: { groupId: 'bozok-universitesi' } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.filePath, path.join(publicPath, 'app-shell.html'));
  assert.equal(response.headers['Cache-Control'], 'no-cache, max-age=0, must-revalidate');
});

test('grup dizini shell kabuğunu sunar', () => {
  const app = createFakeApp();
  const publicPath = path.resolve('public');
  registerPublicPageRoutes(app, {
    publicPath,
    imageProxyLimiter: (_req, _res, next) => next()
  });

  const shellRoute = app.routes.find(item => item.path === '/gruplar');
  const shellResponse = createResponse();
  shellRoute.handlers.at(-1)({}, shellResponse);

  assert.equal(shellResponse.filePath, path.join(publicPath, 'app-shell.html'));
  assert.equal(app.routes.some(item => item.path === '/gruplar-embedded'), false);
});

test('grup sayfası geçersiz kimliği reddeder', () => {
  const app = createFakeApp();
  registerPublicPageRoutes(app, {
    publicPath: path.resolve('public'),
    imageProxyLimiter: (_req, _res, next) => next()
  });

  const route = app.routes.find(item => item.path === '/grup/:groupId/');
  const response = createResponse();
  route.handlers.at(-1)({ params: { groupId: '../bozok' } }, response);

  assert.equal(response.statusCode, 404);
  assert.equal(response.body, 'Not found');
});

test('eski groupid ve grupid bağlantıları sorgu parametrelerini kanonik adrese taşır', () => {
  const app = createFakeApp();
  registerPublicPageRoutes(app, {
    publicPath: path.resolve('public'),
    imageProxyLimiter: (_req, _res, next) => next()
  });

  const route = app.routes.find(item => Array.isArray(item.path)
    && item.path.includes('/groupid=:groupId')
    && item.path.includes('/grupid=:groupId'));

  ['/groupid=bozok-universitesi', '/grupid=bozok-universitesi'].forEach(() => {
    const response = createResponse();
    route.handlers.at(-1)({
      params: { groupId: 'bozok-universitesi' },
      query: { invite: 'abc', role: ['member', 'reader'] }
    }, response);

    assert.equal(response.statusCode, 302);
    assert.equal(
      response.redirectLocation,
      '/grup/bozok-universitesi/?invite=abc&role=member&role=reader'
    );
  });
});

test('video API geçersiz liste türünü veritabanına erişmeden reddeder', async () => {
  const app = createFakeApp();
  registerContentRoutes(app);

  const route = app.routes.find(item => item.path === '/api/videos');
  const response = createResponse();
  await route.handlers.at(-1)({ query: { type: 'invalid', limit: '6' } }, response);

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, {
    success: false,
    message: 'Geçersiz video liste türü'
  });
});
