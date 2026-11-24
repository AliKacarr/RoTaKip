// ==================== Videolar: izleme sayfası ====================
// /videolar?izle=<videoId>. Akıştan açılan video, eldeki bilgilerle beklemeden çizilir; "Sıradaki"
// listesi (önce aynı kanal, sonra en yeniler) sunucudan gelir. İzleme ilerlemesi cihazda saklanır
// ve yarım kalan video kaldığı yerden devam eder.

(function () {
    const ns = window.RoTaKipVideos;
    const PROGRESS_TICK_MS = 1000;
    const PROGRESS_SAVE_EVERY = 5;

    function relatedItemHtml(video) {
        const id = ns.escape(video.id);
        const href = ns.escape(ns.itemUrl(video));
        const openAttribute = video.type === 'shorts' ? `data-open-short="${id}"` : `data-open-video="${id}"`;
        return `<a class="videos-row" href="${href}" ${openAttribute}>
            <span class="videos-row-thumb${video.type === 'shorts' ? ' is-short' : ''}">
                <img src="${ns.escape(ns.thumbnailUrl(video.id, 'mqdefault'))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
                ${video.type === 'shorts' ? '<span class="videos-badge"><i class="fa-solid fa-bolt" aria-hidden="true"></i></span>' : ns.durationBadgeHtml(video)}
                ${ns.progressHtml(video.id)}
            </span>
            <span class="videos-row-text">
                <span class="videos-row-title">${ns.escape(video.title)}</span>
                <span class="videos-row-meta">${ns.escape(video.channelName)}</span>
                <span class="videos-row-meta">${ns.escape(ns.formatMeta(video))}</span>
            </span>
        </a>`;
    }
    ns.relatedItemHtml = relatedItemHtml;

    const watch = {
        root: null,
        playerHost: null,
        message: null,
        title: null,
        meta: null,
        channel: null,
        actions: null,
        related: null,
        player: null,
        playerPromise: null,
        video: null,
        videoId: '',
        sequence: 0,
        progressTimer: null,
        recordedThisView: false,
        active: false,

        init(page) {
            this.root = page.querySelector('[data-view="watch"]');
            this.playerHost = page.querySelector('#videosWatchPlayer');
            this.message = page.querySelector('#videosWatchMessage');
            this.title = page.querySelector('#videosWatchTitle');
            this.meta = page.querySelector('#videosWatchMeta');
            this.channel = page.querySelector('#videosWatchChannel');
            this.actions = page.querySelector('#videosWatchActions');
            this.related = page.querySelector('#videosWatchRelated');
        },

        enter(route, { start = 0 } = {}) {
            this.active = true;
            const sameVideo = route.videoId === this.videoId;
            if (sameVideo && this.video) {
                this.renderInfo(this.video);
                if (ns.tab.isActive()) this.ensurePlayer(start);
                return;
            }
            this.leavePlayback();
            const sequence = ++this.sequence;
            this.videoId = route.videoId;
            this.recordedThisView = false;
            this.hideMessage();
            const known = ns.videos.get(route.videoId) || ns.store.historyEntry(route.videoId);
            this.video = known || null;
            if (known) this.renderInfo(known);
            else this.renderSkeleton();
            this.related.innerHTML = '<div class="videos-loader is-compact" aria-label="Sıradaki videolar yükleniyor"><span></span><span></span><span></span></div>';
            if (ns.tab.isActive()) this.ensurePlayer(start);

            ns.api.detail(route.videoId).then(detail => {
                if (sequence !== this.sequence) return;
                this.video = detail.video;
                this.renderInfo(detail.video);
                this.renderRelated(detail.related);
            }).catch(error => {
                if (sequence !== this.sequence) return;
                if (error.status === 404 || error.status === 400) {
                    if (!known) this.showNotFound();
                    this.related.innerHTML = '';
                    return;
                }
                console.warn('Video ayrıntısı yüklenemedi:', error);
                this.related.innerHTML = '<p class="videos-muted">Sıradaki videolar yüklenemedi.</p>';
            });
        },

        // Kabuk sekmeyi ilk kez gösterdiğinde (önceden ısıtılmış görünüm) oynatıcı başlatılır.
        activate() {
            if (this.active && this.videoId) this.ensurePlayer(0);
        },

        leave() {
            this.active = false;
            this.leavePlayback();
        },

        // ---------- Mini oynatıcı ----------
        // Akışa / kitaplığa dönüldüğünde oynayan (ya da duraklatılmış) video sağ altta küçük
        // oynatıcıda sürer. Oynatıcı taşınmaz (iframe yeniden yüklenirdi); sahnenin konumu CSS ile değişir.
        canMinimize() {
            if (!this.player || !this.videoId || !this.video) return false;
            const state = this.player.state();
            return this.player.isFallback || [ns.PLAYER_STATES.PLAYING, ns.PLAYER_STATES.PAUSED, ns.PLAYER_STATES.BUFFERING].includes(state);
        },

        togglePlay() {
            if (!this.player) return;
            if (this.player.state() === ns.PLAYER_STATES.PLAYING) this.player.pause();
            else this.player.play();
        },

        syncMiniToggle(state) {
            const button = this.root.querySelector('.videos-mini-toggle');
            if (!button) return;
            const playing = state === ns.PLAYER_STATES.PLAYING || state === ns.PLAYER_STATES.BUFFERING;
            button.setAttribute('aria-label', playing ? 'Duraklat' : 'Oynat');
            button.querySelector('i').className = playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';
        },

        // Sekmeden çıkılınca görünüm DOM'dan kalkar (iframe zaten durur); yalnız sayaçlar bırakılır.
        suspend() {
            this.active = false;
            this.stopProgressTimer();
        },

        leavePlayback() {
            this.saveProgress();
            this.stopProgressTimer();
            try {
                this.player?.pause();
            } catch (_error) {
                // Oynatıcı henüz hazır değil.
            }
        },

        renderSkeleton() {
            this.title.textContent = '';
            this.title.classList.add('is-skeleton');
            this.meta.textContent = '';
            this.channel.innerHTML = '';
            this.actions.innerHTML = '';
        },

        // YouTube mobil izleme sayfasına benzer (açık tema): başlık; "Kanal  49 Mn görüntüleme  3 gün önce"
        // satırı; solda kanal avatarı + takip düğmesi, sağda yalnız simgeli eylemler.
        renderInfo(video) {
            if (!video) return;
            this.title.classList.remove('is-skeleton');
            this.title.textContent = video.title;
            const date = ns.formatRelativeDate(video.publishedAt);
            this.meta.innerHTML = `<button type="button" class="videos-watch-meta-channel" data-channel-filter="${ns.escape(video.channelId)}">${ns.escape(video.channelName)}</button>
                <span>${ns.escape(ns.formatViews(video.views))}</span>
                ${date ? `<span>${ns.escape(date)}</span>` : ''}`;
            const following = ns.store.isFollowing(video.channelId);
            const followButton = following
                ? `<button type="button" class="videos-follow is-following" data-action="follow" data-channel-id="${ns.escape(video.channelId)}" aria-pressed="true" aria-label="${ns.escape(video.channelName)} takip ediliyor; takipten çıkmak için dokunun"><i class="fa-regular fa-bell" aria-hidden="true"></i><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button>`
                : `<button type="button" class="videos-follow" data-action="follow" data-channel-id="${ns.escape(video.channelId)}" aria-pressed="false">Takip et</button>`;
            this.channel.innerHTML = `<button type="button" class="videos-watch-avatar" data-channel-filter="${ns.escape(video.channelId)}" aria-label="${ns.escape(video.channelName)} kanalının videoları">
                    ${ns.avatarHtml(video.channelId, video.channelName, 'videos-avatar-md')}
                </button>
                ${followButton}`;
            this.actions.innerHTML = [
                ns.iconButtonHtml({ action: 'like', ...ns.LIKE_ICONS, label: 'Beğen', active: ns.store.isLiked(video.id), videoId: video.id }),
                ns.iconButtonHtml({ action: 'save', ...ns.SAVE_ICONS, label: 'Kaydet', active: ns.store.isSaved(video.id), videoId: video.id }),
                ns.iconButtonHtml({ action: 'share', icon: 'fa-solid fa-share', label: 'Paylaş', videoId: video.id }),
                ns.iconButtonHtml({ action: 'menu', icon: 'fa-solid fa-ellipsis', label: 'Diğer seçenekler', videoId: video.id })
            ].join('');
        },

        renderRelated(videos) {
            const list = (videos || []).filter(video => ns.store.isFollowing(video.channelId) || video.channelId === this.video?.channelId);
            this.related.innerHTML = list.length
                ? list.map(relatedItemHtml).join('')
                : '<p class="videos-muted">Şimdilik başka video yok.</p>';
        },

        refreshState() {
            if (this.video) this.renderInfo(this.video);
        },

        showNotFound() {
            this.title.classList.remove('is-skeleton');
            this.title.textContent = 'Video bulunamadı';
            this.meta.textContent = 'Video kaldırılmış ya da bağlantı hatalı olabilir.';
            this.channel.innerHTML = `<a class="videos-pill" href="${ns.TAB_PATH}" data-section-link="feed">Videolara dön</a>`;
            this.actions.innerHTML = '';
            this.showMessage('Bu video bulunamadı.');
            this.leavePlayback();
        },

        showMessage(text, video = null) {
            this.message.innerHTML = `<p>${ns.escape(text)}</p>${video ? `<a class="videos-pill" href="${ns.escape(ns.youtubeUrl(video))}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-youtube" aria-hidden="true"></i> YouTube'da izle</a>` : ''}`;
            this.message.hidden = false;
        },

        hideMessage() {
            this.message.hidden = true;
            this.message.innerHTML = '';
        },

        async ensurePlayer(start = 0) {
            const videoId = this.videoId;
            if (!videoId) return;
            const resumeAt = start || ns.store.resumePosition(videoId);
            if (!this.playerPromise) {
                const promise = ns.createPlayer(this.playerHost, {
                    videoId,
                    autoplay: true,
                    controls: true,
                    start: resumeAt,
                    title: 'Video oynatıcı',
                    onState: state => this.onState(state),
                    onError: code => this.onError(code)
                });
                this.playerPromise = promise;
                try {
                    const player = await promise;
                    // Beklerken sekmeden çıkıldıysa (oynatıcılar atıldıysa) bu oynatıcı da kaldırılır.
                    if (this.playerPromise !== promise) {
                        player.destroy();
                        return;
                    }
                    this.player = player;
                    if (!this.active) player.pause();
                    else if (player.videoId() !== this.videoId) player.load(this.videoId, { start: ns.store.resumePosition(this.videoId) });
                    else if (player.isFallback) this.recordStart();
                } catch (error) {
                    if (this.playerPromise === promise) this.playerPromise = null;
                    console.warn('Oynatıcı açılamadı:', error);
                    this.showMessage('Oynatıcı açılamadı.', this.video);
                }
                return;
            }
            const player = await this.playerPromise.catch(() => null);
            if (!player || this.player !== player || this.videoId !== videoId || !this.active) return;
            if (player.videoId() !== videoId) {
                player.load(videoId, { start: resumeAt });
                if (player.isFallback) this.recordStart();
            } else if (player.state() !== ns.PLAYER_STATES.PLAYING) {
                player.play();
            }
        },

        // Sekmeden çıkılınca görünüm DOM'dan kaldırılır ve iframe kopar; dönüşte yeniden oluşturulur.
        disposePlayer() {
            this.stopProgressTimer();
            const player = this.player;
            this.player = null;
            this.playerPromise = null;
            this.recordedThisView = false;
            player?.destroy();
            this.playerHost.replaceChildren();
        },

        onState(state) {
            if (!this.player || this.player.videoId() !== this.videoId) return;
            const STATES = ns.PLAYER_STATES;
            this.syncMiniToggle(state);
            if (state === STATES.PLAYING) {
                this.hideMessage();
                if (!this.active) {
                    this.player.pause();
                    return;
                }
                this.recordStart();
                this.startProgressTimer();
            } else if (state === STATES.PAUSED || state === STATES.BUFFERING) {
                this.saveProgress();
                if (state === STATES.PAUSED) this.stopProgressTimer();
            } else if (state === STATES.ENDED) {
                this.stopProgressTimer();
                if (this.video) ns.store.markCompleted(this.video);
            }
        },

        onError(code) {
            this.stopProgressTimer();
            this.showMessage(ns.playerErrorMessage(code), this.video || { id: this.videoId, type: 'video' });
        },

        // Oynatma başlayınca video geçmişe eklenir.
        recordStart() {
            if (this.recordedThisView || !this.video) return;
            this.recordedThisView = true;
            const position = this.player && !this.player.isFallback ? this.player.currentTime() : 0;
            ns.store.recordProgress(this.video, position, this.player?.duration() || this.video.duration);
        },

        saveProgress() {
            if (!this.player || this.player.isFallback || !this.video || !this.recordedThisView) return;
            if (this.player.videoId() !== this.video.id) return;
            const position = this.player.currentTime();
            if (position > 0) ns.store.recordProgress(this.video, position, this.player.duration() || this.video.duration);
        },

        startProgressTimer() {
            this.stopProgressTimer();
            let ticks = 0;
            this.progressTimer = window.setInterval(() => {
                ticks += 1;
                // Kaydetme birkaç saniyede bir yapılır; 5. saniyeye ulaşılınca hemen "izlendi" işlenir.
                const reachedWatched = Boolean(this.player && !this.player.isFallback && this.video)
                    && this.player.currentTime() >= ns.store.WATCHED_SECONDS && !ns.store.isCompleted(this.video.id);
                if (reachedWatched || ticks % PROGRESS_SAVE_EVERY === 0) this.saveProgress();
            }, PROGRESS_TICK_MS);
        },

        stopProgressTimer() {
            window.clearInterval(this.progressTimer);
            this.progressTimer = null;
        }
    };

    ns.watch = watch;
})();
