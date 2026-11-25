(function () {
    const ns = window.RoTaKipTefekkur;
    const VOLUME_STORAGE_KEY = 'rotakip:tefekkur-radio-volume';

    const STATUS_TEXT = Object.freeze({
        idle: 'Dinlemek için oynat düğmesine dokunun',
        loading: 'Yayına bağlanılıyor…',
        playing: 'Canlı yayında',
        paused: 'Duraklatıldı',
        error: 'Yayına bağlanılamadı. Daha sonra tekrar deneyin.',
        unavailable: 'Bu radyonun yayın adresi henüz eklenmedi.'
    });

    const state = {
        elements: null,
        radiosPromise: null,
        radios: new Map(),
        audio: null,
        // Çalan (ya da en son çalınan) radyo; ekranda açık olan radyodan farklı olabilir.
        activeKey: null,
        status: 'idle',
        viewKey: null,
        supportsVolume: true
    };

    function queryElements() {
        return {
            view: document.querySelector('.tefekkur-view[data-view="radio"]'),
            title: document.getElementById('tefekkurRadioTitle'),
            card: document.getElementById('tefekkurRadioCard'),
            icon: document.getElementById('tefekkurRadioIcon'),
            name: document.getElementById('tefekkurRadioName'),
            play: document.getElementById('tefekkurRadioPlay'),
            status: document.getElementById('tefekkurRadioStatus'),
            volumeRow: document.getElementById('tefekkurRadioVolumeRow'),
            volume: document.getElementById('tefekkurRadioVolume'),
            nowPlaying: document.getElementById('tefekkurNowPlaying'),
            nowPlayingName: document.getElementById('tefekkurNowPlayingName'),
            nowPlayingStatus: document.getElementById('tefekkurNowPlayingStatus'),
            nowPlayingToggle: document.getElementById('tefekkurNowPlayingToggle'),
            nowPlayingStop: document.getElementById('tefekkurNowPlayingStop')
        };
    }

    // iOS'ta ses düzeyi yalnız donanım tuşlarıyla değişir; `volume` salt okunur davranır.
    function detectVolumeSupport() {
        try {
            const probe = document.createElement('audio');
            probe.volume = 0.5;
            return probe.volume === 0.5;
        } catch (_error) {
            return false;
        }
    }

    function loadRadios() {
        if (!state.radiosPromise) {
            state.radiosPromise = ns.fetchJson('/api/tefekkur/radios')
                .then(data => {
                    (Array.isArray(data.radios) ? data.radios : []).forEach(radio => state.radios.set(radio.key, radio));
                    return state.radios;
                })
                .catch(error => {
                    state.radiosPromise = null;
                    throw error;
                });
        }
        return state.radiosPromise;
    }

    function ensureAudio() {
        if (state.audio) return state.audio;
        const audio = new Audio();
        audio.preload = 'none';
        const storedVolume = Number.parseFloat(ns.readStorage(VOLUME_STORAGE_KEY));
        if (Number.isFinite(storedVolume) && storedVolume >= 0 && storedVolume <= 1) audio.volume = storedVolume;
        audio.addEventListener('playing', () => setStatus('playing'));
        audio.addEventListener('waiting', () => {
            if (!audio.paused) setStatus('loading');
        });
        audio.addEventListener('pause', () => {
            // Yayın adresi değişirken tarayıcı bir "pause" olayı da yollar; o sırada çalma
            // zaten yeniden başlatılmış olur (paused=false), bu olay yok sayılır.
            if (!audio.paused) return;
            if (state.status !== 'error' && state.status !== 'idle') setStatus('paused');
        });
        audio.addEventListener('error', () => {
            if (!audio.getAttribute('src')) return;
            console.warn('Radyo yayını açılamadı:', audio.error);
            setStatus('error');
        });
        state.audio = audio;
        return audio;
    }

    function sectionOf(key) {
        return ns.findSection(key);
    }

    function setStatus(status) {
        state.status = status;
        render();
        updateMediaSession();
        // Hata mini oynatıcıda değil radyo sayfasında gösterilir; kullanıcı o sayfada değilse kısa bir uyarı yeterli.
        if (status === 'error' && state.viewKey !== state.activeKey) ns.toast(STATUS_TEXT.error, 'error');
    }

    function updateMediaSession() {
        if (!('mediaSession' in navigator) || !state.activeKey) return;
        const section = sectionOf(state.activeKey);
        try {
            navigator.mediaSession.metadata = new window.MediaMetadata({
                title: section?.label || 'Radyo',
                artist: 'RoTaKip · Tefekkür',
                artwork: [{ src: '/images/app-logo.webp', type: 'image/webp' }]
            });
            navigator.mediaSession.playbackState = state.status === 'playing' ? 'playing' : state.status === 'paused' ? 'paused' : 'none';
            navigator.mediaSession.setActionHandler('play', () => play(state.activeKey));
            navigator.mediaSession.setActionHandler('pause', pause);
            navigator.mediaSession.setActionHandler('stop', stop);
        } catch (_error) {
            // Media Session desteği kısmi olabilir; yayın etkilenmez.
        }
    }

    async function play(key) {
        let radios;
        try {
            radios = await loadRadios();
        } catch (error) {
            console.warn('Radyo listesi alınamadı:', error);
            state.activeKey = key;
            setStatus('error');
            return;
        }
        const radio = radios.get(key);
        if (!radio?.streamUrl) {
            if (state.viewKey === key) render();
            ns.toast(STATUS_TEXT.unavailable, 'error');
            return;
        }
        const audio = ensureAudio();
        // Tek ses kuralı: radyo başlayınca çalan ilahi (ve köşedeki mini oynatıcısı) kapatılır.
        ns.ilahi?.dispose();
        state.activeKey = key;
        setStatus('loading');
        // Canlı yayında duraklatıp devam edince eski tampondan değil, güncel yayından başlanır.
        audio.src = radio.streamUrl;
        try {
            await audio.play();
        } catch (error) {
            if (error?.name === 'AbortError') return;
            console.warn('Radyo başlatılamadı:', error);
            setStatus(error?.name === 'NotAllowedError' ? 'paused' : 'error');
        }
    }

    function pause() {
        if (!state.audio) return;
        state.audio.pause();
    }

    function stop() {
        const audio = state.audio;
        state.status = 'idle';
        if (audio) {
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
        }
        state.activeKey = null;
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
        render();
    }

    function toggle(key) {
        const isThisActive = state.activeKey === key;
        if (isThisActive && (state.status === 'playing' || state.status === 'loading')) {
            pause();
            return;
        }
        play(key);
    }

    function viewStatus() {
        const key = state.viewKey;
        if (!key) return 'idle';
        const radio = state.radios.get(key);
        if (state.radiosPromise && state.radios.size > 0 && !radio?.streamUrl) return 'unavailable';
        return state.activeKey === key ? state.status : 'idle';
    }

    function render() {
        const elements = state.elements;
        if (!elements) return;

        if (state.viewKey) {
            const section = sectionOf(state.viewKey);
            const status = viewStatus();
            elements.card.dataset.state = status;
            elements.card.dataset.radio = state.viewKey;
            elements.title.textContent = section?.label || 'Radyo';
            elements.name.textContent = section?.label || 'Radyo';
            elements.icon.className = section?.icon || 'fa-solid fa-tower-broadcast';
            const isRunning = status === 'playing' || status === 'loading';
            elements.play.disabled = status === 'unavailable';
            elements.play.setAttribute('aria-label', isRunning ? 'Duraklat' : 'Dinle');
            elements.play.querySelector('i').className = `fa-solid ${isRunning ? 'fa-pause' : 'fa-play'}`;
            elements.status.textContent = status === 'error' ? STATUS_TEXT.error : '';
            elements.status.hidden = status !== 'error';
        }

        elements.volumeRow.hidden = !state.supportsVolume;
        if (state.audio) elements.volume.value = String(state.audio.volume);

        // Bağlantı hatasında ana sayfadaki mini oynatıcı gösterilmez.
        const showMini = Boolean(state.activeKey) && state.status !== 'idle' && state.status !== 'error';
        elements.nowPlaying.hidden = !showMini;
        if (showMini) {
            const isRunning = state.status === 'playing' || state.status === 'loading';
            elements.nowPlaying.dataset.state = state.status;
            elements.nowPlaying.dataset.section = state.activeKey;
            elements.nowPlayingName.textContent = sectionOf(state.activeKey)?.label || 'Radyo';
            elements.nowPlayingStatus.textContent = state.status === 'playing' ? 'Canlı yayında'
                : state.status === 'loading' ? 'Bağlanılıyor…' : 'Duraklatıldı';
            elements.nowPlayingToggle.setAttribute('aria-label', isRunning ? 'Duraklat' : 'Devam et');
            elements.nowPlayingToggle.querySelector('i').className = `fa-solid ${isRunning ? 'fa-pause' : 'fa-play'}`;
        }
    }

    function bindEvents() {
        const { play: playButton, volume, nowPlayingToggle, nowPlayingStop } = state.elements;
        playButton.addEventListener('click', () => {
            if (state.viewKey) toggle(state.viewKey);
        });
        volume.addEventListener('input', () => {
            const audio = ensureAudio();
            audio.volume = Number(volume.value);
            ns.writeStorage(VOLUME_STORAGE_KEY, audio.volume);
        });
        nowPlayingToggle.addEventListener('click', () => {
            if (state.activeKey) toggle(state.activeKey);
        });
        nowPlayingStop.addEventListener('click', stop);
    }

    ns.radio = {
        init() {
            state.elements = queryElements();
            state.supportsVolume = detectVolumeSupport();
            bindEvents();
            render();
        },
        async show(key) {
            state.viewKey = key;
            render();
            try {
                await loadRadios();
            } catch (error) {
                console.warn('Radyo listesi alınamadı:', error);
            }
            if (state.viewKey === key) render();
        },
        hide() {
            state.viewKey = null;
        },
        // Radyo listesi (yayın adresleri) arka planda hazırlanır; radyo sayfası anında açılır.
        preload() {
            return loadRadios().catch(() => null);
        },
        activeKey() {
            return state.activeKey;
        },
        stop,
        render
    };
})();
