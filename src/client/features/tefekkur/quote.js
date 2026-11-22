let tefekkurTabInitialized = false;
let tefekkurAttentionIntervals = [];
let pendingTefekkurContent = null;
let tefekkurRequestGeneration = 0;

const tefekkurContentItems = [
    { elementId: 'ayatText', endpoint: '/api/random-ayet', fallbackText: 'Ayet yüklenemedi', errorLabel: 'Bir ayet' },
    { elementId: 'quoteText', endpoint: '/api/random-quote', fallbackText: 'Günün sözü yüklenemedi.', errorLabel: 'Bir söz' },
    { elementId: 'hadithText', endpoint: '/api/random-hadis', fallbackText: 'Hadis yüklenemedi', errorLabel: 'Bir hadis' },
    { elementId: 'duaText', endpoint: '/api/random-dua', fallbackText: 'Dua yüklenemedi', errorLabel: 'Bir dua' }
];

function tefekkurLoadingMarkup() {
    return '';
}

function setTefekkurTextLoading(element, label) {
    if (!element) return;
    element.classList.remove('visible');
    element.classList.add('is-loading');
    element.setAttribute('aria-busy', 'true');
    element.setAttribute('aria-label', label);
    element.innerHTML = tefekkurLoadingMarkup();
    const section = element.closest('.quote-section');
    section?.classList.add('is-loading');
    section?.querySelectorAll('.refresh-quote, .share-quote').forEach(button => {
        button.disabled = true;
    });
}

function showTefekkurText(element, text) {
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

async function requestTefekkurText(endpoint, fallbackText, errorLabel) {
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error(`${errorLabel} getirme hatası`);
    const data = await response.json();
    return data.sentence || fallbackText;
}

async function fetchTefekkurText(elementId, endpoint, loadingLabel, fallbackText, errorLabel) {
    const element = document.getElementById(elementId);
    if (!element) return;
    const requestGeneration = tefekkurRequestGeneration;
    const hasExistingText = !element.classList.contains('is-loading') && element.textContent.trim() !== '';
    if (!hasExistingText) setTefekkurTextLoading(element, loadingLabel);
    try {
        const text = await requestTefekkurText(endpoint, fallbackText, errorLabel);
        if (requestGeneration !== tefekkurRequestGeneration) return;
        if (typeof window.waitForRoutePlaceholder === 'function') {
            await window.waitForRoutePlaceholder(element);
        }
        if (requestGeneration !== tefekkurRequestGeneration) return;
        showTefekkurText(element, text);
    } catch (error) {
        if (requestGeneration !== tefekkurRequestGeneration) return;
        console.error(`${errorLabel} yüklenemedi:`, error);
        if (!hasExistingText) {
            if (typeof window.waitForRoutePlaceholder === 'function') {
                await window.waitForRoutePlaceholder(element);
            }
            showTefekkurText(element, fallbackText);
        }
    }
}

function prepareTefekkurContent() {
    return Promise.all(tefekkurContentItems.map(async item => {
        try {
            const text = await requestTefekkurText(item.endpoint, item.fallbackText, item.errorLabel);
            return { elementId: item.elementId, text };
        } catch (error) {
            console.error(`${item.errorLabel} arka planda hazırlanamadı:`, error);
            return { elementId: item.elementId, text: null };
        }
    }));
}

function startTefekkurContentPreparation() {
    if (!pendingTefekkurContent) pendingTefekkurContent = prepareTefekkurContent();
    return pendingTefekkurContent;
}

async function resumeTefekkurTab() {
    initializeTefekkurTab();
    const requestGeneration = tefekkurRequestGeneration;
    const preparation = startTefekkurContentPreparation();
    const imagePreparation = typeof window.initializeHomeTefekkurWindow === 'function'
        ? window.initializeHomeTefekkurWindow()
        : Promise.resolve();
    const [content] = await Promise.all([preparation, imagePreparation]);
    if (pendingTefekkurContent === preparation) pendingTefekkurContent = null;
    if (requestGeneration !== tefekkurRequestGeneration) return;
    content.forEach(({ elementId, text }) => {
        if (text !== null) showTefekkurText(document.getElementById(elementId), text);
    });
}

function logTefekkurAction(action) {
    if (typeof window.logUnauthorizedAccess === 'function') {
        window.logUnauthorizedAccess(action);
    }
}

function applyTefekkurFilter(filter) {
    const selected = filter || 'all';
    document.querySelectorAll('.tefekkur-filter-btn').forEach(button => {
        const isActive = button.dataset.filter === selected;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });
    document.querySelectorAll('.quote [data-category], .home-tefekkur-window[data-category]').forEach(element => {
        element.hidden = selected !== 'all' && element.dataset.category !== selected;
    });
    document.querySelector('.quote-grid-container')?.classList.toggle('is-single', selected !== 'all');
}

function initializeTefekkurFilters() {
    const filters = document.querySelector('.tefekkur-filters');
    if (!filters) return;
    if (filters.dataset.filterBound !== 'true') {
        filters.dataset.filterBound = 'true';
        filters.addEventListener('click', event => {
            const button = event.target.closest('.tefekkur-filter-btn');
            if (!button) return;
            applyTefekkurFilter(button.dataset.filter);
            logTefekkurAction(`Tefekkür filtresi: ${button.textContent.trim()}`);
        });
    }
    applyTefekkurFilter(filters.querySelector('.tefekkur-filter-btn.active')?.dataset.filter);
}

function initializeTefekkurTab() {
    if (tefekkurTabInitialized) return;
    tefekkurTabInitialized = true;
    initializeTefekkurFilters();
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
            tefekkurAttentionIntervals.push(interval);
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

    // Kayarak gelme animasyonu group-bootstrap.js → initScrollFadeInElements

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
            logTefekkurAction('Bir söz yenileme');
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
            logTefekkurAction('Bir ayet yenileme');
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
            logTefekkurAction('Bir hadis yenileme');
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
            logTefekkurAction('Bir dua yenileme');
            this.classList.add('refresh-quote-spinning');
            setTimeout(() => {
                this.classList.remove('refresh-quote-spinning');
            }, 1000);
        };
    }
}

