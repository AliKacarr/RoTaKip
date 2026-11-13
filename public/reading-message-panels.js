/* exported renderReadingMessagePanels */

(function initializeReadingMessagePanelsModule() {
  const reminderAlternatives = [
    'Okumalarımıza düzenli devam edebilmek dileğiyle 🌿',
    'Küçük adımlar, büyük alışkanlıklar oluşturur. Takipteyiz! 📘',
    'Zinciri kırmayalım, okumaya devam 🔗',
    'Az da olsa devamlı okuyalım 💧'
  ];

  function formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function statsByUser(stats) {
    const result = new Map();
    stats.forEach(stat => {
      const key = String(stat.userId);
      if (!result.has(key)) result.set(key, []);
      result.get(key).push(stat);
    });
    return result;
  }

  function isAdminSession() {
    return typeof LocalStorageManager !== 'undefined'
      && LocalStorageManager.isUserLoggedIn()
      && LocalStorageManager.isAdmin();
  }

  async function updateCongratulatedLeagues(rows) {
    if (!isAdminSession() || rows.length === 0) return;
    const items = rows.map(row => ({ userId: row.userId, leagueName: row.league }));
    const response = await fetch(`/api/last-congratulated-league/${encodeURIComponent(window.groupid)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
    if (!response.ok) throw new Error('Lig kutlama bilgisi kaydedilemedi.');
    if (window.globalDataStore && typeof window.globalDataStore.patchUsersLastCongratulated === 'function') {
      window.globalDataStore.patchUsersLastCongratulated(items);
    }
  }

  function addCopyChip(panel) {
    const chip = document.createElement('div');
    chip.className = 'copy-chip';
    chip.innerHTML = 'Kopyala <span class="copy-emoji">👆</span>';
    panel.appendChild(chip);
    return chip;
  }

  function makeCopyable(panel, textFactory, afterCopy) {
    const chip = addCopyChip(panel);
    panel.tabIndex = 0;
    panel.setAttribute('role', 'button');
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(textFactory());
        if (typeof afterCopy === 'function') await afterCopy();
        const previous = chip.innerHTML;
        chip.innerHTML = 'Kopyalandı ✅';
        setTimeout(() => { chip.innerHTML = previous; }, 1500);
      } catch (error) {
        console.error('Panel metni kopyalanamadı:', error);
      }
    };
    panel.addEventListener('click', copy);
    panel.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      copy();
    });
  }

  function revealPanel(panel) {
    panel.classList.add('message-fade-in');
  }

  function enableConfetti(panel) {
    const overlay = panel.querySelector('.confetti-overlay');
    if (!overlay) return;
    if (!('IntersectionObserver' in window)) {
      overlay.classList.add('show');
      return;
    }
    const observer = new IntersectionObserver((entries, instance) => {
      if (entries.some(entry => entry.isIntersecting)) {
        overlay.classList.add('show');
        instance.disconnect();
      }
    }, { threshold: 0.5 });
    observer.observe(panel);
  }

  function renderPromotionPanel(container, rows, options) {
    if (rows.length === 0) return;
    const panel = document.createElement('div');
    panel.className = options.className;
    const title = rows.length === 1
      ? 'Lig atlayan arkadaşımızı tebrik ediyoruz! 🎉🎉'
      : 'Lig atlayan arkadaşlarımızı tebrik ediyoruz! 🎉🎉';
    const copyLines = rows.map(row => `⚡${row.days} gün - *${row.name}* ${row.league.toLowerCase()} lige yükseldi`);
    const list = rows.map(row =>
      `⚡${row.days} gün - <b class="promoted-username">${window.escapeHtml(row.name)}</b> `
      + `<span class="promoted-league">${window.escapeHtml(row.league.toLowerCase())}</span> lige yükseldi`
    );
    const subtitle = options.subtitle
      ? `<div class="promotion-subtitle-wrap"><span class="promotion-subtitle">${window.escapeHtml(options.subtitle)}</span></div>`
      : '';
    panel.innerHTML = `<div class="promotion-message-content"><div class="promotion-panel-title">${title}</div><div class="promotion-promoted-list">${list.join('<br>')}</div>${subtitle}</div><div class="confetti-overlay"></div><div class="left-emoji"></div>`;
    makeCopyable(panel, () => `${title}\n\n${copyLines.join('\n')}`, () => updateCongratulatedLeagues(rows));
    container.appendChild(panel);
    enableConfetti(panel);
    revealPanel(panel);
  }

  function calculateReadingStreak(readings, today) {
    const statusByDate = new Map(readings.map(reading => [reading.date, reading.status]));
    const todayKey = formatDate(today);
    if (statusByDate.get(todayKey) === 'okumadım') return 0;
    const cursor = new Date(today);
    if (statusByDate.get(todayKey) !== 'okudum') cursor.setDate(cursor.getDate() - 1);
    let count = 0;
    while (statusByDate.get(formatDate(cursor)) === 'okudum') {
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }

  function renderStreakPanel(container, rows) {
    if (rows.length === 0) return;
    const panel = document.createElement('div');
    panel.className = 'reading-streak-message';
    panel.innerHTML = `<div class="left-emoji streak-clap-emoji"></div><div class="chain-text">Zinciri Kırma</div><div class="streak-panel-body"><span class="streak-section-title">Okuma Serisi Yapanlar:</span><div class="streak-names-block">${rows.map(row => `<b class="streak-username">${window.escapeHtml(row.name)}</b> (<span class="streak-days">${row.streak} gün</span>)`).join(', ')}</div><span class="streak-tagline">Az da olsa devamlı okumak.</span></div>`;
    makeCopyable(panel, () => `*Okuma serisi yapanlar:*\n${rows.map(row => `${row.name} (${row.streak} gün)`).join(',\n')}`);
    container.appendChild(panel);
    revealPanel(panel);
  }

  function calculateMissedDays(readings, today) {
    if (readings.length === 0) return 0;
    const statusByDate = new Map(readings.map(reading => [reading.date, reading.status]));
    const earliest = readings.map(reading => reading.date).sort()[0];
    const todayKey = formatDate(today);
    if (statusByDate.get(todayKey) === 'okudum') return 0;
    const cursor = new Date(today);
    if (!statusByDate.has(todayKey)) cursor.setDate(cursor.getDate() - 1);
    let count = 0;
    while (formatDate(cursor) >= earliest && statusByDate.get(formatDate(cursor)) !== 'okudum') {
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }

  function renderMissedPanel(container, rows) {
    if (rows.length === 0) return;
    const panel = document.createElement('div');
    panel.className = 'weak-link-message';
    panel.innerHTML = `<div class="left-emoji"></div><div class="weak-link-banner">Zayıf Halka</div><div class="weak-link-body"><span class="missed-title">Art arda okumayanlar:</span><div class="weak-names-block">${rows.map(row => `<b class="missed-username">${window.escapeHtml(row.name)}</b> (<span class="missed-days">${row.days} gün</span>)`).join(', ')}</div><span class="missed-reminder">Hususî okumanı terk etme.</span></div>`;
    makeCopyable(panel, () => {
      const reminder = reminderAlternatives[Math.floor(Math.random() * reminderAlternatives.length)];
      return `*Art arda okumayanlar:*\n${rows.map(row => `${row.name} (${row.days} gün)`).join(',\n')}\n\n${reminder}`;
    });
    container.appendChild(panel);
    revealPanel(panel);
  }

  function renderEveryonePanel(container) {
    const panel = document.createElement('div');
    panel.className = 'everyone-read-message';
    panel.innerHTML = '<div class="left-emoji party-emoji"></div><div class="everyone-read-body"><span class="everyone-read-title">Harika! Herkes bugün okumalarını yapmış! 🎉🎉</span><span class="everyone-read-reminder">Bu güzel alışkanlığı devam ettirelim!</span></div>';
    makeCopyable(panel, () => 'Harika! Herkes bugün okumalarını yapmış! 🎉🎉\nBu güzel alışkanlığı devam ettirelim!');
    container.appendChild(panel);
    revealPanel(panel);
  }

  window.renderReadingMessagePanels = async function renderReadingMessagePanels() {
    const container = document.querySelector('.reading-message-panels-content');
    const store = window.globalDataStore;
    if (!container || !store) return;
    container.replaceChildren();
    const { users = [], stats = [] } = store.getAllData();
    const grouped = statsByUser(stats);
    const today = new Date();
    const todayKey = formatDate(today);
    const leagues = window.ROTAKIP_LEAGUES || [];
    const leagueRank = name => leagues.findIndex(league => league.name === name);
    const promotionsToday = [];
    const promotionsBacklog = [];

    users.forEach(user => {
      const readings = (grouped.get(String(user._id)) || [])
        .filter(stat => stat.status === 'okudum')
        .sort((a, b) => a.date.localeCompare(b.date));
      const league = leagues.find(item => readings.length >= item.min && readings.length < item.max)
        || leagues[leagues.length - 1];
      if (!league || league.min === 0) return;
      const promotionReading = readings[league.min - 1];
      if (!promotionReading) return;
      const row = { userId: user._id, name: user.name, league: league.name, days: league.min, date: promotionReading.date };
      if (promotionReading.date === todayKey) {
        promotionsToday.push(row);
        return;
      }
      const lastLeague = String(user.lastCongratulatedLeague || 'Bronz');
      if (lastLeague !== league.name && leagueRank(league.name) >= leagueRank(lastLeague)) promotionsBacklog.push(row);
    });

    const sortPromotions = (a, b) => leagueRank(b.league) - leagueRank(a.league);
    promotionsToday.sort(sortPromotions);
    promotionsBacklog.sort((a, b) => b.date.localeCompare(a.date) || sortPromotions(a, b));
    renderPromotionPanel(container, promotionsBacklog, {
      className: 'league-promotion-backlog',
      subtitle: isAdminSession() ? 'Lig atlaması henüz kutlanmamış kullanıcılar var. Panele tıklayıp mesajı kopyalayabilirsiniz.' : ''
    });
    renderPromotionPanel(container, promotionsToday, {
      className: 'league-promotion-message',
      subtitle: isAdminSession() ? 'Bugün lig atlayan kullanıcılar var. Panele tıklayıp mesajı kopyalayabilirsiniz.' : ''
    });

    const streaks = users.map(user => ({
      name: user.name,
      streak: calculateReadingStreak(grouped.get(String(user._id)) || [], today)
    })).filter(row => row.streak > 0).sort((a, b) => b.streak - a.streak);
    renderStreakPanel(container, streaks);

    const missed = users.map(user => ({
      name: user.name,
      days: calculateMissedDays(grouped.get(String(user._id)) || [], today)
    })).filter(row => row.days > 1).sort((a, b) => b.days - a.days);
    renderMissedPanel(container, missed);

    const everyoneRead = users.length > 0 && users.every(user => {
      const todayStat = (grouped.get(String(user._id)) || []).find(stat => stat.date === todayKey);
      return todayStat && todayStat.status === 'okudum';
    });
    if (everyoneRead) renderEveryonePanel(container);
  };
}());
