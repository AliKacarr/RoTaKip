const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildEntriesByNameKey,
  buildReadingUpdate,
  toComparableKey
} = require('../anket/erpReadingsSync');

function row(timestamp, name, risaleHours) {
  return [timestamp, name, 'Ekip A', 0, 0, 0, risaleHours, 0, ''];
}

test('aynı kişi ve gün için son Google Form girdisini kabul eder', () => {
  const parsed = buildEntriesByNameKey([
    row('25.10.2026 10:00:00', 'Ali Kaçar', 0.25),
    row('25.10.2026 11:00:00', 'Ali Kaçar', 0.5)
  ], new Set(['2026-10-25']));

  const entries = parsed.byNameKey.get(toComparableKey('Ali Kaçar'));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].hours, 0.5);
  assert.equal(parsed.validPositive, 2);
  assert.equal(parsed.validZero, 0);
});

test('son Google Form girdisi sıfırsa önceki pozitif miktarın yerine sıfırı seçer', () => {
  const parsed = buildEntriesByNameKey([
    row('25.10.2026 10:00:00', 'Ali Kaçar', 0.25),
    row('25.10.2026 11:00:00', 'Ali Kaçar', 0)
  ], new Set(['2026-10-25']));

  const entries = parsed.byNameKey.get(toComparableKey('Ali Kaçar'));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].hours, 0);
  assert.equal(parsed.validPositive, 1);
  assert.equal(parsed.validZero, 1);
});

test('pozitif okuma miktarını dakika cinsinden okudum kaydına çevirir', () => {
  assert.deepEqual(buildReadingUpdate(0.5), {
    $set: {
      status: 'okudum',
      amount: 30,
      __v: 0
    }
  });
});

test('sıfır değerini okumadım yapar ve eski amount alanını kaldırır', () => {
  assert.deepEqual(buildReadingUpdate(0), {
    $set: {
      status: 'okumadım',
      __v: 0
    },
    $unset: { amount: '' }
  });
});
