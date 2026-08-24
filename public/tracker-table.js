const trackerTable = document.getElementById('trackerTable');
const tableArea = document.querySelector('.table-area');
const newUserForm = document.getElementById('newUserForm');
window.newUserForm = newUserForm;
const prevWeekBtn = document.getElementById('prevWeek');
const nextWeekBtn = document.getElementById('nextWeek');
const prevWeekTodayBtn = document.getElementById('prevWeekToday');
const nextWeekTodayBtn = document.getElementById('nextWeekToday');
const currentWeekDisplay = document.getElementById('currentWeekDisplay');
let weekOffset = 0;
// Global erişim için window'a ekle
window.weekOffset = weekOffset;
let isFirstLoad = true;
let postToggleUpdateTimer = null;

// Session kontrolü için değişkenler
let lastSessionCheckTime = 0;
const SESSION_CHECK_DEBOUNCE = 5000; // 5 saniye
const SESSION_TIMEOUT = 20 * 60 * 1000; // 20 dakika (milisaniye)

// Session kontrolü yardımcı fonksiyonu (global erişim için)
window.checkSessionTimeout = function () {
    const now = Date.now();
    // 5 saniye içinde kontrol edilmediyse kontrol et
    if (now - lastSessionCheckTime > SESSION_CHECK_DEBOUNCE) {
        const sessionStartTime = parseInt(localStorage.getItem('pageSessionStartTime') || '0');
        const timeElapsed = now - sessionStartTime;

        if (timeElapsed >= SESSION_TIMEOUT) {
            //15 dakika geçmiş, panel aç
            showSessionTimeoutModal();
            return true; // İşlemi durdur
        }

        lastSessionCheckTime = now;
    }
    return false; // İşleme devam edilebilir
};

// Kullanıcı istatistik alanını güncelle (giriş serisi hesaplaması ile)
async function updateUserStatsAreaWithStreak() {
    const userInfo = LocalStorageManager.getCurrentUserInfo();
    if (!userInfo) return;

    const userId = userInfo.userId;
    const groupId = userInfo.groupId;
    const totalReading = userReadingCounts.get(userId) || 0;

    try {
        // Giriş serisi bilgisini server'dan al
        const response = await fetch('/api/update-login-streak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, groupId })
        });

        if (response.ok) {
            const data = await response.json();
            const loginStreakElement = document.getElementById('userLoginStreak');
            if (loginStreakElement) {
                loginStreakElement.textContent = data.loginStreak || 0;
            }
        }
    } catch (error) {
        console.error('Giriş serisi bilgisi alınamadı:', error);
        // Hata durumunda varsayılan değer
        const loginStreakElement = document.getElementById('userLoginStreak');
        if (loginStreakElement) {
            loginStreakElement.textContent = '0';
        }
    }

    // Sağ kısım: Toplam okuma
    const totalReadingElement = document.getElementById('userTotalReading');
    if (totalReadingElement) {
        totalReadingElement.textContent = totalReading;
    }

    // Orta kısım: Lig bilgisi
    updateLeagueProgress(totalReading);

    // Tüm veriler yüklendikten sonra modülü animasyonlu olarak görünür yap
    const userStatsArea = document.querySelector('.user-stats-info-area');
    if (userStatsArea) {
        userStatsArea.style.display = 'flex';
        // Kısa bir gecikme ile animasyon başlat
        setTimeout(() => {
            userStatsArea.classList.add('show');
        }, 50);
    }
    if (typeof window.showReadingEditModeBar === 'function') {
        window.showReadingEditModeBar();
    }
}

// Kullanıcı istatistik alanını güncelle (sadece okuma sayısı ve lig bilgisi)
function updateUserStatsArea() {
    const userInfo = LocalStorageManager.getCurrentUserInfo();
    if (!userInfo) return;

    const userId = userInfo.userId;
    const totalReading = userReadingCounts.get(userId) || 0;

    // Sağ kısım: Toplam okuma
    const totalReadingElement = document.getElementById('userTotalReading');
    if (totalReadingElement) {
        totalReadingElement.textContent = totalReading;
    }

    // Orta kısım: Lig bilgisi
    updateLeagueProgress(totalReading);
}

let lastUserStatsLeagueMin = null;
let userStatsConfettiObserver = null;

function triggerUserStatsConfetti() {
    const panel = document.querySelector('.user-stats-content');
    if (!panel) return;

    let overlay = panel.querySelector('.confetti-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'confetti-overlay';
        panel.insertBefore(overlay, panel.firstChild);
    }

    overlay.classList.remove('show');
    panel.classList.remove('confetti-triggered');
    void overlay.offsetWidth;

    if (userStatsConfettiObserver) {
        userStatsConfettiObserver.disconnect();
        userStatsConfettiObserver = null;
    }

    const play = function () {
        if (panel.classList.contains('confetti-triggered')) return;
        panel.classList.add('confetti-triggered');
        overlay.classList.add('show');
    };

    userStatsConfettiObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                play();
                if (userStatsConfettiObserver) {
                    userStatsConfettiObserver.disconnect();
                    userStatsConfettiObserver = null;
                }
            }
        });
    }, { threshold: 0.5 });
    userStatsConfettiObserver.observe(panel);
}

