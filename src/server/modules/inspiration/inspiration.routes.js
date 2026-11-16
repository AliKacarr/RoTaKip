'use strict';

const fs = require('fs');
const path = require('path');

function registerInspirationRoutes(app, dependencies) {
  const {
    Ayet,
    Dua,
    Hadis,
    Hatirlatma,
    Vecize,
    publicPath
  } = dependencies;

  // Söz resimleri endpoint'i
  app.get('/api/quote-images', (req, res) => {
    const quotesDir = path.join(publicPath, 'quotes');
    fs.readdir(quotesDir, (err, files) => {
      if (err) {
        return res.status(500).json({ error: 'Unable to list images' });
      }
      // Filter for image files only (jpg, png, jpeg, gif, webp)
      const imageFiles = files.filter(file =>
        /\.(jpg|jpeg|png|gif|webp)$/i.test(file)
      );
      res.json({ images: imageFiles });
    });
  });

  // User avatars endpoint'i
  app.get('/api/user-avatars', (req, res) => {
    const userAvatarsDir = path.join(publicPath, 'userAvatars');
    fs.readdir(userAvatarsDir, (err, files) => {
      if (err) {
        return res.status(500).json({ error: 'Unable to list user avatars' });
      }
      // Filter for image files only (jpg, png, jpeg, gif, webp)
      const avatarFiles = files.filter(file =>
        /\.(jpg|jpeg|png|gif|webp)$/i.test(file)
      );
      res.json(avatarFiles);
    });
  });

  // Rastgele söz endpoint'i
  app.get('/api/random-quote', async (req, res) => {
    try {
      // Count total documents in the sentences collection
      const count = await Vecize.countDocuments();

      // If there are no sentences, return a default message
      if (count === 0) {
        return res.json({ sentence: "İlmin tâlibi (talebesi), Rahman'ın tâlibidir. İlmin talipçisi, İslâm'ın rüknüdür. Onun ser-ü mükâfatı, Peygamberlerle beraber verilir. (Hadis-i Şerif)" });
      }

      // Generate a random index
      const random = Math.floor(Math.random() * count);

      // Skip to the random document and get it
      const randomVecize = await Vecize.findOne().skip(random).lean();

      res.json({ sentence: randomVecize.sentence });
    } catch (error) {
      console.error('Error fetching random quote:', error);
      res.status(500).json({ error: 'Server error', message: error.message });
    }
  });

  // Rastgele ayet endpoint'i
  app.get('/api/random-ayet', async (req, res) => {
    try {
      // Ayetler koleksiyonundaki toplam belge sayısını say
      const count = await Ayet.countDocuments();

      // Eğer hiç ayet yoksa, varsayılan bir mesaj döndür
      if (count === 0) {
        return res.json({ sentence: "Andolsun ki, Resûlullah, sizin için, Allah'a ve Ahiret gününe kavuşmayı umanlar ve Allah'ı çok zikredenler için güzel bir örnektir. (Ahzâb sûresi, 33/21)" });
      }

      // Rastgele bir indeks oluştur
      const random = Math.floor(Math.random() * count);

      // Rastgele belgeye atla ve al
      const randomAyet = await Ayet.findOne().skip(random).lean();

      res.json({ sentence: randomAyet.sentence });
    } catch (error) {
      console.error('Rastgele ayet alınırken hata oluştu:', error);
      res.status(500).json({ error: 'Sunucu hatası', message: error.message });
    }
  });

  // Rastgele hadis endpoint'i
  app.get('/api/random-hadis', async (req, res) => {
    try {
      // Hadisler koleksiyonundaki toplam belge sayısını say
      const count = await Hadis.countDocuments();

      // Eğer hiç hadis yoksa, varsayılan bir mesaj döndür
      if (count === 0) {
        return res.json({ sentence: "İlmin tâlibi (talebesi), Rahman'ın tâlibidir. İlmin talipçisi, İslâm'ın rüknüdür. Onun ser-ü mükâfatı, Peygamberlerle beraber verilir. (Hadis-i Şerif)" });
      }

      // Rastgele bir indeks oluştur
      const random = Math.floor(Math.random() * count);

      // Rastgele belgeye atla ve al
      const randomHadis = await Hadis.findOne().skip(random).lean();

      res.json({ sentence: randomHadis.sentence });
    } catch (error) {
      console.error('Rastgele hadis alınırken hata oluştu:', error);
      res.status(500).json({ error: 'Sunucu hatası', message: error.message });
    }
  });

  // Rastgele dua endpoint'i
  app.get('/api/random-dua', async (req, res) => {
    try {
      // Dualar koleksiyonundaki toplam belge sayısını say
      const count = await Dua.countDocuments();

      // Eğer hiç dua yoksa, varsayılan bir mesaj döndür
      if (count === 0) {
        return res.json({ sentence: "Allah'ım! Senden Seni sevmeyi Seni sevenleri sevmeyi ve Senin sevgine ulaştıran ameli yapmayı isterim. Allah'ım! Senin sevgini, bana canımdan, ailemden ve soğuk sudan daha sevgili kıl. (Tirmizî, Deavât,73)" });
      }

      // Rastgele bir indeks oluştur
      const random = Math.floor(Math.random() * count);

      // Rastgele belgeye atla ve al
      const randomDua = await Dua.findOne().skip(random).lean();

      res.json({ sentence: randomDua.sentence });
    } catch (error) {
      console.error('Rastgele dua alınırken hata oluştu:', error);
      res.status(500).json({ error: 'Sunucu hatası', message: error.message });
    }
  });

  // Rastgele hatırlatma endpoint'i
  app.get('/api/random-reminder', async (req, res) => {
    try {
      // Hatırlatmalar koleksiyonundaki toplam belge sayısını say
      const count = await Hatirlatma.countDocuments();

      // Eğer hiç hatırlatma yoksa, varsayılan bir mesaj döndür
      if (count === 0) {
        return res.json({ sentence: "Her gün küçük adımlarla büyük hedeflere ulaşabilirsin. Bugün de bir adım at!" });
      }

      // Rastgele bir indeks oluştur
      const random = Math.floor(Math.random() * count);

      // Rastgele belgeye atla ve al
      const randomHatirlatma = await Hatirlatma.findOne().skip(random).lean();

      res.json({ sentence: randomHatirlatma.sentence });
    } catch (error) {
      console.error('Rastgele hatırlatma alınırken hata oluştu:', error);
      res.status(500).json({ error: 'Sunucu hatası', message: error.message });
    }
  });


}

module.exports = {
  registerInspirationRoutes
};

