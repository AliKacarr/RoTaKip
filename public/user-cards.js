async function loadUserCards() {
  console.log('🔍 User Cards Loading...');
  const container = document.querySelector('.user-cards-container');
  if (!container) return;

  // Intersection Observer'ı oluştur
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('card-fade-in');
      } else {
        // Element görünür alandan çıktığında animasyonu sıfırla
        entry.target.classList.remove('card-fade-in');
      }
    });
  }, {
    threshold: 0.2, // Kart görünür olduğunda tetikle
    rootMargin: '100px' // Kartlar ekranın 50px yakınına geldiğinde tetikle
  });

  try {
    // Global store'dan tüm kullanıcı ve okuma verilerini çek
    const allData = window.globalDataStore ? window.globalDataStore.getAllData() : { users: [], stats: [] };
    const { users = [], stats = [] } = allData;
    const streaks = window.globalDataStore ? window.globalDataStore.getLongestStreaks() : [];

    // Giriş yapılan kullanıcı bilgisi
    const currentUserInfo = LocalStorageManager.getCurrentUserInfo();

    // Kullanıcıları lig sıralamasına göre düzenle (en yüksek ligden en düşüğe)
    users.sort((user1, user2) => {
      const user1Stats = stats.filter(s => s.userId === user1._id && s.status === 'okudum');
      const user2Stats = stats.filter(s => s.userId === user2._id && s.status === 'okudum');
      const user1OkudumCount = user1Stats.length;
      const user2OkudumCount = user2Stats.length;
      
      // En yüksek ligden en düşüğe sırala
      return user2OkudumCount - user1OkudumCount;
    });

  // Mevcut kartları bir Map olarak tut
  const existingCards = new Map();
  container.querySelectorAll('.user-card[data-user-id]').forEach(card => {
    existingCards.set(card.getAttribute('data-user-id'), card);
  });

  // Güncel kullanıcı ID'lerini tut
  const currentUserIds = (users || []).map(u => u._id);

  // Artık olmayan kullanıcıların kartlarını kaldır
  existingCards.forEach((card, userId) => {
    if (!currentUserIds.includes(userId)) {
      card.remove();
    }
  });

  // Lig görselleri ve isimleri
  const leagues = [
    { min: 0, max: 5, name: 'Bronz', img: 'bronz.webp' },
    { min: 5, max: 10, name: 'Gümüş', img: 'gumus.webp' },
    { min: 10, max: 20, name: 'Altın', img: 'altin.webp' },
    { min: 20, max: 40, name: 'İnci', img: 'inci.webp' },
    { min: 40, max: 60, name: 'Safir', img: 'safir.webp' },
    { min: 60, max: 100, name: 'Zümrüt', img: 'zumrut.webp' },
    { min: 100, max: 150, name: 'Elmas', img: 'elmas.webp' },
    { min: 150, max: 200, name: 'Yakut', img: 'yakut.webp' },
    { min: 200, max: 365, name: 'Mercan', img: 'mercan.webp' },
    { min: 365, max: 1001, name: 'Pırlanta', img: 'pirlanta.webp' }
  ];

  // Lig arka planları
  const leagueBackgrounds = {
    "Bronz": "linear-gradient(90deg, #e2b07a 60%, #ffe0b2 100%)",
    "Gümüş": "linear-gradient(90deg, #d3d3d3 60%, #e0e0e0 100%)",
    "Altın": "linear-gradient(90deg, #ffd700 60%, #ffe789 100%)",
    "İnci": "linear-gradient(90deg, #b2dfdb 60%, #c8eef3 100%)",
    "Safir": "linear-gradient(90deg, #49b7ff 60%, #bbdefb 100%)",
    "Zümrüt": "linear-gradient(90deg, #58c089 60%, #a5d6a7 100%)",
    "Elmas": "linear-gradient(90deg, #36e873 60%, #c4edb8 100%)",
    "Yakut": "linear-gradient(90deg, #ffb199 60%, #ffe0b2 100%)",
    "Mercan": "linear-gradient(90deg, #ff6f63 60%, #ffafb7 100%)",
    "Pırlanta": "linear-gradient(90deg, #ffbf00 60%, #ffe789 100%)"
  };

  // Haftanın günleri
  function getDaysOrderedByFirstDay(firstDayOfWeek) {
    // 1: Pazartesi, 2: Salı, ..., 6: Cumartesi, 0: Pazar
    const allDays = [
      { key: 'P', label: 'Pazar' },      // 0
      { key: 'P', label: 'Pazartesi' },  // 1
      { key: 'S', label: 'Salı' },       // 2
      { key: 'Ç', label: 'Çarşamba' },   // 3
      { key: 'P', label: 'Perşembe' },    // 4
      { key: 'C', label: 'Cuma' },       // 5
      { key: 'C', label: 'Cumartesi' }   // 6
    ];
    
    let actualFirstDay;
    if (firstDayOfWeek === 'default') {
      // Varsayılan: Bugünden sonraki gün haftanın ilk günü olsun
      const today = new Date();
      // Yarını hesapla
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dayOfWeek = tomorrow.getDay();
      // JavaScript'te 0=Pazar, 1=Pazartesi... ama bizim sistemde 1=Pazartesi
      // Bu yüzden dönüşüm yapmamız gerekiyor
      const jsToOurSystem = (dayOfWeek + 6) % 7; // Pazar(0)->6, Pazartesi(1)->0, Salı(2)->1...
      actualFirstDay = (jsToOurSystem + 1) % 7;
    } else {
      actualFirstDay = firstDayOfWeek;
    }
    
    const ordered = [];
    for (let i = 0; i < 7; i++) {
      ordered.push(allDays[(actualFirstDay + i) % 7]);
    }
    return ordered;
  }

  const weekDates = typeof getWeekDates === 'function' ? getWeekDates(weekOffset || 0) : [];

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

  // Okuma serisi yapanları toplamak için array
  const activeStreaks = [];

  users.forEach(user => {
    const userStats = stats.filter(s => s.userId === user._id && (s.status === 'okudum' || s.status === 'okumadım'));
    const okudumStats = userStats.filter(s => s.status === 'okudum');
    const totalDays = userStats.length;
    const okudumDays = okudumStats.length;
    const lastReadDate = okudumStats.length > 0
      ? okudumStats.reduce((latest, stat) => (stat.date > latest ? stat.date : latest), okudumStats[0].date)
      : '';

    // Lig belirle
    const league = leagues.find(l => okudumDays >= l.min && okudumDays < l.max) || leagues[leagues.length - 1];

    // Haftalık okuma durumu
    const weekStatus = weekDates.map(date => {
      const stat = userStats.find(s => s.date === date);
      if (!stat) return 'empty';
      return stat.status === 'okudum' ? 'ok' : 'not';
    });

    const streak = calculateStreakForUser(userStats);

    // Seri > 0 ise activeStreaks listesine ekle
    if (streak > 0) {
      activeStreaks.push({ name: user.name, streak: streak });
    }

    // Progress bar
    const percent = totalDays > 0 ? Math.round((okudumDays / totalDays) * 100) : 0;

    // En uzun seri
    const userStreak = (streaks || []).find(s => (s.userId === user._id || s._id === user._id));
    let longestStreakText = '';
    if (userStreak && userStreak.streak > 0) {
      const start = userStreak.startDate ? new Date(userStreak.startDate).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : '';
      const end = userStreak.endDate ? new Date(userStreak.endDate).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : '';
      longestStreakText = `<span class="streak-icon">⚡</span><span class="streak-icon-label">En Uzun Seri: </span><span class="streak-range">${start} - ${end}</span> <span class="streak-days">(${userStreak.streak} gün)</span>`;
    }

    // Lig bilgisi için gösterim
    const leagueProgressText = `${okudumDays}/${league.max}`;
    const headerBg = leagueBackgrounds[league.name] || "#fff";


    // Section'ı göster
    const section = document.querySelector('.user-cards-section');
    if (section) {
      section.style.display = 'block';
      // Section animasyonunu tetikle
      setTimeout(() => {
        section.classList.add('visible');
      }, 50);
    }
    
    // League info bar'ı da göster
    let leagueInfoBar = document.querySelector('.league-info-bar');
    if (leagueInfoBar) {
      leagueInfoBar.style.display = 'flex';
      // League info bar animasyonunu tetikle
      setTimeout(() => {
        leagueInfoBar.classList.add('visible');
      }, 100);
    }
    
    // User cards header'ı da göster
    const userCardsHeader = document.querySelector('.user-cards-header');
    if (userCardsHeader) {
      userCardsHeader.style.display = 'block';
      // User cards header animasyonunu tetikle
      setTimeout(() => {
        userCardsHeader.classList.add('visible');
      }, 150);
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
      
      // Observer'ı başlat
      observer.observe(card);
    } else {
      // Kart zaten varsa, güncellenince de efekti tekrar uygula
      card.classList.remove('card-fade-in');
      
      // Giriş yapılan kullanıcı için özel class ekle
      if (currentUserInfo && currentUserInfo.userId === user._id) {
        card.classList.add('current-user-card');
      } else {
        card.classList.remove('current-user-card');
      }
      
      observer.observe(card);
    }

    // Kullanıcılar sıralandıktan sonra kartların DOM sırasını da güncelle.
    // appendChild mevcut bir elementi sona taşıdığı için yeniden sıralama sağlar.
    container.appendChild(card);

    card.innerHTML = `
      <div class="user-card-header" style="background: ${headerBg};">
        <div class="profile-img-wrapper">
          <img class="profile-img profile-img-loading" src="${user.profileImage || '/images/default.png'}" alt="${user.name}" onload="this.classList.remove('profile-img-loading')" onerror="this.classList.remove('profile-img-loading'); this.src='/images/default.png'">
        </div>
        <div class="user-card-header-content">
          <div class="user-card-user-name">${user.name}</div>
          <div class="user-league">${league.name}</div>
        </div>
        <div class="league-badge-group">
          <div class="league-badge" title="${league.name} Ligi:  ${league.min} - ${league.max - 1} gün arası okuma">
            <img src="images/${league.img}" alt="${league.name}">
          </div>
          <div class="league-progress-text">${leagueProgressText}</div>
        </div>
      </div>
      <div class="weekly-status-row">
        <div class="weekly-status-days">
          ${getDaysOrderedByFirstDay(firstDayOfWeek).map((day, i) => `
            <div class="weekly-status-day-group"
              data-user-id="${user._id}"
              data-date="${weekDates[i]}"
            >
              <div class="day-label">${day.key}</div>
              <div class="day-circle ${weekStatus[i]}" title="${day.label}"></div>
            </div>
          `).join('')}
        </div>
        <div class="streak-info">
          <span class="user-card-fire-emoji">⭐</span>
          <span class="user-card-fire-label">${streak}</span>
        </div>
      </div>
      <div class="divider"></div>
      <div class="progress-summary-row">
        <span class="progress-summary">
          <span class="summary-count"><span class="progress-summary-okudum-count">${okudumDays}</span><span class="progress-summary-total-count">/${totalDays}</span></span>
          <span class="summary-label"> Gün okuma</span>
        </span>
      </div>
      <div class="progress-bar-container">
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width:${percent}%;"></div>
        </div>
        <span class="progress-percent">%${percent}</span>
      </div>
      <div class="user-card-last-read">📅 <span class="last-read-label">Son okuma:</span> ${lastReadDate ? `${formatDateTurkish(lastReadDate)} <span class="last-read-relative">(${getRelativeReadText(lastReadDate)})</span>` : '-'}</div>
      <div class="user-card-longest-streak">${longestStreakText}</div>
    `;
    // .weekly-status-day-group click event ekle
    card.querySelectorAll('.weekly-status-day-group').forEach(group => {
      group.addEventListener('click', function () {
        const userId = this.getAttribute('data-user-id');
        const date = this.getAttribute('data-date');
        const userObj = users.find(u => u._id === userId);
        if (userObj) {
          const [year, month, day] = date.split('-');
          toggleUserCardsReadingStatus(userObj.name, parseInt(day), parseInt(month), parseInt(year), this);
        }
      });
    });
  });

  // Seri sayısına göre sırala (en yüksekten en düşüğe)
  activeStreaks.sort((a, b) => b.streak - a.streak);

  let leagueInfoBar = document.querySelector('.league-info-bar');
  if (leagueInfoBar) {
    leagueInfoBar.style.display = 'flex';
  }

  // --- LİG ATLAMA BİLGİSİ ---
  // Önce mevcut lig atlama mesajını kaldır
  const existingPromotedMsg = document.querySelector('.league-promotion-message');
  if (existingPromotedMsg) {
    existingPromotedMsg.remove();
  }

  // Önce mevcut art arda okumama mesajını kaldır
  const existingMissedMsg = document.querySelector('.consecutive-missed-message');
  if (existingMissedMsg) {
    existingMissedMsg.remove();
  }

  const today = new Date();
  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const todayStr = formatDate(today);

  // Lig atlayanları bul
  const promotedUsers = [];
  users.forEach(user => {
    const userStatsAll = stats.filter(s => s.userId === user._id);
    const userStatsFiltered = stats.filter(s => s.userId === user._id && (s.status === 'okudum' || s.status === 'okumadım'));
    const okudumStats = userStatsFiltered.filter(s => s.status === 'okudum');
    const okudumCount = okudumStats.length;
    const newLeague = leagues.find(l => okudumCount === l.min);
    if (newLeague) {
      const todayStat = userStatsAll.find(s => s.date === todayStr && s.status === 'okudum');
      if (todayStat) {
        const streakDays = calculateStreakForUser(userStatsFiltered);
        promotedUsers.push({ name: user.name, league: newLeague.name, streakDays });
      }
    }
  });

  
  // Eğer lig atlayan varsa mesajı oluştur
  if (promotedUsers.length > 0) {
    const promotedMsg = document.createElement('div');
    promotedMsg.className = 'league-promotion-message';

    // Lig atlayanları lige göre sırala (en yüksek ligden en düşüğe)
    promotedUsers.sort((u1, u2) => {
      const leagueOrder1 = leagues.findIndex(l => l.name === u1.league);
      const leagueOrder2 = leagues.findIndex(l => l.name === u2.league);
      return leagueOrder2 - leagueOrder1; // Ters sıralama: Yüksek lig önce
    });

    const contentDiv = document.createElement('div');
    contentDiv.className = 'promotion-message-content';

    let msg = 'Lig atlayan arkadaşlarımızı tebrik ediyoruz! 🎉🎉<br>';
    const copyLines = [];
    msg += promotedUsers.map((u, index) => {
      const isLast = index === promotedUsers.length - 1;
      const punctuation = isLast ? '.' : ',';
      const days = typeof u.streakDays === 'number' ? u.streakDays : 0;
      copyLines.push(`⚡${days} gün - *${u.name}* ${u.league.toLowerCase()} lige yükseldi${punctuation}`);
      return `⚡${days} gün - <b class="promoted-username">${u.name}</b> <span class="promoted-league">${u.league.toLowerCase()}</span> lige yükseldi${punctuation}`;
    }).join('<br>');

    contentDiv.innerHTML = msg;
    // Yalnızca panoya kopyalama: *isim* ve başlıktan sonra boş satır (sitede HTML aynı kalır)
    contentDiv.__plainCopyText = `Lig atlayan arkadaşlarımızı tebrik ediyoruz! 🎉🎉\n\n${copyLines.join('\n')}`;
    promotedMsg.appendChild(contentDiv);

    // Confetti overlay ekle
    const confettiOverlay = document.createElement('div');
    confettiOverlay.className = 'confetti-overlay';
    promotedMsg.appendChild(confettiOverlay);

    // Sol alt köşe emoji ekle
    const leftEmoji = document.createElement('div');
    leftEmoji.className = 'left-emoji';
    promotedMsg.appendChild(leftEmoji);

    // Kopyala yazısı ve emoji ekle
    const copyText = document.createElement('div');
    copyText.className = 'copy-chip';
    copyText.style.cssText = 'position: absolute; bottom: 8px; right: 12px; font-size: 15px; font-weight: bold; background: rgba(255, 255, 255, 0.9); padding: 3px 3px 3px 7px; border-radius: 8px; border: 1px solid rgba(180, 180, 180, 0.8); color: #6e6e6e;';
    copyText.innerHTML = 'Kopyala <span class="copy-emoji">👆</span>';
    promotedMsg.appendChild(copyText);

    // user-cards-section'ın en başına ekle
    const userCardsSection = document.querySelector('.user-cards-section');
    if (userCardsSection) {
      userCardsSection.insertBefore(promotedMsg, userCardsSection.firstChild);
    }

    // Intersection Observer ile confetti animasyonunu tetikle
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !entry.target.classList.contains('confetti-triggered')) {
          entry.target.classList.add('confetti-triggered');
          const confetti = entry.target.querySelector('.confetti-overlay');
          if (confetti) {
            confetti.classList.add('show');
          }
        }
      });
    }, { threshold: 0.5 });

    observer.observe(promotedMsg);

    // Tıklama ile panoya kopyalama ve bildirim
    promotedMsg.style.cursor = 'pointer'; // İşaretçiyi değiştirerek tıklanabilir olduğunu belirt
    promotedMsg.addEventListener('click', async () => {
      try {
        const textToCopy = contentDiv.__plainCopyText
          || contentDiv.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').trim();

        await navigator.clipboard.writeText(textToCopy);

        // Kopyala butonunu geçici olarak Kopyalandı yap
        const chip = promotedMsg.querySelector('.copy-chip');
        if (chip) {
          const prev = chip.innerHTML;
          chip.innerHTML = 'Kopyalandı ✅';
          setTimeout(() => { chip.innerHTML = prev; }, 1500);
        }

      } catch (err) {
        console.error('Panoya kopyalama başarısız oldu:', err);
      }
    });

    setTimeout(() => {
      promotedMsg.classList.add('message-fade-in');
    }, 50);
  }

  // --- ART ARDA OKUMAYANLAR BİLGİSİ ---
  // Alternatif hatırlatma cümleleri
  const reminderAlternatives = [
    "Okumalarımıza düzenli devam edebilmek dileğiyle 🌿",
    "Okuma alışkanlığımızı birlikte güçlendirelim inşaAllah 📖",
    "Küçük adımlar, büyük alışkanlıklar oluşturur. Takipteyiz! 📘",
    "Bu hatırlatma vesile olsun, kaldığımız yerden devam edelim 🔄",
    "Düzenli okumalarla bereketli bir sürece birlikte yürüyelim 🌱",
    "İstikrar güzeldir; eksiklerimizi birlikte tamamlayalım 🤝",
    "Okuyanlara tebrikler, henüz okumayanlara nazik bir davet 😊",
    "İstikrarın güzelliğini hep birlikte yaşayalım 🌟",
    "Eksik kalanlar için nazik bir hatırlatma olsun bu liste ✉️",
    "Bugünün okumayanları, yarının ilk okuyanı olabilir 🌅",
    "Okumalarımıza birlikte devam edebilmek duasıyla 🤲",
    "Birlikte ilerlemek, devam etmenin en güzel hali 👣",
    "Okumalarımıza sadakatle devam edelim inşaAllah 🕊️",
    "Her gün bir satır da olsa, devam edelim ✍️",
    "İstikrarla yürüdüğümüz bu yolda hep birlikteyiz 🛤️",
    "Bu küçük hatırlatma, güzel bir başlangıç olsun 🌸",
    "Unutmak kolay, alışkanlık ise emek ister. Devam edelim 💪",
    "Güzel alışkanlıklar birlikte inşa edilir 🍃",
    "Okuma yolculuğumuza birlikte güç katalım 🚀",
    "Birlikte tamamlanan okumalarda bereket vardır 🧡",
    "Düzenli okumalarla kalplerimizi diri tutalım ❤️‍🔥",
    "Hatırlatmak bizden, gayret sizden 🙏",
    "Okumaları unutmayalım 🔔",
    "İstikrarlı adımlar en kalıcı olanlardır ⏳",
    "Bugün de okuma halkamızın bir parçası ol 💫",
    "Birlikte okumak, yalnız okumaktan daha değerlidir 🤝",
    "Okudukça zihin açılır, gönül ferahlar ☀️",
    "İstikrarlı olan kazanır; bugünü de boş geçmeyelim ⏰",
    "Birlikte okumak, birlikte güçlenmektir 💪",
    "Bugün okumaya vakit ayırmak, kendine bir iyiliktir 💝",
    "Okuma halkamızda sizde yerinizi alın 🤗",
    "Bir satır da bugün için, alışkanlık zincirini kırma 🔗",
    "Okumak, gönlü besleyen en güzel alışkanlıktır 🌾",
    "Okuma yolculuğumuzda mola değil, devam zamanı 🔄"
  ];

  // Her kullanıcı için ardışık okumama günlerini hesapla
  const consecutiveMissed = [];
  users.forEach(user => {
    // Kullanıcının okuma kayıtlarını tarihe göre yeniye göre sırala
    const userStats = stats
      .filter(s => s.userId === user._id && (s.status === 'okudum' || s.status === 'okumadım'))
      .sort((a, b) => b.date.localeCompare(a.date)); // yeni -> eski
    let count = 0;
    for (const stat of userStats) {
      if (stat.status === 'okumadım') {
        count++;
      } else if (stat.status === 'okudum') {
        break;
      } else {
        break;
      }
    }
    if (count > 1) {
      consecutiveMissed.push({ name: user.name, days: count });
    }
  });
  
  // Gün sayısına göre sırala (en yüksekten en düşüğe)
  consecutiveMissed.sort((a, b) => b.days - a.days);

  const afterElem = document.querySelector('.league-promotion-message') || leagueInfoBar;
  if (consecutiveMissed.length > 0) {
    const missedMsg = document.createElement('div');
    missedMsg.className = 'consecutive-missed-message';
    
    // Zincir yazısı için element oluştur
    const chainText = document.createElement('div');
    chainText.className = 'chain-text';
    chainText.textContent = 'Zinciri Kırma';
    
    // Ana mesaj içeriği
    const messageContent = document.createElement('div');
    messageContent.style.display = '-webkit-inline-box';
    messageContent.innerHTML =
      '<span class="missed-title">Art arda okumayanlar:<br></span> ' +
      consecutiveMissed.map(u => `<b class="missed-username">${u.name}</b> (<span class="missed-days">${u.days} gün</span>)`).join(', ') +
      '<span class="missed-reminder"><br>Okumaları unutmayalım!</span>';
    
    // Sol alt köşe emoji ekle
    const leftEmoji = document.createElement('div');
    leftEmoji.className = 'left-emoji';
    missedMsg.appendChild(leftEmoji);

    // Kopyala yazısı ve emoji ekle
    const copyText = document.createElement('div');
    copyText.className = 'copy-chip';
    copyText.style.cssText = 'position: absolute; bottom: 8px; right: 12px; font-size: 15px; font-weight: bold; background: rgba(255, 255, 255, 0.9); padding: 3px 3px 3px 7px; border-radius: 8px; border: 1px solid rgba(180, 180, 180, 0.8); color: #6e6e6e;';
    copyText.innerHTML = 'Kopyala <span class="copy-emoji">👆</span>';
    missedMsg.appendChild(copyText);

    // Elementleri birleştir
    missedMsg.appendChild(chainText);
    missedMsg.appendChild(messageContent);
    
    // user-cards-section'ın en başına ekle
    const userCardsSection = document.querySelector('.user-cards-section');
    if (userCardsSection) {
      userCardsSection.insertBefore(missedMsg, userCardsSection.firstChild);
    }

    // Tıklama ile panoya kopyalama ve bildirim
    missedMsg.style.cursor = 'pointer'; // İşaretçiyi değiştirerek tıklanabilir olduğunu belirt
    missedMsg.addEventListener('click', async () => {
      try {
        const randomReminder = reminderAlternatives[Math.floor(Math.random() * reminderAlternatives.length)];
        
        // Panoya kopyalanacak metni oluştur
        let copyText = '';
        
        // Okuma serisi yapanlar kısmı
        if (activeStreaks.length > 0) {
          copyText += 'Okuma serisi yapanlar:\n';
          copyText += activeStreaks.map(u => `${u.name} (${u.streak} gün)`).join(',\n') + '\n\n';
        }
        
        // Art arda okumayanlar kısmı
        copyText += 'Art arda okumayanlar:\n';
        copyText += consecutiveMissed.map(u => `${u.name} (${u.days} gün)`).join(',\n');
        copyText += '\n\n' + randomReminder;
        
        await navigator.clipboard.writeText(copyText); // Metni panoya kopyala

        // Kopyala butonunu geçici olarak Kopyalandı yap
        const chip = missedMsg.querySelector('.copy-chip');
        if (chip) {
          const prev = chip.innerHTML;
          chip.innerHTML = 'Kopyalandı ✅';
          setTimeout(() => { chip.innerHTML = prev; }, 1500);
        }

      } catch (err) {
        console.error('Panoya kopyalama başarısız oldu:', err);
      }
    });

    setTimeout(() => {
      missedMsg.classList.add('message-fade-in');
    }, 50);
  } else {
    // Bugün herkesin okuduğunu kontrol et
    let everyoneReadToday = true;
    users.forEach(user => {
      const todayStat = stats.find(s => s.userId === user._id && s.date === todayStr);
      if (!todayStat || todayStat.status !== 'okudum') {
        everyoneReadToday = false;
      }
    });

    // Sadece gerçekten bugün herkes okumuşsa tebrik mesajı göster
    if (everyoneReadToday) {
      const missedMsg = document.createElement('div');
      missedMsg.className = 'consecutive-missed-message';
      missedMsg.innerHTML = 'Harika! Herkes bugün okumalarını yapmış! 🎉🎉<span class="missed-reminder"><br>Bu güzel alışkanlığı devam ettirelim!</span>';
      
      // Sol alt köşe emoji ekle
      const leftEmoji = document.createElement('div');
      leftEmoji.className = 'left-emoji party-emoji';
      missedMsg.appendChild(leftEmoji);

      // Kopyala yazısı ve emoji ekle
      const copyText = document.createElement('div');
      copyText.className = 'copy-chip';
      copyText.style.cssText = 'position: absolute; bottom: 8px; right: 12px; font-size: 15px; font-weight: bold; background: rgba(255, 255, 255, 0.9); padding: 3px 3px 3px 7px; border-radius: 8px; border: 1px solid rgba(180, 180, 180, 0.8); color: #6e6e6e;';
      copyText.innerHTML = 'Kopyala <span class="copy-emoji">👆</span>';
      missedMsg.appendChild(copyText);
      
      // user-cards-section'ın en başına ekle
      const userCardsSection = document.querySelector('.user-cards-section');
      if (userCardsSection) {
        userCardsSection.insertBefore(missedMsg, userCardsSection.firstChild);
      }
    // Tıklama ile panoya kopyalama ve bildirim
    missedMsg.style.cursor = 'pointer';
    missedMsg.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(missedMsg.innerText);
        const chip = missedMsg.querySelector('.copy-chip');
        if (chip) {
          const prev = chip.innerHTML;
          chip.innerHTML = 'Kopyalandı ✅';
          setTimeout(() => { chip.innerHTML = prev; }, 1500);
        }
      } catch (err) {
        console.error('Panoya kopyalama başarısız oldu:', err);
      }
    });
    setTimeout(() => {
      missedMsg.classList.add('message-fade-in');
    }, 50);
    }
  }
  } catch (error) {
    console.error('Kullanıcı kartları yüklenirken hata oluştu:', error);
  }
}

