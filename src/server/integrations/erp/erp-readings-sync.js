/**
 * ERP Google Sheets → readingstatuses_<groupId> + cetele_<groupId> (sürekli senkron)
 *
 * - Sadece bugün (+ gece yarısı kaçırmamak için dün) satırları; tek seferlik geçmiş
 *   aktarımı için `allDates: true` (scripts/import-erp-history.js)
 * - Geçerli risale: 0.25 … 5 → amount = saat * 60 (okuma alanı "risale", dakika)
 * - Formun diğer cevapları (Namaz, Kur'an, Tesbihat, Cevşen, Hizmet, Görevler) grubun
 *   ceteleFields içinde açık olan ERP alışkanlıklarına yazılır (ERP_CETELE_FIELDS).
 * - SON YAZAN KAZANIR: form satırının gönderim anı, sitedeki kaydın updatedAt'inden yeniyse
 *   form yazılır; site daha yeni yazmışsa o gün atlanır (planDay).
 * - Bu dosyanın birebir kopyası render-worker/jobs/erpReadingsSync.js (tek fark dotenv yolu).
 */
const path = require('path');
const schedule = require('node-schedule');
const { MongoClient } = require('mongodb');
require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env'), quiet: true });

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
  KURAN: 3,
  TESBIHAT: 4,
  CEVSEN: 5,
  RISALE_HOURS: 6,
  HIZMET: 7,
  GOREVLER: 8,
  NAMAZ: 9,
  NAME_ALT: 10
};

// ERP gruplarının çetele alışkanlıkları. Sıra önemli: ilk alan okuma alanıdır
// (değeri readingstatuses'e dakika olarak yazılır; lig/seri bu alana göre hesaplanır).
const ERP_READ_FIELD_KEY = 'risale';
const ERP_TEXT_MAX_LENGTH = 280;
const ERP_CETELE_FIELDS = Object.freeze([
  { key: ERP_READ_FIELD_KEY, label: 'Risale-i Nur', type: 'sayi', unit: 'dakika', options: [15, 30, 45, 60, 90, 120], step: 1, max: 600, allowCustom: true, zeroLabel: '' },
  { key: 'namaz', label: 'Namaz', type: 'sayi', unit: 'vakit', options: [1, 2, 3, 4, 5], step: 1, max: 5, allowCustom: false, zeroLabel: 'Kılmadım' },
  { key: 'kuran', label: "Kur'an", type: 'sayi', unit: 'sayfa', options: [2, 5, 10, 20, 40], step: 1, max: 604, allowCustom: true, zeroLabel: '' },
  { key: 'tesbihat', label: 'Tesbihat', type: 'sayi', unit: 'vakit', options: [1, 2, 3, 4, 5], step: 1, max: 5, allowCustom: false, zeroLabel: 'Yapmadım' },
  { key: 'cevsen', label: 'Cevşen', type: 'sayi', unit: 'bab', options: [5, 10, 15, 20, 30, 40], step: 1, max: 100, allowCustom: true, zeroLabel: '' },
  { key: 'hizmet', label: 'Hizmet', type: 'sayi', unit: 'saat', options: [0.5, 1, 1.5, 2, 3, 4, 6, 8], step: 0.25, max: 24, allowCustom: true, zeroLabel: '' },
  { key: 'gorevler', label: 'Görevler', type: 'metin', unit: '', options: [], step: 1, max: ERP_TEXT_MAX_LENGTH, allowCustom: true, zeroLabel: '' }
].map((field) => Object.freeze({ ...field, required: true, archived: false })));

// Okuma alanı dışındaki ERP alışkanlıklarının tablo sütunları.
const ERP_CETELE_COLUMNS = Object.freeze({
  namaz: COL.NAMAZ,
  kuran: COL.KURAN,
  tesbihat: COL.TESBIHAT,
  cevsen: COL.CEVSEN,
  hizmet: COL.HIZMET,
  gorevler: COL.GOREVLER
});

