// ==================== Videolar: önizlemeli akış ====================
// Takip edilen kanalların en yeni videoları listelenir. 5 saniye izlenmiş videolar akışta tekrar
// önerilmez (Hesabım > Geçmiş'te durur); izlenen kısım kırmızı ilerleme çubuğuyla görünür.
// Üstteki çiplerle tek bir kanala süzülebilir. Görünürdeki kart sessiz olarak önizlenir.

(function () {
    const ns = window.RoTaKipVideos;
    const PAGE_SIZE = 12;
    const MIN_VISIBLE_PER_PAGE = 4;
    const MAX_AUTO_PAGES = 4;
    const SHELF_AFTER = 3;
    const SHELF_SIZE = 4;
    const PREVIEW_HOVER_DELAY_MS = 250;
    const PREVIEW_SCROLL_IDLE_MS = 150;
    // YouTube'un mobil oynatıcı arayüzü her oynatma başında yaklaşık 3 sn ortada bir duraklat simgesi
    // gösterir ve bunu kapatmanın yolu yoktur. Dokunmatik cihazlarda video bu süre boyunca gizli oynar;
    // küçük resim görünür kalır, simge kaybolunca video yumuşakça açılır.
    const PREVIEW_TOUCH_REVEAL_DELAY_MS = 2600;
    const PREVIEW_TICK_MS = 250;
    const PREVIEW_MAX_MS = 30 * 1000;

    // YouTube'daki gibi alt satır: "▷ 466 B   4 ay önce" (kanal adı bir üst satırda).
    function statsHtml(video) {
        const date = ns.formatRelativeDate(video.publishedAt);
        return `<span class="videos-card-stats">
            <span class="videos-card-views"><svg class="videos-card-play" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false"><path d="M7 4.5v15l12.5-7.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>${ns.escape(ns.formatViewsCompact(video.views))}<span class="videos-sr-only"> görüntüleme</span></span>
            ${date ? `<span class="videos-card-date">${ns.escape(date)}</span>` : ''}
        </span>`;
    }

    function cardHtml(video, index) {
        const id = ns.escape(video.id);
        const title = ns.escape(video.title);
        const href = ns.escape(ns.watchUrl(video.id));
        return `<article class="videos-card is-entering" data-video-id="${id}" style="--card-index:${index % 6}">
            <a class="videos-card-thumb" href="${href}" data-open-video="${id}" aria-label="${title}">
                <img src="${ns.escape(ns.thumbnailUrl(video.id))}" alt="" loading="${index < 2 ? 'eager' : 'lazy'}" decoding="async" referrerpolicy="no-referrer">
                ${ns.durationBadgeHtml(video)}
                ${ns.progressHtml(video.id)}
            </a>
            <div class="videos-card-body">
                <a class="videos-card-title" href="${href}" data-open-video="${id}">${title}</a>
                <div class="videos-card-row">
                    <button type="button" class="videos-card-channel" data-channel-filter="${ns.escape(video.channelId)}" aria-label="${ns.escape(video.channelName)} kanalının videoları">
                        ${ns.avatarHtml(video.channelId, video.channelName)}
                    </button>
                    <div class="videos-card-meta">
                        <span class="videos-card-channel-name">${ns.escape(ns.channelHandleLabel(video.channelId, video.channelName))}</span>
                        ${statsHtml(video)}
                    </div>
                    <div class="videos-card-actions">
                        ${ns.iconButtonHtml({ action: 'like', ...ns.LIKE_ICONS, label: 'Beğen', active: ns.store.isLiked(video.id), videoId: video.id })}
                        ${ns.iconButtonHtml({ action: 'save', ...ns.SAVE_ICONS, label: 'Kaydet', active: ns.store.isSaved(video.id), videoId: video.id })}
                        ${ns.iconButtonHtml({ action: 'menu', icon: 'fa-solid fa-ellipsis', label: 'Diğer seçenekler', videoId: video.id })}
                    </div>
                </div>
            </div>
        </article>`;
    }

    // "Yeni" rozeti: son iki gün içinde yüklenen Shorts videoları.
    const SHORT_NEW_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

    function isNewShort(video) {
        const time = Date.parse(video.publishedAt);
        return Number.isFinite(time) && Date.now() - time < SHORT_NEW_WINDOW_MS;
    }

    ns.shortTileHtml = function shortTileHtml(video) {
        const id = ns.escape(video.id);
        return `<div class="videos-short-tile">
            <a class="videos-short-tile-link" href="${ns.escape(ns.shortsUrl(video.id))}" data-open-short="${id}" aria-label="${ns.escape(video.title)}">
                <img src="${ns.escape(ns.thumbnailUrl(video.id))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
                ${isNewShort(video) ? '<span class="videos-short-tile-new">Yeni</span>' : ''}
                <span class="videos-short-tile-title">${ns.escape(video.title)}</span>
                ${ns.progressHtml(video.id)}
            </a>
            <button type="button" class="videos-short-tile-more" data-action="shelf-menu" aria-label="Shorts seçenekleri" aria-haspopup="menu"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></button>
        </div>`;
    };

    function shelfHtml(shorts) {
        return `<section class="videos-shorts-shelf" aria-label="Shorts">
            <div class="videos-shorts-head">
                <a class="videos-shorts-heading" href="${ns.escape(ns.shortsUrl())}" data-open-short="">Shorts</a>
                <button type="button" class="videos-shorts-more" data-action="shelf-menu" aria-label="Shorts seçenekleri" aria-haspopup="menu"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></button>
            </div>
            <div class="videos-shorts-grid">${shorts.map(ns.shortTileHtml).join('')}</div>
        </section>`;
    }

    const feed = {
        root: null,
        list: null,
        sectionsNav: null,
        status: null,
        sentinel: null,
        home: null,
        channelId: '',
        excludeKey: '',
        cursor: null,
        hasMore: false,
        loading: false,
        loadingToken: null,
        rendered: false,
        renderedFromCache: false,
        ids: new Set(),
        cardCount: 0,
        shelfInserted: false,
        sequence: 0,
        observer: null,
        active: false,

        init(page) {
            this.root = page.querySelector('[data-view="feed"]');
            this.list = page.querySelector('#videosFeed');
            this.sectionsNav = page.querySelector('.videos-sections');
            this.status = page.querySelector('#videosFeedStatus');
            this.sentinel = page.querySelector('#videosFeedSentinel');
            this.preview.init(this);
        },

        // Ana akış (önbellekten ya da sunucudan) geldiğinde ilk sayfa çizilir. Kullanıcı akışı
        // kaydırmaya başladıysa taze veri ekranı oynatmaz; bir sonraki açılışta kullanılır.
        setHome(home, { fromCache = false } = {}) {
            const previousIds = this.home?.videos?.videos?.map(video => video.id).join(',');
            this.home = home;
            this.renderChannelTabs();
            if (this.channelId) return;
            const nextIds = home.videos?.videos?.map(video => video.id).join(',');
            const userIsBrowsing = this.active && (window.scrollY > 80 || this.cardCount > PAGE_SIZE);
            if (this.rendered && (previousIds === nextIds || userIsBrowsing)) {
                this.renderedFromCache = this.renderedFromCache && fromCache;
                return;
            }
            this.renderFirstPage({ fromCache });
        },

        // Kanal seçimi bölüm sekmelerinin sonundaki açılır liste (combobox) ile yapılır. Varsayılan "Tümü";
        // liste yalnız takip edilen kanalları içerir.
        followedChannels() {
            return [...ns.channels.values()].filter(channel => ns.store.isFollowing(channel.id));
        },

        renderChannelTabs() {
            const nav = this.sectionsNav;
            if (!nav) return;
            let select = nav.querySelector('.videos-channel-select');
            const channels = this.followedChannels();
            if (!channels.length) {
                select?.remove();
                this.closeChannelMenu();
                return;
            }
            if (!select) {
                nav.insertAdjacentHTML('beforeend', `<button type="button" class="videos-channel-select" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="videosChannelMenu" aria-label="Kanal seç">
                    <span class="videos-channel-select-label">Tümü</span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
                </button>`);
                select = nav.querySelector('.videos-channel-select');
                select.addEventListener('click', () => this.toggleChannelMenu());
                select.addEventListener('keydown', event => {
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                        event.preventDefault();
                        this.openChannelMenu();
                    }
                });
            }
            this.channelSelect = select;
            this.syncChannelSelect();
            if (this.channelMenu) this.fillChannelMenu();
        },

        syncChannelSelect() {
            const select = this.channelSelect || this.sectionsNav?.querySelector('.videos-channel-select');
            if (!select) return;
            const name = this.channelId ? (ns.channels.get(this.channelId)?.name || 'Kanal') : 'Tümü';
            select.querySelector('.videos-channel-select-label').textContent = name;
            select.classList.toggle('is-filtered', Boolean(this.channelId));
            this.channelMenu?.querySelectorAll('[role="option"]').forEach(option => {
                const selected = option.dataset.channelFilter === this.channelId;
                option.setAttribute('aria-selected', selected ? 'true' : 'false');
                option.classList.toggle('is-selected', selected);
            });
        },

        fillChannelMenu() {
            const option = (id, name, avatar) => {
                const selected = id === this.channelId;
                return `<button type="button" role="option" class="videos-channel-option${selected ? ' is-selected' : ''}" data-channel-filter="${ns.escape(id)}" aria-selected="${selected ? 'true' : 'false'}">${avatar}<span class="videos-channel-option-name">${ns.escape(name)}</span><i class="fa-solid fa-check" aria-hidden="true"></i></button>`;
            };
            this.channelMenu.innerHTML = option('', 'Tümü', '<span class="videos-avatar videos-avatar-sm videos-avatar-all" aria-hidden="true"><i class="fa-solid fa-layer-group"></i></span>')
                + this.followedChannels().map(channel => option(channel.id, ns.channelHandleLabel(channel.id, channel.name), ns.avatarHtml(channel.id, channel.name, 'videos-avatar-sm'))).join('');
        },

        toggleChannelMenu() {
            if (this.channelMenu && !this.channelMenu.hidden) this.closeChannelMenu({ focus: true });
            else this.openChannelMenu();
        },

        openChannelMenu() {
            const select = this.channelSelect;
            if (!select) return;
            if (!this.channelMenu) {
                const menu = document.createElement('div');
                menu.id = 'videosChannelMenu';
                menu.className = 'videos-channel-menu';
                menu.setAttribute('role', 'listbox');
                menu.setAttribute('aria-label', 'Kanallar');
                menu.hidden = true;
                menu.addEventListener('click', () => this.closeChannelMenu({ focus: true }));
                menu.addEventListener('keydown', event => this.onChannelMenuKeydown(event));
                this.root.closest('.videos').appendChild(menu);
                this.channelMenu = menu;
                document.addEventListener('click', event => {
                    if (!event.target.closest('.videos-channel-menu, .videos-channel-select')) this.closeChannelMenu();
                });
                window.addEventListener('scroll', () => this.closeChannelMenu(), { passive: true });
                window.addEventListener('resize', () => this.closeChannelMenu(), { passive: true });
            }
            this.fillChannelMenu();
            const menu = this.channelMenu;
            const rect = select.getBoundingClientRect();
            const width = Math.min(320, window.innerWidth - 24);
            const left = Math.min(Math.max(12, rect.right - width), window.innerWidth - width - 12);
            menu.style.width = `${width}px`;
            menu.style.left = `${left}px`;
            menu.style.top = `${Math.round(rect.bottom + 6)}px`;
            menu.style.maxHeight = `${Math.max(180, window.innerHeight - rect.bottom - 110)}px`;
            menu.hidden = false;
            select.setAttribute('aria-expanded', 'true');
            (menu.querySelector('.is-selected') || menu.firstElementChild)?.focus({ preventScroll: true });
        },

        closeChannelMenu({ focus = false } = {}) {
            const menu = this.channelMenu;
            if (!menu || menu.hidden) return;
            menu.hidden = true;
            this.channelSelect?.setAttribute('aria-expanded', 'false');
            if (focus) this.channelSelect?.focus({ preventScroll: true });
        },

        onChannelMenuKeydown(event) {
            const options = [...this.channelMenu.querySelectorAll('[role="option"]')];
            const index = options.indexOf(document.activeElement);
            const move = target => {
                event.preventDefault();
                options[(target + options.length) % options.length]?.focus();
            };
            if (event.key === 'ArrowDown') move(index + 1);
            else if (event.key === 'ArrowUp') move(index - 1);
            else if (event.key === 'Home') move(0);
            else if (event.key === 'End') move(options.length - 1);
            else if (event.key === 'Escape') {
                event.preventDefault();
                this.closeChannelMenu({ focus: true });
            }
        },

        clearList() {
            this.preview.stop();
            this.loading = false;
            this.loadingToken = null;
            this.list.replaceChildren();
            this.ids.clear();
            this.cardCount = 0;
            this.shelfInserted = false;
            this.setStatus('');
        },

        renderFirstPage({ fromCache = false } = {}) {
            const page = this.home?.videos;
            if (!page) return;
            this.sequence += 1;
            this.clearList();
            this.cursor = page.nextCursor;
            this.hasMore = Boolean(page.hasMore && page.nextCursor);
            this.rendered = true;
            this.renderedFromCache = fromCache;
            this.appendVideos(page.videos);
            this.list.setAttribute('aria-busy', 'false');
            this.afterAppend();
            ns.publishDailyVideo?.(page.videos[0]);
        },

        // Kanal seçimi: o kanalın tüm videoları (izlenmiş olanlar dahil) sunucudan istenir.
        async selectChannel(channelId) {
            if (channelId === this.channelId) return;
            this.channelId = channelId || '';
            this.syncChannelSelect();
            if (!this.channelId) {
                this.renderFirstPage();
                return;
            }
            const sequence = ++this.sequence;
            this.clearList();
            this.cursor = null;
            this.hasMore = true;
            this.showLoader();
            await this.loadMore(sequence);
        },

        visibleVideos(videos) {
            return videos.filter(video => {
                if (!video || this.ids.has(video.id)) return false;
                if (this.channelId) return video.channelId === this.channelId;
                return ns.store.isFollowing(video.channelId) && !ns.store.isCompleted(video.id);
            });
        },

        appendVideos(videos) {
            const fresh = this.visibleVideos(videos || []);
            if (!fresh.length) return 0;
            const fragment = document.createDocumentFragment();
            const template = document.createElement('template');
            fresh.forEach(video => {
                this.ids.add(video.id);
                template.innerHTML = cardHtml(video, this.cardCount).trim();
                fragment.appendChild(template.content.firstElementChild);
                this.cardCount += 1;
                if (!this.shelfInserted && !this.channelId && this.cardCount === SHELF_AFTER) this.insertShelf(fragment);
            });
            this.list.appendChild(fragment);
            if (ns.prefersReducedMotion()) {
                this.list.querySelectorAll('.videos-card.is-entering').forEach(card => card.classList.remove('is-entering'));
            } else {
                window.setTimeout(() => {
                    this.list.querySelectorAll('.videos-card.is-entering').forEach(card => card.classList.remove('is-entering'));
                }, 900);
            }
            return fresh.length;
        },

        insertShelf(fragment) {
            if (ns.store.isShortsShelfHidden()) return;
            const shorts = (this.home?.shorts?.videos || [])
                .filter(video => ns.store.isFollowing(video.channelId) && !ns.store.isCompleted(video.id))
                .slice(0, SHELF_SIZE);
            // Izgara iki sütunlu; tek kalan kutu boşluk bırakmasın diye çift sayıda gösterilir.
            if (shorts.length % 2) shorts.pop();
            if (shorts.length < 2) return;
            const template = document.createElement('template');
            template.innerHTML = shelfHtml(shorts).trim();
            fragment.appendChild(template.content.firstElementChild);
            this.shelfInserted = true;
        },

        afterAppend() {
            if (!this.cardCount && !this.hasMore) {
                this.showEmpty();
                return;
            }
            if (this.hasMore) this.observeSentinel();
            else {
                this.observer?.disconnect();
                this.setStatus(this.cardCount ? '<p class="videos-end">Şimdilik bu kadar. Yeni videolar geldikçe burada görünecek.</p>' : '');
            }
            // İlk sayfanın çoğu izlenmiş olabilir; ekran boş kalmasın diye sonraki sayfalar da istenir.
            if (this.cardCount < MIN_VISIBLE_PER_PAGE && this.hasMore) this.loadMore(this.sequence);
        },

        async loadMore(sequence = this.sequence) {
            if (this.loading || !this.hasMore) return;
            const token = {};
            this.loading = true;
            this.loadingToken = token;
            if (this.cardCount) this.showLoader({ compact: true });
            try {
                let added = 0;
                let pages = 0;
                while (this.hasMore && added < MIN_VISIBLE_PER_PAGE && pages < MAX_AUTO_PAGES) {
                    const page = await ns.api.feed({
                        type: 'video',
                        before: this.cursor,
                        channelId: this.channelId,
                        excludeKey: this.channelId ? '' : ns.store.excludeKey(),
                        limit: PAGE_SIZE
                    });
                    if (sequence !== this.sequence) return;
                    this.cursor = page.nextCursor;
                    this.hasMore = Boolean(page.hasMore && page.nextCursor);
                    added += this.appendVideos(page.videos);
                    pages += 1;
                }
                this.setStatus('');
                this.list.setAttribute('aria-busy', 'false');
                this.loading = false;
                this.afterAppend();
            } catch (error) {
                if (sequence !== this.sequence) return;
                console.warn('Videolar yüklenemedi:', error);
                this.hasMore = false;
                this.setStatus(`<div class="videos-error"><p>Videolar yüklenemedi. Bağlantını kontrol edip tekrar dene.</p><button type="button" class="videos-pill" data-retry="feed"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Tekrar dene</button></div>`);
            } finally {
                if (this.loadingToken === token) {
                    this.loading = false;
                    this.loadingToken = null;
                }
            }
        },

        retry() {
            if (!this.rendered && !this.channelId) {
                ns.tab.loadHome({ force: true });
                return;
            }
            this.hasMore = true;
            this.loadMore(this.sequence);
        },

        showLoader({ compact = false } = {}) {
            this.setStatus(`<div class="videos-loader${compact ? ' is-compact' : ''}" aria-label="Videolar yükleniyor"><span></span><span></span><span></span></div>`);
        },

        showEmpty() {
            const message = this.channelId
                ? 'Bu kanalda henüz video yok.'
                : 'Takip ettiğin kanallarda gösterilecek yeni video kalmadı.';
            this.setStatus(`<div class="videos-empty"><i class="fa-regular fa-circle-play" aria-hidden="true"></i><p>${message}</p><a class="videos-pill" href="${ns.TAB_PATH}?bolum=hesabim&amp;liste=kanallar" data-library-list="kanallar">Kanalları yönet</a></div>`);
        },

        setStatus(html) {
            this.status.innerHTML = html;
            this.status.hidden = !html;
        },

        observeSentinel() {
            if (!this.active || !('IntersectionObserver' in window)) return;
            if (!this.observer) {
                this.observer = new IntersectionObserver(entries => {
                    if (entries.some(entry => entry.isIntersecting)) this.loadMore(this.sequence);
                }, { rootMargin: '600px 0px' });
            }
            this.observer.disconnect();
            this.observer.observe(this.sentinel);
        },

        // Takip edilen kanallar değişti: ilk sayfa yeniden hazırlanır.
        reset() {
            this.sequence += 1;
            this.home = null;
            this.rendered = false;
            this.channelId = '';
            this.clearList();
            this.showLoader();
        },

        // Kart ilerleme çubukları ve beğen/kaydet düğmeleri güncellenir (izleme sayfasından dönüşte).
        refreshCardState() {
            this.list.querySelectorAll('.videos-card').forEach(card => {
                const thumb = card.querySelector('.videos-card-thumb');
                thumb.querySelector('.videos-progress')?.remove();
                const progress = ns.progressHtml(card.dataset.videoId);
                if (progress) thumb.insertAdjacentHTML('beforeend', progress);
            });
            ns.syncActionButtons(this.list);
        },

        enter() {
            this.active = true;
            if (!this.rendered && !this.channelId) this.showLoader();
            this.refreshCardState();
            if (this.hasMore) this.observeSentinel();
            this.preview.enable();
        },

        leave() {
            this.active = false;
            this.observer?.disconnect();
            this.preview.disable();
        },

        firstThumbnails(count) {
            return (this.home?.videos?.videos || [])
                .filter(video => !ns.store.isCompleted(video.id))
                .slice(0, count)
                .map(video => ns.thumbnailUrl(video.id));
        },

        // ---------- Sessiz önizleme ----------
        // Tek bir oynatıcı, akış bölümünün üstünde kartın küçük resminin hizasına konumlanır
        // (iframe taşınırsa yeniden yüklenir; bu yüzden katman hareket eder, iframe değil).
        preview: {
            feed: null,
            layer: null,
            host: null,
            player: null,
            playerPromise: null,
            card: null,
            videoId: '',
            startTimer: null,
            stopTimer: null,
            idleTimer: null,
            enabled: false,
            frame: null,
            // Ses tercihi yalnızca oturum boyunca tutulur (tarayıcı, kullanıcı etkileşimi olmadan
            // sesli oynatmaya izin vermez).
            soundOn: false,
            soundButton: null,
            revealTimer: null,
            tickTimer: null,
            seekBar: null,
            seekFill: null,
            seekThumb: null,
            timeLabel: null,
            scrubbing: false,
            engaged: false,

            init(owner) {
                this.feed = owner;
                this.layer = document.createElement('div');
                this.layer.className = 'videos-preview-layer';
                this.host = document.createElement('div');
                this.host.className = 'videos-preview-host';
                this.host.setAttribute('aria-hidden', 'true');
                this.layer.appendChild(this.host);
                const controls = document.createElement('div');
                controls.className = 'videos-preview-controls';
                controls.innerHTML = '<button type="button" class="videos-preview-button" data-action="preview-sound"><i class="fa-solid fa-volume-xmark" aria-hidden="true"></i></button>';
                this.layer.appendChild(controls);
                this.soundButton = controls.querySelector('button');
                // YouTube'daki gibi altta sürüklenebilir ilerleme çubuğu ve kalan süre: videonun tamamı
                // önizlemeden gezilebilir.
                const bottom = document.createElement('div');
                bottom.className = 'videos-preview-bottom';
                bottom.innerHTML = `<span class="videos-preview-time" aria-hidden="true"></span>
                    <div class="videos-preview-seek" role="slider" tabindex="0" aria-label="Önizleme konumu" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                        <span class="videos-preview-seek-track"><span class="videos-preview-seek-fill"></span></span>
                        <span class="videos-preview-seek-thumb"></span>
                    </div>`;
                this.layer.appendChild(bottom);
                this.timeLabel = bottom.querySelector('.videos-preview-time');
                this.seekBar = bottom.querySelector('.videos-preview-seek');
                this.seekFill = bottom.querySelector('.videos-preview-seek-fill');
                this.seekThumb = bottom.querySelector('.videos-preview-seek-thumb');
                this.bindSeek();
                this.syncControls();

                const list = owner.list;
                list.addEventListener('pointerover', event => {
                    if (event.pointerType !== 'mouse' || !this.allowed()) return;
                    const thumb = event.target.closest('.videos-card-thumb');
                    if (!thumb || thumb.contains(event.relatedTarget)) return;
                    // Düğmelerden küçük resme geri dönüldüğünde mevcut önizleme yeniden başlatılmaz.
                    if (this.card && this.card === thumb.closest('.videos-card')) return;
                    window.clearTimeout(this.startTimer);
                    this.startTimer = window.setTimeout(() => this.start(thumb.closest('.videos-card')), PREVIEW_HOVER_DELAY_MS);
                });
                list.addEventListener('pointerout', event => {
                    if (event.pointerType !== 'mouse') return;
                    const thumb = event.target.closest('.videos-card-thumb');
                    if (!thumb || thumb.contains(event.relatedTarget) || this.layer.contains(event.relatedTarget)) return;
                    window.clearTimeout(this.startTimer);
                    if (this.card && thumb.closest('.videos-card') === this.card) this.stop();
                });
                // İmleç ses düğmesinden kartın dışına çıkarsa önizleme durur.
                this.layer.addEventListener('pointerleave', event => {
                    if (event.pointerType !== 'mouse' || !this.card) return;
                    const thumb = this.card.querySelector('.videos-card-thumb');
                    if (!thumb.contains(event.relatedTarget)) this.stop();
                });
                window.addEventListener('scroll', () => this.onScroll(), { passive: true });
                window.addEventListener('resize', () => this.stop(), { passive: true });
                document.addEventListener('visibilitychange', () => {
                    if (document.hidden) this.stop();
                });
            },

            allowed() {
                return this.enabled
                    && ns.tab?.isActive()
                    && !ns.tab.isMiniActive()
                    && !document.hidden
                    && ns.connectionAllowsPreparation()
                    && !ns.prefersReducedMotion();
            },

            enable() {
                this.enabled = true;
                if (this.allowed()) ns.loadPlayerApi().catch(() => {});
                ns.idle(() => this.prewarm(), 2500);
                this.scheduleCenterPick();
            },

            // Oynatıcı en yavaş adımdır (YouTube iframe'i birkaç sn'de açılır). Sekme görünür olunca
            // sessiz bir oynatıcı görünmez katmanda önceden kurulur; önizleme başlarken yalnız video yüklenir.
            prewarm(retry = true) {
                if (!this.enabled || this.playerPromise || !this.allowed()) return;
                const video = (this.feed.home?.videos?.videos || []).find(item => !item.isLive && ns.videos.has(item.id));
                if (!video) {
                    if (retry) ns.tab.homeReady().then(() => this.prewarm(false));
                    return;
                }
                if (this.layer.parentNode !== this.feed.root) this.feed.root.appendChild(this.layer);
                Object.assign(this.layer.style, { top: '0px', left: '0px', width: '320px', height: '180px' });
                const promise = ns.createPlayer(this.host, {
                    videoId: video.id,
                    muted: true,
                    controls: false,
                    autoplay: false,
                    loop: true,
                    title: 'Video önizlemesi',
                    onState: state => this.onState(state)
                });
                this.playerPromise = promise;
                promise.then(player => {
                    if (this.playerPromise !== promise) {
                        player.destroy();
                        return;
                    }
                    this.player = player;
                }).catch(() => {
                    if (this.playerPromise === promise) this.playerPromise = null;
                });
            },

            disable() {
                this.enabled = false;
                this.stop();
            },

            onScroll() {
                if (!this.enabled || this.frame !== null) return;
                this.frame = window.requestAnimationFrame(() => {
                    this.frame = null;
                    if (this.card && !this.isInCenterBand(this.card)) this.stop();
                    if (this.card && !ns.isTouchDevice()) this.position();
                    this.scheduleCenterPick();
                });
            },

            // Dokunmatik cihazlarda kaydırma durduktan sonra ekranın ortasındaki kart önizlenir.
            scheduleCenterPick() {
                window.clearTimeout(this.idleTimer);
                if (!ns.isTouchDevice()) return;
                this.idleTimer = window.setTimeout(() => {
                    if (!this.allowed()) return;
                    const card = this.centerCard();
                    if (card && card !== this.card) this.start(card);
                }, PREVIEW_SCROLL_IDLE_MS);
            },

            isInCenterBand(card) {
                const rect = card.querySelector('.videos-card-thumb').getBoundingClientRect();
                const middle = rect.top + rect.height / 2;
                return middle > window.innerHeight * 0.12 && middle < window.innerHeight * 0.82;
            },

            centerCard() {
                const target = window.innerHeight * 0.45;
                let best = null;
                let bestDistance = Infinity;
                this.feed.list.querySelectorAll('.videos-card').forEach(card => {
                    const rect = card.querySelector('.videos-card-thumb').getBoundingClientRect();
                    if (rect.bottom < 0 || rect.top > window.innerHeight) return;
                    const visible = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
                    if (visible < rect.height * 0.6) return;
                    const distance = Math.abs(rect.top + rect.height / 2 - target);
                    if (distance < bestDistance) {
                        best = card;
                        bestDistance = distance;
                    }
                });
                return best && this.isInCenterBand(best) ? best : null;
            },

            position() {
                if (!this.card) return;
                const thumb = this.card.querySelector('.videos-card-thumb');
                const rootRect = this.feed.root.getBoundingClientRect();
                const rect = thumb.getBoundingClientRect();
                Object.assign(this.layer.style, {
                    top: `${rect.top - rootRect.top}px`,
                    left: `${rect.left - rootRect.left}px`,
                    width: `${rect.width}px`,
                    height: `${rect.height}px`
                });
            },

            async start(card) {
                if (!card || !this.allowed() || card === this.card) return;
                const video = ns.videos.get(card.dataset.videoId);
                if (!video || video.isLive) return;
                this.stop();
                this.card = card;
                this.videoId = video.id;
                this.syncControls();
                // Katman, liste temizlenince kopmasın diye listenin değil bölümün içinde durur.
                if (this.layer.parentNode !== this.feed.root) this.feed.root.appendChild(this.layer);
                this.position();
                this.layer.classList.add('is-loading');
                try {
                    if (!this.playerPromise) {
                        const promise = ns.createPlayer(this.host, {
                            videoId: video.id,
                            muted: !this.soundOn,
                            controls: false,
                            autoplay: true,
                            loop: true,
                            title: 'Video önizlemesi',
                            onState: state => this.onState(state)
                        });
                        this.playerPromise = promise;
                        let player;
                        try {
                            player = await promise;
                        } catch (error) {
                            if (this.playerPromise === promise) this.playerPromise = null;
                            throw error;
                        }
                        if (this.playerPromise !== promise) {
                            player.destroy();
                            return;
                        }
                        this.player = player;
                        if (this.card !== card) {
                            player.pause();
                            return;
                        }
                        // Yedek (API'siz) oynatıcı durum bildirmez; görünür yapılır.
                        if (player.isFallback) this.showPlaying();
                    } else {
                        const player = await this.playerPromise;
                        if (this.card !== card || this.player !== player) return;
                        if (this.soundOn) player.unMute();
                        else player.mute();
                        player.load(video.id, { start: 0 });
                        if (player.isFallback) this.showPlaying();
                    }
                } catch (error) {
                    console.warn('Önizleme başlatılamadı:', error);
                    this.stop();
                    return;
                }
                this.keepAlive();
            },

            // Önizleme en fazla PREVIEW_MAX_MS sürer; kullanıcı düğmelerle etkileşince süre yenilenir.
            keepAlive() {
                window.clearTimeout(this.stopTimer);
                // Kullanıcı sesi açtıysa ya da çubukla gezindiyse önizleme kendiliğinden durmaz.
                if (this.engaged) return;
                this.stopTimer = window.setTimeout(() => this.stop(), PREVIEW_MAX_MS);
            },

            onState(state) {
                if (!this.card) return;
                if (state === ns.PLAYER_STATES.PLAYING && this.player?.videoId() === this.videoId) this.showPlaying();
            },

            toggleSound() {
                if (!this.player || !this.card) return;
                this.soundOn = !this.soundOn;
                this.engaged = true;
                if (this.soundOn) {
                    this.player.unMute();
                    this.player.play();
                } else {
                    this.player.mute();
                }
                this.syncControls();
                this.flashSoundButton();
                this.keepAlive();
            },

            // Basınca gri arka plan geri gelir ve birkaç saniye sonra yeniden solar.
            flashSoundButton() {
                const button = this.soundButton;
                if (!button) return;
                button.style.animation = 'none';
                void button.offsetWidth;
                button.style.animation = '';
            },

            bindSeek() {
                const bar = this.seekBar;
                const ratioFromEvent = event => {
                    const rect = bar.getBoundingClientRect();
                    return rect.width ? Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) : 0;
                };
                bar.addEventListener('pointerdown', event => {
                    if (!this.player || !this.card || this.player.isFallback) return;
                    event.preventDefault();
                    event.stopPropagation();
                    bar.setPointerCapture(event.pointerId);
                    this.scrubbing = true;
                    this.layer.classList.add('is-scrubbing');
                    this.showProgress(ratioFromEvent(event));
                });
                bar.addEventListener('pointermove', event => {
                    if (this.scrubbing) this.showProgress(ratioFromEvent(event));
                });
                bar.addEventListener('pointerup', event => {
                    if (!this.scrubbing) return;
                    this.scrubbing = false;
                    this.layer.classList.remove('is-scrubbing');
                    this.seekToRatio(ratioFromEvent(event));
                });
                bar.addEventListener('pointercancel', () => {
                    this.scrubbing = false;
                    this.layer.classList.remove('is-scrubbing');
                });
                bar.addEventListener('click', event => event.stopPropagation());
                bar.addEventListener('keydown', event => {
                    if (!this.player || !this.card) return;
                    const step = event.key === 'ArrowRight' ? 5 : event.key === 'ArrowLeft' ? -5 : 0;
                    if (!step) return;
                    event.preventDefault();
                    const duration = this.player.duration();
                    if (duration) this.seekToRatio((this.player.currentTime() + step) / duration);
                });
            },

            seekToRatio(ratio) {
                const duration = this.player?.duration();
                if (!duration) return;
                const clamped = Math.min(1, Math.max(0, ratio));
                this.engaged = true;
                this.player.seek(clamped * duration);
                this.showProgress(clamped);
                this.keepAlive();
            },

            // Çubuk ve kalan süre (YouTube önizlemesindeki gibi geri sayım).
            showProgress(ratio) {
                const duration = this.player?.duration() || 0;
                const clamped = Math.min(1, Math.max(0, ratio));
                this.seekFill.style.transform = `scaleX(${clamped})`;
                this.seekThumb.style.left = `${clamped * 100}%`;
                this.seekBar.setAttribute('aria-valuenow', String(Math.round(clamped * 100)));
                this.timeLabel.textContent = duration ? ns.formatDuration(Math.max(0, duration - clamped * duration)) : '';
            },

            tick() {
                if (!this.player || !this.card || this.scrubbing) return;
                const duration = this.player.duration();
                if (duration) this.showProgress(this.player.currentTime() / duration);
            },

            syncControls() {
                const sound = this.soundOn;
                this.soundButton.classList.toggle('is-active', sound);
                this.soundButton.setAttribute('aria-pressed', sound ? 'true' : 'false');
                this.soundButton.setAttribute('aria-label', sound ? 'Önizleme sesini kapat' : 'Önizleme sesini aç');
                this.soundButton.querySelector('i').className = sound ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
            },

            showPlaying() {
                if (!this.card) return;
                this.layer.classList.remove('is-loading');
                // Dokunmatik cihazda YouTube'un duraklat simgesi geçene kadar video gizli tutulur.
                if (!ns.isTouchDevice() || this.player?.isFallback) {
                    this.reveal();
                    return;
                }
                if (this.revealTimer || this.layer.classList.contains('is-playing')) return;
                const videoId = this.videoId;
                this.revealTimer = window.setTimeout(() => {
                    this.revealTimer = null;
                    if (this.card && this.videoId === videoId) this.reveal();
                }, PREVIEW_TOUCH_REVEAL_DELAY_MS);
            },

            reveal() {
                if (!this.card) return;
                this.layer.classList.add('is-playing');
                this.layer.classList.toggle('is-fallback', Boolean(this.player?.isFallback));
                this.card.classList.add('is-previewing');
                window.clearInterval(this.tickTimer);
                this.tick();
                this.tickTimer = window.setInterval(() => this.tick(), PREVIEW_TICK_MS);
            },

            // İzleme sayfası, önizlemenin kaldığı yerden devam eder.
            currentTimeFor(videoId) {
                if (!this.player || this.videoId !== videoId || !this.layer.classList.contains('is-playing')) return 0;
                return Math.floor(this.player.currentTime());
            },

            disposePlayer() {
                this.stop();
                const player = this.player;
                this.player = null;
                this.playerPromise = null;
                player?.destroy();
                this.host.replaceChildren();
            },

            stop() {
                window.clearTimeout(this.startTimer);
                window.clearTimeout(this.stopTimer);
                window.clearTimeout(this.revealTimer);
                this.revealTimer = null;
                window.clearInterval(this.tickTimer);
                this.tickTimer = null;
                this.engaged = false;
                this.scrubbing = false;
                this.layer.classList.remove('is-scrubbing');
                if (this.seekFill) this.showProgress(0);
                if (this.card) this.card.classList.remove('is-previewing');
                this.card = null;
                this.videoId = '';
                this.layer.classList.remove('is-playing', 'is-loading');
                try {
                    this.player?.pause();
                } catch (_error) {
                    // Oynatıcı henüz hazır değil.
                }
            }
        }
    };

    ns.feed = feed;
})();
