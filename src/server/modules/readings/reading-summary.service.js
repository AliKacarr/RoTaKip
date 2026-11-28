'use strict';

/*
 * Okumalarım ana sayfası (/gruplar) için üyelik özeti.
 * Oturumdaki her grup için: kişinin bugünkü durumu, son 7 gün, güncel seri ve grubun bugünkü katılımı.
 * Hesaplar saf fonksiyonlardır (birim testli); servis yalnız sorguları toplar.
 */

const mongoose = require('mongoose');

const MAX_GROUPS = 30;
const HISTORY_DAYS = 400;
const WEEK_DAYS = 7;

// Haftalık tablodaki seri kuralı: bugün okumadım ise 0; bugün boşsa dünden geriye sayılır.
function currentStreak(statusByDate, today, shiftDateKey) {
  const todayStatus = statusByDate.get(today);
  if (todayStatus === 'okumadım') return 0;
  let cursor = todayStatus === 'okudum' ? today : shiftDateKey(today, -1);
  let streak = 0;
  while (statusByDate.get(cursor) === 'okudum') {
    streak += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return streak;
}

function summarizeMemberReadings(records, { today, shiftDateKey }) {
  const statusByDate = new Map();
  const amountByDate = new Map();
  (Array.isArray(records) ? records : []).forEach(record => {
    if (!record || typeof record.date !== 'string') return;
    if (record.status !== 'okudum' && record.status !== 'okumadım') return;
    statusByDate.set(record.date, record.status);
    if (record.status === 'okudum' && Number.isFinite(Number(record.amount)) && record.amount !== null) {
      amountByDate.set(record.date, Number(record.amount));
    }
  });

  const week = [];
  for (let offset = WEEK_DAYS - 1; offset >= 0; offset--) {
    const date = shiftDateKey(today, -offset);
    week.push({ date, status: statusByDate.get(date) || '' });
  }

  return {
    status: statusByDate.get(today) || '',
    amount: amountByDate.has(today) ? amountByDate.get(today) : null,
    week,
    streak: currentStreak(statusByDate, today, shiftDateKey),
    // Bugünkü işarete bağlı olmayan seri (dünden geriye); istemci anında işaretlemede kullanır.
    previousStreak: currentStreak(statusByDate, shiftDateKey(today, -1), shiftDateKey),
    readDays: Array.from(statusByDate.values()).filter(status => status === 'okudum').length
  };
}

function createReadingSummaryService({
  activeUserQuery,
  getGroupCollections,
  isActiveUser,
  istanbulDateKey,
  normalizeAmountType,
  normalizeReadingEditPolicy,
  shiftDateKey,
  UserGroup
}) {
  async function summarizeGroup(group, membership, { today, from }) {
    const memberId = String(membership.userId || '');
    const { users, readingStatuses } = getGroupCollections(group.groupId);
    const user = mongoose.Types.ObjectId.isValid(memberId)
      ? await users.findById(memberId).select('_id authority visibility').lean()
      : null;
    if (!user || !isActiveUser(user)) return null;

    const activeUsers = await users.find(activeUserQuery()).select('_id').lean();
    const activeIds = activeUsers.map(item => String(item._id));
    const records = await readingStatuses.find({ userId: memberId, date: { $gte: from } })
      .select('date status amount -_id').lean();
    const readToday = await readingStatuses.countDocuments({ userId: { $in: activeIds }, date: today, status: 'okudum' });

    return {
      groupId: group.groupId,
      groupName: group.groupName,
      groupImage: group.groupImage || null,
      authority: user.authority,
      amountType: normalizeAmountType(group.amountType),
      readingEditPolicy: normalizeReadingEditPolicy(group.readingEditPolicy),
      memberCount: activeIds.length,
      readToday,
      me: summarizeMemberReadings(records, { today, shiftDateKey }),
      userId: memberId
    };
  }

  // Oturum kaydı tek başına üyelik kanıtı değildir: silinen/pasife alınan üyelikler elenir.
  async function summarizeMemberships(memberships) {
    const groupIds = Object.keys(memberships || {}).slice(0, MAX_GROUPS);
    if (!groupIds.length) return { groups: [], staleGroupIds: [] };

    const today = istanbulDateKey();
    const from = shiftDateKey(today, -(HISTORY_DAYS - 1));
    const groups = await UserGroup.find({ groupId: { $in: groupIds } }).lean();
    const foundIds = new Set(groups.map(group => group.groupId));
    const staleGroupIds = groupIds.filter(groupId => !foundIds.has(groupId));

    const results = await Promise.all(groups.map(async group => {
      try {
        const summary = await summarizeGroup(group, memberships[group.groupId], { today, from });
        if (!summary) staleGroupIds.push(group.groupId);
        return summary;
      } catch (error) {
        console.error(`Grup özeti alınamadı (${group.groupId}):`, error);
        return null;
      }
    }));

    return { groups: results.filter(Boolean), staleGroupIds, today };
  }

  return { readingSummaryService: { summarizeMemberships } };
}

module.exports = {
  HISTORY_DAYS,
  MAX_GROUPS,
  createReadingSummaryService,
  currentStreak,
  summarizeMemberReadings
};
