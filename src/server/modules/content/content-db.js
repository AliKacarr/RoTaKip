'use strict';

const mongoose = require('mongoose');

// İçerik koleksiyonları (makaleler, videolar) şemasız okunur; bağlantı henüz hazır değilse
// kısa bir süre beklenir, ardından "DB not ready" hatası rotalarda 503'e çevrilir.
function waitForDatabase(timeoutMs = 3000) {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timeoutId = null;
    const cleanup = () => {
      clearTimeout(timeoutId);
      mongoose.connection.off('connected', onConnected);
      mongoose.connection.off('error', onError);
    };
    const onConnected = () => {
      cleanup();
      resolve();
    };
    const onError = error => {
      cleanup();
      reject(error);
    };
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('DB not ready in time'));
    }, timeoutMs);

    mongoose.connection.once('connected', onConnected);
    mongoose.connection.once('error', onError);
  });
}

async function getContentCollection(name) {
  if (!mongoose.connection.db || mongoose.connection.readyState !== 1) {
    await waitForDatabase();
  }
  const db = mongoose.connection.db;
  if (!db) throw new Error('Veritabanı bağlantısı kurulamadı');
  return db.collection(name);
}

function isDatabaseNotReadyError(error) {
  return /DB not ready/i.test(error?.message || '');
}

module.exports = {
  getContentCollection,
  isDatabaseNotReadyError,
  waitForDatabase
};
