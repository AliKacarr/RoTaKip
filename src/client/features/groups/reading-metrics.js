/*
 * Okuma metrikleri: seri, toplam gün, haftalık şerit, aylık özet, lig ve rozetler.
 * Lig/gün hesabının tek kaynağıdır; okumalar paketlerindeki tüm görünümler buradan okur.
 * Tarih anahtarları tarayıcının yerel günüdür (YYYY-MM-DD), haftalık tablo ile aynıdır.
 */
(function initializeReadingMetrics() {
  const DAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  const MONTH_NAMES = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
  ];
  const STREAK_BADGES = [
    { id: 'seri-7', days: 7, title: '7 gün seri', icon: '🔥' },
    { id: 'seri-30', days: 30, title: '30 gün seri', icon: '🌙' },
    { id: 'seri-100', days: 100, title: '100 gün seri', icon: '⭐' },
    { id: 'seri-365', days: 365, title: '365 gün seri', icon: '👑' }
  ];
  const AMOUNT_BADGES = [
    { id: 'miktar-100', amount: 100, icon: '📖' },
    { id: 'miktar-1000', amount: 1000, icon: '📚' },
    { id: 'miktar-10000', amount: 10000, icon: '🏛️' }
  ];

  function dateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function parseKey(key) {
    const [year, month, day] = String(key).split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  function addDays(key, amount) {
    const date = parseKey(key);
    date.setDate(date.getDate() + amount);
    return dateKey(date);
  }

  function todayKey() {
    return dateKey(new Date());
  }

  function monthKey(key = todayKey()) {
    return String(key).slice(0, 7);
  }

  function monthLabel(key = todayKey()) {
    const [year, month] = String(key).split('-').map(Number);
    return `${MONTH_NAMES[month - 1] || ''} ${year}`.trim();
  }

  // { date: status } haritası; dizi verilirse haritaya çevrilir.
  function toStatusMap(records) {
    if (!records) return {};
    if (!Array.isArray(records)) return records;
    const map = {};
    records.forEach(record => {
      if (record && record.date) map[record.date] = record.status;
    });
    return map;
  }

  function totalReadDays(records) {
    const map = toStatusMap(records);
    return Object.keys(map).reduce((total, key) => total + (map[key] === 'okudum' ? 1 : 0), 0);
  }

  // Haftalık tablodaki seri kuralı: bugün okumadım ise 0; bugün boşsa dünden geriye sayılır.
  function currentStreak(records, today = todayKey()) {
    const map = toStatusMap(records);
    const todayStatus = map[today];
    if (todayStatus === 'okumadım') return 0;
    let cursor = todayStatus === 'okudum' ? today : addDays(today, -1);
    let streak = 0;
    while (map[cursor] === 'okudum') {
      streak += 1;
      cursor = addDays(cursor, -1);
    }
    return streak;
  }

  function longestStreak(records) {
    const map = toStatusMap(records);
    const keys = Object.keys(map).filter(key => map[key] === 'okudum').sort();
    let best = { streak: 0, startDate: null, endDate: null };
    let runStart = null;
    let runLength = 0;
    let previous = null;
    keys.forEach(key => {
      if (previous && addDays(previous, 1) === key) {
        runLength += 1;
      } else {
        runStart = key;
        runLength = 1;
      }
      if (runLength > best.streak) best = { streak: runLength, startDate: runStart, endDate: key };
      previous = key;
    });
    return best;
  }

  function weekStartKey(key = todayKey()) {
    const date = parseKey(key);
    const offset = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - offset);
    return dateKey(date);
  }

  // Pazartesi başlayan 7 günlük şerit.
  function weekStrip(records, key = todayKey()) {
    const map = toStatusMap(records);
    const start = weekStartKey(key);
    const today = todayKey();
    return DAY_LABELS.map((label, index) => {
      const date = addDays(start, index);
      return {
        date,
        label,
        status: map[date] || '',
        isToday: date === today,
        isFuture: date > today
      };
    });
  }

  function amountOf(record) {
    const amount = Number(record && record.amount);
    return record && record.status === 'okudum' && Number.isFinite(amount) ? amount : 0;
  }

  function monthSummary(records, key = todayKey()) {
    const month = monthKey(key);
    const list = Array.isArray(records) ? records : [];
    let days = 0;
    let amount = 0;
    list.forEach(record => {
      if (!record || String(record.date).slice(0, 7) !== month || record.status !== 'okudum') return;
      days += 1;
      amount += amountOf(record);
    });
    return { month, days, amount };
  }

  function totalAmount(records) {
    return (Array.isArray(records) ? records : []).reduce((sum, record) => sum + amountOf(record), 0);
  }

  function leagues() {
    return Array.isArray(window.ROTAKIP_LEAGUES) ? window.ROTAKIP_LEAGUES : [];
  }

  function leagueFor(totalDays) {
    const list = leagues();
    if (!list.length) return null;
    return list.find(league => totalDays >= league.min && totalDays < league.max) || list[list.length - 1];
  }

  function nextLeague(totalDays) {
    const list = leagues();
    const current = leagueFor(totalDays);
    if (!current) return null;
    const index = list.indexOf(current);
    return index < list.length - 1 ? list[index + 1] : null;
  }

  // Bir sonraki lige kalan gün ve mevcut lig içindeki ilerleme yüzdesi.
  function leagueProgress(totalDays) {
    const current = leagueFor(totalDays);
    const next = nextLeague(totalDays);
    if (!current) return null;
    const range = Math.max(1, current.max - current.min);
    const percent = next
      ? Math.min(100, Math.max(0, ((totalDays - current.min) / range) * 100))
      : 100;
    return {
      current,
      next,
      percent,
      remaining: next ? Math.max(0, next.min - totalDays) : 0
    };
  }

  function badgesFor(records, amountLabel = 'sayfa') {
    const best = longestStreak(records).streak;
    const amount = totalAmount(records);
    const streakBadges = STREAK_BADGES.map(badge => ({
      id: badge.id,
      icon: badge.icon,
      title: badge.title,
      earned: best >= badge.days
    }));
    const amountBadges = AMOUNT_BADGES.map(badge => ({
      id: badge.id,
      icon: badge.icon,
      title: `${badge.amount.toLocaleString('tr-TR')} ${amountLabel}`,
      earned: amount >= badge.amount
    }));
    return streakBadges.concat(amountBadges);
  }

  window.RoTaKipReadingMetrics = Object.freeze({
    DAY_LABELS,
    MONTH_NAMES,
    dateKey,
    parseKey,
    addDays,
    todayKey,
    monthKey,
    monthLabel,
    weekStartKey,
    toStatusMap,
    totalReadDays,
    currentStreak,
    longestStreak,
    weekStrip,
    monthSummary,
    totalAmount,
    leagueFor,
    nextLeague,
    leagueProgress,
    badgesFor
  });
})();
