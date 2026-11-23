// ==================== Articles Section JavaScript ====================
// Makaleler sekmesi iki görünümden oluşur: kategori listesi (home) ve seçilen kategorinin
// makale listesi (category). Her kategorinin ilk birkaç makalesi (ve görselleri) sekme açılırken
// önceden hazırlanır; kalan makaleler kategori sayfasında kaydırıldıkça yüklenir.

(function () {
    const TAB_PATH = '/makaleler';
    const HISTORY_MARKER = 'rotakipArticles';
    const PREVIEW_PER_CATEGORY = 4;
    const PAGE_SIZE = 6;
    const IMAGE_WAIT_MS = 1500;
    const FALLBACK_IMAGE = '/images/default-article.png';

    function prefersReducedMotion() {
        return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    function connectionAllowsPreparation() {
        const connection = navigator.connection;
        if (!connection) return true;
        return !connection.saveData && !['slow-2g', '2g'].includes(connection.effectiveType);
    }

    function logArticleAction(label) {
        if (typeof window.logUnauthorizedAccess === 'function') window.logUnauthorizedAccess(label);
    }

    // Kategori sayfası açıldığında yalnızca yönetici panelindeki (admin.html) etkinlik kayıtlarına
    // yazılır; sekmenin kendi açılışı kabuk tarafından ayrıca kaydedilir. Hata sessizce yutulur.
    async function logCategoryView(slug) {
        if (!slug) return;
        const payload = JSON.stringify({
            action: 'makaleler_kategori_görüntüleme',
            view: 'category',
            section: slug,
            deviceInfo: {
                userAgent: navigator.userAgent,
                screenWidth: window.screen.width,
                screenHeight: window.screen.height
            }
        });
        for (const endpoint of ['/api/visit-event', '/api/log-visit']) {
            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: payload,
                    keepalive: true
                });
                if (response.ok) return;
            } catch (_error) {
                // Reklam engelleyici / ağ hatası: bir sonraki uç noktayı dene.
            }
        }
    }

    class ArticlesManager {
        constructor() {
            this.page = null;
            this.container = null;
            this.statusElement = null;
            this.sentinel = null;
            this.titleElement = null;
            this.countElement = null;
            this.cards = new Map();
            this.categoryBySlug = new Map();
            this.entries = new Map();
            this.imageLoads = new Map();
            this.previewPromise = null;
            this.currentCategory = null;
            this.currentView = 'home';
            this.renderSequence = 0;
            this.loadingMore = false;
            this.observer = null;

            this.ready = this.init();
        }

        async init() {
            this.page = document.querySelector('.articles');
            if (!this.page) return this;
            this.container = this.page.querySelector('#articlesContainer');
            this.statusElement = this.page.querySelector('#articlesStatus');
            this.sentinel = this.page.querySelector('#articlesSentinel');
            this.titleElement = this.page.querySelector('#articlesCategoryTitle');
            this.countElement = this.page.querySelector('#articlesCategoryCount');
            this.page.querySelectorAll('.articles-category-card').forEach(button => {
                this.cards.set(button.dataset.category, button);
                this.categoryBySlug.set(button.dataset.slug, button.dataset.category);
            });

            this.bindEvents();
            // Kategori listesi statik olduğundan beklenmez; makale verisi hemen arka planda istenir.
            this.loadPreview().catch(error => console.warn('Makale önizlemeleri hazırlanamadı:', error));
            // Kategori sayfası doğrudan açılsa bile başlık hemen görünür; makaleler hazır olunca dolar.
            this.render(this.readRoute(), { animate: false });
            this.schedulePreparation();
            return this;
        }

        // ---------- Yönlendirme ----------

        // URL biçimi: /makaleler, /makaleler?kategori=kader
        readRoute() {
            if (window.location.pathname.replace(/\/$/, '') !== TAB_PATH) return { view: 'home' };
            const slug = new URLSearchParams(window.location.search).get('kategori');
            const category = slug ? this.categoryBySlug.get(slug) : null;
            return category ? { view: 'category', category } : { view: 'home' };
        }

        routeUrl(route) {
            if (route.view !== 'category') return TAB_PATH;
            const button = this.cards.get(route.category);
            return `${TAB_PATH}?kategori=${encodeURIComponent(button?.dataset.slug || '')}`;
        }

        openCategory(category) {
            const route = { view: 'category', category };
            window.history.pushState({ [HISTORY_MARKER]: true }, '', this.routeUrl(route));
            window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
            this.render(route, { animate: true });
        }

        back() {
            // Sekme içinde açılan kategoride tarayıcı geçmişi kullanılır; doğrudan açılan
            // bağlantıda ise geçmişten çıkmamak için kategori listesine geçilir.
            if (window.history.state?.[HISTORY_MARKER]) {
                window.history.back();
                return;
            }
            window.history.replaceState({}, '', TAB_PATH);
            this.render({ view: 'home' }, { animate: true });
        }

        async resume() {
            const route = this.readRoute();
            const alreadyShown = route.view === this.currentView
                && (route.view === 'home' || route.category === this.currentCategory);
            if (alreadyShown) {
                this.observeSentinel();
                return;
            }
            this.render(route, { animate: true });
        }

        suspend() {
            this.observer?.disconnect();
        }

        bindEvents() {
            this.page.addEventListener('click', event => {
                if (event.target.closest('[data-back]')) {
                    this.back();
                    return;
                }
                if (event.target.closest('[data-retry]')) {
                    this.retry();
                    return;
                }
                const card = event.target.closest('.articles-category-card');
                if (card) {
                    logArticleAction('Makale kategori değiştirme');
                    this.openCategory(card.dataset.category);
                }
            });
        }

        // ---------- Veri ----------

        loadPreview() {
            if (!this.previewPromise) {
                const url = `/api/articles/preview?perCategory=${PREVIEW_PER_CATEGORY}`;
                this.previewPromise = fetch(url, { headers: { Accept: 'application/json' } })
                    .then(response => {
                        if (!response.ok) throw new Error('Makaleler yüklenemedi');
                        return response.json();
                    })
                    .then(data => {
                        (data.categories || []).forEach(item => {
                            if (this.entries.has(item.category)) return;
                            const articles = Array.isArray(item.articles) ? item.articles : [];
                            const total = Number(item.total) || 0;
                            this.entries.set(item.category, { articles, total, hasMore: articles.length < total });
                        });
                        return data;
                    })
                    .catch(error => {
                        this.previewPromise = null;
                        throw error;
                    });
            }
            return this.previewPromise;
        }

        async fetchPage(category, offset, limit) {
            const params = new URLSearchParams({ category, offset: String(offset), limit: String(limit) });
            const response = await fetch(`/api/articles?${params.toString()}`, {
                headers: { Accept: 'application/json' }
            });
            if (!response.ok) throw new Error('Makaleler yüklenemedi');
            const data = await response.json();
            return {
                articles: Array.isArray(data.articles) ? data.articles : [],
                total: Number(data.total) || 0,
                hasMore: Boolean(data.hasMore)
            };
        }

        async ensureCategory(category) {
            let entry = this.entries.get(category);
            if (entry) return entry;

            let previewLoaded = false;
            try {
                await this.loadPreview();
                previewLoaded = true;
            } catch (_error) {
                // Önizleme alınamadıysa kategori sayfası doğrudan istenir.
            }
            entry = this.entries.get(category);
            if (entry) return entry;
            if (previewLoaded) {
                entry = { articles: [], total: 0, hasMore: false };
            } else {
                const page = await this.fetchPage(category, 0, PREVIEW_PER_CATEGORY);
                entry = { articles: page.articles, total: page.total, hasMore: page.hasMore };
            }
            this.entries.set(category, entry);
            return entry;
        }

        imageUrlFor(article) {
            return window.safeExternalUrl(article.image_url, FALLBACK_IMAGE);
        }

        preloadImage(url) {
            if (!url) return Promise.resolve();
            if (!this.imageLoads.has(url)) {
                this.imageLoads.set(url, new Promise(resolve => {
                    const image = new Image();
                    image.decoding = 'async';
                    image.referrerPolicy = 'no-referrer';
                    image.onload = resolve;
                    image.onerror = resolve;
                    image.src = url;
                }));
            }
            return this.imageLoads.get(url);
        }

        // Görseller gecikirse kullanıcı sonsuza kadar beklemesin diye süre sınırı vardır.
        async waitForImages(articles) {
            const loads = Promise.all(articles.map(article => this.preloadImage(this.imageUrlFor(article))));
            let timer = null;
            const timeout = new Promise(resolve => { timer = window.setTimeout(resolve, IMAGE_WAIT_MS); });
            await Promise.race([loads, timeout]);
            window.clearTimeout(timer);
        }

        // Kategori listesi açıkken boşta kalınca her kategorinin ilk makale görselleri sırayla indirilir.
        async prepareContent() {
            if (!connectionAllowsPreparation()) return;
            const data = await this.loadPreview();
            for (const item of data.categories || []) {
                for (const article of item.articles || []) {
                    await this.preloadImage(this.imageUrlFor(article));
                }
            }
        }

        schedulePreparation() {
            const run = () => this.prepareContent()
                .catch(error => console.warn('Makale görselleri hazırlanamadı:', error));
            if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 2000 });
            else window.setTimeout(run, 600);
        }

        // ---------- Görünümler ----------

        // Kategori sayfasının başlığı hemen açılır; makaleler ve görselleri hazır olana kadar
        // `articlesContainer` içinde yükleme animasyonu görünür, hazır olunca kartlar efektle gelir.
        // Dönen söz içerik dolunca çözülür; çağıranlar beklemek zorunda değildir.
        render(route, options = {}) {
            const sequence = ++this.renderSequence;
            if (route.view !== 'category') {
                this.showHome(options);
                return Promise.resolve(true);
            }
            this.showCategoryLoading(route.category, options);
            // İçerik yüklenmesini beklemeden kaydedilir; yavaş bağlantıda ya da hatada da açıldığı görünür.
            if (options.log !== false) logCategoryView(this.cards.get(route.category)?.dataset.slug);
            return this.fillCategory(route.category, sequence);
        }

        async fillCategory(category, sequence) {
            let entry = null;
            try {
                entry = await this.ensureCategory(category);
                await this.waitForImages(entry.articles);
            } catch (error) {
                console.warn('Makale kategorisi yüklenemedi:', error);
                entry = null;
            }
            if (sequence !== this.renderSequence) return false;

            this.showCategoryContent(entry);
            return true;
        }

        setView(name, options = {}) {
            const previous = this.currentView;
            this.currentView = name;
            let shown = null;
            this.page.querySelectorAll(':scope > .articles-view').forEach(view => {
                const visible = view.dataset.view === name;
                view.hidden = !visible;
                view.classList.remove('is-entering');
                if (visible) shown = view;
            });
            if (shown && options.animate && previous !== name && !prefersReducedMotion()) {
                void shown.offsetWidth;
                shown.classList.add('is-entering');
            }
        }

        showHome(options) {
            this.observer?.disconnect();
            this.currentCategory = null;
            this.setView('home', options);
        }

        createLoader() {
            const loader = document.createElement('div');
            loader.className = 'articles-loader';
            loader.setAttribute('aria-hidden', 'true');
            for (let index = 0; index < 3; index += 1) loader.appendChild(document.createElement('span'));
            return loader;
        }

        showCategoryLoading(category, options) {
            this.observer?.disconnect();
            this.currentCategory = category;
            this.loadingMore = false;
            this.titleElement.textContent = category;
            this.updateCount(this.entries.get(category));
            this.hideStatus();
            this.container.replaceChildren(this.createLoader());
            this.container.setAttribute('aria-busy', 'true');
            this.setView('category', options);
        }

        showCategoryContent(entry) {
            this.updateCount(entry);
            this.container.replaceChildren();
            this.container.removeAttribute('aria-busy');
            this.hideStatus();

            if (!entry) {
                this.showStatus('Makaleler yüklenemedi.', { retry: true });
            } else if (entry.articles.length === 0) {
                this.showStatus('Bu kategoride henüz makale yok.');
            } else {
                entry.articles.forEach((article, index) => {
                    this.container.appendChild(this.createArticleCard(article, index));
                });
            }

            this.observeSentinel();
        }

        // Başlığın sağında kategorideki toplam makale sayısı ("(4 içerik)") yazar.
        updateCount(entry) {
            const total = entry ? Math.max(entry.total, entry.articles.length) : 0;
            this.countElement.textContent = `(${total} içerik)`;
            this.countElement.hidden = !entry || total === 0;
        }

        showStatus(message, options = {}) {
            const element = this.statusElement;
            element.replaceChildren();
            if (options.loading) {
                // Kaydırdıkça yüklerken aynı üç nokta animasyonu küçük boyutta kullanılır.
                const loader = this.createLoader();
                loader.classList.add('is-compact');
                element.appendChild(loader);
                element.classList.remove('is-error');
                element.hidden = false;
                return;
            }
            const text = document.createElement('span');
            text.textContent = message;
            element.appendChild(text);
            if (options.retry) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'articles-retry';
                button.dataset.retry = '';
                button.textContent = 'Yeniden dene';
                element.appendChild(button);
            }
            element.classList.toggle('is-error', Boolean(options.retry));
            element.hidden = false;
        }

        hideStatus() {
            this.statusElement.hidden = true;
            this.statusElement.replaceChildren();
        }

        retry() {
            if (!this.currentCategory) return;
            const entry = this.entries.get(this.currentCategory);
            if (entry && entry.articles.length > 0) {
                // Sayfa eklenirken hata aldıysa yalnızca kalan makaleler yeniden istenir.
                this.hideStatus();
                this.observeSentinel();
                this.loadMore();
                return;
            }
            // "Yeniden dene" aynı kategorinin ikinci kez açıldığı anlamına gelmez; tekrar kaydedilmez.
            this.render({ view: 'category', category: this.currentCategory }, { animate: false, log: false });
        }

        // ---------- Kaydırdıkça yükleme ----------

        observeSentinel() {
            this.observer?.disconnect();
            const entry = this.entries.get(this.currentCategory);
            if (this.currentView !== 'category' || !entry || !entry.hasMore || !this.sentinel) return;
            this.observer = new IntersectionObserver(items => {
                if (items.some(item => item.isIntersecting)) this.loadMore();
            }, { rootMargin: '300px 0px' });
            this.observer.observe(this.sentinel);
        }

        async loadMore() {
            const category = this.currentCategory;
            const entry = this.entries.get(category);
            if (!entry || !entry.hasMore || this.loadingMore) return;

            this.loadingMore = true;
            this.observer?.disconnect();
            this.showStatus('', { loading: true });
            try {
                const page = await this.fetchPage(category, entry.articles.length, PAGE_SIZE);
                const known = new Set(entry.articles.map(article => article.id));
                const fresh = page.articles.filter(article => !known.has(article.id));
                entry.articles.push(...fresh);
                entry.total = page.total;
                entry.hasMore = page.hasMore && fresh.length > 0;
                await this.waitForImages(fresh);
                if (this.currentCategory !== category) return;
                fresh.forEach((article, index) => {
                    this.container.appendChild(this.createArticleCard(article, index));
                });
                this.hideStatus();
            } catch (error) {
                console.warn('Daha fazla makale yüklenemedi:', error);
                if (this.currentCategory === category) {
                    this.showStatus('Daha fazla makale yüklenemedi.', { retry: true });
                }
                return;
            } finally {
                this.loadingMore = false;
            }
            if (this.currentCategory === category) this.observeSentinel();
        }

        // ---------- Kart ----------

        createArticleCard(article, index = 0) {
            const card = document.createElement('div');
            card.className = 'article-card is-entering';
            card.style.setProperty('--card-index', String(index));
            const title = window.escapeHtml(article.title);
            const imageUrl = this.imageUrlFor(article);
            const destinationUrl = window.safeExternalUrl(article.destination_url);
            const categoryUrl = window.safeExternalUrl(article.category_url);
            const category = window.escapeHtml(article.category || 'Makale');

            if (destinationUrl) {
                card.setAttribute('role', 'link');
                card.setAttribute('tabindex', '0');
                card.setAttribute('aria-label', `${article.title || 'Makale'} makalesini aç`);
            }

            card.innerHTML = `
            <div class="article-content-wrapper">
                <div class="article-card-header">
                    <div class="article-image">
                        <img alt="${title}" decoding="async" referrerpolicy="no-referrer">
                    </div>
                    <div class="article-content">
                        <div class="article-meta-row">
                            <button class="article-category" type="button">${category}</button>
                            <button class="article-share" type="button" aria-label="Makaleyi paylaş">
                                <svg class="article-share-icon" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
                                </svg>
                            </button>
                        </div>
                        <div class="article-title">${title}</div>
                    </div>
                </div>
                <div class="article-text">${window.escapeHtml(article.text || '')}</div>
            </div>
        `;

            const image = card.querySelector('.article-image img');
            image.addEventListener('error', () => {
                const fallback = new URL(FALLBACK_IMAGE, window.location.origin).href;
                if (image.src !== fallback) {
                    image.closest('.article-image').classList.add('is-fallback');
                    image.src = fallback;
                }
            });
            image.src = imageUrl;

            card.querySelector('.article-category').addEventListener('click', () => {
                if (categoryUrl) window.open(categoryUrl, '_blank', 'noopener');
            });
            card.querySelector('.article-share').addEventListener('click', event => {
                event.stopPropagation();
                if (destinationUrl) window.shareArticle(destinationUrl, String(article.title || ''));
            });

            card.addEventListener('click', event => {
                // Kategori ve paylaş düğmeleri kendi işlemlerini yapar.
                if (event.target.closest('.article-category') || event.target.closest('.article-share')) return;
                logArticleAction('Makale kartına tıklama');
                if (destinationUrl) window.open(destinationUrl, '_blank', 'noopener');
            });

            card.addEventListener('keydown', event => {
                if (!destinationUrl || event.target !== card) return;
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    window.open(destinationUrl, '_blank', 'noopener');
                }
            });

            return card;
        }
    }

    // Global share fonksiyonu
    window.shareArticle = async function (url, title) {
        try {
            if (navigator.share) {
                await navigator.share({ title, url });
                showShareToast('Link panoya kopyalandı!');
            } else {
                await navigator.clipboard.writeText(url);
                showShareToast('Link panoya kopyalandı!');
            }
        } catch (error) {
            console.error('Paylaşım hatası:', error);

            // Fallback: clipboard'a kopyala
            try {
                await navigator.clipboard.writeText(url);
                showShareToast('Link panoya kopyalandı!');
            } catch (_clipboardError) {
                showShareToast('Paylaşım başarısız!');
            }
        }
    };

    // Toast mesajı fonksiyonu
    function showShareToast(message) {
        const existingToast = document.querySelector('.share-toast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = 'share-toast share-success';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('share-hide');
            setTimeout(() => {
                if (toast.parentNode) toast.remove();
            }, 300);
        }, 3000);
    }

    window.ArticlesManager = ArticlesManager;
    window.RoTaKipArticlesTab = {
        prepareBeforeReveal: true,
        async init() {
            if (!window.articlesManager) {
                window.articlesManager = new ArticlesManager();
            }
            await window.articlesManager.ready;
            return window.articlesManager;
        },
        async resume() {
            const manager = await this.init();
            await manager.resume();
        },
        destroy() {
            // Makale DOM'u sekme önbelleğinde korunur; yalnızca kaydırma gözlemcisi bırakılır.
            window.articlesManager?.suspend();
        }
    };
})();
