'use strict';

const { getGroupCollections } = require('../groups/group.models');
const {
  istanbulDateKey,
  istanbulYesterdayKey
} = require('../../shared/date-time');

// Giriş serisi hesaplama fonksiyonu
async function handleLoginStreak(user, groupId) {
  const today = istanbulDateKey();
  const yesterday = istanbulYesterdayKey();

  // Mevcut seri değerini al
  const currentStreak = user.loginStreak || 0;
  let streakIncreased = false;
  let newStreak = currentStreak;

  // En son girişi bugünse: hiçbir şey yapma (aynı gün içinde tekrar girmiştir)
  if (user.lastLoginDate === today) {
    // Aynı gün içinde tekrar giriş — değişiklik yok
    return { user, streakIncreased: false };
  }
  // Dün de girmişse: seriyi artır
  else if (user.lastLoginDate === yesterday) {
    newStreak = currentStreak + 1;
    streakIncreased = true;
  }
  // Arada gün(ler) varsa veya ilk giriş: sıfırla
  else {
    newStreak = 1;
    streakIncreased = false;
  }

  // Veritabanını güncelle (lean kullanıldığı için findByIdAndUpdate kullanıyoruz)
  const { users } = getGroupCollections(groupId);
  const updatedUser = await users.findByIdAndUpdate(
    user._id,
    {
      loginStreak: newStreak,
      lastLoginDate: today
    },
    { returnDocument: 'after' }
  );

  // Güncellenmiş user objesini döndür
  const resultUser = updatedUser || { ...user, loginStreak: newStreak, lastLoginDate: today };
  return { user: resultUser, streakIncreased };
}



module.exports = {
  handleLoginStreak
};

