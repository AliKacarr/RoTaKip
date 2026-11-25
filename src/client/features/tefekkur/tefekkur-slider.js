(function () {
    const ns = window.RoTaKipTefekkur;
    const POSITION_STORAGE_PREFIX = 'rotakip:tefekkur-position:';
    // Parmak hareketi en az bu kadar yatay ilerlerse kaydırma olarak algılanır.
    const DRAG_START_DISTANCE = 10;
    const SWIPE_MIN_DISTANCE = 60;
    const SWIPE_MIN_VELOCITY = 0.45;
    const LONG_TEXT_LENGTH = 280;
    const VERY_LONG_TEXT_LENGTH = 700;

    const state = {
        elements: null,
        sources: new Map(),
        sourceKey: null,
        label: '',
        emptyMessage: '',
        chip: null,
        items: [],
        index: 0,
        status: 'idle',
        sequence: 0,
        animating: false,
        drag: null,
        neighbor: null
    };

    function queryElements() {
        return {
            view: document.querySelector('.tefekkur-view[data-view="slider"]'),
            title: document.getElementById('tefekkurSliderTitle'),
            modes: document.getElementById('tefekkurSliderModes'),
            chip: document.getElementById('tefekkurSliderChip'),
            stage: document.getElementById('tefekkurSliderStage'),
            slide: document.getElementById('tefekkurSlide'),
            prev: document.getElementById('tefekkurSliderPrev'),
            next: document.getElementById('tefekkurSliderNext'),
            counter: document.getElementById('tefekkurSliderCounter'),
            copy: document.getElementById('tefekkurSliderCopy'),
            share: document.getElementById('tefekkurSliderShare')
        };
    }

    function sourceKeyOf(source) {
        return source.type === 'esma' ? 'esma' : `${source.type}:${source.category}`;
    }

    const VIDEO_HOSTS = new Set(['youtu.be', 'youtube.com', 'www.youtube.com', 'm.youtube.com']);

    // Yalnızca https YouTube bağlantıları kabul edilir; başka bir şey bağlantı olarak çizilmez.
    function safeVideoUrl(value) {
        try {
            const url = new URL(String(value || ''));
            return url.protocol === 'https:' && VIDEO_HOSTS.has(url.hostname) ? url.href : '';
        } catch (_error) {
            return '';
        }
    }

    async function requestItems(source) {
        if (source.type === 'esma') {
            const response = await fetch('/esmaulhusna.json');
            if (!response.ok) throw new Error('Esmaül Hüsna listesi alınamadı.');
            const list = await response.json();
            return (Array.isArray(list) ? list : []).map(entry => ({
                key: `esma:${entry.id}`,
                arabic: entry.esmaulhusna_arabic || '',
                title: ns.toTitleCaseTr(entry.esmaulhusna_name),
                text: entry.esmaulhusna_description || '',
                videoUrl: safeVideoUrl(entry.esmaulhusna_video_url)
            }));
        }
        if (source.type === 'image') {
            const data = await ns.fetchJson(`/api/tefekkur/images/${encodeURIComponent(source.category)}`);
            return data.items.map(entry => ({ key: `image:${source.category}:${entry.name}`, image: entry.url, name: entry.name }));
        }
        const data = await ns.fetchJson(`/api/tefekkur/texts/${encodeURIComponent(source.category)}`);
        return data.items.map(entry => ({
            key: `text:${source.category}:${entry.id}`,
            text: entry.text,
            caption: entry.source || ''
        }));
    }

    function loadItems(source) {
        const key = sourceKeyOf(source);
        if (!state.sources.has(key)) {
            const request = requestItems(source).catch(error => {
                state.sources.delete(key);
                throw error;
            });
            state.sources.set(key, request);
        }
        return state.sources.get(key);
    }

    function readStoredPosition(key, total) {
        const stored = Number.parseInt(ns.readStorage(POSITION_STORAGE_PREFIX + key), 10);
        return Number.isInteger(stored) && stored >= 0 && stored < total ? stored : 0;
    }

    function currentItem() {
        return state.items[state.index] || null;
    }

    function createElement(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    function renderMessage(icon, message, withRetry) {
        const { slide } = state.elements;
        slide.className = 'tefekkur-slide is-message';
        slide.replaceChildren();
        const iconElement = createElement('span', 'tefekkur-slide-message-icon');
        iconElement.innerHTML = `<i class="${icon}" aria-hidden="true"></i>`;
        slide.append(iconElement, createElement('p', 'tefekkur-slide-message', message));
        if (withRetry) {
            const retry = createElement('button', 'tefekkur-slide-retry');
            retry.type = 'button';
            retry.innerHTML = '<i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Tekrar dene';
            slide.appendChild(retry);
        }
    }

    function renderSlide() {
        const { slide } = state.elements;
        const item = currentItem();
        removeNeighbor();
        slide.style.transform = '';
        if (state.status === 'loading') {
            slide.className = 'tefekkur-slide is-loading';
            slide.replaceChildren();
            return;
        }
        if (state.status === 'error') {
            renderMessage('fa-solid fa-triangle-exclamation', 'İçerik yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.', true);
            return;
        }
        if (!item) {
            renderMessage('fa-regular fa-folder-open', state.emptyMessage || 'Bu bölüme henüz içerik eklenmedi.', false);
            return;
        }
        fillSlide(slide, item, state.index);
    }

    // Kartın içeriğini çizer; geçerli kart ve kaydırma sırasında yanında görünen komşu kart aynı kodu kullanır.
    function fillSlide(slide, item, index) {
        slide.replaceChildren();
        if (item.image) {
            slide.className = 'tefekkur-slide is-image';
            const figure = createElement('figure', 'tefekkur-slide-figure');
            const image = document.createElement('img');
            image.src = item.image;
            image.alt = `${state.label} görseli ${index + 1}`;
            image.decoding = 'async';
            image.draggable = false;
            figure.appendChild(image);
            slide.appendChild(figure);
            return;
        }

        const length = String(item.text || '').length;
        slide.className = 'tefekkur-slide is-text';
        slide.classList.toggle('is-long', length > LONG_TEXT_LENGTH);
        slide.classList.toggle('is-very-long', length > VERY_LONG_TEXT_LENGTH);
        slide.appendChild(createElement('span', 'tefekkur-slide-rule is-top'));
        if (item.arabic) {
            const arabic = createElement('p', 'tefekkur-slide-arabic', item.arabic);
            arabic.lang = 'ar';
            arabic.dir = 'rtl';
            slide.appendChild(arabic);
        }
        if (item.title) slide.appendChild(createElement('h5', 'tefekkur-slide-title', item.title));
        if (item.text) slide.appendChild(createElement('p', 'tefekkur-slide-text', item.text));
        if (item.caption) slide.appendChild(createElement('p', 'tefekkur-slide-caption', `— ${item.caption}`));
        if (item.videoUrl) {
            const video = createElement('a', 'tefekkur-slide-video');
            video.href = item.videoUrl;
            video.target = '_blank';
            video.rel = 'noopener noreferrer';
            video.innerHTML = '<i class="fa-brands fa-youtube" aria-hidden="true"></i><span>Tefekkür videosu</span>';
            video.setAttribute('aria-label', `${item.title || 'Esmaül Hüsna'} tefekkür videosunu YouTube'da izle`);
            slide.appendChild(video);
        }
        slide.appendChild(createElement('span', 'tefekkur-slide-rule is-bottom'));
    }

    // Sayaç, geçiş bitmeden hedef karta göre güncellenebilsin diye dizini dışarıdan alır.
    function renderCounter(index) {
        const { counter } = state.elements;
        const total = state.items.length;
        const text = `${index + 1} / ${total}`;
        if (counter.textContent !== text) counter.textContent = text;
        counter.setAttribute('aria-label', `${total} içerikten ${index + 1}.`);
    }

    function renderControls() {
        const { prev, next, counter, copy, share, chip } = state.elements;
        const total = state.items.length;
        const ready = state.status === 'ready' && total > 0;
        prev.disabled = !ready || state.index <= 0;
        next.disabled = !ready || state.index >= total - 1;
        copy.disabled = !ready;
        share.disabled = !ready;
        chip.disabled = !ready || total < 2;
        // Yüklenirken, hata ve boş durumlarında sayaç boş kalır; mesaj zaten kartta gösterilir.
        if (ready) renderCounter(state.index);
        else {
            counter.textContent = '';
            counter.removeAttribute('aria-label');
        }
        if (state.chip === 'index') {
            chip.querySelector('span').textContent = total > 0 ? `${total} İsim` : '99 İsim';
        }
    }

    function preloadNeighbours() {
        [state.index - 1, state.index + 1].forEach(index => {
            const item = state.items[index];
            if (item?.image) {
                const image = new Image();
                image.decoding = 'async';
                image.src = item.image;
            }
        });
        const item = currentItem();
        if (!item) return;
        const prepare = () => ns.share.prepareFile(item, state.label).catch(() => {});
        if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(prepare, { timeout: 1500 });
        else window.setTimeout(prepare, 300);
    }

    function render() {
        renderSlide();
        renderControls();
        state.elements.stage.setAttribute('aria-busy', String(state.status === 'loading'));
        if (state.status === 'ready') {
            ns.writeStorage(POSITION_STORAGE_PREFIX + state.sourceKey, state.index);
            preloadNeighbours();
        }
    }

    const SLIDE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

    function stageWidth() {
        return state.elements.stage.clientWidth || window.innerWidth;
    }

    function canAnimate() {
        return !ns.prefersReducedMotion() && typeof state.elements.slide.animate === 'function';
    }

    function slideKeyframes(from, to) {
        return [{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }];
    }

    function removeNeighbor() {
        if (!state.neighbor) return;
        state.neighbor.el.remove();
        state.neighbor = null;
    }

    // Kaydırma sırasında gelecek kartı geçerli kartın yanında hazır tutar; böylece kart
    // parmakla birlikte kayar ve geçişte boş an kalmaz. direction: +1 sağdan, -1 soldan gelir.
    function ensureNeighbor(index, direction) {
        if (state.neighbor?.index === index) {
            state.neighbor.direction = direction;
            return state.neighbor;
        }
        removeNeighbor();
        const item = state.items[index];
        if (!item) return null;
        const el = createElement('div', 'tefekkur-slide-neighbor');
        el.setAttribute('aria-hidden', 'true');
        const slide = createElement('article', 'tefekkur-slide');
        fillSlide(slide, item, index);
        el.appendChild(slide);
        state.elements.stage.appendChild(el);
        state.neighbor = { el, index, direction };
        return state.neighbor;
    }

    function placeSlides(offset) {
        state.elements.slide.style.transform = `translateX(${offset}px)`;
        if (state.neighbor) {
            state.neighbor.el.style.transform = `translateX(${offset + state.neighbor.direction * stageWidth()}px)`;
        }
        // Yeni kartın görünen kısmı yarıyı geçince sayaç ona geçer; yarıdan geri dönülürse eski değere döner.
        const passedHalf = state.neighbor && Math.abs(offset) > stageWidth() / 2;
        renderCounter(passedHalf ? state.neighbor.index : state.index);
    }

    // direction: +1 sonraki (içerik sola kayar), -1 önceki (içerik sağa kayar)
    async function goTo(nextIndex, { fromOffset = 0 } = {}) {
        const total = state.items.length;
        if (state.animating || state.status !== 'ready' || nextIndex === state.index || nextIndex < 0 || nextIndex >= total) {
            if (fromOffset) snapBack(fromOffset);
            return;
        }
        const direction = nextIndex > state.index ? 1 : -1;
        state.animating = true;
        try {
            const { slide } = state.elements;
            const neighbor = canAnimate() ? ensureNeighbor(nextIndex, direction) : null;
            if (neighbor) {
                const width = stageWidth();
                placeSlides(fromOffset);
                renderCounter(nextIndex);
                // Kalan mesafe kısaldıkça süre de kısalır; kart parmağın bıraktığı yerden devam eder.
                const duration = Math.round(270 + 150 * Math.max(0, 1 - Math.abs(fromOffset) / width));
                const animations = [
                    slide.animate(slideKeyframes(fromOffset, -direction * width), { duration, easing: SLIDE_EASING, fill: 'forwards' }),
                    neighbor.el.animate(slideKeyframes(direction * width + fromOffset, 0), { duration, easing: SLIDE_EASING, fill: 'forwards' })
                ];
                await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
                state.index = nextIndex;
                render();
                animations.forEach(animation => animation.cancel());
            } else {
                state.index = nextIndex;
                render();
            }
        } finally {
            state.animating = false;
        }
    }

    async function snapBack(fromOffset) {
        const { slide } = state.elements;
        const neighbor = state.neighbor;
        state.animating = true;
        renderCounter(state.index);
        try {
            if (canAnimate() && fromOffset) {
                const animations = [slide.animate(slideKeyframes(fromOffset, 0), { duration: 300, easing: SLIDE_EASING, fill: 'forwards' })];
                if (neighbor) {
                    const rest = neighbor.direction * stageWidth();
                    animations.push(neighbor.el.animate(slideKeyframes(rest + fromOffset, rest), { duration: 300, easing: SLIDE_EASING, fill: 'forwards' }));
                }
                await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
                slide.style.transform = '';
                removeNeighbor();
                animations.forEach(animation => animation.cancel());
            } else {
                slide.style.transform = '';
                removeNeighbor();
            }
        } finally {
            state.animating = false;
        }
    }

    function step(delta) {
        goTo(state.index + delta);
    }

    function jumpRandom() {
        const total = state.items.length;
        if (total < 2) return;
        let index = state.index;
        while (index === state.index) index = Math.floor(Math.random() * total);
        goTo(index);
    }

    function openIndexSheet() {
        ns.openSheet({
            title: state.items.some(item => item.title) ? 'İsim Seç' : state.label,
            titleIcon: 'fa-solid fa-list-ol',
            className: 'is-index',
            labelId: 'tefekkurIndexTitle',
            render(body, close) {
                const list = createElement('ol', 'tefekkur-index-list');
                state.items.forEach((item, index) => {
                    const entry = document.createElement('li');
                    const button = createElement('button', 'tefekkur-index-item');
                    button.type = 'button';
                    button.dataset.index = String(index);
                    if (index === state.index) {
                        button.classList.add('is-current');
                        button.setAttribute('aria-current', 'true');
                        button.dataset.autofocus = '';
                    }
                    const text = createElement('span', 'tefekkur-index-text');
                    text.appendChild(createElement('span', 'tefekkur-index-name', item.title || `${index + 1}`));
                    if (item.title && item.text) text.appendChild(createElement('span', 'tefekkur-index-desc', item.text));
                    button.append(createElement('span', 'tefekkur-index-number', String(index + 1)), text);
                    if (item.arabic) {
                        const arabic = createElement('span', 'tefekkur-index-arabic', item.arabic);
                        arabic.lang = 'ar';
                        arabic.dir = 'rtl';
                        button.appendChild(arabic);
                    }
                    const check = createElement('i', 'fa-solid fa-check tefekkur-index-check');
                    check.setAttribute('aria-hidden', 'true');
                    button.appendChild(check);
                    entry.appendChild(button);
                    list.appendChild(entry);
                });
                list.addEventListener('click', event => {
                    const button = event.target.closest('.tefekkur-index-item');
                    if (!button) return;
                    close();
                    goTo(Number(button.dataset.index));
                });
                body.appendChild(list);
                window.requestAnimationFrame(() => {
                    list.querySelector('.is-current')?.scrollIntoView({ block: 'center' });
                });
            }
        });
    }

    async function copyCurrent() {
        try {
            const result = await ns.share.copyItem(currentItem());
            ns.toast(result === 'link' ? 'Görsel bağlantısı kopyalandı' : result === 'image' ? 'Görsel kopyalandı' : 'Panoya kopyalandı');
        } catch (error) {
            console.warn('Kopyalanamadı:', error);
            ns.toast('Kopyalanamadı', 'error');
        }
    }

    function isActive() {
        const { view } = state.elements;
        return Boolean(view && !view.hidden && view.isConnected && view.getClientRects().length > 0);
    }

    // --- Parmakla kaydırma -------------------------------------------------------------
    // Dikey kaydırma tarayıcıya bırakılır (touch-action: pan-y); yalnız belirgin yatay
    // hareket yakalanır. Fare ile sürükleme kapalıdır, masaüstünde metin seçilebilsin.

    function onPointerDown(event) {
        if (event.pointerType === 'mouse' || !event.isPrimary || state.animating) return;
        if (state.status !== 'ready' || state.items.length < 2) return;
        state.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, active: false, time: performance.now() };
    }

    function onPointerMove(event) {
        const drag = state.drag;
        if (!drag || event.pointerId !== drag.id) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (!drag.active) {
            if (Math.abs(dy) > DRAG_START_DISTANCE && Math.abs(dy) > Math.abs(dx)) {
                state.drag = null;
                return;
            }
            if (Math.abs(dx) < DRAG_START_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.2) return;
            drag.active = true;
            drag.time = performance.now();
            drag.originX = dx;
            state.elements.stage.setPointerCapture?.(event.pointerId);
            state.elements.slide.classList.add('is-dragging');
        }
        const direction = dx < 0 ? 1 : -1;
        const atEdge = (state.index === 0 && dx > 0) || (state.index === state.items.length - 1 && dx < 0);
        drag.dx = atEdge ? dx * 0.3 : dx;
        if (atEdge) removeNeighbor();
        else ensureNeighbor(state.index + direction, direction);
        placeSlides(drag.dx);
    }

    function finishDrag(event, cancelled) {
        const drag = state.drag;
        if (!drag || event.pointerId !== drag.id) return;
        state.drag = null;
        state.elements.slide.classList.remove('is-dragging');
        if (!drag.active) return;
        const elapsed = Math.max(performance.now() - drag.time, 1);
        const velocity = (drag.dx - (drag.originX || 0)) / elapsed;
        const passed = Math.abs(drag.dx) > Math.min(SWIPE_MIN_DISTANCE, state.elements.stage.clientWidth * 0.2)
            || (Math.abs(velocity) > SWIPE_MIN_VELOCITY && Math.abs(drag.dx) > 24);
        if (cancelled || !passed) {
            snapBack(drag.dx);
            return;
        }
        const target = state.index + (drag.dx < 0 ? 1 : -1);
        if (target < 0 || target >= state.items.length) {
            snapBack(drag.dx);
            return;
        }
        goTo(target, { fromOffset: drag.dx });
    }

    function bindEvents() {
        const { stage, prev, next, copy, share, chip } = state.elements;
        prev.addEventListener('click', () => step(-1));
        next.addEventListener('click', () => step(1));
        copy.addEventListener('click', copyCurrent);
        share.addEventListener('click', () => ns.share.shareItem(currentItem(), { label: state.label }));
        chip.addEventListener('click', () => {
            if (state.chip === 'index') openIndexSheet();
            else jumpRandom();
        });
        stage.addEventListener('click', event => {
            if (event.target.closest('.tefekkur-slide-retry') && state.currentSource) {
                show(state.currentSource);
            }
        });
        stage.addEventListener('pointerdown', onPointerDown);
        stage.addEventListener('pointermove', onPointerMove);
        stage.addEventListener('pointerup', event => finishDrag(event, false));
        stage.addEventListener('pointercancel', event => finishDrag(event, true));
        stage.addEventListener('dragstart', event => event.preventDefault());

        document.addEventListener('keydown', event => {
            if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            if (!isActive() || document.querySelector('.tefekkur-sheet-backdrop')) return;
            if (event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
            event.preventDefault();
            step(event.key === 'ArrowRight' ? 1 : -1);
        });
    }

    // Metin / Resim anahtarı: yalnız birden çok okuma biçimi olan bölümlerde görünür.
    // Seçim değişikliğini sekme yönlendiricisi ele alır (URL'deki `mod` güncellenir).
    function renderModes(modes, activeMode) {
        const container = state.elements.modes;
        const list = Array.isArray(modes) ? modes : [];
        container.hidden = list.length < 2;
        container.replaceChildren(...list.map(mode => {
            const button = createElement('button', 'tefekkur-slider-mode');
            const active = mode.key === activeMode;
            button.type = 'button';
            button.dataset.mode = mode.key;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
            button.setAttribute('aria-label', mode.label);
            button.title = mode.label;
            button.innerHTML = `<i class="${mode.icon}" aria-hidden="true"></i>`;
            button.appendChild(createElement('span', '', mode.label));
            return button;
        }));
    }

    async function show(source) {
        const key = sourceKeyOf(source.source);
        const sequence = ++state.sequence;
        const { title, chip } = state.elements;
        renderModes(source.modes, source.activeMode);
        state.currentSource = source;
        state.label = source.label;
        state.emptyMessage = source.emptyMessage;
        state.chip = source.chip || 'random';
        title.textContent = source.title || source.label;
        chip.hidden = false;
        chip.querySelector('i').className = state.chip === 'index' ? 'fa-solid fa-list-ol' : 'fa-solid fa-shuffle';
        chip.querySelector('span').textContent = state.chip === 'index' ? 'Liste' : 'Rastgele';
        chip.setAttribute('aria-label', state.chip === 'index' ? `${source.label} listesini aç` : 'Rastgele bir içeriğe geç');

        if (state.sourceKey === key && state.status === 'ready') {
            render();
            return;
        }
        state.sourceKey = key;
        state.items = [];
        state.index = 0;
        state.status = 'loading';
        render();
        try {
            const items = await loadItems(source.source);
            if (sequence !== state.sequence) return;
            state.items = items;
            state.index = readStoredPosition(key, items.length);
            state.status = 'ready';
        } catch (error) {
            if (sequence !== state.sequence) return;
            console.warn('Tefekkür içeriği yüklenemedi:', error);
            state.status = 'error';
            state.sourceKey = null;
        }
        render();
    }

    ns.slider = {
        init() {
            state.elements = queryElements();
            bindEvents();
        },
        show,
        // Ana sayfadan önce gelen veriyi ısıtmak için (ör. sık açılan Esmaül Hüsna).
        prefetch(source) {
            return loadItems(source).catch(() => null);
        }
    };
})();
