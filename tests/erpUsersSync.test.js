const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildHistoricalStatuses,
  buildLatestTeams,
  buildSyncPlan,
  extractFormUsersFromHtml
} = require('../anket/erpUsersSync');

function formHtml(names) {
  const options = names.map((name) => [name, null, null, null, 0]);
  const data = [
    null,
    [
      null,
      [
        [
          206324904,
          'Ad Soyad (Full Name)',
          null,
          3,
          [[1833939737, options, true]]
        ]
      ]
    ]
  ];
  return `<script>var FB_PUBLIC_LOAD_DATA_ = ${JSON.stringify(data)};</script>`;
}

function row(timestamp, name, team, risaleHours) {
  return [timestamp, name, team, 0, 0, 0, risaleHours, 0, ''];
}

test('Google Form Ad Soyad seçeneklerini normalize edip tekilleştirir', () => {
  const users = extractFormUsersFromHtml(formHtml([' Ali Kaçar ', 'Süleyman   Uzan']));

  assert.equal(users.size, 2);
  assert.equal(users.get('ali\0kaçar'), 'Ali Kaçar');
  assert.equal(users.get('süleyman\0uzan'), 'Süleyman Uzan');
});

test('kişinin son Sheet kaydındaki ekibi hedef grup olarak seçer', () => {
  const users = extractFormUsersFromHtml(formHtml(['Ali Kaçar']));
  const teamInfo = buildLatestTeams([
    row('2025-01-01 10:00:00', 'Ali Kaçar', 'Ekip A', 1),
    row('2025-01-02 10:00:00', 'Ali Kaçar', 'Ekip B', 1)
  ], users);

  assert.equal(teamInfo.targets.get('ali\0kaçar').groupId, 'sko-ekip-b');
  assert.equal(teamInfo.unresolved.length, 0);
});

test('eşitleme planı doğru gruptakini korur, yanlış gruptakini taşır ve Form dışındakini siler', () => {
  const formUsers = new Map([
    ['ali\0kaçar', 'Ali Kaçar'],
    ['veli\0demir', 'Veli Demir']
  ]);
  const teamInfo = {
    targets: new Map([
      ['ali\0kaçar', { nameKey: 'ali\0kaçar', displayName: 'Ali Kaçar', groupId: 'sko-ekip-a' }],
      ['veli\0demir', { nameKey: 'veli\0demir', displayName: 'Veli Demir', groupId: 'sko-ekip-b' }]
    ]),
    unresolved: []
  };
  const currentUsers = [
    { _id: '1', name: 'Ali Kaçar', groupId: 'sko-ekip-a', authority: 'member' },
    { _id: '2', name: 'Veli Demir', groupId: 'sko-ekip-a', authority: 'member' },
    { _id: '3', name: 'Eski Yönetici', groupId: 'sko-ekip-c', authority: 'admin' }
  ];

  const plan = buildSyncPlan(formUsers, teamInfo, currentUsers);

  assert.equal(plan.unchanged.length, 1);
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].target.groupId, 'sko-ekip-b');
  assert.equal(plan.removals.length, 1);
  assert.equal(plan.removals[0].user.authority, 'admin');
});

test('%25 silme kabul edilir, daha fazlası engellenir', () => {
  const formUsers = new Map([
    ['a', 'A'],
    ['b', 'B'],
    ['c', 'C']
  ]);
  const targets = new Map([
    ['a', { nameKey: 'a', displayName: 'A', groupId: 'sko-ekip-a' }],
    ['b', { nameKey: 'b', displayName: 'B', groupId: 'sko-ekip-a' }],
    ['c', { nameKey: 'c', displayName: 'C', groupId: 'sko-ekip-a' }]
  ]);
  const fourUsers = ['A', 'B', 'C', 'D'].map((name, index) => ({
    _id: String(index),
    name,
    groupId: 'sko-ekip-a',
    authority: 'member'
  }));

  const atLimit = buildSyncPlan(formUsers, { targets, unresolved: [] }, fourUsers);
  assert.equal(atLimit.removals.length, 1);
  assert.equal(atLimit.deleteGuardExceeded, false);

  const overLimit = buildSyncPlan(
    new Map([['a', 'A'], ['b', 'B']]),
    { targets: new Map([...targets].filter(([key]) => key !== 'c')), unresolved: [] },
    fourUsers
  );
  assert.equal(overLimit.removals.length, 2);
  assert.equal(overLimit.deleteGuardExceeded, true);
});

test('geçmiş ilk pozitif okumadan başlar, boş ve sıfır geçmiş günleri okumadım yapar', () => {
  const rows = [
    row('2025-01-01 10:00:00', 'Ali Kaçar', 'Ekip A', 0),
    row('2025-01-02 10:00:00', 'Ali Kaçar', 'Ekip A', 1),
    row('2025-01-04 10:00:00', 'Ali Kaçar', 'Ekip A', 0)
  ];

  const statuses = buildHistoricalStatuses(rows, 'ali\0kaçar', '2025-01-05');

  assert.deepEqual(statuses, [
    { date: '2025-01-02', status: 'okudum', amount: 60, __v: 0 },
    { date: '2025-01-03', status: 'okumadım', __v: 0 },
    { date: '2025-01-04', status: 'okumadım', __v: 0 }
  ]);
});

test('bugün eksikse kayıt oluşturmaz, açıkça sıfırsa okumadım oluşturur', () => {
  const baseRows = [row('2025-01-02 10:00:00', 'Ali Kaçar', 'Ekip A', 1)];
  const missingToday = buildHistoricalStatuses(baseRows, 'ali\0kaçar', '2025-01-03');
  assert.equal(missingToday.at(-1).date, '2025-01-02');

  const zeroToday = buildHistoricalStatuses([
    ...baseRows,
    row('2025-01-03 10:00:00', 'Ali Kaçar', 'Ekip A', 0)
  ], 'ali\0kaçar', '2025-01-03');
  assert.deepEqual(zeroToday.at(-1), {
    date: '2025-01-03',
    status: 'okumadım',
    __v: 0
  });
});

test('hiç pozitif okuması olmayan yeni kullanıcıya okuma belgesi üretmez', () => {
  const statuses = buildHistoricalStatuses([
    row('2025-01-02 10:00:00', 'Ali Kaçar', 'Ekip A', 0)
  ], 'ali\0kaçar', '2025-01-03');

  assert.deepEqual(statuses, []);
});
