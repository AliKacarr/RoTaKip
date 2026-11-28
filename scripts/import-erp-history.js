'use strict';

// ERP (Google Form → Sheets) geçmişini 5 ERP grubunun çetelesine tek seferlik aktarır.
//
//   node scripts/import-erp-history.js --dry-run              # yalnız rapor verir, hiçbir şey yazmaz
//   node scripts/import-erp-history.js                        # alışkanlık tanımlarını kurar + geçmişi aktarır
//   node scripts/import-erp-history.js --groups=sko-ekip-a    # yalnız belirtilen grup(lar), virgülle
//   node scripts/import-erp-history.js --skip-config          # grupların alışkanlık tanımlarına dokunmaz
//   node scripts/import-erp-history.js --verbose              # eşleşmeyen isimleri de listeler
//
// Gerekli ortam değişkenleri: MONGO_URI, DB_NAME, ERP_SHEETS_API_KEY, ERP_SHEETS_SPREADSHEET_ID (.env).
//
// 1. Alışkanlık tanımı olmayan ERP grubuna ERP alışkanlıklarını yazar (ilk alan "Risale-i Nur",
//    dakika; amountType → dakika). Tanımı olan gruba dokunmaz, yalnız raporlar.
// 2. Tablodaki tüm günleri okur; her kişi + gün için son form satırı geçerlidir.
// 3. Çetele (cetele_<groupId>) ERP alışkanlıklarını tablodakiyle eşitler; okuma kayıtlarında
//    (readingstatuses_<groupId>) yalnız eksik günleri ekler, var olanları ezmez.
// Son yazan kazanır: formun gönderim anından sonra siteden güncellenen gün atlanır (ezilmez).
// Betik tekrar çalıştırılabilir: ikinci çalıştırmada değişen kayıt sayısı 0 olmalıdır.

require('dotenv').config();

const mongoose = require('mongoose');
const { connectDatabase, closeDatabase } = require('../src/server/config/database');
const { UserGroup } = require('../src/server/modules/groups/group.models');
const { isSafeGroupId } = require('../src/server/shared/group-id');
const { validateCeteleFields } = require('../src/server/modules/cetele/cetele.service');
const {
  ERP_SKO_GROUPS,
  buildErpCeteleFields,
  erpCeteleKeysFor,
  syncErpReadings
} = require('../src/server/integrations/erp/erp-readings-sync');

const LOCK_WAIT_MS = 5 * 60 * 1000;

function parseArgs(argv) {
  const groupsArg = argv.find(arg => arg.startsWith('--groups='));
  const groupIds = groupsArg
    ? groupsArg.slice('--groups='.length).split(',').map(id => id.trim()).filter(Boolean)
    : ERP_SKO_GROUPS;
  return {
    dryRun: argv.includes('--dry-run'),
    skipConfig: argv.includes('--skip-config'),
    verbose: argv.includes('--verbose'),
    groupIds
  };
}

function sameFieldKeys(fields, expected) {
  if (!Array.isArray(fields)) return false;
  const active = fields.filter(field => !field.archived).map(field => field.key);
  return JSON.stringify(active) === JSON.stringify(expected.map(field => field.key));
}

