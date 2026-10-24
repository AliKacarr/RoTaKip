/**
 * Google Form aktif kullanıcı listesi → ERP SKO kullanıcı koleksiyonları senkronu.
 *
 * - Form'da olup geçerli ekibi bulunan yeni kullanıcıları ekler.
 * - Grubu değişen kullanıcı, okumaları ve açık oturumlarını hedef gruba taşır.
 * - Form'da bulunmayan kullanıcıları (admin dahil), okumalarını ve oturumlarını siler.
 * - Yeni kullanıcıların 2025-01-01 sonrası geçmişini ilk pozitif okumadan kurar.
 * - Tek çalışmada %25'ten fazla kalıcı silmeyi --force olmadan engeller.
 * - Cron: her gece 00:30 (Europe/Istanbul).
 */
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const schedule = require('node-schedule');
const { ObjectId } = require('mongodb');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const {
  ERP_SKO_GROUPS,
  fetchSheetRows,
  getNameFromRow,
  hoursToAmount,
  isValidRisaleHours,
  istanbulNowParts,
  parseRisaleHours,
  previousDateStr,
  resolveDb,
  sheetsSerialToDateStr,
  toComparableKey,
  withErpSyncLock
} = require('./erpReadingsSync');

const FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSc4Ru7BjsB-sNgdw5-r9hBF-yqXuG7gA6OUJISYVjzlCByyjQ/viewform';
const FORM_NAME_QUESTION_ID = 206324904;
const HISTORY_START_DATE = '2025-01-01';
const MAX_DELETE_RATIO = 0.25;
const FORM_REQUEST_TIMEOUT_MS = 20 * 1000;
const FORM_REQUEST_ATTEMPTS = 3;
const USER_SYNC_LOCK_WAIT_MS = 5 * 60 * 1000;

const COL = {
  TIMESTAMP: 0,
  TEAM: 2,
  RISALE_HOURS: 6
};

const TEAM_TO_GROUP = new Map([
  ['ekip a', 'sko-ekip-a'],
  ['ekip b', 'sko-ekip-b'],
  ['ekip c', 'sko-ekip-c'],
  ['ekip d', 'sko-ekip-d'],
  ['towards eternity', 'sko-towards-eternity']
]);

