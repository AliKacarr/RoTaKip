(function () {
    const ns = window.RoTaKipTefekkur;

    // İlahi oynatıcısı: tek bir YouTube iframe'i, `document.body`'ye bağlı kalıcı bir "sahne" içinde yaşar.
    // Sekme görünümü DOM'dan sökülünce iframe taşınmaz (taşınan iframe baştan yüklenir). Sahne iki durumdadır:
    //  - full: İlahi sayfasındaki yer tutucunun (slot) üstüne oturur, her karede konumu eşitlenir.
    //  - mini: Sağ alt köşede küçülür; sürüklenebilir, dokununca ilahi sayfası açılır.
    // YouTube iframe'i fare/dokunma olaylarını yuttuğu için mini durumda üstüne şeffaf bir "kalkan" konur.
    const API_SRC = 'https://www.youtube.com/iframe_api';
    const PLAYER_HOST = 'https://www.youtube-nocookie.com';
    const API_TIMEOUT_MS = 8000;
    const STATES = Object.freeze({ UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 });
    const DRAG_THRESHOLD = 6;
    const EDGE_MARGIN = 8;
    const MINI_MARGIN = 12;

    let apiPromise = null;
    let stage = null;
    let player = null;
    let playerPromise = null;
    let ready = false;
    let currentVideoId = '';
    let mode = 'hidden';
    let slot = null;
    let frameRequest = 0;
    let lastRect = '';
    let miniPosition = null;
    let handlers = {};
    let info = { title: '', channel: '' };
    let progressTimer = 0;

    // Mini oynatıcının altındaki başlık ve kanal satırı.
    function applyInfo(element = stage) {
        if (!element) return;
        element.querySelector('.tefekkur-ilahi-mini-info strong').textContent = info.title;
        element.querySelector('.tefekkur-ilahi-mini-info span').textContent = info.channel;
    }

    // Mini oynatıcının alt kenarındaki ilerleme çizgisi; yalnız mini hâldeyken izlenir.
    function updateProgress() {
        const bar = stage?.querySelector('.tefekkur-ilahi-mini-progress span');
        if (!bar || !ready) return;
        const duration = Number(player.getDuration()) || 0;
        const time = Number(player.getCurrentTime()) || 0;
        bar.style.width = duration > 0 ? `${Math.min(100, (time / duration) * 100)}%` : '0%';
    }

    function stopProgress() {
        window.clearInterval(progressTimer);
        progressTimer = 0;
    }

    function startProgress() {
        stopProgress();
        updateProgress();
        progressTimer = window.setInterval(updateProgress, 500);
    }

    function loadApi() {
        if (window.YT && typeof window.YT.Player === 'function') return Promise.resolve(window.YT);
        if (apiPromise) return apiPromise;
        apiPromise = new Promise((resolve, reject) => {
            const timer = window.setTimeout(() => reject(new Error('YouTube oynatıcısı zamanında yüklenemedi')), API_TIMEOUT_MS);
            const previousReady = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = function onYouTubeIframeAPIReady() {
                window.clearTimeout(timer);
                if (typeof previousReady === 'function') {
                    try {
                        previousReady();
                    } catch (_error) {
                        // Başka bir modülün geri çağrısı oynatıcıyı engellememeli.
                    }
                }
                resolve(window.YT);
            };
            const load = typeof window.loadExternalScriptOnce === 'function'
                ? window.loadExternalScriptOnce(API_SRC)
                : Promise.reject(new Error('Betik yükleyici bulunamadı'));
            load.catch(error => {
                window.clearTimeout(timer);
                reject(error);
            });
        }).catch(error => {
            apiPromise = null;
            throw error;
        });
        return apiPromise;
    }

    function createStage() {
        const element = document.createElement('div');
        element.id = 'tefekkurIlahiStage';
        element.className = 'tefekkur-ilahi-stage';
        element.hidden = true;
        element.innerHTML = `
            <div class="tefekkur-ilahi-frame">
                <div id="tefekkurIlahiHost"></div>
                <div class="tefekkur-ilahi-shield" aria-hidden="true"></div>
                <div class="tefekkur-ilahi-mini-controls">
                    <button type="button" class="is-corner" data-mini="close" aria-label="İlahiyi kapat"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
                    <button type="button" class="is-main" data-mini="toggle" aria-label="Duraklat"><i class="fa-solid fa-pause" aria-hidden="true"></i></button>
                </div>
                <div class="tefekkur-ilahi-mini-progress" aria-hidden="true"><span></span></div>
            </div>
            <div class="tefekkur-ilahi-mini-info">
                <strong></strong>
                <span></span>
            </div>
        `;
        element.querySelector('.tefekkur-ilahi-mini-controls').addEventListener('click', event => {
            const action = event.target.closest('[data-mini]')?.dataset.mini;
            if (action === 'close') handlers.onMiniClose?.();
            else if (action === 'toggle') handlers.onMiniToggle?.();
        });
        applyInfo(element);
        bindDrag(element.querySelector('.tefekkur-ilahi-shield'));
        document.body.appendChild(element);
        return element;
    }

    function clampPosition(left, top) {
        const rect = stage.getBoundingClientRect();
        return {
            left: Math.min(Math.max(left, EDGE_MARGIN), Math.max(EDGE_MARGIN, window.innerWidth - rect.width - EDGE_MARGIN)),
            top: Math.min(Math.max(top, EDGE_MARGIN), Math.max(EDGE_MARGIN, window.innerHeight - rect.height - EDGE_MARGIN))
        };
    }

    // Varsayılan konum sağ alttır; alt menü ekranın altındaysa (mobil) onun üstünde durur.
    function defaultMiniPosition() {
        const rect = stage.getBoundingClientRect();
        let bottom = MINI_MARGIN;
        const nav = document.getElementById('appNavigation');
        if (nav) {
            const navRect = nav.getBoundingClientRect();
            if (navRect.height > 0 && navRect.top > window.innerHeight / 2) bottom = window.innerHeight - navRect.top + MINI_MARGIN;
        }
        return { left: window.innerWidth - rect.width - MINI_MARGIN, top: window.innerHeight - rect.height - bottom };
    }

    function applyMiniPosition() {
        if (!stage || mode !== 'mini') return;
        const target = miniPosition || defaultMiniPosition();
        const position = clampPosition(target.left, target.top);
        stage.style.left = `${Math.round(position.left)}px`;
        stage.style.top = `${Math.round(position.top)}px`;
    }

    // Sürükleme `pointer` olaylarıyla, dokunma (açma) ise `click` ile işlenir. Açma `pointerup`'ta yapılırsa
    // tarayıcının ardından ürettiği click, sayfa açıldıktan sonra parmağın altında kalan düğmeye (Önceki,
    // liste satırı vb.) düşer ve ilahi baştan başlar.
    function bindDrag(shield) {
        let drag = null;
        let dragged = false;
        shield.addEventListener('pointerdown', event => {
            if (mode !== 'mini' || (event.pointerType === 'mouse' && event.button !== 0)) return;
            const rect = stage.getBoundingClientRect();
            dragged = false;
            drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top };
            shield.setPointerCapture?.(event.pointerId);
        });
        shield.addEventListener('pointermove', event => {
            if (!drag || event.pointerId !== drag.id) return;
            const dx = event.clientX - drag.startX;
            const dy = event.clientY - drag.startY;
            if (!dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
            dragged = true;
            miniPosition = clampPosition(drag.left + dx, drag.top + dy);
            applyMiniPosition();
        });
        const finish = event => {
            if (!drag || event.pointerId !== drag.id) return;
            shield.releasePointerCapture?.(event.pointerId);
            drag = null;
        };
        shield.addEventListener('pointerup', finish);
        shield.addEventListener('pointercancel', finish);
        shield.addEventListener('click', () => {
            if (dragged) {
                dragged = false;
                return;
            }
            if (mode === 'mini') handlers.onMiniOpen?.();
        });
    }

    function syncToSlot() {
        frameRequest = 0;
        if (mode !== 'full' || !stage) return;
        if (slot && slot.isConnected) {
            const rect = slot.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                const key = `${rect.left}|${rect.top}|${rect.width}|${rect.height}`;
                if (key !== lastRect) {
                    lastRect = key;
                    stage.style.left = `${rect.left}px`;
                    stage.style.top = `${rect.top}px`;
                    stage.style.width = `${rect.width}px`;
                    stage.style.height = `${rect.height}px`;
                }
                stage.style.visibility = '';
            } else {
                stage.style.visibility = 'hidden';
            }
        }
        frameRequest = window.requestAnimationFrame(syncToSlot);
    }

    function stopSync() {
        if (frameRequest) window.cancelAnimationFrame(frameRequest);
        frameRequest = 0;
    }

    function setToggleIcon(playing) {
        const button = stage?.querySelector('[data-mini="toggle"]');
        if (!button) return;
        button.setAttribute('aria-label', playing ? 'Duraklat' : 'Oynat');
        button.querySelector('i').className = `fa-solid ${playing ? 'fa-pause' : 'fa-play'}`;
    }

    // Oynatıcıyı (yoksa sahneyi de) kurar. `videoId` hazır olunca hazırlanır (otomatik başlamaz).
    function ensure(videoId) {
        if (playerPromise) return playerPromise;
        currentVideoId = videoId;
        stage = stage || createStage();
        const attempt = loadApi().then(YT => new Promise((resolve, reject) => {
            const timer = window.setTimeout(() => reject(new Error('Oynatıcı hazırlanamadı')), API_TIMEOUT_MS);
            player = new YT.Player(stage.querySelector('#tefekkurIlahiHost'), {
                host: PLAYER_HOST,
                videoId,
                width: '100%',
                height: '100%',
                playerVars: {
                    autoplay: 0,
                    controls: 1,
                    playsinline: 1,
                    rel: 0,
                    iv_load_policy: 3,
                    modestbranding: 1,
                    enablejsapi: 1,
                    origin: window.location.origin
                },
                events: {
                    onReady() {
                        window.clearTimeout(timer);
                        ready = true;
                        const frame = player.getIframe();
                        frame.classList.add('tefekkur-ilahi-frame-element');
                        frame.title = 'İlahi oynatıcısı';
                        // Hazır olmadan önce başka bir ilahi istendiyse o hazırlanır.
                        if (currentVideoId && currentVideoId !== videoId) player.cueVideoById({ videoId: currentVideoId });
                        resolve(api);
                    },
                    onStateChange(event) {
                        setToggleIcon(event.data === STATES.PLAYING || event.data === STATES.BUFFERING);
                        handlers.onState?.(event.data);
                    },
                    onError(event) {
                        handlers.onError?.(event.data);
                    }
                }
            });
        }));
        playerPromise = attempt.catch(error => {
            destroy();
            throw error;
        });
        return playerPromise;
    }

    // İlahi sayfası: sahne yer tutucunun üstüne oturur.
    function attach(slotElement) {
        if (!stage) return;
        slot = slotElement;
        mode = 'full';
        lastRect = '';
        stage.classList.remove('is-mini');
        stage.hidden = false;
        stage.style.visibility = '';
        stopProgress();
        stopSync();
        syncToSlot();
    }

    // Başka bir görünüm ya da sekme: sahne köşede küçülür.
    function dock() {
        if (!stage) return;
        stopSync();
        slot = null;
        mode = 'mini';
        stage.classList.add('is-mini');
        stage.style.width = '';
        stage.style.height = '';
        stage.style.visibility = '';
        stage.hidden = false;
        applyMiniPosition();
        startProgress();
    }

    function hideStage() {
        stopSync();
        stopProgress();
        mode = 'hidden';
        slot = null;
        if (stage) stage.hidden = true;
    }

    function destroy() {
        stopSync();
        stopProgress();
        try {
            player?.destroy();
        } catch (_error) {
            // Oynatıcı zaten kaldırılmış.
        }
        stage?.remove();
        stage = null;
        player = null;
        playerPromise = null;
        ready = false;
        currentVideoId = '';
        mode = 'hidden';
        slot = null;
    }

    function stateCode() {
        return ready ? player.getPlayerState() : STATES.UNSTARTED;
    }

    const api = {
        STATES,
        attach,
        configure(nextHandlers) {
            handlers = nextHandlers || {};
        },
        currentTime: () => (ready ? Number(player.getCurrentTime()) || 0 : 0),
        destroy,
        dock,
        ensure,
        exists: () => Boolean(stage),
        hideStage,
        isDocked: () => mode === 'mini',
        isPlaying: () => stateCode() === STATES.PLAYING || stateCode() === STATES.BUFFERING,
        load(videoId, { autoplay = true } = {}) {
            currentVideoId = videoId;
            if (!ready) return;
            if (autoplay) player.loadVideoById({ videoId });
            else player.cueVideoById({ videoId });
        },
        pause() {
            if (ready) player.pauseVideo();
        },
        play() {
            if (ready) player.playVideo();
        },
        setInfo(title, channel) {
            info = { title: title || '', channel: channel || '' };
            applyInfo();
        },
        state: stateCode,
        videoId: () => currentVideoId
    };

    window.addEventListener('resize', () => {
        if (mode === 'mini') applyMiniPosition();
    });

    ns.ilahiPlayer = api;
})();
