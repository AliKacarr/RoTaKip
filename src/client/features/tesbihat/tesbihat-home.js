(function () {
    const ns = window.RoTaKipTesbihat;

    const gregorianFormatter = new Intl.DateTimeFormat('tr-TR', {
        timeZone: ns.TIME_ZONE,
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    let hijriFormatter = null;
    try {
        hijriFormatter = new Intl.DateTimeFormat('tr-TR-u-ca-islamic-umalqura-nu-latn', {
            timeZone: ns.TIME_ZONE,
            day: 'numeric',
            month: 'numeric',
            year: 'numeric'
        });
    } catch (_error) {
        hijriFormatter = null;
    }

    let elements = null;
    let notificationPanel = null;
    let pushStateBound = false;

    const PUSH_CACHE_KEY = 'rotakip:push-enabled';

    // Bildirimlerin açık olup olmadığı: true / false, bilinmiyorsa null.
    // Kesin kaynak OneSignal'dır (public/push/onesignal-init.js `rotakipPushEnabled`); SDK boşta geç yüklendiği
    // için ondan önce tarayıcı izni (verilmediyse bildirim zaten kapalıdır) ve son bilinen durum kullanılır.
    function readPushState() {
        if (typeof window.rotakipPushEnabled === 'boolean') return window.rotakipPushEnabled;
        if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') return false;
        try {
            const cached = window.localStorage.getItem(PUSH_CACHE_KEY);
            if (cached === '1') return true;
            if (cached === '0') return false;
        } catch (_error) {
            // Depolama kapalı: durum bilinmiyor sayılır.
        }
        return null;
    }

    // Açıkken dolu zil, kapalıyken üstü çizili zil; durum bilinmiyorsa varsayılan zil kalır.
    function renderNotificationIcon(enabled) {
        const button = elements?.notificationButton;
        if (!button || typeof enabled !== 'boolean') return;
        const icon = button.querySelector('i');
        if (icon) icon.className = enabled ? 'fa-solid fa-bell' : 'fa-solid fa-bell-slash';
        const label = enabled ? 'Bildirimler (açık)' : 'Bildirimler (kapalı)';
        button.setAttribute('aria-label', label);
        button.title = label;
    }

    function queryElements() {
        return {
            view: document.querySelector('.tesbihat-view[data-view="home"]'),
            hero: document.getElementById('tesbihatHero'),
            changeLocation: document.querySelector('.tesbihat-change-location'),
            notificationButton: document.getElementById('tesbihatNotificationButton'),
            currentName: document.getElementById('tesbihatHeroCurrent'),
            locationName: document.getElementById('tesbihatCurrentLocation'),
            countdown: document.getElementById('tesbihatHeroCountdown'),
            countdownMain: document.getElementById('tesbihatCountdownMain'),
            countdownSeconds: document.getElementById('tesbihatCountdownSeconds'),
            gregorianDate: document.getElementById('tesbihatGregorianDate'),
            hijriDate: document.getElementById('tesbihatHijriDate'),
            status: document.getElementById('tesbihatHomeStatus'),
            list: document.getElementById('tesbihatPrayerList')
        };
    }

    // Tarayıcıların tr yerel ayarı Hicrî ay adlarını Miladî adlarla karıştırabildiği için ay numarası kendi tablomuzla adlandırılır.
    const HIJRI_MONTHS = Object.freeze([
        'Muharrem', 'Safer', 'Rebiülevvel', 'Rebiülahir', 'Cemaziyelevvel', 'Cemaziyelahir',
        'Recep', 'Şaban', 'Ramazan', 'Şevval', 'Zilkade', 'Zilhicce'
    ]);

    function formatHijriDate() {
        if (!hijriFormatter) return '';
        try {
            const parts = {};
            hijriFormatter.formatToParts(new Date()).forEach(part => {
                parts[part.type] = part.value;
            });
            const monthName = HIJRI_MONTHS[Number(parts.month) - 1];
            if (!monthName || !parts.day || !parts.year) return '';
            return `${parts.day} ${monthName} ${parts.year}`;
        } catch (_error) {
            return '';
        }
    }

    function pad(value) {
        return String(value).padStart(2, '0');
    }

    function renderCountdown(schedule) {
        if (!schedule?.next) {
            elements.countdown.removeAttribute('aria-label');
            elements.countdownMain.textContent = '--:--';
            elements.countdownSeconds.textContent = '';
            return;
        }
        const remaining = Math.max(0, schedule.next.remaining);
        const hours = Math.floor(remaining / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        const seconds = remaining % 60;
        elements.countdown.setAttribute('aria-label', `${schedule.next.period.label} vaktine kalan süre`);
        elements.countdownMain.textContent = `${pad(hours)}:${pad(minutes)}`;
        elements.countdownSeconds.textContent = `:${pad(seconds)}`;
    }

    function renderHero(snapshot) {
        const { schedule, location } = snapshot;
        const periodKey = schedule?.current.key || 'yatsi';
        elements.hero.dataset.period = periodKey;
        // Başlık şu anki vakittir; geri sayım bu vaktin bitmesine (sıradaki vakte) kalan süreyi gösterir.
        elements.currentName.textContent = schedule ? schedule.current.label : 'Namaz Vakitleri';
        const locationLabel = ns.formatLocation(location);
        elements.locationName.textContent = locationLabel || 'Konum seçin';
        elements.changeLocation.setAttribute('aria-label', `Konum: ${locationLabel || 'seçilmedi'}. Konumu değiştir`);
        elements.gregorianDate.textContent = gregorianFormatter.format(new Date());
        elements.hijriDate.textContent = formatHijriDate();
        renderCountdown(schedule);
    }

    function renderList(snapshot) {
        const { schedule } = snapshot;
        const todayRow = schedule?.todayRow || null;
        const currentTesbihat = schedule?.current.tesbihat || null;

        elements.list.replaceChildren(...ns.VAKITS.map(vakit => {
            const item = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'tesbihat-prayer-row';
            button.dataset.vakit = vakit.key;
            const isCurrent = vakit.key === currentTesbihat;
            button.classList.toggle('is-current', isCurrent);
            if (isCurrent) button.setAttribute('aria-current', 'time');

            const time = todayRow ? todayRow[vakit.timeKey] : '';
            const subtitle = vakit.key === 'sabah' && todayRow?.gunes ? `Güneş ${todayRow.gunes}` : '';
            button.innerHTML = `
                <span class="tesbihat-prayer-icon"><i class="${vakit.icon}" aria-hidden="true"></i></span>
                <span class="tesbihat-prayer-name">
                    ${vakit.label} Namazı
                    ${subtitle ? `<small>${window.escapeHtml(subtitle)}</small>` : ''}
                </span>
                <span class="tesbihat-prayer-time">${window.escapeHtml(time || '--:--')}</span>
                <i class="fa-solid fa-chevron-right tesbihat-prayer-chevron" aria-hidden="true"></i>
            `;
            button.setAttribute('aria-label', `${vakit.label} namazı tesbihatı${time ? `, vakit ${time}` : ''}`);
            item.appendChild(button);
            return item;
        }));
    }

    function renderStatus(snapshot) {
        let message = '';
        if (!snapshot.hasPayload) {
            message = 'Namaz vakitleri yüklenemedi. Tesbihatlara yine de ulaşabilirsiniz.';
        } else if (!snapshot.schedule) {
            message = 'Bu konum için bugünün namaz vakitleri henüz eklenmedi.';
        }
        elements.status.textContent = message;
        elements.status.hidden = !message;
    }

    function render() {
        const snapshot = ns.schedule.snapshot();
        renderHero(snapshot);
        renderList(snapshot);
        renderStatus(snapshot);
    }

    // Panel sekme görünümünün dışında (body) durur: sekme geçiş animasyonu `position: fixed`
    // öğelerin konumunu bozar. İçindeki kap, OneSignal Custom Link'inin yerleştiği yerdir ve
    // SDK yüklenmeden önce DOM'da hazır bulunması için başlangıçta (gizli) oluşturulur.
    function ensureNotificationPanel() {
        if (notificationPanel?.isConnected) return notificationPanel;
        notificationPanel = document.getElementById('tesbihatNotificationPanel');
        if (notificationPanel) return notificationPanel;

        notificationPanel = document.createElement('div');
        notificationPanel.id = 'tesbihatNotificationPanel';
        notificationPanel.className = 'tesbihat-dialog-backdrop';
        notificationPanel.hidden = true;
        notificationPanel.innerHTML = `
            <div class="tesbihat-dialog tesbihat-notification-dialog" role="dialog" aria-modal="true" aria-labelledby="tesbihatNotificationTitle">
                <div class="tesbihat-notification-dialog-header">
                    <h2 id="tesbihatNotificationTitle">Bildirimler</h2>
                    <button type="button" class="tesbihat-notification-close" data-notification-close aria-label="Kapat"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
                </div>
                <div class="onesignal-customlink-container"></div>
            </div>
        `;
        notificationPanel.addEventListener('click', event => {
            if (event.target === notificationPanel || event.target.closest('[data-notification-close]')) closeNotificationPanel();
        });
        document.body.appendChild(notificationPanel);
        return notificationPanel;
    }

    function onNotificationKeyDown(event) {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        closeNotificationPanel();
    }

    function openNotificationPanel() {
        const panel = ensureNotificationPanel();
        panel.hidden = false;
        document.addEventListener('keydown', onNotificationKeyDown, true);
        panel.querySelector('[data-notification-close]').focus({ preventScroll: true });
        // Panel açıldığında SDK'nın boşta beklemesi gerekmez; zaten yüklenmişse bu çağrı etkisizdir.
        if (typeof window.loadOneSignalDeferred === 'function') window.loadOneSignalDeferred();
    }

    function closeNotificationPanel() {
        if (!notificationPanel || notificationPanel.hidden) return;
        notificationPanel.hidden = true;
        document.removeEventListener('keydown', onNotificationKeyDown, true);
        elements?.notificationButton.focus({ preventScroll: true });
    }

    function bindEvents() {
        elements.view.addEventListener('click', event => {
            if (event.target.closest('#tesbihatNotificationButton')) {
                openNotificationPanel();
                return;
            }
            if (event.target.closest('[data-open-location]')) {
                ns.navigate({ view: 'location' });
                return;
            }
            const row = event.target.closest('.tesbihat-prayer-row');
            if (row) ns.navigate({ view: 'types', vakit: row.dataset.vakit });
        });

        ns.schedule.subscribe((reason, detail) => {
            if (reason === 'times' || detail.periodChanged) {
                render();
                return;
            }
            renderCountdown(ns.schedule.snapshot().schedule);
        });
    }

    ns.home = {
        init() {
            elements = queryElements();
            bindEvents();
            ensureNotificationPanel();
            renderNotificationIcon(readPushState());
            // Olay dinleyicisi sayfa ömrü boyunca tek kez bağlanır; güncel düğmeye `elements` üzerinden ulaşır.
            if (!pushStateBound) {
                pushStateBound = true;
                window.addEventListener('rotakip:push-state', event => renderNotificationIcon(event.detail?.enabled));
            }
            if (typeof window.scheduleOneSignalLoad === 'function') window.scheduleOneSignalLoad();
        },
        render
    };
})();
