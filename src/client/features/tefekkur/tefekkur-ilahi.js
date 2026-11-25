(function () {
    const ns = window.RoTaKipTefekkur;
    const STORAGE_KEY = 'rotakip:tefekkur-ilahi';
    const AUTO_NEXT_DELAY_MS = 3000;
    const ERROR_NEXT_DELAY_MS = 1000;
    const MAX_ERROR_STREAK = 10;
    const VIDEOS_PATH = '/videolar';
    const TAB_URL = '/tefekkur?bolum=ilahi';
    // Mini oynatıcıdan açıldıktan hemen sonra gelebilecek istem dışı dokunuşlar yok sayılır.
    const OPEN_GUARD_MS = 500;

    // "Videoyu bildir" seçenekleri; sunucudaki REPORT_REASONS ile aynı anahtarlar.
    const REPORT_REASONS = Object.freeze([
        { key: 'acilmiyor', label: 'Video açılmıyor', icon: 'fa-solid fa-circle-exclamation' },
        { key: 'kalite', label: 'Ses ya da görüntü sorunu', icon: 'fa-solid fa-volume-xmark' },
        { key: 'uygunsuz', label: 'Uygunsuz içerik', icon: 'fa-solid fa-ban' },
        { key: 'diger', label: 'Diğer', icon: 'fa-solid fa-ellipsis' }
    ]);

    const RESULT_MESSAGES = Object.freeze({
        suggested: {
            icon: 'fa-solid fa-heart',
            title: 'Teşekkürler',
            message: 'Önerdiğin ilahi bize ulaştı. Dinleyip uygun bulursak listeye ekleyeceğiz. Gönlünden geçeni paylaştığın için sağ ol.'
        },
        existing: {
            icon: 'fa-solid fa-music',
            title: 'Bu ilahi zaten listemizde',
            message: 'Güzel bir seçim, bu ilahi dinleyeceklerin arasında. Başka bir ilahi önermek istersen seni dinliyoruz.'
        },
        reported: {
            icon: 'fa-solid fa-circle-check',
            title: 'Bildirimin alındı',
            message: 'İlahiyi inceleyip gerekirse düzelteceğiz ya da listeden kaldıracağız. Yardımın için teşekkür ederiz.'
        }
    });

    const EMPTY_MESSAGES = Object.freeze({
        queue: 'Listede ilahi yok.',
        liked: 'Henüz beğendiğin bir ilahi yok.',
        disliked: 'Henüz beğenmediğin bir ilahi yok.'
    });

    const REMOVE_LABELS = Object.freeze({
        liked: 'Beğendiklerimden çıkar',
        disliked: 'Beğenmediklerimden çıkar'
    });

    const state = {
        elements: null,
        // Altta gösterilen liste: 'queue' (sıradaki), 'liked' ya da 'disliked'.
        listView: 'queue',
        ilahiler: null,
        loadPromise: null,
        stats: { v: 1, items: {} },
        queue: [],
        index: -1,
        visible: false,
        // Mevcut ilahi gerçekten çalmaya başladı mı (başlamadan atlanırsa "sevilmedi" sayılmaz).
        trackStarted: false,
        // Bu oturumda en az bir ilahi çaldı mı; çalmadıysa sayfadan çıkınca mini oynatıcı gösterilmez.
        started: false,
        advanceTimer: 0,
        errorStreak: 0,
        openedAt: 0
    };

    function queryElements() {
        return {
            view: document.querySelector('.tefekkur-view[data-view="ilahi"]'),
            slot: document.getElementById('tefekkurIlahiSlot'),
            title: document.getElementById('tefekkurIlahiTrackTitle'),
            channel: document.getElementById('tefekkurIlahiTrackChannel'),
            dislike: document.getElementById('tefekkurIlahiDislike'),
            prev: document.getElementById('tefekkurIlahiPrev'),
            toggle: document.getElementById('tefekkurIlahiToggle'),
            next: document.getElementById('tefekkurIlahiNext'),
            like: document.getElementById('tefekkurIlahiLike'),
            share: document.getElementById('tefekkurIlahiShare'),
            menu: document.getElementById('tefekkurIlahiMenu'),
            tabs: document.querySelector('.tefekkur-ilahi-tabs'),
            list: document.getElementById('tefekkurIlahiList')
        };
    }

    // --- Kayıtlı tercihler (yalnız bu cihazda) ------------------------------------------------

    function loadStats() {
        try {
            const parsed = JSON.parse(ns.readStorage(STORAGE_KEY) || 'null');
            if (parsed && parsed.v === 1 && parsed.items && typeof parsed.items === 'object') {
                state.stats = { v: 1, items: parsed.items };
            }
        } catch (_error) {
            state.stats = { v: 1, items: {} };
        }
    }

    function saveStats() {
        ns.writeStorage(STORAGE_KEY, JSON.stringify(state.stats));
    }

    function statsOf(videoId) {
        return ns.ilahiQueue.statsOf(state.stats.items, videoId);
    }

    function updateStats(videoId, change) {
        state.stats.items[videoId] = { ...statsOf(videoId), ...change };
        saveStats();
    }

    // --- Liste ve kuyruk ----------------------------------------------------------------------

    function current() {
        return state.queue[state.index] || null;
    }

    function formatDuration(seconds) {
        const total = Math.max(0, Math.round(Number(seconds) || 0));
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor((total % 3600) / 60);
        const rest = String(total % 60).padStart(2, '0');
        return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
    }

    function loadIlahiler() {
        if (!state.loadPromise) {
            state.loadPromise = ns.fetchJson('/api/tefekkur/ilahiler')
                .then(data => {
                    state.ilahiler = Array.isArray(data.items) ? data.items : [];
                    return state.ilahiler;
                })
                .catch(error => {
                    state.loadPromise = null;
                    throw error;
                });
        }
        return state.loadPromise;
    }

    function rebuildQueue() {
        state.queue = ns.ilahiQueue.buildQueue(state.ilahiler || [], state.stats.items);
        state.index = state.queue.length > 0 ? 0 : -1;
    }

    function thumbnailUrl(videoId) {
        return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`;
    }

    // Seçili listenin ilahileri. Beğenilenler/beğenilmeyenler en son çalınandan başlayarak sıralanır.
    function listedIlahiler(view) {
        if (view === 'queue') return state.queue;
        const matches = view === 'liked' ? ns.ilahiQueue.isLiked : ns.ilahiQueue.isHidden;
        const items = state.stats.items;
        return (state.ilahiler || [])
            .filter(ilahi => matches(items, ilahi.videoId))
            .sort((a, b) => statsOf(b.videoId).last - statsOf(a.videoId).last);
    }

    function renderTabs() {
        state.elements.tabs.querySelectorAll('[data-list]').forEach(tab => {
            const view = tab.dataset.list;
            const active = view === state.listView;
            tab.setAttribute('aria-pressed', String(active));
            tab.classList.toggle('is-active', active);
            const count = tab.querySelector('[data-count]');
            if (count) count.textContent = String(listedIlahiler(view).length);
        });
    }

    function renderList() {
        const { list } = state.elements;
        const items = listedIlahiler(state.listView);
        const removeLabel = REMOVE_LABELS[state.listView];
        list.innerHTML = items.length === 0
            ? `<li class="tefekkur-ilahi-empty">${EMPTY_MESSAGES[state.listView]}</li>`
            : items.map(ilahi => `
            <li class="tefekkur-ilahi-item"><button type="button" class="tefekkur-ilahi-row" data-video-id="${window.escapeHtml(ilahi.videoId)}">
                <span class="tefekkur-ilahi-thumb">
                    <img src="${thumbnailUrl(ilahi.videoId)}" alt="" loading="lazy" decoding="async">
                    <i class="fa-solid fa-play" aria-hidden="true"></i>
                    <em>${formatDuration(ilahi.sureSaniye)}</em>
                </span>
                <span class="tefekkur-ilahi-row-text"><strong>${window.escapeHtml(ilahi.baslik)}</strong><small>${window.escapeHtml(ilahi.kanalAdi)}</small></span>
            </button>${removeLabel ? `<button type="button" class="tefekkur-ilahi-row-remove" data-remove="${window.escapeHtml(ilahi.videoId)}" aria-label="${removeLabel}" title="${removeLabel}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>` : ''}</li>
        `).join('');
        renderTabs();
        renderCurrent();
    }

    // Beğeni durumu değişince sayaçlar ve (beğenilen/beğenilmeyen görünümündeyse) liste güncellenir.
    function refreshLists() {
        if (state.listView === 'queue') {
            renderTabs();
            renderCurrent();
        } else {
            renderList();
        }
    }

    function renderCurrent() {
        const { title, channel, like, dislike: dislikeButton, share, list } = state.elements;
        const ilahi = current();
        title.textContent = ilahi ? ilahi.baslik : '';
        channel.textContent = ilahi ? ilahi.kanalAdi : '';
        ns.ilahiPlayer.setInfo(ilahi ? ilahi.baslik : '', ilahi ? ilahi.kanalAdi : '');
        const stats = ilahi ? statsOf(ilahi.videoId) : ns.ilahiQueue.emptyStats();
        like.setAttribute('aria-pressed', String(stats.liked));
        like.classList.toggle('is-active', stats.liked);
        like.querySelector('i').className = stats.liked ? 'fa-solid fa-thumbs-up' : 'fa-regular fa-thumbs-up';
        dislikeButton.setAttribute('aria-pressed', String(stats.disliked));
        dislikeButton.classList.toggle('is-active', stats.disliked);
        dislikeButton.querySelector('i').className = stats.disliked ? 'fa-solid fa-thumbs-down' : 'fa-regular fa-thumbs-down';
        share.disabled = !ilahi;
        list.querySelectorAll('.tefekkur-ilahi-row').forEach(row => {
            const isCurrent = Boolean(ilahi) && row.dataset.videoId === ilahi.videoId;
            row.classList.toggle('is-current', isCurrent);
            if (isCurrent) row.setAttribute('aria-current', 'true');
            else row.removeAttribute('aria-current');
        });
        renderToggle();
    }

    function renderToggle() {
        const { toggle } = state.elements;
        const playing = ns.ilahiPlayer.isPlaying();
        toggle.setAttribute('aria-label', playing ? 'Duraklat' : 'Oynat');
        toggle.querySelector('i').className = `fa-solid ${playing ? 'fa-pause' : 'fa-play'}`;
    }

    // --- Çalma akışı --------------------------------------------------------------------------

    function clearAdvanceTimer() {
        window.clearTimeout(state.advanceTimer);
        state.advanceTimer = 0;
    }

    // Dinleme süresine göre "sevilmedi" sayacını günceller. Hiç başlamadan geçilen ilahiler sayılmaz.
    function finishTrack(completed) {
        const ilahi = current();
        if (!ilahi || !state.trackStarted) return;
        state.trackStarted = false;
        const listened = completed ? ilahi.sureSaniye : ns.ilahiPlayer.currentTime();
        const next = ns.ilahiQueue.afterPlayback(statsOf(ilahi.videoId), listened, completed);
        updateStats(ilahi.videoId, { short: next.short });
    }

    function playIndex(index) {
        clearAdvanceTimer();
        if (state.queue.length === 0) return;
        if (index >= state.queue.length) {
            // Liste bitti: yeni bir karışım kurulur.
            rebuildQueue();
            renderList();
        } else {
            state.index = Math.max(0, index);
        }
        const ilahi = current();
        if (!ilahi) return;
        state.trackStarted = false;
        ns.ilahiPlayer.load(ilahi.videoId, { autoplay: true });
        renderCurrent();
    }

    // Kullanıcı kaynaklı geçişler mevcut ilahinin dinlenme süresini değerlendirir; otomatik geçişler etmez.
    function goTo(index) {
        finishTrack(false);
        playIndex(index);
    }

    function advanceAutomatically() {
        playIndex(state.index + 1);
    }

    function scheduleAdvance(delay) {
        clearAdvanceTimer();
        state.advanceTimer = window.setTimeout(advanceAutomatically, delay);
    }

    function togglePlayback() {
        clearAdvanceTimer();
        if (ns.ilahiPlayer.isPlaying()) ns.ilahiPlayer.pause();
        else ns.ilahiPlayer.play();
    }

    // Yalnız açık 👎 ilahiyi karışımdan çıkarır; kısa geçilenler listede kalıp alta iner. Çalan ilahi
    // kesilmez ve listeden silinmez: işaret kaydedilir, ilahi bir sonraki karışımda gösterilmez.
    // Tekrar basmak işareti geri alır.
    function toggleDislike() {
        const ilahi = current();
        if (!ilahi) return;
        const disliked = !statsOf(ilahi.videoId).disliked;
        updateStats(ilahi.videoId, disliked ? { liked: false, disliked: true } : { disliked: false });
        refreshLists();
        ns.toast(disliked ? 'Bu ilahi bir daha önerilmeyecek' : 'Beğenmeme geri alındı');
    }

    function shareCurrent() {
        const ilahi = current();
        if (!ilahi) return;
        ns.share.shareLink({
            title: ilahi.baslik,
            text: `${ilahi.baslik} — ${ilahi.kanalAdi}`,
            url: `https://www.youtube.com/watch?v=${encodeURIComponent(ilahi.videoId)}`,
            label: 'İlahi'
        });
    }

    function toggleLike() {
        const ilahi = current();
        if (!ilahi) return;
        const liked = !statsOf(ilahi.videoId).liked;
        // Beğenilen ilahi alta itilmez ve (önceden 👎 verilmişse) 👎 işareti kalkar.
        updateStats(ilahi.videoId, liked ? { liked, disliked: false, short: 0 } : { liked });
        refreshLists();
    }

    // Beğenilen/beğenilmeyen listesinden seçilen ilahi sıradaysa oraya atlanır, değilse sıradakinin
    // hemen arkasına eklenip çalınır. Oynatıcı henüz kurulmadıysa (tüm ilahiler beğenilmemiş olabilir) kurulur.
    function playVideo(videoId) {
        let index = state.queue.findIndex(ilahi => ilahi.videoId === videoId);
        if (index === -1) {
            const ilahi = (state.ilahiler || []).find(item => item.videoId === videoId);
            if (!ilahi) return;
            index = state.index + 1;
            state.queue.splice(index, 0, ilahi);
        }
        if (ns.ilahiPlayer.exists()) {
            goTo(index);
            return;
        }
        state.index = index;
        ns.ilahiPlayer.ensure(videoId)
            .then(() => {
                if (!state.visible) return;
                ns.ilahiPlayer.attach(state.elements.slot);
                playIndex(index);
            })
            .catch(error => console.warn('İlahi oynatıcısı hazırlanamadı:', error));
    }

    function selectList(view) {
        if (view === state.listView) return;
        state.listView = view;
        renderList();
    }

    function handlePlayerState(code) {
        const { STATES } = ns.ilahiPlayer;
        renderToggle();
        if (code === STATES.PLAYING) {
            clearAdvanceTimer();
            state.errorStreak = 0;
            state.started = true;
            const ilahi = current();
            if (ilahi && !state.trackStarted) {
                state.trackStarted = true;
                updateStats(ilahi.videoId, { last: Date.now() });
            }
            // Tek ses kuralı: ilahi çalarken radyo susar.
            if (ns.radio.activeKey()) ns.radio.stop();
        } else if (code === STATES.ENDED) {
            finishTrack(true);
            scheduleAdvance(AUTO_NEXT_DELAY_MS);
        }
    }

    // Oynatılamayan ilahi (gömmeye kapalı, kaldırılmış) sessizce atlanır; hepsi bozuksa durulur.
    function handlePlayerError() {
        state.trackStarted = false;
        state.errorStreak += 1;
        if (state.errorStreak > Math.min(state.queue.length, MAX_ERROR_STREAK)) return;
        scheduleAdvance(ERROR_NEXT_DELAY_MS);
    }

    // --- Oynatıcının yaşam döngüsü ------------------------------------------------------------

    function dispose() {
        clearAdvanceTimer();
        finishTrack(false);
        ns.ilahiPlayer.destroy();
        state.queue = [];
        state.index = -1;
        state.trackStarted = false;
        state.started = false;
        state.errorStreak = 0;
        if (state.elements) {
            state.elements.list.replaceChildren();
            renderCurrent();
        }
    }

    function openFull() {
        state.openedAt = Date.now();
        if (window.location.pathname.replace(/\/$/, '') === '/tefekkur') {
            ns.navigate({ view: 'ilahi', bolum: 'ilahi' });
        } else if (typeof window.navigateRoTaKip === 'function') {
            window.navigateRoTaKip(TAB_URL);
        } else {
            window.location.assign(TAB_URL);
        }
    }

    function isOnVideos() {
        return window.location.pathname.replace(/\/$/, '') === VIDEOS_PATH;
    }

    // İlahi sayfasından ayrılınca: çalmaya başlamışsa köşede mini oynatıcı kalır, başlamamışsa kaldırılır.
    function hide() {
        state.visible = false;
        if (!ns.ilahiPlayer.exists()) return;
        if (state.started) ns.ilahiPlayer.dock();
        else dispose();
    }

    // Tefekkür sekmesinden çıkış: hedef Videolar ise oynatıcı yok edilir, aksi hâlde köşede sürer.
    function leaveTab() {
        if (isOnVideos()) dispose();
        else hide();
    }

    async function show() {
        state.visible = true;
        const { slot } = state.elements;
        let ilahiler;
        try {
            ilahiler = await loadIlahiler();
        } catch (error) {
            console.warn('İlahi listesi alınamadı:', error);
            return;
        }
        if (!state.visible) return;
        if (ilahiler.length === 0) return;

        if (!ns.ilahiPlayer.exists()) {
            rebuildQueue();
            renderList();
            const first = current();
            if (!first) return;
            ns.ilahiPlayer.ensure(first.videoId).catch(error => console.warn('İlahi oynatıcısı hazırlanamadı:', error));
        } else {
            renderCurrent();
        }
        ns.ilahiPlayer.attach(slot);
    }

    // --- Menü: Yeni ilahi öner / videoyu bildir ----------------------------------------------------

    async function postJson(url, payload) {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data || data.success === false) {
            throw new Error(data?.message || 'İşlem tamamlanamadı');
        }
        return data;
    }

    // Pencerenin içeriğini sade bir teşekkür ekranıyla değiştirir.
    function showResult(body, close, { icon, title, message }) {
        body.innerHTML = `
            <div class="tefekkur-ilahi-result">
                <span class="tefekkur-ilahi-result-icon" aria-hidden="true"><i class="${icon}"></i></span>
                <h3>${window.escapeHtml(title)}</h3>
                <p>${window.escapeHtml(message)}</p>
                <button type="button" data-autofocus>Tamam</button>
            </div>
        `;
        const button = body.querySelector('button');
        button.addEventListener('click', () => close());
        button.focus({ preventScroll: true });
    }

    function openSuggestSheet() {
        ns.openSheet({
            title: 'Yeni ilahi öner',
            labelId: 'tefekkurIlahiSuggestTitle',
            render(body, close) {
                body.innerHTML = `
                    <form class="tefekkur-ilahi-suggest" novalidate>
                        <input type="url" name="url" inputmode="url" autocomplete="off" maxlength="300" placeholder="YouTube bağlantısı" aria-label="YouTube bağlantısı" data-autofocus required>
                        <button type="submit">Gönder</button>
                    </form>
                `;
                const form = body.querySelector('form');
                form.addEventListener('submit', async event => {
                    event.preventDefault();
                    const url = form.elements.url.value.trim();
                    if (!url) return;
                    const button = form.querySelector('button');
                    button.disabled = true;
                    try {
                        const data = await postJson('/api/tefekkur/ilahi-onerileri', { url });
                        showResult(body, close, data.existing ? RESULT_MESSAGES.existing : RESULT_MESSAGES.suggested);
                    } catch (error) {
                        button.disabled = false;
                        ns.toast(error.message, 'error');
                    }
                });
            }
        });
    }

    function openReportSheet() {
        const ilahi = current();
        if (!ilahi) return;
        ns.openSheet({
            title: 'Videoyu bildir',
            labelId: 'tefekkurIlahiReportTitle',
            render(body, close) {
                body.innerHTML = `
                    <p class="tefekkur-ilahi-report-target">${window.escapeHtml(ilahi.baslik)}</p>
                    <div class="tefekkur-share-options">
                        ${REPORT_REASONS.map(reason => `<button type="button" data-reason="${reason.key}"><i class="${reason.icon}" aria-hidden="true"></i>${window.escapeHtml(reason.label)}</button>`).join('')}
                    </div>
                `;
                body.addEventListener('click', async event => {
                    const button = event.target.closest('[data-reason]');
                    if (!button || button.disabled) return;
                    body.querySelectorAll('[data-reason]').forEach(item => { item.disabled = true; });
                    try {
                        await postJson('/api/tefekkur/ilahi-bildirimleri', { videoId: ilahi.videoId, reason: button.dataset.reason });
                        showResult(body, close, RESULT_MESSAGES.reported);
                    } catch (error) {
                        body.querySelectorAll('[data-reason]').forEach(item => { item.disabled = false; });
                        ns.toast(error.message, 'error');
                    }
                });
            }
        });
    }

    function openMenuSheet() {
        ns.openSheet({
            title: 'İlahi',
            labelId: 'tefekkurIlahiMenuTitle',
            render(body, close) {
                body.innerHTML = `
                    <div class="tefekkur-share-options">
                        <button type="button" data-action="suggest"><i class="fa-regular fa-lightbulb" aria-hidden="true"></i>Yeni ilahi öner</button>
                        <button type="button" data-action="report"${current() ? '' : ' disabled'}><i class="fa-regular fa-flag" aria-hidden="true"></i>Videoyu bildir</button>
                    </div>
                `;
                body.addEventListener('click', event => {
                    const action = event.target.closest('[data-action]')?.dataset.action;
                    if (!action) return;
                    close();
                    if (action === 'suggest') openSuggestSheet();
                    else openReportSheet();
                });
            }
        });
    }

    // --- Başlatma -----------------------------------------------------------------------------

    // Mini oynatıcıdan açıldıktan hemen sonraki istem dışı dokunuşlar (ilahiyi baştan başlatmasın) yok sayılır.
    function guarded(handler) {
        return event => {
            if (Date.now() - state.openedAt < OPEN_GUARD_MS) return;
            handler(event);
        };
    }

    function bindEvents() {
        const { prev, toggle, next, like, dislike: dislikeButton, share, menu, tabs, list } = state.elements;
        prev.addEventListener('click', guarded(() => goTo(state.index > 0 ? state.index - 1 : 0)));
        next.addEventListener('click', guarded(() => goTo(state.index + 1)));
        toggle.addEventListener('click', guarded(togglePlayback));
        like.addEventListener('click', guarded(toggleLike));
        dislikeButton.addEventListener('click', guarded(toggleDislike));
        share.addEventListener('click', guarded(shareCurrent));
        menu.addEventListener('click', openMenuSheet);
        tabs.addEventListener('click', event => {
            const tab = event.target.closest('[data-list]');
            if (tab) selectList(tab.dataset.list);
        });
        list.addEventListener('click', guarded(event => {
            const remove = event.target.closest('[data-remove]');
            if (remove) {
                updateStats(remove.dataset.remove, state.listView === 'liked' ? { liked: false } : { disliked: false });
                refreshLists();
                return;
            }
            const row = event.target.closest('.tefekkur-ilahi-row');
            if (!row) return;
            playVideo(row.dataset.videoId);
            // Liste aşağıdayken seçilen ilahinin oynatıcısı görünsün.
            window.scrollTo({ top: 0, behavior: ns.prefersReducedMotion() ? 'auto' : 'smooth' });
        }));
        // Videolar sekmesine (başka bir sekmeden de olsa) geçilince oynatıcı yok edilir.
        window.addEventListener('rotakip:primary-content-ready', () => {
            if (isOnVideos() && ns.ilahiPlayer.exists()) dispose();
        });
        window.addEventListener('pagehide', () => {
            if (ns.ilahiPlayer.exists()) finishTrack(false);
        });
    }

    ns.ilahi = {
        init() {
            state.elements = queryElements();
            loadStats();
            ns.ilahiPlayer.configure({
                onState: handlePlayerState,
                onError: handlePlayerError,
                onMiniToggle: togglePlayback,
                onMiniClose: dispose,
                onMiniOpen: openFull
            });
            bindEvents();
            renderCurrent();
        },
        show,
        hide,
        leaveTab,
        dispose,
        // Liste arka planda hazırlanır; ilahi sayfası anında açılır.
        preload() {
            return loadIlahiler().catch(() => null);
        }
    };
})();
