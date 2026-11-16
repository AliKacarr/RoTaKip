'use strict';

const mongoose = require('mongoose');

// Gruba katılma isteği modeli — 30 gün sonra TTL ile silinir
const JOIN_REQUEST_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const joinRequestSchema = new mongoose.Schema({
  groupId: String,
  userName: String,
  name: String,
  password: String,
  claimTokenHash: String,
  profileImage: String,
  status: { type: String, default: 'pending' }, // pending, accepted, rejected
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + JOIN_REQUEST_TTL_MS) }
});
joinRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const JoinRequest = mongoose.model('JoinRequest', joinRequestSchema, 'jointogroups');



module.exports = {
  JoinRequest
};