// Lig progress bilgilerini güncelle
function updateLeagueProgress(totalReading) {
    // Mevcut ligi bul
    const currentLeague = LEAGUES.find(league => totalReading >= league.min && totalReading < league.max) || LEAGUES[LEAGUES.length - 1];
    const promoted = lastUserStatsLeagueMin != null && currentLeague.min > lastUserStatsLeagueMin;
    lastUserStatsLeagueMin = currentLeague.min;

    // Sonraki ligi bul
    const currentIndex = LEAGUES.indexOf(currentLeague);
    const nextLeague = currentIndex < LEAGUES.length - 1 ? LEAGUES[currentIndex + 1] : currentLeague;

    // Mevcut lig bilgilerini güncelle
    const currentLeagueImg = document.getElementById('currentLeagueImg');
    const currentLeagueName = document.getElementById('currentLeagueName');
    if (currentLeagueImg && currentLeagueName) {
        currentLeagueImg.src = `/images/${currentLeague.img}`;
        currentLeagueName.textContent = currentLeague.name;
    }

    // Sonraki lig bilgilerini güncelle
    const nextLeagueImg = document.getElementById('nextLeagueImg');
    const nextLeagueName = document.getElementById('nextLeagueName');
    if (nextLeagueImg && nextLeagueName) {
        nextLeagueImg.src = `/images/${nextLeague.img}`;
        nextLeagueName.textContent = nextLeague.name;
    }

    // Progress bar'ı güncelle
    const progressText = document.getElementById('leagueProgressText');
    const progressFill = document.getElementById('leagueProgressFill');
    const progressStatus = document.getElementById('leagueProgressStatus');

    if (progressText && progressFill && progressStatus) {
        const progress = totalReading - currentLeague.min;
        const totalNeeded = currentLeague.max - currentLeague.min;
        const percentage = Math.min((progress / totalNeeded) * 100, 100);
        const remaining = totalNeeded - progress;

        // Üst kısım: "197 / 200⭐" formatı, renkli
        progressText.innerHTML = `<span style="font-weight: 700; ">${totalReading}</span><span style="font-weight: 500;">/${currentLeague.max}</span> <span style="text-shadow: 0 0 1px #f55,0 0 1px #ff4500;">⭐</span>`;

        // Alt kısım: "Mercan ligine 3 okuma kaldı" formatı
        if (remaining > 0) {
            progressStatus.innerHTML = `${nextLeague.name} ligine <span style="font-weight:bold;">${remaining}</span> okuma kaldı`;
        } else {
            progressStatus.innerHTML = `<span style="font-size:14px;font-weight:bold;">${nextLeague.name} ligindesiniz!</span>`;
        }
        // Progress bar'ı animasyonlu olarak doldur
        setTimeout(() => {
            progressFill.style.width = `${percentage}%`;
        }, 100); // Kısa bir gecikme ile animasyon başlat
    }

    if (promoted) {
        triggerUserStatsConfetti();
    }
}

// Kullanıcı okuma sayılarını önbelleğe almak için
let userReadingCounts = new Map(); // userId -> okuma sayısı

// Kullanıcı serilerini önbelleğe almak için
let userStatsCache = new Map(); // userId -> { days: [], lastUpdated: timestamp }

// Cache yönetimi fonksiyonları
function updateUserStatsCache(userId, date, status) {
    if (!userStatsCache.has(userId)) {
        userStatsCache.set(userId, { days: [], lastUpdated: Date.now() });
    }

    const cache = userStatsCache.get(userId);
    const existingIndex = cache.days.findIndex(day => day.date === date);

    if (status) {
        if (existingIndex >= 0) {
            cache.days[existingIndex].status = status;
        } else {
            cache.days.push({ date, status });
        }
    } else {
        if (existingIndex >= 0) {
            cache.days.splice(existingIndex, 1);
        }
    }

    cache.lastUpdated = Date.now();
}

function getUserStatsFromCache(userId) {
    const cache = userStatsCache.get(userId);
    if (!cache) return {};

    const statsMap = {};
    cache.days.forEach(day => {
        statsMap[day.date] = day.status;
    });
    return statsMap;
}

function calculateStreakFromCache(userId) {
    const userStats = getUserStatsFromCache(userId);
    return calculateStreak(userStats);
}

// Lig tanımları - global erişilebilir
const LEAGUES = [
    { min: 0, max: 5, name: 'Bronz', img: 'bronz.webp', bg: 'linear-gradient(90deg, #e2b07a 60%, #ffe0b2 100%)' },
    { min: 5, max: 10, name: 'Gümüş', img: 'gumus.webp', bg: 'linear-gradient(90deg, #d3d3d3 60%, #e0e0e0 100%)' },
    { min: 10, max: 20, name: 'Altın', img: 'altin.webp', bg: 'linear-gradient(90deg, #ffd700 60%, #ffe789 100%)' },
    { min: 20, max: 40, name: 'İnci', img: 'inci.webp', bg: 'linear-gradient(90deg, #b2dfdb 60%, #c8eef3 100%)' },
    { min: 40, max: 60, name: 'Safir', img: 'safir.webp', bg: 'linear-gradient(90deg, #49b7ff 60%, #bbdefb 100%)' },
    { min: 60, max: 100, name: 'Zümrüt', img: 'zumrut.webp', bg: 'linear-gradient(90deg, #58c089 60%, #a5d6a7 100%)' },
    { min: 100, max: 150, name: 'Elmas', img: 'elmas.webp', bg: 'linear-gradient(90deg, #36e873 60%, #c4edb8 100%)' },
    { min: 150, max: 200, name: 'Yakut', img: 'yakut.webp', bg: 'linear-gradient(90deg, #ffb199 60%, #ffe0b2 100%)' },
    { min: 200, max: 365, name: 'Mercan', img: 'mercan.webp', bg: 'linear-gradient(90deg, #ff6f63 60%, #ffafb7 100%)' },
    { min: 365, max: 1001, name: 'Pırlanta', img: 'pirlanta.webp', bg: 'linear-gradient(90deg, #ffbf00 60%, #ffe789 100%)' }
];

function getWeekDates(offset = 0) {
    const today = new Date();
    const dayOfWeek = today.getDay();

    let actualFirstDay;
    if (firstDayOfWeek === 'default') {
        // Varsayılan: Bugünden sonraki gün haftanın ilk günü olsun
        // JavaScript'te 0=Pazar, 1=Pazartesi... bizim sistemde 0=Pazar, 1=Pazartesi...
        actualFirstDay = (dayOfWeek + 1) % 7;
    } else {
        // Özel gün seçildiğinde direkt kullan (0=Pazar, 1=Pazartesi, 2=Salı...)
        actualFirstDay = firstDayOfWeek;
    }

    let daysToFirstDay;
    if (dayOfWeek >= actualFirstDay) {
        daysToFirstDay = dayOfWeek - actualFirstDay;
    } else {
        daysToFirstDay = 7 - (actualFirstDay - dayOfWeek);
    }
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - daysToFirstDay);
    currentWeekStart.setDate(currentWeekStart.getDate() + (offset * 7));
    const dates = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(currentWeekStart);
        d.setDate(currentWeekStart.getDate() + i);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        dates.push(`${year}-${month}-${day}`);
    }
    return dates;
}

function getWeekSeasonKey(dates) {
    if (!dates || !dates.length) {
        const n = new Date();
        return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0');
    }
    const lastDate = String(dates[dates.length - 1]);
    const ym = lastDate.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(ym)) return ym;
    const n = new Date();
    return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0');
}

