(function () {
    const ns = window.RoTaKipTefekkur;
    const STATE_STORAGE_KEY = 'rotakip:tefekkur-zikirmatik';
    const VIBRATION_STORAGE_KEY = 'rotakip:tefekkur-vibration';
    const TARGETS = Object.freeze([33, 99, 100, 500, 1000, 0]);

    // Henüz sunucuda zikir verisi yok; sık okunan zikirler hazır seçenek olarak sunulur.
    const PRESETS = Object.freeze([
        { key: 'serbest', label: 'Serbest', arabic: '', target: 33 },
        { key: 'subhanallah', label: 'Sübhânallah', arabic: 'سُبْحَانَ اللّٰهِ', target: 33 },
        { key: 'elhamdulillah', label: 'Elhamdülillah', arabic: 'اَلْحَمْدُ لِلّٰهِ', target: 33 },
        { key: 'allahuekber', label: 'Allâhü Ekber', arabic: 'اَللّٰهُ اَكْبَرُ', target: 33 },
        { key: 'tevhid', label: 'Lâ ilâhe illallah', arabic: 'لَا اِلٰهَ اِلَّا اللّٰهُ', target: 100 },
        { key: 'istigfar', label: 'Estağfirullah', arabic: 'اَسْتَغْفِرُ اللّٰهَ', target: 100 },
        { key: 'salavat', label: 'Salavât-ı Şerîfe', arabic: 'اَللّٰهُمَّ صَلِّ عَلٰى سَيِّدِنَا مُحَمَّدٍ', target: 100 }
    ]);

    const state = {
        elements: null,
        vibrationEnabled: true,
        preset: 'serbest',
        target: 33,
        count: 0,
        laps: 0,
        total: 0,
        // Her zikrin hedef, sayaç, tur ve toplamı ayrı tutulur: { [presetKey]: { target, count, laps, total } }
        counters: {}
    };

    function queryElements() {
        const view = document.querySelector('.tefekkur-view[data-view="zikirmatik"]');
        return {
            view,
            subtitle: document.getElementById('tefekkurZikirSubtitle'),
            presets: view.querySelector('.tefekkur-zikir-presets'),
            arabic: document.getElementById('tefekkurZikirArabic'),
            card: view.querySelector('.tefekkur-zikir-card'),
            tap: document.getElementById('tefekkurZikirTap'),
            progress: view.querySelector('.tefekkur-zikir-ring-progress'),
            count: document.getElementById('tefekkurZikirCount'),
            target: document.getElementById('tefekkurZikirTarget'),
            laps: document.getElementById('tefekkurZikirLaps'),
            total: document.getElementById('tefekkurZikirTotal'),
            targets: Array.from(view.querySelectorAll('.tefekkur-zikir-targets [data-target]')),
            reset: document.getElementById('tefekkurZikirReset'),
            clear: document.getElementById('tefekkurZikirClear'),
            vibration: document.getElementById('tefekkurZikirVibration')
        };
    }

    function findPreset(key) {
        return PRESETS.find(preset => preset.key === key) || PRESETS[0];
    }

    function toCount(value) {
        const number = Number(value);
        return Number.isInteger(number) && number >= 0 ? number : 0;
    }

    function normalizeCounter(raw, preset) {
        if (!raw || typeof raw !== 'object') return null;
        const target = TARGETS.includes(raw.target) ? raw.target : preset.target;
        let count = toCount(raw.count);
        if (target > 0 && count >= target) count = 0;
        return { target, count, laps: toCount(raw.laps), total: toCount(raw.total) };
    }

    // Seçili zikrin kayıtlı değerlerini ekrandaki sayaca yükler; kayıt yoksa zikrin varsayılanıyla başlar.
    function applyCounter(key) {
        const preset = findPreset(key);
        const counter = state.counters[preset.key] || { target: preset.target, count: 0, laps: 0, total: 0 };
        state.target = counter.target;
        state.count = counter.count;
        state.laps = counter.laps;
        state.total = counter.total;
    }

    function captureCounter() {
        state.counters[state.preset] = { target: state.target, count: state.count, laps: state.laps, total: state.total };
    }

    function loadState() {
        try {
            const stored = JSON.parse(ns.readStorage(STATE_STORAGE_KEY) || 'null');
            if (!stored || typeof stored !== 'object') return;
            state.preset = findPreset(stored.preset).key;
            if (stored.counters && typeof stored.counters === 'object') {
                PRESETS.forEach(preset => {
                    const counter = normalizeCounter(stored.counters[preset.key], preset);
                    if (counter) state.counters[preset.key] = counter;
                });
            } else {
                // Eski kayıt biçimi: tek sayaç vardı, seçili zikre aktarılır.
                const counter = normalizeCounter(stored, findPreset(state.preset));
                if (counter) state.counters[state.preset] = counter;
            }
            applyCounter(state.preset);
        } catch (_error) {
            // Bozuk kayıt yok sayılır; sayaç sıfırdan başlar.
        }
    }

    function saveState() {
        captureCounter();
        ns.writeStorage(STATE_STORAGE_KEY, JSON.stringify({ preset: state.preset, counters: state.counters }));
    }

    function vibrate(pattern) {
        if (state.vibrationEnabled && ns.canVibrate()) navigator.vibrate(pattern);
    }

    function renderPresets() {
        const { presets } = state.elements;
        presets.replaceChildren(...PRESETS.map(preset => {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.preset = preset.key;
            button.textContent = preset.label;
            return button;
        }));
    }

    function render() {
        const elements = state.elements;
        const preset = findPreset(state.preset);
        elements.subtitle.textContent = preset.key === 'serbest' ? 'Serbest zikir' : preset.label;
        elements.arabic.textContent = preset.arabic;
        elements.arabic.hidden = !preset.arabic;
        elements.presets.querySelectorAll('[data-preset]').forEach(button => {
            const active = button.dataset.preset === state.preset;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        elements.targets.forEach(button => {
            const active = Number(button.dataset.target) === state.target;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
        });

        const hasTarget = state.target > 0;
        const ratio = hasTarget ? state.count / state.target : (state.count % 100) / 100;
        elements.progress.setAttribute('stroke-dasharray', `${Math.max(ratio * 100, state.count > 0 ? 0.5 : 0)} 100`);
        elements.count.textContent = String(state.count);
        elements.target.textContent = hasTarget ? `/ ${state.target}` : '';
        elements.laps.textContent = String(state.laps);
        elements.total.textContent = String(state.total);
        elements.tap.setAttribute('aria-label', hasTarget
            ? `Sayaç: ${state.count} / ${state.target}, ${state.laps} tur. Saymak için dokunun.`
            : `Sayaç: ${state.count}. Saymak için dokunun.`);

        elements.vibration.hidden = !ns.canVibrate();
        elements.vibration.setAttribute('aria-pressed', String(state.vibrationEnabled));
        elements.vibration.classList.toggle('is-off', !state.vibrationEnabled);
        elements.vibration.title = state.vibrationEnabled ? 'Titreşim açık' : 'Titreşim kapalı';
    }

    function pulse(className) {
        const { tap } = state.elements;
        tap.classList.remove('is-pulsing', 'is-lap');
        void tap.offsetWidth;
        tap.classList.add(className);
    }

    function increment() {
        state.count += 1;
        state.total += 1;
        if (state.target > 0 && state.count >= state.target) {
            state.count = 0;
            state.laps += 1;
            vibrate([60, 80, 60]);
            pulse('is-lap');
            ns.toast(`${state.laps}. tur tamamlandı`);
        } else {
            vibrate(12);
            pulse('is-pulsing');
        }
        saveState();
        render();
    }

    // Yalnızca seçili zikrin o anki turdaki sayacını sıfırlar; tur ve toplam korunur.
    function reset() {
        if (state.count === 0) {
            ns.toast('Sayaç zaten sıfır');
            return;
        }
        state.count = 0;
        vibrate(8);
        saveState();
        render();
    }

    // Yalnızca seçili zikrin sayaç, tur ve toplamını siler; diğer zikirlerin kaydına dokunmaz.
    async function clearAll() {
        if (state.count === 0 && state.laps === 0 && state.total === 0) {
            ns.toast('Silinecek bir kayıt yok');
            return;
        }
        const confirmed = await ns.confirmDialog({
            title: 'Tümünü Sil',
            message: `"${findPreset(state.preset).label}" için sayaç, tur ve toplam silinecek. Diğer zikirler etkilenmez. Emin misiniz?`,
            confirmLabel: 'Sil'
        });
        if (!confirmed) return;
        state.count = 0;
        state.laps = 0;
        state.total = 0;
        saveState();
        render();
    }

    function selectPreset(key) {
        const preset = findPreset(key);
        if (preset.key === state.preset) return;
        captureCounter();
        state.preset = preset.key;
        applyCounter(preset.key);
        saveState();
        render();
    }

    function selectTarget(target) {
        if (!TARGETS.includes(target) || target === state.target) return;
        state.target = target;
        if (target > 0 && state.count >= target) {
            state.laps += Math.floor(state.count / target);
            state.count %= target;
        }
        saveState();
        render();
    }

    function bindEvents() {
        const { card, presets, targets, reset: resetButton, clear: clearButton, vibration } = state.elements;
        // Kartın her yeri sayar; halka düğmesinin tıklaması (klavye dahil) karta kabarcıklanır, tek sayılır.
        card.addEventListener('click', increment);
        presets.addEventListener('click', event => {
            const button = event.target.closest('[data-preset]');
            if (button) selectPreset(button.dataset.preset);
        });
        targets.forEach(button => {
            button.addEventListener('click', () => selectTarget(Number(button.dataset.target)));
        });
        resetButton.addEventListener('click', reset);
        clearButton.addEventListener('click', clearAll);
        vibration.addEventListener('click', () => {
            state.vibrationEnabled = !state.vibrationEnabled;
            ns.writeStorage(VIBRATION_STORAGE_KEY, state.vibrationEnabled ? 'on' : 'off');
            render();
            vibrate(20);
        });
    }

    ns.zikirmatik = {
        init() {
            state.elements = queryElements();
            state.vibrationEnabled = ns.readStorage(VIBRATION_STORAGE_KEY) !== 'off';
            loadState();
            renderPresets();
            bindEvents();
            render();
        },
        show() {
            render();
        }
    };
})();
