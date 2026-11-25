// ==================== Videolar: önizlemeli akış ====================
// Takip edilen kanalların en yeni videoları listelenir. 5 saniye izlenmiş videolar en üstte önerilmez:
// önce izlenmemişler gelir, onlar bitince (liste hemen sona ermesin diye) izlenmişler en yeniden
// başlayarak eklenir; izlenen kısım kırmızı ilerleme çubuğuyla görünür. Shorts rafı 3. karttan sonra
// ve ardından her 12 kartta bir tekrar eder (raflar arasında aynı short gösterilmez).
// Üstteki çiplerle tek bir kanala süzülebilir. Görünürdeki kart sessiz olarak önizlenir; önizlemede
// toplam 10 saniye oynayan video "izlendi" sayılır. Shorts rafı ekrandayken ilk kutusu sessizce
// ilk 5 saniyesini döngüler (izlendi sayılmaz, ilerleme çizgisi gösterilmez).

(function () {
    const ns = window.RoTaKipVideos;
    // Sunucunun ana akış ilk sayfasıyla (HOME_VIDEO_LIMIT) ve en yüksek sayfa boyutuyla aynıdır.
    const PAGE_SIZE = 24;
    const MIN_VISIBLE_PER_PAGE = 4;
    const MAX_AUTO_PAGES = 4;
    // İlk Shorts rafı 3. karttan sonra, sonrakiler her 12 kartta bir (yalnız "Tümü" seçiliyken) eklenir.
    const SHELF_AFTER = 3;
    const SHELF_EVERY = 12;
    const SHELF_SIZE = 4;
    const PREVIEW_HOVER_DELAY_MS = 250;
    const PREVIEW_SCROLL_IDLE_MS = 150;
    const PREVIEW_TICK_MS = 250;
    // Kartta önizlemeyle toplam bu kadar oynayan video "izlendi" sayılır ve akıştan elenir.
    const PREVIEW_WATCHED_MS = 10 * 1000;
    // Shorts rafındaki ilk kutu ekrandayken sessizce ilk 5 saniyesini döngüler (izlendi sayılmaz).
    const SHORT_LOOP_SECONDS = 5;
    const SHORT_LOOP_TICK_MS = 100;
    const SHORT_VISIBLE_START = 0.6;
    const SHORT_VISIBLE_KEEP = 0.25;

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

    // "Yeni" rozeti: yalnızca bugün (yerel saate göre gün başlangıcından itibaren) yüklenen Shorts videoları.
    function isNewShort(video) {
        const time = Date.parse(video.publishedAt);
        if (!Number.isFinite(time)) return false;
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        return time >= startOfToday.getTime();
    }

    ns.shortTileHtml = function shortTileHtml(video) {
        const id = ns.escape(video.id);
        // Rafta yalnızca izlenmemiş Shorts vardır; bu yüzden kutularda kırmızı ilerleme çizgisi gösterilmez.
        return `<div class="videos-short-tile" data-video-id="${id}">
            <a class="videos-short-tile-link" href="${ns.escape(ns.shortsUrl(video.id))}" data-open-short="${id}" aria-label="${ns.escape(video.title)}">
                <img src="${ns.escape(ns.thumbnailUrl(video.id))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
                ${isNewShort(video) ? '<span class="videos-short-tile-new">Yeni</span>' : ''}
                <span class="videos-short-tile-title">${ns.escape(video.title)}</span>
            </a>
            <button type="button" class="videos-short-tile-more" data-action="shelf-menu" aria-label="Shorts seçenekleri" aria-haspopup="menu"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></button>
        </div>`;
    };

    function shelfHtml(shorts) {
        return `<section class="videos-shorts-shelf" aria-label="Shorts">
            <div class="videos-shorts-head">
                <a class="videos-shorts-heading" href="${ns.escape(ns.shortsUrl())}" data-open-short="">Shorts</a>
                <button type="button" class="videos-shelf-more" data-action="shelf-menu" aria-label="Shorts seçenekleri" aria-haspopup="menu"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></button>
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
        channelRestored: false,
        // 'unwatched': izlenmemişler listelenir; sunucu sayfaları bitince 'watched' ile baştan izlenmişler.
        pass: 'unwatched',
        // Raflarda gösterilen shorts (raflar arasında tekrar etmez) ve ana akıştan sonra çekilen shorts.
        shelfIds: new Set(),
        extraShorts: [],
        shortsCursor: null,
        shortsHasMore: false,
        shortsLoading: false,
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
            if (this.restoreSavedChannel()) return;
            if (this.channelId) return;
            const nextIds = home.videos?.videos?.map(video => video.id).join(',');
            const userIsBrowsing = this.active && (window.scrollY > 80 || this.cardCount > PAGE_SIZE);
            if (this.rendered && (previousIds === nextIds || userIsBrowsing)) {
                this.renderedFromCache = this.renderedFromCache && fromCache;
                return;
            }
            this.renderFirstPage({ fromCache });
        },

        // Sekme açıldığında en son seçilen kanal geri yüklenir (kullanıcı her seferinde yeniden seçmesin).
        // Kanal artık listede yoksa ya da takipten çıkarılmışsa "Tümü"ne dönülür. Yalnız ilk akışta çalışır.
        restoreSavedChannel() {
            if (this.channelRestored) return false;
            // Kanal listesi henüz gelmediyse (boş yanıt) karar bir sonraki akışa bırakılır.
            if (!ns.channels.size) return false;
            this.channelRestored = true;
            const saved = ns.store.selectedChannel();
            if (!saved || this.channelId) return false;
            if (!ns.channels.has(saved) || !ns.store.isFollowing(saved)) {
                ns.store.setSelectedChannel('');
                return false;
            }
            this.selectChannel(saved);
            return true;
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
            this.pass = 'unwatched';
            this.shelfIds.clear();
            this.extraShorts = [];
            this.shortsCursor = this.home?.shorts?.nextCursor || null;
            this.shortsHasMore = Boolean(this.home?.shorts?.hasMore && this.shortsCursor);
            this.shortsLoading = false;
            this.setStatus('');
        },

        // İzlenmemişlerin sayfaları bitti: "Şimdilik bu kadar" hemen çıkmasın diye en baştan
        // izlenmiş videolar istenir (izlenmemişlerin altına eklenir).
        advancePass() {
            if (this.hasMore || this.pass !== 'unwatched') return false;
            this.pass = 'watched';
            this.cursor = null;
            this.hasMore = true;
            return true;
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
            this.advancePass();
            this.list.setAttribute('aria-busy', 'false');
            this.afterAppend();
            ns.publishDailyVideo?.(page.videos[0]);
        },

        // Kanal seçimi: o kanalın videoları sunucudan istenir; önce izlenmemişler, sonra izlenmişler.
        async selectChannel(channelId) {
            if (channelId === this.channelId) return;
            this.channelId = channelId || '';
            ns.store.setSelectedChannel(this.channelId);
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
                if (!video || this.ids.has(video.id) || ns.store.isDisliked(video.id)) return false;
                if (ns.store.isCompleted(video.id) !== (this.pass === 'watched')) return false;
                if (this.channelId) return video.channelId === this.channelId;
                return ns.store.isFollowing(video.channelId);
            });
        },

        appendVideos(videos) {
            // "Tümü"nde izlenmemişler en yeni hep üstte kalmasın diye sayfa içinde karıştırılır; kanal
            // seçiliyken (kronolojik beklenir) ve izlenmişler aşamasında sıra korunur.
            const visible = this.visibleVideos(videos || []);
            const fresh = this.channelId || this.pass === 'watched' ? visible : ns.mixFresh(visible);
            if (!fresh.length) return 0;
            const fragment = document.createDocumentFragment();
            const template = document.createElement('template');
            fresh.forEach(video => {
                this.ids.add(video.id);
                template.innerHTML = cardHtml(video, this.cardCount).trim();
                fragment.appendChild(template.content.firstElementChild);
                this.cardCount += 1;
                if (this.isShelfSlot()) this.insertShelf(fragment);
            });
            this.list.appendChild(fragment);
            // Shorts rafı ekrandaysa ilk kutusu önizlenir.
            this.preview.scheduleCenterPick();
            if (ns.prefersReducedMotion()) {
                this.list.querySelectorAll('.videos-card.is-entering').forEach(card => card.classList.remove('is-entering'));
            } else {
                window.setTimeout(() => {
                    this.list.querySelectorAll('.videos-card.is-entering').forEach(card => card.classList.remove('is-entering'));
                }, 900);
            }
            return fresh.length;
        },

        // Raf yerleri: 3. karttan sonra ve ardından her SHELF_EVERY kartta bir (kanal süzgecinde raf yok).
        isShelfSlot() {
            if (this.channelId || this.cardCount < SHELF_AFTER) return false;
            return (this.cardCount - SHELF_AFTER) % SHELF_EVERY === 0;
        },

        // Rafta henüz gösterilmemiş shorts: önce izlenmemişler, sonra izlenmişler.
        shelfCandidates() {
            const all = [...(this.home?.shorts?.videos || []), ...this.extraShorts].filter(video => video.type === 'shorts'
                && !this.shelfIds.has(video.id)
                && !ns.store.isDisliked(video.id)
                && ns.store.isFollowing(video.channelId));
            // İzlenmemişler en yeni hep başta kalmasın diye karıştırılır; izlenmişler sona eklenir.
            return [
                ...ns.mixFresh(all.filter(video => !ns.store.isCompleted(video.id))),
                ...all.filter(video => ns.store.isCompleted(video.id))
            ];
        },

        insertShelf(fragment) {
            if (ns.store.isShortsShelfHidden()) return;
            const candidates = this.shelfCandidates();
            const shorts = candidates.slice(0, SHELF_SIZE);
            // Izgara iki sütunlu; tek kalan kutu boşluk bırakmasın diye çift sayıda gösterilir.
            if (shorts.length % 2) shorts.pop();
            if (shorts.length >= 2) {
                shorts.forEach(video => this.shelfIds.add(video.id));
                const template = document.createElement('template');
                template.innerHTML = shelfHtml(shorts).trim();
                fragment.appendChild(template.content.firstElementChild);
            }
            // Sonraki raf boş kalmasın diye shorts havuzu azaldığında arka planda yeni sayfa istenir.
            if (candidates.length - shorts.length < SHELF_SIZE) this.loadMoreShorts();
        },

        async loadMoreShorts() {
            if (this.shortsLoading || !this.shortsHasMore) return;
            const sequence = this.sequence;
            this.shortsLoading = true;
            try {
                const page = await ns.api.feed({
                    type: 'shorts',
                    before: this.shortsCursor,
                    excludeKey: ns.store.excludeKey(),
                    limit: PAGE_SIZE
                });
                if (sequence !== this.sequence) return;
                this.shortsCursor = page.nextCursor;
                this.shortsHasMore = Boolean(page.hasMore && page.nextCursor);
                this.extraShorts.push(...(page.videos || []));
            } catch (error) {
                if (sequence === this.sequence) this.shortsHasMore = false;
                console.warn('Raf için shorts yüklenemedi:', error);
            } finally {
                if (sequence === this.sequence) this.shortsLoading = false;
            }
        },

        afterAppend() {
            if (!this.cardCount && !this.hasMore) {
                this.showEmpty();
                return;
            }
            if (this.hasMore) this.observeSentinel();
            else {
                this.observer?.disconnect();
                this.setStatus(this.cardCount ? this.endHtml() : '');
                // Bitiş kartı çizildiğinde sayfa zaten en alttaysa (kaydırma olayı gelmez) menü hemen görünür.
                if (this.cardCount) ns.tab?.syncChrome?.();
            }
            // İlk sayfanın çoğu izlenmiş olabilir; ekran boş kalmasın diye sonraki sayfalar da istenir.
            if (this.cardCount < MIN_VISIBLE_PER_PAGE && this.hasMore) this.loadMore(this.sequence);
        },

        // Akışın sonu: liste (izlenmişler dahil) bittiğinde "bitti" hissi yerine bir sonraki adım önerilir.
        endHtml() {
            const total = this.cardCount;
            const channel = this.channelId ? ns.channels.get(this.channelId) : null;
            const subject = channel
                ? `${ns.escape(channel.name || 'Bu kanal')} kanalındaki ${total} videonun`
                : `Takip ettiğin kanallardaki ${total} videonun`;
            const title = this.channelId ? 'Bu kanalda hepsi bu kadar!' : 'Hepsini gördün!';
            const allChannels = this.channelId
                ? '<button type="button" class="videos-end-link" data-channel-filter=""><i class="fa-solid fa-layer-group" aria-hidden="true"></i> Tüm kanallar</button>'
                : '';
            return `<div class="videos-end">
                <h3 class="videos-end-title">${title}</h3>
                <p class="videos-end-text">${subject} sonuna geldin. Ekrana ara verip bir kitap aç ya da biraz tefekküre dal; yeni videolar yüklendikçe burada olacak.</p>
                <div class="videos-end-actions">
                    <a class="videos-pill" href="/tefekkur" data-app-path="/tefekkur"><i class="fa-solid fa-star" aria-hidden="true"></i> Tefekküre dal</a>
                    <a class="videos-pill" href="/makaleler" data-app-path="/makaleler"><i class="fa-solid fa-compass" aria-hidden="true"></i> Okumaya geç</a>
                </div>
                <div class="videos-end-links">
                    <button type="button" class="videos-end-link" data-scroll-top><i class="fa-solid fa-arrow-up" aria-hidden="true"></i> Başa dön</button>
                    ${allChannels}
                </div>
            </div>`;
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
                    this.advancePass();
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
                : 'Takip ettiğin kanallarda henüz video yok.';
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
            // Takip listesi değişince akış "Tümü"yle baştan başlar; kayıtlı kanal da sıfırlanır.
            this.channelRestored = true;
            ns.store.setSelectedChannel('');
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
            return ns.unwatchedFirst(this.home?.videos?.videos || [])
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
            idleTimer: null,
            enabled: false,
            frame: null,
            // Ses tercihi yalnızca oturum boyunca tutulur (tarayıcı, kullanıcı etkileşimi olmadan
            // sesli oynatmaya izin vermez).
            soundOn: false,
            soundButton: null,
            tickTimer: null,
            seekBar: null,
            seekFill: null,
            seekThumb: null,
            timeLabel: null,
            scrubbing: false,
            // Önizlenen öğe Shorts rafındaki kutuysa true; kartlardan farklı davranır (sessiz döngü, çubuk yok).
            isShort: false,
            watchedMs: 0,
            lastTickAt: 0,
            loopSeekAt: 0,
            watchMarked: false,

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
                    if (this.card && thumb.closest('.videos-card') === this.card) {
                        this.stop();
                        // İmleç karttan ayrılınca ekrandaki Shorts rafı önizlemeye geri döner.
                        this.scheduleCenterPick();
                    }
                });
                // İmleç ses düğmesinden kartın dışına çıkarsa önizleme durur.
                this.layer.addEventListener('pointerleave', event => {
                    if (event.pointerType !== 'mouse' || !this.card || this.isShort) return;
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
                    if (this.card && !this.isStillInView(this.card)) this.stop();
                    if (this.card && !ns.isTouchDevice()) this.position();
                    this.scheduleCenterPick();
                });
            },

            // Kaydırma durduktan sonra önizlenecek öğe seçilir. Dokunmatik cihazlarda ekranın ortasındaki
            // kart önceliklidir; kart yoksa (masaüstünde imleç bir karttayken hiç) ekrandaki Shorts
            // rafının ilk kutusu sessizce önizlenir.
            scheduleCenterPick() {
                window.clearTimeout(this.idleTimer);
                this.idleTimer = window.setTimeout(() => {
                    if (!this.allowed()) return;
                    if (ns.isTouchDevice()) {
                        const card = this.centerCard();
                        if (card) {
                            if (card !== this.card) this.start(card);
                            return;
                        }
                    } else if (this.card && !this.isShort) {
                        return;
                    }
                    const tile = this.shelfTile();
                    if (tile && tile !== this.card) this.start(tile);
                }, PREVIEW_SCROLL_IDLE_MS);
            },

            isInCenterBand(card) {
                const rect = card.querySelector('.videos-card-thumb').getBoundingClientRect();
                const middle = rect.top + rect.height / 2;
                return middle > window.innerHeight * 0.12 && middle < window.innerHeight * 0.82;
            },

            // Önizlemenin oynadığı alan: kartta küçük resim, Shorts rafında kutunun kendisi.
            mediaElement(card) {
                return card.classList.contains('videos-short-tile') ? card : card.querySelector('.videos-card-thumb');
            },

            visibleRatio(element) {
                const rect = element.getBoundingClientRect();
                if (!rect.height) return 0;
                return (Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0)) / rect.height;
            },

            // Başlarken kutunun büyük kısmı görünmelidir; durması için ise neredeyse tamamen çıkmalıdır.
            isStillInView(card) {
                if (card.classList.contains('videos-short-tile')) return this.visibleRatio(card) >= SHORT_VISIBLE_KEEP;
                return this.isInCenterBand(card);
            },

            // Akışta birden çok raf olabilir; ekranda yeterince görünen ilk rafın ilk kutusu seçilir.
            shelfTile() {
                const tiles = this.feed.list.querySelectorAll('.videos-shorts-shelf .videos-short-tile:first-child');
                return [...tiles].find(tile => this.visibleRatio(tile) >= SHORT_VISIBLE_START) || null;
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
                const thumb = this.mediaElement(this.card);
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
                const isShort = card.classList.contains('videos-short-tile');
                this.card = card;
                this.videoId = video.id;
                this.isShort = isShort;
                this.watchedMs = 0;
                this.lastTickAt = 0;
                this.watchMarked = false;
                this.layer.classList.toggle('is-short', isShort);
                this.syncControls();
                // Katman, liste temizlenince kopmasın diye listenin değil bölümün içinde durur.
                if (this.layer.parentNode !== this.feed.root) this.feed.root.appendChild(this.layer);
                this.position();
                this.layer.classList.add('is-loading');
                try {
                    if (!this.playerPromise) {
                        const promise = ns.createPlayer(this.host, {
                            videoId: video.id,
                            muted: isShort || !this.soundOn,
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
                        // Shorts önizlemesi her zaman sessizdir; kartlarda oturum boyunca seçilen ses tercihi geçerlidir.
                        if (this.soundOn && !isShort) player.unMute();
                        else player.mute();
                        player.load(video.id, { start: 0 });
                        if (player.isFallback) this.showPlaying();
                    }
                } catch (error) {
                    console.warn('Önizleme başlatılamadı:', error);
                    this.stop();
                }
            },

            onState(state) {
                if (!this.card) return;
                if (state === ns.PLAYER_STATES.PLAYING && this.player?.videoId() === this.videoId) this.showPlaying();
            },

            toggleSound() {
                if (!this.player || !this.card) return;
                this.soundOn = !this.soundOn;
                if (this.soundOn) {
                    this.player.unMute();
                    this.player.play();
                } else {
                    this.player.mute();
                }
                this.syncControls();
                this.flashSoundButton();
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
                this.player.seek(clamped * duration);
                this.showProgress(clamped);
            },

            // Çubuk ve kalan süre (YouTube önizlemesindeki gibi geri sayım).
            showProgress(ratio) {
                const duration = this.player?.duration() || 0;
                const clamped = Math.min(1, Math.max(0, ratio));
                this.seekFill.style.transform = `scaleX(${clamped})`;
                // Nokta uçlarda yarım kalmasın diye merkezi çizginin her iki ucundan 8 px içeride gezer.
                this.seekThumb.style.left = `calc(6px + (100% - 12px) * ${clamped})`;
                this.seekBar.setAttribute('aria-valuenow', String(Math.round(clamped * 100)));
                this.timeLabel.textContent = duration ? ns.formatDuration(Math.max(0, duration - clamped * duration)) : '';
            },

            tick() {
                if (!this.player || !this.card || this.scrubbing) return;
                if (this.isShort) {
                    // Shorts önizlemesi yalnızca ilk SHORT_LOOP_SECONDS saniyeyi döngüler; çubuk yoktur.
                    const now = window.performance.now();
                    if (this.player.currentTime() >= SHORT_LOOP_SECONDS && now - this.loopSeekAt > 800) {
                        this.loopSeekAt = now;
                        this.player.seek(0);
                    }
                    return;
                }
                const duration = this.player.duration();
                if (duration) this.showProgress(this.player.currentTime() / duration);
                this.countWatched();
            },

            // Önizlemede gerçekten oynayan süre toplanır; PREVIEW_WATCHED_MS dolunca video "izlendi" olur
            // ve sonraki akış çiziminden itibaren listelenmez (ekrandaki kart yerinde kalır).
            countWatched() {
                const now = window.performance.now();
                const delta = this.lastTickAt ? Math.min(now - this.lastTickAt, PREVIEW_TICK_MS * 4) : 0;
                this.lastTickAt = now;
                if (this.watchMarked) return;
                // Yedek oynatıcı durum bildirmez; o durumda geçen süre sayılır.
                const playing = this.player.isFallback || this.player.state() === ns.PLAYER_STATES.PLAYING;
                if (!playing) return;
                this.watchedMs += delta;
                if (this.watchedMs < PREVIEW_WATCHED_MS) return;
                this.watchMarked = true;
                ns.store.markWatched(ns.videos.get(this.videoId), this.player.currentTime(), this.player.duration());
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
                this.reveal();
            },

            reveal() {
                if (!this.card) return;
                this.layer.classList.add('is-playing');
                this.layer.classList.toggle('is-fallback', Boolean(this.player?.isFallback));
                this.card.classList.add('is-previewing');
                window.clearInterval(this.tickTimer);
                this.tick();
                this.tickTimer = window.setInterval(() => this.tick(), this.isShort ? SHORT_LOOP_TICK_MS : PREVIEW_TICK_MS);
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
                window.clearInterval(this.tickTimer);
                this.tickTimer = null;
                this.scrubbing = false;
                this.layer.classList.remove('is-scrubbing');
                if (this.seekFill) this.showProgress(0);
                if (this.card) this.card.classList.remove('is-previewing');
                this.card = null;
                this.videoId = '';
                this.isShort = false;
                this.lastTickAt = 0;
                this.layer.classList.remove('is-playing', 'is-loading', 'is-short');
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
