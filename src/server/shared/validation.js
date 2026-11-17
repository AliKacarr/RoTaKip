'use strict';

const moment = require('moment');
const { istanbulDateKey } = require('./date-time');

function getAuthGroupId(req) {
  return req.params.groupId || req.body?.groupId || req.query?.groupId;
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 6 && password.length <= 40;
}

function isValidText(value, maxLength, { allowEmpty = false } = {}) {
  if (typeof value !== 'string') return false;
  const length = value.trim().length;
  return (allowEmpty || length > 0) && length <= maxLength;
}

function isValidReadingDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return moment(value, 'YYYY-MM-DD', true).isValid()
    && value <= istanbulDateKey();
}

function isAllowedAvatarPath(value, folder) {
  if (!value) return true;
  if (typeof value !== 'string') return false;
  const escapedFolder = folder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^/${escapedFolder}/[a-zA-Z0-9._-]+\\.(?:jpe?g|png|webp|gif)$`, 'i').test(value);
}



module.exports = {
  getAuthGroupId,
  isAllowedAvatarPath,
  isValidPassword,
  isValidReadingDate,
  isValidText
};
