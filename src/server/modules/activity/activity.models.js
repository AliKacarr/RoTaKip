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
  groupId: String,
  // tesbihat_görüntüleme ve tefekkur_bölüm_görüntüleme eylemlerinde: açılan sekme içi görünüm (data-view)
  view: String,
  // Tesbihat görünümünde seçili vakit (sabah, ogle…) ve tür (kisa, uzun, arapca-uzun)
  vakit: String,
  tur: String,
  // tefekkur_bölüm_görüntüleme eyleminde: açılan bölüm (ayet, esma…) ve okuma biçimi (metin, resim);
  // makaleler_kategori_görüntüleme eyleminde: açılan kategorinin slug'ı (kader, evrim…)
  section: String,
  mode: String
});

const SiteActivityLog = mongoose.model('SiteActivityLog', siteActivityLogSchema, 'siteactivitylogs');

/** TR (UTC+3) takvimine göre şu anki dakikanın [başlangıç, sonraki dakika) aralığı — aynı yıl/ay/gün/saat/dakika dedup için */


module.exports = {
  AccessLog,
  LoginLog,
  SiteActivityLog
};
