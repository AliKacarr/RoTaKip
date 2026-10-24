/**
 * ERP Google Sheets → readingstatuses_<groupId> (sürekli senkron)
 *
 * - Sadece bugün (+ gece yarısı kaçırmamak için dün) satırları
 * - Geçerli risale: 0.25 … 5 → amount = saat * 60
 * - Cron: 01–19 her 30 dk, 20–23 her 15 dk (Europe/Istanbul)
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

const SHEETS_REQUEST_TIMEOUT_MS = 10 * 1000;
const ON_DEMAND_SYNC_COOLDOWN_MS = 60 * 1000;
const ERP_SYNC_LOCK_COLLECTION = 'erp_sync_locks';
const ERP_SYNC_LOCK_ID = 'erp-sko-data-sync';
const ERP_SYNC_LOCK_LEASE_MS = 20 * 60 * 1000;
const lastSuccessfulSyncAtByGroup = new Map();
const lastSyncAttemptAtByGroup = new Map();
const changeVersionByGroup = new Map();
let activeSyncPromise = null;
let scheduledSyncQueuedOrRunning = false;

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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SHEETS_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Sheets API ${res.status}: ${await res.text()}`);
    }
    const json = await res.json();
    const values = json.values || [];
    return values.length > 1 ? values.slice(1) : [];
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(
        `Sheets API isteği ${SHEETS_REQUEST_TIMEOUT_MS / 1000} saniyede zaman aşımına uğradı`,
        { cause: error }
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Kullanıcı ve okuma senkronlarının aynı koleksiyonlara eş zamanlı yazmasını önler.
 * Kilit işlemi çöken bir süreçten sonra lease süresi dolduğunda kendiliğinden alınabilir.
 */
async function withErpSyncLock(db, owner, task, options = {}) {
  if (!db) throw new Error('ERP senkron kilidi için veritabanı bağlantısı gerekli');
  if (typeof task !== 'function') throw new Error('ERP senkron kilidi için görev fonksiyonu gerekli');

  const waitMs = Number.isFinite(Number(options.waitMs))
    ? Math.max(0, Number(options.waitMs))
    : 0;
  const retryMs = Number.isFinite(Number(options.retryMs))
    ? Math.max(250, Number(options.retryMs))
    : 1000;
  const deadline = Date.now() + waitMs;
  const lockOwner = String(owner || `erp-sync-${process.pid}-${Date.now()}`);
  const locks = db.collection(ERP_SYNC_LOCK_COLLECTION);

  let acquired = false;
  do {
    const now = new Date();
    try {
      await locks.findOneAndUpdate(
        {
          _id: ERP_SYNC_LOCK_ID,
          $or: [
            { expiresAt: { $lte: now } },
            { owner: lockOwner }
          ]
        },
        {
          $set: {
            owner: lockOwner,
            acquiredAt: now,
            expiresAt: new Date(now.getTime() + ERP_SYNC_LOCK_LEASE_MS)
          }
        },
        { upsert: true, returnDocument: 'after' }
      );
      acquired = true;
      break;
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }

    if (Date.now() >= deadline) break;
    await wait(Math.min(retryMs, Math.max(0, deadline - Date.now())));
  } while (Date.now() <= deadline);

  if (!acquired) return { acquired: false, value: null };

  try {
    return { acquired: true, value: await task() };
  } finally {
    await locks.deleteOne({ _id: ERP_SYNC_LOCK_ID, owner: lockOwner }).catch((error) => {
      console.error('[ErpSyncLock] Kilit bırakılamadı:', error.message || error);
    });
  }
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
  let modified = 0;

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
      modified += result.modifiedCount || 0;
    }
  }

  return {
    groupId,
    users: users.length,
    matchedUsers,
    docs,
    upserted,
    modified,
    changed: upserted + modified > 0
  };
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

  const rows = await fetchSheetRows();
  const parsed = buildEntriesByNameKey(rows, allowedDates);

  const { db, close } = await resolveDb(options.db);
  try {
    const runImports = async () => {
      const summaries = [];
      for (const groupId of groupIds) {
        const s = await importGroup(db, groupId, parsed.byNameKey, dryRun);
        summaries.push(s);
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
    };

    if (dryRun) return runImports();

    const lockResult = await withErpSyncLock(
      db,
      `readings-${process.pid}-${Date.now()}`,
      runImports,
      { waitMs: options.lockWaitMs || 0 }
    );
    if (lockResult.acquired) return lockResult.value;

    return {
      success: true,
      skipped: 'erp-sync-lock',
      today,
      yesterday: includeYesterday ? yesterday : null,
      sheetRows: rows.length,
      groups: groupIds.map((groupId) => ({ groupId, changed: false, skipped: 'erp-sync-lock' }))
    };
  } finally {
    if (close) await close();
  }
}

function startCoordinatedSync(options) {
  const groupIds = options.groupIds && options.groupIds.length
    ? options.groupIds
    : ERP_SKO_GROUPS;
  const startedAt = Date.now();
  groupIds.forEach((groupId) => lastSyncAttemptAtByGroup.set(groupId, startedAt));
  const syncPromise = syncErpReadings({ ...options, groupIds })
    .then((result) => {
      const completedAt = Date.now();
      if (!result.skipped) {
        groupIds.forEach((groupId) => lastSuccessfulSyncAtByGroup.set(groupId, completedAt));
      }
      result.groups.forEach((group) => {
        if (group.changed) {
          changeVersionByGroup.set(group.groupId, getErpReadingsChangeVersion(group.groupId) + 1);
        }
        group.changeVersion = getErpReadingsChangeVersion(group.groupId);
      });
      return result;
    })
    .finally(() => {
      if (activeSyncPromise === syncPromise) activeSyncPromise = null;
    });
  activeSyncPromise = syncPromise;
  return syncPromise;
}

