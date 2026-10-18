const trackerTable = document.getElementById('trackerTable');
const tableArea = document.querySelector('.table-area');
const trackerTableShell = document.querySelector('.tracker-table-shell');
const trackerTableLayout = document.querySelector('.tracker-table-layout');
const trackerUsersTable = document.getElementById('trackerUsersTable');
const trackerSummaryTable = document.getElementById('trackerSummaryTable');
const newUserForm = document.getElementById('newUserForm');
window.newUserForm = newUserForm;
const prevWeekBtn = document.getElementById('prevWeek');
const nextWeekBtn = document.getElementById('nextWeek');
const prevWeekTodayBtn = document.getElementById('prevWeekToday');
const nextWeekTodayBtn = document.getElementById('nextWeekToday');
const currentWeekDisplay = document.getElementById('currentWeekDisplay');
const timelineScrollHint = document.getElementById('timelineScrollHint');
let weekOffset = 0;
// Global erişim için window'a ekle
window.weekOffset = weekOffset;
let isFirstLoad = true;
let postToggleUpdateTimer = null;

// Haftalık tablo artık, sınırlı sayıda hücreyi yeniden kullanan yatay bir
// zaman şeridi olarak çalışır. Böylece kullanıcı geçmişe/geleceğe doğru
// kaydırabilirken DOM kontrolsüz biçimde büyümez.
const TIMELINE_WINDOW_DAYS = 42;
const TIMELINE_SHIFT_DAYS = 14;
const TIMELINE_INITIAL_PAST_DAYS = 27;
let timelineStartDate = null;
let timelineEndDate = null;
let timelineReferenceDate = null;
let timelineScrollTimer = null;
let timelineIsShifting = false;
let timelineIsSharing = false;
let timelineHasPositioned = false;
let timelineScrollBound = false;
let timelineDragStartX = 0;
let timelineDragStartScrollLeft = 0;
let timelineIsDragging = false;
let timelineSuppressClick = false;
let timelineLastUsers = [];
let timelineLastStats = [];
let timelineLastStatMap = {};
let timelineLastAmountMap = {};
let timelineDisplayedSeasonKey = null;
let trackerRowSyncFrame = null;
let trackerRowResizeBound = false;
let timelineScrollHintShowTimer = null;
let timelineScrollHintHideTimer = null;
let timelineScrollHintScheduled = false;
let timelineScrollHintDismissed = false;
let timelineScrollHintInteractionBound = false;

// Takvim haftası tercihi yerine bugünle biten kayan yedi günlük dönem kullanılır.
window.firstDayOfWeek = 'default';
localStorage.setItem('firstDayOfWeek', 'default');

function toLocalDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function fromDateKey(dateKey) {
    const parts = String(dateKey).split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
}

function addDaysToKey(dateKey, amount) {
    const date = fromDateKey(dateKey);
    date.setDate(date.getDate() + amount);
    return toLocalDateKey(date);
}

function getTodayDateKey() {
    return toLocalDateKey(new Date());
}

function getSevenDaysEndingAt(dateKey) {
    const dates = [];
    for (let i = 6; i >= 0; i--) dates.push(addDaysToKey(dateKey, -i));
    return dates;
}

function initializeTimelineWindow() {
    if (timelineStartDate && timelineEndDate) return;
    const todayKey = getTodayDateKey();
    timelineReferenceDate = todayKey;
    timelineStartDate = addDaysToKey(todayKey, -TIMELINE_INITIAL_PAST_DAYS);
    timelineEndDate = addDaysToKey(timelineStartDate, TIMELINE_WINDOW_DAYS - 1);
}

function getTimelineDates() {
    initializeTimelineWindow();
    const dates = [];
    let cursor = timelineStartDate;
    while (cursor <= timelineEndDate && dates.length < TIMELINE_WINDOW_DAYS) {
        dates.push(cursor);
        cursor = addDaysToKey(cursor, 1);
    }
    return dates;
}

function setTimelineTodayButtonVisibility(referenceDate) {
    const todayKey = getTodayDateKey();
    const states = [
        [prevWeekTodayBtn, referenceDate > todayKey],
        [nextWeekTodayBtn, referenceDate < todayKey]
    ];

    states.forEach(function ([button, visible]) {
        if (!button) return;
        button.classList.toggle('is-visible', visible);
        button.setAttribute('aria-hidden', visible ? 'false' : 'true');
        button.tabIndex = visible ? 0 : -1;
    });
}

function getTimelineScrollHintSessionKey() {
    const groupKey = window.groupid || window.location.pathname || 'default';
    return `timeline-scroll-hint-shown:${groupKey}`;
}

function hasShownTimelineScrollHint() {
    try {
        return sessionStorage.getItem(getTimelineScrollHintSessionKey()) === '1';
    } catch (_) {
        return false;
    }
}

function markTimelineScrollHintAsShown() {
    try {
        sessionStorage.setItem(getTimelineScrollHintSessionKey(), '1');
    } catch (_) {
        // sessionStorage kullanılamıyorsa yönlendirme yine çalışmaya devam eder.
    }
}

function hideTimelineScrollHint() {
    clearTimeout(timelineScrollHintShowTimer);
    clearTimeout(timelineScrollHintHideTimer);
    timelineScrollHintShowTimer = null;
    timelineScrollHintHideTimer = null;
    timelineScrollHintScheduled = false;
    if (timelineScrollHint) timelineScrollHint.classList.remove('is-visible');
}

function dismissTimelineScrollHint() {
    if (!timelineScrollHintScheduled && !timelineScrollHint?.classList.contains('is-visible')) return;
    timelineScrollHintDismissed = true;
    markTimelineScrollHintAsShown();
    hideTimelineScrollHint();
}

