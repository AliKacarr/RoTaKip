'use strict';

const mongoose = require('mongoose');

// Davet modeli — expiresAt dolunca MongoDB TTL ile silinir (expireAfterSeconds: 0)
const inviteSchema = new mongoose.Schema({
  inviteTokenHash: String,
  userId: String,
  userName: String,
  groupId: String,
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } // 7 gün sonra
});
inviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const Invite = mongoose.model('Invite', inviteSchema);



module.exports = {
  Invite
};
