(function () {
    const ns = window.RoTaKipTesbihat;
    const STORAGE_KEY = 'rotakip.tesbihat.v1';
    const RECHECK_INTERVAL_MS = 10 * 60 * 1000;

    const documents = new Map();
    let version = null;
    let restored = false;
    let syncPromise = null;
    let lastCheckedAt = 0;

    function documentKey(vakit, tur) {
        return `${vakit}:${tur}`;
    }

    function isValidDocument(item) {
        return Boolean(item) && typeof item.vakit === 'string' && typeof item.tur === 'string'
            && Array.isArray(item.adimlar);
    }

    function apply(nextVersion, list) {
        documents.clear();
        list.filter(isValidDocument).forEach(item => documents.set(documentKey(item.vakit, item.tur), item));
        version = nextVersion;
    }

    // Önceki ziyaretlerde saklanan paket yalnızca bir kez ve bozuksa yok sayılarak okunur.
    function restore() {
        if (restored) return;
        restored = true;
        const raw = ns.readStorage(STORAGE_KEY);
        if (!raw) return;
        try {
            const saved = JSON.parse(raw);
            if (typeof saved?.version === 'string' && Array.isArray(saved.tesbihat)) {
                apply(saved.version, saved.tesbihat);
            }
        } catch (_error) {
            // Bozuk kayıt bir sonraki başarılı eşitlemede üzerine yazılır.
        }
    }

    async function check() {
        const query = version ? `?version=${encodeURIComponent(version)}` : '';
        const data = await ns.fetchJson(`/api/tesbihat${query}`);
        lastCheckedAt = Date.now();
        if (data.unchanged || !Array.isArray(data.tesbihat)) return;
        apply(data.version, data.tesbihat);
        ns.writeStorage(STORAGE_KEY, JSON.stringify({ version: data.version, tesbihat: data.tesbihat }));
    }

    ns.store = {
        // Yalnızca elde olanı döndürür; ağ isteği yapmaz.
        peek(vakit, tur) {
            restore();
            return documents.get(documentKey(vakit, tur)) || null;
        },
        // Elde kayıt varsa onunla çalışmaya devam edilir; sürüm kontrolü arkada yapılır.
        // Yakın zamanda kontrol edildiyse (`force` olmadıkça) tekrar sorulmaz.
        sync({ force = false } = {}) {
            restore();
            if (syncPromise) return syncPromise;
            if (!force && Date.now() - lastCheckedAt < RECHECK_INTERVAL_MS) return Promise.resolve();
            syncPromise = check()
                .catch(error => {
                    console.warn('Tesbihatlar güncellenemedi:', error);
                })
                .finally(() => {
                    syncPromise = null;
                });
            return syncPromise;
        }
    };
})();
