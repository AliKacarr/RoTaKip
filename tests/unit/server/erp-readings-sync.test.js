const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ERP_READ_FIELD_KEY,
  buildCeteleUpdate,
  buildEntriesByNameKey,
  buildErpCeteleFields,
  buildReadingInsert,
  buildReadingUpdate,
  erpCeteleKeysFor,
  parseErpCeteleValues,
  planDay,
  sheetTimestampToDate,
  toComparableKey
} = require('../../../src/server/integrations/erp/erp-readings-sync');
const {
  getCeteleConfig,
  sanitizeEntryValues,
  validateCeteleFields
} = require('../../../src/server/modules/cetele/cetele.service');

// Tablo sütunları: A zaman, B ad, C ekip, D Kur'an, E Tesbihat, F Cevşen, G Risale,
// H Hizmet, I Görevler, J Namaz, K ad (alternatif)
function row(timestamp, name, risaleHours, extra = {}) {
  return [
    timestamp,
    name,
    'Ekip A',
    extra.kuran ?? 0,
    extra.tesbihat ?? 0,
    extra.cevsen ?? 0,
    risaleHours,
    extra.hizmet ?? 0,
    extra.gorevler ?? '',
    extra.namaz ?? '',
    ''
  ];
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

test('geçmiş aktarımında okuma yalnız eksik güne eklenir', () => {
  assert.deepEqual(buildReadingInsert(1.25), {
    $setOnInsert: { status: 'okudum', amount: 75, __v: 0 }
  });
  assert.deepEqual(buildReadingInsert(0), {
    $setOnInsert: { status: 'okumadım', __v: 0 }
  });
});

test('ERP alışkanlık tanımları sitedeki doğrulamadan geçer ve ilk alan okuma alanıdır', () => {
  const { fields, error } = validateCeteleFields(buildErpCeteleFields(), []);
  assert.equal(error, undefined);
  assert.deepEqual(fields.map(field => field.key), ['risale', 'namaz', 'kuran', 'tesbihat', 'cevsen', 'hizmet', 'gorevler']);
  assert.ok(fields.every(field => field.required === true));
  const config = getCeteleConfig({ amountType: 'dakika', ceteleFields: fields });
  assert.equal(config.readField, ERP_READ_FIELD_KEY);
  assert.equal(config.fields[0].unit, 'dakika');
  assert.deepEqual(erpCeteleKeysFor(fields), ['namaz', 'kuran', 'tesbihat', 'cevsen', 'hizmet', 'gorevler']);
});

test('form satırındaki diğer cevapları alışkanlık değerlerine çevirir', () => {
  const values = parseErpCeteleValues(row(46353.99, 'Ali Kaçar', '0.50', {
    kuran: 40,
    tesbihat: 5,
    cevsen: 10,
    hizmet: '1.5',
    gorevler: '  Uhuvvet sohbetleri  ',
    namaz: '5'
  }));
  assert.deepEqual(values, {
    namaz: 5,
    kuran: 40,
    tesbihat: 5,
    cevsen: 10,
    hizmet: 1.5,
    gorevler: 'Uhuvvet sohbetleri'
  });
  // Sitedeki kayıt doğrulaması aynı değerleri aynen kabul eder.
  const fields = validateCeteleFields(buildErpCeteleFields(), []).fields;
  assert.deepEqual(sanitizeEntryValues(fields, values), { values });
});

test('boş, aralık dışı ve seçenek dışı hücreleri yazmaz; metni olduğu gibi korur', () => {
  const values = parseErpCeteleValues(row(46353.99, 'Ali Kaçar', 0, {
    kuran: -2,
    tesbihat: 7,
    cevsen: 'abc',
    hizmet: 0.3,
    gorevler: '.',
    namaz: ''
  }));
  assert.deepEqual(values, { gorevler: '.' });
  assert.equal(parseErpCeteleValues(row(1, 'A', 0, { gorevler: 'x'.repeat(300) })).gorevler.length, 280);
  assert.equal(parseErpCeteleValues(row(1, 'A', 0, { tesbihat: 0 })).tesbihat, 0);
});

test('risale geçersiz olsa da diğer cevaplar geçerliyse satırı kullanır', () => {
  const parsed = buildEntriesByNameKey([
    row('25.10.2026 10:00:00', 'Ali Kaçar', 'bilinmiyor', { kuran: 5 })
  ], new Set(['2026-10-25']));
  const [entry] = parsed.byNameKey.get(toComparableKey('Ali Kaçar'));
  assert.equal(entry.hours, null);
  assert.equal(entry.values.kuran, 5);
  assert.equal(parsed.invalidRisale, 1);
});

test('tarih penceresi verilmezse tablodaki tüm günleri alır', () => {
  const parsed = buildEntriesByNameKey([
    row('29.08.2025 23:00:00', 'Ali Kaçar', 1),
    row('25.10.2026 10:00:00', 'Ali Kaçar', 0.5)
  ], null);
  const dates = parsed.byNameKey.get(toComparableKey('Ali Kaçar')).map(entry => entry.date).sort();
  assert.deepEqual(dates, ['2025-08-29', '2026-10-25']);
});

test('çetele güncellemesi yalnız fark varsa üretilir ve ERP dışı anahtarlara dokunmaz', () => {
  const keys = ['namaz', 'kuran'];
  const now = new Date('2026-10-25T10:00:00Z');
  assert.equal(buildCeteleUpdate({ namaz: 5, kuran: 2 }, { namaz: 5, kuran: 2, ozel: 1 }, keys, now), null);
  assert.deepEqual(buildCeteleUpdate({ namaz: 4 }, { namaz: 5, kuran: 2, ozel: 1 }, keys, now), {
    update: {
      $set: { 'values.namaz': 4, updatedAt: now },
      $unset: { 'values.kuran': '' }
    }
  });
  assert.deepEqual(buildCeteleUpdate({ kuran: 10 }, null, keys, now), {
    update: { $set: { 'values.kuran': 10, updatedAt: now } }
  });
  assert.deepEqual(buildCeteleUpdate({}, { namaz: 5 }, keys, now), { deleteDoc: true });
  assert.equal(buildCeteleUpdate({}, null, keys, now), null);
});

test('alan tanımı olmayan ya da ERP alanı arşivlenmiş grupta çeteleye yazılmaz', () => {
  assert.deepEqual(erpCeteleKeysFor(undefined), []);
  const fields = buildErpCeteleFields().map(field => (
    field.key === 'namaz' ? { ...field, archived: true } : field
  ));
  assert.ok(!erpCeteleKeysFor(fields).includes('namaz'));
});

test('tablo saatini Istanbul saatine göre gerçek ana çevirir', () => {
  // 46353.5 = 2026-11-27 12:00 Istanbul = 09:00 UTC
  assert.equal(sheetTimestampToDate(46353.5).toISOString(), '2026-11-27T09:00:00.000Z');
  assert.equal(sheetTimestampToDate('27.11.2026 12:00:00').toISOString(), '2026-11-27T09:00:00.000Z');
  assert.equal(sheetTimestampToDate(''), null);
  assert.equal(sheetTimestampToDate('abc'), null);
});

// Son yazan kazanır
const KEYS = ['namaz', 'kuran'];
const NOW = new Date('2026-11-28T20:00:00Z');
const formAt = new Date('2026-11-28T10:00:00Z');
function entryAt(submittedAt, values = { namaz: 5, kuran: 10 }, hours = 1) {
  return { hours, values, submittedAt };
}
function plan(entry, existingReading, existingCetele, readingsMode) {
  return planDay({ entry, existingReading, existingCetele, keys: KEYS, readingsMode, now: NOW });
}

test('formdan sonra siteden değişen gün ezilmez', () => {
  const siteLater = new Date('2026-11-28T11:00:00Z');
  const result = plan(
    entryAt(formAt),
    { _id: 1, status: 'okudum', amount: 30, updatedAt: siteLater },
    { _id: 2, values: { namaz: 3, kuran: 10 }, updatedAt: siteLater }
  );
  assert.equal(result.skipped, true);
});

test('siteden sonra gelen form (ikinci gönderim dahil) siteyi ezer', () => {
  const siteEarlier = new Date('2026-11-28T09:00:00Z');
  const result = plan(
    entryAt(formAt),
    { _id: 1, status: 'okudum', amount: 30, updatedAt: siteEarlier },
    { _id: 2, values: { namaz: 3, kuran: 10 }, updatedAt: siteEarlier }
  );
  assert.equal(result.skipped, undefined);
  assert.equal(result.reading.$set.amount, 60);
  assert.deepEqual(result.reading.$set.updatedAt, formAt);
  assert.equal(result.cetele.update.$set['values.namaz'], 5);
  assert.deepEqual(result.cetele.update.$set.updatedAt, formAt);
});

test('yalnız okuma sitede daha yeni güncellenmişse gün atlanır', () => {
  const siteLater = new Date('2026-11-28T11:00:00Z');
  const result = plan(
    entryAt(formAt),
    { _id: 1, status: 'okudum', amount: 15, updatedAt: siteLater },
    { _id: 2, values: { namaz: 5, kuran: 10 }, updatedAt: formAt }
  );
  assert.equal(result.skipped, true);
});

test('zaman damgası olmayan eski kayıtta form kazanır', () => {
  const result = plan(entryAt(formAt), { _id: 1, status: 'okudum', amount: 15 }, null);
  assert.equal(result.reading.$set.amount, 60);
  assert.equal(result.cetele.update.$set['values.kuran'], 10);
});

test('fark yoksa yazmaz; damga formdan ileriyse formun anına çeker', () => {
  const same = plan(
    entryAt(formAt),
    { _id: 1, status: 'okudum', amount: 60, updatedAt: formAt },
    { _id: 2, values: { namaz: 5, kuran: 10 }, updatedAt: formAt }
  );
  assert.equal(same.reading, undefined);
  assert.equal(same.cetele, undefined);
  assert.deepEqual(same.normalize, []);

  const polluted = plan(
    entryAt(formAt),
    { _id: 1, status: 'okudum', amount: 60 },
    { _id: 2, values: { namaz: 5, kuran: 10 }, updatedAt: NOW }
  );
  assert.deepEqual(polluted.normalize, [{ collection: 'cetele', filter: { _id: 2 } }]);
});

test('geçmiş aktarımı modunda mevcut okuma ezilmez ama çetele eşitlenir', () => {
  const result = plan(
    entryAt(formAt),
    { _id: 1, status: 'okudum', amount: 15 },
    null,
    'insert-missing'
  );
  assert.equal(result.reading, null);
  assert.equal(result.cetele.update.$set['values.namaz'], 5);
});