function getWeekSeasonLabel(dates) {
    const months = [
        'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
        'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
    ];
    const seasonMonth = parseInt(getWeekSeasonKey(dates).slice(5, 7), 10);
    if (!(seasonMonth >= 1 && seasonMonth <= 12)) {
        return `${months[new Date().getMonth()]} Sezonu`;
    }
    return `${months[seasonMonth - 1]} Sezonu`;
}

function isMonthBoundaryColumn(dates, index) {
    if (!dates || index < 1) return false;
    const prev = String(dates[index - 1] || '').slice(0, 7);
    const cur = String(dates[index] || '').slice(0, 7);
    return prev !== cur && /^\d{4}-\d{2}$/.test(prev) && /^\d{4}-\d{2}$/.test(cur);
}

// Yükleme overlay'i kaldırıldı

function formatDateRange(dates) {
    if (!dates || dates.length < 7) return '';
    const startDate = new Date(dates[0]);
    const endDate = new Date(dates[6]);
    const months = [
        'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
        'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
    ];
    const startDay = startDate.getDate();
    const endDay = endDate.getDate();
    const startMonth = months[startDate.getMonth()];
    const endMonth = months[endDate.getMonth()];
    if (startMonth === endMonth) {
        return `${startDay} - ${endDay} ${startMonth}`;
    } else {
        return `${startDay} ${startMonth} - ${endDay} ${endMonth}`;
    }
}

function formatDateForHeader(date) {
    const day = date.getDate();
    const month = getMonthNameInTurkish(date.getMonth());
    return `<span class="date-day">${day}</span> <span class="date-month">${month}</span>`;
}

function getMonthNameInTurkish(monthIndex) {
    const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haz',
        'Tem', 'Ağu', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    return months[monthIndex];
}

/** Haftalık tablo: yalnızca işaretli günler (okudum + okumadım) */
function computeWeekMarkedReadStats(users, statMap, dates) {
    let okudum = 0;
    let marked = 0;
    for (const user of users) {
        const userStats = statMap[user._id] || {};
        for (const d of dates) {
            const st = userStats[d];
            if (st === 'okudum') {
                okudum += 1;
                marked += 1;
            } else if (st === 'okumadım') {
                marked += 1;
            }
        }
    }
    return { okudum, marked };
}

function formatWeekReadSuccessText(okudum, marked) {
    if (!marked) return '%0';
    const pct = Math.round((okudum / marked) * 100);
    return `%${pct}`;
}

function parseFiniteAmount(value) {
    if (value == null || value === '') return null;
    const n = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}

function sumUserAmounts(statsArray, userId, seasonKey) {
    const uid = String(userId);
    let sum = 0;
    for (const s of statsArray) {
        if (String(s.userId) !== uid) continue;
        if (seasonKey && String(s.date || '').slice(0, 7) !== seasonKey) continue;
        const a = parseFiniteAmount(s.amount);
        if (a != null) sum += a;
    }
    return sum;
}

function formatUserItemMeta(leagueName, amountSum) {
    const name = leagueName || '';
    if (!(amountSum > 0)) return name;
    return `${name} · ${amountSum} ✔`;
}

function formatOkudumCellSymbol(amount) {
    const a = parseFiniteAmount(amount);
    return a != null ? `${a} ✔` : '✔';
}

function cellTextIsOkudum(text) {
    const t = String(text || '').trim();
    return (
        t === '✔' ||
        t === '…' ||
        t === '...' ||
        /\d+\s*✔$/.test(t) ||
        /\d+\s*(?:\.{3}|…)$/.test(t) ||
        t.endsWith('✔')
    );
}

function cellTextIsOkumadim(text) {
    return String(text || '').trim() === '✖';
}

function cellTextIsEmpty(text) {
    return String(text || '').trim() === '➖';
}

function computeWeekMarkedReadFromTable() {
    const dates = getWeekDates(weekOffset);
    const tbody = trackerTable && trackerTable.querySelector('tbody');
    if (!tbody) return { okudum: 0, marked: 0 };

    let okudum = 0;
    let marked = 0;
    tbody.querySelectorAll('tr.user-row').forEach(function (row) {
        const cells = row.querySelectorAll('td[onclick*="toggleStatus"]');
        cells.forEach(function (cell, index) {
            if (index >= dates.length) return;
            const symbol = (cell.textContent || '').trim();
            if (cellTextIsOkudum(symbol)) {
                okudum += 1;
                marked += 1;
            } else if (cellTextIsOkumadim(symbol)) {
                marked += 1;
            }
        });
    });
    return { okudum, marked };
}

