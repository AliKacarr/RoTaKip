let mercyTabInitialized = false;
let mercyAttentionIntervals = [];

function mercyLoadingMarkup() {
    return '<div class="quote-loading-placeholder" aria-hidden="true">' +
        '<span class="quote-loading-line"></span>' +
        '<span class="quote-loading-line"></span>' +
        '<span class="quote-loading-line"></span>' +
        '</div>';
}

function setMercyTextLoading(element, label) {
    if (!element) return;
    element.classList.remove('visible');
    element.classList.add('is-loading');
    element.setAttribute('aria-busy', 'true');
    element.setAttribute('aria-label', label);
    element.innerHTML = mercyLoadingMarkup();
    const section = element.closest('.quote-section');
    section?.classList.add('is-loading');
    section?.querySelectorAll('.refresh-quote, .share-quote').forEach(button => {
        button.disabled = true;
    });
}

function showMercyText(element, text) {
    if (!element) return;
    element.textContent = text;
    element.classList.remove('is-loading');
    element.classList.add('visible');
    element.removeAttribute('aria-busy');
    element.removeAttribute('aria-label');
    const section = element.closest('.quote-section');
    section?.classList.remove('is-loading');
    section?.querySelectorAll('.refresh-quote, .share-quote').forEach(button => {
        button.disabled = false;
    });
}

async function fetchMercyText(elementId, endpoint, loadingLabel, fallbackText, errorLabel) {
    const element = document.getElementById(elementId);
    if (!element) return;
    setMercyTextLoading(element, loadingLabel);
    try {
        const response = await fetch(endpoint);
        if (!response.ok) throw new Error(`${errorLabel} getirme hatası`);
        const data = await response.json();
        showMercyText(element, data.sentence || fallbackText);
    } catch (error) {
        console.error(`${errorLabel} yüklenemedi:`, error);
        showMercyText(element, fallbackText);
    }
}

function logMercyAction(action) {
    if (typeof window.logUnauthorizedAccess === 'function') {
        window.logUnauthorizedAccess(action);
    }
}

function initializeMercyTab() {
    if (mercyTabInitialized) return;
    mercyTabInitialized = true;
    // Tüm yenileme butonlarını seç

    const refreshQuoteButtons = document.querySelectorAll('.refresh-quote');
    
    // Her buton için animasyonu başlat
    refreshQuoteButtons.forEach(button => {
        const icon = button.querySelector('i');
        if (icon) {
            // Her 30 saniyede bir animasyonu tetikle
            const interval = setInterval(() => {
                icon.classList.add('attention');
                // Animasyon bittikten sonra sınıfı kaldır
                setTimeout(() => {
                    icon.classList.remove('attention');
                }, 1500); // Animasyon süresi kadar bekle
            }, 10000); // 10 saniye
            mercyAttentionIntervals.push(interval);
        }
    });

    // Tüm alıntı metinlerine tıklama olayı ekle
    document.querySelectorAll('.quote-text').forEach(element => {
        if (element.dataset.copyBound === 'true') return;
        element.dataset.copyBound = 'true';
        element.addEventListener('click', async function() {
            if (this.classList.contains('is-loading')) return;
            try {
                // Mevcut yüksekliği kaydet
                const currentHeight = this.offsetHeight;
                this.style.height = currentHeight - 4 + 'px';
                
                // Metni panoya kopyala
                await navigator.clipboard.writeText(this.textContent);
                
                // Kopyalandı bildirimi göster
                const originalText = this.textContent;
                this.textContent = '✓ Kopyalandı!';
                this.style.color = '#4CAF50';
                
                // 1.5 saniye sonra orijinal metne geri dön
                setTimeout(() => {
                    this.textContent = originalText;
                    this.style.color = '#454545';
                    // Yüksekliği tekrar auto yap
                    this.style.height = 'auto';
                }, 1500);
            } catch (err) {
                console.error('Kopyalama hatası:', err);
                // Hata durumunda da yüksekliği auto yap
                this.style.height = 'auto';
            }
        });
    });

    // Kayarak gelme animasyonu script.js → initScrollFadeInElements
    
    // Mevcut içerikleri görünür yap
    document.querySelectorAll('.quote-text').forEach(element => {
        if (!element.classList.contains('is-loading') && element.innerHTML.trim() !== '') {
            element.classList.add('visible');
        }
    });
    
    const refreshBtn = document.getElementById('refreshQuote');
    if (refreshBtn) {
        refreshBtn.onclick = function () {
            fetchRandomQuote();
            logMercyAction('Bir söz yenileme');
            this.classList.add('refresh-quote-spinning');
            setTimeout(() => {
                this.classList.remove('refresh-quote-spinning');
            }, 1000);
        };
    }

    const refreshAyatButton = document.getElementById('refreshAyat');
    if (refreshAyatButton) {
        refreshAyatButton.onclick = function () {
            fetchRandomAyet();
            logMercyAction('Bir ayet yenileme');
            this.classList.add('refresh-quote-spinning');
            setTimeout(() => {
                this.classList.remove('refresh-quote-spinning');
            }, 1000);
        };
    }

    const refreshHadithButton = document.getElementById('refreshHadith');
    if (refreshHadithButton) {
        refreshHadithButton.onclick = function () {
            fetchRandomHadis();
            logMercyAction('Bir hadis yenileme');
            this.classList.add('refresh-quote-spinning');
            setTimeout(() => {
                this.classList.remove('refresh-quote-spinning');
            }, 1000);
        };
    }

    const refreshDuaButton = document.getElementById('refreshDua');
    if (refreshDuaButton) {
        refreshDuaButton.onclick = function () {
            fetchRandomDua();
            logMercyAction('Bir dua yenileme');
            this.classList.add('refresh-quote-spinning');
            setTimeout(() => {
                this.classList.remove('refresh-quote-spinning');
            }, 1000);
        };
    }
}

async function fetchRandomQuote() {
    return fetchMercyText('quoteText', '/api/random-quote', 'Söz yükleniyor', 'Günün sözü yüklenemedi.', 'Bir söz');
}

async function fetchRandomAyet() {
    return fetchMercyText('ayatText', '/api/random-ayet', 'Ayet yükleniyor', 'Ayet yüklenemedi', 'Bir ayet');
}

// Rastgele hadis getirme fonksiyonu
async function fetchRandomHadis() {
    return fetchMercyText('hadithText', '/api/random-hadis', 'Hadis yükleniyor', 'Hadis yüklenemedi', 'Bir hadis');
}

async function fetchRandomDua() {
    return fetchMercyText('duaText', '/api/random-dua', 'Dua yükleniyor', 'Dua yüklenemedi', 'Bir dua');
}

window.RoTaKipMercyTab = {
    init() {
        initializeMercyTab();
        Promise.allSettled([
            fetchRandomAyet(),
            fetchRandomQuote(),
            fetchRandomHadis(),
            fetchRandomDua()
        ]);
    },
    destroy() {
        mercyAttentionIntervals.forEach(interval => clearInterval(interval));
        mercyAttentionIntervals = [];
        mercyTabInitialized = false;
    },
    preload() {
        return Promise.allSettled([
            fetch('/api/random-quote'),
            fetch('/api/random-ayet'),
            fetch('/api/random-hadis'),
            fetch('/api/random-dua')
        ]);
    }
};
