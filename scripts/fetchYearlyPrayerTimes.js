// Diyanet namaz vakitleri sitesinden Türkiye'deki tüm il/ilçelerin (810 lokasyon), bu yıl için belirlediğiniz tarih aralığındaki namaz vakitlerini çekip MongoDB'ye yazar.
// Kullanım: node fetchYearlyPrayerTimes.js
// Gereken paketler: npm install mongodb cheerio dotenv
// Gereken ortam değişkenleri (.env dosyasında): MONGO_URI ve DB_NAME
// Yazılan koleksiyonlar:
//   prayer_locations -> { locationId, il, ilce } (combobox için, bir kayıt/lokasyon)
//   prayer_times     -> { locationId, tarih, imsak, gunes, ogle, ikindi, aksam, yatsi }

require("dotenv").config();

const cheerio = require("cheerio");
const { MongoClient } = require("mongodb");

const TIMES_COLLECTION = "prayer_times";
const LOCATIONS_COLLECTION = "prayer_locations";

// Bu yıl için kontrol edilecek tarih aralığı
const START_MONTH_DAY = "01-01"; //Bugünden sonraki tarihleri çekmek isterseniz "MM-DD" formatında değiştirin, örn: "06-01"
const END_MONTH_DAY = "12-31";

// Türkiye'yi kapsayan locationId aralığı (doğrulandı: 9146 Adana ile başlar,
// 9955 Zonguldak ile biter; 9145 ve 9956 sınır dışına -başka ülkeye- çıkar).
const TR_LOCATION_ID_START = 9146;
const TR_LOCATION_ID_END = 9955;

// Diyanet sunucusunu yormamak için istekler arasında bekleme ve
// başarısız denemelerde kademeli geri çekilme (backoff) uygulanır.
const DELAY_MS = 500;
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [1000, 3000, 7000];

const MONTHS = {
  Ocak: 1, Şubat: 2, Mart: 3,
  Nisan: 4, Mayıs: 5, Haziran: 6,
  Temmuz: 7, Ağustos: 8, Eylül: 9,
  Ekim: 10, Kasım: 11, Aralık: 12
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function toTitleCase(text) {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/(^|\s)\S/g, c => c.toLocaleUpperCase("tr-TR"));
}

function dateRangeForYear(year) {
  return {
    start: `${year}-${START_MONTH_DAY}`,
    end: `${year}-${END_MONTH_DAY}`
  };
}

