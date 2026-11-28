'use strict';

// Mevcut tüm gruplar için okuma ve çetele koleksiyonlarının {userId, date} tekil index'ini kurar.
// Yeni gruplar bu index'leri oluşturulurken zaten alır; bu betik yalnız eski grupları tamamlar.
//
//   node scripts/ensure-group-indexes.js            # eksik index'leri kurar
//   node scripts/ensure-group-indexes.js --dry-run  # yalnız rapor verir, hiçbir şey yazmaz
//
// Gerekli ortam değişkenleri: MONGO_URI, DB_NAME (.env). Betik tekrar çalıştırılabilir.
// Bir grupta aynı üye ve gün için birden fazla kayıt varsa index kurulamaz; o grup raporlanır,
// kayıtlar silinmez, diğer gruplar etkilenmez.

require('dotenv').config();

const mongoose = require('mongoose');
const { connectDatabase, closeDatabase } = require('../src/server/config/database');
const { UserGroup } = require('../src/server/modules/groups/group.models');
const { isSafeGroupId } = require('../src/server/shared/group-id');

const INDEX_NAME = 'uniq_user_date';
const INDEX_KEY = { userId: 1, date: 1 };
const COLLECTION_PREFIXES = ['readingstatuses_', 'cetele_'];

async function collectionExists(db, name) {
  return (await db.listCollections({ name }, { nameOnly: true }).toArray()).length > 0;
}

async function hasUniqueIndex(collection) {
  const indexes = await collection.indexes().catch(() => []);
  return indexes.some(index => index.unique && JSON.stringify(index.key) === JSON.stringify(INDEX_KEY));
}

async function countDuplicates(collection) {
  const rows = await collection.aggregate([
    { $group: { _id: { userId: '$userId', date: '$date' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1000 }
  ]).toArray();
  return rows.length;
}

async function ensureCollectionIndex(db, name, dryRun) {
  // Boş koleksiyonlar da index alır; yoksa çetele ilk yazıldığında oluşturulur ama index'siz kalır.
  const exists = await collectionExists(db, name);
  const collection = db.collection(name);
  if (exists && await hasUniqueIndex(collection)) return 'var';
  if (dryRun) {
    const duplicates = exists ? await countDuplicates(collection) : 0;
    return duplicates ? `eksik (${duplicates} yinelenen kayıt grubu var)` : 'eksik';
  }
  try {
    await collection.createIndex(INDEX_KEY, { unique: true, name: INDEX_NAME });
    return 'kuruldu';
  } catch (error) {
    if (error?.code === 11000 || /duplicate key/i.test(error?.message || '')) {
      const duplicates = await countDuplicates(collection);
      return `HATA: ${duplicates} yinelenen kayıt grubu var, index kurulamadı`;
    }
    return `HATA: ${error.message}`;
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  await connectDatabase();
  const db = mongoose.connection.db;
  const groups = await UserGroup.find({}, { groupId: 1 }).lean();
  const summary = { var: 0, kuruldu: 0, eksik: 0, hata: 0 };

  for (const { groupId } of groups) {
    if (!isSafeGroupId(groupId)) {
      console.warn(`Atlandı (güvensiz grup kimliği): ${groupId}`);
      continue;
    }
    for (const prefix of COLLECTION_PREFIXES) {
      const name = `${prefix}${groupId}`;
      const result = await ensureCollectionIndex(db, name, dryRun);
      if (result === 'var') summary.var += 1;
      else if (result === 'kuruldu') summary.kuruldu += 1;
      else if (result.startsWith('HATA')) summary.hata += 1;
      else summary.eksik += 1;
      if (result !== 'var') console.log(`${name}: ${result}`);
    }
  }

  console.log(`\n${groups.length} grup tarandı${dryRun ? ' (deneme çalıştırması)' : ''}: `
    + `${summary.var} zaten hazır, ${summary.kuruldu} kuruldu, ${summary.eksik} eksik, ${summary.hata} hata.`);
  return summary.hata > 0 ? 1 : 0;
}

main()
  .then(async code => {
    await closeDatabase();
    process.exit(code);
  })
  .catch(async error => {
    console.error('Index betiği başarısız:', error);
    await closeDatabase().catch(() => {});
    process.exit(1);
  });
