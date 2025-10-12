const trackerTable = document.getElementById('trackerTable');
const tableArea = document.querySelector('.table-area');
const userList = document.getElementById('userList');
const newUserForm = document.getElementById('newUserForm');
const prevWeekBtn = document.getElementById('prevWeek');
const nextWeekBtn = document.getElementById('nextWeek');
const prevWeekTodayBtn = document.getElementById('prevWeekToday');
const nextWeekTodayBtn = document.getElementById('nextWeekToday');
const currentWeekDisplay = document.getElementById('currentWeekDisplay');
const firstDaySelect = document.getElementById('firstDaySelect');
let weekOffset = 0;
let isFirstLoad = true;
let postToggleUpdateTimer = null;

// Kullanıcı okuma sayılarını önbelleğe almak için
let userReadingCounts = new Map(); // userId -> okuma sayısı

// Lig tanımları - global erişilebilir
const LEAGUES = [
    { min: 0, max: 5, name: 'Bronz', bg: 'linear-gradient(90deg, #e2b07a 60%, #ffe0b2 100%)' },
    { min: 5, max: 10, name: 'Gümüş', bg: 'linear-gradient(90deg, #d3d3d3 60%, #e0e0e0 100%)' },
    { min: 10, max: 20, name: 'Altın', bg: 'linear-gradient(90deg, #ffd700 60%, #ffe789 100%)' },
    { min: 20, max: 40, name: 'İnci', bg: 'linear-gradient(90deg, #b2dfdb 60%, #c8eef3 100%)' },
    { min: 40, max: 60, name: 'Safir', bg: 'linear-gradient(90deg, #49b7ff 60%, #bbdefb 100%)' },
    { min: 60, max: 100, name: 'Zümrüt', bg: 'linear-gradient(90deg, #58c089 60%, #a5d6a7 100%)' },
    { min: 100, max: 150, name: 'Elmas', bg: 'linear-gradient(90deg, #36e873 60%, #c4edb8 100%)' },
    { min: 150, max: 200, name: 'Yakut', bg: 'linear-gradient(90deg, #ffb199 60%, #ffe0b2 100%)' },
    { min: 200, max: 365, name: 'Mercan', bg: 'linear-gradient(90deg, #ff6f63 60%, #ffafb7 100%)' },
    { min: 365, max: 1001, name: 'Pırlanta', bg: 'linear-gradient(90deg, #f3ebeb  60%, #ffffff 100%)' }
];

