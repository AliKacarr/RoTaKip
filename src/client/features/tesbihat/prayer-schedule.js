(function () {
    const ns = window.RoTaKipTesbihat;
    const LOCATION_STORAGE_KEY = 'rotakip:prayer-location';
    const DEFAULT_LOCATION_ID = 9541; // İstanbul merkez
    const DAY_SECONDS = 24 * 3600;
    const NEW_DAY_RETRY_MS = 30000;
    const PERIODS = Object.freeze([
        { key: 'imsak', label: 'İmsak', tesbihat: 'sabah' },
        { key: 'gunes', label: 'Güneş', tesbihat: null },
        { key: 'ogle', label: 'Öğle', tesbihat: 'ogle' },
        { key: 'ikindi', label: 'İkindi', tesbihat: 'ikindi' },
        { key: 'aksam', label: 'Akşam', tesbihat: 'aksam' },
        { key: 'yatsi', label: 'Yatsı', tesbihat: 'yatsi' }
    ]);

    const state = {
        location: null,
        payload: null,
        schedule: null,
        locationsPromise: null,
        loadSequence: 0,
        reloadingForNewDay: false,
        lastNewDayAttempt: 0,
        timer: null,
        listeners: new Set()
    };

    function storedLocationId() {
        const stored = Number.parseInt(ns.readStorage(LOCATION_STORAGE_KEY), 10);
        return Number.isInteger(stored) && stored > 0 ? stored : DEFAULT_LOCATION_ID;
    }

    function emit(reason, detail = {}) {
        state.listeners.forEach(listener => listener(reason, detail));
    }

    function computeSchedule(now) {
        const times = state.payload?.times || [];
        const todayIndex = times.findIndex(row => row.tarih === now.dateKey);
        if (todayIndex < 0) return null;

        const todayRow = times[todayIndex];
        const tomorrowRow = times[todayIndex + 1] || null;
        const periodSeconds = PERIODS.map(period => ns.timeToSeconds(todayRow[period.key]));
        if (periodSeconds.some(value => value === null)) return null;

        let currentIndex = -1;
        periodSeconds.forEach((value, index) => {
            if (now.seconds >= value) currentIndex = index;
        });

        let next = null;
        if (currentIndex + 1 < PERIODS.length) {
            next = {
                period: PERIODS[currentIndex + 1],
                remaining: periodSeconds[currentIndex + 1] - now.seconds
            };
        } else if (tomorrowRow && ns.timeToSeconds(tomorrowRow.imsak) !== null) {
            next = {
                period: PERIODS[0],
                remaining: DAY_SECONDS - now.seconds + ns.timeToSeconds(tomorrowRow.imsak)
            };
        }

        // İmsaktan önceki saatler bir önceki günün yatsı vaktine aittir.
        const current = currentIndex >= 0 ? PERIODS[currentIndex] : PERIODS[PERIODS.length - 1];
        return { todayRow, currentIndex, current, next };
    }

    async function loadTimes(locationId, options = {}) {
        const sequence = ++state.loadSequence;
        try {
            const payload = await ns.fetchJson(
                `/api/prayer-times?locationId=${encodeURIComponent(locationId)}&days=2`
            );
            if (sequence !== state.loadSequence) return false;
            state.payload = payload;
            state.location = payload.location;
        } catch (error) {
            if (sequence !== state.loadSequence) return false;
            console.warn('Namaz vakitleri yüklenemedi:', error);
            if (options.keepPrevious && state.payload) return false;
            state.payload = null;
        }
        state.schedule = computeSchedule(ns.istanbulNow());
        emit('times');
        return Boolean(state.payload);
    }

    function tick() {
        const now = ns.istanbulNow();
        if (state.payload && now.dateKey !== state.payload.today) {
            // Yeni güne girildi: vakitler yenilenir. Bağlantı yoksa eski veri korunur
            // ve her saniye değil, en fazla NEW_DAY_RETRY_MS'de bir yeniden denenir.
            if (!state.reloadingForNewDay && state.location && Date.now() - state.lastNewDayAttempt >= NEW_DAY_RETRY_MS) {
                state.reloadingForNewDay = true;
                state.lastNewDayAttempt = Date.now();
                loadTimes(state.location.locationId, { keepPrevious: true }).finally(() => {
                    state.reloadingForNewDay = false;
                });
            }
            return;
        }
        const previousIndex = state.schedule?.currentIndex;
        state.schedule = computeSchedule(now);
        emit('tick', { periodChanged: state.schedule?.currentIndex !== previousIndex });
    }

    ns.schedule = {
        async init() {
            const locationId = storedLocationId();
            const loaded = await loadTimes(locationId);
            if (!loaded && locationId !== DEFAULT_LOCATION_ID) await loadTimes(DEFAULT_LOCATION_ID);
        },
        snapshot() {
            return {
                location: state.location,
                hasPayload: Boolean(state.payload),
                schedule: state.schedule
            };
        },
        locations() {
            if (!state.locationsPromise) {
                state.locationsPromise = ns.fetchJson('/api/prayer-locations')
                    .then(data => (Array.isArray(data.locations) ? data.locations : []))
                    .catch(error => {
                        state.locationsPromise = null;
                        throw error;
                    });
            }
            return state.locationsPromise;
        },
        async setLocation(locationId) {
            const loaded = await loadTimes(locationId, { keepPrevious: true });
            if (loaded) ns.writeStorage(LOCATION_STORAGE_KEY, locationId);
            return loaded;
        },
        subscribe(listener) {
            state.listeners.add(listener);
        },
        start() {
            tick();
            if (!state.timer) state.timer = window.setInterval(tick, 1000);
        },
        stop() {
            if (!state.timer) return;
            window.clearInterval(state.timer);
            state.timer = null;
        }
    };
})();
