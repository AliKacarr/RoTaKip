'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { registerGroupRoutes } = require('../../../src/server/modules/groups/group.routes');

function setup({ groups = [], memberCounts = {} } = {}) {
  const routes = new Map();
  const app = {
    get: (routePath, ...handlers) => routes.set(`GET ${routePath}`, handlers),
    post: () => {},
    put: () => {},
    delete: () => {}
  };
  const filters = [];
  const UserGroup = {
    find(filter) {
      filters.push(filter);
      const chain = { sort: () => chain, skip: () => chain, limit: () => chain, lean: async () => groups };
      return chain;
    },
    aggregate: async pipeline => {
      filters.push(pipeline[0].$match);
      return groups;
    },
    countDocuments: async () => groups.length
  };
  registerGroupRoutes(app, {
    uploadGroupImage: { fields: () => (_req, _res, next) => next(), single: () => (_req, _res, next) => next() },
    UserGroup,
    activeUserQuery: () => ({}),
    getGroupCollections: groupId => ({
      users: { countDocuments: async () => memberCounts[groupId] ?? 0 }
    })
  });
  return { handler: routes.get('GET /api/groups').at(-1), filters };
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('grup arama metni regex olarak yorumlanmaz', async () => {
  const { handler, filters } = setup();
  await handler({ query: { search: '(a+)+.*[x' } }, createResponse());
  const patterns = filters[0].$or.map(condition => Object.values(condition)[0].$regex);
  patterns.forEach(pattern => {
    assert.equal(pattern, '\\(a\\+\\)\\+\\.\\*\\[x');
    assert.doesNotThrow(() => new RegExp(pattern));
  });
});

test('grup arama metni dize değilse ve çok uzunsa güvenli şekilde işlenir', async () => {
  const { handler, filters } = setup();
  await handler({ query: { search: { $ne: '' } } }, createResponse());
  assert.deepEqual(filters[0], { visibility: 'public' });

  await handler({ query: { search: 'a'.repeat(500) } }, createResponse());
  assert.equal(filters[1].$or[0].groupName.$regex.length, 60);
});

test('grup listesi her gruba üye sayısını ekler ve gizli grupları aramaz', async () => {
  const { handler, filters } = setup({
    groups: [{ groupId: 'a', groupName: 'A' }, { groupId: 'b', groupName: 'B' }],
    memberCounts: { a: 12 }
  });
  const res = createResponse();
  await handler({ query: { search: 'a' } }, res);
  assert.deepEqual(res.body.groups.map(group => group.memberCount), [12, 0]);
  assert.equal(res.body.total, 2);
  assert.equal(filters[0].visibility, 'public');
});