function getWeekDates(offset = 0) {
    const today = new Date();
    today.setHours(today.getHours());
    const dayOfWeek = today.getDay();
    let daysToFirstDay;
    if (dayOfWeek >= firstDayOfWeek) {
        daysToFirstDay = dayOfWeek - firstDayOfWeek;
    } else {
        daysToFirstDay = 7 - (firstDayOfWeek - dayOfWeek);
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

function showWeekLoading(show) {
    const overlay = document.getElementById('weekLoadingOverlay');
    if (!overlay) return;
    overlay.style.display = show ? 'flex' : 'none';
}

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
    const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
        'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    return months[monthIndex];
}

async function loadTrackerTable() {
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
    const res = await fetch(`/api/all-data/${window.groupid}`);
    const data = await res.json();
    const { users, stats } = data;
    
    // stats'in iterable olduğundan emin ol
    const statsArray = Array.isArray(stats) ? stats : [];
    const statMap = {};
    for (let s of statsArray) {
        if (!statMap[s.userId]) statMap[s.userId] = {};
        statMap[s.userId][s.date] = s.status;
    }
    
    // Kullanıcı okuma sayılarını hesapla ve önbelleğe al
    userReadingCounts.clear();
    for (let user of users) {
        const userStats = statMap[user._id] || {};
        const okudumDays = Object.values(userStats).filter(s => s === 'okudum').length;
        userReadingCounts.set(user._id, okudumDays);
    }
    const streakMap = {};
    for (let user of users) {
        streakMap[user._id] = findConsecutiveStreaks(statMap[user._id] || {});
    }
    let theadHTML = `<tr><th>Kullanıcılar</th>`;
    const today = new Date();
    today.setHours(today.getHours() + 3);
    const todayString = today.toISOString().split('T')[0];
    for (let d of dates) {
        const date = new Date(d);
        const dayOfWeek = getDayOfWeekInTurkish(date);
        const formattedDate = formatDateForHeader(date);
        const isToday = d === todayString;
        const todayClass = isToday ? 'today-column' : '';
        theadHTML += `<th class="${todayClass}"><span class="date-text">${formattedDate}</span><br><span class="day-of-week">${dayOfWeek}</span></th>`;
    }
    theadHTML += `<th><img src="/images/red-arrow.webp" alt="Streak" width="20" height="20"> Seri</th></tr>`;
    trackerTable.querySelector('thead').innerHTML = theadHTML;
    let tbodyHTML = '';
    for (let user of users) {
        const userStats = statMap[user._id] || {};
        const userStreaks = streakMap[user._id] || {};
        // Lig ve arka planı belirle (önbellekten al)
        const okudumDays = userReadingCounts.get(user._id) || 0;
        const league = LEAGUES.find(l => okudumDays >= l.min && okudumDays < l.max) || LEAGUES[LEAGUES.length - 1];
        // Giriş yapılan kullanıcı için özel class ekle
        const currentUserInfo = LocalStorageManager.getCurrentUserInfo();
        const isCurrentUser = currentUserInfo && currentUserInfo.userId === user._id;
        const currentUserClass = isCurrentUser ? ' current-user-row' : '';
        
        let row = `<tr class="user-row${currentUserClass}"><td class="user-item" data-user-id="${user._id}" style="background: ${league.bg};">`;
        const profileImage = user.profileImage || '/images/default.png';
        row += `<img src="${profileImage}" alt="${user.name}" class="tracker-profile-image tracker-profile-image-loading" onload="this.classList.remove('tracker-profile-image-loading')" onerror="this.classList.remove('tracker-profile-image-loading'); this.src='/images/default.png'" />`;
        row += `<span class="user-item-name">${user.name}</span></td>`;
        for (let date of dates) {
            const status = userStats[date] || '';
            let symbol = '➖';
            if (status === 'okudum') symbol = '✔';
            else if (status === 'okumadım') symbol = '✖';
            let className = '';
            if (status === 'okudum') {
                className = 'green';
            } else if (status === 'okumadım') {
                const streakLength = userStreaks[date] || 0;
                if (streakLength === 1) {
                    className = 'pink';
                } else if (streakLength === 2) {
                    className = 'lila';
                } else if (streakLength >= 3) {
                    className = 'red';
                }
            }
            if (date === todayString) {
                className += ' today-column';
            }
            row += `<td class="${className}" onclick="toggleStatus('${user._id}', '${date}')">${symbol}</td>`;
        }
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
    if (weekNav) weekNav.style.display = 'flex';
    trackerTable.querySelector('tbody').classList.remove('tracker-table-visible');
    setTimeout(() => {
        trackerTable.querySelector('tbody').classList.add('tracker-table-visible');
        // Sadece ilk yüklemede sayfanın en üstüne kaydır
        if (isFirstLoad) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            isFirstLoad = false;
        }
        showWeekLoading(false);
    }, 20);
    tableArea.style.display = 'block';
}

function findConsecutiveStreaks(userStats) {
    const dates = Object.keys(userStats).sort();
    if (dates.length === 0) return {};
    const streakMap = {};
    let currentStreak = 0;
    let streakDates = [];
    for (let i = 0; i < dates.length; i++) {
        const currentDate = dates[i];
        if (userStats[currentDate] === 'okumadım') {
            currentStreak++;
            streakDates.push(currentDate);
            if (i === dates.length - 1 ||
                userStats[dates[i + 1]] !== 'okumadım' ||
                !areDatesConsecutive(currentDate, dates[i + 1])) {
                for (let date of streakDates) {
                    streakMap[date] = currentStreak;
                }
                currentStreak = 0;
                streakDates = [];
            }
        }
    }
    return streakMap;
}

function areDatesConsecutive(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    d1.setHours(0, 0, 0, 0);
    d2.setHours(0, 0, 0, 0);
    const diffTime = d2 - d1;
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return diffDays === 1;
}

prevWeekBtn.addEventListener('click', () => {
    weekOffset--;
    showWeekLoading(true);
    loadTrackerTable();
});

nextWeekBtn.addEventListener('click', () => {
    weekOffset++;
    showWeekLoading(true);
    loadTrackerTable();
});

prevWeekTodayBtn.addEventListener('click', () => {
    weekOffset = 0;
    showWeekLoading(true);
    loadTrackerTable();
});

nextWeekTodayBtn.addEventListener('click', () => {
    weekOffset = 0;
    showWeekLoading(true);
    loadTrackerTable();
});

function calculateStreak(userStats) {
    const allDates = Object.keys(userStats).sort();
    if (allDates.length === 0) return 0;
    const today = new Date();
    today.setHours(today.getHours());
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

async function toggleStatus(userId, date) {
    if (!LocalStorageManager.isUserLoggedIn()) {
        logUnauthorizedAccess('Haftalık tabloya tıklama');
        return;
    }

    const userInfo = LocalStorageManager.getCurrentUserInfo();
    if (!userInfo) {
        logUnauthorizedAccess('Haftalık tabloya tıklama-kullanıcı bulunamadı');
        return;
    }

    // Member kullanıcıları sadece kendi verilerini güncelleyebilir
    if (userInfo.userAuthority === 'member' && userInfo.userId !== userId) {
        logUnauthorizedAccess('Başka üyenin haftalık tablosuna tıklama');
        return;
    }
    const cell = event.target;
    const current = cell.innerText;
    let status;
    let newSymbol;
    
    // Tüm günler için yeni sıra: ➖ → ✔ → ✖ → ➖
    if (current === '➖') {
        status = 'okudum';
        newSymbol = '✔';
    } else if (current === '✔') {
        status = 'okumadım';
        newSymbol = '✖';
    } else if (current === '✖') {
        status = '';
        newSymbol = '➖';
    }
    
    // Hücre ikonunu güncelle
    cell.innerText = newSymbol;

    // Sınıfı güncelle (okumadım serisi bilgisi tablo genelinden hesaplandığı için, burada sadece temel renkleri uygula)
    cell.classList.remove('green', 'pink', 'lila', 'red');
    if (status === 'okudum') {
        cell.classList.add('green');
    } else if (status === 'okumadım') {
        cell.classList.add('pink');
    }

    // Önbellekteki okuma sayısını güncelle
    const currentCount = userReadingCounts.get(userId) || 0;
    let newCount = currentCount;
    
    if (current === '➖' && status === 'okudum') {
        // Boş -> Okudum: +1
        newCount = currentCount + 1;
    } else if (current === '✔' && status === 'okumadım') {
        // Okudum -> Okumadım: -1
        newCount = Math.max(0, currentCount - 1);
    } else if (current === '✖' && status === '') {
        // Okumadım -> Boş: değişiklik yok
        newCount = currentCount;
    }
    
    userReadingCounts.set(userId, newCount);

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

    // Kullanıcının serisini güncelle (satırın son hücresi) - optimize edilmiş
    try {
        const res = await fetch(`/api/user-stats/${window.groupid}/${userId}`);
        const { stats } = await res.json();
        const userStatsMap = {};
        for (let s of stats) {
            userStatsMap[s.date] = s.status;
        }
        // Seçilen hücrede yaptığımız değişikliği de yerel olarak uygula ki sunucu gecikmesinde doğru hesap çıksın
        if (status) userStatsMap[date] = status; else delete userStatsMap[date];

        const newStreak = calculateStreak(userStatsMap);
        const rowEl = cell.closest('tr');
        if (rowEl) {
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

    // 1 sn tıklama olmazsa kartlar, istatistikler ve aylık görünümü güncelle (debounce)
    try {
        if (postToggleUpdateTimer) {
            clearTimeout(postToggleUpdateTimer);
        }
        postToggleUpdateTimer = setTimeout(async () => {
            try {
                // Tüm kullanıcıların background rengini güncelle
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
        }, 1200);
    } catch (err) {
        console.error('Debounce ayarlanamadı:', err);
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
            }
        });
    } catch (error) {
        console.error('Kullanıcı background renkleri güncellenemedi:', error);
    }
}

// Kullanıcının background rengini güncelle (eski fonksiyon - geriye uyumluluk için)
async function updateUserBackgroundColor(userId) {
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
        }
    } catch (error) {
        console.error('Kullanıcı background rengi güncellenemedi:', error);
    }
}

// Seri artış animasyonu fonksiyonu
function animateStreakIncrease(streakElement, oldStreak, newStreak, clickedCell) {
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
    flyingStar.style.fontSize = '20px';
    flyingStar.style.zIndex = '9999';
    flyingStar.style.pointerEvents = 'none';
    flyingStar.style.transition = 'all 0.6s ease-out';
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
    }, 650);
    
    // Başarı efekti için hafif titreşim (destekleyen cihazlarda)
    if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
    }
}

// refresh butonu kaldırıldı

function getDayOfWeekInTurkish(date) {
    const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    return days[date.getDay()];
}