function positionTimelineScrollHint() {
    if (!timelineScrollHint || !trackerTableLayout || !trackerTable || !tableArea) return;
    const swipeGuide = timelineScrollHint.querySelector('.timeline-swipe-guide');
    const swipeArrow = timelineScrollHint.querySelector('.timeline-swipe-arrow');
    if (!swipeGuide || !swipeArrow) return;
    const layoutRect = trackerTableLayout.getBoundingClientRect();
    const tableAreaRect = tableArea.getBoundingClientRect();
    const tableRect = trackerTable.getBoundingClientRect();
    const readingRows = Array.from(trackerTable.querySelectorAll('tbody tr.user-row'));
    const firstReadingRowRect = readingRows[0]?.getBoundingClientRect();
    const lastReadingRowRect = readingRows[readingRows.length - 1]?.getBoundingClientRect();
    const readingRowsCenter = firstReadingRowRect && lastReadingRowRect
        ? ((firstReadingRowRect.top + lastReadingRowRect.bottom) / 2) - layoutRect.top
        : tableRect.top - layoutRect.top + (tableRect.height / 2);
    const guideRect = swipeGuide.getBoundingClientRect();
    const arrowRect = swipeArrow.getBoundingClientRect();
    const arrowOffsetFromGuideCenter = (arrowRect.top + (arrowRect.height / 2))
        - (guideRect.top + (guideRect.height / 2));
    const centeredTop = readingRowsCenter - arrowOffsetFromGuideCenter;
    const centeredLeft = tableAreaRect.left - layoutRect.left + (tableAreaRect.width / 2);
    timelineScrollHint.style.setProperty('--timeline-scroll-hint-top', `${Math.max(0, centeredTop)}px`);
    timelineScrollHint.style.setProperty('--timeline-scroll-hint-left', `${centeredLeft}px`);
}

function bindTimelineScrollHintInteraction() {
    if (!tableArea || timelineScrollHintInteractionBound) return;
    timelineScrollHintInteractionBound = true;
    tableArea.addEventListener('pointerdown', dismissTimelineScrollHint, { passive: true });
    tableArea.addEventListener('wheel', dismissTimelineScrollHint, { passive: true });
    tableArea.addEventListener('scroll', function () {
        if (timelineScrollHint?.classList.contains('is-visible')) dismissTimelineScrollHint();
    }, { passive: true });
    window.addEventListener('resize', function () {
        if (timelineScrollHint?.classList.contains('is-visible')) positionTimelineScrollHint();
    }, { passive: true });
}

function scheduleTimelineScrollHint() {
    if (!timelineScrollHint || timelineScrollHintScheduled || timelineScrollHintDismissed || hasShownTimelineScrollHint()) return;
    bindTimelineScrollHintInteraction();
    timelineScrollHintScheduled = true;
    timelineScrollHintShowTimer = setTimeout(function () {
        timelineScrollHintShowTimer = null;
        timelineScrollHintScheduled = false;
        if (timelineScrollHintDismissed) return;
        positionTimelineScrollHint();
        markTimelineScrollHintAsShown();
        timelineScrollHint.classList.add('is-visible');
        timelineScrollHintHideTimer = setTimeout(hideTimelineScrollHint, 4100);
    }, 1200);
}

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
    if (typeof window.showAuthenticatedUserAreas === 'function') {
        window.showAuthenticatedUserAreas();
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

    if (!timelineLastStatMap[userId]) timelineLastStatMap[userId] = {};
    if (status) timelineLastStatMap[userId][date] = status;
    else delete timelineLastStatMap[userId][date];
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
        return `${months[new Date().getMonth()]} Okuması`;
    }
    return `${months[seasonMonth - 1]} Okuması`;
}

function isMonthBoundaryColumn(dates, index) {
    if (!dates || index < 1) return false;
    const prev = String(dates[index - 1] || '').slice(0, 7);
    const cur = String(dates[index] || '').slice(0, 7);
    return prev !== cur && /^\d{4}-\d{2}$/.test(prev) && /^\d{4}-\d{2}$/.test(cur);
}

// Yükleme overlay'i kaldırıldı

