// ==================== Videolar: cihazda saklanan kullanıcı verisi ====================
// Beğenilenler, kaydedilenler, izleme geçmişi ve takipten çıkarılan kanallar yalnızca bu
// tarayıcıda (localStorage) tutulur. Takip "çıkarılanlar" listesiyle saklanır; böylece
// sonradan eklenen kanallar herkes için otomatik olarak takipli gelir.

(function () {
    const ns = window.RoTaKipVideos;
    const STATE_KEY = 'rotakip:videos:v1';
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
        return { v: 1, unfollowed: [], liked: [], saved: [], history: [], completed: [], shelfHiddenUntil: 0 };
    }

    function isSnapshot(item) {
        return item && ns.isVideoId(item.id);
    }

    function normalizeState(raw) {
        const state = emptyState();
        if (!raw || raw.v !== 1) return state;
        state.unfollowed = Array.isArray(raw.unfollowed) ? raw.unfollowed.filter(id => typeof id === 'string').slice(0, 200) : [];
        state.liked = Array.isArray(raw.liked) ? raw.liked.filter(isSnapshot).slice(0, LIST_LIMIT) : [];
        state.saved = Array.isArray(raw.saved) ? raw.saved.filter(isSnapshot).slice(0, LIST_LIMIT) : [];
        state.history = Array.isArray(raw.history) ? raw.history.filter(isSnapshot).slice(0, HISTORY_LIMIT) : [];
        state.shelfHiddenUntil = Number.isFinite(raw.shelfHiddenUntil) ? raw.shelfHiddenUntil : 0;
        state.completed = Array.isArray(raw.completed) ? raw.completed.filter(ns.isVideoId).slice(0, COMPLETED_LIMIT) : [];
        return state;
    }

    let state = normalizeState(readJson(STATE_KEY));
    let indexes = null;
    const listeners = new Set();

    function buildIndexes() {
        indexes = {
            liked: new Set(state.liked.map(item => item.id)),
            saved: new Set(state.saved.map(item => item.id)),
            unfollowed: new Set(state.unfollowed),
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
        // ---------- Takip ----------
        isFollowing(channelId) {
            return !indexes.unfollowed.has(channelId);
        },
        setFollow(channelId, following) {
            if (typeof channelId !== 'string' || !channelId) return;
            if (following === store.isFollowing(channelId)) return;
            state.unfollowed = following
                ? state.unfollowed.filter(id => id !== channelId)
                : [...state.unfollowed, channelId];
            buildIndexes();
            persist({ immediate: true });
            emit('follow', { channelId, following });
        },
        followAll() {
            if (!state.unfollowed.length) return;
            state.unfollowed = [];
            buildIndexes();
            persist({ immediate: true });
            emit('follow', { all: true });
        },
        // Sunucuya gönderilen anahtar: sıralı, virgülle ayrılmış takipten çıkarılan kanallar.
        excludeKey() {
            return [...state.unfollowed].sort().join(',');
        },
        unfollowedCount() {
            return state.unfollowed.length;
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
        toggleLike: video => toggleList('liked', video),
        toggleSave: video => toggleList('saved', video),
        liked: () => state.liked.slice(),
        saved: () => state.saved.slice(),
        removeFrom(listName, id) {
            if (!['liked', 'saved', 'history'].includes(listName)) return;
            state[listName] = state[listName].filter(item => item.id !== id);
            buildIndexes();
            persist({ immediate: true });
            emit(listName, { id, active: false });
        },

        // Koleksiyonun (beğenilenler / kaydedilenler) tüm videolarını kaldırır.
        clearList(listName) {
            if (!['liked', 'saved'].includes(listName) || !state[listName].length) return;
            state[listName] = [];
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
        readHomeCache(excludeKey) {
            const cached = readJson(HOME_CACHE_KEY);
            if (!cached || cached.excludeKey !== excludeKey || !cached.data) return null;
            if (Date.now() - Number(cached.at || 0) > HOME_CACHE_MAX_AGE_MS) return null;
            return cached.data;
        },
        writeHomeCache(excludeKey, data) {
            writeJson(HOME_CACHE_KEY, { at: Date.now(), excludeKey, data });
        },

        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        }
    };

    // Başka bir tarayıcı sekmesinde yapılan değişiklikler bu sekmeye de yansır.
    window.addEventListener('storage', event => {
        if (event.key !== STATE_KEY) return;
        const previousExclude = store.excludeKey();
        state = normalizeState(readJson(STATE_KEY));
        buildIndexes();
        emit('sync', { followChanged: previousExclude !== store.excludeKey() });
    });

    window.addEventListener('pagehide', () => store.flush());

    ns.store = store;
})();
