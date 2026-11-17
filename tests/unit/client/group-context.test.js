'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

test('grup bağlamı geçersizleştirildiğinde oturum ve veriler yeniden alınır', async () => {
  const originalFetch = global.fetch;
  let sessionUser = null;
  let dataVersion = 1;
  const requests = [];

  global.fetch = async url => {
    requests.push(String(url));
    if (String(url).startsWith('/api/group/')) {
      return Response.json({
        group: { groupId: 'test-group', groupName: 'Test', visibility: 'public' }
      });
    }
    if (String(url).startsWith('/api/auth/me/')) {
      return sessionUser
        ? Response.json({
            group: { groupId: 'test-group', groupName: 'Test', visibility: 'public' },
            user: sessionUser
          })
        : new Response('{}', { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    if (String(url).startsWith('/api/all-data/')) {
      return Response.json({
        group: { groupId: 'test-group' },
        users: [{ _id: `user-${dataVersion}` }],
        stats: []
      });
    }
    return new Response('{}', { status: 404 });
  };

  try {
    const moduleUrl = pathToFileURL(
      path.resolve(__dirname, '../../../public/app/group-context.js')
    );
    moduleUrl.searchParams.set('test', String(Date.now()));
    const groupContext = await import(moduleUrl.href);

    const firstContext = await groupContext.resolveGroupContext('test-group');
    const firstData = await groupContext.loadGroupData(firstContext);
    assert.equal(firstContext.isAuthenticated, false);
    assert.equal(firstData.users[0]._id, 'user-1');

    sessionUser = { _id: 'member-1', authority: 'member', username: 'member', name: 'Member' };
    dataVersion = 2;
    assert.strictEqual(await groupContext.resolveGroupContext('test-group'), firstContext);
    assert.strictEqual(await groupContext.loadGroupData(firstContext), firstData);

    groupContext.invalidateGroupContext('test-group');
    const refreshedContext = await groupContext.resolveGroupContext('test-group');
    const refreshedData = await groupContext.loadGroupData(refreshedContext);

    assert.equal(refreshedContext.isAuthenticated, true);
    assert.equal(refreshedContext.user._id, 'member-1');
    assert.equal(refreshedData.users[0]._id, 'user-2');
    assert.equal(requests.filter(url => url.startsWith('/api/group/')).length, 2);
    assert.equal(requests.filter(url => url.startsWith('/api/auth/me/')).length, 2);
    assert.equal(requests.filter(url => url.startsWith('/api/all-data/')).length, 2);
  } finally {
    global.fetch = originalFetch;
  }
});