function formatDateRange(dates) {
    if (!dates || dates.length === 0) return '';
    const startDate = fromDateKey(dates[0]);
    const endDate = fromDateKey(dates[dates.length - 1]);
    const months = [
        'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
        'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
    ];
    const startDay = startDate.getDate();
    const endDay = endDate.getDate();
    const startMonth = months[startDate.getMonth()];
    const endMonth = months[endDate.getMonth()];
    if (dates.length === 1) {
        return `${startDay} ${startMonth}`;
    }
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
    const dates = getSevenDaysEndingAt(timelineReferenceDate || getTodayDateKey());
    const tbody = trackerTable && trackerTable.querySelector('tbody');
    if (!tbody) return { okudum: 0, marked: 0 };

    let okudum = 0;
    let marked = 0;
    tbody.querySelectorAll('tr.user-row').forEach(function (row) {
        const cells = row.querySelectorAll('td.day-column[data-date]');
        cells.forEach(function (cell) {
            if (!dates.includes(cell.dataset.date)) return;
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

async function loadTrackerTable(options = {}) {
    console.log('🔍 Tracker Table Loading...');

    // Yatay zaman şeridi doğal dokunma/fare kaydırmasını kullanır.
    if (tableArea) {
        tableArea.style.overflowX = 'auto';
        tableArea.style.overflowY = 'visible';
    }

    initializeTimelineWindow();
    const dates = getTimelineDates();
    const analysisDates = getSevenDaysEndingAt(timelineReferenceDate || getTodayDateKey());
    currentWeekDisplay.textContent = formatDateRange(analysisDates);
    setTimelineTodayButtonVisibility(timelineReferenceDate || getTodayDateKey());
    const data = window.globalDataStore ? window.globalDataStore.getAllData() : { users: [], stats: [] };
    const { users: rawUsers = [], stats } = data;
    const turkishNameCollator = new Intl.Collator('tr-TR', {
        sensitivity: 'base',
        numeric: true
    });
    const users = [...rawUsers].sort((user1, user2) =>
        turkishNameCollator.compare(user1.name || '', user2.name || '')
    );

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
    timelineLastUsers = users;
    timelineLastStats = statsArray;
    timelineLastStatMap = statMap;
    timelineLastAmountMap = amountMap;

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
    const seasonKey = getWeekSeasonKey(analysisDates);
    timelineDisplayedSeasonKey = seasonKey;
    const seasonLabel = getWeekSeasonLabel(analysisDates);
    const seasonParts = seasonLabel.split(' ');
    const seasonHtml = seasonParts.length >= 2
        ? `<span class="col-season-month">${seasonParts[0]}</span><br><span class="col-season-suffix">${seasonParts.slice(1).join(' ')}</span>`
        : seasonLabel;
    const usersHeadHTML = `<tr><th><span class="col-user-count">${totalUsers} Kişi</span></th></tr>`;
    let theadHTML = `<tr>`;
    const todayString = getTodayDateKey();
    for (let i = 0; i < dates.length; i++) {
        const d = dates[i];
        const date = new Date(d);
        const dayOfWeek = getDayOfWeekInTurkish(date);
        const isToday = d === todayString;
        const classNames = [];
        if (isToday) classNames.push('today-column');
        if (isMonthBoundaryColumn(dates, i)) classNames.push('month-start');
        const displayText = isToday ? 'Bugün' : formatDateForHeader(date);
        theadHTML += `<th class="day-column ${classNames.join(' ')}" data-date="${d}"><span class="date-text">${displayText}</span><br><span class="day-of-week">${dayOfWeek}</span></th>`;
    }
    theadHTML += `</tr>`;
    const weekReadStats = computeWeekMarkedReadStats(users, statMap, analysisDates);
    const weekReadSuccessText = formatWeekReadSuccessText(
        weekReadStats.okudum,
        weekReadStats.marked
    );
    const usersStatsHeadHTML = `<tr class="stats-footer-row"><th class="stats-footer-label" scope="col" title="Haftalık okuma başarı oranı (okundu / işaretli gün)">`
        + `<span class="col-counts" id="stats-footer-total-counts">`
        + `<span class="col-read" id="tfoot-total-read" aria-label="${weekReadSuccessText} okundu">${weekReadSuccessText}<i class="fa-solid fa-check stats-footer-check-icon" aria-hidden="true"></i></span>`
        + `</span></th></tr>`;
    let statsRowHTML = `<tr class="stats-footer-row">`;
    for (let i = 0; i < dates.length; i++) {
        const d = dates[i];
        const { readCount } = dateCounts[d];
        const isToday = d === todayString;
        const todayClass = isToday ? ' today-column' : '';
        const monthStartClass = isMonthBoundaryColumn(dates, i) ? ' month-start' : '';
        statsRowHTML += `<th class="day-column stats-footer-cell${todayClass}${monthStartClass}" data-date="${d}" scope="col">`
            + `<span class="col-counts" data-date="${d}">`
            + `<span class="col-read" aria-label="${readCount} okundu">${readCount}<i class="fa-solid fa-check stats-footer-check-icon" aria-hidden="true"></i></span>`
            + `</span></th>`;
    }
    statsRowHTML += `</tr>`;
    let grandAmountTotal = 0;
    let grandStreakTotal = 0;
    for (let user of users) {
        grandAmountTotal += sumUserAmounts(statsArray, user._id, seasonKey);
        grandStreakTotal += calculateStreak(statMap[user._id] || {});
    }
    let summaryHeadHTML = `<tr><th class="col-total-amount col-season">${seasonHtml}</th>`
        + `<th class="col-streak-heading">Okuma<br>Serisi</th></tr>`;
    summaryHeadHTML += `<tr class="stats-footer-row">`
        + `<th class="stats-footer-cell stats-footer-amount" scope="col" title="Bu sezondaki tüm kullanıcıların okuma toplamı">`
        + `<span class="col-counts" id="stats-footer-amount-counts">`
        + `<span class="col-read" id="tfoot-total-amount">${grandAmountTotal} ✔</span>`
        + `</span></th>`;
    const streakTotalHtml = grandStreakTotal > 0
        ? `<span class="weekly-fire-emoji">⭐</span> ${grandStreakTotal}`
        : `<span class="weekly-fire-emoji">⭐</span> 0`;
    summaryHeadHTML += `<th class="stats-footer-cell stats-footer-total" scope="col" title="Tüm kullanıcıların okuma serisi toplamı">`
        + `<span class="col-counts" id="stats-footer-streak-counts">`
        + `<span id="tfoot-total-streak">${streakTotalHtml}</span>`
        + `</span></th></tr>`;
    const oldTfoot = trackerTable.querySelector('tfoot');
    if (oldTfoot) oldTfoot.remove();
    trackerTable.querySelector('thead').innerHTML = theadHTML + statsRowHTML;
    let tbodyHTML = '';
    let usersBodyHTML = '';
    let summaryBodyHTML = '';
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
        let userRow = `<tr class="user-row${currentUserClass}" data-user-id="${user._id}"><td class="user-item" data-user-id="${user._id}" style="background: ${league.bg};"><div class="user-item-content">`;
        const profileImage = user.profileImage || '/images/default.png';
        userRow += `<img src="${profileImage}" alt="${user.name}" class="tracker-profile-image tracker-profile-image-loading" onload="this.classList.remove('tracker-profile-image-loading')" onerror="this.classList.remove('tracker-profile-image-loading'); this.src='/images/default.png'" />`;
        userRow += `<span class="user-item-text"><span class="user-item-name">${user.name}</span>`;
        userRow += `<span class="user-item-meta" data-user-meta="${user._id}" data-amount="${userAllTimeAmount}">${formatUserItemMeta(league.name, userAllTimeAmount)}</span></span></div></td></tr>`;
        usersBodyHTML += userRow;
        let row = `<tr class="user-row${currentUserClass}" data-user-id="${user._id}">`;
        for (let dateIndex = 0; dateIndex < dates.length; dateIndex++) {
            const date = dates[dateIndex];
            const status = userStats[date] || '';
            const dayAmount = (amountMap[user._id] || {})[date];
            let symbol = '➖';
            if (status === 'okudum') symbol = formatOkudumCellSymbol(dayAmount);
            else if (status === 'okumadım') symbol = '✖';
            let className = '';

            // Bugünden sonraki tarihler için • ikonu ve disabled sınıfı
            const todayString = getTodayDateKey();
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
            const onclickAttr = isFutureDate ? '' : `onclick="toggleStatus('${user._id}', '${date}', this)"`;
            row += `<td class="day-column ${className}" data-date="${date}" ${onclickAttr}>${symbol}</td>`;
        }
        const streak = calculateStreak(userStats);
        row += `</tr>`;
        tbodyHTML += row;
        summaryBodyHTML += `<tr class="summary-user-row${currentUserClass}" data-user-id="${user._id}">`
            + `<td class="col-total-amount" data-user-amount="${user._id}" title="${userSeasonAmount > 0 ? `${userSeasonAmount} ✔` : '-'}">`
            + `${userSeasonAmount > 0 ? `${userSeasonAmount} ✔` : '-'}</td>`
            + `<td class="col-streak" data-user-streak="${user._id}">`
            + `${streak > 0 ? `<span class="weekly-fire-emoji">⭐</span> ${streak}` : '-'}</td></tr>`;
    }
    trackerTable.querySelector('tbody').innerHTML = tbodyHTML;
    trackerUsersTable.querySelector('thead').innerHTML = usersHeadHTML + usersStatsHeadHTML;
    trackerUsersTable.querySelector('tbody').innerHTML = usersBodyHTML;
    trackerSummaryTable.querySelector('thead').innerHTML = summaryHeadHTML;
    trackerSummaryTable.querySelector('tbody').innerHTML = summaryBodyHTML;
    trackerUsersTable.querySelectorAll('.tracker-profile-image').forEach(function (image) {
        if (!image.complete) image.addEventListener('load', scheduleTrackerSummaryRowSync, { once: true });
    });

    // Kullanıcıya tıklanınca ilgili kartı göster ve scroll et
    trackerUsersTable.querySelectorAll('.user-item').forEach(item => {
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
    trackerTableLayout.classList.remove('is-visible');

    setTimeout(() => {
        trackerTableLayout.classList.add('is-visible');

        // Sadece ilk yüklemede sayfanın en üstüne kaydır
        if (isFirstLoad) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            isFirstLoad = false;
        }
    }, 20);

    // Kullanıcı istatistik alanını güncelle (giriş serisi hesaplaması ile)
    if (!options.timelineRefresh) {
        updateUserStatsAreaWithStreak().catch(error => {
            console.error('Kullanıcı istatistik alanı güncellenemedi:', error);
        });
    }

    if (trackerTableShell) {
        trackerTableShell.style.display = 'block';
        trackerTableShell.classList.add('is-visible');
    }

    setupTrackerSummaryRowSync();
    setupTimelineScrolling();
    requestAnimationFrame(function () {
        if (!timelineHasPositioned) {
            scrollTimelineDateIntoRightEdge(timelineReferenceDate || getTodayDateKey(), false);
            timelineHasPositioned = true;
        }
        updateCurrentWeekDisplayFromViewport(timelineReferenceDate || getTodayDateKey());
        scheduleTimelineScrollHint();
    });
}

function getTimelinePinnedRightWidth() {
    return 0;
}

function syncTrackerSummaryRowHeights() {
    trackerRowSyncFrame = null;
    if (!trackerUsersTable || !trackerTable || !trackerSummaryTable) return;
    syncTrackerSummaryColumnWidths();
    const userRows = Array.from(trackerUsersTable.querySelectorAll('thead tr, tbody tr.user-row'));
    const mainRows = Array.from(trackerTable.querySelectorAll('thead tr, tbody tr.user-row'));
    const summaryRows = Array.from(trackerSummaryTable.querySelectorAll('thead tr, tbody tr.summary-user-row'));
    if (userRows.length !== mainRows.length || mainRows.length !== summaryRows.length) return;

    userRows.forEach(function (row) { row.style.height = ''; });
    mainRows.forEach(function (row) { row.style.height = ''; });
    summaryRows.forEach(function (row) { row.style.height = ''; });
    mainRows.forEach(function (row, index) {
        const height = Math.max(
            userRows[index].getBoundingClientRect().height,
            row.getBoundingClientRect().height,
            summaryRows[index].getBoundingClientRect().height
        );
        const value = `${Math.ceil(height * 100) / 100}px`;
        userRows[index].style.height = value;
        row.style.height = value;
        summaryRows[index].style.height = value;
    });
}

function measureTrackerSummaryColumn(selector, minWidth) {
    let width = minWidth;
    trackerSummaryTable.querySelectorAll(selector).forEach(function (cell) {
        const style = window.getComputedStyle(cell);
        const horizontalPadding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
        const horizontalBorders = (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0);
        const range = document.createRange();
        range.selectNodeContents(cell);
        const contentWidth = range.getBoundingClientRect().width;
        width = Math.max(width, Math.ceil(contentWidth + horizontalPadding + horizontalBorders + 12));
    });
    return width;
}

function syncTrackerSummaryColumnWidths() {
    if (!trackerTableLayout || !trackerSummaryTable) return;
    const summaryArea = trackerSummaryTable.closest('.tracker-summary-area');
    if (!summaryArea) return;

    const amountMin = 112;
    const streakMin = 88;
    const amountWidth = Math.max(
        amountMin,
        Math.ceil(measureTrackerSummaryColumn('.col-total-amount, .stats-footer-amount', amountMin))
    );
    const streakWidth = Math.max(
        streakMin,
        Math.ceil(measureTrackerSummaryColumn('.col-streak, .col-streak-heading, .stats-footer-total', streakMin))
    );
    const totalWidth = amountWidth + streakWidth;
    trackerSummaryTable.style.setProperty('--summary-amount-width', `${amountWidth}px`);
    trackerSummaryTable.style.setProperty('--summary-streak-width', `${streakWidth}px`);
    trackerSummaryTable.style.width = `${totalWidth}px`;
    summaryArea.style.width = `${totalWidth}px`;
}

function scheduleTrackerSummaryRowSync() {
    if (trackerRowSyncFrame != null) return;
    trackerRowSyncFrame = requestAnimationFrame(syncTrackerSummaryRowHeights);
}

function setupTrackerSummaryRowSync() {
    scheduleTrackerSummaryRowSync();
    if (trackerRowResizeBound) return;
    trackerRowResizeBound = true;
    window.addEventListener('resize', scheduleTrackerSummaryRowSync, { passive: true });
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(scheduleTrackerSummaryRowSync);
    }
}

function scrollTimelineDateIntoRightEdge(dateKey, smooth) {
    const cell = trackerTable && trackerTable.querySelector(`thead tr:first-child th.day-column[data-date="${dateKey}"]`);
    if (!cell || !tableArea) return false;
    const availableRight = tableArea.clientWidth - getTimelinePinnedRightWidth();
    const targetLeft = Math.max(0, cell.offsetLeft + cell.offsetWidth - availableRight);
    tableArea.scrollTo({ left: targetLeft, behavior: smooth ? 'smooth' : 'auto' });
    return true;
}

function getTimelineVisibleDates() {
    if (!tableArea || !trackerTable) return [];
    const areaRect = tableArea.getBoundingClientRect();
    const rightLimit = areaRect.right - getTimelinePinnedRightWidth();
    const leftLimit = areaRect.left;
    const visibleDates = [];
    let bestCandidate = null;
    let bestVisibleWidth = 0;
    trackerTable.querySelectorAll('thead tr:first-child th.day-column[data-date]').forEach(function (cell) {
        const rect = cell.getBoundingClientRect();
        const visibleWidth = Math.max(0, Math.min(rect.right, rightLimit) - Math.max(rect.left, leftLimit));
        if (visibleWidth > bestVisibleWidth) {
            bestVisibleWidth = visibleWidth;
            bestCandidate = cell.dataset.date;
        }
        if (visibleWidth >= rect.width / 2) visibleDates.push(cell.dataset.date);
    });
    return visibleDates.length > 0 ? visibleDates : (bestCandidate ? [bestCandidate] : []);
}

function getTimelineRightmostVisibleDate() {
    const visibleDates = getTimelineVisibleDates();
    return visibleDates[visibleDates.length - 1] || timelineReferenceDate || getTodayDateKey();
}

function updateCurrentWeekDisplayFromViewport(fallbackReferenceDate) {
    if (!currentWeekDisplay) return;
    const visibleDates = getTimelineVisibleDates();
    const displayDates = visibleDates.length > 0
        ? visibleDates
        : getSevenDaysEndingAt(fallbackReferenceDate || timelineReferenceDate || getTodayDateKey());
    currentWeekDisplay.textContent = formatDateRange(displayDates);
}

function buildSeasonHeaderHtml(dates) {
    const label = getWeekSeasonLabel(dates);
    const parts = label.split(' ');
    return parts.length >= 2
        ? `<span class="col-season-month">${parts[0]}</span><br><span class="col-season-suffix">${parts.slice(1).join(' ')}</span>`
        : label;
}

function getTrackerSummaryRow(userId) {
    if (!trackerSummaryTable) return null;
    const targetId = String(userId);
    return Array.from(trackerSummaryTable.querySelectorAll('tbody tr.summary-user-row'))
        .find(function (row) { return row.dataset.userId === targetId; }) || null;
}

function getTrackerSummaryStreakCell(userId) {
    const row = getTrackerSummaryRow(userId);
    return row ? row.querySelector('td.col-streak') : null;
}
window.getTrackerSummaryStreakCell = getTrackerSummaryStreakCell;

function updateTimelineSummaries(referenceDate) {
    if (!referenceDate) return;
    timelineReferenceDate = referenceDate;
    const analysisDates = getSevenDaysEndingAt(referenceDate);
    updateCurrentWeekDisplayFromViewport(referenceDate);
    setTimelineTodayButtonVisibility(referenceDate);

    const weekStats = computeWeekMarkedReadStats(timelineLastUsers, timelineLastStatMap, analysisDates);
    const successText = formatWeekReadSuccessText(weekStats.okudum, weekStats.marked);
    const successElement = document.getElementById('tfoot-total-read');
    if (successElement) {
        successElement.innerHTML = `${successText}<i class="fa-solid fa-check stats-footer-check-icon" aria-hidden="true"></i>`;
        successElement.setAttribute('aria-label', `${successText} okundu`);
    }

    const seasonKey = getWeekSeasonKey(analysisDates);
    if (seasonKey !== timelineDisplayedSeasonKey) {
        timelineDisplayedSeasonKey = seasonKey;
        const seasonHeader = trackerSummaryTable.querySelector('thead tr:first-child th.col-season');
        if (seasonHeader) seasonHeader.innerHTML = buildSeasonHeaderHtml(analysisDates);

        let grandAmount = 0;
        timelineLastUsers.forEach(function (user) {
            const amount = sumUserAmounts(timelineLastStats, user._id, seasonKey);
            grandAmount += amount;
            const cell = trackerSummaryTable.querySelector(`td.col-total-amount[data-user-amount="${user._id}"]`);
            if (cell) cell.textContent = amount > 0 ? `${amount} ✔` : '-';
        });
        const grandAmountElement = document.getElementById('tfoot-total-amount');
        if (grandAmountElement) grandAmountElement.textContent = `${grandAmount} ✔`;
        scheduleTrackerSummaryRowSync();
    }
}

function isTimelineMonthStart(dateKey) {
    return String(dateKey).slice(0, 7) !== String(addDaysToKey(dateKey, -1)).slice(0, 7);
}

function getTimelineDayClasses(dateKey) {
    const classes = ['day-column'];
    if (dateKey === getTodayDateKey()) classes.push('today-column');
    if (isTimelineMonthStart(dateKey)) classes.push('month-start');
    return classes;
}

function createTimelineHeaderDayCell(dateKey) {
    const cell = document.createElement('th');
    cell.className = getTimelineDayClasses(dateKey).join(' ');
    cell.dataset.date = dateKey;
    const date = fromDateKey(dateKey);
    const displayText = dateKey === getTodayDateKey() ? 'Bugün' : formatDateForHeader(date);
    cell.innerHTML = `<span class="date-text">${displayText}</span><br><span class="day-of-week">${getDayOfWeekInTurkish(date)}</span>`;
    return cell;
}

function createTimelineStatsDayCell(dateKey) {
    const cell = document.createElement('th');
    cell.className = getTimelineDayClasses(dateKey).concat('stats-footer-cell').join(' ');
    cell.dataset.date = dateKey;
    cell.scope = 'col';
    let readCount = 0;
    timelineLastUsers.forEach(function (user) {
        if ((timelineLastStatMap[user._id] || {})[dateKey] === 'okudum') readCount++;
    });
    cell.innerHTML = `<span class="col-counts" data-date="${dateKey}">`
        + `<span class="col-read" aria-label="${readCount} okundu">${readCount}`
        + `<i class="fa-solid fa-check stats-footer-check-icon" aria-hidden="true"></i></span></span>`;
    return cell;
}

function createTimelineBodyDayCell(userId, dateKey) {
    const cell = document.createElement('td');
    const status = (timelineLastStatMap[userId] || {})[dateKey] || '';
    const amount = (timelineLastAmountMap[userId] || {})[dateKey];
    const isFutureDate = dateKey > getTodayDateKey();
    const classes = getTimelineDayClasses(dateKey);
    let symbol = '➖';

    if (isFutureDate) {
        symbol = '•';
        classes.push('future-date');
    } else if (status === 'okudum') {
        symbol = formatOkudumCellSymbol(amount);
        classes.push('green');
    } else if (status === 'okumadım') {
        symbol = '✖';
        classes.push('red');
    } else {
        classes.push('empty');
    }

    cell.className = classes.join(' ');
    cell.dataset.date = dateKey;
    cell.textContent = symbol;
    if (!isFutureDate) cell.setAttribute('onclick', `toggleStatus('${userId}', '${dateKey}', this)`);
    return cell;
}

function insertTimelineDayCells(row, dates, createCell, atStart) {
    const fragment = document.createDocumentFragment();
    dates.forEach(function (dateKey) { fragment.appendChild(createCell(dateKey)); });
    if (atStart) {
        const firstDayCell = row.querySelector('.day-column');
        row.insertBefore(fragment, firstDayCell || row.firstChild);
    } else {
        row.appendChild(fragment);
    }
}

function removeTimelineDayCells(row, fromStart, count) {
    const cells = Array.from(row.querySelectorAll('.day-column'));
    const targets = fromStart ? cells.slice(0, count) : cells.slice(-count);
    targets.forEach(function (cell) { cell.remove(); });
}

function syncTimelineCachesFromStore() {
    if (!window.globalDataStore) return;
    const data = window.globalDataStore.getAllData();
    const stats = Array.isArray(data.stats) ? data.stats : [];
    const statMap = {};
    const amountMap = {};
    stats.forEach(function (item) {
        if (!statMap[item.userId]) statMap[item.userId] = {};
        if (!amountMap[item.userId]) amountMap[item.userId] = {};
        statMap[item.userId][item.date] = item.status;
        const amount = parseFiniteAmount(item.amount);
        if (amount != null) amountMap[item.userId][item.date] = amount;
    });
    timelineLastStats = stats;
    timelineLastStatMap = statMap;
    timelineLastAmountMap = amountMap;
}

function recycleTimelineDayColumns(direction) {
    syncTimelineCachesFromStore();
    const newDates = [];
    if (direction < 0) {
        const newStart = addDaysToKey(timelineStartDate, -TIMELINE_SHIFT_DAYS);
        for (let i = 0; i < TIMELINE_SHIFT_DAYS; i++) newDates.push(addDaysToKey(newStart, i));
        timelineStartDate = newStart;
        timelineEndDate = addDaysToKey(timelineEndDate, -TIMELINE_SHIFT_DAYS);
    } else {
        const firstNewDate = addDaysToKey(timelineEndDate, 1);
        for (let i = 0; i < TIMELINE_SHIFT_DAYS; i++) newDates.push(addDaysToKey(firstNewDate, i));
        timelineStartDate = addDaysToKey(timelineStartDate, TIMELINE_SHIFT_DAYS);
        timelineEndDate = addDaysToKey(timelineEndDate, TIMELINE_SHIFT_DAYS);
    }

    const headerRows = trackerTable.querySelectorAll('thead tr');
    const topHeaderRow = headerRows[0];
    const statsHeaderRow = headerRows[1];
    const atStart = direction < 0;
    insertTimelineDayCells(topHeaderRow, newDates, createTimelineHeaderDayCell, atStart);
    insertTimelineDayCells(statsHeaderRow, newDates, createTimelineStatsDayCell, atStart);

    trackerTable.querySelectorAll('tbody tr.user-row').forEach(function (row) {
        const userId = row.dataset.userId;
        if (!userId) return;
        insertTimelineDayCells(
            row,
            newDates,
            function (dateKey) { return createTimelineBodyDayCell(userId, dateKey); },
            atStart
        );
    });

    removeTimelineDayCells(topHeaderRow, direction > 0, TIMELINE_SHIFT_DAYS);
    removeTimelineDayCells(statsHeaderRow, direction > 0, TIMELINE_SHIFT_DAYS);
    trackerTable.querySelectorAll('tbody tr.user-row').forEach(function (row) {
        removeTimelineDayCells(row, direction > 0, TIMELINE_SHIFT_DAYS);
    });
    scheduleTrackerSummaryRowSync();
}

function replaceTimelineDayColumns() {
    syncTimelineCachesFromStore();
    const dates = getTimelineDates();
    const headerRows = trackerTable.querySelectorAll('thead tr');
    const topHeaderRow = headerRows[0];
    const statsHeaderRow = headerRows[1];

    removeTimelineDayCells(topHeaderRow, true, Number.MAX_SAFE_INTEGER);
    removeTimelineDayCells(statsHeaderRow, true, Number.MAX_SAFE_INTEGER);
    insertTimelineDayCells(topHeaderRow, dates, createTimelineHeaderDayCell, false);
    insertTimelineDayCells(statsHeaderRow, dates, createTimelineStatsDayCell, false);

    trackerTable.querySelectorAll('tbody tr.user-row').forEach(function (row) {
        const userId = row.dataset.userId;
        removeTimelineDayCells(row, true, Number.MAX_SAFE_INTEGER);
        if (!userId) return;
        insertTimelineDayCells(
            row,
            dates,
            function (dateKey) { return createTimelineBodyDayCell(userId, dateKey); },
            false
        );
    });
    scheduleTrackerSummaryRowSync();
}

function shiftTimelineWindow(direction) {
    if (timelineIsShifting || !direction) return;
    timelineIsShifting = true;
    const anchorDate = getTimelineRightmostVisibleDate();
    const anchorBefore = trackerTable.querySelector(`thead tr:first-child th.day-column[data-date="${anchorDate}"]`);
    const anchorLeft = anchorBefore ? anchorBefore.getBoundingClientRect().left : null;

    recycleTimelineDayColumns(direction);

    requestAnimationFrame(function () {
        const anchorAfter = trackerTable.querySelector(`thead tr:first-child th.day-column[data-date="${anchorDate}"]`);
        if (anchorAfter && anchorLeft != null) {
            tableArea.scrollLeft += anchorAfter.getBoundingClientRect().left - anchorLeft;
        }
        updateTimelineSummaries(anchorDate);
        timelineIsShifting = false;
    });
}

function setupTimelineScrolling() {
    if (!tableArea || timelineScrollBound) return;
    timelineScrollBound = true;
    tableArea.addEventListener('scroll', function () {
        if (timelineIsShifting || timelineIsSharing) return;
        clearTimeout(timelineScrollTimer);
        timelineScrollTimer = setTimeout(function () {
            if (timelineIsShifting || timelineIsSharing) return;
            const referenceDate = getTimelineRightmostVisibleDate();
            updateTimelineSummaries(referenceDate);

            const maxScroll = Math.max(0, tableArea.scrollWidth - tableArea.clientWidth);
            const sampleCell = trackerTable.querySelector('th.day-column');
            const threshold = Math.max(100, (sampleCell ? sampleCell.offsetWidth : 60) * 2);
            if (tableArea.scrollLeft < threshold) {
                shiftTimelineWindow(-1);
            } else if (maxScroll - tableArea.scrollLeft < threshold) {
                shiftTimelineWindow(1);
            }
        }, 120);
    }, { passive: true });

    tableArea.addEventListener('pointerdown', function (event) {
        if (event.pointerType !== 'mouse' || event.button !== 0 || !event.target.closest('.day-column')) return;
        timelineDragStartX = event.clientX;
        timelineDragStartScrollLeft = tableArea.scrollLeft;
        timelineIsDragging = true;
        timelineSuppressClick = false;
    });
    tableArea.addEventListener('pointermove', function (event) {
        if (!timelineIsDragging) return;
        const distance = event.clientX - timelineDragStartX;
        if (!timelineSuppressClick && Math.abs(distance) > 6) {
            timelineSuppressClick = true;
            tableArea.classList.add('is-dragging');
            tableArea.setPointerCapture(event.pointerId);
        }
        if (!timelineSuppressClick) return;
        tableArea.scrollLeft = timelineDragStartScrollLeft - distance;
    });
    function finishTimelineDrag(event) {
        if (!timelineIsDragging) return;
        timelineIsDragging = false;
        tableArea.classList.remove('is-dragging');
        if (tableArea.hasPointerCapture(event.pointerId)) tableArea.releasePointerCapture(event.pointerId);
        setTimeout(function () { timelineSuppressClick = false; }, 0);
    }
    window.addEventListener('pointerup', finishTimelineDrag);
    window.addEventListener('pointercancel', finishTimelineDrag);
    tableArea.addEventListener('click', function (event) {
        if (!timelineSuppressClick) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
    }, true);

    window.addEventListener('resize', function () {
        requestAnimationFrame(function () {
            updateCurrentWeekDisplayFromViewport(timelineReferenceDate || getTodayDateKey());
        });
    }, { passive: true });
}

async function jumpTimelineByDays(dayAmount) {
    const currentReference = timelineReferenceDate || getTodayDateKey();
    const targetDate = addDaysToKey(currentReference, dayAmount);
    if (targetDate < timelineStartDate || targetDate > timelineEndDate) {
        timelineStartDate = addDaysToKey(targetDate, -TIMELINE_INITIAL_PAST_DAYS);
        timelineEndDate = addDaysToKey(timelineStartDate, TIMELINE_WINDOW_DAYS - 1);
        replaceTimelineDayColumns();
    }
    timelineReferenceDate = targetDate;
    updateTimelineSummaries(targetDate);
    scrollTimelineDateIntoRightEdge(targetDate, true);
}

prevWeekBtn.addEventListener('click', () => {
    jumpTimelineByDays(-7);
});

nextWeekBtn.addEventListener('click', () => {
    jumpTimelineByDays(7);
});

prevWeekTodayBtn.addEventListener('click', () => {
    weekOffset = 0;
    window.weekOffset = weekOffset;
    jumpTimelineByDays(
        Math.round((fromDateKey(getTodayDateKey()) - fromDateKey(timelineReferenceDate || getTodayDateKey())) / 86400000)
    );
});

nextWeekTodayBtn.addEventListener('click', () => {
    weekOffset = 0;
    window.weekOffset = weekOffset;
    jumpTimelineByDays(
        Math.round((fromDateKey(getTodayDateKey()) - fromDateKey(timelineReferenceDate || getTodayDateKey())) / 86400000)
    );
});

currentWeekDisplay.addEventListener('click', () => {
    jumpTimelineByDays(
        Math.round((fromDateKey(getTodayDateKey()) - fromDateKey(timelineReferenceDate || getTodayDateKey())) / 86400000)
    );
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

window.toggleStatus = async function toggleStatus(userId, date, clickedCell) {
    const editMode = typeof window.getReadingEditMode === 'function'
        ? window.getReadingEditMode()
        : 'default';

    if (editMode === 'default') {
        return;
    }

    if (!LocalStorageManager.isUserLoggedIn()) {
        logUnauthorizedAccess('Haftalık tabloya tıklama');
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
    const fallbackTarget = window.event && window.event.target;
    const cell = clickedCell || (fallbackTarget && (fallbackTarget.closest('td') || fallbackTarget));
    if (!cell) return;

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
        // Cache'den güncel verileri al
        const userStatsMap = getUserStatsFromCache(userId);

        // Her hücrenin rengini güncelle
        dateCells.forEach((dateCell) => {
            const cellDate = dateCell.dataset.date;
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
            const lastTd = getTrackerSummaryStreakCell(userId);
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

                refreshStreakTotalInTable();
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

        readEl.setAttribute('aria-label', `${readCount} okundu`);
        readEl.innerHTML = `${readCount}<i class="fa-solid fa-check stats-footer-check-icon" aria-hidden="true"></i>`;

        // Haftalık okuma başarı oranını güncelle (okundu / işaretli gün)
        const totalReadEl = document.getElementById('tfoot-total-read');
        if (totalReadEl) {
            const weekStats = computeWeekMarkedReadFromTable();
            const weekReadSuccessText = formatWeekReadSuccessText(
                weekStats.okudum,
                weekStats.marked
            );
            totalReadEl.setAttribute('aria-label', `${weekReadSuccessText} okundu`);
            totalReadEl.innerHTML = `${weekReadSuccessText}<i class="fa-solid fa-check stats-footer-check-icon" aria-hidden="true"></i>`;
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
        const seasonKey = getWeekSeasonKey(getSevenDaysEndingAt(timelineReferenceDate || getTodayDateKey()));

        let grand = 0;
        users.forEach(function (user) {
            const seasonSum = sumUserAmounts(statsArray, user._id, seasonKey);
            const allTimeSum = sumUserAmounts(statsArray, user._id);
            grand += seasonSum;
            const cell = trackerSummaryTable.querySelector(`td.col-total-amount[data-user-amount="${user._id}"]`);
            if (cell) {
                cell.textContent = seasonSum > 0 ? `${seasonSum} ✔` : '-';
            }
            const okudumDays = userReadingCounts.get(user._id) || 0;
            const league = LEAGUES.find(l => okudumDays >= l.min && okudumDays < l.max) || LEAGUES[LEAGUES.length - 1];
            const meta = trackerUsersTable.querySelector(`.user-item-meta[data-user-meta="${user._id}"]`);
            if (meta) {
                meta.textContent = formatUserItemMeta(league.name, allTimeSum);
                meta.setAttribute('data-amount', String(allTimeSum || 0));
            }
        });

        const footerAmount = document.getElementById('tfoot-total-amount');
        if (footerAmount) {
            footerAmount.textContent = `${grand} ✔`;
        }
        scheduleTrackerSummaryRowSync();
    } catch (e) {
        console.error('Toplam Okuma güncellenemedi:', e);
    }
}

/** Okuma serisi sütunu toplamını istatistik satırında yenile */
function refreshStreakTotalInTable() {
    try {
        const footerStreak = document.getElementById('tfoot-total-streak');
        if (!footerStreak || !trackerSummaryTable) return;
        let total = 0;
        trackerSummaryTable.querySelectorAll('tbody tr.summary-user-row').forEach(function (row) {
            const lastTd = row.querySelector('td.col-streak');
            if (!lastTd) return;
            const text = (lastTd.textContent || '').trim();
            if (!text || text === '-') return;
            total += parseInt(text.replace('⭐', '').trim(), 10) || 0;
        });
        footerStreak.innerHTML = total > 0
            ? `<span class="weekly-fire-emoji">⭐</span> ${total}`
            : `<span class="weekly-fire-emoji">⭐</span> 0`;
        scheduleTrackerSummaryRowSync();
    } catch (e) {
        console.error('Okuma serisi toplamı güncellenemedi:', e);
    }
}

// Tüm kullanıcıların background rengini güncelle (önbellekten)
function updateAllUserBackgroundColors() {
    try {
        userReadingCounts.forEach((okudumDays, userId) => {
            // Lig hesapla
            const league = LEAGUES.find(l => okudumDays >= l.min && okudumDays < l.max) || LEAGUES[LEAGUES.length - 1];

            // Kullanıcının user-item elementini bul ve background rengini güncelle
            const userItem = trackerUsersTable.querySelector(`.user-item[data-user-id="${userId}"]`);
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
        const userItem = trackerUsersTable.querySelector(`.user-item[data-user-id="${userId}"]`);
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
    const summaryRow = row ? getTrackerSummaryRow(row.dataset.userId) : null;
    const target = (summaryRow && summaryRow.querySelector('td.col-total-amount')) || cell;
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
window.refreshStreakTotalInTable = refreshStreakTotalInTable;

function getDayOfWeekInTurkish(date) {
    const days = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cts'];
    return days[date.getDay()];
}

function removeCurrentUserHighlightFromShareClone(clonedLayout) {
    if (!clonedLayout) return;
    clonedLayout.querySelectorAll('.current-user-row').forEach(function (row) {
        row.querySelectorAll('html2canvaspseudoelement').forEach(function (pseudoElement) {
            pseudoElement.remove();
        });
        row.classList.remove('current-user-row');
    });
}

// Tabloyu resme çevirip modal'da göster
async function shareTrackerTable() {
    const shareDates = getSevenDaysEndingAt(timelineReferenceDate || getTodayDateKey());
    const weekText = formatDateRange(shareDates);
    const selectedDates = new Set(shareDates);
    const scrollLeftBeforeShare = tableArea ? tableArea.scrollLeft : 0;
    const referenceDateBeforeShare = timelineReferenceDate;

    timelineIsSharing = true;
    clearTimeout(timelineScrollTimer);
    timelineScrollTimer = null;
    trackerTableLayout.classList.add('is-share-capture');

    // Dropbox resimlerini default.png olarak değiştir
    const prepareImages = async () => {
        const profileImages = trackerUsersTable.querySelectorAll('.tracker-profile-image');
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

    try {
        await window.shareContainerAsImage({
            container: trackerTableLayout,
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
            prepareImages: prepareImages,
            prepareClone: (clonedDocument) => {
                const clonedLayout = clonedDocument.querySelector('.tracker-table-layout');
                if (!clonedLayout) return;
                clonedLayout.querySelectorAll('#trackerTable .day-column[data-date]').forEach(function (cell) {
                    if (!selectedDates.has(cell.dataset.date)) cell.remove();
                });
                removeCurrentUserHighlightFromShareClone(clonedLayout);
                const clonedTableArea = clonedLayout.querySelector('.table-area');
                if (clonedTableArea) clonedTableArea.scrollLeft = 0;
            }
        });
    } finally {
        trackerTableLayout.classList.remove('is-share-capture');
        // Paylaşım yardımcısı tabloyu bir sonraki karede eski DOM konumuna taşır.
        // Ondan sonraki karede kullanıcının kaydırma konumunu ve açık haftasını geri yükle.
        requestAnimationFrame(function () {
            if (referenceDateBeforeShare) updateTimelineSummaries(referenceDateBeforeShare);
            if (tableArea) tableArea.scrollLeft = scrollLeftBeforeShare;
            requestAnimationFrame(function () {
                timelineIsSharing = false;
            });
        });
    }
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