async function fetchRandomQuote() {
    return fetchTefekkurText('quoteText', '/api/random-quote', 'Söz yükleniyor', 'Günün sözü yüklenemedi.', 'Bir söz');
}

async function fetchRandomAyet() {
    return fetchTefekkurText('ayatText', '/api/random-ayet', 'Ayet yükleniyor', 'Ayet yüklenemedi', 'Bir ayet');
}

// Rastgele hadis getirme fonksiyonu
async function fetchRandomHadis() {
    return fetchTefekkurText('hadithText', '/api/random-hadis', 'Hadis yükleniyor', 'Hadis yüklenemedi', 'Bir hadis');
}

async function fetchRandomDua() {
    return fetchTefekkurText('duaText', '/api/random-dua', 'Dua yükleniyor', 'Dua yüklenemedi', 'Bir dua');
}

window.RoTaKipTefekkurTab = {
    prepareBeforeReveal: true,
    init() {
        initializeTefekkurTab();
        return Promise.allSettled([
            fetchRandomAyet(),
            fetchRandomQuote(),
            fetchRandomHadis(),
            fetchRandomDua(),
            typeof window.initializeHomeTefekkurWindow === 'function'
                ? window.initializeHomeTefekkurWindow()
                : Promise.resolve()
        ]);
    },
    resume: resumeTefekkurTab,
    destroy() {
        tefekkurRequestGeneration += 1;
        startTefekkurContentPreparation();
        tefekkurAttentionIntervals.forEach(interval => clearInterval(interval));
        tefekkurAttentionIntervals = [];
        tefekkurTabInitialized = false;
    },
    preload() {
        return prepareTefekkurContent();
    }
};
