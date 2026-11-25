(function () {
    const ns = window.RoTaKipTefekkur;
    const TAB_PATH = '/tefekkur';
    const HISTORY_MARKER = 'rotakipTefekkur';
    let initPromise = null;
    let currentRoute = { view: 'home' };
    let renderSequence = 0;
    let page = null;

    const MODE_STORAGE_PREFIX = 'rotakip:tefekkur-mode:';

    // Metin / Resim seçimi: URL'de varsa o, yoksa en son seçilen, yoksa bölümün varsayılanı.
    function preferredMode(key, section) {
        const stored = ns.readStorage(MODE_STORAGE_PREFIX + key);
        return ns.findMode(section, stored) ? stored : section.defaultMode;
    }

    // URL biçimi: /tefekkur, /tefekkur?bolum=esma, /tefekkur?bolum=risale&mod=metin|resim
    function readRoute() {
        if (window.location.pathname.replace(/\/$/, '') !== TAB_PATH) return { view: 'home' };
        const params = new URLSearchParams(window.location.search);
        const bolum = params.get('bolum');
        if (!ns.findSection(bolum)) return { view: 'home' };
        return routeForSection(bolum, params.get('mod'));
    }

    function routeUrl(route) {
        if (!route.bolum) return TAB_PATH;
        const params = new URLSearchParams({ bolum: route.bolum });
        if (route.mod) params.set('mod', route.mod);
        return `${TAB_PATH}?${params.toString()}`;
    }

    function parentRoute() {
        return { view: 'home' };
    }

    function routeForSection(key, requestedMode) {
        const section = ns.findSection(key);
        if (!section) return { view: 'home' };
        if (section.kind === 'radio') return { view: 'radio', bolum: key };
        if (section.kind === 'zikirmatik') return { view: 'zikirmatik', bolum: key };
        if (section.kind === 'ilahi') return { view: 'ilahi', bolum: key };
        // Kaydedilenler okuyucuda açılır; `mod` kaydı süzülen bölümdür (yoksa Tümü).
        if (section.kind === 'saved') {
            const filter = ns.favorites.normalizeFilter(requestedMode);
            return filter === 'all' ? { view: 'slider', bolum: key } : { view: 'slider', bolum: key, mod: filter };
        }
        if (!section.modes) return { view: 'slider', bolum: key };
        const mod = ns.findMode(section, requestedMode) ? requestedMode : preferredMode(key, section);
        return { view: 'slider', bolum: key, mod };
    }

    function sliderSource(route) {
        const section = ns.findSection(route.bolum);
        if (section.kind === 'saved') {
            const filter = ns.favorites.normalizeFilter(route.mod);
            return {
                section: '',
                label: section.label,
                title: section.label,
                source: { type: 'saved', category: filter },
                chip: 'random',
                filter,
                reload: true,
                emptyIcon: 'fa-regular fa-star',
                emptyMessage: filter === 'all'
                    ? 'Henüz kaydettiğin bir tefekkür yok. Beğendiğin içerikleri kartlardaki yıldıza dokunarak buraya ekleyebilirsin.'
                    : `${ns.favorites.filterInfo(filter).label} bölümünden kaydettiğin bir tefekkür yok.`
            };
        }
        const mode = ns.findMode(section, route.mod);
        if (mode) {
            return {
                section: route.bolum,
                label: section.label,
                title: section.label,
                source: mode.source,
                emptyMessage: mode.emptyMessage,
                activeMode: route.mod,
                modes: Object.entries(section.modes).map(([key, entry]) => ({ key, label: entry.label, icon: entry.icon }))
            };
        }
        return {
            section: route.bolum,
            label: section.label,
            title: section.label,
            source: section.source,
            chip: section.chip,
            emptyMessage: section.emptyMessage
        };
    }

    // Ana listeden bir bölüm açıldığında yalnızca yönetici panelindeki (admin.html) etkinlik
    // kayıtlarına yazılır; sekmenin kendi açılışı kabuk tarafından ayrıca kaydedilir. Ana liste
    // ve arka plan hazırlığı (route = home) kaydedilmez. Hata sessizce yutulur.
    async function logTefekkurView(route) {
        const payload = JSON.stringify({
            action: 'tefekkur_bölüm_görüntüleme',
            view: route.view,
            section: route.bolum,
            mode: route.mod || null,
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

    function replayEnterAnimation(view) {
        if (ns.prefersReducedMotion()) return;
        view.classList.remove('is-entering');
        void view.offsetWidth;
        view.classList.add('is-entering');
    }

    async function render(route) {
        const sequence = ++renderSequence;
        const previousView = currentRoute.view;
        currentRoute = route;
        page.dataset.section = route.bolum || '';
        let shownView = null;
        page.querySelectorAll(':scope > .tefekkur-view').forEach(view => {
            const visible = view.dataset.view === route.view;
            view.hidden = !visible;
            if (visible) {
                view.dataset.section = route.bolum || '';
                shownView = view;
            }
        });
        if (shownView && previousView !== route.view) replayEnterAnimation(shownView);
        if (route.view !== 'radio') ns.radio.hide();
        // İlahi sayfasından ayrılınca çalan ilahi köşede mini oynatıcıya dönüşür.
        if (route.view !== 'ilahi') ns.ilahi.hide();
        // İçerik yüklenmesini beklemeden kaydedilir; yavaş bağlantıda ya da hatada da bölümün açıldığı görünür.
        if (route.view !== 'home') logTefekkurView(route);

        if (route.view === 'home') {
            ns.radio.render();
        } else if (route.view === 'slider') {
            await ns.slider.show(sliderSource(route));
        } else if (route.view === 'zikirmatik') {
            ns.zikirmatik.show();
        } else if (route.view === 'radio') {
            await ns.radio.show(route.bolum);
        } else if (route.view === 'ilahi') {
            await ns.ilahi.show();
        }
        return sequence === renderSequence;
    }

    ns.navigate = function navigate(route, options = {}) {
        if (options.replace) {
            const keepsMarker = Boolean(window.history.state?.[HISTORY_MARKER]);
            window.history.replaceState({ [HISTORY_MARKER]: keepsMarker }, '', routeUrl(route));
        } else {
            window.history.pushState({ [HISTORY_MARKER]: true }, '', routeUrl(route));
        }
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        return render(route);
    };

    ns.back = function back() {
        // Sekme içinde açılan görünümlerde tarayıcı geçmişi kullanılır; doğrudan açılan
        // bağlantılarda ise geçmişten çıkmamak için bir üst görünüme geçilir.
        if (window.history.state?.[HISTORY_MARKER]) {
            window.history.back();
            return;
        }
        ns.navigate(parentRoute(), { replace: true });
    };

    function bindEvents() {
        page.addEventListener('click', event => {
            if (event.target.closest('[data-back]')) {
                ns.back();
                return;
            }
            const row = event.target.closest('.tefekkur-section-row');
            if (row) {
                ns.navigate(routeForSection(row.dataset.section));
                return;
            }
            // Kaydedilenlerde tür düğmesi: seçim penceresi açılır, seçilen tür geçmişe yeni kayıt eklemez.
            const savedFilter = event.target.closest('[data-saved-filter]');
            if (savedFilter && currentRoute.view === 'slider') {
                ns.favorites.openFilterSheet(currentRoute.mod, filter => {
                    ns.navigate(routeForSection(currentRoute.bolum, filter), { replace: true });
                });
                return;
            }
            // Metin / Resim anahtarı geçmişe yeni kayıt eklemez; geri tuşu yine ana listeye döner.
            const mode = event.target.closest('.tefekkur-slider-mode');
            if (mode && currentRoute.view === 'slider') {
                if (mode.dataset.mode === currentRoute.mod) return;
                ns.writeStorage(MODE_STORAGE_PREFIX + currentRoute.bolum, mode.dataset.mode);
                ns.navigate({ view: 'slider', bolum: currentRoute.bolum, mod: mode.dataset.mode }, { replace: true });
                return;
            }
            if (event.target.closest('[data-open-radio]')) {
                const key = ns.radio.activeKey();
                if (key) ns.navigate({ view: 'radio', bolum: key });
            }
        });
    }

    function connectionAllowsPreparation() {
        const connection = navigator.connection;
        if (!connection) return true;
        return !connection.saveData && !['slow-2g', '2g'].includes(connection.effectiveType);
    }

    // Okuyucu bölümlerinin tüm listeleri (ayet, hadis, dua, Risale-i Nur metin/görsel, Esmaül Hüsna)
    // ve radyo adresleri sekme açıldıktan sonra tek tek, boşta kalınca indirilir. Böylece bir
    // bölüme girildiğinde yükleme beklenmez. Hatalar yutulur; bölüm açılınca yeniden denenir.
    async function prepareContent() {
        if (!connectionAllowsPreparation()) return;
        const sources = [];
        Object.values(ns.SECTIONS).forEach(section => {
            if (section.kind !== 'slides') return;
            if (section.modes) Object.values(section.modes).forEach(mode => sources.push(mode.source));
            else sources.push(section.source);
        });
        for (const source of sources) await ns.slider.prefetch(source);
        await ns.radio.preload();
        await ns.ilahi.preload();
    }

    function schedulePreparation() {
        const run = () => prepareContent().catch(error => console.warn('Tefekkür içeriği hazırlanamadı:', error));
        if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 2000 });
        else window.setTimeout(run, 600);
    }

    async function initialize() {
        page = document.querySelector('.tefekkur-page');
        ns.slider.init();
        ns.zikirmatik.init();
        ns.radio.init();
        ns.ilahi.init();
        ns.favorites.init();
        bindEvents();
        await render(readRoute());
        schedulePreparation();
    }

    window.RoTaKipTefekkurTab = {
        prepareBeforeReveal: true,
        init() {
            if (!initPromise) {
                initPromise = initialize().catch(error => {
                    initPromise = null;
                    throw error;
                });
            }
            return initPromise;
        },
        async resume() {
            await render(readRoute());
        },
        // Radyo bilerek durdurulmaz: kullanıcı başka sekmeye geçse de yayın sürer. Çalan ilahi köşede
        // mini oynatıcı olarak sürer; yalnız hedef Videolar sekmesiyse yok edilir.
        destroy() {
            ns.ilahi.leaveTab();
        }
    };
})();