const VALID_RISALE_HOURS = new Set();
for (let i = 0; i <= 20; i += 1) {
  VALID_RISALE_HOURS.add(Number((i * 0.25).toFixed(2)));
}

const SHEETS_REQUEST_TIMEOUT_MS = 20 * 1000;
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

function parseSheetNumber(value) {
  if (value == null || value === '') return null;
  const text = typeof value === 'number' ? null : String(value).trim().replace(',', '.');
  if (text === '') return null;
  const n = text === null ? value : Number(text);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(2));
}

function parseRisaleHours(value) {
  return parseSheetNumber(value);
}

function isStepMultiple(value, step) {
  const ratio = value / step;
  return Math.abs(ratio - Math.round(ratio)) < 1e-9;
}

function buildErpCeteleFields() {
  return ERP_CETELE_FIELDS.map((field) => ({ ...field, options: [...field.options] }));
}

const ERP_FIELD_BY_KEY = new Map(ERP_CETELE_FIELDS.map((field) => [field.key, field]));

// Hücre değerini alışkanlık tanımına göre doğrular; geçersiz ya da boşsa undefined.
// Sitedeki kayıt doğrulamasıyla (cetele.service sanitizeEntryValues) aynı kurallar.
function normalizeErpFieldValue(field, raw) {
  if (field.type === 'metin') {
    if (raw == null) return undefined;
    const text = String(raw).trim().slice(0, ERP_TEXT_MAX_LENGTH).trim();
    return text || undefined;
  }
  const n = parseSheetNumber(raw);
  if (n == null || n < 0 || n > field.max || !isStepMultiple(n, field.step)) return undefined;
  const isZeroChoice = n === 0 && Boolean(field.zeroLabel);
  if (!field.allowCustom && !field.options.includes(n) && !isZeroChoice) return undefined;
  return n;
}

// Bir form satırındaki okuma dışı alışkanlık değerleri: { namaz: 5, kuran: 2, ... }
function parseErpCeteleValues(row) {
  const values = {};
  for (const [key, column] of Object.entries(ERP_CETELE_COLUMNS)) {
    const value = normalizeErpFieldValue(ERP_FIELD_BY_KEY.get(key), row[column]);
    if (value !== undefined) values[key] = value;
  }
  return values;
}

// Grubun alan tanımlarından, ERP'nin yazabileceği açık (okuma alanı dışı) anahtarlar.
// Grupta alan tanımı yoksa boş döner → çeteleye yazılmaz.
function erpCeteleKeysFor(ceteleFields) {
  if (!Array.isArray(ceteleFields)) return [];
  const active = ceteleFields.filter((field) => field && field.archived !== true);
  const readKey = active[0]?.key;
  return active
    .filter((field) => field.key !== readKey
      && Object.hasOwn(ERP_CETELE_COLUMNS, field.key)
      && field.type === ERP_FIELD_BY_KEY.get(field.key).type)
    .map((field) => field.key);
}

function pickValues(values, keys) {
  const picked = {};
  for (const key of keys) {
    if (values && Object.hasOwn(values, key)) picked[key] = values[key];
  }
  return picked;
}

/**
 * Gün için ERP anahtarlarını mevcut çetele belgesiyle karşılaştırır.
 * - null: fark yok (updatedAt boşuna değişmesin, istemci gereksiz yenilenmesin)
 * - { deleteDoc: true }: belgede hiç değer kalmıyor (site de boş belgeyi siler)
 * - { update }: Mongo güncellemesi. ERP dışı anahtarlara dokunulmaz.
 */
