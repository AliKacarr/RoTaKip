const test = require('node:test');
const assert = require('node:assert/strict');

const {
  VALID_INACTIVE_MEMBER_ACTIONS,
  calculateConsecutiveMissedDays,
  normalizeInactiveMemberAction
} = require('../inactiveMemberPolicy');

test('eksik veya geçersiz işlem kapalı kabul edilir', () => {
  assert.equal(normalizeInactiveMemberAction(undefined), 'none');
  assert.equal(normalizeInactiveMemberAction('unexpected'), 'none');
  assert.deepEqual([...VALID_INACTIVE_MEMBER_ACTIONS], ['none', 'delete', 'passive']);
});

test('dünden geriye tam 15 günlük okumama serisini bulur', () => {
  const history = [{ date: '2026-10-21', status: 'okumadım' }];
  assert.equal(calculateConsecutiveMissedDays(history, '2026-11-05'), 15);
});

test('14 günlük seri eşik altında kalır', () => {
  const history = [{ date: '2026-10-22', status: 'okumadım' }];
  assert.equal(calculateConsecutiveMissedDays(history, '2026-11-05'), 14);
});

test('kayıtsız günleri sayar ve ilk okudum kaydında durur', () => {
  const history = [
    { date: '2026-10-01', status: 'okumadım' },
    { date: '2026-10-28', status: 'okudum' },
    { date: '2026-11-02', status: 'okumadım' }
  ];
  assert.equal(calculateConsecutiveMissedDays(history, '2026-11-05'), 7);
});

test('bugünkü okudum seriyi sıfırlar, bugünkü okumadım bugünü sayar', () => {
  assert.equal(calculateConsecutiveMissedDays([
    { date: '2026-10-01', status: 'okumadım' },
    { date: '2026-11-05', status: 'okudum' }
  ], '2026-11-05'), 0);

  assert.equal(calculateConsecutiveMissedDays([
    { date: '2026-11-04', status: 'okumadım' },
    { date: '2026-11-05', status: 'okumadım' }
  ], '2026-11-05'), 2);
});

test('hiç geçerli okuma kaydı olmayan kullanıcıyı atlar', () => {
  assert.equal(calculateConsecutiveMissedDays([], '2026-11-05'), 0);
  assert.equal(calculateConsecutiveMissedDays([{ status: 'okumadım' }], '2026-11-05'), 0);
});