function expectedDayCount(year) {
  const { start, end } = dateRangeForYear(year);
  return Math.round(
    (new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000
  ) + 1;
}

function filterDateRange(data) {
  const year = data[0].tarih.slice(0, 4);
  const { start, end } = dateRangeForYear(year);
  return data.filter(d => d.tarih >= start && d.tarih <= end);
}

async function fetchLocationPage(locationId) {
  const response = await fetch(
    `https://namazvakitleri.diyanet.gov.tr/tr-TR/${locationId}/`,
    {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html",
        "Accept-Language": "tr-TR,tr;q=0.9"
      }
    }
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} (locationId=${locationId})`);
  }

  return cheerio.load(await response.text());
}

function extractIlIlce($) {
  const crumbs = $("nav[aria-label='breadcrumb'] li")
    .map((_, li) => $(li).text().trim())
    .get();

  // ["Anasayfa", "TÜRKİYE", "<İL>", "<İlçe>", "Namaz Vakitleri"]
  const il = crumbs[2] ? toTitleCase(crumbs[2]) : null;
  const ilce = crumbs[3] ? crumbs[3].trim() : null;

  if (!il || !ilce) {
    throw new Error("İl/ilçe bilgisi breadcrumb'tan okunamadı.");
  }

  return { il, ilce };
}

function extractYearlyTable($, locationId, il, ilce) {
  const tables = $("table").toArray();

  const table = tables.find(el => {
    const rows = $(el).find("tr");
    const header = $(el).find("tr").first().text();
    return (
      rows.length >= 300 &&
      header.includes("İmsak") &&
      header.includes("Yatsı")
    );
  });

  if (!table) {
    throw new Error(`Yıllık tablo bulunamadı (locationId=${locationId}).`);
  }

  const data = [];

  $(table).find("tr").each((_, row) => {
    const cells = $(row).find("td")
      .map((_, td) => $(td).text().trim())
      .get();

    if (cells.length < 8) return;

    const match = cells[0].match(/(\d{1,2})\s+(\S+)\s+(\d{4})/);
    if (!match || !MONTHS[match[2]]) return;

    const [, day, month, year] = match;

    data.push({
      locationId,
      il,
      ilce,
      tarih: `${year}-${String(MONTHS[month]).padStart(2, "0")}-${day.padStart(2, "0")}`,
      imsak: cells[2],
      gunes: cells[3],
      ogle: cells[4],
      ikindi: cells[5],
      aksam: cells[6],
      yatsi: cells[7]
    });
  });

  if (data.length < 300) {
    throw new Error(`Eksik veri: ${data.length} gün (locationId=${locationId}).`);
  }

  return data;
}

async function fetchYearlyPrayerTimesForLocation(locationId) {
  const $ = await fetchLocationPage(locationId);
  const { il, ilce } = extractIlIlce($);
  const yearly = extractYearlyTable($, locationId, il, ilce);
  return filterDateRange(yearly);
}

async function fetchWithRetry(locationId) {
  let lastErr;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await fetchYearlyPrayerTimesForLocation(locationId);
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(RETRY_BACKOFF_MS[attempt]);
      }
    }
  }
  throw lastErr;
}

async function upsertLocation(locationsCollection, { locationId, il, ilce }) {
  return locationsCollection.updateOne(
    { locationId },
    { $set: { locationId, il, ilce } },
    { upsert: true }
  );
}

async function upsertTimes(timesCollection, records) {
  if (records.length === 0) return { upsertedCount: 0, modifiedCount: 0 };

  const operations = records.map(({ il: _il, ilce: _ilce, ...time }) => ({
    updateOne: {
      filter: { locationId: time.locationId, tarih: time.tarih },
      update: { $set: time },
      upsert: true
    }
  }));

  return timesCollection.bulkWrite(operations);
}

async function getCompletedLocationIds(timesCollection, minDayCount) {
  const rows = await timesCollection.aggregate([
    { $group: { _id: "$locationId", count: { $sum: 1 } } },
    { $match: { count: { $gte: minDayCount } } }
  ]).toArray();

  return new Set(rows.map(r => r._id));
}

async function main() {
  const minDayCount = expectedDayCount(new Date().getFullYear());
  const failed = [];
  let processed = 0;
  let totalUpserted = 0;
  let totalModified = 0;

  const client = new MongoClient(process.env.MONGO_URI);

  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME);
    const timesCollection = db.collection(TIMES_COLLECTION);
    const locationsCollection = db.collection(LOCATIONS_COLLECTION);

    await timesCollection.createIndex({ locationId: 1, tarih: 1 }, { unique: true });
    await locationsCollection.createIndex({ locationId: 1 }, { unique: true });
    await locationsCollection.createIndex({ il: 1, ilce: 1 });

    const completed = await getCompletedLocationIds(timesCollection, minDayCount);
    console.log(`${completed.size} lokasyon zaten tamamlanmış, atlanacak.`);

    for (let id = TR_LOCATION_ID_START; id <= TR_LOCATION_ID_END; id++) {
      if (completed.has(id)) continue;

      try {
        const records = await fetchWithRetry(id);
        await upsertLocation(locationsCollection, {
          locationId: id,
          il: records[0].il,
          ilce: records[0].ilce
        });
        const result = await upsertTimes(timesCollection, records);
        totalUpserted += result.upsertedCount;
        totalModified += result.modifiedCount;
        processed++;
        console.log(
          `[${id}] ${records[0].il} / ${records[0].ilce} -> ${records.length} gün ` +
          `(eklenen: ${result.upsertedCount}, güncellenen: ${result.modifiedCount})`
        );
      } catch (err) {
        failed.push(id);
        console.error(`[${id}] HATA: ${err.message}`);
      }

      await sleep(DELAY_MS);
    }
  } finally {
    await client.close();
  }

  console.log("---");
  console.log(`İşlenen lokasyon: ${processed}`);
  console.log(`Toplam eklenen kayıt: ${totalUpserted}, güncellenen: ${totalModified}`);

  if (failed.length > 0) {
    console.log(`Başarısız lokasyonlar (${failed.length}): ${failed.join(", ")}`);
    console.log("Script'i tekrar çalıştırırsanız sadece eksik/başarısız lokasyonlar işlenir.");
  }
}

main().catch(err => {
  console.error("Beklenmeyen hata:", err);
  process.exitCode = 1;
});
