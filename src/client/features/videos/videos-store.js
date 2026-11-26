// ==================== Videolar: cihazda saklanan kullanıcı verisi ====================
// Beğenilenler, kaydedilenler, izleme geçmişi, abone olunan ve önerilmeyen kanallar yalnızca bu
// tarayıcıda (localStorage) tutulur. Sekme hiçbir aboneliği olmadan açılır: akışta tüm kanallar
// görünür, abone olunanların videoları daha sık çıkar. "Bu kanalı önerme" denen kanallar
// (yalnız abone olunmayanlar) akışta, Shorts'ta ve önerilerde gösterilmez.

(function () {
    const ns = window.RoTaKipVideos;
    const STATE_KEY = 'rotakip:videos:v1';
    // Sürüm 1'deki "takipten çıkarılanlar" (unfollowed) listesi yok sayılır; diğer veriler korunur.
    const STATE_VERSION = 2;
    const CHANNEL_LIST_LIMIT = 200;
    const HOME_CACHE_KEY = 'rotakip:videos:home-cache';
    const SHELF_HIDE_DAYS = 7;
    const HOME_CACHE_MAX_AGE_MS = 30 * 60 * 1000;
    const HISTORY_LIMIT = 200;
    const LIST_LIMIT = 500;
    const COMPLETED_LIMIT = 2000;
    // Video ya da Shorts oynatmada bu saniyeye ulaşılınca "izlendi" sayılır ve akışta yeniden önerilmez.
    const WATCHED_SECONDS = 5;

    function readJson(key) {
        try {
            const raw = window.localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (_error) {
            return null;
        }
    }

    function writeJson(key, value) {
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (_error) {
            // Gizli mod / kota dolu: veri yalnızca bu oturumda kalır.
            return false;
        }
    }

    function emptyState() {
        return { v: STATE_VERSION, subscribed: [], hidden: [], liked: [], disliked: [], saved: [], history: [], completed: [], shelfHiddenUntil: 0, selectedChannel: '', autoplay: true };
    }

    function isSnapshot(item) {
        return item && ns.isVideoId(item.id);
    }

    function channelList(value) {
        return Array.isArray(value)
            ? [...new Set(value.filter(id => typeof id === 'string' && id))].slice(0, CHANNEL_LIST_LIMIT)
            : [];
    }

    function normalizeState(raw) {
        const state = emptyState();
        if (!raw || (raw.v !== 1 && raw.v !== STATE_VERSION)) return state;
        state.subscribed = channelList(raw.subscribed);
        // Abone olunan kanal önerilmeyenlerde olamaz.
        const subscribed = new Set(state.subscribed);
        state.hidden = channelList(raw.hidden).filter(id => !subscribed.has(id));
        state.liked = Array.isArray(raw.liked) ? raw.liked.filter(isSnapshot).slice(0, LIST_LIMIT) : [];
        state.disliked = Array.isArray(raw.disliked) ? raw.disliked.filter(isSnapshot).slice(0, LIST_LIMIT) : [];
        state.saved = Array.isArray(raw.saved) ? raw.saved.filter(isSnapshot).slice(0, LIST_LIMIT) : [];
        state.history = Array.isArray(raw.history) ? raw.history.filter(isSnapshot).slice(0, HISTORY_LIMIT) : [];
        state.shelfHiddenUntil = Number.isFinite(raw.shelfHiddenUntil) ? raw.shelfHiddenUntil : 0;
        state.completed = Array.isArray(raw.completed) ? raw.completed.filter(ns.isVideoId).slice(0, COMPLETED_LIMIT) : [];
        state.selectedChannel = typeof raw.selectedChannel === 'string' ? raw.selectedChannel.slice(0, 120) : '';
        state.autoplay = raw.autoplay !== false;
        return state;
    }

    let state = normalizeState(readJson(STATE_KEY));
    let indexes = null;
    const listeners = new Set();

    function buildIndexes() {
        indexes = {
            liked: new Set(state.liked.map(item => item.id)),
            disliked: new Set(state.disliked.map(item => item.id)),
            saved: new Set(state.saved.map(item => item.id)),
            subscribed: new Set(state.subscribed),
            hidden: new Set(state.hidden),
            completed: new Set(state.completed),
            history: new Map(state.history.map(item => [item.id, item]))
        };
    }
    buildIndexes();

    let saveTimer = null;
    function persist({ immediate = false } = {}) {
        window.clearTimeout(saveTimer);
        if (immediate) {
            writeJson(STATE_KEY, state);
            return;
        }
        // İlerleme kayıtları sık gelir; yazma işlemi kısa süre biriktirilir.
        saveTimer = window.setTimeout(() => writeJson(STATE_KEY, state), 800);
    }

    function emit(type, detail = {}) {
        listeners.forEach(listener => {
            try {
                listener(type, detail);
            } catch (error) {
                console.warn('Video deposu dinleyicisi hata verdi:', error);
            }
        });
    }

    function upsertFront(list, entry, limit) {
        const next = list.filter(item => item.id !== entry.id);
        next.unshift(entry);
        return next.slice(0, limit);
    }

    function toggleList(listName, video) {
        if (!video || !ns.isVideoId(video.id)) return false;
        const active = indexes[listName].has(video.id);
        state[listName] = active
            ? state[listName].filter(item => item.id !== video.id)
            : upsertFront(state[listName], { ...ns.snapshot(video), at: Date.now() }, LIST_LIMIT);
        buildIndexes();
        persist({ immediate: true });
        emit(listName, { id: video.id, active: !active });
        return !active;
    }

    // Süresi 5 sn'den kısa videolarda (kısa Shorts) süresinin tamamı yeterlidir.
    function isWatchedProgress(position, duration) {
        return position >= (duration > 0 ? Math.min(WATCHED_SECONDS, duration) : WATCHED_SECONDS);
    }

    const store = {
        WATCHED_SECONDS,
        // ---------- Abonelik ve önerilmeyen kanallar ----------
        // İkisi birbirini dışlar: abone olununca kanal önerilmeyenlerden çıkar; abone olunan kanal gizlenemez.
        isSubscribed: channelId => indexes.subscribed.has(channelId),
        isHidden: channelId => indexes.hidden.has(channelId),
        setSubscribed(channelId, subscribed) {
            if (typeof channelId !== 'string' || !channelId) return false;
            const next = Boolean(subscribed);
            if (next === store.isSubscribed(channelId)) return false;
            const wasHidden = indexes.hidden.has(channelId);
            state.subscribed = next
                ? [channelId, ...state.subscribed].slice(0, CHANNEL_LIST_LIMIT)
                : state.subscribed.filter(id => id !== channelId);
            if (next) state.hidden = state.hidden.filter(id => id !== channelId);
            buildIndexes();
            persist({ immediate: true });
            emit('subscription', { channelId, subscribed: next, hiddenChanged: wasHidden });
            return true;
        },
        setHidden(channelId, hidden) {
            if (typeof channelId !== 'string' || !channelId) return false;
            const next = Boolean(hidden);
            if (next === store.isHidden(channelId) || (next && store.isSubscribed(channelId))) return false;
            state.hidden = next
                ? [channelId, ...state.hidden].slice(0, CHANNEL_LIST_LIMIT)
                : state.hidden.filter(id => id !== channelId);
            buildIndexes();
            persist({ immediate: true });
            emit('hidden', { channelId, hidden: next });
            return true;
        },
        subscribedIds: () => state.subscribed.slice(),
        hiddenIds: () => state.hidden.slice(),
        // Sunucuya gönderilen anahtarlar: sıralı, virgülle ayrılmış kanal kimlikleri.
        excludeKey() {
            return [...state.hidden].sort().join(',');
        },
        includeKey() {
            return [...state.subscribed].sort().join(',');
        },
        // Ana akış isteği ve önbelleği bu iki listeye göre ayrılır.
        feedFilter() {
            const exclude = store.excludeKey();
            const include = store.includeKey();
            return { exclude, include, key: `${exclude}|${include}` };
        },

        // ---------- Akışta seçili kanal ----------
        // Videolar sekmesi yeniden açıldığında kullanıcı aynı kanaldan devam eder ("" = Tümü).
        selectedChannel: () => state.selectedChannel,
        setSelectedChannel(channelId) {
            const next = typeof channelId === 'string' ? channelId.slice(0, 120) : '';
            if (next === state.selectedChannel) return;
            state.selectedChannel = next;
            persist({ immediate: true });
        },

        // ---------- Otomatik oynatma ----------
        // İzleme sayfasında video bitince sıradaki video geri sayımla açılır (varsayılan açık).
        isAutoplay: () => state.autoplay,
        setAutoplay(enabled) {
            const next = Boolean(enabled);
            if (next === state.autoplay) return;
            state.autoplay = next;
            persist({ immediate: true });
        },

        // ---------- Ana sayfadaki Shorts rafı ----------
        // "Daha az Shorts videosu göster": raf bu cihazda birkaç gün gizlenir, sonra kendiliğinden döner.
        isShortsShelfHidden() {
            return state.shelfHiddenUntil > Date.now();
        },
        hideShortsShelf(days = SHELF_HIDE_DAYS) {
            state.shelfHiddenUntil = Date.now() + days * 24 * 60 * 60 * 1000;
            persist({ immediate: true });
            emit('shelf', { hidden: true });
        },

        // ---------- Beğeni / kayıt ----------
        isLiked: id => indexes.liked.has(id),
        isSaved: id => indexes.saved.has(id),
        isDisliked: id => indexes.disliked.has(id),
        // Beğen ve beğenme birbirini dışlar: biri açılırsa diğeri kapanır.
        toggleLike(video) {
            const active = toggleList('liked', video);
            if (active && indexes.disliked.has(video.id)) store.removeFrom('disliked', video.id);
            return active;
        },
        toggleDislike(video) {
            const active = toggleList('disliked', video);
            if (active && indexes.liked.has(video.id)) store.removeFrom('liked', video.id);
            return active;
        },
        toggleSave: video => toggleList('saved', video),
        liked: () => state.liked.slice(),
        disliked: () => state.disliked.slice(),
        saved: () => state.saved.slice(),
        removeFrom(listName, id) {
            if (!['liked', 'disliked', 'saved', 'history'].includes(listName)) return;
            state[listName] = state[listName].filter(item => item.id !== id);
            buildIndexes();
            persist({ immediate: true });
            emit(listName, { id, active: false });
        },

        // Koleksiyonun (beğenilenler / kaydedilenler) videolarını kaldırır. `type` ('shorts' | 'video') verilirse
        // yalnızca o türdekiler silinir (Beğendiğim videolar ile Beğendiğim Shorts'lar ayrı koleksiyonlardır).
        clearList(listName, type = '') {
            if (!['liked', 'saved'].includes(listName) || !state[listName].length) return;
            state[listName] = type
                ? state[listName].filter(video => (video.type === 'shorts') !== (type === 'shorts'))
                : [];
            buildIndexes();
            persist({ immediate: true });
            emit(listName, { cleared: true });
        },

        // ---------- Geçmiş ----------
        history: () => state.history.slice(),
        isCompleted: id => indexes.completed.has(id),
        historyEntry: id => indexes.history.get(id) || null,
        progressRatio(id) {
            const entry = indexes.history.get(id);
            if (!entry || !entry.duration) return 0;
            return Math.min(1, (entry.position || 0) / entry.duration);
        },
        // Kaldığı yer: başta veya sonda değilse devam konumu döner.
        resumePosition(id) {
            const entry = indexes.history.get(id);
            if (!entry || !entry.duration) return 0;
            const position = entry.position || 0;
            return position > 10 && position < entry.duration - 15 ? Math.floor(position) : 0;
        },
        recordProgress(video, position = 0, duration = 0) {
            if (!video || !ns.isVideoId(video.id)) return;
            const knownDuration = Number(duration) || Number(video.duration) || 0;
            const safePosition = Math.max(0, Number(position) || 0);
            const previous = indexes.history.get(video.id);
            const entry = {
                ...ns.snapshot(video),
                at: Date.now(),
                position: safePosition,
                duration: knownDuration
            };
            const isNew = !previous;
            // Geçmiş en son izlenen başta olacak şekilde güncellenir; yalnız konum değiştiyse sıra korunur.
            if (isNew || state.history[0]?.id !== video.id) {
                state.history = upsertFront(state.history, entry, HISTORY_LIMIT);
            } else {
                state.history[0] = entry;
            }
            let completedNow = false;
            if (!indexes.completed.has(video.id) && isWatchedProgress(safePosition, knownDuration)) {
                state.completed = [video.id, ...state.completed].slice(0, COMPLETED_LIMIT);
                completedNow = true;
            }
            buildIndexes();
            persist({ immediate: completedNow || isNew });
            if (isNew || completedNow) emit('history', { id: video.id, completed: completedNow });
            else emit('progress', { id: video.id });
        },
        // Akıştaki önizlemede yeterince izlenen video "izlendi" olur ve geçmişe girer; önizlemedeki
        // an konum olarak saklanır (en az WATCHED_SECONDS), böylece video ilerleme çubuğu kazanır.
        markWatched(video, position = 0, duration = 0) {
            if (!video || indexes.completed.has(video.id)) return;
            store.recordProgress(video, Math.max(Number(position) || 0, WATCHED_SECONDS), duration);
        },
        markCompleted(video) {
            if (!video || indexes.completed.has(video.id)) return;
            store.recordProgress(video, video.duration || 0, video.duration || 0);
            if (!indexes.completed.has(video.id)) {
                state.completed = [video.id, ...state.completed].slice(0, COMPLETED_LIMIT);
                buildIndexes();
                persist({ immediate: true });
                emit('history', { id: video.id, completed: true });
            }
        },
        clearHistory() {
            state.history = [];
            state.completed = [];
            buildIndexes();
            persist({ immediate: true });
            emit('history', { cleared: true });
        },
        flush() {
            if (saveTimer) persist({ immediate: true });
        },

        // ---------- Ana akış önbelleği ----------
        // Son ana akış yanıtı saklanır; sekme bir sonraki açılışta beklemeden çizilir, arka planda tazelenir.
        readHomeCache(filterKey) {
            const cached = readJson(HOME_CACHE_KEY);
            if (!cached || cached.filterKey !== filterKey || !cached.data) return null;
            if (Date.now() - Number(cached.at || 0) > HOME_CACHE_MAX_AGE_MS) return null;
            return cached.data;
        },
        writeHomeCache(filterKey, data) {
            writeJson(HOME_CACHE_KEY, { at: Date.now(), filterKey, data });
        },

        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        }
    };

    // Başka bir tarayıcı sekmesinde yapılan değişiklikler bu sekmeye de yansır.
    window.addEventListener('storage', event => {
        if (event.key !== STATE_KEY) return;
        const previous = store.feedFilter();
        state = normalizeState(readJson(STATE_KEY));
        buildIndexes();
        const next = store.feedFilter();
        emit('sync', {
            subscriptionChanged: previous.include !== next.include,
            hiddenChanged: previous.exclude !== next.exclude
        });
    });

    window.addEventListener('pagehide', () => store.flush());

    ns.store = store;
})();
