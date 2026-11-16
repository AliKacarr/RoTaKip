'use strict';

const ISTANBUL_TIME_ZONE = 'Europe/Istanbul';

function istanbulDateKey(at = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ISTANBUL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = Object.fromEntries(formatter.formatToParts(at).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftDateKey(dateKey, dayCount) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + dayCount);
  return date.toISOString().slice(0, 10);
}

function istanbulYesterdayKey(at = new Date()) {
  return shiftDateKey(istanbulDateKey(at), -1);
}

module.exports = {
  ISTANBUL_TIME_ZONE,
  istanbulDateKey,
  istanbulYesterdayKey,
  shiftDateKey
};
