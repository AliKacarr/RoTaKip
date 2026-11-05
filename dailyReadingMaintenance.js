'use strict';

async function runDailyReadingMaintenance({
  seedTestData,
  processMissingStatuses,
  processInactiveMembers
}) {
  await seedTestData();
  await processMissingStatuses();
  await processInactiveMembers();
}

module.exports = { runDailyReadingMaintenance };
