'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// İstemci dosyaları klasik betik olduğundan Node'da sahte bir `window` ile yüklenir.
function loadQueue() {
  const source = fs.readFileSync(
    path.join(__dirname, '../../../src/client/features/tefekkur/tefekkur-ilahi-queue.js'),
    'utf8'
  );
  const window = {};
  vm.runInNewContext(source, { window });
  return window.RoTaKipTefekkur.ilahiQueue;
}

const queue = loadQueue();

function makeIlahiler(count) {
  return Array.from({ length: count }, (_value, index) => ({
    videoId: `v${String(index).padStart(10, '0')}`,
    baslik: `İlahi ${index}`,
    kanalAdi: 'Kanal',
    sureSaniye: 200
  }));
}

// Deterministik sözde rastgele sayı üretici (testlerin kararlı kalması için).
function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

test('kuyruk tüm ilahileri bir kez içerir ve karıştırır', () => {
  const ilahiler = makeIlahiler(30);
  const result = queue.buildQueue(ilahiler, {}, seededRandom(1));
  assert.equal(result.length, 30);
  assert.equal(new Set(result.map(item => item.videoId)).size, 30);
  assert.notDeepEqual(result.map(item => item.videoId), ilahiler.map(item => item.videoId));
});

test('yalnız açıkça beğenilmeyen (👎) ilahi kuyruğa girmez', () => {
  const ilahiler = makeIlahiler(10);
  const items = { [ilahiler[3].videoId]: { disliked: true }, [ilahiler[4].videoId]: { short: 5 } };
  const result = queue.buildQueue(ilahiler, items, seededRandom(2));
  assert.equal(result.length, 9);
  assert.equal(result.some(item => item.videoId === ilahiler[3].videoId), false);
  // Kısa geçilen ilahi listede kalır.
  assert.equal(result.some(item => item.videoId === ilahiler[4].videoId), true);
});

test('kısa geçilenler listede kalır ama en alta, son çalınanların da altına iner', () => {
  const ilahiler = makeIlahiler(40);
  const items = {};
  const skipped = ilahiler.slice(0, 3).map(ilahi => ilahi.videoId);
  const recent = ilahiler.slice(3, 8).map(ilahi => ilahi.videoId);
  skipped.forEach(id => { items[id] = { short: 1, last: 5000 }; });
  recent.forEach((id, index) => { items[id] = { last: 1000 + index }; });
  for (let seed = 1; seed <= 5; seed += 1) {
    const result = queue.buildQueue(ilahiler, items, seededRandom(seed));
    assert.equal(result.length, 40);
    assert.deepEqual(new Set(result.slice(-3).map(item => item.videoId)), new Set(skipped));
    assert.deepEqual(new Set(result.slice(-8, -3).map(item => item.videoId)), new Set(recent));
  }
});

test('beğenilen ilahi kısa geçilmiş olsa da alta itilmez', () => {
  const ilahiler = makeIlahiler(20);
  const items = { [ilahiler[0].videoId]: { liked: true, short: 3 } };
  assert.equal(queue.isSkipped(items, ilahiler[0].videoId), false);
  const result = queue.buildQueue(ilahiler, items, seededRandom(7));
  assert.ok(result.findIndex(item => item.videoId === ilahiler[0].videoId) < 10);
});

test('beğenilenler her dört sıranın en çok birinde gelir, çoğunluk keşif kalır', () => {
  const ilahiler = makeIlahiler(100);
  const items = {};
  ilahiler.slice(0, 40).forEach(ilahi => { items[ilahi.videoId] = { liked: true }; });
  for (let seed = 1; seed <= 10; seed += 1) {
    const result = queue.buildQueue(ilahiler, items, seededRandom(seed));
    const top = result.slice(0, 20);
    const likedInTop = top.filter(item => items[item.videoId]?.liked).length;
    assert.ok(likedInTop >= 4 && likedInTop <= 6, `ilk 20'deki beğenilen sayısı ${likedInTop}`);
  }
});

test('beğenilen yoksa ya da keşif bittiyse kuyruk eksiksiz tamamlanır', () => {
  const ilahiler = makeIlahiler(5);
  const allLiked = {};
  ilahiler.forEach(ilahi => { allLiked[ilahi.videoId] = { liked: true }; });
  assert.equal(queue.buildQueue(ilahiler, allLiked, seededRandom(3)).length, 5);
  assert.equal(queue.buildQueue([], {}, seededRandom(3)).length, 0);
});

test('son çalınanlar listenin sonuna itilir', () => {
  const ilahiler = makeIlahiler(30);
  const items = {};
  ilahiler.slice(0, 5).forEach((ilahi, index) => { items[ilahi.videoId] = { last: 1000 + index }; });
  const result = queue.buildQueue(ilahiler, items, seededRandom(4));
  const recentIds = new Set(ilahiler.slice(0, 5).map(ilahi => ilahi.videoId));
  assert.deepEqual(new Set(result.slice(-5).map(item => item.videoId)), recentIds);
});

test('dinleme süresi "sevilmedi" sayacını günceller', () => {
  assert.equal(queue.afterPlayback({ short: 0 }, 5, false).short, 1);
  assert.equal(queue.afterPlayback({ short: 1 }, 14, false).short, 2);
  // 15-60 sn arası ne artırır ne sıfırlar.
  assert.equal(queue.afterPlayback({ short: 1 }, 30, false).short, 1);
  assert.equal(queue.afterPlayback({ short: 1 }, 60, false).short, 0);
  assert.equal(queue.afterPlayback({ short: 1 }, 3, true).short, 0);
  assert.equal(queue.afterPlayback(undefined, 3, false).short, 1);
  assert.equal(queue.isHidden({ a: { disliked: true } }, 'a'), true);
  assert.equal(queue.isHidden({ a: { short: 9 } }, 'a'), false);
  assert.equal(queue.isSkipped({ a: { short: 1 } }, 'a'), true);
  assert.equal(queue.isSkipped({ a: { short: 0 } }, 'a'), false);
  assert.equal(queue.isLiked({ a: { liked: true, disliked: true } }, 'a'), false);
});
