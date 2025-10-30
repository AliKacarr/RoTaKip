// Toast mesajı gösterme fonksiyonu
function showToast(message, type = 'success') {
    // Mevcut toast'ı kaldır
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    // Toast elementi oluştur
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // 3 saniye sonra kaldır
    setTimeout(() => {
        toast.classList.add('toast-hide');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// Oturum bilgilerini gösterme fonksiyonları
const SESSION_TIMEOUT = 15 * 60 * 1000; // 15 dakika
const DISPLAY_UPDATE_INTERVAL = 15 * 1000; // Bilgi güncelleme: 15 saniye
const SESSION_STORAGE_KEY = 'sessionStartTime';

function getSessionStart() {
    try {
        const stored = localStorage.getItem(SESSION_STORAGE_KEY);
        return stored ? parseInt(stored, 10) : null;
    } catch (err) {
        console.warn('Session zamanı alınamadı:', err);
        return null;
    }
}

function formatDateTime(timestamp) {
    const date = new Date(timestamp);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
}

function formatTimeRemaining(remainingMs) {
    if (remainingMs <= 0) {
        return '00:00';
    }
    const totalSeconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateSessionInfo() {
    const settingsSection = document.querySelector('.settings-section');
    if (!settingsSection) {
        return;
    }

    const start = getSessionStart();
    if (!start) {
        return;
    }

    const now = Date.now();
    const targetTime = start + SESSION_TIMEOUT;
    const remaining = targetTime - now;

    // Mevcut session-info elementini bul veya oluştur
    let sessionInfoDiv = document.getElementById('session-info');
    if (!sessionInfoDiv) {
        sessionInfoDiv = document.createElement('div');
        sessionInfoDiv.id = 'session-info';
        sessionInfoDiv.className = 'session-info';
        settingsSection.appendChild(sessionInfoDiv);
    }

    sessionInfoDiv.innerHTML = `
        <div class="session-info-item">
            <strong>Oturum Başlangıç Zamanı:</strong><br>
            <span class="session-time-value">${formatDateTime(start)}</span>
        </div>
        <div class="session-info-item">
            <strong>Oturum Yenilenecek Zaman:</strong><br>
            <span class="session-time-value">${formatDateTime(targetTime)}</span>
        </div>
        <div class="session-info-item">
            <strong>Kalan Süre:</strong><br>
            <span class="session-time-remaining ${remaining > 60000 ? 'time-ok' : 'time-warning'}">
                ${formatTimeRemaining(remaining)}
            </span>
        </div>
    `;
}

document.addEventListener('DOMContentLoaded', function () { //Tablonun ilk günü seçimi
    const savedFirstDay = localStorage.getItem('firstDayOfWeek');
    const firstDaySelect = document.getElementById('firstDaySelect');

    if (firstDaySelect) {
        if (savedFirstDay !== null && savedFirstDay !== 'default') {
            window.firstDayOfWeek = parseInt(savedFirstDay);
            firstDaySelect.value = savedFirstDay;
        } else {
            // Varsayılan olarak "default" seçili olmalı
            window.firstDayOfWeek = 'default';
            firstDaySelect.value = "default";
        }

        // Add event listener for combobox changes
        firstDaySelect.addEventListener('change', function () {
            // Tablonun ilk günü değiştirme işlemini logla
            if (typeof logUnauthorizedAccess === 'function') {
                logUnauthorizedAccess('Tablonun ilk günü değiştirme');
            }
            
            let selectedDayName;
            if (this.value === 'default') {
                window.firstDayOfWeek = 'default';
                selectedDayName = 'Varsayılan (Yarın)';
            } else {
                window.firstDayOfWeek = parseInt(this.value);
                const dayNames = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
                selectedDayName = dayNames[parseInt(this.value)];
            }
            
            localStorage.setItem('firstDayOfWeek', this.value);
            weekOffset = 0;
            loadTrackerTable();
            loadUserCards();
            
            // Sayfanın en üstüne kaydır
            window.scrollTo({ top: 0, behavior: 'smooth' });
            
            // Toast mesajı göster
            showToast(`Tablonun ilk günü ${selectedDayName} olarak ayarlandı`, 'success');
        });
    }

    // Oturum bilgilerini başlat
    // İlk bilgi güncellemesi
    updateSessionInfo();

    // Her 15 saniyede bir oturum bilgilerini güncelle
    setInterval(() => {
        updateSessionInfo();
    }, DISPLAY_UPDATE_INTERVAL);
});