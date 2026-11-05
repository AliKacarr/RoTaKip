const test = require('node:test');
const assert = require('node:assert/strict');

const { deleteGroupUser, passivateGroupUser } = require('../groupUserLifecycle');

test('silme kullanıcıyı ve ilişkili bütün verileri temizler', async () => {
  const calls = [];
  const user = { _id: 'u1', profileImage: 'profile-url' };
  const userFilter = { _id: 'u1', authority: 'member' };

  const result = await deleteGroupUser({
    user,
    userFilter,
    users: {
      findOneAndDelete: async filter => {
        calls.push(['deleteUser', filter]);
        return user;
      }
    },
    readingStatuses: {
      deleteMany: async filter => calls.push(['deleteReadings', filter])
    },
    invalidateSessions: async userId => calls.push(['invalidateSessions', userId]),
    deleteInvites: async userId => calls.push(['deleteInvites', userId]),
    deleteProfileImage: async image => calls.push(['deleteProfileImage', image])
  });

  assert.equal(result.applied, true);
  assert.deepEqual(result.cleanupErrors, []);
  assert.deepEqual(calls, [
    ['deleteUser', userFilter],
    ['invalidateSessions', 'u1'],
    ['deleteReadings', { userId: 'u1' }],
    ['deleteInvites', 'u1'],
    ['deleteProfileImage', 'profile-url']
  ]);
});

test('pasife alma okuma geçmişini silmeden erişimi temizler', async () => {
  const calls = [];
  const user = { _id: 'u2' };

  const result = await passivateGroupUser({
    user,
    userFilter: { _id: 'u2', authority: 'member' },
    users: {
      findOneAndUpdate: async (filter, update, options) => {
        calls.push(['updateUser', filter, update, options]);
        return { ...user, visibility: 'pasif' };
      }
    },
    passiveVisibility: 'pasif',
    invalidateSessions: async userId => calls.push(['invalidateSessions', userId]),
    deleteInvites: async userId => calls.push(['deleteInvites', userId])
  });

  assert.equal(result.applied, true);
  assert.deepEqual(result.cleanupErrors, []);
  assert.deepEqual(calls, [
    ['updateUser', { _id: 'u2', authority: 'member' }, { $set: { visibility: 'pasif' } }, { returnDocument: 'after' }],
    ['invalidateSessions', 'u2'],
    ['deleteInvites', 'u2']
  ]);
});

test('eşzamanlı değişiklikte kullanıcı filtresi uyuşmazsa temizlik yapmaz', async () => {
  let cleanupCalled = false;
  const result = await deleteGroupUser({
    user: { _id: 'u3' },
    users: { findOneAndDelete: async () => null },
    readingStatuses: { deleteMany: async () => { cleanupCalled = true; } },
    invalidateSessions: async () => { cleanupCalled = true; },
    deleteInvites: async () => { cleanupCalled = true; },
    deleteProfileImage: async () => { cleanupCalled = true; }
  });

  assert.equal(result.applied, false);
  assert.equal(cleanupCalled, false);
});

test('ikincil temizlik hatalarını diğer temizlikleri durdurmadan döndürür', async () => {
  const calls = [];
  const result = await passivateGroupUser({
    user: { _id: 'u4' },
    users: { findOneAndUpdate: async () => ({ _id: 'u4', visibility: 'pasif' }) },
    passiveVisibility: 'pasif',
    invalidateSessions: async () => { throw new Error('session failed'); },
    deleteInvites: async () => calls.push('invites cleaned')
  });

  assert.equal(result.applied, true);
  assert.equal(result.cleanupErrors.length, 1);
  assert.equal(result.cleanupErrors[0].message, 'session failed');
  assert.deepEqual(calls, ['invites cleaned']);
});
