'use strict';

const VALID_AMOUNT_TYPES = new Set(['sayfa', 'dakika']);

function normalizeAmountType(value) {
  return VALID_AMOUNT_TYPES.has(value) ? value : 'sayfa';
}

module.exports = {
  VALID_AMOUNT_TYPES,
  normalizeAmountType
};