function buildCeteleUpdate(entryValues, existingValues, keys, now = new Date()) {
  const $set = {};
  const $unset = {};
  let changed = false;
  for (const key of keys) {
    const hasNew = Object.hasOwn(entryValues || {}, key);
    const hasOld = Boolean(existingValues) && Object.hasOwn(existingValues, key);
    if (hasNew) {
      $set[`values.${key}`] = entryValues[key];
      if (!hasOld || existingValues[key] !== entryValues[key]) changed = true;
    } else if (hasOld) {
      $unset[`values.${key}`] = '';
      changed = true;
    }
  }
  if (!changed) return null;
  if (!Object.keys($set).length) {
    if (!existingValues) return null;
    const remaining = Object.keys(existingValues).filter((key) => !Object.hasOwn($unset, `values.${key}`));
    if (!remaining.length) return { deleteDoc: true };
  }
  const update = { $set: { ...$set, updatedAt: now } };
  if (Object.keys($unset).length) update.$unset = $unset;
  return { update };
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

function sheetTimestampSortValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  const text = String(value || '').trim();
  const numeric = Number(text.replace(',', '.'));
  if (Number.isFinite(numeric)) return numeric;

  const trMatch = text.match(
    /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (trMatch) {
    return Date.UTC(
      Number(trMatch[3]),
      Number(trMatch[2]) - 1,
      Number(trMatch[1]),
      Number(trMatch[4] || 0),
      Number(trMatch[5] || 0),
      Number(trMatch[6] || 0)
    );
  }

  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
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
 * allowedDates: Set of YYYY-MM-DD; null → tüm tarihler (geçmiş aktarımı)
 * Aynı kişi+gün için son satır tutulur. Risale geçersiz olsa da diğer cevaplardan
 * en az biri geçerliyse satır kullanılır (hours: null → okuma yazılmaz).
 */
function buildEntriesByNameKey(rows, allowedDates) {
  const byUserDate = new Map();
  let inWindow = 0;
  let validPositive = 0;
  let validZero = 0;
  let invalidRisale = 0;

  rows.forEach((row, rowIndex) => {
    const dateStr = sheetsSerialToDateStr(row[COL.TIMESTAMP]);
    if (!dateStr || (allowedDates && !allowedDates.has(dateStr))) return;
    inWindow += 1;

    const name = getNameFromRow(row);
    if (!name) return;

    const parsedHours = parseRisaleHours(row[COL.RISALE_HOURS]);
    const hours = isValidRisaleHours(parsedHours) ? parsedHours : null;
    const values = parseErpCeteleValues(row);
    if (hours == null) {
      invalidRisale += 1;
      if (!Object.keys(values).length) return;
    } else if (hours > 0) {
      validPositive += 1;
    } else {
      validZero += 1;
    }

    const key = `${toComparableKey(name)}|${dateStr}`;
    const sortValue = sheetTimestampSortValue(row[COL.TIMESTAMP]);
    const current = byUserDate.get(key);
    if (!current || sortValue > current.sortValue ||
        (sortValue === current.sortValue && rowIndex > current.rowIndex)) {
      byUserDate.set(key, {
        name,
        date: dateStr,
        hours,
        values,
        submittedAt: sheetTimestampToDate(row[COL.TIMESTAMP]),
        sortValue,
        rowIndex
      });
    }
  });

  const byNameKey = new Map();
  for (const entry of byUserDate.values()) {
    const nameKey = toComparableKey(entry.name);
    if (!byNameKey.has(nameKey)) byNameKey.set(nameKey, []);
    byNameKey.get(nameKey).push(entry);
  }

  return {
    byNameKey,
    inWindow,
    validPositive,
    validZero,
    invalidRisale,
    uniqueUserDate: byUserDate.size
  };
}

// updatedAt verilirse (formun gönderim anı) satıra yazılır; "son yazan kazanır" karşılaştırması bunu kullanır.
function buildReadingUpdate(hours, updatedAt) {
  const stamp = updatedAt ? { updatedAt } : {};
  if (hours > 0) {
    return {
      $set: {
        status: 'okudum',
        amount: hoursToAmount(hours),
        __v: 0,
        ...stamp
      }
    };
  }

  return {
    $set: {
      status: 'okumadım',
      __v: 0,
      ...stamp
    },
    $unset: { amount: '' }
  };
}

// Yalnızca eksik günü ekler (geçmiş aktarımı); var olan okuma kaydı ezilmez.
function buildReadingInsert(hours, updatedAt) {
  const stamp = updatedAt ? { updatedAt } : {};
  if (hours > 0) {
    return { $setOnInsert: { status: 'okudum', amount: hoursToAmount(hours), __v: 0, ...stamp } };
  }
  return { $setOnInsert: { status: 'okumadım', __v: 0, ...stamp } };
}

// Tablo saati (Europe/Istanbul, 2016'dan beri sabit UTC+3) → gerçek an. Çözülemezse null.
const SHEET_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

function sheetTimestampToDate(value) {
  let ms = null;
  const numeric = typeof value === 'number' ? value : Number(String(value ?? '').trim().replace(',', '.'));
  if (value !== '' && value != null && Number.isFinite(numeric)) {
    ms = Date.UTC(1899, 11, 30) + numeric * 86400000;
  } else {
    const m = String(value ?? '').trim().match(
      /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
    );
    if (m) {
      ms = Date.UTC(
        Number(m[3]), Number(m[2]) - 1, Number(m[1]),
        Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0)
      );
    }
  }
  if (ms == null) return null;
  const date = new Date(Math.round(ms) - SHEET_UTC_OFFSET_MS);
  return Number.isNaN(date.getTime()) ? null : date;
}

function readingMatches(existing, hours) {
  if (!existing) return false;
  if (hours > 0) return existing.status === 'okudum' && existing.amount === hoursToAmount(hours);
  return existing.status === 'okumadım' && existing.amount == null;
}

function latestDate(...dates) {
  const valid = dates.filter((d) => d instanceof Date && !Number.isNaN(d.getTime()));
  return valid.length ? new Date(Math.max(...valid.map((d) => d.getTime()))) : null;
}

/**
 * Bir kişi + gün için yapılacak işleri belirler. Kural: SON YAZAN KAZANIR.
 * - Formun gönderim anı (entry.submittedAt) ile sitedeki kayıtların updatedAt'i karşılaştırılır.
 * - ERP'nin yazacağı değer mevcut kayıttan farklıysa ve site daha yeni yazmışsa gün atlanır;
 *   form daha yeniyse (ya da kayıtta damga yoksa) form yazılır, damga formun anı olur.
 * - Fark yoksa ve damga formdan ileriyse formun anına çekilir (ör. geçmiş aktarımının "şimdi"
 *   damgaları); bu işlem `changed` sayılmaz.
 * @returns {{skipped?: boolean, reading?: object, cetele?: object, normalize: object[]}}
 */
function planDay({ entry, existingReading, existingCetele, keys, readingsMode, now }) {
  const stamp = entry.submittedAt || now;
  const insertMissing = readingsMode === 'insert-missing';
  const readingWanted = entry.hours != null
    && (insertMissing ? !existingReading : !readingMatches(existingReading, entry.hours));
  const ceteleResult = keys.length
    ? buildCeteleUpdate(pickValues(entry.values, keys), existingCetele?.values || null, keys, stamp)
    : null;

  if (readingWanted || ceteleResult) {
    const siteAt = latestDate(existingReading?.updatedAt, existingCetele?.updatedAt);
    if (entry.submittedAt && siteAt && siteAt.getTime() > entry.submittedAt.getTime()) {
      return { skipped: true, normalize: [] };
    }
    return {
      reading: readingWanted
        ? (insertMissing ? buildReadingInsert(entry.hours, stamp) : buildReadingUpdate(entry.hours, stamp))
        : null,
      cetele: ceteleResult,
      normalize: []
    };
  }

  const normalize = [];
  if (entry.submittedAt) {
    const isLater = (doc) => doc?.updatedAt instanceof Date
      && doc.updatedAt.getTime() > entry.submittedAt.getTime();
    if (existingReading && entry.hours != null && readingMatches(existingReading, entry.hours)
        && isLater(existingReading)) {
      normalize.push({ collection: 'reading', filter: { _id: existingReading._id } });
    }
    if (keys.length && existingCetele && isLater(existingCetele)) {
      normalize.push({ collection: 'cetele', filter: { _id: existingCetele._id } });
    }
  }
  return { normalize, stamp };
}

async function loadErpCeteleKeys(db, groupId) {
  const group = await db.collection('usergroups').findOne(
    { groupId },
    { projection: { ceteleFields: 1 } }
  );
  return erpCeteleKeysFor(group?.ceteleFields);
}

/**
 * @param {object} [options]
 * @param {'overwrite'|'insert-missing'} [options.readingsMode='overwrite']
 * @param {string[]} [options.ceteleKeys] grubun alan tanımı yerine kullanılacak anahtarlar (dry-run)
 */
async function importGroup(db, groupId, byNameKey, dryRun, options = {}) {
  const users = await db.collection(`users_${groupId}`).find({}).project({ _id: 1, name: 1 }).toArray();
  const readingStatuses = db.collection(`readingstatuses_${groupId}`);
  const ceteleEntries = db.collection(`cetele_${groupId}`);
  const ceteleKeys = Array.isArray(options.ceteleKeys)
    ? options.ceteleKeys
    : await loadErpCeteleKeys(db, groupId);
  const now = new Date();

  let matchedUsers = 0;
  let docs = 0;
  let upserted = 0;
  let modified = 0;
  let ceteleOps = 0;
  let ceteleUpserted = 0;
  let ceteleModified = 0;
  let ceteleDeleted = 0;
  let skippedSiteNewer = 0;
  let normalized = 0;
  const matchedNameKeys = [];

  for (const u of users) {
    const nameKey = toComparableKey(u.name);
    const entries = byNameKey.get(nameKey) || [];
    if (!entries.length) continue;
    matchedUsers += 1;
    matchedNameKeys.push(nameKey);
    const userId = u._id.toString();
    const dates = entries.map((entry) => entry.date);

    const [readingDocs, ceteleDocs] = await Promise.all([
      readingStatuses
        .find({ userId: { $in: [userId, u._id] }, date: { $in: dates } })
        .project({ date: 1, status: 1, amount: 1, updatedAt: 1 })
        .toArray(),
      ceteleKeys.length
        ? ceteleEntries
          .find({ userId, date: { $in: dates } })
          .project({ date: 1, values: 1, updatedAt: 1 })
          .toArray()
        : []
    ]);
    const readingByDate = new Map(readingDocs.map((doc) => [doc.date, doc]));
    const ceteleByDate = new Map(ceteleDocs.map((doc) => [doc.date, doc]));

    const readingOps = [];
    const ceteleBulk = [];
    const normalizeReading = [];
    const normalizeCetele = [];
    for (const entry of entries) {
      const plan = planDay({
        entry,
        existingReading: readingByDate.get(entry.date) || null,
        existingCetele: ceteleByDate.get(entry.date) || null,
        keys: ceteleKeys,
        readingsMode: options.readingsMode,
        now
      });
      if (plan.skipped) {
        skippedSiteNewer += 1;
        continue;
      }
      if (plan.reading) {
        readingOps.push({
          updateOne: { filter: { userId, date: entry.date }, update: plan.reading, upsert: true }
        });
      }
      if (plan.cetele) {
        const filter = { userId, date: entry.date };
        ceteleBulk.push(plan.cetele.deleteDoc
          ? { deleteOne: { filter } }
          : { updateOne: { filter, update: plan.cetele.update, upsert: true } });
      }
      for (const item of plan.normalize) {
        const op = {
          updateOne: { filter: item.filter, update: { $set: { updatedAt: entry.submittedAt } } }
        };
        (item.collection === 'reading' ? normalizeReading : normalizeCetele).push(op);
      }
    }
    docs += readingOps.length;
    ceteleOps += ceteleBulk.length;
    normalized += normalizeReading.length + normalizeCetele.length;

    if (dryRun) continue;

    if (readingOps.length) {
      const result = await readingStatuses.bulkWrite(readingOps, { ordered: false });
      upserted += result.upsertedCount || 0;
      modified += result.modifiedCount || 0;
    }
    if (ceteleBulk.length) {
      const result = await ceteleEntries.bulkWrite(ceteleBulk, { ordered: false });
      ceteleUpserted += result.upsertedCount || 0;
      ceteleModified += result.modifiedCount || 0;
      ceteleDeleted += result.deletedCount || 0;
    }
    if (normalizeReading.length) await readingStatuses.bulkWrite(normalizeReading, { ordered: false });
    if (normalizeCetele.length) await ceteleEntries.bulkWrite(normalizeCetele, { ordered: false });
  }

  return {
    groupId,
    users: users.length,
    matchedUsers,
    docs,
    upserted,
    modified,
    ceteleKeys,
    ceteleOps,
    ceteleUpserted,
    ceteleModified,
    ceteleDeleted,
    skippedSiteNewer,
    normalized,
    changed: upserted + modified + ceteleUpserted + ceteleModified + ceteleDeleted > 0,
    matchedNameKeys
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
 * @param {boolean} [options.allDates=false] tablodaki tüm günler (tek seferlik geçmiş aktarımı)
 * @param {'overwrite'|'insert-missing'} [options.readingsMode='overwrite']
 * @param {Object<string, string[]>} [options.ceteleKeysByGroup] dry-run için alan anahtarları
 * @param {boolean} [options.includeUnmatchedNames=false]
 */
async function syncErpReadings(options = {}) {
  const dryRun = options.dryRun === true;
  const includeYesterday = options.includeYesterday !== false;
  const allDates = options.allDates === true;
  const groupIds = options.groupIds && options.groupIds.length ? options.groupIds : ERP_SKO_GROUPS;

  const { today } = istanbulNowParts();
  const yesterday = previousDateStr(today);
  const allowedDates = new Set([today]);
  if (includeYesterday) allowedDates.add(yesterday);

  const rows = await fetchSheetRows();
  const parsed = buildEntriesByNameKey(rows, allDates ? null : allowedDates);

  const { db, close } = await resolveDb(options.db);
  try {
    const runImports = async () => {
      const summaries = [];
      const matchedNameKeys = new Set();
      for (const groupId of groupIds) {
        const { matchedNameKeys: groupNameKeys, ...s } = await importGroup(
          db,
          groupId,
          parsed.byNameKey,
          dryRun,
          {
            readingsMode: options.readingsMode,
            ceteleKeys: options.ceteleKeysByGroup?.[groupId]
          }
        );
        groupNameKeys.forEach((key) => matchedNameKeys.add(key));
        summaries.push(s);
      }
      const unmatchedNames = [...parsed.byNameKey.entries()]
        .filter(([key]) => !matchedNameKeys.has(key))
        .map(([, entries]) => ({ name: entries[0].name, days: entries.length }));
      return {
        success: true,
        today,
        yesterday: includeYesterday ? yesterday : null,
        allDates,
        sheetRows: rows.length,
        ...parsed,
        byNameKey: undefined,
        unmatchedNameCount: unmatchedNames.length,
        unmatchedNames: options.includeUnmatchedNames ? unmatchedNames : undefined,
        groups: summaries
      };
    };

    // Standalone dry-run kendi MongoClient bağlantısını kullanıyorsa sorgular
    // tamamlanmadan finally bloğunda bağlantının kapanmasını önle.
    if (dryRun) return await runImports();

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
  ERP_READ_FIELD_KEY,
  ERP_CETELE_COLUMNS,
  ON_DEMAND_SYNC_COOLDOWN_MS,
  buildErpCeteleFields,
  buildCeteleUpdate,
  planDay,
  sheetTimestampToDate,
  buildReadingInsert,
  erpCeteleKeysFor,
  parseErpCeteleValues,
  pickValues,
  getErpReadingsChangeVersion,
  syncErpReadings,
  syncErpReadingsOnDemand,
  scheduleErpReadingsSync,
  istanbulNowParts,
  previousDateStr,
  toComparableKey,
  sheetsSerialToDateStr,
  sheetTimestampSortValue,
  parseRisaleHours,
  isValidRisaleHours,
  hoursToAmount,
  getNameFromRow,
  buildEntriesByNameKey,
  buildReadingUpdate,
  fetchSheetRows,
  resolveDb,
  withErpSyncLock
};