function getErpReadingsChangeVersion(groupId) {
  return changeVersionByGroup.get(String(groupId || '')) || 0;
}

function isGroupSyncFresh(groupId, cooldownMs) {
  const lastSuccessfulSyncAt = lastSuccessfulSyncAtByGroup.get(groupId) || 0;
  return Date.now() - lastSuccessfulSyncAt < cooldownMs;
}

function isGroupSyncCoolingDown(groupId, cooldownMs) {
  const lastSyncAttemptAt = lastSyncAttemptAtByGroup.get(groupId) || 0;
  return Date.now() - lastSyncAttemptAt < cooldownMs;
}

/**
 * Grup sayfası açılırken ERP verisini yeniler.
 * Aynı anda gelen istekler tek senkronu paylaşır; başarılı veya başarısız bir
 * denemeden sonra aynı grup için kısa süreli tekrarlar harici servise gönderilmez.
 */
async function syncErpReadingsOnDemand(options = {}) {
  const groupId = String(options.groupId || '');
  if (!ERP_SKO_GROUPS.includes(groupId)) {
    return {
      success: true,
      skipped: 'unsupported-group',
      groupId,
      changed: false,
      changeVersion: getErpReadingsChangeVersion(groupId)
    };
  }

  const requestedCooldown = Number(options.cooldownMs);
  const cooldownMs = Number.isFinite(requestedCooldown) && requestedCooldown >= 0
    ? requestedCooldown
    : ON_DEMAND_SYNC_COOLDOWN_MS;

  while (activeSyncPromise) {
    const sharedSyncPromise = activeSyncPromise;
    let sharedResult = null;
    try {
      sharedResult = await sharedSyncPromise;
    } catch (_) {
      // Önceki senkron başarısızsa bu istek kendi grubunu yeniden deneyebilir.
    }
    const sharedGroupResult = sharedResult?.groups?.find((group) => group.groupId === groupId);
    if (sharedGroupResult) {
      return {
        success: true,
        skipped: 'shared-sync',
        groupId,
        changed: sharedGroupResult.changed === true,
        changeVersion: sharedGroupResult.changeVersion,
        group: sharedGroupResult
      };
    }
  }

  if (isGroupSyncFresh(groupId, cooldownMs)) {
    return {
      success: true,
      skipped: 'cooldown',
      groupId,
      changed: false,
      changeVersion: getErpReadingsChangeVersion(groupId)
    };
  }
  if (isGroupSyncCoolingDown(groupId, cooldownMs)) {
    return {
      success: false,
      skipped: 'retry-cooldown',
      groupId,
      changed: false,
      changeVersion: getErpReadingsChangeVersion(groupId)
    };
  }

  const result = await startCoordinatedSync({
    db: options.db,
    groupIds: [groupId],
    includeYesterday: true
  });
  const groupResult = result.groups.find((group) => group.groupId === groupId);
  return {
    ...result,
    groupId,
    changed: groupResult?.changed === true,
    changeVersion: groupResult?.changeVersion ?? getErpReadingsChangeVersion(groupId),
    group: groupResult
  };
}

async function runScheduledSync(getDb) {
  if (scheduledSyncQueuedOrRunning) return;
  scheduledSyncQueuedOrRunning = true;
  try {
    while (activeSyncPromise) {
      try {
        await activeSyncPromise;
      } catch (_) {
        // Zamanlanmış tam senkron, önceki denemenin sonucundan bağımsız çalışır.
      }
    }
    let db;
    if (typeof getDb === 'function') {
      db = getDb();
    }
    await startCoordinatedSync({ db, includeYesterday: true });
  } catch (err) {
    console.error('[ErpReadingsSync]', err.message || err);
  } finally {
    scheduledSyncQueuedOrRunning = false;
  }
}

/**
 * Gündüz (01:00–19:59): her 30 dk
 * Akşam (20:00–23:59): her 15 dk
 * @param {() => import('mongodb').Db} [getDb]
 */
function scheduleErpReadingsSync(getDb) {
  const run = () => runScheduledSync(getDb);

  const dayJob = schedule.scheduleJob({ rule: '0,30 1-19 * * *', tz: 'Europe/Istanbul' }, run);
  const nightJob = schedule.scheduleJob({ rule: '*/15 20-23 * * *', tz: 'Europe/Istanbul' }, run);

  return { dayJob, nightJob };
}

module.exports = {
  ERP_SKO_GROUPS,
  ON_DEMAND_SYNC_COOLDOWN_MS,
  getErpReadingsChangeVersion,
  syncErpReadings,
  syncErpReadingsOnDemand,
  scheduleErpReadingsSync,
  istanbulNowParts,
  previousDateStr,
  toComparableKey,
  sheetsSerialToDateStr,
  parseRisaleHours,
  isValidRisaleHours,
  hoursToAmount,
  getNameFromRow,
  fetchSheetRows,
  resolveDb,
  withErpSyncLock
};
