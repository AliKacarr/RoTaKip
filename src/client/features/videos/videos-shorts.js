// ==================== Videolar: Shorts ====================
// /videolar?bolum=shorts[&v=<videoId>]. Dikey, tam ekran kaydırmalı akış: ekrana oturan short
// kendiliğinden oynar. Tek bir oynatıcı aktif slaytın üstüne konumlanır ve videolar arasında
// yeniden kullanılır; ses bir kez açılınca sonraki shorts'larda da açık kalır. Önce izlenmemiş
// shorts gelir; onlar bitince liste hemen sona ermez, izlenmiş shorts da en yeniden başlayarak eklenir.

(function () {
    const ns = window.RoTaKipVideos;
    const PAGE_SIZE = 12;
    const MAX_AUTO_PAGES = 4;
    const LOAD_AHEAD = 3;
    const PROGRESS_TICK_MS = 250;
    const PROGRESS_SAVE_EVERY = 16;

    function slideHtml(video, index) {
        const id = ns.escape(video.id);
        const liked = ns.store.isLiked(video.id);
        const saved = ns.store.isSaved(video.id);
        const action = (name, icons, label, active, text) => `<button type="button" class="videos-short-action${active ? ' is-active' : ''}" data-action="${name}" data-video-id="${id}" aria-label="${label}" aria-pressed="${active ? 'true' : 'false'}" data-icon="${icons.icon}" data-active-icon="${icons.activeIcon}"><i class="${active ? icons.activeIcon : icons.icon}" aria-hidden="true"></i><span>${text}</span></button>`;
        return `<article class="videos-short" data-video-id="${id}" data-index="${index}" aria-label="${ns.escape(video.title)}">
            <div class="videos-short-frame">
                <img class="videos-short-poster" src="${ns.escape(ns.thumbnailUrl(video.id))}" alt="" loading="${index < 2 ? 'eager' : 'lazy'}" decoding="async" referrerpolicy="no-referrer">
                <button type="button" class="videos-short-toggle" data-action="short-toggle" aria-label="Oynat veya duraklat"></button>
                <span class="videos-short-state" aria-hidden="true"><i class="fa-solid fa-play"></i></span>
                <div class="videos-short-info">
                    <button type="button" class="videos-short-channel" data-channel-filter="${ns.escape(video.channelId)}">
                        ${ns.avatarHtml(video.channelId, video.channelName, 'videos-avatar-sm')}
                        <span>${ns.escape(ns.channelHandleLabel(video.channelId, video.channelName))}</span>
                    </button>
                    <p class="videos-short-title">${ns.escape(video.title)}</p>
                </div>
                <div class="videos-short-actions">
                    ${action('like', ns.LIKE_ICONS, 'Beğen', liked, 'Beğen')}
                    ${action('save', ns.SAVE_ICONS, 'Kaydet', saved, 'Kaydet')}
                    <button type="button" class="videos-short-action" data-action="share" data-video-id="${id}" aria-label="Paylaş"><i class="fa-solid fa-share" aria-hidden="true"></i><span>Paylaş</span></button>
                    <a class="videos-short-action" href="${ns.escape(ns.youtubeUrl(video))}" target="_blank" rel="noopener noreferrer" aria-label="YouTube'da aç"><i class="fa-brands fa-youtube" aria-hidden="true"></i><span>YouTube</span></a>
                </div>
                <div class="videos-short-seek" role="slider" tabindex="-1" aria-label="Short konumu" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                    <span class="videos-short-progress" aria-hidden="true"><span></span></span>
                    <span class="videos-short-seek-thumb" aria-hidden="true"></span>
                </div>
            </div>
        </article>`;
    }

    const shorts = {
        root: null,
        scroller: null,
        layer: null,
        host: null,
        home: null,
        items: [],
        ids: new Set(),
        cursor: null,
        hasMore: false,
        // 'unwatched': izlenmemişler listelenir; sunucu sayfaları bitince 'watched' ile baştan izlenmişler.
        pass: 'unwatched',
        loading: false,
        prepared: false,
        stale: false,
        preparing: null,
        observer: null,
        activeIndex: -1,
        player: null,
        playerPromise: null,
        // Ses varsayılan olarak açıktır; tarayıcı yalnız hiç etkileşim olmamışken sesli oynatmayı engeller.
        muted: false,
        userMuted: false,
        scrubbing: false,
        active: false,
        userPaused: false,
        progressTimer: null,
        progressTicks: 0,
        recorded: new Set(),
        sequence: 0,

        init(page) {
            this.root = page.querySelector('[data-view="shorts"]');
            this.scroller = page.querySelector('#videosShorts');
            this.layer = document.createElement('div');
            this.layer.className = 'videos-short-player';
            this.layer.setAttribute('aria-hidden', 'true');
            this.host = document.createElement('div');
            this.host.className = 'videos-short-player-host';
            this.layer.appendChild(this.host);

            document.addEventListener('keydown', event => this.onKeydown(event));
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) this.pause();
                else if (this.active && !this.userPaused) this.play();
            });
            window.addEventListener('resize', () => this.positionLayer(), { passive: true });
            this.bindSeek();
        },

        setHome(home) {
            this.home = home;
        },

        // Liste ilk kez hazırlanır: izlenmemiş en yeni shorts; bağlantıyla gelen short en başa alınır.
        async prepare(startId) {
            if (this.prepared && (!startId || this.ids.has(startId))) return;
            if (this.preparing) {
                await this.preparing;
                if (!startId || this.ids.has(startId)) return;
            }
            this.preparing = (async () => {
                const sequence = this.sequence;
                if (!this.prepared) {
                    const home = this.home || await ns.tab.homeReady();
                    if (sequence !== this.sequence) return;
                    const page = home?.shorts || { videos: [], nextCursor: null, hasMore: false };
                    this.pass = 'unwatched';
                    this.cursor = page.nextCursor;
                    this.hasMore = Boolean(page.hasMore && page.nextCursor);
                    this.items = [];
                    this.ids.clear();
                    this.clearSlides();
                    this.append(page.videos);
                    this.advancePass();
                    this.prepared = true;
                }
                if (startId && !this.ids.has(startId)) {
                    const known = ns.videos.get(startId) || await ns.api.detail(startId).then(detail => detail.video).catch(() => null);
                    if (sequence !== this.sequence) return;
                    if (known && known.type === 'shorts') this.prepend(known);
                }
                if (this.items.length < LOAD_AHEAD && this.hasMore) await this.loadMore();
                if (!this.items.length && !this.hasMore) this.renderEnd();
            })().finally(() => {
                this.preparing = null;
            });
            await this.preparing;
        },

        visible(videos) {
            return (videos || []).filter(video => video
                && video.type === 'shorts'
                && !this.ids.has(video.id)
                && ns.store.isFollowing(video.channelId)
                && ns.store.isCompleted(video.id) === (this.pass === 'watched'));
        },

        // İzlenmemişlerin sayfaları bitti: liste sona ermeden en baştan izlenmiş shorts istenir.
        advancePass() {
            if (this.hasMore || this.pass !== 'unwatched') return false;
            this.pass = 'watched';
            this.cursor = null;
            this.hasMore = true;
            return true;
        },

        append(videos) {
            // İzlenmemişler aşamasında en yeni shorts hep başta kalmasın diye sayfa içinde karıştırılır.
            const visible = this.visible(videos);
            const fresh = this.pass === 'unwatched' ? ns.mixFresh(visible) : visible;
            if (!fresh.length) return 0;
            this.scroller.querySelector('.videos-short-end')?.remove();
            const template = document.createElement('template');
            const fragment = document.createDocumentFragment();
            fresh.forEach(video => {
                template.innerHTML = slideHtml(video, this.items.length).trim();
                this.items.push(video);
                this.ids.add(video.id);
                const slide = template.content.firstElementChild;
                fragment.appendChild(slide);
                this.observer?.observe(slide);
            });
            this.scroller.appendChild(fragment);
            return fresh.length;
        },

        prepend(video) {
            this.items.unshift(video);
            this.ids.add(video.id);
            const template = document.createElement('template');
            template.innerHTML = slideHtml(video, 0).trim();
            const slide = template.content.firstElementChild;
            this.scroller.prepend(slide);
            this.scroller.querySelectorAll('.videos-short').forEach((element, index) => {
                element.dataset.index = String(index);
            });
            this.observer?.observe(slide);
            if (this.activeIndex >= 0) this.activeIndex += 1;
        },

        async loadMore() {
            if (this.loading || !this.hasMore) return;
            this.loading = true;
            const sequence = this.sequence;
            try {
                let added = 0;
                let pages = 0;
                while (this.hasMore && added < LOAD_AHEAD && pages < MAX_AUTO_PAGES) {
                    const page = await ns.api.feed({
                        type: 'shorts',
                        before: this.cursor,
                        excludeKey: ns.store.excludeKey(),
                        limit: PAGE_SIZE
                    });
                    if (sequence !== this.sequence) return;
                    this.cursor = page.nextCursor;
                    this.hasMore = Boolean(page.hasMore && page.nextCursor);
                    added += this.append(page.videos);
                    pages += 1;
                    this.advancePass();
                }
                if (!this.hasMore) this.renderEnd();
            } catch (error) {
                console.warn('Shorts yüklenemedi:', error);
            } finally {
                this.loading = false;
            }
        },

        renderEnd() {
            if (this.scroller.querySelector('.videos-short-end')) return;
            const message = this.items.length
                ? 'Takip ettiğin kanallardaki shorts\'ların sonuna geldin.'
                : 'Takip ettiğin kanallarda henüz short yok.';
            this.scroller.insertAdjacentHTML('beforeend', `<div class="videos-short-end">
                <i class="fa-solid fa-bolt" aria-hidden="true"></i>
                <p>${message}</p>
                <a class="videos-pill" href="${ns.TAB_PATH}" data-section-link="feed">Videolara göz at</a>
            </div>`);
        },

        // Slaytlar ve mesajlar silinir, oynatıcı katmanı yerinde kalır: iframe DOM'dan sökülüp geri takılırsa
        // yeniden yüklenir ve YouTube oynatıcı nesnesi ona bağlı kalamaz (short açılır ama oynamaz).
        clearSlides() {
            Array.from(this.scroller.children).forEach(child => {
                if (child !== this.layer) child.remove();
            });
            // Eski konumda kalan katman kaydırma alanını uzatmasın; bir sonraki oynatmada yeniden konumlanır.
            Object.assign(this.layer.style, { top: '0px', left: '0px', width: '0px', height: '0px' });
        },

        // Takip listesi değişti: liste bir sonraki açılışta baştan hazırlanır.
        reset() {
            this.sequence += 1;
            this.prepared = false;
            this.pass = 'unwatched';
            this.home = null;
            this.stopPlayback();
            this.activeIndex = -1;
            this.items = [];
            this.ids.clear();
            this.clearSlides();
        },

        async enter(route) {
            // Shorts'tan çıkılıp dönüldüğünde liste baştan hazırlanır: izlenenler (5 sn+) sona kayar.
            if (this.stale) {
                this.stale = false;
                this.reset();
            }
            this.active = true;
            this.userPaused = false;
            ns.tab.setShortsPaused(false);
            this.ensureObserver();
            const loading = !this.prepared;
            if (loading) {
                this.clearSlides();
                this.scroller.insertAdjacentHTML('beforeend', '<div class="videos-short-loading"><div class="videos-loader" aria-label="Shorts yükleniyor"><span></span><span></span><span></span></div></div>');
            }
            await this.prepare(route.videoId);
            if (!this.active) return;
            this.scroller.querySelector('.videos-short-loading')?.remove();
            this.scroller.querySelectorAll('.videos-short').forEach(slide => this.observer.observe(slide));
            const targetIndex = route.videoId ? this.items.findIndex(video => video.id === route.videoId) : -1;
            const index = targetIndex >= 0 ? targetIndex : Math.max(0, this.activeIndex);
            const slide = this.slideAt(index);
            if (slide) {
                this.scroller.scrollTo({ top: slide.offsetTop, behavior: 'auto' });
                this.activeIndex = -1;
                this.setActive(index);
            }
            this.scroller.focus({ preventScroll: true });
        },

        activate() {
            if (!this.active) return;
            if (this.activeIndex >= 0) {
                const index = this.activeIndex;
                this.activeIndex = -1;
                this.setActive(index);
            }
        },

        leave() {
            this.active = false;
            this.stale = this.prepared;
            ns.tab.setShortsPaused(false);
            this.saveProgress();
            this.stopPlayback();
            this.observer?.disconnect();
        },

        ensureObserver() {
            if (this.observer || !('IntersectionObserver' in window)) return;
            this.observer = new IntersectionObserver(entries => {
                if (!this.active) return;
                const visible = entries
                    .filter(entry => entry.isIntersecting && entry.intersectionRatio >= 0.6)
                    .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
                if (visible) this.setActive(Number(visible.target.dataset.index));
            }, { root: this.scroller, threshold: [0.6, 0.9] });
        },

        slideAt(index) {
            return this.scroller.querySelector(`.videos-short[data-index="${index}"]`);
        },

        currentVideo() {
            return this.items[this.activeIndex] || null;
        },

        setActive(index) {
            if (!Number.isInteger(index) || index < 0 || index === this.activeIndex) return;
            const video = this.items[index];
            const slide = this.slideAt(index);
            if (!video || !slide) return;
            this.saveProgress();
            this.scroller.querySelector('.videos-short.is-active')?.classList.remove('is-active', 'is-paused');
            this.activeIndex = index;
            slide.classList.add('is-active');
            this.userPaused = false;
            ns.tab.setShortsPaused(false);
            this.updateUrl(video.id);
            this.preloadAround(index);
            if (index >= this.items.length - LOAD_AHEAD) this.loadMore();
            if (ns.tab.isActive()) this.playActive();
        },

        updateUrl(videoId) {
            if (!ns.tab.isActive() || ns.tab.currentView() !== 'shorts') return;
            const url = ns.shortsUrl(videoId);
            if (`${window.location.pathname}${window.location.search}` === url) return;
            window.history.replaceState(window.history.state, '', url);
        },

        preloadAround(index) {
            if (!ns.connectionAllowsPreparation()) return;
            this.items.slice(index + 1, index + 3).forEach(video => ns.preloadImage(ns.thumbnailUrl(video.id)));
        },

        positionLayer() {
            const slide = this.slideAt(this.activeIndex);
            if (!slide) return;
            const frame = slide.querySelector('.videos-short-frame');
            const width = frame.offsetWidth;
            const height = frame.offsetHeight;
            Object.assign(this.layer.style, {
                top: `${slide.offsetTop + frame.offsetTop}px`,
                left: `${slide.offsetLeft + frame.offsetLeft}px`,
                width: `${width}px`,
                height: `${height}px`
            });
            // Video çerçeveyi tamamen kaplar (taşan kenarlar kırpılır). iframe dikey olursa YouTube kendi
            // Shorts arayüzünü (yan ikonlar, kanal adı, başlık, logo) çizer; bu yüzden iframe yatay (16:9)
            // tutulur: dikey video ortada kalır, YouTube'un öğeleri iki yandaki boşluğa düşer ve çerçeve
            // dışında kırpılır.
            const scale = Math.max(width / 9, height / 16);
            const videoHeight = 16 * scale;
            const frameWidth = videoHeight * (16 / 9);
            Object.assign(this.host.style, {
                left: `${(width - frameWidth) / 2}px`,
                top: `${(height - videoHeight) / 2}px`,
                width: `${frameWidth}px`,
                height: `${videoHeight}px`
            });
        },

        async playActive() {
            const video = this.currentVideo();
            if (!video) return;
            if (this.layer.parentNode !== this.scroller) this.scroller.appendChild(this.layer);
            this.layer.classList.remove('is-playing');
            this.positionLayer();
            this.progressTicks = 0;
            this.setProgress(0);
            try {
                if (!this.playerPromise) {
                    const promise = ns.createPlayer(this.host, {
                        videoId: video.id,
                        muted: this.userMuted || navigator.userActivation?.hasBeenActive === false,
                        controls: false,
                        autoplay: true,
                        loop: true,
                        title: 'Short oynatıcı',
                        onState: state => this.onState(state),
                        onError: code => this.onError(code)
                    });
                    this.playerPromise = promise;
                    let player;
                    try {
                        player = await promise;
                    } catch (error) {
                        if (this.playerPromise === promise) this.playerPromise = null;
                        throw error;
                    }
                    if (this.playerPromise !== promise) {
                        player.destroy();
                        return;
                    }
                    this.player = player;
                    if (player.isFallback) this.layer.classList.add('is-playing');
                    if (!this.active) player.pause();
                    else if (this.currentVideo() && player.videoId() !== this.currentVideo().id) this.playActive();
                    return;
                }
                const player = await this.playerPromise;
                if (!this.active || this.player !== player || this.currentVideo()?.id !== video.id) return;
                player.load(video.id, { start: 0 });
                this.applySound(player);
                if (player.isFallback) this.layer.classList.add('is-playing');
            } catch (error) {
                console.warn('Short oynatılamadı:', error);
            }
        },

        disposePlayer() {
            this.stopProgressTimer();
            const player = this.player;
            this.player = null;
            this.playerPromise = null;
            player?.destroy();
            this.host.replaceChildren();
            this.layer.classList.remove('is-playing');
        },

        onState(state) {
            const video = this.currentVideo();
            if (!this.player || !video || this.player.videoId() !== video.id) return;
            const STATES = ns.PLAYER_STATES;
            const slide = this.slideAt(this.activeIndex);
            if (state === STATES.PLAYING) {
                if (!this.active || this.userPaused) {
                    this.player.pause();
                    return;
                }
                this.layer.classList.add('is-playing');
                slide?.classList.remove('is-paused', 'has-error');
                // Tarayıcı sesli oynatmaya izin vermediyse oynatıcı sessize alınmış olabilir.
                this.muted = this.player.isMuted();
                this.recordStart(video);
                this.startProgressTimer();
            } else if (state === STATES.PAUSED) {
                slide?.classList.toggle('is-paused', this.userPaused);
                this.stopProgressTimer();
                this.saveProgress();
                if (this.userPaused) this.syncProgress();
            }
        },

        onError(code) {
            const slide = this.slideAt(this.activeIndex);
            if (!slide) return;
            slide.classList.add('has-error');
            this.layer.classList.remove('is-playing');
            const frame = slide.querySelector('.videos-short-frame');
            if (!frame.querySelector('.videos-short-error')) {
                const video = this.currentVideo();
                frame.insertAdjacentHTML('beforeend', `<div class="videos-short-error"><p>${ns.escape(ns.playerErrorMessage(code))}</p>${video ? `<a class="videos-pill" href="${ns.escape(ns.youtubeUrl(video))}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-youtube" aria-hidden="true"></i> YouTube'da izle</a>` : ''}</div>`);
            }
        },

        recordStart(video) {
            if (this.recorded.has(video.id)) return;
            this.recorded.add(video.id);
            ns.store.recordProgress(video, this.player.currentTime(), this.player.duration() || video.duration);
        },

        saveProgress() {
            const video = this.currentVideo();
            if (!video || !this.player || this.player.isFallback || !this.recorded.has(video.id)) return;
            if (this.player.videoId() !== video.id) return;
            const position = this.player.currentTime();
            if (position > 0) ns.store.recordProgress(video, position, this.player.duration() || video.duration);
        },

        setProgress(ratio) {
            const slide = this.slideAt(this.activeIndex);
            const bar = slide?.querySelector('.videos-short-progress span');
            const clamped = Math.max(0, Math.min(1, ratio));
            if (bar) bar.style.transform = `scaleX(${clamped})`;
            const thumb = slide?.querySelector('.videos-short-seek-thumb');
            if (thumb) thumb.style.left = `${clamped * 100}%`;
            slide?.querySelector('.videos-short-seek')?.setAttribute('aria-valuenow', String(Math.round(clamped * 100)));
        },

        syncProgress() {
            const duration = this.player?.duration();
            if (duration) this.setProgress(this.player.currentTime() / duration);
        },

        // Durdurulmuş short'ta çubuk (kırmızı daire) sürüklenerek ileri geri sarılır; ← / → tuşları ±5 sn.
        seekToRatio(ratio) {
            const duration = this.player?.duration();
            if (!duration || this.player.isFallback) return;
            const clamped = Math.min(1, Math.max(0, ratio));
            this.player.seek(clamped * duration);
            this.setProgress(clamped);
        },

        seekBy(seconds) {
            const duration = this.player?.duration();
            if (duration) this.seekToRatio((this.player.currentTime() + seconds) / duration);
        },

        bindSeek() {
            const ratioFromEvent = (bar, event) => {
                const rect = bar.getBoundingClientRect();
                return rect.width ? Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) : 0;
            };
            let lastLiveSeek = 0;
            this.scroller.addEventListener('pointerdown', event => {
                const bar = event.target.closest('.videos-short-seek');
                if (!bar || !this.userPaused || !this.player) return;
                event.preventDefault();
                bar.setPointerCapture(event.pointerId);
                this.scrubbing = true;
                bar.classList.add('is-scrubbing');
                this.seekToRatio(ratioFromEvent(bar, event));
            });
            this.scroller.addEventListener('pointermove', event => {
                const bar = event.target.closest('.videos-short-seek');
                if (!this.scrubbing || !bar) return;
                const ratio = ratioFromEvent(bar, event);
                this.setProgress(ratio);
                // Sürüklerken kare de güncellensin; her harekette değil, kısa aralıklarla aranır.
                const now = performance.now();
                if (now - lastLiveSeek > 120) {
                    lastLiveSeek = now;
                    this.seekToRatio(ratio);
                }
            });
            const finish = event => {
                const bar = event.target.closest('.videos-short-seek');
                if (!this.scrubbing || !bar) return;
                this.scrubbing = false;
                bar.classList.remove('is-scrubbing');
                if (event.type === 'pointerup') this.seekToRatio(ratioFromEvent(bar, event));
            };
            this.scroller.addEventListener('pointerup', finish);
            this.scroller.addEventListener('pointercancel', finish);
            this.scroller.addEventListener('click', event => {
                if (event.target.closest('.videos-short-seek')) event.stopPropagation();
            });
        },

        startProgressTimer() {
            this.stopProgressTimer();
            this.progressTimer = window.setInterval(() => {
                if (!this.player || this.player.isFallback) return;
                const duration = this.player.duration();
                if (duration) this.setProgress(this.player.currentTime() / duration);
                this.progressTicks += 1;
                // Kaydetme normalde birkaç saniyede bir yapılır; 5. saniyeye ulaşılınca hemen "izlendi" işlenir.
                const reachedWatched = this.player.currentTime() >= ns.store.WATCHED_SECONDS && !ns.store.isCompleted(this.player.videoId());
                if (reachedWatched || this.progressTicks % PROGRESS_SAVE_EVERY === 0) this.saveProgress();
            }, PROGRESS_TICK_MS);
        },

        stopProgressTimer() {
            window.clearInterval(this.progressTimer);
            this.progressTimer = null;
        },

        stopPlayback() {
            this.stopProgressTimer();
            this.layer.classList.remove('is-playing');
            try {
                this.player?.pause();
            } catch (_error) {
                // Oynatıcı henüz hazır değil.
            }
        },

        pause() {
            this.stopProgressTimer();
            this.saveProgress();
            try {
                this.player?.pause();
            } catch (_error) {
                // Oynatıcı henüz hazır değil.
            }
        },

        play() {
            if (!this.player) {
                this.playActive();
                return;
            }
            if (this.player.videoId() !== this.currentVideo()?.id) {
                this.playActive();
                return;
            }
            this.player.play();
        },

        togglePlay() {
            const slide = this.slideAt(this.activeIndex);
            if (!slide) return;
            this.userPaused = !this.userPaused;
            slide.classList.toggle('is-paused', this.userPaused);
            // Shorts tam ekrandır; bölüm sekmeleri yalnız kullanıcı duraklatınca görünür.
            ns.tab.setShortsPaused(this.userPaused);
            if (this.userPaused) this.pause();
            else this.play();
        },

        // Kullanıcı sesi kapatmadıysa ses açık kalır; tarayıcı etkileşimsiz sesli oynatmayı engellemişse
        // video sessiz başlar ve ilk dokunuş (tap) sesi açar.
        applySound(player) {
            const soundAllowed = navigator.userActivation?.hasBeenActive !== false;
            if (this.userMuted || !soundAllowed) {
                player.mute();
                this.muted = true;
            } else {
                player.unMute();
                this.muted = false;
            }
            ns.tab.syncShortsSound();
        },

        // Videoya dokunma: sessiz başladıysa önce sesi açar, sonra oynat/duraklat işlevi görür.
        tap() {
            if (this.muted) this.toggleSound();
            else this.togglePlay();
        },

        // Dokunuş kullanıcı etkileşimi olduğundan tarayıcı sesli oynatmaya izin verir ('m' tuşu da sesi kapatır).
        toggleSound() {
            this.muted = !this.muted;
            this.userMuted = this.muted;
            if (this.player) {
                if (this.muted) this.player.mute();
                else {
                    this.player.unMute();
                    if (this.userPaused) this.togglePlay();
                    else this.player.play();
                }
            }
            ns.tab.syncShortsSound();
        },

        // Duraklatılmış videodaki ses düğmesi: videoyu yeniden başlatmadan yalnız sesi açar/kapatır.
        toggleMute() {
            this.muted = !this.muted;
            this.userMuted = this.muted;
            if (this.player) {
                if (this.muted) this.player.mute();
                else this.player.unMute();
            }
            ns.tab.syncShortsSound();
        },

        step(direction) {
            const slide = this.slideAt(this.activeIndex + direction);
            if (slide) this.scroller.scrollTo({ top: slide.offsetTop, behavior: ns.prefersReducedMotion() ? 'auto' : 'smooth' });
        },

        onKeydown(event) {
            if (!this.active || !ns.tab.isActive() || event.defaultPrevented) return;
            if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
            if (event.key === 'ArrowDown' || event.key === 'j') {
                event.preventDefault();
                this.step(1);
            } else if (event.key === 'ArrowUp' || event.key === 'k') {
                event.preventDefault();
                this.step(-1);
            } else if (event.key === ' ' && !event.target.closest('button, a')) {
                event.preventDefault();
                this.togglePlay();
            } else if (event.key === 'm') {
                this.toggleSound();
            } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault();
                this.seekBy(event.key === 'ArrowRight' ? 5 : -5);
            }
        },

        firstPosters(count) {
            return ns.unwatchedFirst(this.home?.shorts?.videos || [])
                .slice(0, count)
                .map(video => ns.thumbnailUrl(video.id));
        }
    };

    ns.shorts = shorts;
})();
