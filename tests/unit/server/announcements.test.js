'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ANNOUNCEMENT_MAX_LENGTH,
  announcementRange,
  announcementStatus,
  countUnread,
  isValidDateKey,
  normalizeAnnouncementText,
  serializeAnnouncement,
  visibleFromTime
} = require('../../../src/server/modules/announcements/announcement.service');
const { istanbulDateKey } = require('../../../src/server/shared/date-time');

test('duyuru metni: boşluklar temizlenir, boş ve çok uzun metin reddedilir', () => {
  assert.deepEqual(normalizeAnnouncementText('  Bugün herkes 20 sayfa okusun \r\n\r\n\r\n\r\nSelam  '), {
    text: 'Bugün herkes 20 sayfa okusun\n\nSelam'
  });
  assert.ok(normalizeAnnouncementText('   ').error);
  assert.ok(normalizeAnnouncementText(42).error);
  assert.ok(normalizeAnnouncementText('a'.repeat(ANNOUNCEMENT_MAX_LENGTH + 1)).error);
  assert.equal(normalizeAnnouncementText('a'.repeat(ANNOUNCEMENT_MAX_LENGTH)).text.length, ANNOUNCEMENT_MAX_LENGTH);
});

test('tarih anahtarı: yalnız gerçek YYYY-MM-DD günleri geçerlidir', () => {
  assert.ok(isValidDateKey('2026-11-28'));
  assert.ok(!isValidDateKey('2026-02-30'));
  assert.ok(!isValidDateKey('28.11.2026'));
  assert.ok(!isValidDateKey('2026-13-01'));
});

test('duyuru aralığı İstanbul gün sınırlarına göre hesaplanır', () => {
  // 28 Kasım 2026 22:30 UTC = 29 Kasım 01:30 İstanbul
  const now = new Date('2026-11-28T22:30:00Z');
  const options = { istanbulDateKey, now };
  assert.deepEqual(announcementRange({}, options), { startsAt: null, expiresAt: null });
  const range = announcementRange({ startDate: '2026-12-01', endDate: '2026-12-03' }, options);
  assert.equal(range.startsAt.toISOString(), '2026-11-30T21:00:00.000Z');
  assert.equal(range.expiresAt.toISOString(), '2026-12-03T20:59:59.999Z');
  assert.ok(announcementRange({ startDate: '2026-12-05', endDate: '2026-12-01' }, options).error);
  assert.ok(announcementRange({ startDate: 'dün' }, options).error);
  // Bitiş bugünden (İstanbul: 29 Kasım) önce olamaz; düzenlemede geçmiş bitişe izin verilir.
  assert.ok(announcementRange({ endDate: '2026-11-28' }, options).error);
  assert.equal(announcementRange({ endDate: '2026-11-29' }, options).error, undefined);
  assert.equal(announcementRange({ endDate: '2026-11-28' }, { ...options, allowPastEnd: true }).error, undefined);
});

test('duyuru durumu: planlı, etkin ve süresi dolmuş', () => {
  const now = new Date('2026-11-28T12:00:00Z');
  const createdAt = new Date('2026-11-27T09:00:00Z');
  assert.equal(announcementStatus({ createdAt, startsAt: new Date('2026-11-29T00:00:00Z') }, now), 'scheduled');
  assert.equal(announcementStatus({ createdAt, startsAt: new Date('2026-11-28T00:00:00Z'), expiresAt: new Date('2026-11-30T00:00:00Z') }, now), 'active');
  assert.equal(announcementStatus({ createdAt, expiresAt: new Date('2026-11-28T11:00:00Z') }, now), 'expired');
  assert.equal(announcementStatus({ createdAt }, now), 'active');
});

test('okunmamış sayısı yalnız görünür olduğu an son görülmeden sonra olan etkin duyuruları sayar', () => {
  const now = new Date('2026-11-28T12:00:00Z');
  const docs = [
    { _id: 'a', text: 'yeni', createdAt: new Date('2026-11-28T11:00:00Z') },
    { _id: 'b', text: 'süresi doldu', createdAt: new Date('2026-11-28T10:30:00Z'), expiresAt: new Date('2026-11-28T11:30:00Z') },
    { _id: 'c', text: 'eski', createdAt: new Date('2026-11-27T09:00:00Z') },
    { _id: 'd', text: 'planlı', createdAt: new Date('2026-11-26T09:00:00Z'), startsAt: new Date('2026-11-29T00:00:00Z') },
    // Dün yazılmış ama bugün başlamış: başlangıç gününde yeni sayılır.
    { _id: 'e', text: 'bugün başladı', createdAt: new Date('2026-11-26T09:00:00Z'), startsAt: new Date('2026-11-28T00:00:00Z') }
  ];
  assert.equal(countUnread(docs, new Date('2026-11-27T23:00:00Z'), now), 2);
  assert.equal(countUnread(docs, new Date('2026-11-28T08:00:00Z'), now), 1);
  assert.equal(countUnread(docs, null, now), 3);
  assert.equal(countUnread(docs, now, now), 0);
  assert.equal(visibleFromTime(docs[4]), new Date('2026-11-28T00:00:00Z').getTime());
  assert.equal(serializeAnnouncement(docs[1], now).status, 'expired');
  assert.equal(serializeAnnouncement(docs[3], now).status, 'scheduled');
  assert.equal(serializeAnnouncement(docs[0], now).visibleFrom, '2026-11-28T11:00:00.000Z');
});
