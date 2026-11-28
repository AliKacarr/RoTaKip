/*
 * Okumalar › Yönetim · Günlük alanlar (yalnız yönetici).
 * İlk alan okuma alanıdır (varsayılan "Kitap okuma"): kapatılamaz, birimi sayfa ya da dakikadır;
 * lig ve seri bu alana göre hesaplanır. Yönetici Kur'an, Cevşen gibi yeni alanlar ekleyebilir.
 * Kaldırılan alan silinmez, arşivlenir; "Kaldırılan alanlar"dan geri eklenebilir.
 * Her alan "zorunlu" işaretlenebilir: üyeler günün kaydını, zorunlu alanlar dolmadan kaydedemez.
 * Her değişiklik (ayrıntı paneli, ekleme, silme, sıra) hemen kaydedilir; ayrı bir "kaydet" adımı yoktur.
 * Kayıt: PUT /api/cetele/:groupId/config
 */
(function initializeCeteleSettings() {
  const UNITS = [
    ['sayfa', 'sayfa'],
    ['dakika', 'dakika'],
    ['vakit', 'vakit'],
    ['bab', 'bab'],
    ['saat', 'saat'],
    ['adet', 'adet'],
    ['', 'birimsiz']
  ];
  const READ_UNITS = [['sayfa', 'sayfa'], ['dakika', 'dakika']];
  const PRESETS = [
    { key: 'kuran', label: 'Kur\'an-ı Kerim', icon: 'fa-book-quran', type: 'sayi', unit: 'sayfa', options: [1, 2, 5, 10, 20], step: 1, max: 604, allowCustom: true },
    { key: 'cevsen', label: 'Cevşen', icon: 'fa-book-open', type: 'sayi', unit: 'bab', options: [1, 3, 5, 10, 25], step: 1, max: 100, allowCustom: true },
    { key: 'namaz', label: 'Namaz', icon: 'fa-person-praying', type: 'sayi', unit: 'vakit', options: [1, 2, 3, 4, 5], step: 1, max: 5, allowCustom: false },
    { key: 'tesbihat', label: 'Tesbihat', icon: 'fa-hands-praying', type: 'sayi', unit: 'vakit', options: [1, 2, 3, 4, 5], step: 1, max: 5, allowCustom: false },
    { key: 'hizmet', label: 'Hizmet', icon: 'fa-hand-holding-heart', type: 'sayi', unit: 'saat', options: [0.5, 1, 2, 3], step: 0.5, max: 24, allowCustom: true },
    { key: 'not', label: 'Günlük not', icon: 'fa-note-sticky', type: 'metin', unit: '', options: [], step: 1, max: 280, allowCustom: true }
  ];
  let draft = null;
  let draftGroupId = null;
  let pending = 0; // sunucuya gitmeyi bekleyen/giden kayıt sayısı
  let saveChain = Promise.resolve();

  function esc(value) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(String(value ?? ''))
      : String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  }

  function isAdmin() {
    return typeof LocalStorageManager !== 'undefined' && LocalStorageManager.isAdmin();
  }

  function cloneField(field) {
    return { ...field, options: [...(field.options || [])], archived: field.archived === true };
  }

  // Okuma alanı (ilk açık alan) başta, arşivlenenler sonda tutulur.
  function cloneConfig(config) {
    const fields = config.fields.map(cloneField);
    return {
      fields: [...fields.filter(field => !field.archived), ...fields.filter(field => field.archived)],
      existingKeys: new Set(config.fields.map(field => field.key))
    };
  }

  function fieldSummary(field) {
    if (field.type === 'metin') return 'kısa metin';
    const options = field.options.length ? field.options.map(formatNumber).join(' · ') : 'serbest giriş';
    const zero = field.zeroLabel ? ` · ${field.zeroLabel}` : '';
    return `${field.unit || 'birimsiz'} · ${options}${zero}`;
  }

  function slugify(label) {
    const map = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
    return String(label || '')
      .toLocaleLowerCase('tr-TR')
      .replace(/[çğıöşüâîû]/g, ch => map[ch] || ch)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 20);
  }

  function uniqueKey(label) {
    const used = new Set(draft.fields.map(field => field.key));
    let base = slugify(label);
    if (!/^[a-z][a-z0-9-]{1,23}$/.test(base)) base = 'alan';
    let key = base;
    let index = 2;
    while (used.has(key)) key = `${base}-${index++}`.slice(0, 24);
    return key;
  }

  function parseOptions(text) {
    return String(text || '')
      .split(/,\s+|[\s;]+/)
      .map(part => part.trim().replace(',', '.'))
      .filter(Boolean)
      .map(Number);
  }

  // ---- Alan ekleme ve düzenleme --------------------------------------------

  function addField(field) {
    void commit(() => {
      const existing = draft.fields.find(item => item.key === field.key);
      if (existing) {
        existing.archived = false;
      } else {
        draft.fields.push(cloneField({ ...field, archived: false }));
      }
    });
  }

  function openAddSheet() {
    if (!window.RoTaKipBottomSheet) return;
    const activeKeys = new Set(draft.fields.filter(field => !field.archived).map(field => field.key));
    const content = document.createElement('div');
    content.className = 'ct-presets';
    content.innerHTML = `
      <div class="ct-preset-grid">
        ${PRESETS.map(preset => `
          <button type="button" class="ct-preset" data-preset="${preset.key}" ${activeKeys.has(preset.key) ? 'disabled' : ''}>
            <i class="fa-solid ${preset.icon}" aria-hidden="true"></i>
            <strong>${esc(preset.label)}</strong>
            <small>${activeKeys.has(preset.key) ? 'Eklendi' : esc(fieldSummary(preset))}</small>
          </button>`).join('')}
      </div>
      <button type="button" class="ok-btn ok-btn-soft ok-btn-block" data-action="custom"><i class="fa-solid fa-pen" aria-hidden="true"></i> Kendi alışkanlığını oluştur</button>`;
    const sheet = window.RoTaKipBottomSheet.open({
      title: 'Alışkanlık ekle',
      subtitle: 'Üyeler bu alışkanlığı her gün doldurur',
      className: 'ok-sheet',
      content
    });
    content.querySelectorAll('[data-preset]').forEach(button => {
      button.addEventListener('click', () => {
        const preset = PRESETS.find(item => item.key === button.dataset.preset);
        sheet.close();
        if (!preset) return;
        const field = { ...preset };
        delete field.icon;
        addField(field);
      });
    });
    content.querySelector('[data-action="custom"]').addEventListener('click', () => {
      sheet.close();
      window.setTimeout(() => openFieldSheet(null), 280);
    });
  }

  function openFieldSheet(index) {
    if (!window.RoTaKipBottomSheet) return;
    const isNew = index === null;
    const isRead = index === 0;
    const field = isNew
      ? { key: '', label: '', type: 'sayi', unit: 'adet', options: [1, 2, 3, 5], step: 1, max: 100, allowCustom: true, zeroLabel: '', required: false, archived: false }
      : draft.fields[index];
    const typeLocked = !isNew && draft.existingKeys.has(field.key);
    const units = isRead ? READ_UNITS : UNITS;
    const content = document.createElement('form');
    content.className = 'ct-field-form';
    content.noValidate = true;
    content.innerHTML = `
      ${isRead ? '<p class="ct-form-note"><i class="fa-solid fa-trophy" aria-hidden="true"></i> Lig ve seri bu alışkanlığa göre hesaplanır. Doldurulan her gün bir okuma günü sayılır.</p>' : ''}
      <label class="ct-form-row">
        <span>Ad</span>
        <input type="text" name="label" maxlength="30" required value="${esc(field.label)}" placeholder="${isRead ? 'Kitap okuma' : 'Ör. Kur\'an-ı Kerim'}" data-autofocus>
      </label>
      ${isRead ? '' : `
        <label class="ct-form-row">
          <span>Tür</span>
          <select name="type" ${typeLocked ? 'disabled' : ''}>
            <option value="sayi" ${field.type === 'sayi' ? 'selected' : ''}>Sayı</option>
            <option value="metin" ${field.type === 'metin' ? 'selected' : ''}>Kısa metin</option>
          </select>
        </label>`}
      <div class="ct-number-settings">
        <label class="ct-form-row">
          <span>Birim</span>
          <select name="unit">
            ${units.map(([value, label]) => `<option value="${value}" ${field.unit === value ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </label>
        <label class="ct-form-row">
          <span>Hızlı seçimler <small>(boşlukla ayırın)</small></span>
          <input type="text" name="options" inputmode="decimal" value="${esc(field.options.map(formatNumber).join(' '))}" placeholder="5 10 20 30">
        </label>
        <label class="ct-form-row">
          <span>${isRead ? 'Okumadım' : '"Yapmadım"'} seçeneğinin adı <small>(${isRead ? 'boşsa "Okumadım"' : 'isteğe bağlı'})</small></span>
          <input type="text" name="zeroLabel" maxlength="20" value="${esc(field.zeroLabel || '')}" placeholder="${isRead ? 'Ör. Yapmadım' : 'Ör. Kılmadım'}">
        </label>
        ${isRead ? '' : `
          <label class="ct-form-check">
            <input type="checkbox" name="allowCustom" ${field.allowCustom ? 'checked' : ''}>
            <span>Hızlı seçimler dışında değer girilebilsin</span>
          </label>`}
        <div class="ct-form-pair ct-custom-limits">
          ${isRead ? '' : `
            <label class="ct-form-row">
              <span>Adım</span>
              <select name="step">
                ${[1, 0.5, 0.25].map(step => `<option value="${step}" ${field.step === step ? 'selected' : ''}>${formatNumber(step)}</option>`).join('')}
              </select>
            </label>`}
          <label class="ct-form-row">
            <span>Üst sınır</span>
            <input type="number" name="max" min="1" max="99999" step="any" value="${field.max}">
          </label>
        </div>
      </div>
      <label class="ct-form-check">
        <input type="checkbox" name="required" ${field.required ? 'checked' : ''}>
        <span>Doldurulması zorunlu alışkanlık</span>
      </label>
      <p class="ct-form-error" role="alert" hidden></p>
      <div class="ct-form-actions">
        <button type="submit" class="ok-btn ok-btn-primary ok-btn-block">${isNew ? 'Ekle' : 'Kaydet'}</button>
        ${isNew || isRead ? '' : `
          <button type="button" class="ok-btn ok-btn-ghost ok-btn-block ct-delete-btn" data-action="delete-field"><i class="fa-solid fa-trash-can" aria-hidden="true"></i> <span>Alışkanlığı sil</span></button>
          <p class="ct-delete-note" hidden>Silinen alışkanlığın geçmiş kayıtları korunur; "Silinen alışkanlıklar"dan geri eklenebilir. Silmek için tekrar dokunun.</p>`}
      </div>`;
    const sheet = window.RoTaKipBottomSheet.open({
      title: isNew ? 'Yeni alışkanlık' : field.label,
      subtitle: isRead ? 'Okuma alışkanlığı' : '',
      className: 'ok-sheet',
      content
    });
    const numberSettings = content.querySelector('.ct-number-settings');
    const typeSelect = content.elements.type;
    const currentType = () => (typeSelect ? typeSelect.value : 'sayi');
    const syncType = () => { numberSettings.hidden = currentType() === 'metin'; };
    typeSelect?.addEventListener('change', syncType);
    syncType();
    // Adım ve üst sınır yalnız serbest değer girişini sınırlar; yalnız hızlı seçim varsa gösterilmez.
    const limits = content.querySelector('.ct-custom-limits');
    const allowCustomInput = content.elements.allowCustom;
    const syncLimits = () => { limits.hidden = Boolean(allowCustomInput) && !allowCustomInput.checked; };
    allowCustomInput?.addEventListener('change', syncLimits);
    syncLimits();
    const deleteButton = content.querySelector('[data-action="delete-field"]');
    deleteButton?.addEventListener('click', async () => {
      const note = content.querySelector('.ct-delete-note');
      // İlk dokunuş uyarır, ikinci dokunuş siler (silinen alışkanlık arşivlenir).
      if (note.hidden) {
        note.hidden = false;
        deleteButton.classList.add('is-confirm');
        deleteButton.querySelector('span').textContent = 'Evet, sil';
        return;
      }
      deleteButton.disabled = true;
      const result = await commit(() => { field.archived = true; }, { inline: true });
      if (result.ok) {
        sheet.close();
        return;
      }
      deleteButton.disabled = false;
      const error = content.querySelector('.ct-form-error');
      error.textContent = result.error;
      error.hidden = false;
    });
    content.addEventListener('submit', async event => {
      event.preventDefault();
      const error = content.querySelector('.ct-form-error');
      const showError = message => {
        error.textContent = message;
        error.hidden = false;
      };
      const label = content.elements.label.value.trim().replace(/\s+/g, ' ');
      const type = currentType();
      const required = content.elements.required.checked;
      if (!label) return showError('Alışkanlık adı gerekli.');
      let next;
      if (type === 'metin') {
        next = { key: field.key, label, type, unit: '', options: [], step: 1, max: 280, allowCustom: true, zeroLabel: '', required, archived: false };
      } else {
        const options = [...new Set(parseOptions(content.elements.options.value))].sort((a, b) => a - b);
        const allowCustom = isRead ? true : content.elements.allowCustom.checked;
        const fitsStep = (value, size) => Math.abs(value / size - Math.round(value / size)) < 1e-9;
        let step = isRead ? 1 : Number(content.elements.step.value);
        let max = Number(content.elements.max.value);
        if (!allowCustom) {
          // Serbest giriş kapalıyken adım ve üst sınır hızlı seçimlerden türetilir.
          if (options.some(option => !Number.isFinite(option) || option < 0)) return showError('Hızlı seçimler geçerli sayılar olmalı.');
          step = [1, 0.5, 0.25].find(size => options.every(option => fitsStep(option, size)));
          if (!step) return showError('Hızlı seçimler en çok 0,25 hassasiyetinde olabilir.');
          max = Math.max(step, ...options);
        }
        const onStep = value => fitsStep(value, step);
        if (!Number.isFinite(max) || max < step || max > 99999 || !onStep(max)) return showError('Üst sınır adıma uygun bir sayı olmalı.');
        if (options.length > 8) return showError('En çok 8 hızlı seçim olabilir.');
        if (options.some(option => !Number.isFinite(option) || option < 0 || option > max || !onStep(option))) {
          return showError('Hızlı seçimler 0 ile üst sınır arasında ve adıma uygun olmalı.');
        }
        const zeroLabel = content.elements.zeroLabel.value.trim().replace(/\s+/g, ' ');
        if (!allowCustom && !options.length && !zeroLabel) return showError('Hızlı seçim ya da serbest giriş olmalı.');
        next = { key: field.key, label, type, unit: content.elements.unit.value, options, step, max, allowCustom, zeroLabel, required, archived: false };
      }
      error.hidden = true;
      const submitButton = content.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      const result = await commit(() => {
        if (isNew) {
          next.key = uniqueKey(label);
          draft.fields.push(next);
        } else {
          draft.fields[index] = next;
        }
      }, { inline: true });
      if (result.ok) {
        sheet.close();
        return;
      }
      submitButton.disabled = false;
      showError(result.error);
    });
  }

  function moveField(index, direction) {
    const target = index + direction;
    // Okuma alanı (0) yerinden oynatılamaz.
    if (index <= 0 || target <= 0 || target >= draft.fields.length) return;
    void commit(() => {
      const [field] = draft.fields.splice(index, 1);
      draft.fields.splice(target, 0, field);
    }, { silent: true });
  }

  // ---- Kaydetme ------------------------------------------------------------

  // Değişikliği taslağa uygular, ekranı hemen günceller ve kaydı sıraya koyar. Kayıtlar sırayla gider;
  // hata olursa taslak sunucudaki son geçerli yapılandırmaya döner.
  function commit(mutate, options = {}) {
    mutate();
    pending += 1;
    render();
    const result = saveChain.then(() => persist(options));
    saveChain = result;
    return result;
  }

  async function persist(options) {
    try {
      const response = await fetch(`/api/cetele/${encodeURIComponent(window.groupid)}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ fields: draft.fields })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Alışkanlıklar kaydedilemedi');
      window.currentGroupData = {
        ...(window.currentGroupData || {}),
        ceteleFields: data.group?.ceteleFields
      };
      window.RoTaKipCetele.setConfig(data.config);
      window.setCurrentAmountType?.(data.group && data.group.amountType);
      // Taslak korunur (kuyrukta daha yeni değişiklik olabilir); yalnız kayıtlı anahtarlar güncellenir.
      data.config.fields.forEach(field => draft.existingKeys.add(field.key));
      window.invalidateRoTaKipGroupCache?.(window.groupid);
      window.dispatchEvent(new CustomEvent('rotakip:cetele-config-changed', { detail: { config: data.config } }));
      window.RoTaKipCetele.load({ force: true }).catch(() => {});
      if (!options.silent) window.showNotification?.('Alışkanlık kaydedildi', 'success');
      return { ok: true };
    } catch (error) {
      draft = cloneConfig(window.RoTaKipCetele.config);
      if (!options.inline) window.showNotification?.(error.message, 'error');
      return { ok: false, error: error.message };
    } finally {
      pending -= 1;
      render();
    }
  }

  // ---- Çizim ---------------------------------------------------------------

  function fieldRow(field, index, activeCount) {
    const isRead = index === 0;
    return `
      <li class="ct-settings-field${isRead ? ' is-read' : ''}">
        <button type="button" class="ct-settings-field-main" data-edit="${index}">
          <span class="ct-settings-field-icon" aria-hidden="true"><i class="fa-solid ${isRead ? 'fa-trophy' : field.type === 'metin' ? 'fa-note-sticky' : 'fa-list-check'}"></i></span>
          <span class="ct-settings-field-text">
            <strong>${esc(field.label)}${field.required ? ' <em class="ct-badge ct-badge-required">Zorunlu</em>' : ''}</strong>
            <small>${esc(fieldSummary(field))}</small>
          </span>
          <span class="ct-settings-field-edit" aria-hidden="true"><i class="fa-solid fa-pen"></i></span>
        </button>
        ${isRead ? '' : `
          <span class="ct-settings-field-tools">
            <button type="button" class="ct-icon-btn" data-move="${index}" data-direction="-1" ${index <= 1 ? 'disabled' : ''} aria-label="${esc(field.label)} yukarı taşı"><i class="fa-solid fa-arrow-up" aria-hidden="true"></i></button>
            <button type="button" class="ct-icon-btn" data-move="${index}" data-direction="1" ${index >= activeCount - 1 ? 'disabled' : ''} aria-label="${esc(field.label)} aşağı taşı"><i class="fa-solid fa-arrow-down" aria-hidden="true"></i></button>
          </span>`}
      </li>`;
  }

  function render() {
    const container = document.getElementById('okumalarTrackingSettings');
    if (!container) return;
    if (!isAdmin()) {
      container.hidden = true;
      return;
    }
    const store = window.RoTaKipCetele;
    if (!store?.loaded) {
      container.hidden = false;
      container.innerHTML = '<p class="ct-loading">Günlük alışkanlıklar yükleniyor…</p>';
      store?.load().then(render).catch(() => {
        container.innerHTML = '<p class="ct-loading">Günlük alışkanlıklar yüklenemedi.</p>';
      });
      return;
    }
    if (draftGroupId !== window.groupid) draft = null;
    if (!draft) {
      draft = cloneConfig(store.config);
      draftGroupId = window.groupid;
    }
    // Arşivlenenler listenin sonunda tutulur; sıra yalnız açık alanlar arasındadır.
    draft.fields = [...draft.fields.filter(field => !field.archived), ...draft.fields.filter(field => field.archived)];
    const active = draft.fields.filter(field => !field.archived);
    const archived = draft.fields.filter(field => field.archived);
    container.hidden = false;
    container.innerHTML = `
      <div class="ok-card-head">
        <h3 class="ok-card-title">Günlük alışkanlıklar</h3>
        <span class="ok-card-aside">${pending ? 'Kaydediliyor…' : `${active.length} alışkanlık`}</span>
      </div>
      <p class="ct-settings-intro">Üyeler her gün bu alışkanlıkları doldurur. İlk alışkanlık lig ve seri hesabında kullanılır.</p>
      <ul class="ct-settings-fields">
        ${active.map((field, index) => fieldRow(field, index, active.length)).join('')}
      </ul>
      <button type="button" class="ok-btn ok-btn-soft ok-btn-block" data-action="add-field"><i class="fa-solid fa-plus" aria-hidden="true"></i> Alışkanlık ekle</button>
      ${archived.length ? `
        <details class="ct-archived">
          <summary>Silinen alışkanlıklar (${archived.length})</summary>
          <ul>
            ${archived.map(field => `
              <li><span>${esc(field.label)}</span><button type="button" class="ok-link" data-restore="${esc(field.key)}">Geri ekle</button></li>`).join('')}
          </ul>
        </details>` : ''}
`;

    container.querySelectorAll('[data-edit]').forEach(button => {
      button.addEventListener('click', () => openFieldSheet(Number(button.dataset.edit)));
    });
    container.querySelectorAll('[data-move]').forEach(button => {
      button.addEventListener('click', () => moveField(Number(button.dataset.move), Number(button.dataset.direction)));
    });
    container.querySelectorAll('[data-restore]').forEach(button => {
      button.addEventListener('click', () => {
        const field = draft.fields.find(item => item.key === button.dataset.restore);
        if (field) addField(field);
      });
    });
    container.querySelector('[data-action="add-field"]')?.addEventListener('click', openAddSheet);
  }

  window.renderOkumalarTrackingSettings = function renderOkumalarTrackingSettings(options = {}) {
    if (options.reset) draft = null;
    render();
  };
  window.addEventListener('rotakip:auth-changed', () => {
    draft = null;
    render();
  });
})();