async function loadTrackerTable() {
    console.log('🔍 Tracker Table Loading...');

    // Tablo yüklenirken kaydırma çubuğunu gizle
    if (tableArea) {
        tableArea.style.overflowX = 'hidden';
        tableArea.style.overflowY = 'hidden';
    }

    const dates = getWeekDates(weekOffset);
    currentWeekDisplay.textContent = formatDateRange(dates);
    if (weekOffset < 0) {
        prevWeekTodayBtn.style.display = 'none';
        nextWeekTodayBtn.style.display = 'flex';
    } else if (weekOffset > 0) {
        prevWeekTodayBtn.style.display = 'flex';
        nextWeekTodayBtn.style.display = 'none';
    } else {
        prevWeekTodayBtn.style.display = 'none';
        nextWeekTodayBtn.style.display = 'none';
    }
    const data = window.globalDataStore ? window.globalDataStore.getAllData() : { users: [], stats: [] };
    const { users, stats } = data;

    // stats'in iterable olduğundan emin ol
    const statsArray = Array.isArray(stats) ? stats : [];
    const statMap = {};
    const amountMap = {};
    for (let s of statsArray) {
        if (!statMap[s.userId]) statMap[s.userId] = {};
        if (!amountMap[s.userId]) amountMap[s.userId] = {};
        statMap[s.userId][s.date] = s.status;
        const amt = parseFiniteAmount(s.amount);
        if (amt != null) amountMap[s.userId][s.date] = amt;
    }

    // Kullanıcı okuma sayılarını hesapla ve önbelleğe al
    userReadingCounts.clear();
    userStatsCache.clear(); // Cache'i temizle

    for (let user of users) {
        const userStats = statMap[user._id] || {};
        const okudumDays = Object.values(userStats).filter(s => s === 'okudum').length;
        userReadingCounts.set(user._id, okudumDays);

        // Cache'i doldur
        const cacheData = { days: [], lastUpdated: Date.now() };
        for (const [date, status] of Object.entries(userStats)) {
            cacheData.days.push({ date, status });
        }
        userStatsCache.set(user._id, cacheData);
    }
    // Her tarih için okuyan sayısını hesapla
    const dateCounts = {};
    for (let d of dates) {
        let readCount = 0;
        for (let user of users) {
            const st = (statMap[user._id] || {})[d];
            if (st === 'okudum') readCount++;
        }
        dateCounts[d] = { readCount };
    }

    const totalUsers = users.length;
    const seasonKey = getWeekSeasonKey(dates);
    const seasonLabel = getWeekSeasonLabel(dates);
    const seasonParts = seasonLabel.split(' ');
    const seasonHtml = seasonParts.length >= 2
        ? `<span class="col-season-month">${seasonParts[0]}</span><br><span class="col-season-suffix">${seasonParts.slice(1).join(' ')}</span>`
        : seasonLabel;
    let theadHTML = `<tr><th class="col-season">${seasonHtml}</th>`;
    const today = new Date();
    // UTC+3 saat dilimi ekle (Türkiye saati)
    today.setHours(today.getHours() + 3);
    const todayString = today.toISOString().split('T')[0];
    for (let i = 0; i < dates.length; i++) {
        const d = dates[i];
        const date = new Date(d);
        const dayOfWeek = getDayOfWeekInTurkish(date);
        const isToday = d === todayString;
        const classNames = [];
        if (isToday) classNames.push('today-column');
        if (isMonthBoundaryColumn(dates, i)) classNames.push('month-start');
        const displayText = isToday ? 'Bugün' : formatDateForHeader(date);
        theadHTML += `<th class="${classNames.join(' ')}"><span class="date-text">${displayText}</span><br><span class="day-of-week">${dayOfWeek}</span></th>`;
    }
    theadHTML += `<th class="col-total-amount">Toplam<br>Okuma</th>`;
    theadHTML += `<th>Okuma<br>Serisi</th></tr>`;
    let statsRowHTML = `<tr class="stats-footer-row"><th class="stats-footer-label" scope="col"><span class="col-user-count">${totalUsers} kişi</span></th>`;
    for (let i = 0; i < dates.length; i++) {
        const d = dates[i];
        const { readCount } = dateCounts[d];
        const isToday = d === todayString;
        const todayClass = isToday ? ' today-column' : '';
        const monthStartClass = isMonthBoundaryColumn(dates, i) ? ' month-start' : '';
        statsRowHTML += `<th class="stats-footer-cell${todayClass}${monthStartClass}" scope="col">`
            + `<span class="col-counts" data-date="${d}">`
            + `<span class="col-read">${readCount}✔</span>`
            + `</span></th>`;
    }
    let grandAmountTotal = 0;
    for (let user of users) {
        grandAmountTotal += sumUserAmounts(statsArray, user._id, seasonKey);
    }
    const weekReadStats = computeWeekMarkedReadStats(users, statMap, dates);
    const weekReadSuccessText = formatWeekReadSuccessText(
        weekReadStats.okudum,
        weekReadStats.marked
    );
    statsRowHTML += `<th class="stats-footer-cell stats-footer-amount" scope="col" title="Bu sezondaki tüm kullanıcıların okuma toplamı">`
        + `<span class="col-counts" id="stats-footer-amount-counts">`
        + `<span class="col-read" id="tfoot-total-amount">${grandAmountTotal} ✔</span>`
        + `</span></th>`;
    statsRowHTML += `<th class="stats-footer-cell stats-footer-total" scope="col" title="Haftalık okuma başarı oranı (okundu / işaretli gün)">`
        + `<span class="col-counts" id="stats-footer-total-counts">`
        + `<span class="col-read" id="tfoot-total-read">${weekReadSuccessText}</span>`
        + `</span></th></tr>`;
    const oldTfoot = trackerTable.querySelector('tfoot');
    if (oldTfoot) oldTfoot.remove();
    trackerTable.querySelector('thead').innerHTML = theadHTML + statsRowHTML;
    let tbodyHTML = '';
    for (let user of users) {
        const userStats = statMap[user._id] || {};
        // Lig ve arka planı belirle (önbellekten al)
        const okudumDays = userReadingCounts.get(user._id) || 0;
        const league = LEAGUES.find(l => okudumDays >= l.min && okudumDays < l.max) || LEAGUES[LEAGUES.length - 1];
        // Giriş yapılan kullanıcı için özel class ekle
        const currentUserInfo = LocalStorageManager.getCurrentUserInfo();
        const isCurrentUser = currentUserInfo && currentUserInfo.userId === user._id;
        const currentUserClass = isCurrentUser ? ' current-user-row' : '';

        const userSeasonAmount = sumUserAmounts(statsArray, user._id, seasonKey);
        const userAllTimeAmount = sumUserAmounts(statsArray, user._id);
        let row = `<tr class="user-row${currentUserClass}"><td class="user-item" data-user-id="${user._id}" style="background: ${league.bg};">`;
        const profileImage = user.profileImage || '/images/default.png';
        row += `<img src="${profileImage}" alt="${user.name}" class="tracker-profile-image tracker-profile-image-loading" onload="this.classList.remove('tracker-profile-image-loading')" onerror="this.classList.remove('tracker-profile-image-loading'); this.src='/images/default.png'" />`;
        row += `<span class="user-item-text"><span class="user-item-name">${user.name}</span>`;
        row += `<span class="user-item-meta" data-user-meta="${user._id}" data-amount="${userAllTimeAmount}">${formatUserItemMeta(league.name, userAllTimeAmount)}</span></span></td>`;
        for (let dateIndex = 0; dateIndex < dates.length; dateIndex++) {
            const date = dates[dateIndex];
            const status = userStats[date] || '';
            const dayAmount = (amountMap[user._id] || {})[date];
            let symbol = '➖';
            if (status === 'okudum') symbol = formatOkudumCellSymbol(dayAmount);
            else if (status === 'okumadım') symbol = '✖';
            let className = '';

            // Bugünden sonraki tarihler için • ikonu ve disabled sınıfı
            const currentDate = new Date();
            // UTC+3 saat dilimi ekle (Türkiye saati)
            currentDate.setHours(currentDate.getHours() + 3);
            const todayString = currentDate.toISOString().split('T')[0];
            const isFutureDate = date > todayString;

            if (isFutureDate) {
                symbol = '•';
                className += ' future-date';
            }
            if (status === 'okudum') {
                className = 'green';
            } else if (status === 'okumadım') {
                className = 'red';
            } else if (!isFutureDate) {
                // Bugün ve öncesi için boş hücreler empty sınıfına sahip olsun
                className += ' empty';
            }
            if (date === todayString) {
                className += ' today-column';
            }
            if (isMonthBoundaryColumn(dates, dateIndex)) {
                className += ' month-start';
            }
            const onclickAttr = isFutureDate ? '' : `onclick="toggleStatus('${user._id}', '${date}')"`;
            row += `<td class="${className}" ${onclickAttr}>${symbol}</td>`;
        }
        row += `<td class="col-total-amount" data-user-amount="${user._id}">${userSeasonAmount > 0 ? `${userSeasonAmount} ✔` : '-'}</td>`;
        const streak = calculateStreak(userStats);
        row += `<td>${streak > 0 ? `<span class="weekly-fire-emoji">⭐</span> ${streak}` : '-'}</td>`;
        row += `</tr>`;
        tbodyHTML += row;
    }
    trackerTable.querySelector('tbody').innerHTML = tbodyHTML;

    // Kullanıcıya tıklanınca ilgili kartı göster ve scroll et
    trackerTable.querySelectorAll('.user-item').forEach(item => {
        item.addEventListener('click', function () {
            const userId = this.getAttribute('data-user-id');
            // Kartlar görünür değilse önce göster
            const cardsContainer = document.querySelector('.user-cards-container');
            if (cardsContainer && cardsContainer.style.display === 'none') {
                cardsContainer.style.display = 'flex';
                // Kartlar yüklenmemişse yükle
                if (typeof window.loadUserCards === 'function') {
                    window.loadUserCards();
                }
            }
            // Biraz gecikmeli scroll (kartlar yükleniyorsa)
            const card = document.querySelector(`.user-card[data-user-id="${userId}"]`);
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Kartı vurgula (isteğe bağlı)
                card.classList.add('highlight-card');
                setTimeout(() => card.classList.remove('highlight-card'), 1200);
            }
        });
    });
    const weekNav = document.querySelector('.week-navigation');
    if (weekNav) {
        weekNav.style.display = 'flex';
        // Week navigation animasyonunu tetikle
        setTimeout(() => {
            weekNav.classList.add('visible');
        }, 50);
    }
    // Tüm tablo elementlerini gizle
    trackerTable.classList.remove('visible');
    trackerTable.querySelector('tbody').classList.remove('tracker-table-visible');

    setTimeout(() => {
        // Tüm tablo elementlerini aynı anda göster
        trackerTable.classList.add('visible');
        trackerTable.querySelector('tbody').classList.add('tracker-table-visible');

        // Sadece ilk yüklemede sayfanın en üstüne kaydır
        if (isFirstLoad) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            isFirstLoad = false;
        }
    }, 20);

    // Kullanıcı istatistik alanını güncelle (giriş serisi hesaplaması ile)
    updateUserStatsAreaWithStreak().catch(error => {
        console.error('Kullanıcı istatistik alanı güncellenemedi:', error);
    });

    tableArea.style.display = 'block';
}

