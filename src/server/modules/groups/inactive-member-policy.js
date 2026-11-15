'use strict';

const INACTIVE_MEMBER_ACTION_NONE = 'none';
const INACTIVE_MEMBER_ACTION_DELETE = 'delete';
const INACTIVE_MEMBER_ACTION_PASSIVE = 'passive';
const VALID_INACTIVE_MEMBER_ACTIONS = new Set([
  INACTIVE_MEMBER_ACTION_NONE,
  INACTIVE_MEMBER_ACTION_DELETE,
  INACTIVE_MEMBER_ACTION_PASSIVE
]);

function normalizeInactiveMemberAction(value) {
  return VALID_INACTIVE_MEMBER_ACTIONS.has(value)
    ? value
    : INACTIVE_MEMBER_ACTION_NONE;
}

function isDateKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function shiftDateKey(dateKey, dayCount) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + dayCount);
  return date.toISOString().slice(0, 10);
}

/**
 * Tarayicidaki "Art arda okumayanlar" hesabi ile ayni kurallari uygular.
 * Bugun kayitsizsa dunden, acikca okumadim ise bugunden baslar; ilk okudum
 * kaydinda veya kullanicinin en eski kaydinda durur.
 */
function calculateConsecutiveMissedDays(readingStatuses, todayKey) {
  if (!isDateKey(todayKey) || !Array.isArray(readingStatuses)) return 0;

  const statusByDate = new Map();
  for (const record of readingStatuses) {
    if (!isDateKey(record?.date)) continue;
    statusByDate.set(record.date, record.status);
  }

  const dates = [...statusByDate.keys()].sort();
  if (dates.length === 0) return 0;

  const todayStatus = statusByDate.get(todayKey);
  if (todayStatus === 'okudum') return 0;

  const earliestDate = dates[0];
  let currentDate = todayStatus === 'okumadım'
    ? todayKey
    : shiftDateKey(todayKey, -1);
  let missedDays = 0;

  while (true) {
    if (statusByDate.get(currentDate) === 'okudum') break;

    missedDays += 1;
    if (currentDate <= earliestDate) break;
    currentDate = shiftDateKey(currentDate, -1);
  }

  return missedDays;
}

module.exports = {
  INACTIVE_MEMBER_ACTION_DELETE,
  INACTIVE_MEMBER_ACTION_NONE,
  INACTIVE_MEMBER_ACTION_PASSIVE,
  VALID_INACTIVE_MEMBER_ACTIONS,
  calculateConsecutiveMissedDays,
  normalizeInactiveMemberAction
};
