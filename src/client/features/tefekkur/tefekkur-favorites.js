// ==================== Tefekkür: Kaydedilenler ====================
// Okuyucudaki yıldızla kaydedilen ayet, hadis, dua, Risale-i Nur (metin/görsel) ve Esmaül Hüsna kartları
// yalnız bu cihazda (localStorage) saklanır. Kayıt içeriğin o anki kopyasını tutar; böylece liste
// sunucuya gitmeden çizilir. /tefekkur?bolum=kaydedilenler[&mod=<bölüm>] kayıtları okuyucuyla
// (sağa-sola kaydırma, Rastgele, türe göre süzme) gösterir; bu dosya yalnız veriyi ve tür seçim
// penceresini sağlar.

(function () {
    const ns = window.RoTaKipTefekkur;
    const STORAGE_KEY = 'rotakip:tefekkur-favorites';
    const MAX_ITEMS = 500;
    const MAX_TEXT_LENGTH = 20000;
    const MAX_FIELD_LENGTH = 500;
    // Kaydedilebilen bölümler (ana listedeki sırayla); tür seçimi de bu sırayı izler.
    const SAVABLE_SECTIONS = ['ayet', 'hadis', 'dua', 'risale', 'esma'];
    const ALL_FILTER = { key: 'all', label: 'Tümü', icon: 'fa-solid fa-layer-group' };
    const SECTION_ICONS = {
        ayet: 'fa-solid fa-book-quran',
        hadis: 'fa-solid fa-scroll',
        dua: 'fa-solid fa-hands-praying',
        risale: 'fa-solid fa-book-open',
        esma: 'fa-solid fa-star-and-crescent'
    };

    let entries = null;
    const listeners = new Set();

    // ---------- Depolama ----------

    function text(value, max = MAX_FIELD_LENGTH) {
        return typeof value === 'string' ? value.slice(0, max) : '';
    }

    // Görseller sunucunun kendi klasörlerinden gelir (`/risale/...`); başka adres kabul edilmez.
    function safeImagePath(value) {
        const path = text(value);
        return path.startsWith('/') && !path.startsWith('//') ? path : '';
    }

    function normalize(raw) {
        if (!raw || typeof raw.key !== 'string' || !raw.key || raw.key.length > MAX_FIELD_LENGTH) return null;
        if (!SAVABLE_SECTIONS.includes(raw.section)) return null;
        const entry = {
            key: raw.key,
            section: raw.section,
            mode: raw.mode === 'metin' || raw.mode === 'resim' ? raw.mode : '',
            arabic: text(raw.arabic),
            title: text(raw.title),
            text: text(raw.text, MAX_TEXT_LENGTH),
            caption: text(raw.caption),
            image: safeImagePath(raw.image),
            name: text(raw.name),
            savedAt: Number.isFinite(raw.savedAt) ? raw.savedAt : 0
        };
        return entry.text || entry.title || entry.image ? entry : null;
    }

    function load() {
        if (entries) return entries;
        entries = [];
        try {
            const parsed = JSON.parse(ns.readStorage(STORAGE_KEY) || 'null');
            const seen = new Set();
            (Array.isArray(parsed?.items) ? parsed.items : []).forEach(raw => {
                const entry = normalize(raw);
                if (!entry || seen.has(entry.key)) return;
                seen.add(entry.key);
                entries.push(entry);
            });
        } catch (_error) {
            entries = [];
        }
        return entries;
    }

    function persist() {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, items: entries }));
            return true;
        } catch (error) {
            console.warn('Kaydedilenler saklanamadı:', error);
            return false;
        }
    }

    function notify() {
        listeners.forEach(listener => listener());
    }

    function has(key) {
        return Boolean(key) && load().some(entry => entry.key === key);
    }

    // Okuyucudaki kart kaydedilir; zaten kayıtlıysa çıkarılır. Sonuç: true (kaydedildi), false
    // (çıkarıldı) ya da null (kaydedilemedi).
    function toggle(item, { section, mode = '' } = {}) {
        if (!item?.key) return null;
        load();
        if (has(item.key)) {
            remove(item.key);
            return false;
        }
        if (entries.length >= MAX_ITEMS) {
            ns.toast(`En fazla ${MAX_ITEMS} içerik kaydedilebilir`, 'error');
            return null;
        }
        const entry = normalize({ ...item, section, mode, savedAt: Date.now() });
        if (!entry) return null;
        entries.unshift(entry);
        if (!persist()) {
            entries.shift();
            ns.toast('Kaydedilemedi', 'error');
            return null;
        }
        notify();
        return true;
    }

    function remove(key) {
        load();
        const index = entries.findIndex(entry => entry.key === key);
        if (index < 0) return;
        entries.splice(index, 1);
        persist();
        notify();
    }

    function sectionLabel(section) {
        return ns.findSection(section)?.label || 'Tefekkür';
    }

    // ---------- Okuyucu için ----------

    // `mod` olarak yalnız kaydedilebilen bir bölüm anahtarı geçerlidir; başka her şey "Tümü" sayılır.
    function normalizeFilter(value) {
        return SAVABLE_SECTIONS.includes(value) ? value : ALL_FILTER.key;
    }

    function filterInfo(value) {
        const key = normalizeFilter(value);
        return key === ALL_FILTER.key ? ALL_FILTER : { key, label: sectionLabel(key), icon: SECTION_ICONS[key] };
    }

    // Kayıtlar en yeniden eskiye, okuyucunun kart biçiminde döner. `badge` kartın hangi bölümden olduğunu
    // gösterir ve kopyalama/paylaşımda bölüm adı olarak kullanılır.
    function itemsFor(value) {
        const key = normalizeFilter(value);
        return load()
            .filter(entry => key === ALL_FILTER.key || entry.section === key)
            .map(entry => ({ ...entry, badge: sectionLabel(entry.section) }));
    }

    function countFor(value) {
        const key = normalizeFilter(value);
        return load().filter(entry => key === ALL_FILTER.key || entry.section === key).length;
    }

    // Tür seçim penceresi: "Tümü" ve kaydı olan türler, kayıt sayılarıyla. Seçilen tür `onSelect`e verilir.
    function openFilterSheet(active, onSelect) {
        const current = normalizeFilter(active);
        const options = [ALL_FILTER, ...SAVABLE_SECTIONS.filter(section => countFor(section) > 0).map(filterInfo)];
        ns.openSheet({
            title: 'Tür Seç',
            titleIcon: 'fa-solid fa-filter',
            className: 'is-index',
            labelId: 'tefekkurSavedFilterTitle',
            render(body, close) {
                const list = document.createElement('ol');
                list.className = 'tefekkur-index-list';
                options.forEach(option => {
                    const entry = document.createElement('li');
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'tefekkur-index-item';
                    button.dataset.filter = option.key;
                    if (option.key === current) {
                        button.classList.add('is-current');
                        button.setAttribute('aria-current', 'true');
                        button.dataset.autofocus = '';
                    }
                    const number = document.createElement('span');
                    number.className = 'tefekkur-index-number';
                    number.innerHTML = `<i class="${option.icon}" aria-hidden="true"></i>`;
                    const name = document.createElement('span');
                    name.className = 'tefekkur-index-text';
                    const label = document.createElement('span');
                    label.className = 'tefekkur-index-name';
                    label.textContent = option.label;
                    const count = document.createElement('span');
                    count.className = 'tefekkur-index-desc';
                    count.textContent = `${countFor(option.key)} içerik`;
                    name.append(label, count);
                    const check = document.createElement('i');
                    check.className = 'fa-solid fa-check tefekkur-index-check';
                    check.setAttribute('aria-hidden', 'true');
                    button.append(number, name, check);
                    entry.appendChild(button);
                    list.appendChild(entry);
                });
                list.addEventListener('click', event => {
                    const button = event.target.closest('.tefekkur-index-item');
                    if (!button) return;
                    close();
                    if (button.dataset.filter !== current) onSelect(button.dataset.filter);
                });
                body.appendChild(list);
            }
        });
    }

    function init() {
        // Başka bir sekmede yapılan değişiklikler de yansır (açık okuyucudaki yıldız güncellenir).
        window.addEventListener('storage', event => {
            if (event.key !== STORAGE_KEY) return;
            entries = null;
            notify();
        });
    }

    ns.favorites = {
        SAVABLE_SECTIONS,
        has,
        toggle,
        remove,
        count: () => load().length,
        normalizeFilter,
        filterInfo,
        itemsFor,
        countFor,
        openFilterSheet,
        onChange(listener) {
            listeners.add(listener);
        },
        init
    };
})();
