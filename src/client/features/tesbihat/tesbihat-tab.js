(function () {
    const ns = window.RoTaKipTesbihat;
    const TAB_PATH = '/tesbihat';
    const HISTORY_MARKER = 'rotakipTesbihat';
    let initPromise = null;
    let currentRoute = { view: 'home' };

    function readRoute() {
        if (window.location.pathname.replace(/\/$/, '') !== TAB_PATH) return { view: 'home' };
        const params = new URLSearchParams(window.location.search);
        if (params.has('konum')) return { view: 'location' };
        const vakit = params.get('vakit');
        const tur = params.get('tur');
        if (!ns.findVakit(vakit)) return { view: 'home' };
        if (Object.hasOwn(ns.TUR_LABELS, tur)) return { view: 'reader', vakit, tur };
        return { view: 'types', vakit };
    }

    function routeUrl(route) {
        if (route.view === 'location') return `${TAB_PATH}?konum`;
        if (route.view === 'types') return `${TAB_PATH}?vakit=${encodeURIComponent(route.vakit)}`;
        if (route.view === 'reader') {
            return `${TAB_PATH}?vakit=${encodeURIComponent(route.vakit)}&tur=${encodeURIComponent(route.tur)}`;
        }
        return TAB_PATH;
    }

    function parentRoute(route) {
        if (route.view === 'reader') return { view: 'types', vakit: route.vakit };
        return { view: 'home' };
    }

    async function render(route) {
        currentRoute = route;
        document.querySelectorAll('.tesbihat-page > .tesbihat-view').forEach(view => {
            view.hidden = view.dataset.view !== route.view;
        });
        if (route.view === 'home') ns.home.render();
        else if (route.view === 'location') await ns.locationPicker.open();
        else if (route.view === 'types') ns.reader.showTypes(route.vakit);
        else if (route.view === 'reader') await ns.reader.showReader(route.vakit, route.tur);
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
        ns.navigate(parentRoute(currentRoute), { replace: true });
    };

    async function initialize() {
        ns.home.init();
        ns.locationPicker.init();
        ns.reader.init();
        document.querySelector('.tesbihat-page').addEventListener('click', event => {
            if (event.target.closest('[data-back]')) ns.back();
        });
        await ns.schedule.init();
        // Namaz vakitleri geldikten sonra tüm tesbihatlar tek istekle (ya da yalnız sürüm
        // kontrolüyle) arkada hazırlanır; okuma ekranı açılınca beklemek gerekmez.
        ns.store.sync();
        await render(readRoute());
        ns.schedule.start();
    }

    window.RoTaKipTesbihatTab = {
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
            ns.store.sync();
            ns.schedule.start();
            await render(readRoute());
        },
        destroy() {
            ns.schedule.stop();
        }
    };
})();
