// ==================== Videolar: Hesabım ====================
// /videolar?bolum=hesabim[&liste=gecmis|begenilenler|kaydedilenler|kanallar]. İzleme geçmişi,
// beğenilenler, kaydedilenler ve takip edilen kanallar. Tüm veriler bu cihazda saklanır.

(function () {
    const ns = window.RoTaKipVideos;
    const SHELF_LIMIT = 12;

    const LISTS = {
        gecmis: { title: 'Geçmiş', store: 'history', empty: 'Henüz video izlemedin.', icon: 'fa-solid fa-clock-rotate-left' },
        begenilenler: { title: 'Beğendiğim videolar', store: 'liked', empty: 'Beğendiğin videolar burada görünür.', icon: 'fa-solid fa-thumbs-up' },
        kaydedilenler: { title: 'Kaydedilenler', store: 'saved', empty: 'Daha sonra izlemek için kaydettiğin videolar burada görünür.', icon: 'fa-solid fa-bookmark' },
        kanallar: { title: 'Kanallarım', empty: 'Kanallar yükleniyor…', icon: 'fa-solid fa-tv' }
    };
    ns.LIBRARY_LISTS = Object.keys(LISTS);

    function itemsOf(listKey) {
        const list = LISTS[listKey];
        if (!list?.store) return [];
        return ns.store[list.store]();
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
            <button type="button" class="videos-icon-button videos-remove" data-remove-from="${listKey}" data-video-id="${ns.escape(video.id)}" aria-label="Listeden kaldır"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        </div>`;
    }

    function headingHtml(listKey, title, count) {
        return `<a class="videos-library-heading" href="${ns.TAB_PATH}?bolum=hesabim&amp;liste=${listKey}" data-library-list="${listKey}">
            <h2 class="videos-block-title">${ns.escape(title)}${count !== undefined ? ` <span class="videos-count">${count}</span>` : ''}</h2>
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
            <button type="button" class="videos-icon-button videos-collection-more" data-action="collection-menu" data-store="${list.store}" data-title="${ns.escape(list.title)}" aria-haspopup="menu" aria-label="${ns.escape(list.title)} seçenekleri"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></button>
        </div>`;
    }

    const library = {
        root: null,
        container: null,
        route: null,
        active: false,

        init(page) {
            this.root = page.querySelector('[data-view="library"]');
            this.container = page.querySelector('#videosLibrary');
        },

        enter(route) {
            this.active = true;
            this.route = route;
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
            const followed = channels.filter(channel => ns.store.isFollowing(channel.id));
            this.container.innerHTML = `
                <section class="videos-library-block">
                    ${headingHtml('gecmis', 'Geçmiş')}
                    ${history.length
                        ? `<div class="videos-shelf-row">${history.map(shelfItemHtml).join('')}</div>`
                        : '<p class="videos-muted videos-library-empty">İzlediğin videolar burada görünür.</p>'}
                </section>

                <section class="videos-library-block">
                    ${headingHtml('kanallar', 'Kanallarım', channels.length ? `${followed.length}/${channels.length}` : undefined)}
                    ${followed.length
                        ? `<div class="videos-channel-row">${followed.map(channel => `<button type="button" class="videos-channel-chip" data-channel-filter="${ns.escape(channel.id)}">
                                ${ns.avatarHtml(channel.id, channel.name, 'videos-avatar-lg')}
                                <span>${ns.escape(channel.name)}</span>
                            </button>`).join('')}</div>`
                        : `<p class="videos-muted videos-library-empty">${channels.length ? 'Hiç kanal takip etmiyorsun.' : 'Kanallar yükleniyor…'}</p>`}
                </section>

                <section class="videos-library-block videos-collections">
                    <h2 class="videos-block-title">Kitaplık</h2>
                    ${collectionRowHtml('begenilenler')}
                    ${collectionRowHtml('kaydedilenler')}
                </section>`;
        },

        listHeaderHtml(title, actions = '') {
            return `<header class="videos-list-header">
                <button type="button" class="videos-back" data-library-back aria-label="Kitaplığa dön"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
                <h1 class="videos-library-title">${ns.escape(title)}</h1>
                ${actions}
            </header>`;
        },

        renderList(listKey) {
            const list = LISTS[listKey];
            const items = itemsOf(listKey);
            const actions = listKey === 'gecmis' && items.length
                ? '<button type="button" class="videos-pill videos-pill-quiet" data-clear-history><i class="fa-solid fa-trash-can" aria-hidden="true"></i> Geçmişi temizle</button>'
                : '';
            this.container.innerHTML = `${this.listHeaderHtml(list.title, actions)}
                ${items.length
                    ? `<div class="videos-library-list">${items.map(video => listRowHtml(video, list.store)).join('')}</div>`
                    : `<div class="videos-empty"><i class="${list.icon}" aria-hidden="true"></i><p>${ns.escape(list.empty)}</p></div>`}`;
        },

        renderChannels() {
            const channels = [...ns.channels.values()];
            const followedCount = channels.filter(channel => ns.store.isFollowing(channel.id)).length;
            const actions = channels.length && followedCount < channels.length
                ? '<button type="button" class="videos-pill videos-pill-quiet" data-follow-all><i class="fa-solid fa-check-double" aria-hidden="true"></i> Tümünü takip et</button>'
                : '';
            this.container.innerHTML = `${this.listHeaderHtml('Kanallarım', actions)}
                <p class="videos-muted videos-list-note">Takipten çıkardığın kanalların videoları akışta ve Shorts'ta gösterilmez.${channels.length ? ` ${followedCount}/${channels.length} kanal takip ediliyor.` : ''}</p>
                ${channels.length
                    ? `<ul class="videos-channel-list">${channels.map(channel => {
                        const following = ns.store.isFollowing(channel.id);
                        return `<li class="videos-channel-item">
                            <button type="button" class="videos-channel-open" data-channel-filter="${ns.escape(channel.id)}">
                                ${ns.avatarHtml(channel.id, channel.name, 'videos-avatar-lg')}
                                <span class="videos-channel-name">${ns.escape(channel.name)}</span>
                            </button>
                            <button type="button" class="videos-follow${following ? ' is-following' : ''}" data-action="follow" data-channel-id="${ns.escape(channel.id)}" aria-pressed="${following ? 'true' : 'false'}">${following ? 'Takip ediliyor' : 'Takip et'}</button>
                        </li>`;
                    }).join('')}</ul>`
                    : '<div class="videos-loader is-compact" aria-label="Kanallar yükleniyor"><span></span><span></span><span></span></div>'}`;
        }
    };

    ns.library = library;
})();
