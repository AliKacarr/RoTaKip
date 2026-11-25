'use strict';

// Tefekkür > İlahiler listesini YouTube bağlantılarından hazırlar.
//
//   node scripts/import-ilahiler.js            # bağlantıları okur, YouTube'dan bilgi çeker, MongoDB'ye yazar
//   node scripts/import-ilahiler.js --dry-run  # yalnız rapor verir, veritabanına yazmaz
//   node scripts/import-ilahiler.js dosya.txt  # varsayılan yerine başka bir bağlantı dosyası
//
// Gerekli ortam değişkenleri: YOUTUBE_API_KEY, MONGO_URI, DB_NAME (.env).
// Bağlantı dosyasında satır başına bir bağlantı (ya da 11 karakterlik video kimliği) bulunur;
// "#" ile başlayan satırlar ve boş satırlar yok sayılır. Betik tekrar çalıştırılabilir (upsert).

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const {
  extractYoutubeVideoId,
  parseIsoDurationSeconds
} = require('../src/server/shared/youtube-links');

const COLLECTION = 'ilahiler';
const DEFAULT_LINKS_FILE = path.join(__dirname, 'data', 'ilahi-linkleri.txt');
const API_URL = 'https://www.googleapis.com/youtube/v3/videos';
const BATCH_SIZE = 50;
const PLAYABLE_PRIVACY = new Set(['public', 'unlisted']);

function readVideoIds(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const ids = [];
  const invalid = [];
  const seen = new Set();
  for (const line of lines) {
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    const videoId = extractYoutubeVideoId(text, { allowBareId: true });
    if (!videoId) {
      invalid.push(text);
    } else if (!seen.has(videoId)) {
      seen.add(videoId);
      ids.push(videoId);
    }
  }
  return { ids, invalid };
}

function chunk(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

// API öğesini koleksiyon belgesine çevirir. Gömmeye kapalı, özel ya da süresiz (canlı yayın) videolar aktif sayılmaz.
function buildIlahiDocument(item) {
  const sureSaniye = parseIsoDurationSeconds(item?.contentDetails?.duration);
  const gomulebilir = item?.status?.embeddable === true;
  const herkeseAcik = PLAYABLE_PRIVACY.has(item?.status?.privacyStatus);
  return {
    videoId: item.id,
    baslik: String(item?.snippet?.title || '').trim(),
    kanalAdi: String(item?.snippet?.channelTitle || '').trim(),
    sureSaniye,
    gomulebilir,
    aktif: Boolean(item.id) && gomulebilir && herkeseAcik && sureSaniye > 0
  };
}

async function fetchVideoDetails(videoIds, apiKey) {
  const url = new URL(API_URL);
  url.searchParams.set('part', 'snippet,contentDetails,status');
  url.searchParams.set('id', videoIds.join(','));
  url.searchParams.set('maxResults', String(BATCH_SIZE));
  const response = await fetch(url, { headers: { 'x-goog-api-key': apiKey } });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`YouTube API ${response.status}: ${body.slice(0, 300)}`);
  }
  const data = await response.json();
  return Array.isArray(data.items) ? data.items : [];
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const fileArg = process.argv.slice(2).find(arg => !arg.startsWith('--'));
  const linksFile = fileArg ? path.resolve(fileArg) : DEFAULT_LINKS_FILE;

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('YOUTUBE_API_KEY tanımlı değil (.env).');
  if (!fs.existsSync(linksFile)) throw new Error(`Bağlantı dosyası bulunamadı: ${linksFile}`);

  const { ids, invalid } = readVideoIds(linksFile);
  console.log(`Okunan benzersiz video: ${ids.length}`);
  invalid.forEach(text => console.warn(`  Geçersiz satır atlandı: ${text}`));
  if (ids.length === 0) return;

  const documents = [];
  const missing = [];
  for (const batch of chunk(ids, BATCH_SIZE)) {
    const items = await fetchVideoDetails(batch, apiKey);
    const found = new Set(items.map(item => item.id));
    items.forEach(item => documents.push(buildIlahiDocument(item)));
    batch.filter(id => !found.has(id)).forEach(id => missing.push(id));
  }

  const active = documents.filter(document => document.aktif);
  const inactive = documents.filter(document => !document.aktif);
  console.log(`Aktif: ${active.length}, pasif: ${inactive.length}, YouTube'da bulunamayan: ${missing.length}`);
  inactive.forEach(document => {
    const reason = !document.gomulebilir ? 'gömmeye kapalı' : document.sureSaniye <= 0 ? 'süresiz/canlı' : 'herkese açık değil';
    console.warn(`  Pasif (${reason}): ${document.videoId} ${document.baslik}`);
  });
  missing.forEach(id => console.warn(`  Bulunamadı (silinmiş/özel): ${id}`));

  if (dryRun) {
    console.log('Dry run: veritabanına yazılmadı.');
    return;
  }

  const client = new MongoClient(process.env.MONGO_URI);
  try {
    await client.connect();
    const collection = client.db(process.env.DB_NAME).collection(COLLECTION);
    await collection.createIndex({ videoId: 1 }, { unique: true, name: 'ilahiler_video_id' });

    const now = new Date();
    const operations = documents.map(document => ({
      updateOne: {
        filter: { videoId: document.videoId },
        update: {
          $set: { ...document, guncellenmeTarihi: now },
          $setOnInsert: { eklenmeTarihi: now }
        },
        upsert: true
      }
    }));
    // YouTube'da artık bulunmayan ilahiler listeden çıkar (varsa); yeni kayıt açılmaz.
    missing.forEach(videoId => operations.push({
      updateOne: {
        filter: { videoId },
        update: { $set: { aktif: false, guncellenmeTarihi: now } }
      }
    }));

    const result = await collection.bulkWrite(operations);
    console.log(`Eklenen: ${result.upsertedCount}, güncellenen: ${result.modifiedCount}`);
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Beklenmeyen hata:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { buildIlahiDocument, chunk, readVideoIds };
