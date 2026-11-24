// ==================== Videolar: izleme sayfası ====================
// /videolar?izle=<videoId>. Akıştan açılan video, eldeki bilgilerle beklemeden çizilir; "Sıradaki"
// listesi (önce aynı kanal, sonra en yeniler) sunucudan gelir. İzleme ilerlemesi cihazda saklanır
// ve yarım kalan video kaldığı yerden devam eder. Otomatik oynatma açıksa video bitince oynatıcının
// üstünde geri sayım çıkar ve süre dolunca "Sıradaki" listesindeki ilk uygun video açılır.

(function () {
    const ns = window.RoTaKipVideos;
    const PROGRESS_TICK_MS = 1000;
    const PROGRESS_SAVE_EVERY = 5;
    const AUTONEXT_SECONDS = 5;
    // "Sıradaki" listesi aşağı inildikçe uzar: sunucudaki en yeni videolardan sayfa sayfa eklenir.
    const MORE_PAGE_SIZE = 24;
    const MORE_MIN_PER_LOAD = 6;
    const MORE_MAX_PAGES = 4;

    // YouTube'daki "Sıradaki video N içinde oynatılacak" katmanı.
    function autonextHtml(video, seconds) {
        const title = ns.escape(video.title);
        return `<div class="videos-autonext-inner">
            <div class="videos-autonext-head">
                <p class="videos-autonext-text">Sıradaki video <strong class="videos-autonext-count">${seconds}</strong> içinde oynatılacak</p>
                <button type="button" class="videos-autonext-close" data-action="autonext-cancel" aria-label="Otomatik oynatmayı iptal et"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
            </div>
            <button type="button" class="videos-autonext-video" data-action="autonext-play" aria-label="Şimdi oynat: ${title}">
                <span class="videos-autonext-thumb">
                    <img src="${ns.escape(ns.thumbnailUrl(video.id, 'mqdefault'))}" alt="" decoding="async" referrerpolicy="no-referrer">
                    ${ns.durationBadgeHtml(video)}
                </span>
                <span class="videos-autonext-info">
                    <span class="videos-autonext-title">${title}</span>
                    <span class="videos-autonext-channel">${ns.escape(video.channelName)}</span>
                </span>
            </button>
            <div class="videos-autonext-actions">
                <button type="button" class="videos-autonext-cancel" data-action="autonext-cancel">İptal</button>
                <button type="button" class="videos-autonext-play" data-action="autonext-play">Şimdi oynat</button>
            </div>
        </div>`;
    }

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
        stage: null,
        autoplayButton: null,
        relatedVideos: [],
        // Gösterilen geri sayım: { element, timer, video }.
        autonext: null,
        relatedStatus: null,
        relatedSentinel: null,
        relatedObserver: null,
        relatedIds: new Set(),
        moreCursor: null,
        moreHasMore: false,
        moreLoading: false,

        init(page) {
            this.relatedStatus = page.querySelector('#videosWatchRelatedStatus');
            this.relatedSentinel = page.querySelector('#videosWatchRelatedSentinel');
            this.root = page.querySelector('[data-view="watch"]');
            this.stage = page.querySelector('.videos-watch-stage');
            this.autoplayButton = page.querySelector('[data-action="autoplay-toggle"]');
            this.syncAutoplayButton();
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
            this.hideAutonext();
            if (sameVideo && this.video) {
                this.renderInfo(this.video);
                this.observeRelated();
                if (ns.tab.isActive()) this.ensurePlayer(start);
                return;
            }
            this.leavePlayback();
            const sequence = ++this.sequence;
            this.videoId = route.videoId;
            this.recordedThisView = false;
            this.resetRelated();
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
            this.hideAutonext();
            this.relatedObserver?.disconnect();
            this.leavePlayback();
        },

        // ---------- Otomatik oynatma ----------

        toggleAutoplay() {
            const enabled = !ns.store.isAutoplay();
            ns.store.setAutoplay(enabled);
            this.syncAutoplayButton();
            if (!enabled) this.hideAutonext();
            ns.toast(enabled ? 'Otomatik oynatma açık' : 'Otomatik oynatma kapalı');
        },

        // Açıkken düğme sağda ve oynat simgeli, kapalıyken solda ve duraklat simgeli (simgeler CSS ile değişir).
        syncAutoplayButton() {
            const button = this.autoplayButton;
            if (!button) return;
            const enabled = ns.store.isAutoplay();
            button.classList.toggle('is-on', enabled);
            button.setAttribute('aria-checked', enabled ? 'true' : 'false');
        },

        // Sıradaki: "Sıradaki" listesinden Shorts ve canlı yayın olmayan ilk video (izlenmemişler önce).
        nextVideo() {
            const candidates = this.relatedVideos.filter(video => video
                && video.type !== 'shorts'
                && video.id !== this.videoId
                && !video.isLive
                && video.duration);
            return ns.unwatchedFirst(candidates)[0] || null;
        },

        // Video bittiğinde (yalnız izleme sayfası açıkken; mini oynatıcıda değil) geri sayım başlar.
        showAutonext() {
            this.hideAutonext();
            if (!ns.store.isAutoplay() || !this.active || !ns.tab.isActive()) return;
            if (ns.tab.currentView() !== 'watch' || ns.tab.isMiniActive()) return;
            const video = this.nextVideo();
            if (!video || !this.stage) return;
            const element = document.createElement('div');
            element.className = 'videos-autonext';
            element.setAttribute('role', 'dialog');
            element.setAttribute('aria-label', 'Sıradaki video');
            element.innerHTML = autonextHtml(video, AUTONEXT_SECONDS);
            this.stage.appendChild(element);
            let remaining = AUTONEXT_SECONDS;
            const timer = window.setInterval(() => {
                remaining -= 1;
                if (remaining <= 0) {
                    this.playNext();
                    return;
                }
                const count = element.querySelector('.videos-autonext-count');
                if (count) count.textContent = String(remaining);
            }, 1000);
            this.autonext = { element, timer, video };
        },

        hideAutonext() {
            if (!this.autonext) return;
            window.clearInterval(this.autonext.timer);
            this.autonext.element.remove();
            this.autonext = null;
        },

        playNext() {
            const video = this.autonext?.video;
            this.hideAutonext();
            if (video) ns.tab.navigateTo({ view: 'watch', videoId: video.id });
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
            this.hideAutonext();
            this.relatedObserver?.disconnect();
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
            this.meta.innerHTML = `<button type="button" class="videos-watch-meta-channel" data-channel-filter="${ns.escape(video.channelId)}">${ns.escape(ns.channelHandleLabel(video.channelId, video.channelName))}</button>
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
            const list = this.visibleRelated(videos);
            this.relatedVideos = list;
            list.forEach(video => this.relatedIds.add(video.id));
            this.related.innerHTML = list.length
                ? list.map(relatedItemHtml).join('')
                : '<p class="videos-muted">Şimdilik başka video yok.</p>';
            // Ayrıntıdaki ilk liste kısadır; aşağı inildikçe en yeni videolardan devamı eklenir.
            this.moreHasMore = true;
            this.observeRelated();
        },

        visibleRelated(videos) {
            return (videos || []).filter(video => video
                && video.id !== this.videoId
                && !this.relatedIds.has(video.id)
                && (ns.store.isFollowing(video.channelId) || video.channelId === this.video?.channelId));
        },

        resetRelated() {
            this.relatedVideos = [];
            this.relatedIds = new Set();
            this.moreCursor = null;
            this.moreHasMore = false;
            this.moreLoading = false;
            this.relatedObserver?.disconnect();
            this.setRelatedStatus('');
        },

        setRelatedStatus(html) {
            if (!this.relatedStatus) return;
            this.relatedStatus.innerHTML = html;
            this.relatedStatus.hidden = !html;
        },

        // Liste sonundaki gözcü ekrana yaklaşınca yeni öneriler yüklenir.
        observeRelated() {
            if (!this.active || !this.moreHasMore || !this.relatedSentinel || !('IntersectionObserver' in window)) return;
            if (!this.relatedObserver) {
                this.relatedObserver = new IntersectionObserver(entries => {
                    if (entries.some(entry => entry.isIntersecting)) this.loadMoreRelated();
                }, { rootMargin: '500px 0px' });
            }
            this.relatedObserver.disconnect();
            this.relatedObserver.observe(this.relatedSentinel);
        },

        async loadMoreRelated() {
            if (this.moreLoading || !this.moreHasMore || !this.video) return;
            const sequence = this.sequence;
            this.moreLoading = true;
            this.setRelatedStatus('<div class="videos-loader is-compact" aria-label="Yeni öneriler yükleniyor"><span></span><span></span><span></span></div>');
            try {
                let added = 0;
                let pages = 0;
                while (this.moreHasMore && added < MORE_MIN_PER_LOAD && pages < MORE_MAX_PAGES) {
                    const page = await ns.api.feed({
                        type: this.video.type === 'shorts' ? 'shorts' : 'video',
                        before: this.moreCursor,
                        excludeKey: ns.store.excludeKey(),
                        limit: MORE_PAGE_SIZE
                    });
                    if (sequence !== this.sequence) return;
                    this.moreCursor = page.nextCursor;
                    this.moreHasMore = Boolean(page.hasMore && page.nextCursor);
                    added += this.appendRelated(page.videos);
                    pages += 1;
                }
            } catch (error) {
                if (sequence !== this.sequence) return;
                console.warn('Yeni öneriler yüklenemedi:', error);
                this.moreHasMore = false;
            } finally {
                if (sequence === this.sequence) {
                    this.moreLoading = false;
                    this.setRelatedStatus('');
                    // Gözcü hâlâ ekrana yakınsa (kısa liste) bir sonraki sayfa için yeniden izlenir.
                    this.observeRelated();
                }
            }
        },

        appendRelated(videos) {
            const fresh = ns.mixFresh(this.visibleRelated(videos));
            if (!fresh.length) return 0;
            // Liste boşken görünen "Şimdilik başka video yok" notu ilk eklemede kalkar.
            this.related.querySelector('.videos-muted')?.remove();
            fresh.forEach(video => this.relatedIds.add(video.id));
            this.relatedVideos.push(...fresh);
            this.related.insertAdjacentHTML('beforeend', fresh.map(relatedItemHtml).join(''));
            return fresh.length;
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
            this.hideAutonext();
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
                // Kullanıcı videoyu yeniden başlattı / geri sardı: geri sayım iptal edilir.
                this.hideAutonext();
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
                this.showAutonext();
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
