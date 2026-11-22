'use strict';
// `tesbihatlar` koleksiyonundaki belgeleri okunabilir düz metin olarak dosyaya yazar;
// içerik kontrolü/gözden geçirme amaçlıdır, uygulama tarafından kullanılmaz.
//
// Kullanım: node scripts/dump-tesbihat.js
// Çıktı: scripts/data/tesbihat-icerik-kontrol.txt

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const OUT_PATH = path.join(__dirname, 'data', 'tesbihat-icerik-kontrol.txt');
const VAKIT_SIRASI = ['sabah', 'ogle', 'ikindi', 'aksam', 'yatsi'];
const TUR_SIRASI = ['arapca-uzun', 'uzun', 'kisa'];
const BOLUM_ETIKETI = {
  ana: 'ANA TESBİHAT',
  'ozel-dua': 'ÖZEL DUA / SALAVAT',
  esma: 'ESMA-İ HÜSNA DUASI',
  'kapanis-suresi': 'BİTİRİŞ SÛRESİ'
};

function belgeyiYaz(satirlar, belge) {
  satirlar.push('='.repeat(90));
  satirlar.push(`${belge.baslik}  [vakit=${belge.vakit} tur=${belge.tur}]`);
  satirlar.push('='.repeat(90));

  let oncekiBolum = null;
  for (const adim of belge.adimlar) {
    if (adim.bolum !== oncekiBolum) {
      satirlar.push('');
      satirlar.push(`--- ${BOLUM_ETIKETI[adim.bolum] || adim.bolum} ---`);
      oncekiBolum = adim.bolum;
    }
    const etiket = adim.tur === 'arapca' ? '[AR]' : '[TR]';
    satirlar.push(`${etiket} ${adim.metin}`);
  }
  satirlar.push('');
  satirlar.push('');
}

async function main() {
  const client = new MongoClient(process.env.MONGO_URI);
  const satirlar = [];
  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME);
    const belgeler = await db.collection('tesbihatlar').find({}).toArray();

    belgeler.sort((a, b) => {
      const va = VAKIT_SIRASI.indexOf(a.vakit) - VAKIT_SIRASI.indexOf(b.vakit);
      if (va !== 0) return va;
      return TUR_SIRASI.indexOf(a.tur) - TUR_SIRASI.indexOf(b.tur);
    });

    for (const belge of belgeler) belgeyiYaz(satirlar, belge);

    fs.writeFileSync(OUT_PATH, satirlar.join('\n'), 'utf8');
    console.log(`${belgeler.length} belge yazıldı: ${OUT_PATH}`);
  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error('Beklenmeyen hata:', err);
  process.exitCode = 1;
});
