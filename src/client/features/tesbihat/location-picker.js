(function () {
    const ns = window.RoTaKipTesbihat;
    const RESOLVE_LOCATION_URL = '/api/prayer-locations/resolve';
    const MAX_SEARCH_RESULTS = 80;

    let elements = null;
    let provinces = [];
    let busy = false;

    function queryElements() {
        return {
            view: document.querySelector('.tesbihat-view[data-view="location"]'),
            search: document.getElementById('tesbihatLocationSearch'),
            geoButton: document.getElementById('tesbihatUseMyLocation'),
            geoLabel: document.querySelector('#tesbihatUseMyLocation [data-geo-label]'),
            selected: document.getElementById('tesbihatSelectedLocation'),
            listTitle: document.getElementById('tesbihatLocationListTitle'),
            listCount: document.getElementById('tesbihatLocationListCount'),
            list: document.getElementById('tesbihatLocationList')
        };
    }

    function groupProvinces(locations) {
        const byName = new Map();
        locations.forEach(location => {
            if (!byName.has(location.il)) {
                byName.set(location.il, {
                    name: location.il,
                    plaka: location.plaka || '',
                    searchName: ns.normalizeSearch(location.il),
                    districts: []
                });
            }
            byName.get(location.il).districts.push({
                ...location,
                searchName: ns.normalizeSearch(location.ilce)
            });
        });
        return [...byName.values()].map(province => ({
            ...province,
            // İl adıyla aynı olan ilçe Diyanet listesinde merkezi temsil eder; ilk sırada gösterilir.
            districts: province.districts.sort((a, b) => Number(b.ilce === province.name) - Number(a.ilce === province.name)
                || a.ilce.localeCompare(b.ilce, 'tr'))
        }));
    }

    function selectedLocationId() {
        return ns.schedule.snapshot().location?.locationId ?? null;
    }

    function setGeoLoading(loading) {
        elements.geoButton.disabled = loading;
        elements.geoButton.classList.toggle('is-loading', loading);
        elements.geoButton.setAttribute('aria-busy', String(loading));
        elements.geoLabel.textContent = loading ? 'Konum alınıyor...' : 'Konumumu kullan';
    }

    function districtLabel(district) {
        return district.ilce === district.il ? `${district.ilce} (Merkez)` : district.ilce;
    }

    function createDistrictButton(district, options = {}) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = options.withProvince ? 'tesbihat-district tesbihat-search-result' : 'tesbihat-district';
        button.dataset.locationId = String(district.locationId);
        const isSelected = district.locationId === selectedLocationId();
        button.classList.toggle('is-selected', isSelected);
        if (isSelected) button.setAttribute('aria-current', 'true');

        if (options.withProvince) {
            button.innerHTML = `
                <span class="tesbihat-plate">${window.escapeHtml(district.plaka)}</span>
                <span class="tesbihat-district-text">${window.escapeHtml(districtLabel(district))}<small>${window.escapeHtml(district.il)}</small></span>
            `;
        } else {
            button.innerHTML = `<span class="tesbihat-district-text">${window.escapeHtml(districtLabel(district))}</span>`;
        }
        if (isSelected) {
            button.insertAdjacentHTML('beforeend', '<i class="fa-solid fa-check" aria-hidden="true"></i>');
        }
        return button;
    }

    function createProvinceItem(province) {
        const item = document.createElement('li');
        item.className = 'tesbihat-province';
        const listId = `tesbihatDistricts${province.plaka || ns.normalizeSearch(province.name)}`;
        item.innerHTML = `
            <button type="button" class="tesbihat-province-toggle" aria-expanded="false" aria-controls="${listId}">
                <span class="tesbihat-plate">${window.escapeHtml(province.plaka)}</span>
                <span class="tesbihat-province-text">${window.escapeHtml(province.name)}<small>${province.districts.length} ilçe</small></span>
                <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
            </button>
            <div id="${listId}" class="tesbihat-district-list" hidden></div>
        `;
        item.querySelector('.tesbihat-province-toggle').addEventListener('click', event => {
            const toggle = event.currentTarget;
            const panel = item.querySelector('.tesbihat-district-list');
            const expanded = toggle.getAttribute('aria-expanded') === 'true';
            if (!expanded && panel.childElementCount === 0) {
                panel.replaceChildren(...province.districts.map(district => createDistrictButton(district)));
            }
            toggle.setAttribute('aria-expanded', String(!expanded));
            item.classList.toggle('is-open', !expanded);
            panel.hidden = expanded;
        });
        return item;
    }

    function renderProvinceList() {
        elements.listTitle.textContent = 'Tüm İller';
        elements.listCount.textContent = provinces.length ? `${provinces.length} il` : '';
        elements.list.replaceChildren(...provinces.map(createProvinceItem));
    }

    function renderSearchResults(query) {
        const normalized = ns.normalizeSearch(query);
        const plateQuery = /^\d{1,2}$/.test(normalized) ? normalized.padStart(2, '0') : null;
        const results = [];
        provinces.forEach(province => {
            const provinceMatches = plateQuery
                ? province.plaka === plateQuery
                : province.searchName.includes(normalized);
            province.districts.forEach(district => {
                if (provinceMatches || (!plateQuery && district.searchName.includes(normalized))) {
                    results.push(district);
                }
            });
        });

        elements.listTitle.textContent = 'Arama sonuçları';
        elements.listCount.textContent = `${results.length} sonuç`;
        if (results.length === 0) {
            const empty = document.createElement('li');
            empty.className = 'tesbihat-location-empty';
            empty.textContent = 'Aramanızla eşleşen il veya ilçe bulunamadı.';
            elements.list.replaceChildren(empty);
            return;
        }
        elements.list.replaceChildren(...results.slice(0, MAX_SEARCH_RESULTS).map(district => {
            const item = document.createElement('li');
            item.appendChild(createDistrictButton(district, { withProvince: true }));
            return item;
        }));
    }

    function renderList() {
        const query = elements.search.value.trim();
        if (query) renderSearchResults(query);
        else renderProvinceList();
    }

    async function chooseLocation(locationId, successMessage) {
        if (busy) return;
        busy = true;
        elements.view.classList.add('is-busy');
        try {
            const loaded = await ns.schedule.setLocation(locationId);
            if (!loaded) {
                ns.toast('Bu konumun vakitleri yüklenemedi. Lütfen tekrar deneyin.', 'error');
                return;
            }
            ns.toast(successMessage || `Konumunuz: ${ns.formatLocation(ns.schedule.snapshot().location)}`);
            ns.back();
        } finally {
            busy = false;
            elements.view.classList.remove('is-busy');
        }
    }

    function getPosition() {
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: false,
                timeout: 12000,
                maximumAge: 10 * 60 * 1000
            });
        });
    }

    function geolocationErrorMessage(error) {
        if (navigator.onLine === false) return 'İnternet bağlantısı yok. Bağlantınızı kontrol edip tekrar deneyin ya da listeden seçin.';
        if (error?.name === 'OutsideTurkeyError') return 'Şimdilik yalnızca Türkiye\'deki konumlar destekleniyor. Lütfen listeden seçin.';
        if (error?.name === 'NoMatchError') return 'Konumunuza uygun il bulunamadı. Lütfen listeden seçin.';
        if (error?.name === 'GeocodeError') return 'Konum alındı ancak il/ilçe bilgisi şu an çözümlenemedi. Lütfen birazdan tekrar deneyin ya da listeden seçin.';
        if (error?.code === 1) return 'Konum izni verilmedi. Tarayıcı/telefon ayarlarından bu site için konum iznini açabilir ya da listeden seçebilirsiniz.';
        if (error?.code === 2) return 'Cihazınız konumu belirleyemedi. Telefonun konum (GPS) servisinin açık olduğundan emin olun ya da listeden seçin.';
        if (error?.code === 3) return 'Konum zamanında alınamadı. Lütfen tekrar deneyin ya da listeden seçin.';
        return 'Konumunuz belirlenemedi. Lütfen listeden seçin.';
    }

    // İl/ilçe çözümlemesi sunucuda yapılır: tarayıcıdan üçüncü taraf servise doğrudan istek,
    // reklam engelleyici/ağ kısıtlarına takılıp sık sık başarısız oluyordu.
    async function resolveLocation(latitude, longitude) {
        let response;
        try {
            response = await fetch(`${RESOLVE_LOCATION_URL}?latitude=${latitude}&longitude=${longitude}`, {
                headers: { Accept: 'application/json' }
            });
        } catch (error) {
            const wrapped = new Error(error.message);
            wrapped.name = 'GeocodeError';
            throw wrapped;
        }
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.location) return data;
        const failure = new Error(data.message || `Konum servisi ${response.status}`);
        failure.name = data.outsideTurkey ? 'OutsideTurkeyError' : response.status === 404 ? 'NoMatchError' : 'GeocodeError';
        throw failure;
    }

    async function useMyLocation() {
        if (busy) return;
        if (!navigator.geolocation) {
            ns.toast('Tarayıcınız konum özelliğini desteklemiyor. Lütfen listeden seçin.', 'error');
            return;
        }

        if (window.isSecureContext === false) {
            ns.toast('Konum özelliği yalnızca güvenli (HTTPS) bağlantıda çalışır. Siteyi https:// adresinden açın ya da listeden seçin.', 'error');
            return;
        }

        setGeoLoading(true);
        try {
            const position = await getPosition();
            // Koordinatlar ilçe tespiti için yeterli hassasiyete (~1 km) yuvarlanarak gönderilir.
            const latitude = position.coords.latitude.toFixed(2);
            const longitude = position.coords.longitude.toFixed(2);
            const { location, exact } = await resolveLocation(latitude, longitude);
            const message = exact || location.ilce === location.il
                ? `Konumunuz: ${ns.formatLocation(location)}`
                : `${location.il} için en yakın kayıtlı konum seçildi.`;
            await chooseLocation(location.locationId, message);
        } catch (error) {
            console.warn('Otomatik konum tespiti başarısız:', error);
            ns.toast(geolocationErrorMessage(error), 'error');
        } finally {
            setGeoLoading(false);
        }
    }

    async function ensureProvinces() {
        if (provinces.length) return;
        provinces = groupProvinces(await ns.schedule.locations());
    }

    function bindEvents() {
        elements.search.addEventListener('input', renderList);
        elements.geoButton.addEventListener('click', useMyLocation);
        elements.list.addEventListener('click', event => {
            const district = event.target.closest('.tesbihat-district');
            if (district) chooseLocation(Number(district.dataset.locationId));
        });
    }

    ns.locationPicker = {
        init() {
            elements = queryElements();
            bindEvents();
        },
        async open() {
            // Ekran şimdiki vaktin renklerini taşır; Güneş'te tesbihat olmadığı için sabah paleti kullanılır.
            const schedule = ns.schedule.snapshot().schedule;
            elements.view.dataset.vakit = schedule ? (schedule.current.tesbihat || 'sabah') : 'yatsi';
            elements.search.value = '';
            elements.selected.textContent = ns.formatLocation(ns.schedule.snapshot().location) || '—';
            try {
                await ensureProvinces();
                renderList();
            } catch (error) {
                console.warn('Konum listesi yüklenemedi:', error);
                elements.listCount.textContent = '';
                elements.list.innerHTML = '<li class="tesbihat-location-empty">Konum listesi yüklenemedi. Lütfen daha sonra tekrar deneyin.</li>';
            }
        }
    };
})();