prevWeekBtn.addEventListener('click', () => {
    weekOffset--;
    window.weekOffset = weekOffset; // Global güncelle
    loadTrackerTable();
    loadUserCards();
});

nextWeekBtn.addEventListener('click', () => {
    weekOffset++;
    window.weekOffset = weekOffset; // Global güncelle
    loadTrackerTable();
    loadUserCards();
});

prevWeekTodayBtn.addEventListener('click', () => {
    weekOffset = 0;
    window.weekOffset = weekOffset; // Global güncelle
    loadTrackerTable();
    loadUserCards();
});

nextWeekTodayBtn.addEventListener('click', () => {
    weekOffset = 0;
    window.weekOffset = weekOffset; // Global güncelle
    loadTrackerTable();
    loadUserCards();
});

function calculateStreak(userStats) {
    const allDates = Object.keys(userStats).sort();
    if (allDates.length === 0) return 0;
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayKey = `${year}-${month}-${day}`;
    const todayStatus = userStats[todayKey];
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
        if (userStats[currentDate] === 'okudum') {
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

function schedulePostToggleUiRefresh() {
    try {
        if (postToggleUpdateTimer) {
            clearTimeout(postToggleUpdateTimer);
        }
        postToggleUpdateTimer = setTimeout(function () {
            try {
                updateAllUserBackgroundColors();

                if (typeof window.loadUserCards === 'function') {
                    window.loadUserCards();
                }
                if (typeof window.loadReadingStats === 'function') {
                    window.loadReadingStats();
                }
                if (typeof window.renderLongestSeries === 'function') {
                    window.renderLongestSeries();
                }
                if (typeof window.loadMonthlyCalendar === 'function') {
                    window.loadMonthlyCalendar();
                }
            } catch (err) {
                console.error('Gecikmeli güncelleme hatası:', err);
            }
        }, 1000);
    } catch (err) {
        console.error('Debounce ayarlanamadı:', err);
    }
}
window.schedulePostToggleUiRefresh = schedulePostToggleUiRefresh;

window.toggleStatus = async function toggleStatus(userId, date) {
    if (!LocalStorageManager.isUserLoggedIn()) {
        logUnauthorizedAccess('Haftalık tabloya tıklama');
        return;
    }

    const editMode = typeof window.getReadingEditMode === 'function'
        ? window.getReadingEditMode()
        : 'none';

    if (editMode === 'none') {
        if (typeof window.promptReadingEditMode === 'function') {
            window.promptReadingEditMode();
        }
        return;
    }

    const userInfo = LocalStorageManager.getCurrentUserInfo();
    if (!userInfo) {
        return;
    }

    // Member kullanıcıları sadece kendi verilerini güncelleyebilir
    if (userInfo.userAuthority === 'member' && userInfo.userId !== userId) {
        return;
    }

    // Session kontrolü
    if (window.checkSessionTimeout && window.checkSessionTimeout()) {
        return; // İşlemi durdur
    }
    const cell = event.target.closest('td') || event.target;

    if (editMode === 'amount') {
        if (typeof window.beginAmountCellEdit === 'function') {
            window.beginAmountCellEdit(userId, date, cell);
        }
        return;
    }

    if (editMode !== 'status') {
        return;
    }

    const current = (cell.innerText || '').trim();
    let status;
    let newSymbol;

    // Tüm günler için sıra: boş → okudum → okumadım → boş
    // amount’lu hücreler "10 ✔" biçiminde olabilir
    if (cellTextIsEmpty(current)) {
        status = 'okudum';
        newSymbol = '✔';
        // Sadece kendi hücremize tıkladığımızda user stats'e yıldız gönder
        if (userInfo.userId === userId) {
            animateStarToUserStats(cell);
        }
    } else if (cellTextIsOkudum(current)) {
        status = 'okumadım';
        newSymbol = '✖';
    } else if (cellTextIsOkumadim(current)) {
        status = '';
        newSymbol = '➖';
    } else {
        return;
    }

    // Hücre ikonunu güncelle
    cell.innerText = newSymbol;

    // Cache'i güncelle
    updateUserStatsCache(userId, date, status);

    // Sütun başlığındaki sayaçları güncelle
    updateDateColumnCounts(date, current, status);

    // Tüm satırdaki hücrelerin renklerini yeniden hesapla
    const rowEl = cell.closest('tr');

    if (rowEl) {
        const dateCells = rowEl.querySelectorAll('td[onclick*="toggleStatus"]');
        const dates = getWeekDates(weekOffset);

        // Cache'den güncel verileri al
        const userStatsMap = getUserStatsFromCache(userId);

        // Her hücrenin rengini güncelle
        dateCells.forEach((dateCell, index) => {
            const cellDate = dates[index];
            const cellStatus = userStatsMap[cellDate];

            // Eski sınıfları temizle
            dateCell.classList.remove('green', 'pink', 'lila', 'red', 'empty');

            // Yeni sınıfı belirle
            if (cellStatus === 'okudum') {
                dateCell.classList.add('green');
            } else if (cellStatus === 'okumadım') {
                dateCell.classList.add('red');
            } else {
                // Boş hücreler için empty sınıfı
                dateCell.classList.add('empty');
            }

            // Bugün sınıfını koru
            const today = new Date();
            // UTC+3 saat dilimi ekle (Türkiye saati)
            today.setHours(today.getHours() + 3);
            const todayString = today.toISOString().split('T')[0];
            if (cellDate === todayString) {
                dateCell.classList.add('today-column');
            }
        });
    }

    // Önbellekteki okuma sayısını güncelle
    const currentCount = userReadingCounts.get(userId) || 0;
    let newCount = currentCount;

    if (cellTextIsEmpty(current) && status === 'okudum') {
        // Boş -> Okudum: +1
        newCount = currentCount + 1;
    } else if (cellTextIsOkudum(current) && status === 'okumadım') {
        // Okudum -> Okumadım: -1
        newCount = Math.max(0, currentCount - 1);
    } else if (cellTextIsOkumadim(current) && status === '') {
        // Okumadım -> Boş: değişiklik yok
        newCount = currentCount;
    }

    // Kullanıcının serisini cache'den hesapla (veritabanına gitmeden)
    try {
        const rowEl = cell.closest('tr');
        if (rowEl) {
            // Cache'den güncel seriyi hesapla
            const newStreak = calculateStreakFromCache(userId);
            const lastTd = rowEl.querySelector('td:last-child');
            if (lastTd) {
                // Eski seri sayısını al
                const oldStreakText = lastTd.textContent || lastTd.innerText;
                const oldStreak = oldStreakText === '-' ? 0 : parseInt(oldStreakText.replace('⭐', '').trim()) || 0;

                // Yeni seri sayısını ayarla
                lastTd.innerHTML = newStreak > 0 ? `<span class="weekly-fire-emoji">⭐</span> ${newStreak}` : '-';

                // Seri artışı varsa animasyon ekle
                if (newStreak > oldStreak && newStreak > 0) {
                    animateStreakIncrease(lastTd, oldStreak, newStreak, cell);
                }
            }
        }
    } catch (e) {
        console.error('Seri güncellenemedi:', e);
    }


    userReadingCounts.set(userId, newCount);

    // Global store'u senkronize et
    try {
        if (window.globalDataStore) {
            window.globalDataStore.applyLocalUpdate(userId, date, status);
        }
    } catch (e) {
        console.error('Global store güncellenemedi:', e);
    }

    // Satır / footer Toplam Okuma (amount manuel tıklamada kalkar)
    refreshAmountTotalsInTable();

    schedulePostToggleUiRefresh();

    // Veri tabanı güncellemesini hemen yap
    await fetch(`/api/update-status/${window.groupid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId,
            date,
            status,
            requestingUserId: userInfo.userId,
            requestingUserAuthority: userInfo.userAuthority
        })
    });

    // Kullanıcı istatistik alanını güncelle (sadece okuma sayısı ve lig bilgisi)
    updateUserStatsArea();
}

// thead altındaki istatistik satırındaki tarih sütunu sayaçlarını anlık güncelle
function updateDateColumnCounts(date, prevSymbol, newStatus) {
    try {
        const statsRow = trackerTable.querySelector('thead .stats-footer-row');
        if (!statsRow) return;
        const countsEl = statsRow.querySelector(`.col-counts[data-date="${date}"]`);
        if (!countsEl) return;

        const readEl = countsEl.querySelector('.col-read');
        if (!readEl) return;

        let readCount = parseInt(readEl.textContent, 10) || 0;

        // Önceki durumu çıkar (amount’lu "10 ✔" dahil)
        if (cellTextIsOkudum(prevSymbol)) readCount = Math.max(0, readCount - 1);

        // Yeni durumu ekle
        if (newStatus === 'okudum') readCount++;

        readEl.textContent = readCount + '✔';

        // Haftalık okuma başarı oranını güncelle (okundu / işaretli gün)
        const totalReadEl = document.getElementById('tfoot-total-read');
        if (totalReadEl) {
            const weekStats = computeWeekMarkedReadFromTable();
            totalReadEl.textContent = formatWeekReadSuccessText(
                weekStats.okudum,
                weekStats.marked
            );
        }
    } catch (e) {
        console.error('Sütun sayaçları güncellenemedi:', e);
    }
}

/** Manuel tıklama sonrası Toplam Okuma satır/footer değerlerini store’dan yenile */
function refreshAmountTotalsInTable() {
    try {
        const data = window.globalDataStore ? window.globalDataStore.getAllData() : { users: [], stats: [] };
        const statsArray = Array.isArray(data.stats) ? data.stats : [];
        const users = Array.isArray(data.users) ? data.users : [];
        const seasonKey = getWeekSeasonKey(getWeekDates(weekOffset || 0));

        let grand = 0;
        users.forEach(function (user) {
            const seasonSum = sumUserAmounts(statsArray, user._id, seasonKey);
            const allTimeSum = sumUserAmounts(statsArray, user._id);
            grand += seasonSum;
            const cell = trackerTable.querySelector(`td.col-total-amount[data-user-amount="${user._id}"]`);
            if (cell) {
                cell.textContent = seasonSum > 0 ? `${seasonSum} ✔` : '-';
            }
            const okudumDays = userReadingCounts.get(user._id) || 0;
            const league = LEAGUES.find(l => okudumDays >= l.min && okudumDays < l.max) || LEAGUES[LEAGUES.length - 1];
            const meta = trackerTable.querySelector(`.user-item-meta[data-user-meta="${user._id}"]`);
            if (meta) {
                meta.textContent = formatUserItemMeta(league.name, allTimeSum);
                meta.setAttribute('data-amount', String(allTimeSum || 0));
            }
        });

        const footerAmount = document.getElementById('tfoot-total-amount');
        if (footerAmount) {
            footerAmount.textContent = `${grand} ✔`;
        }
    } catch (e) {
        console.error('Toplam Okuma güncellenemedi:', e);
    }
}

// Tüm kullanıcıların background rengini güncelle (önbellekten)
function updateAllUserBackgroundColors() {
    try {
        userReadingCounts.forEach((okudumDays, userId) => {
            // Lig hesapla
            const league = LEAGUES.find(l => okudumDays >= l.min && okudumDays < l.max) || LEAGUES[LEAGUES.length - 1];

            // Kullanıcının user-item elementini bul ve background rengini güncelle
            const userItem = document.querySelector(`[data-user-id="${userId}"]`);
            if (userItem) {
                userItem.style.background = league.bg;
                const meta = userItem.querySelector('.user-item-meta');
                if (meta) {
                    const amountSum = Number(meta.getAttribute('data-amount')) || 0;
                    meta.textContent = formatUserItemMeta(league.name, amountSum);
                }
            }
        });
    } catch (error) {
        console.error('Kullanıcı background renkleri güncellenemedi:', error);
    }
}

// Kullanıcının background rengini güncelle (eski fonksiyon - geriye uyumluluk için)
window.updateUserBackgroundColor = async function updateUserBackgroundColor(userId) {
    try {
        // Kullanıcının güncel istatistiklerini al
        const response = await fetch(`/api/user-stats/${window.groupid}/${userId}`);
        if (!response.ok) return;
        const { stats } = await response.json();

        // Okuma günlerini hesapla
        const okudumDays = stats.filter(s => s.status === 'okudum').length;
        // Lig hesapla
        const league = LEAGUES.find(l => okudumDays >= l.min && okudumDays < l.max) || LEAGUES[LEAGUES.length - 1];

        // Kullanıcının user-item elementini bul ve background rengini güncelle
        const userItem = document.querySelector(`[data-user-id="${userId}"]`);
        if (userItem) {
            userItem.style.background = league.bg;
            const meta = userItem.querySelector('.user-item-meta');
            if (meta) {
                const amountSum = Number(meta.getAttribute('data-amount')) || 0;
                meta.textContent = formatUserItemMeta(league.name, amountSum);
            }
        }
    } catch (error) {
        console.error('Kullanıcı background rengi güncellenemedi:', error);
    }
}

function spawnPlusFloat(target, delta) {
    if (!target) return;
    const n = Number(delta);
    if (!(Number.isFinite(n) && n > 0)) return;

    const rect = target.getBoundingClientRect();
    const floatEl = document.createElement('div');
    floatEl.className = 'okudum-float-plus';
    floatEl.textContent = '+' + n;
    floatEl.style.left = (rect.left + rect.width / 2) + 'px';
    floatEl.style.top = (rect.top + rect.height / 2) + 'px';
    document.body.appendChild(floatEl);
    const removeFloat = function () {
        if (floatEl.parentNode) floatEl.parentNode.removeChild(floatEl);
    };
    floatEl.addEventListener('animationend', removeFloat);
    setTimeout(removeFloat, 1000);
}

function celebrateOkudumCell(cell, options) {
    if (!cell) return;
    const amountDelta = Number((options || {}).amountDelta);
    if (!(Number.isFinite(amountDelta) && amountDelta > 0)) return;

    const row = cell.closest('tr');
    const target = (row && row.querySelector('td.col-total-amount')) || cell;
    spawnPlusFloat(target, amountDelta);
}
window.celebrateOkudumCell = celebrateOkudumCell;

// User stats reading icon'a yıldız animasyonu
function animateStarToUserStats(clickedCell) {
    // Tıklanan hücrenin pozisyonunu al
    const clickedRect = clickedCell.getBoundingClientRect();

    // User stats reading icon'u bul
    const userStatsReadingIcon = document.querySelector('.user-stats-reading-icon');
    if (!userStatsReadingIcon) return;

    const targetRect = userStatsReadingIcon.getBoundingClientRect();

    // Geçici yıldız elementi oluştur
    const flyingStar = document.createElement('div');
    flyingStar.innerHTML = '⭐';
    flyingStar.style.position = 'fixed';
    flyingStar.style.left = (clickedRect.left + clickedRect.width / 2 - 16) + 'px';
    flyingStar.style.top = (clickedRect.top + clickedRect.height / 2 - 16) + 'px';
    flyingStar.style.fontSize = '32px';
    flyingStar.style.zIndex = '9999';
    flyingStar.style.pointerEvents = 'none';
    flyingStar.style.transition = 'all 0.8s ease-out';
    flyingStar.style.transform = 'scale(0.6)';

    document.body.appendChild(flyingStar);

    // Yıldızı hedefe hareket ettir
    setTimeout(() => {
        flyingStar.style.left = (targetRect.left + targetRect.width / 2 - 20) + 'px';
        flyingStar.style.top = (targetRect.top + targetRect.height / 2 - 20) + 'px';
        flyingStar.style.transform = 'scale(1)';
    }, 50);

    // Hedefe ulaştığında reading icon'u animasyonla
    setTimeout(() => {
        userStatsReadingIcon.classList.add('userStatsReadingPulse');
        setTimeout(() => {
            userStatsReadingIcon.classList.remove('userStatsReadingPulse');
        }, 600);

        // Uçan yıldızı kaldır
        document.body.removeChild(flyingStar);
    }, 850);
}
window.animateStarToUserStats = animateStarToUserStats;

function animateStreakIncrease(streakElement, oldStreak, newStreak, clickedCell) {
    spawnPlusFloat(streakElement, (Number(newStreak) || 0) - (Number(oldStreak) || 0));

    // Tıklanan hücrenin pozisyonunu al
    const clickedRect = clickedCell.getBoundingClientRect();

    // Seri hücresindeki yıldızın pozisyonunu al
    const starElement = streakElement.querySelector('.weekly-fire-emoji');
    const starRect = starElement.getBoundingClientRect();

    // Geçici yıldız elementi oluştur
    const flyingStar = document.createElement('div');
    flyingStar.innerHTML = '⭐';
    flyingStar.style.position = 'fixed';
    flyingStar.style.left = (clickedRect.left + clickedRect.width / 2 - 12.5) + 'px'; // Hücrenin ortası (25px/2 = 12.5)
    flyingStar.style.top = (clickedRect.top + clickedRect.height / 2 - 12.5) + 'px'; // Hücrenin ortası
    flyingStar.style.fontSize = '21px';
    flyingStar.style.zIndex = '9999';
    flyingStar.style.pointerEvents = 'none';
    flyingStar.style.transition = 'all 0.8s ease-out';
    flyingStar.style.transform = 'scale(0.6)';

    document.body.appendChild(flyingStar);

    // Yıldızı hedefe hareket ettir
    setTimeout(() => {
        flyingStar.style.left = (starRect.left + starRect.width / 2 - 12.5) + 'px'; // Yıldızın tam ortası (25px/2 = 12.5)
        flyingStar.style.top = (starRect.top + starRect.height / 2 - 12.5) + 'px'; // Yıldızın tam ortası
        flyingStar.style.transform = 'scale(1)';
    }, 50);

    // Hedefe ulaştığında seri hücresini animasyonla
    setTimeout(() => {
        if (starElement) {
            starElement.classList.add('streak-star-animation');
            setTimeout(() => {
                starElement.classList.remove('streak-star-animation');
            }, 600);
        }

        // Uçan yıldızı kaldır
        document.body.removeChild(flyingStar);
    }, 850);

}
window.animateStreakIncrease = animateStreakIncrease;

function getDayOfWeekInTurkish(date) {
    const days = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cts'];
    return days[date.getDay()];
}


// Tabloyu resme çevirip modal'da göster
async function shareTrackerTable() {
    const weekText = currentWeekDisplay ? currentWeekDisplay.textContent.trim() : 'tablo';

    // Dropbox resimlerini default.png olarak değiştir
    const prepareImages = async () => {
        const profileImages = trackerTable.querySelectorAll('.tracker-profile-image');
        const imageUpdates = [];

        profileImages.forEach(img => {
            const src = img.src || img.getAttribute('src') || '';
            const isLocalPath = src.includes('/images/') || src.includes('/userAvatars/');

            if (src && (src.startsWith('http://') || src.startsWith('https://')) && !isLocalPath) {
                imageUpdates.push({
                    img: img,
                    originalSrc: src
                });
                img.src = '/images/default.png';
            }
        });

        await Promise.all(imageUpdates.map(({ img }) => {
            return new Promise((resolve) => {
                if (img.complete) {
                    resolve();
                } else {
                    img.onload = resolve;
                    img.onerror = resolve;
                    setTimeout(resolve, 2000);
                }
            });
        }));
    };

    await window.shareContainerAsImage({
        container: trackerTable,
        modalId: 'tableShareModal',
        titleText: weekText,
        fileNamePrefix: 'okuma-tablosu',
        shareTitle: 'Okuma Tablosu',
        shareText: `${weekText} haftası okuma tablosu`,
        onRestore: () => {
            if (typeof loadTrackerTable === 'function') {
                loadTrackerTable();
            }
        },
        prepareImages: prepareImages
    });
}


// Session timeout modal'ını göster
function showSessionTimeoutModal() {
    const modal = document.getElementById('sessionTimeoutModal');
    if (!modal) return;

    modal.style.display = 'flex';
    setTimeout(() => {
        modal.classList.add('show');
    }, 10);

    // Geri sayım başlat
    startSessionTimeoutCountdown();
}

// Geri sayım interval'ini sakla
let sessionCountdownInterval = null;

// Geri sayım fonksiyonu
function startSessionTimeoutCountdown() {
    const countdownElement = document.getElementById('sessionTimeoutCountdown');
    if (!countdownElement) return;

    // Önceki interval'i temizle (varsa)
    if (sessionCountdownInterval) {
        clearInterval(sessionCountdownInterval);
    }

    let countdown = 3;
    countdownElement.textContent = countdown;

    sessionCountdownInterval = setInterval(() => {

        if (countdown >= 0) {
            countdownElement.textContent = countdown;
            // Sayı değiştiğinde animasyon efekti
            countdownElement.classList.add('countdown-pulse');
            setTimeout(() => {
                countdownElement.classList.remove('countdown-pulse');
            }, 300);
        } else {
            // Geri sayım bitti, sayfayı yenile
            clearInterval(sessionCountdownInterval);
            sessionCountdownInterval = null;
            reloadPageAfterSessionTimeout();
        }

        countdown--;
    }, 1000); // Her 1 saniyede bir
}

// Session timeout modal'ını kapat ve mevcut URL'ye yönlendir
function reloadPageAfterSessionTimeout() {
    // Geri sayım interval'ini temizle
    if (sessionCountdownInterval) {
        clearInterval(sessionCountdownInterval);
        sessionCountdownInterval = null;
    }

    const modal = document.getElementById('sessionTimeoutModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
            // Mevcut URL'ye yönlendir
            window.location.href = window.location.href;
        }, 300);
    }
}

// Paylaş butonuna event listener ekle ve modal kapatma işlemlerini başlat
document.addEventListener('DOMContentLoaded', () => {
    // Table share modal
    const shareTableBtn = document.getElementById('shareTableBtn');
    if (shareTableBtn) {
        shareTableBtn.addEventListener('click', shareTrackerTable);
    }

    window.setupShareModal('tableShareModal', 'closeTableShareModal', () => {
        if (typeof loadTrackerTable === 'function') {
            loadTrackerTable();
        }
    });

    // Month share modal setup
    window.setupShareModal('monthShareModal', 'closeMonthShareModal', () => {
        // Monthly calendar için restore işlemi gerekmiyor
    });

    // Longest series share modal setup
    window.setupShareModal('longestSeriesShareModal', 'closeLongestSeriesShareModal', () => {
        // Restore işlemi gerekmiyor
    });

    // Reading stats share modal setup
    window.setupShareModal('readingStatsShareModal', 'closeReadingStatsShareModal', () => {
        // Restore işlemi gerekmiyor
    });
});


