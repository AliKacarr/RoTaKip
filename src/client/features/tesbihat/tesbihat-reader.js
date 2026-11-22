(function () {
    const ns = window.RoTaKipTesbihat;
    const FONT_STORAGE_KEY = 'rotakip:tesbihat-font-scale';
    const VIBRATION_STORAGE_KEY = 'rotakip:tesbihat-vibration';
    // Neredeyse sıfır uzunluk: yuvarlak uç sayesinde çemberin tepesinde nokta gibi görünür.
    const RING_START_PERCENT = 0.01;
    const FONT_SCALES = Object.freeze([0.85, 1, 1.15, 1.3, 1.5]);
    const SHORT_RECITATION_LENGTH = 28;
    const BOLUM_LABELS = Object.freeze({
        ana: 'Namaz Sonrası Tesbihat',
        'ozel-dua': 'Kelime-i Tevhid ve Salavât',
        esma: 'Esmâ-i Hüsnâ Duası',
        'kapanis-suresi': 'Bitiriş Sûresi'
    });
    // Bitiriş bölümünde okunan sûre vakte göre değişir.
    const KAPANIS_LABELS_BY_VAKIT = Object.freeze({
        sabah: 'Haşir Suresinin Ahiri',
        ogle: 'Fetih Suresinin Ahiri',
        ikindi: 'Nebe\' Suresinin Ahiri',
        aksam: 'Haşir Suresinin Ahiri',
        yatsi: 'Âmenerresûlu'
    });

    function getBolumLabel(bolum, vakit) {
        if (bolum === 'kapanis-suresi' && KAPANIS_LABELS_BY_VAKIT[vakit]) return KAPANIS_LABELS_BY_VAKIT[vakit];
        return BOLUM_LABELS[bolum] || bolum;
    }
    const REPEAT_BEFORE_PATTERN = /(\d+)\s*defa\s*:?\s*$/i;
    const AYAH_SPLIT_PATTERN = /(﴿[٠-٩]+﴾|\(\d+\))\s*/g;
    const ARABIC_MARKS_PATTERN = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
    const BASMALA_TEXTS = new Set(['بسم الله الرحمن الرحيم', 'Bismillâhirrahmânirrahîm.']);
    const SURAH_TITLE_PATTERN = /^(?:سورة|Sûretü)/;

    const state = {
        elements: null,
        fontIndex: 1,
        vibrationEnabled: true,
        documents: new Map(),
        requestSequence: 0,
        loadedKey: null
    };

    function queryElements() {
        return {
            typesView: document.querySelector('.tesbihat-view[data-view="types"]'),
            typesTitle: document.getElementById('tesbihatTypesTitle'),
            readerView: document.querySelector('.tesbihat-view[data-view="reader"]'),
            readerTitle: document.getElementById('tesbihatReaderTitle'),
            readerSubtitle: document.getElementById('tesbihatReaderSubtitle'),
            content: document.getElementById('tesbihatReaderContent'),
            resetButton: document.getElementById('tesbihatResetCounters'),
            vibrationButton: document.getElementById('tesbihatVibrationToggle'),
            fontButtons: Array.from(document.querySelectorAll('.tesbihat-reader-actions [data-font-step]'))
        };
    }

    function applyFontScale() {
        const { readerView, fontButtons } = state.elements;
        readerView.style.setProperty('--tesbihat-font-scale', String(FONT_SCALES[state.fontIndex]));
        fontButtons.forEach(button => {
            const nextIndex = state.fontIndex + Number(button.dataset.fontStep);
            button.disabled = nextIndex < 0 || nextIndex >= FONT_SCALES.length;
        });
    }

    // Titreşim API'si yalnızca Android tarayıcılarında etkilidir (iOS Safari desteklemez);
    // masaüstü Chrome'da fonksiyon vardır ama donanım olmadığı için hiçbir şey yapmaz.
    function canVibrate() {
        return typeof navigator.vibrate === 'function' && window.matchMedia('(pointer: coarse)').matches;
    }

    function applyVibrationState() {
        const button = state.elements.vibrationButton;
        button.hidden = !canVibrate();
        button.setAttribute('aria-pressed', String(state.vibrationEnabled));
        button.classList.toggle('is-off', !state.vibrationEnabled);
        button.title = state.vibrationEnabled ? 'Titreşim açık' : 'Titreşim kapalı';
    }

    function vibrate(pattern) {
        if (state.vibrationEnabled && canVibrate()) navigator.vibrate(pattern);
    }

    function splitRecitation(text) {
        return String(text || '')
            .split('❁')
            .flatMap(part => part.replace(AYAH_SPLIT_PATTERN, '$1\n').split('\n'))
            .map(line => line.trim())
            .filter(Boolean);
    }

    function plainText(text) {
        return String(text || '').replace(ARABIC_MARKS_PATTERN, '').replace(/\s+/g, ' ').trim();
    }

    function decorateLine(line) {
        return window.escapeHtml(line)
            .replace(/﴿([٠-٩]+)﴾/g, '<span class="tesbihat-ayah-number">﴿$1﴾</span>')
            .replace(/﴿([^﴾٠-٩]+)﴾/g, '<span class="tesbihat-divine-name">$1</span>')
            .replace(/\((\d+)\)/g, '<span class="tesbihat-ayah-number">($1)</span>');
    }

    function createInstruction(text) {
        const element = document.createElement('p');
        const isFootnote = /^Ha[şs]iye/i.test(text);
        element.className = isFootnote ? 'tesbihat-instruction is-footnote' : 'tesbihat-instruction';
        element.innerHTML = `
            <span class="tesbihat-instruction-icon" aria-hidden="true"><i class="fa-solid ${isFootnote ? 'fa-asterisk' : 'fa-info'}"></i></span>
            <span>${window.escapeHtml(text)}</span>
        `;
        return element;
    }

    function createTextBlock(text, isArabic) {
        const lines = splitRecitation(text);
        const singleLine = lines.length === 1 ? plainText(lines[0]) : '';
        const block = document.createElement('div');
        block.className = 'tesbihat-recitation';
        block.classList.toggle('is-arabic', isArabic);
        block.classList.toggle('is-basmala', BASMALA_TEXTS.has(singleLine));
        block.classList.toggle('is-surah-title', SURAH_TITLE_PATTERN.test(singleLine));
        block.lang = isArabic ? 'ar' : 'tr';
        block.dir = isArabic ? 'rtl' : 'ltr';
        block.innerHTML = lines.map(line => `<p class="tesbihat-line">${decorateLine(line)}</p>`).join('');
        return block;
    }

    function createCounter(text, target, isArabic) {
        const wrapper = document.createElement('div');
        wrapper.className = 'tesbihat-counter';
        const plain = plainText(text);
        const isShort = plain.length <= SHORT_RECITATION_LENGTH && !plain.includes('❁');
        if (!isShort) wrapper.appendChild(createTextBlock(text, isArabic));

        const ring = document.createElement('button');
        ring.type = 'button';
        ring.className = 'tesbihat-ring';
        ring.dataset.count = '0';
        ring.dataset.target = String(target);
        ring.setAttribute('aria-label', `Tekrar sayacı: 0 / ${target}. Saymak için dokunun.`);
        ring.innerHTML = `
            <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
                <circle class="tesbihat-ring-track" cx="60" cy="60" r="52" />
                <circle class="tesbihat-ring-progress" cx="60" cy="60" r="52" pathLength="100" stroke-dasharray="${RING_START_PERCENT} 100" />
            </svg>
            <span class="tesbihat-ring-inner">
                <i class="fa-solid fa-fingerprint" aria-hidden="true"></i>
                <strong><span class="tesbihat-ring-count">0</span>/${target}</strong>
            </span>
        `;
        wrapper.appendChild(ring);

        if (isShort) {
            const label = document.createElement('p');
            label.className = 'tesbihat-ring-label';
            label.lang = isArabic ? 'ar' : 'tr';
            label.dir = isArabic ? 'rtl' : 'ltr';
            label.classList.toggle('is-arabic', isArabic);
            label.textContent = text;
            wrapper.appendChild(label);
        }
        return wrapper;
    }

    function buildCards(steps) {
        const cards = [];
        let card = null;
        let pendingRepeat = 0;
        steps.forEach(step => {
            if (step.tur === 'turkce') {
                if (!card || card.hasRecitation) {
                    card = { items: [], hasRecitation: false };
                    cards.push(card);
                }
                card.items.push({ type: 'instruction', text: step.metin });
                const match = String(step.metin).match(REPEAT_BEFORE_PATTERN);
                pendingRepeat = match ? Number(match[1]) : 0;
                return;
            }
            if (!card) {
                card = { items: [], hasRecitation: false };
                cards.push(card);
            }
            card.items.push({ type: 'recitation', text: step.metin, repeat: pendingRepeat });
            card.hasRecitation = true;
            pendingRepeat = 0;
        });
        return cards;
    }

    function groupByBolum(steps) {
        const groups = [];
        steps.forEach(step => {
            const last = groups[groups.length - 1];
            if (last && last.bolum === step.bolum) last.steps.push(step);
            else groups.push({ bolum: step.bolum, steps: [step] });
        });
        return groups;
    }

    function renderDocument(doc, vakit) {
        const isArabic = doc.tur === 'arapca-uzun';
        const fragment = document.createDocumentFragment();
        groupByBolum(Array.isArray(doc.adimlar) ? doc.adimlar : []).forEach((group, index) => {
            if (index > 0) {
                const divider = document.createElement('div');
                divider.className = 'tesbihat-part-divider';
                divider.dataset.bolum = group.bolum;
                divider.innerHTML = `<span>${window.escapeHtml(getBolumLabel(group.bolum, vakit))}</span>`;
                fragment.appendChild(divider);
            }
            buildCards(group.steps).forEach(card => {
                const article = document.createElement('article');
                article.className = 'tesbihat-step-card';
                card.items.forEach(item => {
                    if (item.type === 'instruction') article.appendChild(createInstruction(item.text));
                    else if (item.repeat > 1) article.appendChild(createCounter(item.text, item.repeat, isArabic));
                    else article.appendChild(createTextBlock(item.text, isArabic));
                });
                fragment.appendChild(article);
            });
        });
        state.elements.content.replaceChildren(fragment);
    }

    function renderLoading() {
        // Diğer sekmelerde olduğu gibi yer tutucu gösterilmez; içerik hazır olana kadar boş kalır.
        state.elements.content.setAttribute('aria-busy', 'true');
        state.elements.content.replaceChildren();
    }

    function renderError() {
        state.elements.content.innerHTML = `
            <div class="tesbihat-error">
                <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                <p>Tesbihat yüklenemedi. Lütfen bağlantınızı kontrol edip tekrar deneyin.</p>
                <button type="button" class="tesbihat-retry">
                    <i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Tekrar dene
                </button>
            </div>
        `;
    }

    function fetchDocument(vakit, tur) {
        // Toplu paket önceden indirilmişse (ya da önceki ziyaretten saklıysa) ağa gidilmez.
        const stored = ns.store.peek(vakit, tur);
        if (stored) return Promise.resolve(stored);
        const key = `${vakit}:${tur}`;
        if (!state.documents.has(key)) {
            const request = ns.fetchJson(`/api/tesbihat/${encodeURIComponent(vakit)}/${encodeURIComponent(tur)}`)
                .then(data => data.tesbihat)
                .catch(error => {
                    state.documents.delete(key);
                    throw error;
                });
            state.documents.set(key, request);
        }
        return state.documents.get(key);
    }

    async function loadDocument(vakit, tur) {
        const key = `${vakit}:${tur}`;
        if (state.loadedKey === key) return;
        const sequence = ++state.requestSequence;
        renderLoading();
        try {
            const doc = await fetchDocument(vakit, tur);
            if (sequence !== state.requestSequence) return;
            renderDocument(doc, vakit);
            state.loadedKey = key;
        } catch (error) {
            if (sequence !== state.requestSequence) return;
            console.warn('Tesbihat yüklenemedi:', error);
            state.loadedKey = null;
            renderError();
        } finally {
            if (sequence === state.requestSequence) state.elements.content.setAttribute('aria-busy', 'false');
        }
    }

    function updateRing(ring, count) {
        const target = Number(ring.dataset.target);
        const isComplete = count >= target;
        ring.dataset.count = String(count);
        ring.querySelector('.tesbihat-ring-count').textContent = String(count);
        ring.querySelector('.tesbihat-ring-progress')
            .setAttribute('stroke-dasharray', `${RING_START_PERCENT + Math.min(count / target, 1) * (100 - RING_START_PERCENT)} 100`);
        ring.querySelector('.tesbihat-ring-inner i').className = `fa-solid ${isComplete ? 'fa-check' : 'fa-fingerprint'}`;
        ring.classList.toggle('is-complete', isComplete);
        ring.closest('.tesbihat-step-card')?.classList.toggle('is-complete', isComplete);
        ring.setAttribute('aria-label', `Tekrar sayacı: ${count} / ${target}.${isComplete ? ' Tamamlandı.' : ' Saymak için dokunun.'}`);
    }

    function handleRingTap(ring) {
        const target = Number(ring.dataset.target);
        const current = Number(ring.dataset.count);
        if (current >= target) return;
        const count = current + 1;
        updateRing(ring, count);
        ring.classList.remove('is-pulsing');
        void ring.offsetWidth;
        ring.classList.add('is-pulsing');
        if (count === target) {
            vibrate([40, 60, 40]);
        } else {
            vibrate(12);
        }
    }

    function bindEvents() {
        const { typesView, content, resetButton, vibrationButton, fontButtons } = state.elements;
        typesView.addEventListener('click', event => {
            const option = event.target.closest('.tesbihat-type-option');
            if (option) ns.navigate({ view: 'reader', vakit: typesView.dataset.vakit, tur: option.dataset.tur });
        });
        content.addEventListener('click', event => {
            const ring = event.target.closest('.tesbihat-ring');
            if (ring) {
                handleRingTap(ring);
                return;
            }
            if (event.target.closest('.tesbihat-retry')) {
                const { vakit, tur } = state.elements.readerView.dataset;
                loadDocument(vakit, tur);
            }
        });
        resetButton.addEventListener('click', async () => {
            const rings = Array.from(content.querySelectorAll('.tesbihat-ring'));
            if (!rings.some(ring => Number(ring.dataset.count) > 0)) {
                ns.toast('Sıfırlanacak bir sayaç yok');
                return;
            }
            const confirmed = await ns.confirmDialog({
                title: 'Sayaçları Sıfırla',
                message: 'Tüm sayaçları sıfırlamak istediğinize emin misiniz?',
                confirmLabel: 'Sıfırla'
            });
            if (!confirmed) return;
            rings.forEach(ring => updateRing(ring, 0));
        });
        vibrationButton.addEventListener('click', () => {
            state.vibrationEnabled = !state.vibrationEnabled;
            ns.writeStorage(VIBRATION_STORAGE_KEY, state.vibrationEnabled ? 'on' : 'off');
            applyVibrationState();
            vibrate(20);
        });
        fontButtons.forEach(button => {
            button.addEventListener('click', () => {
                const nextIndex = state.fontIndex + Number(button.dataset.fontStep);
                if (nextIndex < 0 || nextIndex >= FONT_SCALES.length) return;
                state.fontIndex = nextIndex;
                ns.writeStorage(FONT_STORAGE_KEY, FONT_SCALES[nextIndex]);
                applyFontScale();
            });
        });
    }

    ns.reader = {
        init() {
            state.elements = queryElements();
            const storedScale = FONT_SCALES.indexOf(Number.parseFloat(ns.readStorage(FONT_STORAGE_KEY)));
            state.fontIndex = storedScale >= 0 ? storedScale : 1;
            state.vibrationEnabled = ns.readStorage(VIBRATION_STORAGE_KEY) !== 'off';
            applyFontScale();
            applyVibrationState();
            bindEvents();
        },
        showTypes(vakit) {
            const meta = ns.findVakit(vakit);
            state.elements.typesView.dataset.vakit = vakit;
            state.elements.typesTitle.textContent = `${meta.label} Namazı Tesbihatı`;
        },
        showReader(vakit, tur) {
            const meta = ns.findVakit(vakit);
            const { readerView, readerTitle, readerSubtitle } = state.elements;
            readerView.dataset.vakit = vakit;
            readerView.dataset.tur = tur;
            readerTitle.textContent = `${meta.label} Namazı`;
            readerSubtitle.textContent = ns.TUR_LABELS[tur];
            return loadDocument(vakit, tur);
        }
    };
})();
