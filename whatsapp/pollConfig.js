// whatsapp/pollConfig.js

require('dotenv').config();

const DEFAULT_GROUP_ID = process.env.WHATSAPP_GROUP_ID;

const DEFAULT_POLL_OPTIONS = [
  '5 dakika', '10 dakika', '15 dakika', '20 dakika', '30 dakika',
  '45 dakika', '60 dakika', '75 dakika', '90 dakika', '120 dakika',
  '150 dakika', '180 dakika'
];

const MONTH_NAMES_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

/**
 * Günlük dinamik anket başlığını üretir (Örn: "1 Ağustos")
 */
function getDailyPollTitle(customTitle = null) {
  if (customTitle) return customTitle;
  const today = new Date();
  const day = today.getDate();
  const month = MONTH_NAMES_TR[today.getMonth()];
  return `${day} ${month}`;
}

module.exports = {
  DEFAULT_GROUP_ID,
  DEFAULT_POLL_OPTIONS,
  MONTH_NAMES_TR,
  getDailyPollTitle
};
