const test = require('node:test');
const assert = require('node:assert/strict');

const { runDailyReadingMaintenance } = require('../dailyReadingMaintenance');

test('06:00 bakım adımlarını sırayla ve her birinin tamamlanmasını bekleyerek çalıştırır', async () => {
  const calls = [];

  await runDailyReadingMaintenance({
    seedTestData: async () => {
      calls.push('test:start');
      await Promise.resolve();
      calls.push('test:end');
    },
    processMissingStatuses: async () => {
      calls.push('unread:start');
      await Promise.resolve();
      calls.push('unread:end');
    },
    processInactiveMembers: async () => {
      calls.push('inactive:start');
      await Promise.resolve();
      calls.push('inactive:end');
    }
  });

  assert.deepEqual(calls, [
    'test:start',
    'test:end',
    'unread:start',
    'unread:end',
    'inactive:start',
    'inactive:end'
  ]);
});
