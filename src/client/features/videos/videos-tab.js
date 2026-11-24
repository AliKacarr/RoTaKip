// ==================== Videolar: sekme yönetimi ====================
// URL biçimleri:
//   /videolar                               → video akışı
//   /videolar?izle=<videoId>                → izleme sayfası
//   /videolar?bolum=shorts[&v=<videoId>]    → Shorts
//   /videolar?bolum=hesabim[&liste=...]  → Hesabım
// Kabuk bu sekmeyi başka bir sekme açıkken arka planda ısıtır (init); bu sırada ana akış
// (önce cihazdaki önbellekten, sonra sunucudan) ve ilk küçük resimler hazırlanır.

(function () {
    const ns = window.RoTaKipVideos;
    const TAB_PATH = ns.TAB_PATH;
    const HISTORY_MARKER = ns.HISTORY_MARKER;
    const INITIAL_CONTENT_WAIT_MS = 2500;
    const PREPARE_FEED_THUMBNAILS = 4;
    const PREPARE_SHORT_POSTERS = 2;
    // Menü gizleme: sayfanın üstüne bu kadar yakınken hep görünür; bu kadar piksel kayınca yön değişimi algılanır.
    const CHROME_SHOW_NEAR_TOP_PX = 90;
    const CHROME_SCROLL_DELTA_PX = 8;
    const CHROME_SUPPRESS_MS = 600;
    // Etkinlik kaydındaki bölüm adları (sunucuda activity.service.js VIDEO_SECTIONS ile aynı olmalıdır).
    const LOG_SECTIONS = { feed: 'videolar', watch: 'izle', shorts: 'shorts', library: 'hesabim' };

    const sections = { feed: ns.feed, watch: ns.watch, shorts: ns.shorts, library: ns.library };

    let page = null;
    let initPromise = null;
    let currentRoute = null;
    let active = false;
    let lastLoggedKey = '';
    let feedScrollY = 0;
    let homePromise = null;
    let homeResolve = null;
    let homeData = null;
    let menu = null;
    let miniActive = false;
    let chromeHidden = false;
    let chromeFrame = null;
    let chromeSuppressUntil = 0;
    let lastScrollY = 0;

    // ---------- Yönlendirme ----------

    function readRoute() {
        if (window.location.pathname.replace(/\/$/, '') !== TAB_PATH) return { view: 'feed' };
        const params = new URLSearchParams(window.location.search);
        const watchId = params.get('izle');
        if (ns.isVideoId(watchId)) return { view: 'watch', videoId: watchId };
        const bolum = params.get('bolum');
        if (bolum === 'shorts') {
            const videoId = params.get('v');
            return { view: 'shorts', videoId: ns.isVideoId(videoId) ? videoId : null };
        }
        if (bolum === 'hesabim') {
            const list = params.get('liste');
            return { view: 'library', list: ns.LIBRARY_LISTS.includes(list) ? list : null };
        }
        return { view: 'feed' };
    }

    function routeUrl(route) {
        if (route.view === 'watch') return ns.watchUrl(route.videoId);
        if (route.view === 'shorts') return ns.shortsUrl(route.videoId);
        if (route.view === 'library') return `${TAB_PATH}?bolum=hesabim${route.list ? `&liste=${route.list}` : ''}`;
        return TAB_PATH;
    }

    // Shorts'ta kaydırdıkça değişen `v` aynı görünüm sayılır.
    function routeKey(route) {
        if (!route) return '';
        if (route.view === 'watch') return `watch:${route.videoId}`;
        if (route.view === 'library') return `library:${route.list || ''}`;
        return route.view;
    }

    function isActive() {
        return active
            && window.location.pathname.replace(/\/$/, '') === TAB_PATH
            && Boolean(page?.isConnected && page.closest('#tabContent'));
    }

    function navigateTo(route, { replace = false, start = 0 } = {}) {
        if (currentRoute?.view === 'feed') feedScrollY = window.scrollY;
        const state = { [HISTORY_MARKER]: true, from: currentRoute?.view || null };
        if (replace) window.history.replaceState(state, '', routeUrl(route));
        else window.history.pushState(state, '', routeUrl(route));
        render(route, { start });
        if (route.view !== 'feed') window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }

    function goToSection(view) {
        closeMenu();
        // İzleme sayfasından akışa dönüşte tarayıcı geçmişi kullanılır; kaydırma konumu korunur.
        if (view === 'feed' && currentRoute?.view === 'watch' && window.history.state?.[HISTORY_MARKER] && window.history.state.from === 'feed') {
            window.history.back();
            return;
        }
        if (view === currentRoute?.view && view !== 'library') {
            if (view === 'feed') {
                if (ns.feed.channelId) ns.feed.selectChannel('');
                window.scrollTo({ top: 0, behavior: ns.prefersReducedMotion() ? 'auto' : 'smooth' });
            }
            return;
        }
        navigateTo({ view, videoId: null, list: null });
    }

    function backToLibrary() {
        if (window.history.state?.[HISTORY_MARKER] && window.history.state.from === 'library') {
            window.history.back();
            return;
        }
        navigateTo({ view: 'library', list: null }, { replace: true });
    }

    // ---------- Çizim ----------

    function render(route, { start = 0 } = {}) {
        const previous = currentRoute;
        const changedView = previous?.view !== route.view;
        // İzleme sayfasından akışa / kitaplığa dönülürken video mini oynatıcıda sürer.
        const minimize = changedView
            && previous?.view === 'watch'
            && (route.view === 'feed' || route.view === 'library')
            && ns.watch.canMinimize();
        if (previous && changedView && !minimize) sections[previous.view].leave();
        if (route.view === 'watch') setMini(false);
        else if (minimize) setMini(true);
        else if (miniActive && route.view === 'shorts') closeMini();
        currentRoute = route;

        page.querySelectorAll('.videos-view').forEach(view => {
            view.hidden = view.dataset.view !== route.view && !(miniActive && view.dataset.view === 'watch');
        });
        syncSectionTabs();
        page.dataset.view = route.view;
        resetChrome();
        syncShortsTheme();

        if (route.view === 'watch') sections.watch.enter(route, { start });
        else sections[route.view].enter(route);

        if (route.view === 'feed' && (!previous || changedView)) restoreFeedScroll();
        logRoute(route);
    }

    // Seçili sekme görünümün sekmesidir (izleme sayfası "Videolar" altında sayılır); kanal süzgeci
    // sekmelerin sonundaki açılır listede gösterilir.
    function syncSectionTabs() {
        if (!page) return;
        const view = currentRoute?.view;
        page.querySelectorAll('.videos-section-tab').forEach(tab => {
            const selected = tab.dataset.section === view || (view === 'watch' && tab.dataset.section === 'feed');
            tab.classList.toggle('is-active', selected);
            if (selected) tab.setAttribute('aria-current', 'page');
            else tab.removeAttribute('aria-current');
        });
    }

    // ---------- Mini oynatıcı ----------

    function setMini(on) {
        miniActive = on;
        page?.classList.toggle('has-mini-player', on);
        ns.mini.sync(on);
    }

    function closeMini() {
        if (!miniActive) return;
        ns.watch.leave();
        setMini(false);
        if (currentRoute?.view !== 'watch') {
            const watchView = page.querySelector('.videos-view[data-view="watch"]');
            if (watchView) watchView.hidden = true;
        }
        if (currentRoute?.view === 'feed') ns.feed.preview.scheduleCenterPick();
    }

    function expandMini() {
        if (!miniActive || !ns.watch.videoId) return;
        navigateTo({ view: 'watch', videoId: ns.watch.videoId });
    }

    function onMiniClick(button) {
        const action = button.dataset.mini;
        if (action === 'expand') expandMini();
        else if (action === 'toggle') ns.watch.togglePlay();
        else if (action === 'close') closeMini();
    }

    function setShortsPaused(paused) {
        page?.classList.toggle('is-shorts-paused', Boolean(paused));
    }

    function restoreFeedScroll() {
        if (!isActive() || !feedScrollY) return;
        const target = feedScrollY;
        window.requestAnimationFrame(() => window.scrollTo({ top: target, left: 0, behavior: 'auto' }));
    }

    // Akış sekmenin varsayılan görünümüdür; sekme açılışı zaten kaydedildiği için yalnızca
    // sekme içinde akışa geri dönüldüğünde kaydedilir.
    function logRoute(route) {
        if (!isActive()) return;
        const key = routeKey(route);
        if (key === lastLoggedKey) return;
        const isLanding = !lastLoggedKey && route.view === 'feed';
        lastLoggedKey = key;
        if (!isLanding) ns.logSection(LOG_SECTIONS[route.view]);
    }

    // ---------- Ana akış verisi ----------

    function resetHomePromise() {
        homePromise = new Promise(resolve => {
            homeResolve = resolve;
        });
    }
    resetHomePromise();

    function homeReady() {
        return homeData ? Promise.resolve(homeData) : homePromise;
    }

    function applyHome(data, { fromCache = false } = {}) {
        if (!data) return;
        homeData = data;
        ns.rememberChannels(data.channels);
        ns.rememberVideos(data.videos?.videos);
        ns.rememberVideos(data.shorts?.videos);
        homeResolve?.(data);
        ns.feed.setHome(data, { fromCache });
        ns.shorts.setHome(data);
        ns.library.refresh();
    }

    // Önce cihazdaki son yanıt anında çizilir, ardından sunucudan taze veri istenir.
    function loadHome({ force = false } = {}) {
        const excludeKey = ns.store.excludeKey();
        if (force) ns.api.forgetHome();
        if (!homeData) {
            const cached = ns.store.readHomeCache(excludeKey);
            if (cached) applyHome(cached, { fromCache: true });
        }
        const request = ns.api.home(excludeKey).then(body => {
            if (excludeKey !== ns.store.excludeKey()) return homeData;
            const data = { channels: body.channels, videos: body.videos, shorts: body.shorts };
            ns.store.writeHomeCache(excludeKey, data);
            applyHome(data);
            return data;
        }).catch(error => {
            console.warn('Video akışı yüklenemedi:', error);
            if (!homeData) {
                ns.feed.list.setAttribute('aria-busy', 'false');
                ns.feed.setStatus('<div class="videos-error"><p>Videolar yüklenemedi. Bağlantını kontrol edip tekrar dene.</p><button type="button" class="videos-pill" data-retry="feed"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Tekrar dene</button></div>');
            }
            return homeData;
        });
        return homeData ? Promise.resolve(homeData) : request;
    }

    // Takip listesi değişti: akış ve Shorts yeni listeyle baştan hazırlanır.
    function onFollowChanged() {
        homeData = null;
        resetHomePromise();
        ns.api.forgetHome();
        ns.feed.reset();
        ns.shorts.reset();
        loadHome().then(() => {
            if (currentRoute?.view === 'shorts' && isActive()) ns.shorts.enter(currentRoute);
        });
        ns.feed.renderChips();
    }

    // Okumalar sekmesindeki "Günün Videosu" (daily-gift.js) akıştaki ilk videoyu kullanır.
    ns.publishDailyVideo = function publishDailyVideo(video) {
        if (!video) return;
        window.currentVideoData = {
            url: new URL(ns.watchUrl(video.id), window.location.origin).href,
            thumbnail: ns.thumbnailUrl(video.id),
            videoId: video.id
        };
    };

    // Sekme açılmadan önce ilk kartların küçük resimleri ve kanal logoları sırayla indirilir.
    function schedulePreparation() {
        if (!ns.connectionAllowsPreparation()) return;
        ns.idle(async () => {
            ns.preconnect();
            await homeReady();
            const sources = [
                ...ns.feed.firstThumbnails(PREPARE_FEED_THUMBNAILS),
                ...ns.shorts.firstPosters(PREPARE_SHORT_POSTERS),
                ...[...ns.channels.values()]
                    .filter(channel => ns.store.isFollowing(channel.id))
                    .map(channel => ns.safeLogoUrl(channel.logo))
            ];
            for (const source of sources) {
                if (!ns.connectionAllowsPreparation()) return;
                await ns.preloadImage(source);
            }
        });
    }

    // ---------- Menü ----------

    function closeMenu() {
        if (!menu) return;
        menu.remove();
        menu = null;
    }

    function openMenu(button) {
        const videoId = button.dataset.videoId;
        const video = findVideo(videoId);
        if (!video) return;
        if (menu?.dataset.videoId === videoId) {
            closeMenu();
            return;
        }
        closeMenu();
        const saved = ns.store.isSaved(videoId);
        menu = document.createElement('div');
        menu.className = 'videos-menu';
        menu.dataset.videoId = videoId;
        menu.setAttribute('role', 'menu');
        menu.innerHTML = `
            <button type="button" role="menuitem" data-action="share" data-video-id="${ns.escape(videoId)}"><i class="fa-solid fa-share" aria-hidden="true"></i> Paylaş</button>
            <button type="button" role="menuitem" data-action="save" data-video-id="${ns.escape(videoId)}"><i class="${saved ? 'fa-solid' : 'fa-regular'} fa-bookmark" aria-hidden="true"></i> ${saved ? 'Kaydedilenlerden çıkar' : 'Daha sonra izle'}</button>
            <a role="menuitem" href="${ns.escape(ns.youtubeUrl(video))}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-youtube" aria-hidden="true"></i> YouTube'da aç</a>
            <button type="button" role="menuitem" data-action="unfollow" data-channel-id="${ns.escape(video.channelId)}"><i class="fa-solid fa-ban" aria-hidden="true"></i> Bu kanalı takipten çıkar</button>`;
        page.appendChild(menu);
        const pageRect = page.getBoundingClientRect();
        const rect = button.getBoundingClientRect();
        const width = Math.min(260, pageRect.width - 16);
        const left = Math.max(8, Math.min(rect.right - pageRect.left - width, pageRect.width - width - 8));
        const below = rect.bottom - pageRect.top + 6;
        menu.style.width = `${width}px`;
        menu.style.left = `${left}px`;
        menu.style.top = `${below}px`;
        const menuRect = menu.getBoundingClientRect();
        if (menuRect.bottom > window.innerHeight - 70) {
            menu.style.top = `${rect.top - pageRect.top - menuRect.height - 6}px`;
        }
        menu.querySelector('button')?.focus({ preventScroll: true });
    }

    // Düğmeye bağlı genel menü (Shorts rafı ⋯ ve koleksiyon ⋯); aynı düğmeye ikinci dokunuş menüyü kapatır.
    function openAnchoredMenu(button, kind, html, extra = {}) {
        if (menu?.dataset.menu === kind && menu.dataset.anchorId === button.dataset.menuId) {
            closeMenu();
            return;
        }
        closeMenu();
        button.dataset.menuId = button.dataset.menuId || `${kind}-${Math.random().toString(36).slice(2, 8)}`;
        menu = document.createElement('div');
        menu.className = 'videos-menu videos-shelf-menu';
        menu.dataset.menu = kind;
        menu.dataset.anchorId = button.dataset.menuId;
        Object.assign(menu.dataset, extra);
        menu.setAttribute('role', 'menu');
        menu.innerHTML = html;
        page.appendChild(menu);
        const pageRect = page.getBoundingClientRect();
        const rect = button.getBoundingClientRect();
        const width = Math.min(320, pageRect.width - 16);
        const left = Math.max(8, Math.min(rect.right - pageRect.left - width, pageRect.width - width - 8));
        menu.style.width = `${width}px`;
        menu.style.left = `${left}px`;
        menu.style.top = `${rect.bottom - pageRect.top + 6}px`;
        const menuRect = menu.getBoundingClientRect();
        if (menuRect.bottom > window.innerHeight - 70) {
            menu.style.top = `${rect.top - pageRect.top - menuRect.height - 6}px`;
        }
        menu.querySelector('button')?.focus({ preventScroll: true });
    }

    // Shorts rafı menüsü (başlıktaki ve kutulardaki ⋯): "Daha az Shorts videosu göster".
    function openShelfMenu(button) {
        openAnchoredMenu(button, 'shelf', '<button type="button" role="menuitem" data-action="shelf-less"><i class="fa-regular fa-circle-xmark" aria-hidden="true"></i> Daha az Shorts videosu göster</button>');
    }

    // Hesabım koleksiyon menüsü (⋯): koleksiyondaki tüm videoları kaldırır.
    function openCollectionMenu(button) {
        const { store, title } = button.dataset;
        openAnchoredMenu(
            button,
            'collection',
            '<button type="button" role="menuitem" data-action="collection-clear"><i class="fa-solid fa-trash-can" aria-hidden="true"></i> Koleksiyonu temizle</button>',
            { store, title }
        );
    }

    function clearCollection() {
        const { store, title } = menu?.dataset || {};
        closeMenu();
        if (!store) return;
        if (!window.confirm(`"${title}" koleksiyonundaki tüm videolar kaldırılsın mı?`)) return;
        ns.store.clearList(store);
        ns.toast('Koleksiyon temizlendi');
    }

    // ---------- Etkileşimler ----------

    function findVideo(videoId) {
        return ns.videos.get(videoId)
            || ns.store.historyEntry(videoId)
            || ns.store.liked().find(item => item.id === videoId)
            || ns.store.saved().find(item => item.id === videoId)
            || null;
    }

    function isModifiedClick(event) {
        return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    }

    function onAction(button) {
        const action = button.dataset.action;
        const videoId = button.dataset.videoId;
        if (action === 'preview-sound') {
            ns.feed.preview.toggleSound();
            return;
        }
        if (action === 'like' || action === 'save') {
            const video = findVideo(videoId);
            if (!video) return;
            if (action === 'like') ns.store.toggleLike(video);
            else ns.store.toggleSave(video);
            closeMenu();
            return;
        }
        if (action === 'share') {
            closeMenu();
            ns.share(findVideo(videoId));
            return;
        }
        if (action === 'menu') {
            openMenu(button);
            return;
        }
        if (action === 'shelf-menu') {
            openShelfMenu(button);
            return;
        }
        if (action === 'shorts-fullscreen') {
            toggleFullscreen();
            return;
        }
        if (action === 'collection-menu') {
            openCollectionMenu(button);
            return;
        }
        if (action === 'collection-clear') {
            clearCollection();
            return;
        }
        if (action === 'shelf-less') {
            closeMenu();
            ns.store.hideShortsShelf();
            page.querySelector('.videos-shorts-shelf')?.remove();
            ns.toast('Ana sayfada daha az Shorts videosu gösterilecek');
            return;
        }
        if (action === 'follow' || action === 'unfollow') {
            const channelId = button.dataset.channelId;
            const following = action === 'follow' ? !ns.store.isFollowing(channelId) : false;
            ns.store.setFollow(channelId, following);
            const name = ns.channels.get(channelId)?.name || 'Kanal';
            ns.toast(following ? `${name} takip ediliyor` : `${name} takipten çıkarıldı`);
            closeMenu();
            return;
        }
        if (action === 'short-toggle') ns.shorts.tap();
    }

    function onClick(event) {
        if (menu && !event.target.closest('.videos-menu, [data-action="menu"], [data-action="shelf-menu"], [data-action="collection-menu"]')) closeMenu();

        const miniButton = event.target.closest('[data-mini]');
        if (miniButton) {
            event.preventDefault();
            onMiniClick(miniButton);
            return;
        }

        const sectionTab = event.target.closest('.videos-section-tab[data-section], [data-section-link]');
        if (sectionTab) {
            if (isModifiedClick(event)) return;
            event.preventDefault();
            goToSection(sectionTab.dataset.section || sectionTab.dataset.sectionLink);
            return;
        }

        const actionButton = event.target.closest('[data-action]');
        if (actionButton) {
            event.preventDefault();
            onAction(actionButton);
            return;
        }

        const channelButton = event.target.closest('[data-channel-filter]');
        if (channelButton) {
            const channelId = channelButton.dataset.channelFilter;
            if (currentRoute?.view !== 'feed') navigateTo({ view: 'feed' });
            ns.feed.selectChannel(channelId);
            window.scrollTo({ top: 0, behavior: 'auto' });
            return;
        }

        const openVideo = event.target.closest('[data-open-video]');
        if (openVideo) {
            if (isModifiedClick(event)) return;
            event.preventDefault();
            const videoId = openVideo.dataset.openVideo;
            const start = ns.feed.preview.currentTimeFor(videoId);
            ns.feed.preview.stop();
            navigateTo({ view: 'watch', videoId }, { start });
            return;
        }

        const openShort = event.target.closest('[data-open-short]');
        if (openShort) {
            if (isModifiedClick(event)) return;
            event.preventDefault();
            navigateTo({ view: 'shorts', videoId: openShort.dataset.openShort || null });
            return;
        }

        const libraryLink = event.target.closest('[data-library-list]');
        if (libraryLink) {
            if (isModifiedClick(event)) return;
            event.preventDefault();
            navigateTo({ view: 'library', list: libraryLink.dataset.libraryList });
            return;
        }

        if (event.target.closest('[data-library-back]')) {
            backToLibrary();
            return;
        }

        const remove = event.target.closest('[data-remove-from]');
        if (remove) {
            ns.store.removeFrom(remove.dataset.removeFrom, remove.dataset.videoId);
            return;
        }

        if (event.target.closest('[data-clear-history]')) {
            if (window.confirm('İzleme geçmişin bu cihazdan silinsin mi?')) {
                ns.store.clearHistory();
                ns.toast('Geçmiş temizlendi');
            }
            return;
        }

        if (event.target.closest('[data-follow-all]')) {
            ns.store.followAll();
            ns.toast('Tüm kanallar takip ediliyor');
            return;
        }

        if (event.target.closest('[data-retry="feed"]')) ns.feed.retry();
    }

    function onStoreChange(type, detail) {
        if (type === 'follow' || (type === 'sync' && detail.followChanged)) {
            onFollowChanged();
            ns.watch.refreshState();
            ns.library.refresh();
            return;
        }
        if (type === 'liked' || type === 'saved' || type === 'sync') {
            ns.syncActionButtons(page);
            ns.library.refresh();
            return;
        }
        if (type === 'history') ns.library.refresh();
    }

    function bindEvents() {
        page.addEventListener('click', onClick);
        ns.mini.init(page);
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') closeMenu();
        });
        window.addEventListener('scroll', () => {
            if (menu) closeMenu();
        }, { passive: true });
        window.addEventListener('scroll', onChromeScroll, { passive: true });
        document.addEventListener('fullscreenchange', syncFullscreenButton);
        ns.store.subscribe(onStoreChange);
        // Kabuk, önceden ısıtılmış sekmeyi ilk kez gösterirken resume() çağırmaz; gezinme
        // tamamlandığında yayınlanan olayla sekmenin görünür olduğu anlaşılır.
        window.addEventListener('rotakip:primary-content-ready', onNavigationSettled);
    }

    // ---------- Menü ve bölüm sekmelerini kaydırmaya göre gizleme ----------
    // Aşağı kaydırınca alt menü (mobil/tablet) ve bölüm sekmeleri efektle gizlenir, yukarı
    // kaydırınca geri gelir. Shorts kendi içinde kaydığından, Hesabım ise sekmeler hep görünür
    // kalması istendiğinden bu davranışa dahil değildir.

    function setChromeHidden(hidden) {
        if (chromeHidden === hidden) return;
        chromeHidden = hidden;
        page?.classList.toggle('is-chrome-hidden', hidden);
        document.body.classList.toggle('videos-chrome-hidden', hidden);
    }

    // Sekme görünürken gövdeye işaret konur (geçiş efektleri buna bağlıdır); ayrılırken menü eski haline döner.
    function setChromeEnabled(enabled) {
        document.body.classList.toggle('videos-chrome-active', enabled);
        if (!enabled) setChromeHidden(false);
        syncShortsTheme();
    }

    // Shorts siyah ve tam ekran olduğundan alt menü (mobil/tablet) yalnız bu görünümde koyu temaya geçer.
    function syncShortsTheme() {
        const enabled = document.body.classList.contains('videos-chrome-active');
        const inShorts = enabled && currentRoute?.view === 'shorts';
        document.body.classList.toggle('videos-shorts-view', inShorts);
        if (!inShorts) exitFullscreen();
        syncFullscreenButton();
    }

    // Shorts kendi iç kaydırıcısında kaydığından telefon tarayıcısı adres çubuğunu kendiliğinden gizlemez.
    // Shorts'un sağ üstündeki tam ekran düğmesi sayfayı tam ekrana alır; Shorts'tan ayrılınca çıkılır.
    // Tam ekran yalnızca Shorts'ta ve yalnızca bu düğmeyle açılır (iPhone Safari desteklemez: düğme gizlenir).
    function isFullscreen() {
        return document.fullscreenElement === document.documentElement;
    }

    function exitFullscreen() {
        if (isFullscreen()) document.exitFullscreen().catch(() => {});
    }

    function toggleFullscreen() {
        if (isFullscreen()) {
            exitFullscreen();
            return;
        }
        const root = document.documentElement;
        if (!root.requestFullscreen || document.fullscreenElement) return;
        root.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    }

    function syncFullscreenButton() {
        const button = page?.querySelector('.videos-shorts-fullscreen');
        if (!button) return;
        button.hidden = !document.fullscreenEnabled;
        const on = isFullscreen();
        button.setAttribute('aria-label', on ? 'Tam ekrandan çık' : 'Tam ekran');
        button.setAttribute('aria-pressed', on ? 'true' : 'false');
        const icon = button.querySelector('i');
        if (icon) icon.className = on ? 'fa-solid fa-compress' : 'fa-solid fa-expand';
    }

    // Görünüm değişimi ve kaydırma konumu geri yüklemesi programatik kaydırmadır; gizleme tetiklememeli.
    function resetChrome() {
        setChromeHidden(false);
        lastScrollY = window.scrollY;
        chromeSuppressUntil = performance.now() + CHROME_SUPPRESS_MS;
    }

    function onChromeScroll() {
        if (chromeFrame !== null) return;
        chromeFrame = window.requestAnimationFrame(() => {
            chromeFrame = null;
            if (!isActive()) return;
            const y = Math.max(0, window.scrollY);
            // Shorts ve Hesabım'da bölüm sekmeleri ile alt menü kaydırınca da yerinde kalır.
            if (currentRoute?.view === 'shorts' || currentRoute?.view === 'library' || y <= CHROME_SHOW_NEAR_TOP_PX) {
                setChromeHidden(false);
                lastScrollY = y;
                return;
            }
            const delta = y - lastScrollY;
            if (Math.abs(delta) < CHROME_SCROLL_DELTA_PX) return;
            lastScrollY = y;
            if (delta < 0) setChromeHidden(false);
            else if (performance.now() > chromeSuppressUntil) setChromeHidden(true);
        });
    }

    // Kabuk başka bir sekmeye geçince bu görünümü DOM'dan kaldırır; iframe'ler koptuğu için
    // oynatıcılar atılır (dönüşte kaldığı yerden yeniden oluşturulur).
    function onNavigationSettled() {
        if (page && !page.isConnected) {
            ns.watch.suspend();
            setMini(false);
            disposePlayers();
            setChromeEnabled(false);
            return;
        }
        activate();
    }

    function disposePlayers() {
        ns.feed.preview.disposePlayer();
        ns.watch.disposePlayer();
        ns.shorts.disposePlayer();
    }

    function activate() {
        if (!page?.isConnected || !page.closest('#tabContent')) return;
        if (window.location.pathname.replace(/\/$/, '') !== TAB_PATH) return;
        const wasActive = active;
        active = true;
        setChromeEnabled(true);
        const route = readRoute();
        if (routeKey(route) !== routeKey(currentRoute)) {
            render(route);
            return;
        }
        if (!wasActive) {
            sections[route.view].enter(route);
            sections[route.view].activate?.();
            logRoute(route);
        }
    }

    // ---------- Yaşam döngüsü ----------

    async function initialize() {
        page = document.querySelector('.videos');
        if (!page) return;
        Object.values(sections).forEach(section => section.init(page));
        bindEvents();
        active = Boolean(page.closest('#tabContent')) && window.location.pathname.replace(/\/$/, '') === TAB_PATH;
        setChromeEnabled(active);
        const firstContent = loadHome();
        render(readRoute());
        schedulePreparation();
        // İlk görünümde içerik hazır olsun (önbellekten anında, yoksa sunucudan en fazla birkaç sn).
        await Promise.race([
            firstContent.then(() => ns.waitForImages(ns.feed.firstThumbnails(2))),
            new Promise(resolve => window.setTimeout(resolve, INITIAL_CONTENT_WAIT_MS))
        ]);
    }

    function init() {
        if (!initPromise) initPromise = initialize();
        return initPromise;
    }

    async function resume() {
        await init();
        if (!page) return;
        active = true;
        setChromeEnabled(true);
        const route = readRoute();
        if (routeKey(route) !== routeKey(currentRoute)) {
            render(route);
            return;
        }
        currentRoute = route;
        sections[route.view].enter(route);
        if (route.view === 'feed') restoreFeedScroll();
        logRoute(route);
    }

    function destroy() {
        closeMenu();
        if (currentRoute?.view === 'feed' && active) feedScrollY = window.scrollY;
        active = false;
        lastLoggedKey = '';
        setChromeEnabled(false);
        // İzleme sayfasındaki video burada durdurulmaz: sekme içi geri/ileri (popstate) de destroy()
        // → resume() yolundan geçer ve akışa dönüşte video mini oynatıcıda sürmelidir. Sekmeden
        // gerçekten çıkılırsa görünüm DOM'dan kalkar, oynatıcı onNavigationSettled'da atılır.
        if (currentRoute && currentRoute.view !== 'watch') sections[currentRoute.view].leave();
        ns.store.flush();
    }

    ns.tab = {
        isActive,
        syncSectionTabs,
        isMiniActive: () => miniActive,
        setShortsPaused,
        currentView: () => currentRoute?.view || null,
        homeReady,
        loadHome,
        navigateTo
    };

    window.RoTaKipVideoTab = {
        prepareBeforeReveal: true,
        init,
        resume,
        destroy
    };
})();
