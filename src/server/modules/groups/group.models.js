'use strict';

const mongoose = require('mongoose');
const { isSafeGroupId } = require('../../shared/group-id');
const {
  INACTIVE_MEMBER_ACTION_NONE,
  VALID_INACTIVE_MEMBER_ACTIONS
} = require('./inactive-member-policy');
const { VALID_AMOUNT_TYPES } = require('./group-settings');
const {
  READING_EDIT_POLICY_ALL,
  VALID_READING_EDIT_POLICIES
} = require('../readings/reading-edit-policy');
const {
  USER_VISIBILITY_ACTIVE,
  USER_VISIBILITY_PASSIVE
} = require('../users/user-visibility');

// Kullanıcı grupları modeli
const UserGroup = mongoose.model('UserGroup', {
  groupName: String,
  groupId: { type: String, required: true },
  description: String,
  groupImage: { type: String, default: null },
  visibility: { type: String, default: 'public' },
  amountType: { type: String, enum: [...VALID_AMOUNT_TYPES], default: 'sayfa' },
  readingEditPolicy: { type: String, enum: [...VALID_READING_EDIT_POLICIES], default: READING_EDIT_POLICY_ALL },
  autoMarkUnread: { type: Boolean, default: true },
  inactiveMemberAction: {
    type: String,
    enum: [...VALID_INACTIVE_MEMBER_ACTIONS],
    default: INACTIVE_MEMBER_ACTION_NONE
  },
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
  phone: { type: String, default: null }
});

const readingStatusSchema = new mongoose.Schema({
  userId: String,
  date: String,
  status: String,
  amount: { type: Number, required: false }
});

function getGroupCollections(groupId) {
  if (!isSafeGroupId(groupId)) throw new Error('Geçersiz grup kimliği');
  const userModelName = `users_${groupId}`;
  const readingStatusModelName = `readingstatuses_${groupId}`;

  // Eğer model zaten Mongoose'da varsa, onu kullan
  try {
    const existingUserModel = mongoose.model(userModelName);
    const existingReadingStatusModel = mongoose.model(readingStatusModelName);

    return {
      users: existingUserModel,
      readingStatuses: existingReadingStatusModel
    };
  } catch (error) {
    // Model yoksa oluştur
  }

  // Model'i oluştur
  const userModel = mongoose.model(userModelName, userSchema, userModelName);
  const readingStatusModel = mongoose.model(readingStatusModelName, readingStatusSchema, readingStatusModelName);

  return {
    users: userModel,
    readingStatuses: readingStatusModel
  };
}



module.exports = {
  UserGroup,
  getGroupCollections,
  readingStatusSchema,
  userSchema
};
