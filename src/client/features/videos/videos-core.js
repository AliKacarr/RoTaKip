// ==================== Videolar: ortak çekirdek ====================
// Videolar sekmesi üç bölümden oluşur: önizlemeli video akışı, dikey Shorts akışı ve cihazda
// saklanan Hesabım. Bu dosya bölümlerin paylaştığı ad alanını (window.RoTaKipVideos),
// biçimlendiricileri, kart parçalarını ve API istemcisini tanımlar.

(function () {
    const ns = window.RoTaKipVideos = window.RoTaKipVideos || {};

    ns.TAB_PATH = '/videolar';
    ns.HISTORY_MARKER = 'rotakipVideos';

    // ---------- Ortam ----------

    ns.prefersReducedMotion = function prefersReducedMotion() {
        return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    };

    ns.connectionAllowsPreparation = function connectionAllowsPreparation() {
        const connection = navigator.connection;
        if (!connection) return true;
        return !connection.saveData && !['slow-2g', '2g'].includes(connection.effectiveType);
    };

    ns.isTouchDevice = function isTouchDevice() {
        return Boolean(window.matchMedia && window.matchMedia('(hover: none)').matches);
    };

    ns.idle = function idle(callback, timeout = 2000) {
        if ('requestIdleCallback' in window) window.requestIdleCallback(callback, { timeout });
        else window.setTimeout(callback, 600);
    };

    // ---------- Biçimlendirme ----------

    ns.escape = function escape(value) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(value);
        return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;'
        })[character]);
    };

    const compactNumber = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 });
    const relativeTime = new Intl.RelativeTimeFormat('tr', { numeric: 'always' });
    const RELATIVE_UNITS = [
        ['year', 365 * 24 * 3600],
        ['month', 30 * 24 * 3600],
        ['week', 7 * 24 * 3600],
        ['day', 24 * 3600],
        ['hour', 3600],
        ['minute', 60]
    ];

    ns.formatViews = function formatViews(views) {
        const value = Number(views) || 0;
        return `${compactNumber.format(value)} görüntüleme`;
    };

    // Kart alt satırı için kısa biçim: yalnızca sayı ("466 B", "1,2 Mn").
    ns.formatViewsCompact = function formatViewsCompact(views) {
        return compactNumber.format(Number(views) || 0);
    };

    ns.formatRelativeDate = function formatRelativeDate(isoDate) {
        const time = Date.parse(isoDate || '');
        if (!Number.isFinite(time)) return '';
        const seconds = Math.round((time - Date.now()) / 1000);
        for (const [unit, size] of RELATIVE_UNITS) {
            if (Math.abs(seconds) >= size) return relativeTime.format(Math.round(seconds / size), unit);
        }
        return 'az önce';
    };

    ns.formatDuration = function formatDuration(totalSeconds) {
        const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const rest = String(seconds % 60).padStart(2, '0');
        return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
    };

    ns.formatMeta = function formatMeta(video) {
        return [ns.formatViews(video.views), ns.formatRelativeDate(video.publishedAt)].filter(Boolean).join(' · ');
    };

    // ---------- Adresler ----------

    const VIDEO_ID_PATTERN = /^[\w-]{11}$/;
    ns.isVideoId = value => typeof value === 'string' && VIDEO_ID_PATTERN.test(value);

    ns.thumbnailUrl = function thumbnailUrl(videoId, quality = 'hqdefault') {
        return ns.isVideoId(videoId) ? `https://i.ytimg.com/vi/${videoId}/${quality}.jpg` : '';
    };

    ns.watchUrl = videoId => `${ns.TAB_PATH}?izle=${encodeURIComponent(videoId)}`;
    ns.shortsUrl = videoId => `${ns.TAB_PATH}?bolum=shorts${videoId ? `&v=${encodeURIComponent(videoId)}` : ''}`;
    ns.itemUrl = video => (video.type === 'shorts' ? ns.shortsUrl(video.id) : ns.watchUrl(video.id));
    ns.youtubeUrl = video => (video.type === 'shorts'
        ? `https://www.youtube.com/shorts/${encodeURIComponent(video.id)}`
        : `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`);

    // Kanal logoları yalnızca YouTube'un görsel sunucularından kabul edilir.
    ns.safeLogoUrl = function safeLogoUrl(value) {
        if (typeof value !== 'string' || !value) return '';
        try {
            const url = new URL(value);
            const host = url.hostname.toLowerCase();
            const allowed = url.protocol === 'https:'
                && (host.endsWith('.ggpht.com') || host.endsWith('.googleusercontent.com') || host.endsWith('.ytimg.com'));
            return allowed ? url.href : '';
        } catch (_error) {
            return '';
        }
    };

    // ---------- Video verisi ----------

    // Tüm listelerden gelen videolar kimliğe göre tutulur; izleme sayfası akıştan açılınca beklemeden çizilir.
    ns.videos = new Map();
    ns.channels = new Map();

    ns.rememberVideos = function rememberVideos(videos) {
        (videos || []).forEach(video => {
            if (video && ns.isVideoId(video.id)) ns.videos.set(video.id, video);
        });
        return videos || [];
    };

    // Listeler önce izlenmemişleri, sonra izlenmişleri (kendi sıralarını koruyarak) gösterir.
    ns.unwatchedFirst = function unwatchedFirst(videos) {
        const list = (videos || []).filter(Boolean);
        return [
            ...list.filter(video => !ns.store?.isCompleted(video.id)),
            ...list.filter(video => ns.store?.isCompleted(video.id))
        ];
    };

    // Listeler en yeniden eskiye gelir; izlenmemiş olduğu için en yeni videolar hep en üstte kalmasın diye
    // bir sayfadaki en yeni üçte biri ("taze") kalan eskilerle karıştırılır: sıralamanın yaklaşık %40'ı
    // taze videolardır. Tazeler ve eskiler kendi içlerinde rastgele sıralanır; böylece her hazırlıkta
    // (sayfa açılışı, bölümler arası dönüş) sıra değişir. Üst sıra taze değil eski bir videoyla başlar
    // (örüntü: eski, taze, eski, taze, eski, eski, taze, ...).
    const FRESH_MIX_RATIO = 0.4;
    const FRESH_MIX_BUCKET = 1 / 3;
    const FRESH_MIX_MIN_ITEMS = 4;

    function shuffled(items) {
        const copy = items.slice();
        for (let index = copy.length - 1; index > 0; index -= 1) {
            const swap = Math.floor(Math.random() * (index + 1));
            [copy[index], copy[swap]] = [copy[swap], copy[index]];
        }
        return copy;
    }

    ns.mixFresh = function mixFresh(videos) {
        const list = (videos || []).filter(Boolean);
        if (list.length < FRESH_MIX_MIN_ITEMS) return list;
        const freshCount = Math.max(1, Math.round(list.length * FRESH_MIX_BUCKET));
        const fresh = shuffled(list.slice(0, freshCount));
        const aged = shuffled(list.slice(freshCount));
        const mixed = [];
        let freshIndex = 0;
        let agedIndex = 0;
        for (let slot = 0; slot < list.length; slot += 1) {
            const wantFresh = Math.floor((slot + 1) * FRESH_MIX_RATIO + 0.5) > Math.floor(slot * FRESH_MIX_RATIO + 0.5);
            const takeFresh = (wantFresh && freshIndex < fresh.length) || agedIndex >= aged.length;
            mixed.push(takeFresh ? fresh[freshIndex++] : aged[agedIndex++]);
        }
        return mixed;
    };

    ns.rememberChannels = function rememberChannels(channels) {
        if (!Array.isArray(channels) || !channels.length) return;
        ns.channels = new Map(channels.map(channel => [channel.id, channel]));
    };

    // Kitaplıkta saklanan küçük video özeti (sunucuya gitmeden listeleri çizebilmek için).
    ns.snapshot = function snapshot(video) {
        return {
            id: video.id,
            title: String(video.title || '').slice(0, 200),
            channelId: video.channelId || '',
            channelName: String(video.channelName || '').slice(0, 100),
            duration: Number(video.duration) || 0,
            type: video.type === 'shorts' ? 'shorts' : 'video',
            publishedAt: video.publishedAt || null,
            views: Number(video.views) || 0
        };
    };

    // ---------- Parçalar ----------

    function channelHue(id) {
        let hash = 0;
        for (const character of String(id || '')) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0;
        return hash % 360;
    }

    // Kart ve listelerde kanal için `video_channels.kanalHandle` (@kullanici) gösterilir; kanal listesi
    // henüz yüklenmediyse ya da kayıtta handle yoksa kanal adına dönülür.
    ns.channelHandleLabel = function channelHandleLabel(channelId, channelName) {
        const handle = String(ns.channels.get(channelId)?.handle || '').trim();
        return handle || String(channelName || '').trim();
    };

    ns.avatarHtml = function avatarHtml(channelId, channelName, className = '') {
        const channel = ns.channels.get(channelId);
        const name = (channel?.name || channelName || '').trim();
        const logo = ns.safeLogoUrl(channel?.logo);
        const initial = ns.escape((name.replace(/^[^\p{L}\p{N}]+/u, '').charAt(0) || '?').toLocaleUpperCase('tr'));
        const classes = `videos-avatar ${className}`.trim();
        if (logo) {
            return `<span class="${classes}" aria-hidden="true"><img src="${ns.escape(logo)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()"><span class="videos-avatar-initial">${initial}</span></span>`;
        }
        return `<span class="${classes}" aria-hidden="true" style="--avatar-hue:${channelHue(channelId)}"><span class="videos-avatar-initial">${initial}</span></span>`;
    };

    ns.durationBadgeHtml = function durationBadgeHtml(video) {
        if (video.isLive || !video.duration) return '<span class="videos-badge videos-badge-live">YAYIN</span>';
        return `<span class="videos-badge">${ns.formatDuration(video.duration)}</span>`;
    };

    ns.progressHtml = function progressHtml(videoId) {
        const ratio = ns.store?.progressRatio(videoId) || 0;
        if (ratio < 0.02) return '';
        return `<span class="videos-progress" aria-hidden="true"><span style="width:${Math.min(100, Math.round(ratio * 100))}%"></span></span>`;
    };

    ns.iconButtonHtml = function iconButtonHtml({ action, icon, activeIcon, label, active = false, videoId, text = '' }) {
        const iconClass = active && activeIcon ? activeIcon : icon;
        return `<button type="button" class="videos-icon-button${active ? ' is-active' : ''}" data-action="${action}" data-video-id="${ns.escape(videoId)}" aria-label="${ns.escape(label)}" aria-pressed="${active ? 'true' : 'false'}" data-icon="${icon}" data-active-icon="${activeIcon || icon}"><i class="${iconClass}" aria-hidden="true"></i>${text ? `<span>${ns.escape(text)}</span>` : ''}</button>`;
    };

    ns.LIKE_ICONS = { icon: 'fa-regular fa-thumbs-up', activeIcon: 'fa-solid fa-thumbs-up' };
    ns.DISLIKE_ICONS = { icon: 'fa-regular fa-thumbs-down', activeIcon: 'fa-solid fa-thumbs-down' };
    ns.SAVE_ICONS ={ icon: 'fa-regular fa-bookmark', activeIcon: 'fa-solid fa-bookmark' };

    // Beğen / kaydet düğmelerinin görünümü tek yerden güncellenir (aynı video birden çok listede olabilir).
    ns.syncActionButtons = function syncActionButtons(root) {
        if (!root || !ns.store) return;
        const isActive = { like: ns.store.isLiked, dislike: ns.store.isDisliked, save: ns.store.isSaved };
        root.querySelectorAll('[data-action="like"], [data-action="dislike"], [data-action="save"]').forEach(button => {
            const id = button.dataset.videoId;
            const active = isActive[button.dataset.action](id);
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
            const icon = button.querySelector('i');
            if (icon) icon.className = active ? button.dataset.activeIcon : button.dataset.icon;
            const label = button.querySelector('span');
            if (label && button.dataset.action === 'save') label.textContent = active ? 'Kaydedildi' : 'Kaydet';
            if (label && button.dataset.action === 'like') label.textContent = active ? 'Beğenildi' : 'Beğen';
        });
    };

    // ---------- API ----------

    async function getJson(url) {
        const response = await fetch(url, { headers: { Accept: 'application/json' } });
        let body = null;
        try {
            body = await response.json();
        } catch (_error) {
            body = null;
        }
        if (!response.ok || !body?.success) {
            const error = new Error(body?.message || `Videolar yüklenemedi (${response.status})`);
            error.status = response.status;
            throw error;
        }
        return body;
    }

    const homeRequests = new Map();
    const detailRequests = new Map();

    ns.api = {
        home(excludeKey = '') {
            if (homeRequests.has(excludeKey)) return homeRequests.get(excludeKey);
            const query = excludeKey ? `?exclude=${encodeURIComponent(excludeKey)}` : '';
            const request = getJson(`/api/videos/home${query}`).then(body => {
                ns.rememberChannels(body.channels);
                ns.rememberVideos(body.videos?.videos);
                ns.rememberVideos(body.shorts?.videos);
                return body;
            });
            homeRequests.set(excludeKey, request);
            request.catch(() => homeRequests.delete(excludeKey));
            return request;
        },
        forgetHome() {
            homeRequests.clear();
        },
        async feed({ type, before, excludeKey = '', channelId = '', limit = 12 }) {
            const params = new URLSearchParams({ type, limit: String(limit) });
            if (before) params.set('before', before);
            if (channelId) params.set('channel', channelId);
            else if (excludeKey) params.set('exclude', excludeKey);
            const body = await getJson(`/api/videos/feed?${params.toString()}`);
            ns.rememberVideos(body.videos);
            return body;
        },
        detail(videoId) {
            if (!ns.isVideoId(videoId)) return Promise.reject(new Error('Geçersiz video'));
            if (detailRequests.has(videoId)) return detailRequests.get(videoId);
            const request = getJson(`/api/videos/${encodeURIComponent(videoId)}`).then(body => {
                ns.rememberVideos([body.video]);
                ns.rememberVideos(body.related);
                return body;
            });
            detailRequests.set(videoId, request);
            request.catch(() => detailRequests.delete(videoId));
            if (detailRequests.size > 40) detailRequests.delete(detailRequests.keys().next().value);
            return request;
        }
    };

    // ---------- Görsel hazırlığı ----------

    const imageLoads = new Map();

    ns.preloadImage = function preloadImage(src) {
        if (!src) return Promise.resolve(false);
        if (imageLoads.has(src)) return imageLoads.get(src);
        const promise = new Promise(resolve => {
            const image = new Image();
            image.decoding = 'async';
            image.referrerPolicy = 'no-referrer';
            image.onload = () => resolve(true);
            image.onerror = () => resolve(false);
            image.src = src;
        });
        imageLoads.set(src, promise);
        return promise;
    };

    ns.waitForImages = function waitForImages(sources, timeoutMs = 1500) {
        const loads = sources.filter(Boolean).map(ns.preloadImage);
        if (!loads.length) return Promise.resolve();
        return Promise.race([
            Promise.all(loads),
            new Promise(resolve => window.setTimeout(resolve, timeoutMs))
        ]);
    };

    let preconnected = false;
    ns.preconnect = function preconnect() {
        if (preconnected) return;
        preconnected = true;
        ['https://i.ytimg.com', 'https://yt3.ggpht.com', 'https://www.youtube-nocookie.com'].forEach(href => {
            const link = document.createElement('link');
            link.rel = 'preconnect';
            link.href = href;
            link.crossOrigin = 'anonymous';
            document.head.appendChild(link);
        });
    };

    // ---------- Bildirim ve paylaşım ----------

    let toastTimer = null;
    ns.toast = function toast(message) {
        let element = document.querySelector('.videos-toast');
        if (!element) {
            element = document.createElement('div');
            element.className = 'videos-toast';
            element.setAttribute('role', 'status');
            element.setAttribute('aria-live', 'polite');
            document.body.appendChild(element);
        }
        element.textContent = message;
        element.classList.add('is-visible');
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => element.classList.remove('is-visible'), 2200);
    };

    ns.share = async function share(video) {
        if (!video) return;
        const url = new URL(ns.itemUrl(video), window.location.origin).href;
        if (navigator.share) {
            try {
                await navigator.share({ title: video.title, url });
                return;
            } catch (error) {
                if (error?.name === 'AbortError') return;
            }
        }
        try {
            await navigator.clipboard.writeText(url);
            ns.toast('Bağlantı kopyalandı');
        } catch (_error) {
            ns.toast('Bağlantı kopyalanamadı');
        }
    };

    // ---------- Etkinlik kaydı ----------

    // Bölüm geçişleri yalnızca yönetici panelindeki etkinlik kayıtlarına yazılır; sekmenin kendi
    // açılışı kabuk tarafından ayrıca kaydedilir. Hata sessizce yutulur.
    ns.logSection = async function logSection(section) {
        if (!section) return;
        const payload = JSON.stringify({
            action: 'videolar_bölüm_görüntüleme',
            section,
            deviceInfo: {
                userAgent: navigator.userAgent,
                screenWidth: window.screen.width,
                screenHeight: window.screen.height
            }
        });
        for (const endpoint of ['/api/visit-event', '/api/log-visit']) {
            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: payload,
                    keepalive: true
                });
                if (response.ok) return;
            } catch (_error) {
                // Reklam engelleyici / ağ hatası: bir sonraki uç noktayı dene.
            }
        }
    };
})();
