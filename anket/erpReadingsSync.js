/**
 * ERP Google Sheets → readingstatuses_<groupId> (sürekli senkron)
 *
 * - Sadece bugün (+ gece yarısı kaçırmamak için dün) satırları
 * - Geçerli risale: 0.25 … 5 → amount = saat * 60
 * - Cron: 00–19 her 30 dk, 20–23 her 15 dk (Europe/Istanbul)
 */
const path = require('path');
const schedule = require('node-schedule');
const { MongoClient } = require('mongodb');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const DB_NAME = 'readingTracker';

const ERP_SKO_GROUPS = [
  'sko-ekip-a',
  'sko-ekip-b',
  'sko-ekip-c',
  'sko-ekip-d',
  'sko-towards-eternity'
];

const SHEETS = {
  API_KEY: process.env.ERP_SHEETS_API_KEY,
  SPREADSHEET_ID: process.env.ERP_SHEETS_SPREADSHEET_ID,
  RANGE: 'A:K'
};

const COL = {
  TIMESTAMP: 0,
  NAME: 1,
  NAME_ALT: 10,
  RISALE_HOURS: 6
};

const VALID_RISALE_HOURS = new Set();
for (let i = 0; i <= 20; i += 1) {
  VALID_RISALE_HOURS.add(Number((i * 0.25).toFixed(2)));
}

let syncRunning = false;

function istanbulNowParts() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  // en-CA → YYYY-MM-DD; hour "24" bazı ortamlarda gece yarısı
  const hour = parts.hour === '24' ? 0 : Number(parts.hour);
  return {
    today: `${parts.year}-${parts.month}-${parts.day}`,
    hour
  };
}

function previousDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function toComparableKey(fullName) {
  const compact = String(fullName || '').trim().replace(/\s+/g, ' ');
  if (!compact) return '';
  const parts = compact.split(' ');
  const norm = (s) => s.toLocaleLowerCase('tr-TR');
  if (parts.length === 1) return norm(parts[0]);
  return `${norm(parts.slice(0, -1).join(' '))}\0${norm(parts[parts.length - 1])}`;
}

