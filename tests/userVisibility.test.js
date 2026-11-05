const test = require('node:test');
const assert = require('node:assert/strict');

const {
  VALID_USER_VISIBILITIES,
  activeAdminQuery,
  activeMemberQuery,
  activeUserQuery,
  isActiveUser,
  normalizeUserVisibility
} = require('../userVisibility');

test('eski visibility alanı olmayan kullanıcıları aktif kabul eder', () => {
  assert.equal(normalizeUserVisibility(undefined), 'aktif');
  assert.equal(isActiveUser({}), true);
  assert.deepEqual(activeUserQuery(), { visibility: { $ne: 'pasif' } });
  assert.deepEqual(activeAdminQuery(), {
    authority: 'admin',
    visibility: { $ne: 'pasif' }
  });
  assert.deepEqual(activeMemberQuery(), {
    authority: 'member',
    visibility: { $ne: 'pasif' }
  });
});

test('yalnızca pasif değeri kullanıcıyı gizler', () => {
  assert.equal(isActiveUser({ visibility: 'aktif' }), true);
  assert.equal(isActiveUser({ visibility: 'pasif' }), false);
  assert.deepEqual([...VALID_USER_VISIBILITIES], ['aktif', 'pasif']);
});