function normalizeDisplayName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeTeam(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTextWithRetry(url) {
  let lastError;
  for (let attempt = 1; attempt <= FORM_REQUEST_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FORM_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'user-agent':
            'Mozilla/5.0 (compatible; RoTaKip ERP user sync; +https://rotakip.onrender.com)'
        }
      });
      if (!response.ok) throw new Error(`Form HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < FORM_REQUEST_ATTEMPTS) await wait(attempt * 1000);
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw new Error(`Google Form alınamadı: ${lastError?.message || 'bilinmeyen hata'}`);
}

function extractFormUsersFromHtml(html) {
  const source = String(html || '');
  const match = source.match(/var FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);<\/script>/);
  if (!match) throw new Error('Google Form kullanıcı veri bloğu bulunamadı');

  let data;
  try {
    data = JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`Google Form kullanıcı veri bloğu ayrıştırılamadı: ${error.message}`, {
      cause: error
    });
  }

  const questions = data?.[1]?.[1];
  if (!Array.isArray(questions)) throw new Error('Google Form soru listesi bulunamadı');

  const nameQuestion = questions.find((question) => {
    const title = normalizeTeam(question?.[1]);
    return question?.[0] === FORM_NAME_QUESTION_ID || title.startsWith('ad soyad');
  });
  const options = nameQuestion?.[4]?.[0]?.[1];
  if (!Array.isArray(options) || options.length === 0) {
    throw new Error('Google Form Ad Soyad seçenekleri bulunamadı veya boş');
  }

  const users = new Map();
  for (const option of options) {
    const displayName = normalizeDisplayName(option?.[0]);
    if (!displayName) continue;
    const key = toComparableKey(displayName);
    if (!key) continue;
    if (users.has(key) && users.get(key) !== displayName) {
      throw new Error(`Google Form içinde çakışan kullanıcı adı bulundu: ${displayName}`);
    }
    users.set(key, displayName);
  }

  if (users.size === 0) throw new Error('Google Form aktif kullanıcı listesi boş');
  return users;
}

async function fetchFormUsers() {
  const html = await fetchTextWithRetry(FORM_URL);
  return extractFormUsersFromHtml(html);
}

function timestampSortValue(value) {
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

function buildLatestTeams(rows, formUsers) {
  const latestByName = new Map();
  rows.forEach((row, rowIndex) => {
    const nameKey = toComparableKey(getNameFromRow(row));
    if (!formUsers.has(nameKey)) return;

    const sortValue = timestampSortValue(row[COL.TIMESTAMP]);
    const current = latestByName.get(nameKey);
    if (!current || sortValue > current.sortValue ||
        (sortValue === current.sortValue && rowIndex > current.rowIndex)) {
      latestByName.set(nameKey, {
        team: normalizeDisplayName(row[COL.TEAM]),
        sortValue,
        rowIndex
      });
    }
  });

  const targets = new Map();
  const unresolved = [];
  for (const [nameKey, displayName] of formUsers) {
    const latest = latestByName.get(nameKey);
    const groupId = TEAM_TO_GROUP.get(normalizeTeam(latest?.team));
    if (!groupId) {
      unresolved.push({ nameKey, displayName, team: latest?.team || '' });
      continue;
    }
    targets.set(nameKey, { nameKey, displayName, groupId, team: latest.team });
  }

  return { latestByName, targets, unresolved };
}

function currentUserIdentity(user) {
  return `${user.groupId}:${String(user._id)}`;
}

function selectCanonicalUser(users) {
  return [...users].sort((a, b) => {
    if (a.authority === 'admin' && b.authority !== 'admin') return -1;
    if (b.authority === 'admin' && a.authority !== 'admin') return 1;
    return String(a._id).localeCompare(String(b._id));
  })[0];
}

function buildSyncPlan(formUsers, teamInfo, currentUsers) {
  const currentByName = new Map();
  for (const user of currentUsers) {
    const nameKey = toComparableKey(user.name);
    const normalizedUser = { ...user, nameKey };
    if (!currentByName.has(nameKey)) currentByName.set(nameKey, []);
    currentByName.get(nameKey).push(normalizedUser);
  }

  const additions = [];
  const moves = [];
  const removals = [];
  const unchanged = [];
  const unresolvedExisting = [];
  const removalIds = new Set();

  const addRemoval = (user, reason) => {
    const identity = currentUserIdentity(user);
    if (removalIds.has(identity)) return;
    removalIds.add(identity);
    removals.push({ user, reason });
  };

  for (const [nameKey, displayName] of formUsers) {
    const matches = currentByName.get(nameKey) || [];
    const target = teamInfo.targets.get(nameKey);

    if (!target) {
      if (matches.length) unresolvedExisting.push(...matches);
      continue;
    }

    const alreadyInTarget = matches.filter((user) => user.groupId === target.groupId);
    if (alreadyInTarget.length) {
      const keep = selectCanonicalUser(alreadyInTarget);
      unchanged.push({ user: keep, target });
      for (const duplicate of matches) {
        if (currentUserIdentity(duplicate) !== currentUserIdentity(keep)) {
          addRemoval(duplicate, 'duplicate');
        }
      }
      continue;
    }

    if (matches.length) {
      const sourceUser = selectCanonicalUser(matches);
      moves.push({ user: sourceUser, target });
      for (const duplicate of matches) {
        if (currentUserIdentity(duplicate) !== currentUserIdentity(sourceUser)) {
          addRemoval(duplicate, 'duplicate');
        }
      }
      continue;
    }

    additions.push({ nameKey, displayName, target });
  }

  for (const user of currentUsers) {
    const nameKey = toComparableKey(user.name);
    if (!formUsers.has(nameKey)) addRemoval(user, 'absent-from-form');
  }

  const deleteRatio = currentUsers.length ? removals.length / currentUsers.length : 0;
  return {
    additions,
    moves,
    removals,
    unchanged,
    unresolvedExisting,
    deleteRatio,
    deleteGuardExceeded: deleteRatio > MAX_DELETE_RATIO
  };
}

function addDays(dateStr, dayCount) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + dayCount);
  return date.toISOString().slice(0, 10);
}

function buildHistoricalStatuses(rows, nameKey, today) {
  const latestByDate = new Map();

  rows.forEach((row, rowIndex) => {
    if (toComparableKey(getNameFromRow(row)) !== nameKey) return;
    const date = sheetsSerialToDateStr(row[COL.TIMESTAMP]);
    if (!date || date < HISTORY_START_DATE || date > today) return;

    const hours = parseRisaleHours(row[COL.RISALE_HOURS]);
    if (!isValidRisaleHours(hours)) return;

    const sortValue = timestampSortValue(row[COL.TIMESTAMP]);
    const current = latestByDate.get(date);
    if (!current || sortValue > current.sortValue ||
        (sortValue === current.sortValue && rowIndex > current.rowIndex)) {
      latestByDate.set(date, { hours, sortValue, rowIndex });
    }
  });

  const firstPositiveDate = [...latestByDate.entries()]
    .filter(([, entry]) => entry.hours > 0)
    .map(([date]) => date)
    .sort()[0];
  if (!firstPositiveDate) return [];

  const statuses = [];
  const yesterday = previousDateStr(today);
  for (let date = firstPositiveDate; date <= yesterday; date = addDays(date, 1)) {
    const entry = latestByDate.get(date);
    if (entry?.hours > 0) {
      statuses.push({ date, status: 'okudum', amount: hoursToAmount(entry.hours), __v: 0 });
    } else {
      statuses.push({ date, status: 'okumadım', __v: 0 });
    }
  }

  const todayEntry = latestByDate.get(today);
  if (todayEntry) {
    if (todayEntry.hours > 0) {
      statuses.push({
        date: today,
        status: 'okudum',
        amount: hoursToAmount(todayEntry.hours),
        __v: 0
      });
    } else {
      statuses.push({ date: today, status: 'okumadım', __v: 0 });
    }
  }

  return statuses;
}

async function loadCurrentUsers(db) {
  const users = [];
  for (const groupId of ERP_SKO_GROUPS) {
    const groupUsers = await db.collection(`users_${groupId}`).find({}).toArray();
    users.push(...groupUsers.map((user) => ({ ...user, groupId })));
  }
  return users;
}

function readingUserFilter(userId) {
  const values = [String(userId)];
  if (userId instanceof ObjectId) values.push(userId);
  return { userId: { $in: values } };
}

function sessionMembershipPath(groupId) {
  if (!ERP_SKO_GROUPS.includes(groupId)) {
    throw new Error(`Geçersiz ERP grup kimliği: ${groupId}`);
  }
  return `session.memberships.${groupId}`;
}

async function migrateUserSessions(db, sourceGroupId, targetGroupId, user, session) {
  const sourcePath = sessionMembershipPath(sourceGroupId);
  const targetPath = sessionMembershipPath(targetGroupId);
  const userId = String(user._id);
  const result = await db.collection('sessions').updateMany(
    { [`${sourcePath}.userId`]: userId },
    {
      $unset: { [sourcePath]: '' },
      $set: {
        [targetPath]: {
          userId,
          authority: user.authority || 'member'
        }
      }
    },
    { session }
  );
  return result.modifiedCount || 0;
}

async function invalidateUserSessions(db, groupId, userId, session) {
  const membershipPath = sessionMembershipPath(groupId);
  const result = await db.collection('sessions').updateMany(
    { [`${membershipPath}.userId`]: String(userId) },
    { $unset: { [membershipPath]: '' } },
    { session }
  );
  return result.modifiedCount || 0;
}

async function runInTransaction(db, task) {
  const client = db.client;
  if (!client || typeof client.startSession !== 'function') {
    throw new Error('MongoDB transaction oturumu başlatılamadı');
  }

  const session = client.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await task(session);
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' }
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function findAvailableUsername(collection, preferred, userId, session) {
  const base = normalizeDisplayName(preferred) || `uye-${String(userId).slice(-6)}`;
  const available = async (candidate) => {
    const existing = await collection.findOne(
      { username: candidate, _id: { $ne: userId } },
      { projection: { _id: 1 }, session }
    );
    return !existing;
  };

  if (await available(base)) return base;
  for (let suffix = 100; suffix <= 999; suffix += 1) {
    const candidate = `${base}${suffix}`;
    if (await available(candidate)) return candidate;
  }
  throw new Error(`Benzersiz kullanıcı adı üretilemedi: ${base}`);
}

async function insertManyInChunks(collection, documents, session) {
  const chunkSize = 500;
  for (let index = 0; index < documents.length; index += chunkSize) {
    await collection.insertMany(documents.slice(index, index + chunkSize), {
      ordered: true,
      session
    });
  }
}

async function addUser(db, addition, rows, today) {
  const userId = new ObjectId();
  const plainPassword = crypto.randomBytes(24).toString('base64url');
  const passwordHash = await bcrypt.hash(plainPassword, 10);
  const history = buildHistoricalStatuses(rows, addition.nameKey, today)
    .map((status) => ({ ...status, userId: String(userId) }));

  await runInTransaction(db, async (session) => {
    const users = db.collection(`users_${addition.target.groupId}`);
    const readings = db.collection(`readingstatuses_${addition.target.groupId}`);
    const username = await findAvailableUsername(
      users,
      addition.displayName,
      userId,
      session
    );

    await users.insertOne({
      _id: userId,
      name: addition.displayName,
      profileImage: '/images/default.png',
      username,
      userpassword: passwordHash,
      authority: 'member',
      loginStreak: 0,
      lastLoginDate: null,
      lastCongratulatedLeague: 'Bronz',
      phone: null,
      __v: 0
    }, { session });

    if (history.length) await insertManyInChunks(readings, history, session);
  });

  return history.length;
}

async function moveUser(db, move) {
  const sourceUsers = db.collection(`users_${move.user.groupId}`);
  const sourceReadings = db.collection(`readingstatuses_${move.user.groupId}`);
  const targetUsers = db.collection(`users_${move.target.groupId}`);
  const targetReadings = db.collection(`readingstatuses_${move.target.groupId}`);
  const userId = move.user._id;

  return runInTransaction(db, async (session) => {
    const sourceUser = await sourceUsers.findOne({ _id: userId }, { session });
    if (!sourceUser) return { readings: 0, sessions: 0 };

    const sourceStatuses = await sourceReadings
      .find(readingUserFilter(userId), { session })
      .toArray();
    const username = await findAvailableUsername(
      targetUsers,
      sourceUser.username || sourceUser.name,
      userId,
      session
    );
    const movedUser = { ...sourceUser, username };

    await targetUsers.replaceOne({ _id: userId }, movedUser, { upsert: true, session });
    await targetReadings.deleteMany(readingUserFilter(userId), { session });
    if (sourceStatuses.length) {
      await insertManyInChunks(targetReadings, sourceStatuses, session);
    }
    await sourceReadings.deleteMany(readingUserFilter(userId), { session });
    await sourceUsers.deleteOne({ _id: userId }, { session });
    const migratedSessions = await migrateUserSessions(
      db,
      move.user.groupId,
      move.target.groupId,
      movedUser,
      session
    );

    return { readings: sourceStatuses.length, sessions: migratedSessions };
  });
}

async function removeUser(db, removal) {
  const users = db.collection(`users_${removal.user.groupId}`);
  const readings = db.collection(`readingstatuses_${removal.user.groupId}`);
  const userId = removal.user._id;

  return runInTransaction(db, async (session) => {
    const deletedReadings = await readings.deleteMany(readingUserFilter(userId), { session });
    const deletedUser = await users.deleteOne({ _id: userId }, { session });
    const invalidatedSessions = await invalidateUserSessions(
      db,
      removal.user.groupId,
      userId,
      session
    );
    return {
      users: deletedUser.deletedCount || 0,
      readings: deletedReadings.deletedCount || 0,
      sessions: invalidatedSessions
    };
  });
}

function summarizePlan(formUsers, teamInfo, currentUsers, plan) {
  return {
    formUsers: formUsers.size,
    validTeamUsers: teamInfo.targets.size,
    unresolvedTeamUsers: teamInfo.unresolved.length,
    currentUsers: currentUsers.length,
    unchangedUsers: plan.unchanged.length,
    addUsers: plan.additions.length,
    moveUsers: plan.moves.length,
    deleteUsers: plan.removals.length,
    keepExistingWithUnresolvedTeam: plan.unresolvedExisting.length,
    deleteRatio: Number(plan.deleteRatio.toFixed(4)),
    deleteGuardExceeded: plan.deleteGuardExceeded
  };
}

async function prepareSync(db, formUsers, rows) {
  const teamInfo = buildLatestTeams(rows, formUsers);
  const currentUsers = await loadCurrentUsers(db);
  const plan = buildSyncPlan(formUsers, teamInfo, currentUsers);
  const summary = summarizePlan(formUsers, teamInfo, currentUsers, plan);
  return { teamInfo, currentUsers, plan, summary };
}

async function applyPlan(db, plan, rows, today) {
  const result = {
    addedUsers: 0,
    addedReadingStatuses: 0,
    movedUsers: 0,
    movedReadingStatuses: 0,
    migratedSessions: 0,
    deletedUsers: 0,
    deletedReadingStatuses: 0,
    invalidatedSessions: 0
  };

  // Önce ekleme ve taşımaları tamamla. Bunlardan biri başarısızsa kalıcı silmelere geçme.
  for (const addition of plan.additions) {
    result.addedReadingStatuses += await addUser(db, addition, rows, today);
    result.addedUsers += 1;
  }
  for (const move of plan.moves) {
    const moved = await moveUser(db, move);
    result.movedReadingStatuses += moved.readings;
    result.migratedSessions += moved.sessions;
    result.movedUsers += 1;
  }
  for (const removal of plan.removals) {
    const deleted = await removeUser(db, removal);
    result.deletedUsers += deleted.users;
    result.deletedReadingStatuses += deleted.readings;
    result.invalidatedSessions += deleted.sessions;
  }

  return result;
}

/**
 * @param {object} [options]
 * @param {import('mongodb').Db} [options.db]
 * @param {boolean} [options.dryRun=false]
 * @param {boolean} [options.force=false]
 */
async function syncErpUsers(options = {}) {
  const dryRun = options.dryRun === true;
  const force = options.force === true;
  const [formUsers, rows] = await Promise.all([fetchFormUsers(), fetchSheetRows()]);
  const { today } = istanbulNowParts();
  const { db, close } = await resolveDb(options.db);

  try {
    if (dryRun) {
      const prepared = await prepareSync(db, formUsers, rows);
      return {
        success: true,
        dryRun: true,
        blocked: prepared.plan.deleteGuardExceeded && !force,
        today,
        sheetRows: rows.length,
        ...prepared.summary
      };
    }

    const lockResult = await withErpSyncLock(
      db,
      `users-${process.pid}-${Date.now()}`,
      async () => {
        const prepared = await prepareSync(db, formUsers, rows);
        if (prepared.plan.deleteGuardExceeded && !force) {
          return {
            success: false,
            blocked: true,
            reason: 'delete-ratio-exceeded',
            today,
            sheetRows: rows.length,
            ...prepared.summary
          };
        }

        const applied = await applyPlan(db, prepared.plan, rows, today);
        return {
          success: true,
          dryRun: false,
          blocked: false,
          today,
          sheetRows: rows.length,
          ...prepared.summary,
          ...applied
        };
      },
      { waitMs: USER_SYNC_LOCK_WAIT_MS, retryMs: 2000 }
    );

    if (!lockResult.acquired) {
      return {
        success: false,
        blocked: true,
        reason: 'erp-sync-lock-timeout',
        today,
        sheetRows: rows.length
      };
    }
    return lockResult.value;
  } finally {
    if (close) await close();
  }
}

let scheduledSyncRunning = false;

async function runScheduledUserSync(getDb) {
  if (scheduledSyncRunning) return;
  scheduledSyncRunning = true;
  try {
    const db = typeof getDb === 'function' ? getDb() : undefined;
    const result = await syncErpUsers({ db });
    console.log('[ErpUsersSync]', result);
  } catch (error) {
    console.error('[ErpUsersSync]', error.message || error);
  } finally {
    scheduledSyncRunning = false;
  }
}

function scheduleErpUsersSync(getDb) {
  if (process.env.NODE_ENV === 'development') {
    console.log('⏭️ ERP kullanıcı senkronu atlandı (NODE_ENV=development).');
    return null;
  }

  const job = schedule.scheduleJob(
    { rule: '30 0 * * *', tz: 'Europe/Istanbul' },
    () => runScheduledUserSync(getDb)
  );
  console.log('✅ ERP kullanıcı senkronu kuruldu: Her gece 00:30 (Europe/Istanbul).');
  return job;
}

module.exports = {
  FORM_URL,
  HISTORY_START_DATE,
  MAX_DELETE_RATIO,
  TEAM_TO_GROUP,
  addDays,
  buildHistoricalStatuses,
  buildLatestTeams,
  buildSyncPlan,
  extractFormUsersFromHtml,
  invalidateUserSessions,
  migrateUserSessions,
  normalizeDisplayName,
  normalizeTeam,
  scheduleErpUsersSync,
  summarizePlan,
  syncErpUsers
};

if (require.main === module) {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const force = args.has('--force');

  syncErpUsers({ dryRun, force })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (!result.success && !dryRun) process.exitCode = 2;
    })
    .catch((error) => {
      console.error('[ErpUsersSync] Hata:', error.message || error);
      process.exitCode = 1;
    });
}