// Grupların alışkanlık tanımlarını kurar. Dönüş: dry-run için grup → ERP anahtarları.
async function ensureGroupConfigs(groupIds, { dryRun, skipConfig }) {
  const { fields: erpFields, error } = validateCeteleFields(buildErpCeteleFields(), []);
  if (error) throw new Error(`ERP alışkanlık tanımları geçersiz: ${error}`);
  const keysByGroup = {};

  for (const groupId of groupIds) {
    const group = await UserGroup.findOne({ groupId }, { ceteleFields: 1, amountType: 1 }).lean();
    if (!group) throw new Error(`Grup bulunamadı: ${groupId}`);

    const hasFields = Array.isArray(group.ceteleFields) && group.ceteleFields.length > 0;
    if (hasFields) {
      const status = sameFieldKeys(group.ceteleFields, erpFields) ? 'hazır' : 'FARKLI tanım var, dokunulmadı';
      console.log(`${groupId}: alışkanlık tanımı ${status} (amountType: ${group.amountType})`);
      keysByGroup[groupId] = erpCeteleKeysFor(group.ceteleFields);
      continue;
    }
    if (skipConfig) {
      console.log(`${groupId}: alışkanlık tanımı yok, --skip-config → çeteleye yazılmayacak`);
      keysByGroup[groupId] = [];
      continue;
    }

    keysByGroup[groupId] = erpCeteleKeysFor(erpFields);
    if (dryRun) {
      console.log(`${groupId}: ${erpFields.length} ERP alışkanlığı kurulacak, amountType → dakika`);
      continue;
    }
    await UserGroup.updateOne(
      { groupId },
      { $set: { ceteleFields: erpFields, amountType: erpFields[0].unit } }
    );
    console.log(`${groupId}: ${erpFields.length} ERP alışkanlığı kuruldu, amountType → ${erpFields[0].unit}`);
  }
  return keysByGroup;
}

function printSummary(result, { dryRun, verbose }) {
  console.log(`\nTablo: ${result.sheetRows} satır, ${result.uniqueUserDate} kişi+gün `
    + `(${result.invalidRisale} satırda geçersiz/boş risale).`);
  for (const group of result.groups) {
    if (group.skipped) {
      console.log(`${group.groupId}: atlandı (${group.skipped})`);
      continue;
    }
    const cetele = dryRun
      ? `${group.ceteleOps} gün yazılacak`
      : `${group.ceteleUpserted} yeni, ${group.ceteleModified} güncellenen, ${group.ceteleDeleted} silinen`;
    const readings = dryRun
      ? `${group.docs} eksik gün eklenecek`
      : `${group.upserted} eksik gün eklendi`;
    console.log(`${group.groupId}: ${group.matchedUsers}/${group.users} üye eşleşti · `
      + `çetele [${group.ceteleKeys.join(', ') || 'alan yok'}]: ${cetele} · okuma: ${readings}`
      + ` · siteden yeni olduğu için atlanan gün: ${group.skippedSiteNewer}`
      + ` · zaman damgası düzeltilen: ${group.normalized}`);
  }
  console.log(`Eşleşmeyen isim (gruplarda olmayan eski üyeler): ${result.unmatchedNameCount}`);
  if (verbose && result.unmatchedNames) {
    result.unmatchedNames
      .sort((a, b) => b.days - a.days)
      .forEach(({ name, days }) => console.log(`  - ${name} (${days} gün)`));
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const unsafe = options.groupIds.filter(id => !isSafeGroupId(id) || !ERP_SKO_GROUPS.includes(id));
  if (unsafe.length) {
    console.error(`ERP grubu olmayan kimlik: ${unsafe.join(', ')}`);
    return 1;
  }

  await connectDatabase();
  const keysByGroup = await ensureGroupConfigs(options.groupIds, options);

  const result = await syncErpReadings({
    db: mongoose.connection.db,
    groupIds: options.groupIds,
    dryRun: options.dryRun,
    allDates: true,
    readingsMode: 'insert-missing',
    ceteleKeysByGroup: options.dryRun ? keysByGroup : undefined,
    includeUnmatchedNames: options.verbose,
    lockWaitMs: LOCK_WAIT_MS
  });
  if (result.skipped) {
    console.error(`ERP senkron kilidi ${LOCK_WAIT_MS / 60000} dakikada alınamadı; daha sonra tekrar deneyin.`);
    return 1;
  }

  printSummary(result, options);
  if (options.dryRun) console.log('\nDeneme çalıştırması: veritabanına yazılmadı.');
  return 0;
}

if (require.main === module) {
  main()
    .then(async code => {
      await closeDatabase();
      process.exit(code);
    })
    .catch(async error => {
      console.error('ERP geçmiş aktarımı başarısız:', error);
      await closeDatabase().catch(() => {});
      process.exit(1);
    });
}

module.exports = { parseArgs, sameFieldKeys };
