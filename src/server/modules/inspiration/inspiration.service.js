'use strict';

const {
  Ayet,
  Dua,
  Hadis,
  Hatirlatma,
  Vecize
} = require('./inspiration.models');

// Günün vecizesi bildirim cron'u (09:00 ve 21:00) - Europe/Istanbul TZ ile
async function getRandomVecizeForPush() {
  try {
    // Tüm koleksiyonlar: vecizeler, ayetler, hadisler, dualar, hatırlatmalar
    const sources = [
      { model: Vecize, name: 'vecizeler', type: 'vecize' },
      { model: Ayet, name: 'ayetler', type: 'ayet' },
      { model: Hadis, name: 'hadisler', type: 'hadis' },
      { model: Dua, name: 'dualar', type: 'dua' },
      { model: Hatirlatma, name: 'hatırlatmalar', type: 'hatırlatma' }
    ];

    // Her koleksiyonun belge sayısını al
    const counts = await Promise.all(sources.map(s => s.model.countDocuments()));

    // Boş olmayan koleksiyonları filtrele
    const availableSources = sources.filter((source, index) => counts[index] > 0);
    if (availableSources.length === 0) return { message: 'Bugün için vecize bulunamadı.', source: 'vecize' };

    // Eşit ihtimalle koleksiyon seç
    const randomSourceIndex = Math.floor(Math.random() * availableSources.length);
    const selectedSource = availableSources[randomSourceIndex];

    // Seçilen koleksiyondan rastgele belge al
    const randomIndex = Math.floor(Math.random() * counts[sources.indexOf(selectedSource)]);
    const doc = await selectedSource.model.findOne().skip(randomIndex).lean();

    return {
      message: doc?.sentence || 'Bugün için vecize bulunamadı.',
      source: selectedSource.type
    };
  } catch (e) {
    console.error('Vecize seçme hatası:', e);
    return { message: 'Bugün için vecize bulunamadı.', source: 'vecize' };
  }
}



module.exports = {
  getRandomVecizeForPush
};
