'use strict';

/*
 * Grup duyuruları. Yönetici yazar (metin + görünür olacağı tarih aralığı), grubun giriş yapmış
 * üyeleri okur.
 * - Duyurular announcements_<groupId> koleksiyonundadır (grup silinince koleksiyon da silinir).
 * - Tarih aralığı İstanbul gününe göredir: başlangıç günün 00:00'ında, bitiş günün 23:59'unda
 *   (bitiş dahil). İkisi de boş olabilir: başlangıç yoksa hemen, bitiş yoksa süresiz görünür.
 *   Başlangıcı gelmemiş duyuru "planlandı", bitişi geçmiş duyuru "süresi doldu" sayılır; ikisi de
 *   üyelere gösterilmez, yönetici listesinde kalır.
 * - Üyenin "yeni duyuru" bilgisi users_<groupId>.lastSeenAnnouncementAt ile tutulur; panel
 *   açılınca şimdiye çekilir. Görünür olduğu an (visibleFrom) bundan sonra olan duyurular okunmamıştır;
 *   planlı duyuru başlangıç günü gelince okunmamış sayılır.
 */

const mongoose = require('mongoose');

const ANNOUNCEMENT_MAX_LENGTH = 600;
const ANNOUNCEMENT_LIST_LIMIT = 50;
const ANNOUNCEMENT_STORE_LIMIT = 100;
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
// Türkiye 2016'dan beri yıl boyu UTC+3'tür.
const ISTANBUL_OFFSET = '+03:00';

function normalizeAnnouncementText(value) {
  if (typeof value !== 'string') return { error: 'Duyuru metni gerekli' };
  const text = value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text) return { error: 'Duyuru metni boş olamaz' };
  if (text.length > ANNOUNCEMENT_MAX_LENGTH) {
    return { error: `Duyuru en fazla ${ANNOUNCEMENT_MAX_LENGTH} karakter olabilir` };
  }
  return { text };
}

