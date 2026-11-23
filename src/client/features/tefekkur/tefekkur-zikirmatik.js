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
        total: 0
    };

    function queryElements() {
        const view = document.querySelector('.tefekkur-view[data-view="zikirmatik"]');
        return {
            view,
            subtitle: document.getElementById('tefekkurZikirSubtitle'),
            presets: view.querySelector('.tefekkur-zikir-presets'),
            arabic: document.getElementById('tefekkurZikirArabic'),
            tap: document.getElementById('tefekkurZikirTap'),
            progress: view.querySelector('.tefekkur-zikir-ring-progress'),
            count: document.getElementById('tefekkurZikirCount'),
            target: document.getElementById('tefekkurZikirTarget'),
            laps: document.getElementById('tefekkurZikirLaps'),
            total: document.getElementById('tefekkurZikirTotal'),
            targets: Array.from(view.querySelectorAll('.tefekkur-zikir-targets [data-target]')),
            undo: document.getElementById('tefekkurZikirUndo'),
            reset: document.getElementById('tefekkurZikirReset'),
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

    function loadState() {
        try {
            const stored = JSON.parse(ns.readStorage(STATE_STORAGE_KEY) || 'null');
            if (!stored || typeof stored !== 'object') return;
            state.preset = findPreset(stored.preset).key;
            state.target = TARGETS.includes(stored.target) ? stored.target : findPreset(state.preset).target;
            state.count = toCount(stored.count);
            state.laps = toCount(stored.laps);
            state.total = toCount(stored.total);
            if (state.target > 0 && state.count >= state.target) state.count = 0;
        } catch (_error) {
            // Bozuk kayıt yok sayılır; sayaç sıfırdan başlar.
        }
    }

    function saveState() {
        ns.writeStorage(STATE_STORAGE_KEY, JSON.stringify({
            preset: state.preset,
            target: state.target,
            count: state.count,
            laps: state.laps,
            total: state.total
        }));
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
        elements.undo.disabled = state.total === 0;
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

    function undo() {
        if (state.total === 0) return;
        if (state.count > 0) {
            state.count -= 1;
        } else if (state.laps > 0) {
            state.laps -= 1;
            state.count = Math.max(state.target - 1, 0);
        }
        state.total -= 1;
        vibrate(8);
        saveState();
        render();
    }

    async function reset() {
        if (state.total === 0) {
            ns.toast('Sıfırlanacak bir sayaç yok');
            return;
        }
        const confirmed = await ns.confirmDialog({
            title: 'Sayacı Sıfırla',
            message: 'Sayaç, tur ve toplam sıfırlanacak. Emin misiniz?',
            confirmLabel: 'Sıfırla'
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
        state.preset = preset.key;
        state.target = preset.target;
        state.count = 0;
        state.laps = 0;
        state.total = 0;
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
        const { tap, presets, targets, undo: undoButton, reset: resetButton, vibration } = state.elements;
        tap.addEventListener('click', increment);
        presets.addEventListener('click', event => {
            const button = event.target.closest('[data-preset]');
            if (button) selectPreset(button.dataset.preset);
        });
        targets.forEach(button => {
            button.addEventListener('click', () => selectTarget(Number(button.dataset.target)));
        });
        undoButton.addEventListener('click', undo);
        resetButton.addEventListener('click', reset);
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
