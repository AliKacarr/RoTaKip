'use strict';

const GROUP_ID_PATTERN = /^[a-zA-Z0-9_\-çğıöşüÇĞIİÖŞÜ]+$/;
const UNSAFE_GROUP_IDS = new Set(['__proto__', 'prototype', 'constructor']);

function isSafeGroupId(groupId) {
  const value = String(groupId || '');
  return GROUP_ID_PATTERN.test(value) && !UNSAFE_GROUP_IDS.has(value);
}

module.exports = {
  GROUP_ID_PATTERN,
  isSafeGroupId
};
