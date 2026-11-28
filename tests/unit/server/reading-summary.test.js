'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createReadingSummaryService,
  currentStreak,
  summarizeMemberReadings
} = require('../../../src/server/modules/readings/reading-summary.service');
const { shiftDateKey } = require('../../../src/server/shared/date-time');

const TODAY = '2026-11-27';
const USER_A = '64b000000000000000000001';
const USER_B = '64b000000000000000000002';
const USER_PASSIVE = '64b000000000000000000003';

function days(...entries) {
  return entries.map(([offset, status, amount]) => ({
    date: shiftDateKey(TODAY, -offset),
    status,
    ...(amount === undefined ? {} : { amount })
  }));
}

test('seri bugün okumadım ise sıfırlanır, bugün boşsa dünden sayılır', () => {
  const run = records => currentStreak(
    new Map(records.map(record => [record.date, record.status])),
    TODAY,
    shiftDateKey
  );
  assert.equal(run(days([0, 'okudum'], [1, 'okudum'], [2, 'okudum'], [4, 'okudum'])), 3);
  assert.equal(run(days([1, 'okudum'], [2, 'okudum'])), 2);
  assert.equal(run(days([0, 'okumadım'], [1, 'okudum'], [2, 'okudum'])), 0);
  assert.equal(run([]), 0);
});

test('özet bugünkü durumu, miktarı, son 7 günü ve toplam okunan günü verir', () => {
  const summary = summarizeMemberReadings(
    [...days([0, 'okudum', 12], [1, 'okumadım'], [2, 'okudum'], [30, 'okudum', 5]), { date: 'x', status: 'okudum' }, { date: TODAY, status: 'bilinmiyor' }, null],
    { today: TODAY, shiftDateKey }
  );
  assert.equal(summary.status, 'okudum');
  assert.equal(summary.amount, 12);
  assert.equal(summary.streak, 1);
  assert.equal(summary.previousStreak, 0);
  assert.equal(summary.readDays, 4);
  assert.equal(summary.week.length, 7);
  assert.equal(summary.week[6].date, TODAY);
  assert.equal(summary.week[0].date, shiftDateKey(TODAY, -6));
  assert.deepEqual(summary.week.slice(4).map(day => day.status), ['okudum', 'okumadım', 'okudum']);
});

function createFakeGroups() {
  const queryOf = result => ({
    select() { return this; },
    lean: async () => result
  });
  const users = {
    '1': [
      { _id: USER_A, authority: 'admin', visibility: 'aktif' },
      { _id: USER_B, authority: 'member', visibility: 'aktif' },
      { _id: USER_PASSIVE, authority: 'member', visibility: 'pasif' }
    ]
  };
  const readings = [
    { userId: USER_A, date: TODAY, status: 'okudum', amount: 10 },
    { userId: USER_A, date: shiftDateKey(TODAY, -1), status: 'okudum' },
    { userId: USER_B, date: TODAY, status: 'okudum' },
    { userId: USER_PASSIVE, date: TODAY, status: 'okudum' }
  ];
  const idsOf = filter => (filter.userId && filter.userId.$in) || [String(filter.userId)];
  const model = documents => ({
    find: filter => queryOf(documents.filter(item => idsOf(filter).includes(item.userId) && item.date >= (filter.date?.$gte || ''))),
    countDocuments: async filter => documents.filter(item => idsOf(filter).includes(item.userId)
      && item.date === filter.date && (!filter.status || item.status === filter.status)).length
  });
  return {
    getGroupCollections(groupId) {
      const list = users[groupId === 'okuma' || groupId === 'cetele' ? '1' : '2'] || [];
      return {
        users: {
          findById: id => queryOf(list.find(user => user._id === String(id)) || null),
          find: () => queryOf(list.filter(user => user.visibility !== 'pasif'))
        },
        readingStatuses: model(readings)
      };
    }
  };
}

test('üyelik özeti grupları okuma alanına göre özetler; pasif üyeleri ve silinmiş grupları eler', async () => {
  const { getGroupCollections } = createFakeGroups();
  const groups = [
    { groupId: 'okuma', groupName: 'Okuma Grubu', amountType: 'dakika', readingEditPolicy: 'today' },
    { groupId: 'cetele', groupName: 'Çok alanlı grup', ceteleFields: [{ key: 'kitap', label: 'Kitap okuma', type: 'sayi', unit: 'sayfa', step: 1 }] },
    { groupId: 'pasif', groupName: 'Pasif Üyelik' }
  ];
  const { readingSummaryService } = createReadingSummaryService({
    UserGroup: { find: () => ({ lean: async () => groups }) },
    activeUserQuery: () => ({}),
    getGroupCollections,
    isActiveUser: user => user.visibility !== 'pasif',
    istanbulDateKey: () => TODAY,
    normalizeAmountType: value => (value === 'dakika' ? 'dakika' : 'sayfa'),
    normalizeReadingEditPolicy: value => value || 'all',
    shiftDateKey
  });

  const result = await readingSummaryService.summarizeMemberships({
    okuma: { userId: USER_A },
    cetele: { userId: USER_B },
    pasif: { userId: USER_PASSIVE },
    silinmis: { userId: USER_A }
  });

  assert.equal(result.today, TODAY);
  assert.deepEqual(result.groups.map(group => group.groupId), ['okuma', 'cetele']);
  assert.deepEqual(result.staleGroupIds.sort(), ['pasif', 'silinmis']);

  const reading = result.groups[0];
  assert.equal(reading.memberCount, 2);
  assert.equal(reading.readToday, 2);
  assert.equal(reading.amountType, 'dakika');
  assert.equal(reading.readingEditPolicy, 'today');
  assert.equal(reading.me.status, 'okudum');
  assert.equal(reading.me.amount, 10);
  assert.equal(reading.me.streak, 2);
  assert.equal(reading.me.previousStreak, 1);

  // Her grupta "okudum" bilgisi okuma alanının (ilk alanın) kayıtlarından gelir.
  const multiField = result.groups[1];
  assert.equal('trackingMode' in multiField, false);
  assert.equal(multiField.readToday, 2);
  assert.equal(multiField.me.status, 'okudum');
});

test('oturumda üyelik yoksa sorgu yapılmaz', async () => {
  const { readingSummaryService } = createReadingSummaryService({
    UserGroup: { find: () => { throw new Error('çağrılmamalı'); } },
    istanbulDateKey: () => TODAY,
    shiftDateKey
  });
  assert.deepEqual(await readingSummaryService.summarizeMemberships(undefined), { groups: [], staleGroupIds: [] });
});
