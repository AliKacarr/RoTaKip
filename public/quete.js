let mercyTabInitialized = false;
let mercyAttentionIntervals = [];

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
        if (element.innerHTML.trim() !== '') {
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
    try {
        const quoteTextElement = document.getElementById('quoteText');
        if (quoteTextElement) {
            // Önce visible sınıfını kaldır (gizle)
            quoteTextElement.classList.remove('visible');
            
            const response = await fetch('/api/random-quote');
            const data = await response.json();

            // Update with the new quote
            quoteTextElement.textContent = data.sentence;
            
            // Animasyonu tetikle
            setTimeout(() => {
                quoteTextElement.classList.add('visible');
            }, 50);
        }
    } catch (error) {
        console.error('Bir söz yüklenemedi:', error);
        const quoteTextElement = document.getElementById('quoteText');
        if (quoteTextElement) {
            quoteTextElement.textContent = 'Günün sözü yüklenemedi.';
            quoteTextElement.classList.add('visible');
        }
    }
}

async function fetchRandomAyet() {
    try {
        const ayatTextElement = document.getElementById('ayatText');
        if (ayatTextElement) {
            // Önce visible sınıfını kaldır (gizle)
            ayatTextElement.classList.remove('visible');
            
            const response = await fetch('/api/random-ayet');
            if (!response.ok) {
                throw new Error('Ayet getirme hatası');
            }
            const data = await response.json();

            // Ayet metnini sayfada göster
            ayatTextElement.textContent = data.sentence || 'Ayet yüklenemedi';
            
            // Animasyonu tetikle
            setTimeout(() => {
                ayatTextElement.classList.add('visible');
            }, 50);
        }
    } catch (error) {
        console.error('Bir ayet yüklenemedi:', error);
        const ayatTextElement = document.getElementById('ayatText');
        if (ayatTextElement) {
            ayatTextElement.textContent = 'Ayet yüklenemedi';
            ayatTextElement.classList.add('visible');
        }
    }
}

// Rastgele hadis getirme fonksiyonu
async function fetchRandomHadis() {
    try {
        const hadithTextElement = document.getElementById('hadithText');
        if (hadithTextElement) {
            // Önce visible sınıfını kaldır (gizle)
            hadithTextElement.classList.remove('visible');
            
            const response = await fetch('/api/random-hadis');
            if (!response.ok) {
                throw new Error('Hadis getirme hatası');
            }
            const data = await response.json();

            // Hadis metnini sayfada göster
            hadithTextElement.textContent = data.sentence || 'Hadis yüklenemedi';
            
            // Animasyonu tetikle
            setTimeout(() => {
                hadithTextElement.classList.add('visible');
            }, 50);
        }
    } catch (error) {
        console.error('Bir hadis yüklenemedi:', error);
        const hadithTextElement = document.getElementById('hadithText');
        if (hadithTextElement) {
            hadithTextElement.textContent = 'Hadis yüklenemedi';
            hadithTextElement.classList.add('visible');
        }
    }
}

async function fetchRandomDua() {
    try {
        const duaTextElement = document.getElementById('duaText');
        if (duaTextElement) {
            // Önce visible sınıfını kaldır (gizle)
            duaTextElement.classList.remove('visible');
            
            const response = await fetch('/api/random-dua');
            if (!response.ok) {
                throw new Error('Dua getirme hatası');
            }
            const data = await response.json();

            // Dua metnini sayfada göster
            duaTextElement.textContent = data.sentence || 'Dua yüklenemedi';
            
            // Animasyonu tetikle
            setTimeout(() => {
                duaTextElement.classList.add('visible');
            }, 50);
        }
    } catch (error) {
        console.error('Bir dua yüklenemedi:', error);
        const duaTextElement = document.getElementById('duaText');
        if (duaTextElement) {
            duaTextElement.textContent = 'Dua yüklenemedi';
            duaTextElement.classList.add('visible');
        }
    }
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