// Kullanıcı kartlarında okuma durumunu değiştiren fonksiyon
toggleUserCardsReadingStatus = function (userName, day, month, year, clickedElement) {

  if (!LocalStorageManager.isUserLoggedIn()) {
    logUnauthorizedAccess('Kullanıcı kartlarında okuma durumu değiştirme');
    return;
  }

  const userInfo = LocalStorageManager.getCurrentUserInfo();
  if (!userInfo) {
    logUnauthorizedAccess('Kullanıcı kartlarında okuma durumu değiştirme-kullanıcı bulunamadı');
    return;
  }

  // Session kontrolü
  if (window.checkSessionTimeout && window.checkSessionTimeout()) {
    return; // İşlemi durdur
  }

  // Member kullanıcıları sadece kendi verilerini güncelleyebilir
  if (userInfo.userAuthority === 'member') {
    // Member kullanıcılar için kullanıcı adını API'den al
    fetch(`/api/users/${window.groupid}`)
      .then(response => response.json())
      .then(data => {
        const currentUser = data.users.find(u => u._id === userInfo.userId);
        if (!currentUser) {
          logUnauthorizedAccess('Kullanıcı kartlarında okuma durumu değiştirme-kullanıcı bulunamadı');
          return;
        }
        
        if (currentUser.name !== userName) {
          logUnauthorizedAccess('Kullanıcı kartlarında okuma durumu değiştirme-başka kullanıcı');
          return;
        }
        
        // Yetki kontrolü başarılı, işlemi devam ettir
        continueWithToggle();
      })
      .catch(error => {
        console.error('Kullanıcı kartlarında okuma durumu değiştirme-kullanıcı bilgisi alınırken hata:', error);
        return;
      });
    return; // Async işlem başladı, fonksiyondan çık
  }
  
  // Admin kullanıcılar için direkt devam et
  continueWithToggle();
  
  function continueWithToggle() {
    // Tarih formatını yyyy-mm-dd olarak hazırla
    function formatDateForTable(day, month, year) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    const dateStr = formatDateForTable(day, month, year);
    // Haftalık/aylık ile uyumlu: Türkiye saatine göre bugünden sonrası engelli.
    const today = new Date();
    today.setHours(today.getHours() + 3);
    const todayString = today.toISOString().split('T')[0];
    if (dateStr > todayString) {
      return;
    }

    // 1. ÖNCE UI'YI GÜNCELLE (Anında görsel geri bildirim)
    // Mevcut durumu tıklanan elementten tespit et
    const dayCircle = clickedElement.querySelector('.day-circle');
    let currentStatus = '';
    if (dayCircle.classList.contains('ok')) {
      currentStatus = 'okudum';
    } else if (dayCircle.classList.contains('not')) {
      currentStatus = 'okumadım';
    } else {
      currentStatus = '';
    }

    // Yeni durumu hesapla
    let newStatus = '';
    if (currentStatus === '') {
      newStatus = 'okudum';
    } else if (currentStatus === 'okudum') {
      newStatus = 'okumadım';
    } else if (currentStatus === 'okumadım') {
      newStatus = '';
    }

    // UI'ı anında güncelle
    updateDayCircleStatus(clickedElement, newStatus);

    // 2. SONRA VERİTABANINI GÜNCELLE
    let targetUserId = null;
    fetch(`/api/all-data/${window.groupid}`)
      .then(response => response.json())
      .then(data => {
        const user = data.users.find(u => u.name === userName);
        if (!user) throw new Error('Kullanıcı bulunamadı');
        targetUserId = user._id;

        return fetch(`/api/update-status/${window.groupid}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user._id,
            date: dateStr,
            status: newStatus,
            requestingUserId: userInfo.userId,
            requestingUserAuthority: userInfo.userAuthority
          })
        });
      })
      .then(response => {
        if (response && response.ok) {
          // Global store'u da güncelle
          try {
            if (window.globalDataStore && targetUserId) {
              window.globalDataStore.applyLocalUpdate(targetUserId, dateStr, newStatus);
            }
          } catch (e) {
            console.error('Global store senkronizasyon hatası:', e);
          }
          // Veritabanı güncellemesi başarılı olduktan sonra tüm bileşenleri güncelle
          if (window.loadUserCards) window.loadUserCards(); // Kullanıcı kartlarını yeniden render et
          if (window.loadTrackerTable) window.loadTrackerTable();
          if (window.loadReadingStats) window.loadReadingStats();
          if (window.renderLongestSeries) window.renderLongestSeries();
        } else {
          // Veritabanı güncellemesi başarısız olursa UI'ı eski haline döndür
          console.error('Veritabanı güncellemesi başarısız');
          if (window.loadUserCards) window.loadUserCards();
        }
      })
      .catch(error => {
        console.error('Kullanıcı kartlarında okuma durumu değiştirme-okuma durumu değiştirilirken hata oluştu:', error);
        // Hata durumunda UI'ı eski haline döndür
        if (window.loadUserCards) window.loadUserCards();
      });
  }
}

// Day-circle durumunu güncelleme yardımcı fonksiyonu
function updateDayCircleStatus(clickedElement, newStatus) {
  // Tıklanan element içindeki day-circle'ı bul
  const dayCircle = clickedElement.querySelector('.day-circle');
  if (!dayCircle) return;

  // Mevcut sınıfları temizle
  dayCircle.classList.remove('ok', 'not', 'empty');

  // Yeni duruma göre sınıf ekle (CSS'deki sınıf isimlerini kullan)
  if (newStatus === 'okudum') {
    dayCircle.classList.add('ok');
  } else if (newStatus === 'okumadım') {
    dayCircle.classList.add('not');
  } else {
    dayCircle.classList.add('empty');
  }
}