function isValidDateKey(value) {
  const match = DATE_KEY_PATTERN.exec(String(value));
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// body.startDate / body.endDate: "YYYY-MM-DD" ya da boş (sınırsız).
function announcementRange({ startDate, endDate }, { istanbulDateKey, now = new Date(), allowPastEnd = false }) {
  const start = startDate ? String(startDate) : '';
  const end = endDate ? String(endDate) : '';
  if ((start && !isValidDateKey(start)) || (end && !isValidDateKey(end))) {
    return { error: 'Geçersiz tarih' };
  }
  if (start && end && end < start) return { error: 'Bitiş tarihi başlangıçtan önce olamaz' };
  if (end && !allowPastEnd && end < istanbulDateKey(now)) return { error: 'Bitiş tarihi geçmişte olamaz' };
  return {
    startsAt: start ? new Date(`${start}T00:00:00.000${ISTANBUL_OFFSET}`) : null,
    expiresAt: end ? new Date(`${end}T23:59:59.999${ISTANBUL_OFFSET}`) : null
  };
}

function announcementStatus(doc, now = new Date()) {
  if (doc.startsAt && new Date(doc.startsAt) > now) return 'scheduled';
  if (doc.expiresAt && new Date(doc.expiresAt) <= now) return 'expired';
  return 'active';
}

// Duyurunun üyelere göründüğü an: başlangıç günü (daha geç ise) ya da yayımlandığı an.
function visibleFromTime(doc) {
  const created = new Date(doc.createdAt).getTime();
  const starts = doc.startsAt ? new Date(doc.startsAt).getTime() : 0;
  return Math.max(created, starts);
}

function serializeAnnouncement(doc, now = new Date()) {
  const iso = value => (value ? new Date(value).toISOString() : null);
  return {
    id: String(doc._id),
    text: doc.text,
    authorName: doc.authorName || '',
    createdAt: iso(doc.createdAt),
    updatedAt: iso(doc.updatedAt),
    startsAt: iso(doc.startsAt),
    expiresAt: iso(doc.expiresAt),
    visibleFrom: new Date(visibleFromTime(doc)).toISOString(),
    status: announcementStatus(doc, now)
  };
}

function countUnread(docs, lastSeenAt, now = new Date()) {
  const seen = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;
  return docs.filter(doc => announcementStatus(doc, now) === 'active' && visibleFromTime(doc) > seen).length;
}

function createAnnouncementService(dependencies) {
  const {
    getGroupCollections,
    istanbulDateKey
  } = dependencies;

  function visibleFilter(now) {
    return {
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }
      ]
    };
  }

  async function list({ groupId, userId, includeHidden = false }) {
    const { announcements, users } = getGroupCollections(groupId);
    const now = new Date();
    const [docs, user] = await Promise.all([
      announcements.find(includeHidden ? {} : visibleFilter(now)).limit(100).lean(),
      mongoose.isValidObjectId(userId)
        ? users.findById(userId).select('lastSeenAnnouncementAt').lean()
        : null
    ]);
    docs.sort((a, b) => visibleFromTime(b) - visibleFromTime(a));
    const lastSeenAt = user?.lastSeenAnnouncementAt || null;
    return {
      announcements: docs.slice(0, ANNOUNCEMENT_LIST_LIMIT).map(doc => serializeAnnouncement(doc, now)),
      lastSeenAt: lastSeenAt ? new Date(lastSeenAt).toISOString() : null,
      unreadCount: countUnread(docs, lastSeenAt, now)
    };
  }

  async function create({ groupId, userId, body }) {
    const textResult = normalizeAnnouncementText(body?.text);
    if (textResult.error) return { status: 400, error: textResult.error };
    const range = announcementRange(body || {}, { istanbulDateKey });
    if (range.error) return { status: 400, error: range.error };

    const { announcements, users } = getGroupCollections(groupId);
    if (await announcements.countDocuments() >= ANNOUNCEMENT_STORE_LIMIT) {
      return { status: 409, error: `En fazla ${ANNOUNCEMENT_STORE_LIMIT} duyuru tutulabilir; eski duyuruları silin` };
    }
    const author = mongoose.isValidObjectId(userId)
      ? await users.findById(userId).select('name').lean()
      : null;
    const now = new Date();
    const doc = await announcements.create({
      text: textResult.text,
      authorId: userId ? String(userId) : null,
      authorName: author?.name || '',
      startsAt: range.startsAt,
      expiresAt: range.expiresAt,
      createdAt: now
    });
    // Yazan yönetici kendi duyurusunu "yeni" olarak görmesin.
    if (author) await users.updateOne({ _id: author._id }, { $set: { lastSeenAnnouncementAt: now } });
    return { announcement: serializeAnnouncement(doc.toObject(), now) };
  }

  async function update({ groupId, announcementId, body }) {
    if (!mongoose.isValidObjectId(announcementId)) return { status: 400, error: 'Geçersiz duyuru' };
    const textResult = normalizeAnnouncementText(body?.text);
    if (textResult.error) return { status: 400, error: textResult.error };
    const { announcements } = getGroupCollections(groupId);
    const changes = { text: textResult.text, updatedAt: new Date() };
    // Tarih alanlarından biri gönderildiyse ikisi de yeniden belirlenir (boş = sınırsız).
    if (body && ('startDate' in body || 'endDate' in body)) {
      // Süresi dolmuş duyurunun yalnız metni düzenlenirken eski bitiş tarihi geçmişte kalabilir.
      const range = announcementRange(body, { istanbulDateKey, allowPastEnd: true });
      if (range.error) return { status: 400, error: range.error };
      changes.startsAt = range.startsAt;
      changes.expiresAt = range.expiresAt;
    }
    const doc = await announcements.findByIdAndUpdate(announcementId, { $set: changes }, { new: true }).lean();
    if (!doc) return { status: 404, error: 'Duyuru bulunamadı' };
    return { announcement: serializeAnnouncement(doc) };
  }

  async function remove({ groupId, announcementId }) {
    if (!mongoose.isValidObjectId(announcementId)) return { status: 400, error: 'Geçersiz duyuru' };
    const { announcements } = getGroupCollections(groupId);
    const result = await announcements.deleteOne({ _id: announcementId });
    if (!result.deletedCount) return { status: 404, error: 'Duyuru bulunamadı' };
    return { success: true };
  }

  async function markSeen({ groupId, userId }) {
    if (!mongoose.isValidObjectId(userId)) return { status: 400, error: 'Geçersiz kullanıcı' };
    const { users } = getGroupCollections(groupId);
    const seenAt = new Date();
    await users.updateOne({ _id: userId }, { $set: { lastSeenAnnouncementAt: seenAt } });
    return { lastSeenAt: seenAt.toISOString() };
  }

  return {
    announcementService: {
      create,
      list,
      markSeen,
      remove,
      update
    }
  };
}

module.exports = {
  ANNOUNCEMENT_MAX_LENGTH,
  announcementRange,
  announcementStatus,
  countUnread,
  createAnnouncementService,
  isValidDateKey,
  normalizeAnnouncementText,
  serializeAnnouncement,
  visibleFromTime
};
