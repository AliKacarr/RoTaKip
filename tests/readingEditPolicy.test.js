const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeReadingEditPolicy,
  isReadingDateAllowedByPolicy
} = require('../readingEditPolicy');

const today = '2026-11-12';
const yesterday = '2026-11-11';

test('eksik veya geçersiz düzenleme politikası tüm geçmiş olarak kabul edilir', () => {
  assert.equal(normalizeReadingEditPolicy(undefined), 'all');
  assert.equal(normalizeReadingEditPolicy('invalid'), 'all');
  assert.equal(isReadingDateAllowedByPolicy('2025-01-01', undefined, today, yesterday), true);
});

test('yalnız bugün politikası sadece bugünü kabul eder', () => {
  assert.equal(isReadingDateAllowedByPolicy(today, 'today', today, yesterday), true);
  assert.equal(isReadingDateAllowedByPolicy(yesterday, 'today', today, yesterday), false);
});

test('bugün ve dün politikası yalnızca iki günü kabul eder', () => {
  assert.equal(isReadingDateAllowedByPolicy(today, 'today_yesterday', today, yesterday), true);
  assert.equal(isReadingDateAllowedByPolicy(yesterday, 'today_yesterday', today, yesterday), true);
  assert.equal(isReadingDateAllowedByPolicy('2026-11-10', 'today_yesterday', today, yesterday), false);
});

test('hiçbir politika gelecek tarihi kabul etmez', () => {
  assert.equal(isReadingDateAllowedByPolicy('2026-11-13', 'all', today, yesterday), false);
});