function sheetsSerialToDateStr(serial) {
  if (serial == null || serial === '') return null;
  const n = typeof serial === 'number' ? serial : Number(String(serial).replace(',', '.'));
  if (!Number.isFinite(n)) {
    const s = String(serial).trim();
    const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;
    const m2 = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (m2) {
      return `${m2[3]}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`;
    }
    return null;
  }
  const day = Math.floor(n);
  const utc = new Date(Date.UTC(1899, 11, 30) + day * 86400000);
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const d = String(utc.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseRisaleHours(value) {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(2));
}

function isValidRisaleHours(hours) {
  return hours != null && VALID_RISALE_HOURS.has(hours);
}

function hoursToAmount(hours) {
  if (!(hours > 0)) return null;
  return Math.round(hours * 60);
}

function getNameFromRow(row) {
  const a = String(row[COL.NAME] || '').trim();
  if (a) return a;
  return String(row[COL.NAME_ALT] || '').trim();
}

async function fetchSheetRows() {
  if (!SHEETS.API_KEY) {
    throw new Error('ERP_SHEETS_API_KEY .env içinde tanımlı değil');
  }
  if (!SHEETS.SPREADSHEET_ID) {
    throw new Error('ERP_SHEETS_SPREADSHEET_ID .env içinde tanımlı değil');
  }
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEETS.SPREADSHEET_ID}` +
    `/values/${encodeURIComponent(SHEETS.RANGE)}` +
    `?key=${SHEETS.API_KEY}&valueRenderOption=UNFORMATTED_VALUE`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Sheets API ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  const values = json.values || [];
  return values.length > 1 ? values.slice(1) : [];
}

/**
 * allowedDates: Set of YYYY-MM-DD
 * Aynı kişi+gün için son geçerli satır tutulur.
 */
function buildEntriesByNameKey(rows, allowedDates) {
  const byUserDate = new Map();
  let inWindow = 0;
  let validPositive = 0;
  let invalidRisale = 0;

  for (const row of rows) {
    const dateStr = sheetsSerialToDateStr(row[COL.TIMESTAMP]);
    if (!dateStr || !allowedDates.has(dateStr)) continue;
    inWindow += 1;

    const name = getNameFromRow(row);
    if (!name) continue;

    const hours = parseRisaleHours(row[COL.RISALE_HOURS]);
    if (hours == null || !isValidRisaleHours(hours)) {
      invalidRisale += 1;
      continue;
    }
    if (!(hours > 0)) continue;
    validPositive += 1;

    byUserDate.set(`${toComparableKey(name)}|${dateStr}`, { name, date: dateStr, hours });
  }

  const byNameKey = new Map();
  for (const entry of byUserDate.values()) {
    const nameKey = toComparableKey(entry.name);
    if (!byNameKey.has(nameKey)) byNameKey.set(nameKey, []);
    byNameKey.get(nameKey).push(entry);
  }

  return { byNameKey, inWindow, validPositive, invalidRisale, uniqueUserDate: byUserDate.size };
}

async function importGroup(db, groupId, byNameKey, dryRun) {
  const users = await db.collection(`users_${groupId}`).find({}).project({ _id: 1, name: 1 }).toArray();
  const readingStatuses = db.collection(`readingstatuses_${groupId}`);

  let matchedUsers = 0;
  let docs = 0;
  let upserted = 0;

  for (const u of users) {
    const entries = byNameKey.get(toComparableKey(u.name)) || [];
    if (!entries.length) continue;
    matchedUsers += 1;

    const ops = [];
    for (const entry of entries) {
      const amount = hoursToAmount(entry.hours);
      if (amount == null) continue;
      docs += 1;

      if (dryRun) continue;

      ops.push({
        updateOne: {
          filter: { userId: u._id.toString(), date: entry.date },
          update: {
            $set: {
              status: 'okudum',
              amount,
              __v: 0
            }
          },
          upsert: true
        }
      });
    }

    if (ops.length) {
      const result = await readingStatuses.bulkWrite(ops, { ordered: false });
      upserted += result.upsertedCount || 0;
    }
  }

  return { groupId, users: users.length, matchedUsers, docs, upserted };
}

async function resolveDb(db) {
  if (db) return { db, close: null };
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI tanımlı değil');
  const client = new MongoClient(uri);
  await client.connect();
  return { db: client.db(DB_NAME), close: () => client.close() };
}

/**
 * @param {object} [options]
 * @param {import('mongodb').Db} [options.db]
 * @param {string[]} [options.groupIds]
 * @param {boolean} [options.dryRun]
 * @param {boolean} [options.includeYesterday=true] 23:59 formu kaçırmamak için
 */
async function syncErpReadings(options = {}) {
  const dryRun = options.dryRun === true;
  const includeYesterday = options.includeYesterday !== false;
  const groupIds = options.groupIds && options.groupIds.length ? options.groupIds : ERP_SKO_GROUPS;

  const { today } = istanbulNowParts();
  const yesterday = previousDateStr(today);
  const allowedDates = new Set([today]);
  if (includeYesterday) allowedDates.add(yesterday);

  const dateLabel = includeYesterday ? `${yesterday} + ${today}` : today;
  console.log(`📥 [ErpReadingsSync] Başlıyor | günler: ${dateLabel} | DRY_RUN=${dryRun}`);

  const rows = await fetchSheetRows();
  const parsed = buildEntriesByNameKey(rows, allowedDates);
  console.log(
    `📥 [ErpReadingsSync] Sheet: ${rows.length} satır | pencerede: ${parsed.inWindow} | ` +
      `geçerli risale>0: ${parsed.validPositive} | geçersiz: ${parsed.invalidRisale} | unique: ${parsed.uniqueUserDate}`
  );

  const { db, close } = await resolveDb(options.db);
  try {
    const summaries = [];
    for (const groupId of groupIds) {
      const s = await importGroup(db, groupId, parsed.byNameKey, dryRun);
      summaries.push(s);
      console.log(
        `📥 [ErpReadingsSync] ${groupId}: eşleşen ${s.matchedUsers}/${s.users}, ` +
          `doküman ${s.docs}` +
          (dryRun ? ' (dry-run)' : `, yeni upsert ${s.upserted}`)
      );
    }
    return {
      success: true,
      today,
      yesterday: includeYesterday ? yesterday : null,
      sheetRows: rows.length,
      ...parsed,
      byNameKey: undefined,
      groups: summaries
    };
  } finally {
    if (close) await close();
  }
}

async function runScheduledSync(getDb) {
  if (syncRunning) {
    console.log('⏸️  [ErpReadingsSync] Önceki çalışma sürüyor, atlandı');
    return;
  }
  syncRunning = true;
  try {
    let db;
    if (typeof getDb === 'function') {
      db = getDb();
    }
    await syncErpReadings({ db, includeYesterday: true });
  } catch (err) {
    console.error('❌ [ErpReadingsSync] Hata:', err.message || err);
  } finally {
    syncRunning = false;
  }
}

/**
 * Gündüz (00:00–19:59): her 30 dk
 * Akşam (20:00–23:59): her 15 dk
 * @param {() => import('mongodb').Db} [getDb]
 */
function scheduleErpReadingsSync(getDb) {
  const run = () => runScheduledSync(getDb);

  const dayJob = schedule.scheduleJob({ rule: '0,30 0-19 * * *', tz: 'Europe/Istanbul' }, run);
  const nightJob = schedule.scheduleJob({ rule: '*/15 20-23 * * *', tz: 'Europe/Istanbul' }, run);

  console.log(
    '📅 [ErpReadingsSync] Zamanlayıcı: 00–19 her 30 dk, 20–23 her 15 dk (Europe/Istanbul); dün+bugün'
  );

  return { dayJob, nightJob };
}

module.exports = {
  ERP_SKO_GROUPS,
  syncErpReadings,
  scheduleErpReadingsSync,
  istanbulNowParts,
  previousDateStr
};
