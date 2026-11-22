(function () {
    const ns = window.RoTaKipTesbihat = window.RoTaKipTesbihat || {};
    const TIME_ZONE = 'Europe/Istanbul';
    const nowFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
    });

    ns.TIME_ZONE = TIME_ZONE;

    ns.VAKITS = Object.freeze([
        { key: 'sabah', label: 'Sabah', timeKey: 'imsak', icon: 'fa-regular fa-sun' },
        { key: 'ogle', label: 'Öğle', timeKey: 'ogle', icon: 'fa-solid fa-sun' },
        { key: 'ikindi', label: 'İkindi', timeKey: 'ikindi', icon: 'fa-solid fa-cloud-sun' },
        { key: 'aksam', label: 'Akşam', timeKey: 'aksam', icon: 'fa-regular fa-moon' },
        { key: 'yatsi', label: 'Yatsı', timeKey: 'yatsi', icon: 'fa-solid fa-moon' }
    ]);

    ns.TUR_LABELS = Object.freeze({
        kisa: 'Kısa Tesbihat',
        uzun: 'Uzun Tesbihat',
        'arapca-uzun': 'Arapça Uzun Tesbihat'
    });

    ns.findVakit = function findVakit(key) {
        return ns.VAKITS.find(vakit => vakit.key === key) || null;
    };

    ns.istanbulNow = function istanbulNow() {
        const parts = Object.fromEntries(
            nowFormatter.formatToParts(new Date()).map(part => [part.type, part.value])
        );
        return {
            dateKey: `${parts.year}-${parts.month}-${parts.day}`,
            seconds: Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)
        };
    };

    ns.timeToSeconds = function timeToSeconds(value) {
        const [hours, minutes] = String(value || '').split(':').map(Number);
        if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
        return hours * 3600 + minutes * 60;
    };

    ns.formatLocation = function formatLocation(location) {
        if (!location) return '';
        return location.ilce === location.il ? location.il : `${location.ilce}, ${location.il}`;
    };

    ns.normalizeSearch = function normalizeSearch(value) {
        return String(value || '')
            .toLocaleLowerCase('tr-TR')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/ı/g, 'i')
            .trim();
    };

    ns.fetchJson = async function fetchJson(url) {
        let response;
        try {
            response = await fetch(url, { headers: { Accept: 'application/json' } });
        } catch (error) {
            throw new Error(navigator.onLine === false
                ? 'İnternet bağlantısı yok.'
                : 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.', { cause: error });
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success === false) {
            throw new Error(data.message || 'İstek tamamlanamadı');
        }
        return data;
    };

    ns.toast = function toast(message, tone = 'success') {
        document.querySelector('.share-toast')?.remove();
        const element = document.createElement('div');
        element.className = `share-toast share-${tone}`;
        element.setAttribute('role', 'status');
        element.textContent = message;
        document.body.appendChild(element);
        window.setTimeout(() => {
            element.classList.add('share-hide');
            window.setTimeout(() => element.remove(), 300);
        }, tone === 'error' ? 5000 : 3000);
    };

    // Onay penceresi sekme görünümünün dışında (body) açılır: sekme geçiş animasyonu
    // `position: fixed` öğelerin konumunu bozacağı için.
    ns.confirmDialog = function confirmDialog({ title, message, confirmLabel, cancelLabel = 'İptal' }) {
        return new Promise(resolve => {
            const previousFocus = document.activeElement;
            const backdrop = document.createElement('div');
            backdrop.className = 'tesbihat-dialog-backdrop';
            backdrop.innerHTML = `
                <div class="tesbihat-dialog" role="alertdialog" aria-modal="true" aria-labelledby="tesbihatDialogTitle" aria-describedby="tesbihatDialogMessage">
                    <h2 id="tesbihatDialogTitle">${window.escapeHtml(title)}</h2>
                    <p id="tesbihatDialogMessage">${window.escapeHtml(message)}</p>
                    <div class="tesbihat-dialog-actions">
                        <button type="button" data-dialog-cancel>${window.escapeHtml(cancelLabel)}</button>
                        <button type="button" class="is-confirm" data-dialog-confirm>${window.escapeHtml(confirmLabel)}</button>
                    </div>
                </div>
            `;

            const [cancelButton, confirmButton] = backdrop.querySelectorAll('button');
            const close = result => {
                document.removeEventListener('keydown', onKeyDown, true);
                backdrop.remove();
                if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus({ preventScroll: true });
                resolve(result);
            };
            function onKeyDown(event) {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    close(false);
                    return;
                }
                if (event.key !== 'Tab') return;
                // Odak iki buton arasında kalır.
                const next = document.activeElement === cancelButton ? confirmButton : cancelButton;
                event.preventDefault();
                next.focus();
            }

            cancelButton.addEventListener('click', () => close(false));
            confirmButton.addEventListener('click', () => close(true));
            backdrop.addEventListener('click', event => {
                if (event.target === backdrop) close(false);
            });
            document.addEventListener('keydown', onKeyDown, true);
            document.body.appendChild(backdrop);
            cancelButton.focus({ preventScroll: true });
        });
    };

    ns.readStorage = function readStorage(key) {
        try {
            return window.localStorage.getItem(key);
        } catch (_error) {
            return null;
        }
    };

    ns.writeStorage = function writeStorage(key, value) {
        try {
            window.localStorage.setItem(key, String(value));
        } catch (_error) {
            // Gizli sekme gibi depolamanın kapalı olduğu durumlarda tercih hatırlanmaz.
        }
    };
})();
