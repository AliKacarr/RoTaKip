(function () {
    const ns = window.RoTaKipTefekkur = window.RoTaKipTefekkur || {};

    // Ana listedeki bölümler. `kind` hangi görünümün açılacağını belirler:
    //  - slides: kaydırmalı okuyucu (`modes` varsa başlıkta Metin / Resim anahtarı çıkar)
    //  - zikirmatik / radio: kendi araç görünümleri
    ns.SECTIONS = Object.freeze({
        ayet: {
            label: 'Ayet',
            kind: 'slides',
            source: { type: 'text', category: 'ayet' },
            emptyMessage: 'Henüz ayet eklenmedi.'
        },
        hadis: {
            label: 'Hadis',
            kind: 'slides',
            source: { type: 'text', category: 'hadis' },
            emptyMessage: 'Henüz hadis eklenmedi.'
        },
        dua: {
            label: 'Dua',
            kind: 'slides',
            source: { type: 'text', category: 'dua' },
            emptyMessage: 'Henüz dua eklenmedi.'
        },
        risale: {
            label: 'Risale-i Nur',
            kind: 'slides',
            defaultMode: 'metin',
            modes: {
                metin: { label: 'Metin', icon: 'fa-solid fa-align-left', source: { type: 'text', category: 'risale' }, emptyMessage: 'Henüz Risale-i Nur metni eklenmedi.' },
                resim: { label: 'Resim', icon: 'fa-regular fa-image', source: { type: 'image', category: 'risale' }, emptyMessage: 'Henüz Risale-i Nur görseli eklenmedi.' }
            }
        },
        esma: {
            label: 'Esmaül Hüsna',
            kind: 'slides',
            source: { type: 'esma' },
            chip: 'index',
            emptyMessage: 'Esmaül Hüsna listesi yüklenemedi.'
        },
        zikirmatik: { label: 'Zikirmatik', kind: 'zikirmatik' },
        'kuran-radyo': { label: 'Diyanet Kur\'an Radyo', kind: 'radio', icon: 'fa-solid fa-tower-broadcast' },
        'risalet-radyo': { label: 'Diyanet Risalet Radyo', kind: 'radio', icon: 'fa-solid fa-radio' }
    });

    ns.findSection = function findSection(key) {
        return typeof key === 'string' && Object.hasOwn(ns.SECTIONS, key) ? ns.SECTIONS[key] : null;
    };

    ns.findMode = function findMode(section, mode) {
        if (!section?.modes || typeof mode !== 'string' || !Object.hasOwn(section.modes, mode)) return null;
        return section.modes[mode];
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
        const data = await response.json().catch(() => null);
        if (!response.ok || !data || data.success === false) {
            throw new Error(data?.message || 'İçerik yüklenemedi.');
        }
        return data;
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
        }, tone === 'error' ? 4000 : 2200);
    };

    // "ER-RAHMAN" → "Er-Rahman", "ZÜ'L-CELALİ VE'L-İKRAM" → "Zü'l-Celali ve'l-İkram"
    ns.toTitleCaseTr = function toTitleCaseTr(value) {
        return String(value || '')
            .toLocaleLowerCase('tr-TR')
            .replace(/(^|[\s-])(\S)/g, (_match, separator, letter) => separator + letter.toLocaleUpperCase('tr-TR'))
            .replace(/(\s)Ve'l-/g, '$1ve\'l-');
    };

    // Titreşim API'si yalnızca Android tarayıcılarında etkilidir (iOS Safari desteklemez).
    ns.canVibrate = function canVibrate() {
        return typeof navigator.vibrate === 'function' && window.matchMedia('(pointer: coarse)').matches;
    };

    ns.prefersReducedMotion = function prefersReducedMotion() {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    };

    ns.copyText = async function copyText(text) {
        if (navigator.clipboard?.writeText && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return;
        }
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();
        if (!copied) throw new Error('Kopyalama desteklenmiyor');
    };

    ns.downloadBlob = function downloadBlob(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    // Pencereler sekme görünümünün dışında (body) açılır: sekme geçiş animasyonu
    // `position: fixed` öğelerin konumunu bozar. Odak pencere içinde tutulur, Esc kapatır.
    ns.openSheet = function openSheet({ title, className = '', render, onClose, labelId = 'tefekkurSheetTitle' }) {
        const previousFocus = document.activeElement;
        const backdrop = document.createElement('div');
        backdrop.className = 'tefekkur-sheet-backdrop';
        backdrop.innerHTML = `
            <div class="tefekkur-sheet ${className}" role="dialog" aria-modal="true" aria-labelledby="${labelId}">
                <div class="tefekkur-sheet-header">
                    <h2 id="${labelId}">${window.escapeHtml(title)}</h2>
                    <button type="button" class="tefekkur-sheet-close" data-sheet-close aria-label="Kapat"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
                </div>
                <div class="tefekkur-sheet-body"></div>
            </div>
        `;
        const sheet = backdrop.querySelector('.tefekkur-sheet');
        const body = backdrop.querySelector('.tefekkur-sheet-body');
        let closed = false;

        function close(result) {
            if (closed) return;
            closed = true;
            document.removeEventListener('keydown', onKeyDown, true);
            backdrop.remove();
            if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus({ preventScroll: true });
            if (typeof onClose === 'function') onClose(result);
        }

        function onKeyDown(event) {
            if (event.key === 'Escape') {
                event.preventDefault();
                close();
                return;
            }
            if (event.key !== 'Tab') return;
            const focusable = Array.from(sheet.querySelectorAll('button:not([disabled]), [href], input:not([disabled])'));
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }

        backdrop.addEventListener('click', event => {
            if (event.target === backdrop || event.target.closest('[data-sheet-close]')) close();
        });
        document.addEventListener('keydown', onKeyDown, true);
        render(body, close);
        document.body.appendChild(backdrop);
        (sheet.querySelector('[data-autofocus]') || sheet.querySelector('[data-sheet-close]')).focus({ preventScroll: true });
        return close;
    };

    ns.confirmDialog = function confirmDialog({ title, message, confirmLabel, cancelLabel = 'Vazgeç' }) {
        return new Promise(resolve => {
            let result = false;
            ns.openSheet({
                title,
                className: 'is-confirm',
                labelId: 'tefekkurConfirmTitle',
                onClose: () => resolve(result),
                render(body, close) {
                    body.innerHTML = `
                        <p class="tefekkur-sheet-message">${window.escapeHtml(message)}</p>
                        <div class="tefekkur-sheet-actions">
                            <button type="button" data-autofocus data-confirm-cancel>${window.escapeHtml(cancelLabel)}</button>
                            <button type="button" class="is-danger" data-confirm-ok>${window.escapeHtml(confirmLabel)}</button>
                        </div>
                    `;
                    body.querySelector('[data-confirm-cancel]').addEventListener('click', () => close());
                    body.querySelector('[data-confirm-ok]').addEventListener('click', () => {
                        result = true;
                        close();
                    });
                }
            });
        });
    };
})();
