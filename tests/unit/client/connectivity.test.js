'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

const modulePath = pathToFileURL(path.join(__dirname, '../../../public/app/connectivity.js')).href;

function setOnline(value) {
  Object.defineProperty(global, 'navigator', { value: { onLine: value }, configurable: true });
}

test('bağlantı hataları ağ kaynaklı hatalardan ayırt edilir', async () => {
  const { describeConnectionError, isConnectionError } = await import(modulePath);
  setOnline(true);

  assert.equal(isConnectionError(new TypeError('Failed to fetch')), true);
  assert.equal(isConnectionError(Object.assign(new Error('x.min.js scripti yüklenemedi.'), { isNetworkError: true })), true);
  assert.equal(isConnectionError(new Error('HTTP 500')), false);
  assert.equal(describeConnectionError(new Error('HTTP 500')), null);
  assert.equal(describeConnectionError(new TypeError('Failed to fetch')).title, 'Sunucuya ulaşılamıyor');
});

test('cihaz çevrimdışıyken her hata internet yok olarak açıklanır', async () => {
  const { describeConnectionError } = await import(modulePath);
  setOnline(false);
  try {
    assert.equal(describeConnectionError(new Error('herhangi bir hata')).title, 'İnternet bağlantısı yok');
  } finally {
    setOnline(true);
  }
});
