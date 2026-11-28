'use strict';

const mongoose = require('mongoose');
const { isSafeGroupId } = require('../../shared/group-id');
const {
  INACTIVE_MEMBER_ACTION_NONE,
  VALID_INACTIVE_MEMBER_ACTIONS
} = require('./inactive-member-policy');
const {
  DEFAULT_HERO_THEME,
  VALID_AMOUNT_TYPES,
  VALID_CETELE_FIELD_TYPES,
  VALID_HERO_THEMES
} = require('./group-settings');
const {
  READING_EDIT_POLICY_ALL,
  VALID_READING_EDIT_POLICIES
} = require('../readings/reading-edit-policy');
const {
  USER_VISIBILITY_ACTIVE,
  USER_VISIBILITY_PASSIVE
} = require('../users/user-visibility');

// Çetele (günlük rutin) alanı. Değerler kayıtlarda alan anahtarıyla tutulur; etiket
// değişse de geçmiş kayıtlar bozulmaz. Kaldırılan alan silinmez, arşivlenir.
const ceteleFieldSchema = new mongoose.Schema({
  key: { type: String, required: true },
  label: { type: String, required: true },
  type: { type: String, enum: [...VALID_CETELE_FIELD_TYPES], default: 'sayi' },
  unit: { type: String, default: '' },
  options: { type: [Number], default: [] },
  step: { type: Number, default: 1 },
  max: { type: Number, default: 99999 },
  allowCustom: { type: Boolean, default: true },
  zeroLabel: { type: String, default: '' },
  required: { type: Boolean, default: false },
  archived: { type: Boolean, default: false }
}, { _id: false });

// Kullanıcı grupları modeli
const UserGroup = mongoose.model('UserGroup', {
  groupName: String,
  groupId: { type: String, required: true },
  description: String,
  groupImage: { type: String, default: null },
  heroTheme: { type: String, enum: [...VALID_HERO_THEMES], default: DEFAULT_HERO_THEME },
  visibility: { type: String, default: 'public' },
  amountType: { type: String, enum: [...VALID_AMOUNT_TYPES], default: 'sayfa' },
  readingEditPolicy: { type: String, enum: [...VALID_READING_EDIT_POLICIES], default: READING_EDIT_POLICY_ALL },
  autoMarkUnread: { type: Boolean, default: true },
  inactiveMemberAction: {
    type: String,
    enum: [...VALID_INACTIVE_MEMBER_ACTIONS],
    default: INACTIVE_MEMBER_ACTION_NONE
  },
  // Günlük çetele alanları. İlk açık alan okuma alanıdır (varsayılan "Kitap okuma");
  // lig ve seri ona göre hesaplanır. Kayıt yoksa varsayılan tek alan kullanılır.
  ceteleFields: { type: [ceteleFieldSchema], default: undefined },
  createdAt: { type: Date, default: Date.now }
});



// Global şemalar
const userSchema = new mongoose.Schema({
  name: String,
  profileImage: String,
  username: String,
  userpassword: String,
  authority: String,
  visibility: {
    type: String,
    enum: [USER_VISIBILITY_ACTIVE, USER_VISIBILITY_PASSIVE],
    default: USER_VISIBILITY_ACTIVE
  },
  loginStreak: { type: Number, default: 0 },
  lastLoginDate: { type: String, default: null },
  lastCongratulatedLeague: { type: String, default: 'Bronz' },
  phone: { type: String, default: null },
  // Üyenin duyurular panelini en son açtığı an; bundan sonra yayımlananlar "yeni" sayılır.
  lastSeenAnnouncementAt: { type: Date, default: null }
});

const readingStatusSchema = new mongoose.Schema({
  userId: String,
  date: String,
  status: String,
  amount: { type: Number, required: false },
  // Son yazan siteyse yazma anı, ERP'yse formun gönderim anı. ERP senkronu, formdan daha yeni
  // bir site düzenlemesini ezmemek için kullanır; eski satırlarda yoktur (form kazanır).
  updatedAt: { type: Date, required: false }
});

// Çetele kaydı: kişi başına günde bir kayıt; values = { alanAnahtarı: sayı | metin }.
// Okuma alanının değeri burada değil readingstatuses koleksiyonunda tutulur.
const ceteleEntrySchema = new mongoose.Schema({
  userId: String,
  date: String,
  values: { type: mongoose.Schema.Types.Mixed, default: {} },
  updatedAt: { type: Date, default: Date.now }
}, { minimize: false });

// Yöneticinin gruba duyurusu. Aralığın dışındaki (planlı ya da süresi dolmuş) duyuru üyelere
// gösterilmez ama yönetici listesinde kalır (silinene kadar).
const announcementSchema = new mongoose.Schema({
  text: { type: String, required: true },
  authorId: { type: String, default: null },
  authorName: { type: String, default: '' },
  // Görünür olduğu aralık: startsAt boşsa hemen, expiresAt boşsa süresiz (İstanbul gün sınırları).
  startsAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: null }
});

function getOrCreateModel(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema, name);
}

function getGroupCollections(groupId) {
  if (!isSafeGroupId(groupId)) throw new Error('Geçersiz grup kimliği');
  return {
    users: getOrCreateModel(`users_${groupId}`, userSchema),
    readingStatuses: getOrCreateModel(`readingstatuses_${groupId}`, readingStatusSchema),
    ceteleEntries: getOrCreateModel(`cetele_${groupId}`, ceteleEntrySchema),
    announcements: getOrCreateModel(`announcements_${groupId}`, announcementSchema)
  };
}



module.exports = {
  UserGroup,
  announcementSchema,
  ceteleEntrySchema,
  getGroupCollections,
  readingStatusSchema,
  userSchema
};
