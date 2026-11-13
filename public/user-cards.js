window.addEventListener('rotakip:amount-type-changed', function () {
  if (typeof window.loadUserCards === 'function') {
    window.loadUserCards();
  }
});

window.loadUserCards = async function loadUserCards() {
  console.log('🔍 User Cards Loading...');
  const container = document.querySelector('.user-cards-container');
  if (!container) return;

  function observeRevealToggle(el) {
    if (el) el.classList.add('visible');
  }

  try {
    // Global store'dan tüm kullanıcı ve okuma verilerini çek
    const allData = window.globalDataStore ? window.globalDataStore.getAllData() : { users: [], stats: [] };
    const { users = [], stats = [] } = allData;
    const streaks = window.globalDataStore ? window.globalDataStore.getLongestStreaks() : [];
    const monthNamesTr = [
      'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
      'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
    ];
    const nowTr = new Date();
    nowTr.setHours(nowTr.getHours() + 3);
    const currentMonthKey = nowTr.getFullYear() + '-' + String(nowTr.getMonth() + 1).padStart(2, '0');
    const currentMonthLabel = monthNamesTr[nowTr.getMonth()];
    const amountType = typeof window.getCurrentAmountType === 'function'
      ? window.getCurrentAmountType()
      : 'sayfa';
    const amountTypeLabel = typeof window.getCurrentAmountTypeLabel === 'function'
      ? window.getCurrentAmountTypeLabel()
      : 'Sayfa';

    // Giriş yapılan kullanıcı bilgisi
    const currentUserInfo = LocalStorageManager.getCurrentUserInfo();
    const sortBar = document.querySelector('.leaderboard-sort-bar');
    const sortButtons = sortBar ? Array.from(sortBar.querySelectorAll('.leaderboard-sort-button')) : [];
    const validSortModes = ['league', 'promotion', 'total', 'month', 'percentage', 'name'];
    const groupSortKey = `leaderboardSort:${window.groupid || 'default'}`;
    let sortMode = localStorage.getItem(groupSortKey) || 'league';
    if (!validSortModes.includes(sortMode)) sortMode = 'league';
    const monthSortLabel = sortBar ? sortBar.querySelector('.leaderboard-current-month-label') : null;
    const totalSortLabel = sortBar ? sortBar.querySelector('.leaderboard-total-amount-label') : null;
    if (totalSortLabel) totalSortLabel.textContent = `Toplam ${amountTypeLabel}`;
    if (monthSortLabel) monthSortLabel.textContent = `${currentMonthLabel} ${amountTypeLabel}`;

    function applySortControlState(mode) {
      sortButtons.forEach(button => {
        const isActive = button.dataset.sort === mode;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
      });
    }

    function selectSortMode(mode) {
      if (!validSortModes.includes(mode) || localStorage.getItem(groupSortKey) === mode) return;
      localStorage.setItem(groupSortKey, mode);
      applySortControlState(mode);
      window.loadUserCards();
    }

    applySortControlState(sortMode);
    if (sortBar && sortBar.dataset.sortBound !== '1') {
      sortBar.dataset.sortBound = '1';
      sortButtons.forEach(button => {
        button.addEventListener('click', () => selectSortMode(button.dataset.sort));
      });
    }

    const readDayCounts = new Map();
    const totalReadAmounts = new Map();
    const monthlyReadAmounts = new Map();
    const readingStatsByUser = new Map();
    stats.forEach(stat => {
      const userId = String(stat.userId);
      if (stat.status === 'okudum' || stat.status === 'okumadım') {
        if (!readingStatsByUser.has(userId)) readingStatsByUser.set(userId, []);
        readingStatsByUser.get(userId).push(stat);
      }
      if (stat.status === 'okudum') {
        readDayCounts.set(userId, (readDayCounts.get(userId) || 0) + 1);
      }
      const amount = typeof parseFiniteAmount === 'function'
        ? parseFiniteAmount(stat.amount)
        : Number(stat.amount);
      if (Number.isFinite(amount) && amount > 0) {
        totalReadAmounts.set(userId, (totalReadAmounts.get(userId) || 0) + amount);
        if (String(stat.date || '').slice(0, 7) === currentMonthKey) {
          monthlyReadAmounts.set(userId, (monthlyReadAmounts.get(userId) || 0) + amount);
        }
      }
    });
    const getReadDayCount = user => readDayCounts.get(String(user._id)) || 0;
    const getTotalReadAmount = user => totalReadAmounts.get(String(user._id)) || 0;
    const getMonthlyReadAmount = user => monthlyReadAmounts.get(String(user._id)) || 0;
    const getReadPercentage = user => {
      const userStats = readingStatsByUser.get(String(user._id)) || [];
      return userStats.length > 0 ? getReadDayCount(user) / userStats.length : 0;
    };
    const longestStreakDetailsByUser = new Map();
    (streaks || []).forEach(item => {
      const userId = item.userId || item._id;
      if (userId != null) {
        longestStreakDetailsByUser.set(String(userId), item);
      }
    });
    const leagues = window.ROTAKIP_LEAGUES;
    const nextLeagueLimits = leagues.slice(1).map(league => league.min);
    const daysUntilNextLeague = user => {
      const count = getReadDayCount(user);
      const nextLimit = nextLeagueLimits.find(limit => count < limit);
      return nextLimit == null ? Number.POSITIVE_INFINITY : nextLimit - count;
    };
    const turkishCollator = new Intl.Collator('tr-TR', { sensitivity: 'base' });
    const compareByName = (a, b) => turkishCollator.compare(a.name || '', b.name || '');

    // Global store dizisini değiştirmeden yalnızca kartların gösterim sırasını oluştur.
    const orderedUsers = [...users].sort((user1, user2) => {
      if (sortMode === 'name') {
        return compareByName(user1, user2) || getReadDayCount(user2) - getReadDayCount(user1);
      }
      if (sortMode === 'promotion') {
        return daysUntilNextLeague(user1) - daysUntilNextLeague(user2)
          || getReadDayCount(user2) - getReadDayCount(user1)
          || compareByName(user1, user2);
      }
      if (sortMode === 'total') {
        return getTotalReadAmount(user2) - getTotalReadAmount(user1)
          || getReadDayCount(user2) - getReadDayCount(user1)
          || compareByName(user1, user2);
      }
      if (sortMode === 'month') {
        return getMonthlyReadAmount(user2) - getMonthlyReadAmount(user1)
          || getTotalReadAmount(user2) - getTotalReadAmount(user1)
          || compareByName(user1, user2);
      }
      if (sortMode === 'percentage') {
        return getReadPercentage(user2) - getReadPercentage(user1)
          || getReadDayCount(user2) - getReadDayCount(user1)
          || compareByName(user1, user2);
      }
      return getReadDayCount(user2) - getReadDayCount(user1) || compareByName(user1, user2);
    });

    // Mevcut kartları bir Map olarak tut
    const existingCards = new Map();
    container.querySelectorAll('.user-card[data-user-id]').forEach(card => {
      existingCards.set(card.getAttribute('data-user-id'), card);
    });

    // Güncel kullanıcı ID'lerini tut
    const currentUserIds = orderedUsers.map(u => u._id);

    // Artık olmayan kullanıcıların kartlarını kaldır
    existingCards.forEach((card, userId) => {
      if (!currentUserIds.includes(userId)) {
        card.remove();
      }
    });

    /** Bugünden geriye ardışık "okudum" gün sayısı (kart ve lig tebriği için ortak) */
    function calculateStreakForUser(stats) {
      if (!stats || stats.length === 0) return 0;
      const statMap = {};
      stats.forEach(s => { statMap[s.date] = s.status; });
      const allDates = Object.keys(statMap).sort();
      if (allDates.length === 0) return 0;

      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const todayKey = `${year}-${month}-${day}`;
      const todayStatus = statMap[todayKey];
      let streak = 0;
      let currentDate;

      if (todayStatus === 'okudum') {
        currentDate = todayKey;
      } else if (todayStatus === 'okumadım') {
        return 0;
      } else {
        const d = new Date(todayKey);
        d.setDate(d.getDate() - 1);
        const prevYear = d.getFullYear();
        const prevMonth = String(d.getMonth() + 1).padStart(2, '0');
        const prevDay = String(d.getDate()).padStart(2, '0');
        currentDate = `${prevYear}-${prevMonth}-${prevDay}`;
      }

      while (true) {
        if (statMap[currentDate] === 'okudum') {
          streak++;
          const d = new Date(currentDate);
          d.setDate(d.getDate() - 1);
          const prevYear = d.getFullYear();
          const prevMonth = String(d.getMonth() + 1).padStart(2, '0');
          const prevDay = String(d.getDate()).padStart(2, '0');
          currentDate = `${prevYear}-${prevMonth}-${prevDay}`;
        } else {
          break;
        }
      }
      return streak;
    }

    function formatDateTurkish(dateStr) {
      if (!dateStr) return '-';
      const [year, month, day] = dateStr.split('-').map(Number);
      const date = new Date(year, (month || 1) - 1, day || 1);
      return date.toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    }

    function getRelativeReadText(dateStr) {
      if (!dateStr) return '';
      const [year, month, day] = dateStr.split('-').map(Number);
      const readDate = new Date(year, (month || 1) - 1, day || 1);
      readDate.setHours(0, 0, 0, 0);

      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const diffMs = now - readDate;
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) return 'Bugün';
      if (diffDays === 1) return 'Dün';
      return `${diffDays} gün önce`;
    }

    orderedUsers.forEach(user => {
      const userId = String(user._id);
      const userStats = readingStatsByUser.get(userId) || [];
      const okudumStats = userStats.filter(s => s.status === 'okudum');
      const totalDays = userStats.length;
      const okudumDays = okudumStats.length;
      const amountTotal = totalReadAmounts.get(userId) || 0;
      const amountThisMonth = monthlyReadAmounts.get(userId) || 0;
      const amountSummaryHtml = amountTotal > 0
        ? `<span class="progress-summary progress-summary-amount">
          <span class="summary-count"><span class="progress-summary-amount-count">${amountTotal}</span><span class="progress-summary-amount-mark">✔</span></span>
          <span class="summary-label"> Toplam ${amountType}</span>
        </span>`
        : '';
      const lastReadDate = okudumStats.length > 0
        ? okudumStats.reduce((latest, stat) => (stat.date > latest ? stat.date : latest), okudumStats[0].date)
        : '';

      // Lig belirle
      const league = leagues.find(l => okudumDays >= l.min && okudumDays < l.max) || leagues[leagues.length - 1];

      const streak = calculateStreakForUser(userStats);

      // Progress bar
      const percent = totalDays > 0 ? Math.round((okudumDays / totalDays) * 100) : 0;

      // En uzun seri
      const userStreak = longestStreakDetailsByUser.get(userId);
      const longestStreakDays = userStreak && userStreak.streak > 0 ? userStreak.streak : 0;
      let longestStreakText = `<span class="streak-icon">⚡</span><span class="streak-icon-label">En uzun seri: </span>-`;
      if (userStreak && userStreak.streak > 0) {
        const start = userStreak.startDate ? new Date(userStreak.startDate).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : '';
        const end = userStreak.endDate ? new Date(userStreak.endDate).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : '';
        longestStreakText = `<span class="streak-icon">⚡</span><span class="streak-icon-label">En uzun seri: </span><span class="streak-range">${start} - ${end}</span>`;
      }
      // Lig bilgisi için gösterim
      const leagueProgressText = `${okudumDays}/${league.max}`;
      const headerBg = league.bg || "#fff";


      // Section'ı göster
      const section = document.querySelector('.user-cards-section');
      if (section) {
        section.style.display = 'block';
        section.classList.add('visible');
      }

      // League info bar'ı da göster
      let leagueInfoBar = document.querySelector('.league-info-bar');
      if (leagueInfoBar) {
        leagueInfoBar.style.display = 'flex';
        observeRevealToggle(leagueInfoBar);
      }

      if (sortBar) {
        sortBar.style.display = 'flex';
        observeRevealToggle(sortBar);
      }

      // User cards header'ı da göster
      const userCardsHeader = document.querySelector('.user-cards-header');
      if (userCardsHeader) {
        userCardsHeader.style.display = 'block';
        userCardsHeader.classList.add('visible');
      }

      container.style.display = 'flex';

      // Kart zaten varsa, içeriğini güncelle
      let card = container.querySelector(`.user-card[data-user-id="${user._id}"]`);
      if (!card) {
        card = document.createElement('div');
        card.className = 'user-card';
        card.setAttribute('data-user-id', user._id);

        // Giriş yapılan kullanıcı için özel class ekle
        if (currentUserInfo && currentUserInfo.userId === user._id) {
          card.classList.add('current-user-card');
        }

        card.classList.add('card-fade-in');
      } else {
        // Giriş yapılan kullanıcı için özel class ekle
        if (currentUserInfo && currentUserInfo.userId === user._id) {
          card.classList.add('current-user-card');
        } else {
          card.classList.remove('current-user-card');
        }

        card.classList.add('card-fade-in');
      }

      // Kullanıcılar sıralandıktan sonra kartların DOM sırasını da güncelle.
      // appendChild mevcut bir elementi sona taşıdığı için yeniden sıralama sağlar.
      container.appendChild(card);

      card.innerHTML = `
      <div class="user-card-header" style="background: ${headerBg};">
        <div class="profile-img-wrapper">
          <img class="profile-img profile-img-loading" src="${window.escapeHtml(window.safeImageSrc(user.profileImage))}" alt="${window.escapeHtml(user.name)}" loading="lazy" decoding="async" onload="this.classList.remove('profile-img-loading')" onerror="this.classList.remove('profile-img-loading'); this.src='/images/default.png'">
        </div>
        <div class="user-card-header-content">
          <div class="user-card-user-name">${window.escapeHtml(user.name)}</div>
          <div class="user-league">${league.name}</div>
        </div>
        <button type="button" class="share-icon-wrapper" aria-label="${window.escapeHtml(user.name)} kullanıcısının okuma bilgilerini paylaş">
          <img class="share-icon" src="/images/share.webp" alt="Paylaş">
        </button>
        <div class="league-badge-group">
          <div class="league-badge" title="${league.name} Ligi:  ${league.min} - ${league.max - 1} gün arası okuma">
            <img src="/images/${league.img}" alt="${league.name}">
          </div>
          <div class="league-progress-text">${leagueProgressText}</div>
        </div>
      </div>
      <div class="progress-summary-row">
        <div class="progress-summary-column">
          ${amountSummaryHtml}
          <span class="progress-summary progress-summary-days">
            <span class="summary-count"><span class="progress-summary-okudum-count">${okudumDays}</span><span class="progress-summary-total-count">/${totalDays}</span><span class="progress-summary-days-star" aria-hidden="true">🌟</span></span>
            <span class="summary-label"> Gün okuma</span>
          </span>
        </div>
        <div class="streak-info">
          <span class="user-card-fire-emoji">⭐</span>
          <span class="user-card-fire-label">${streak}</span>
        </div>
      </div>
      <div class="progress-bar-container">
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width:${percent}%;"></div>
        </div>
        <span class="progress-percent">%${percent}</span>
      </div>
      <div class="user-card-last-read">📅 <span class="last-read-label">Son okuma:</span> ${lastReadDate ? formatDateTurkish(lastReadDate) : '-'}</div>
      <div class="user-card-longest-streak">${longestStreakText}</div>
    `;
      // Paylaşım ikonu click event ekle
      const shareIconWrapper = card.querySelector('.share-icon-wrapper');
      if (shareIconWrapper) {
        shareIconWrapper.addEventListener('click', function () {
          const okunmayanGun = totalDays - okudumDays;
          const basariOrani = percent;
          let sonOkumaMetni = '-';
          if (lastReadDate) {
            sonOkumaMetni = `${formatDateTurkish(lastReadDate)} (${getRelativeReadText(lastReadDate)})`;
          }
          let longestStreakShare = '-';
          if (longestStreakDays > 0) {
            const start = userStreak.startDate
              ? new Date(userStreak.startDate).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
              : '';
            const end = userStreak.endDate
              ? new Date(userStreak.endDate).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
              : '';
            longestStreakShare = `${longestStreakDays} gün${start && end ? ` (${start} - ${end})` : ''}`;
          }
          let amountShareBlock = '';
          if (amountThisMonth > 0 || amountTotal > 0) {
            const amountLines = [];
            if (amountTotal > 0) {
              amountLines.push(`*Toplam okumanız:* ${amountTotal} ${amountType},`);
            }
            if (amountThisMonth > 0) {
              amountLines.push(`*${currentMonthLabel} ayı okumanız:* ${amountThisMonth} ${amountType},`);
            }
            amountShareBlock = amountLines.join('\n') + '\n\n';
          }
          const shareMessage = `*Genel okuma durumunuz:*\n\n${amountShareBlock}*Okunan gün:* ${okudumDays},\n*Okunmayan gün:* ${okunmayanGun},\n*Başarı oranı:* %${basariOrani},\n\n*Mevcut seri:* ${streak} gün,\n*En uzun seri:* ${longestStreakShare},\n*Son okuma:* ${sonOkumaMetni}`;

          // Web Share API veya panoya kopyala
          if (navigator.share) {
            navigator.share({
              title: 'Kullanıcının Okuma Bilgileri',
              text: shareMessage,
            }).catch(() => {});
          } else {
            navigator.clipboard.writeText(shareMessage).then(() => {
              alert('Paylaşım metni panoya kopyalandı!');
            }).catch(err => {
              console.error('Kopyalama hatası:', err);
              alert('Metin panoya kopyalanamadı.');
            });
          }
        });
      }
    });

    const leagueInfoBar = document.querySelector('.league-info-bar');
    if (leagueInfoBar) leagueInfoBar.style.display = 'flex';

  } catch (error) {
    console.error('Kullanıcı kartları yüklenirken hata oluştu:', error);
  }
}
