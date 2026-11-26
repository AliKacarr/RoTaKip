// ==================== Videolar: Hesabım ====================
// /videolar?bolum=hesabim[&liste=gecmis|begenilenler|begenilen-shorts|kaydedilenler|kaydedilen-shorts|kanallar]. İzleme geçmişi,
// beğenilenler, kaydedilenler ve kanallar (abonelikler / önerilmeyenler). Tüm veriler bu cihazda saklanır.

(function () {
    const ns = window.RoTaKipVideos;
    const SHELF_LIMIT = 12;

    // `type`: listede yalnızca o türdeki videolar gösterilir (beğenilenler videolar ve Shorts diye ayrılır);
    // verilmezse tümü listelenir ve üstte Tümü/Videolar/Shorts filtresi bulunur.
    const LISTS = {
        gecmis: { title: 'Geçmiş', store: 'history', empty: 'Henüz video izlemedin.', icon: 'fa-solid fa-clock-rotate-left' },
        begenilenler: { title: 'Beğendiğim videolar', store: 'liked', type: 'video', empty: 'Beğendiğin videolar burada görünür.', icon: 'fa-solid fa-thumbs-up' },
        'begenilen-shorts': { title: "Beğendiğim Shorts'lar", store: 'liked', type: 'shorts', empty: "Beğendiğin Shorts'lar burada görünür.", icon: 'fa-solid fa-bolt' },
        kaydedilenler: { title: 'Kaydedilen videolar', store: 'saved', type: 'video', empty: 'Daha sonra izlemek için kaydettiğin videolar burada görünür.', icon: 'fa-solid fa-bookmark' },
        'kaydedilen-shorts': { title: "Kaydedilen Shorts'lar", store: 'saved', type: 'shorts', empty: "Daha sonra izlemek için kaydettiğin Shorts'lar burada görünür.", icon: 'fa-solid fa-bolt' },
        kanallar: { title: 'Kanallar', empty: 'Kanallar yükleniyor…', icon: 'fa-solid fa-tv' }
    };
    ns.LIBRARY_LISTS = Object.keys(LISTS);

    function itemsOf(listKey) {
        const list = LISTS[listKey];
        if (!list?.store) return [];
        const items = ns.store[list.store]();
        return list.type ? items.filter(video => (video.type === 'shorts') === (list.type === 'shorts')) : items;
    }

    function openAttribute(video) {
        return video.type === 'shorts' ? `data-open-short="${ns.escape(video.id)}"` : `data-open-video="${ns.escape(video.id)}"`;
    }

    function shelfItemHtml(video) {
        const isShort = video.type === 'shorts';
        return `<a class="videos-shelf-item${isShort ? ' is-short' : ''}" href="${ns.escape(ns.itemUrl(video))}" ${openAttribute(video)}>
            <span class="videos-shelf-thumb">
                <img src="${ns.escape(ns.thumbnailUrl(video.id, 'mqdefault'))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
                ${isShort ? '<span class="videos-badge"><i class="fa-solid fa-bolt" aria-hidden="true"></i></span>' : ns.durationBadgeHtml(video)}
                ${ns.progressHtml(video.id)}
            </span>
            <span class="videos-shelf-title">${ns.escape(video.title)}</span>
            <span class="videos-shelf-meta">${ns.escape(video.channelName)}</span>
        </a>`;
    }

    function listRowHtml(video, listKey) {
        return `<div class="videos-library-row">
            ${ns.relatedItemHtml(video)}
            <button type="button" class="videos-icon-button videos-library-more" data-action="library-item-menu" data-store="${listKey}" data-video-id="${ns.escape(video.id)}" aria-haspopup="menu" aria-label="Video seçenekleri"><i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i></button>
        </div>`;
    }

    // Geçmiş gün başlığı: Bugün, Dün, son haftadaki günler için gün adı (Pazartesi), daha eskiler için "18 Haziran".
    function dayStart(timestamp) {
        const date = new Date(timestamp);
        return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }

    function dayLabel(timestamp) {
        const at = Number(timestamp);
        if (!Number.isFinite(at) || at <= 0) return 'Daha önce';
        const day = dayStart(at);
        const today = dayStart(Date.now());
        const diff = Math.round((today - day) / 86400000);
        if (diff <= 0) return 'Bugün';
        if (diff === 1) return 'Dün';
        if (diff < 7) {
            const weekday = day.toLocaleDateString('tr-TR', { weekday: 'long' });
            return weekday.charAt(0).toLocaleUpperCase('tr-TR') + weekday.slice(1);
        }
        const sameYear = day.getFullYear() === today.getFullYear();
        return day.toLocaleDateString('tr-TR', sameYear ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' });
    }

    const FILTERS = [
        { key: 'tumu', label: 'Tümü' },
        { key: 'videolar', label: 'Videolar' },
        { key: 'shorts', label: 'Shorts' }
    ];

    // Arama: büyük/küçük harf, Türkçe harfler ve aksanlar yok sayılır (ı/İ, ş, ğ, ü, ö, ç).
    function fold(text) {
        return String(text || '')
            .toLocaleLowerCase('tr-TR')
            .replace(/ı/g, 'i')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '');
    }

    function matchesQuery(video, query) {
        if (!query) return true;
        const haystack = fold(`${video.title} ${video.channelName}`);
        return query.split(/\s+/).every(term => haystack.includes(term));
    }

    // Shorts kutusu: dikey 2:3 kapak, üstte ⋯ menüsü, altta başlık (ana sayfadaki Shorts rafıyla aynı görünüm).
    function shortTileHtml(video, listKey) {
        const id = ns.escape(video.id);
        return `<div class="videos-short-tile is-library" data-video-id="${id}">
            <a class="videos-short-tile-link" href="${ns.escape(ns.shortsUrl(video.id))}" data-open-short="${id}" aria-label="${ns.escape(video.title)}">
                <img src="${ns.escape(ns.thumbnailUrl(video.id))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
                <span class="videos-short-tile-caption">
                    <span class="videos-short-tile-title">${ns.escape(video.title)}</span>
                    ${video.views ? `<span class="videos-short-tile-meta">${ns.escape(ns.formatViews(video.views))}</span>` : ''}
                </span>
            </a>
            <button type="button" class="videos-short-tile-more" data-action="library-item-menu" data-store="${listKey}" data-video-id="${id}" aria-haspopup="menu" aria-label="Video seçenekleri"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></button>
        </div>`;
    }

    // Bir grubun (gün ya da tüm liste) içeriği: "Tümü"nde Shorts yatay raf + videolar satır satır,
    // "Shorts"ta kutu ızgarası, "Videolar"da yalnızca satırlar.
    function groupHtml(items, listKey, filter) {
        const shorts = filter === 'videolar' ? [] : items.filter(video => video.type === 'shorts');
        const videos = filter === 'shorts' ? [] : items.filter(video => video.type !== 'shorts');
        const shortsHtml = shorts.length
            ? `<div class="${filter === 'shorts' ? 'videos-library-shorts-grid' : 'videos-library-shorts-shelf'}">${shorts.map(video => shortTileHtml(video, listKey)).join('')}</div>`
            : '';
        return shortsHtml + videos.map(video => listRowHtml(video, listKey)).join('');
    }

    // Geçmiş en yeniden eskiye sıralıdır; aynı güne ait videolar tek başlık altında toplanır.
    function historyRowsHtml(items, listKey, filter) {
        const groups = [];
        items.forEach(video => {
            const label = dayLabel(video.at);
            const last = groups[groups.length - 1];
            if (last && last.label === label) last.items.push(video);
            else groups.push({ label, items: [video] });
        });
        return groups
            .map(group => `<h2 class="videos-history-day">${ns.escape(group.label)}</h2>${groupHtml(group.items, listKey, filter)}`)
            .join('');
    }

    function headingHtml(listKey, title) {
        return `<a class="videos-library-heading" href="${ns.TAB_PATH}?bolum=hesabim&amp;liste=${listKey}" data-library-list="${listKey}">
            <h2 class="videos-block-title">${ns.escape(title)}</h2>
            <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
        </a>`;
    }

    // Koleksiyon kapağı: arkada kapağın bulanık kopyası (renk doldurma), önde ortalanmış küçük resim,
    // üstte ise kapağın arkasından taşan dar bir "yığın" şeridi bulunur.
    function collectionRowHtml(listKey) {
        const list = LISTS[listKey];
        const items = itemsOf(listKey);
        const source = items[0] ? ns.escape(ns.thumbnailUrl(items[0].id, 'mqdefault')) : '';
        const backdrop = source
            ? `<img class="videos-collection-backdrop" src="${source}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
            : '';
        const poster = source
            ? `<img class="videos-collection-poster" src="${source}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
            : '';
        return `<div class="videos-collection">
            <a class="videos-collection-link" href="${ns.TAB_PATH}?bolum=hesabim&amp;liste=${listKey}" data-library-list="${listKey}">
                <span class="videos-collection-art${source ? '' : ' is-empty'}">
                    <span class="videos-collection-stack" aria-hidden="true">${backdrop}</span>
                    <span class="videos-collection-cover">${backdrop}${poster}${source
                        ? `<span class="videos-collection-icon"><i class="${list.icon}" aria-hidden="true"></i></span>`
                        : `<span class="videos-collection-placeholder" aria-hidden="true"><i class="${list.icon}"></i></span>`}</span>
                </span>
                <span class="videos-collection-text">
                    <span class="videos-collection-title">${ns.escape(list.title)}</span>
                    <span class="videos-collection-meta">Gizli · ${items.length} video</span>
                </span>
            </a>
            <button type="button" class="videos-icon-button videos-collection-more" data-action="collection-menu" data-store="${list.store}" data-type="${list.type || ''}" data-title="${ns.escape(list.title)}" aria-haspopup="menu" aria-label="${ns.escape(list.title)} seçenekleri"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></button>
        </div>`;
    }

    const library = {
        root: null,
        container: null,
        route: null,
        active: false,
        query: '',
        rawQuery: '',
        filter: 'tumu',
        listKey: null,

        init(page) {
            this.root = page.querySelector('[data-view="library"]');
            this.container = page.querySelector('#videosLibrary');
            // Arama kutusu ve filtre düğmeleri liste yeniden çizilirken de yaşasın diye olaylar kapsayıcıda dinlenir.
            this.container.addEventListener('input', event => {
                if (!event.target.matches('[data-library-search]')) return;
                this.rawQuery = event.target.value;
                this.query = fold(event.target.value.trim());
                this.renderResults();
            });
            this.container.addEventListener('click', event => {
                const chip = event.target.closest('[data-library-filter]');
                if (chip) {
                    this.filter = chip.dataset.libraryFilter;
                    this.container.querySelectorAll('[data-library-filter]').forEach(button => {
                        const selected = button === chip;
                        button.classList.toggle('is-selected', selected);
                        button.setAttribute('aria-pressed', String(selected));
                    });
                    this.renderResults();
                    return;
                }
                if (event.target.closest('[data-library-search-clear]')) {
                    const input = this.container.querySelector('[data-library-search]');
                    input.value = '';
                    this.query = '';
                    this.rawQuery = '';
                    this.renderResults();
                    input.focus();
                }
            });
        },

        enter(route) {
            this.active = true;
            this.route = route;
            // Başka bir listeye (ya da Hesabım ana sayfasına) geçilince arama ve filtre sıfırlanır.
            if (route?.list !== this.listKey) {
                this.query = '';
                this.rawQuery = '';
                this.filter = 'tumu';
                this.listKey = null;
            }
            this.render();
            if (!ns.channels.size) ns.tab.homeReady().then(() => this.active && this.render()).catch(() => {});
        },

        leave() {
            this.active = false;
        },

        refresh() {
            if (this.active) this.render();
        },

        render() {
            const listKey = this.route?.list;
            if (listKey === 'kanallar') this.renderChannels();
            else if (LISTS[listKey]) this.renderList(listKey);
            else this.renderHome();
        },

        renderHome() {
            const history = ns.store.history().slice(0, SHELF_LIMIT);
            const channels = [...ns.channels.values()];
            const subscribed = channels.filter(channel => ns.store.isSubscribed(channel.id));
            const emptyChannels = channels.length
                ? `<div class="videos-subscriptions-empty">
                        <p class="videos-muted">Henüz abone olduğun kanal yok.</p>
                        <a class="videos-pill" href="${ns.TAB_PATH}?bolum=hesabim&amp;liste=kanallar" data-library-list="kanallar">Kanalları keşfet</a>
                    </div>`
                : '<p class="videos-muted videos-library-empty">Kanallar yükleniyor…</p>';
            this.container.innerHTML = `
                <section class="videos-library-block">
                    ${headingHtml('gecmis', 'Geçmiş')}
                    ${history.length
                        ? `<div class="videos-shelf-row">${history.map(shelfItemHtml).join('')}</div>`
                        : '<p class="videos-muted videos-library-empty">İzlediğin videolar burada görünür.</p>'}
                </section>

                <section class="videos-library-block">
                    ${headingHtml('kanallar', 'Abonelikler')}
                    ${subscribed.length
                        ? `<div class="videos-channel-row">${subscribed.map(channel => `<button type="button" class="videos-channel-chip" data-channel-filter="${ns.escape(channel.id)}">
                                ${ns.avatarHtml(channel.id, channel.name, 'videos-avatar-lg')}
                                <span>${ns.escape(channel.name)}</span>
                            </button>`).join('')}</div>`
                        : emptyChannels}
                </section>

                <section class="videos-library-block videos-collections">
                    <h2 class="videos-block-title">Kitaplık</h2>
                    ${collectionRowHtml('begenilenler')}
                    ${collectionRowHtml('begenilen-shorts')}
                    ${collectionRowHtml('kaydedilenler')}
                    ${collectionRowHtml('kaydedilen-shorts')}
                </section>`;
        },

        listHeaderHtml(title, actions = '') {
            return `<header class="videos-list-header">
                <button type="button" class="videos-back" data-library-back aria-label="Kitaplığa dön"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button>
                <h1 class="videos-library-title">${ns.escape(title)}</h1>
                ${actions}
            </header>`;
        },

        renderList(listKey) {
            const list = LISTS[listKey];
            const items = itemsOf(listKey);
            const actions = listKey === 'gecmis' && items.length
                ? '<button type="button" class="videos-pill videos-pill-quiet" data-clear-history><i class="fa-solid fa-trash-can" aria-hidden="true"></i>Tüm Geçmişi temizle</button>'
                : '';
            this.listKey = listKey;
            // Türü sabit listelerde (Beğendiğim videolar / Beğendiğim Shorts'lar) yalnızca arama kutusu vardır.
            const filters = !list.type
                ? `<div class="videos-library-filters" role="group" aria-label="Video türü">
                        ${FILTERS.map(filter => `<button type="button" class="videos-library-chip${filter.key === this.filter ? ' is-selected' : ''}" data-library-filter="${filter.key}" aria-pressed="${filter.key === this.filter}">${filter.label}</button>`).join('')}
                    </div>`
                : '';
            const controls = items.length
                ? `<div class="videos-library-search">
                        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                        <input type="search" data-library-search placeholder="${ns.escape(list.title)} içinde ara" aria-label="${ns.escape(list.title)} içinde ara" autocomplete="off" enterkeyhint="search" value="${ns.escape(this.rawQuery)}">
                        <button type="button" class="videos-library-search-clear" data-library-search-clear aria-label="Aramayı temizle"${this.query ? '' : ' hidden'}><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
                    </div>${filters}`
                : '';
            this.container.innerHTML = `${this.listHeaderHtml(list.title, actions)}
                ${controls}
                <div class="videos-library-results" data-library-results></div>`;
            this.renderResults();
        },

        // Yalnızca sonuç alanını yeniden çizer; yazılmakta olan arama kutusu ve odak korunur.
        renderResults() {
            const listKey = this.listKey;
            const list = LISTS[listKey];
            const results = this.container.querySelector('[data-library-results]');
            if (!list || !results) return;
            const all = itemsOf(listKey);
            // Türü sabit listelerde süzme gerekmez (itemsOf zaten türe göre ayırır); Shorts listesi ızgara gösterilir.
            const filter = list.type ? (list.type === 'shorts' ? 'shorts' : 'videolar') : this.filter;
            const items = all.filter(video => matchesQuery(video, this.query)
                && (filter === 'tumu' || (filter === 'shorts') === (video.type === 'shorts')));
            const clear = this.container.querySelector('[data-library-search-clear]');
            if (clear) clear.hidden = !this.query;
            if (!all.length) {
                results.innerHTML = `<div class="videos-empty"><i class="${list.icon}" aria-hidden="true"></i><p>${ns.escape(list.empty)}</p></div>`;
                return;
            }
            if (!items.length) {
                const raw = this.container.querySelector('[data-library-search]')?.value.trim();
                const message = raw ? `"${raw}" için sonuç bulunamadı.` : 'Bu türde video yok.';
                results.innerHTML = `<div class="videos-empty"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><p>${ns.escape(message)}</p></div>`;
                return;
            }
            results.innerHTML = `<div class="videos-library-list">${listKey === 'gecmis'
                ? historyRowsHtml(items, list.store, filter)
                : groupHtml(items, list.store, filter)}</div>`;
        },

        // Kanallar: Abonelikler, Önerilmeyenler (geri aç) ve Önerilen kanallar (abone ol) bölümleri.
        renderChannels() {
            const channels = [...ns.channels.values()];
            if (!channels.length) {
                this.container.innerHTML = `${this.listHeaderHtml('Kanallar')}
                    <div class="videos-loader is-compact" aria-label="Kanallar yükleniyor"><span></span><span></span><span></span></div>`;
                return;
            }
            const subscribed = channels.filter(channel => ns.store.isSubscribed(channel.id));
            const hidden = channels.filter(channel => ns.store.isHidden(channel.id));
            const others = channels.filter(channel => !ns.store.isSubscribed(channel.id) && !ns.store.isHidden(channel.id));
            const row = (channel, control) => `<li class="videos-channel-item">
                    <button type="button" class="videos-channel-open" data-channel-filter="${ns.escape(channel.id)}">
                        ${ns.avatarHtml(channel.id, channel.name, 'videos-avatar-lg')}
                        <span class="videos-channel-name">${ns.escape(channel.name)}</span>
                    </button>
                    ${control}
                </li>`;
            const section = (title, items, control) => (items.length
                ? `<section class="videos-channel-section">
                        <h2 class="videos-channel-section-title">${title} <span class="videos-muted">${items.length}</span></h2>
                        <ul class="videos-channel-list">${items.map(channel => row(channel, control(channel))).join('')}</ul>
                    </section>`
                : '');
            const subscribe = channel => ns.subscribeButtonHtml(channel.id);
            const unhide = channel => `<button type="button" class="videos-subscribe is-subscribed" data-action="unhide-channel" data-channel-id="${ns.escape(channel.id)}">Geri aç</button>`;
            this.container.innerHTML = `${this.listHeaderHtml('Kanallar')}
                ${section('Abonelikler', subscribed, subscribe)}
                ${section('Önerilmeyenler', hidden, unhide)}
                ${section('Önerilen kanallar', others, subscribe)}`;
        }
    };

    ns.library = library;
})();
