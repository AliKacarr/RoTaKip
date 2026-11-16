'use strict';

const mongoose = require('mongoose');

const AccessLog = mongoose.model('AccessLog', {
  action: String,
  timestamp: Date,
  deviceInfo: Object,
  ipAddress: String,
  groupId: String
});

const loginLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  ipAddress: String,
  deviceInfo: Object,
  groupId: String
});

const LoginLog = mongoose.model('LoginLog', loginLogSchema);

const siteActivityLogSchema = new mongoose.Schema({
  action: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  deviceInfo: Object,
  ipAddress: String,
  groupId: String
});

const SiteActivityLog = mongoose.model('SiteActivityLog', siteActivityLogSchema, 'siteactivitylogs');

/** TR (UTC+3) takvimine göre şu anki dakikanın [başlangıç, sonraki dakika) aralığı — aynı yıl/ay/gün/saat/dakika dedup için */


module.exports = {
  AccessLog,
  LoginLog,
  SiteActivityLog
};

