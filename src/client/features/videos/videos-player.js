// ==================== Videolar: YouTube oynatıcısı ====================
// YouTube IFrame API yalnızca Videolar sekmesine girildiğinde yüklenir (diğer sekmelerde üçüncü
// taraf betik indirilmez). Her bölüm tek bir oynatıcı oluşturup videolar arasında yeniden kullanır:
// iframe her seferinde baştan yüklenmez ve açılan ses sonraki videolarda da açık kalır.
// API yüklenemezse (engelleyici, ağ) sade bir iframe ile oynatmaya devam edilir.

(function () {
    const ns = window.RoTaKipVideos;
    const API_SRC = 'https://www.youtube.com/iframe_api';
    const PLAYER_HOST = 'https://www.youtube-nocookie.com';
    const API_TIMEOUT_MS = 8000;

    const STATES = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };
    ns.PLAYER_STATES = STATES;

    let apiPromise = null;

    ns.loadPlayerApi = function loadPlayerApi() {
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
    };

    function playerVars(options) {
        const controls = options.controls !== false;
        return {
            autoplay: options.autoplay === false ? 0 : 1,
            mute: options.muted ? 1 : 0,
            controls: controls ? 1 : 0,
            disablekb: controls ? 0 : 1,
            fs: controls ? 1 : 0,
            playsinline: 1,
            rel: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            enablejsapi: 1,
            origin: window.location.origin,
            start: Math.max(0, Math.floor(options.start || 0))
        };
    }

    function embedUrl(videoId, options) {
        const params = new URLSearchParams(Object.entries(playerVars(options)).map(([key, value]) => [key, String(value)]));
        if (options.loop) {
            params.set('loop', '1');
            params.set('playlist', videoId);
        }
        return `${PLAYER_HOST}/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
    }

    // API'siz yedek: iframe'e postMessage ile temel komutlar gönderilir; ilerleme izlenemez.
    function createFallbackPlayer(mount, options) {
        const iframe = document.createElement('iframe');
        iframe.className = 'videos-player-frame';
        iframe.title = options.title || 'Video oynatıcı';
        iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        iframe.allowFullscreen = true;
        iframe.referrerPolicy = 'strict-origin-when-cross-origin';
        mount.replaceWith(iframe);
        let muted = Boolean(options.muted);
        let currentId = options.videoId;
        const command = (func, args = []) => {
            try {
                iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), PLAYER_HOST);
            } catch (_error) {
                // iframe henüz hazır değil.
            }
        };
        const wrapper = {
            isFallback: true,
            element: iframe,
            load(videoId, loadOptions = {}) {
                currentId = videoId;
                iframe.src = embedUrl(videoId, { ...options, ...loadOptions, muted });
            },
            play: () => command('playVideo'),
            pause: () => command('pauseVideo'),
            mute() {
                muted = true;
                command('mute');
            },
            unMute() {
                muted = false;
                command('unMute');
            },
            isMuted: () => muted,
            seek: seconds => command('seekTo', [Math.max(0, seconds), true]),
            currentTime: () => 0,
            duration: () => 0,
            state: () => STATES.UNSTARTED,
            videoId: () => currentId,
            destroy() {
                iframe.src = 'about:blank';
                iframe.remove();
            }
        };
        if (options.videoId) wrapper.load(options.videoId, {});
        return wrapper;
    }

    // host: oynatıcının yerleşeceği eleman. Dönen nesne, bölümlerin kullandığı sade bir arayüzdür.
    ns.createPlayer = async function createPlayer(host, options = {}) {
        const mount = document.createElement('div');
        host.replaceChildren(mount);
        let YT;
        try {
            YT = await ns.loadPlayerApi();
        } catch (error) {
            console.warn('YouTube oynatıcı API yüklenemedi, sade oynatıcı kullanılıyor:', error);
            return createFallbackPlayer(mount, options);
        }
        if (!mount.isConnected) host.replaceChildren(mount);

        return new Promise(resolve => {
            let player = null;
            let ready = false;
            // iframe hiç hazır olmazsa (engellenmiş içerik) bölümler beklemede kalmasın.
            const readyTimer = window.setTimeout(() => resolve(wrapper), API_TIMEOUT_MS);
            let currentId = options.videoId || '';
            const wrapper = {
                isFallback: false,
                element: null,
                load(videoId, loadOptions = {}) {
                    currentId = videoId;
                    if (!ready) return;
                    const request = { videoId, startSeconds: Math.max(0, Math.floor(loadOptions.start || 0)) };
                    if (loadOptions.autoplay === false) player.cueVideoById(request);
                    else player.loadVideoById(request);
                },
                play: () => ready && player.playVideo(),
                pause: () => ready && typeof player.pauseVideo === 'function' && player.pauseVideo(),
                mute: () => ready && player.mute(),
                unMute: () => ready && player.unMute(),
                isMuted: () => (ready ? player.isMuted() : Boolean(options.muted)),
                seek: seconds => ready && player.seekTo(Math.max(0, seconds), true),
                currentTime: () => (ready ? Number(player.getCurrentTime()) || 0 : 0),
                duration: () => (ready ? Number(player.getDuration()) || 0 : 0),
                state: () => (ready ? player.getPlayerState() : STATES.UNSTARTED),
                videoId: () => currentId,
                destroy() {
                    ready = false;
                    try {
                        player?.destroy();
                    } catch (_error) {
                        // Oynatıcı zaten kaldırılmış.
                    }
                }
            };

            player = new YT.Player(mount, {
                host: PLAYER_HOST,
                videoId: options.videoId || undefined,
                width: '100%',
                height: '100%',
                playerVars: playerVars(options),
                events: {
                    onReady() {
                        window.clearTimeout(readyTimer);
                        ready = true;
                        wrapper.element = player.getIframe();
                        wrapper.element.classList.add('videos-player-frame');
                        if (options.title) wrapper.element.title = options.title;
                        if (options.muted) player.mute();
                        // Hazır olmadan önce farklı bir video istendiyse o yüklenir.
                        if (currentId && currentId !== options.videoId) wrapper.load(currentId, {});
                        options.onReady?.(wrapper);
                        resolve(wrapper);
                    },
                    onStateChange(event) {
                        if (options.loop && event.data === STATES.ENDED) {
                            player.seekTo(0, true);
                            player.playVideo();
                        }
                        options.onState?.(event.data, wrapper);
                    },
                    onError(event) {
                        options.onError?.(event.data, wrapper);
                    }
                }
            });
        });
    };

    // Oynatılamayan (gömülmesi kapalı / kaldırılmış) videolar için kullanıcıya YouTube bağlantısı gösterilir.
    ns.playerErrorMessage = function playerErrorMessage(code) {
        if (code === 101 || code === 150 || code === 153) return 'Bu video yalnızca YouTube üzerinde izlenebiliyor.';
        if (code === 100) return 'Bu video kaldırılmış veya gizlenmiş.';
        return 'Video oynatılamadı.';
    };
})();
