/*
 * Günlük çetele veri katmanı. Her grupta tek takip biçimi budur.
 * - İlk açık alan okuma alanıdır (varsayılan "Kitap okuma"); değeri globalDataStore'daki
 *   okuma kayıtlarından okunur ve oraya hemen yansıtılır. Lig, seri ve sıralama bu alandan gelir.
 * - Diğer alanların son 63 günü /api/cetele/:groupId ile yüklenir (yalnız giriş yapmış üyeler).
 * - Form değişiklikleri kullanıcı "Kaydet" deyince setValues ile tek istekte gönderilir; setValue ise
 *   (tek alan) kısa bir beklemeyle kaydeder. Zorunlu alan (field.required) denetimi forma ve sunucuya aittir.
 */
(function initializeCeteleStore() {
  const RANGE_DAYS = 63;
  const SAVE_DELAY_MS = 700;
  const state = {
    groupId: null,
    loading: null,
    loaded: false,
    config: null,
    entries: new Map(), // `${userId}|${date}` -> { userId, date, values? }
    saveTimers: new Map(),
    saveStates: new Map(), // `${userId}|${date}` -> 'pending' | 'saving' | 'saved' | 'error'
    pending: new Map(), // `${userId}|${date}` -> diğer alanlarda kaydedilmeyi bekleyen değişiklikler (null: sil)
    pendingReads: new Map(), // `${userId}|${date}` -> okuma alanı değeri (null: sil)
    readSnapshots: new Map() // `${userId}|${date}` -> kayıttan önceki okuma satırı
  };

  const entryKey = (userId, date) => `${String(userId)}|${date}`;
  const metrics = () => window.RoTaKipReadingMetrics;

  function emit() {
    window.dispatchEvent(new CustomEvent('rotakip:cetele-changed'));
  }

  function reset(groupId) {
    state.saveTimers.forEach(timer => window.clearTimeout(timer));
    Object.assign(state, {
      groupId,
      loading: null,
      loaded: false,
      config: null,
      entries: new Map(),
      saveTimers: new Map(),
      saveStates: new Map(),
      pending: new Map(),
      pendingReads: new Map(),
      readSnapshots: new Map()
    });
  }

  function ensureGroup() {
    if (state.groupId !== window.groupid) reset(window.groupid);
  }

  // ---- Yapılandırma -------------------------------------------------------

  function isReadFieldCandidate(field) {
    return Boolean(field) && !field.archived && field.type === 'sayi'
      && ['sayfa', 'dakika'].includes(field.unit) && field.step === 1;
  }

  function defaultReadField() {
    const unit = typeof window.getCurrentAmountType === 'function' ? window.getCurrentAmountType() : 'sayfa';
    return { key: 'kitap', label: 'Kitap okuma', type: 'sayi', unit, options: [5, 10, 20, 30, 50], step: 1, max: 9999, allowCustom: true, archived: false };
  }

  // Sunucudaki getCeteleConfig ile aynı kural: ilk açık alan okuma alanı olamıyorsa başa Kitap okuma gelir.
  // Yükleme öncesinde (ya da misafirde) grup bilgisindeki alanlardan türetilir.
  function derivedConfig() {
    const group = window.currentGroupData || {};
    const fields = Array.isArray(group.ceteleFields)
      ? group.ceteleFields.map(field => ({ ...field, options: [...(field.options || [])], archived: field.archived === true }))
      : [];
    if (!isReadFieldCandidate(fields.find(field => !field.archived))) fields.unshift(defaultReadField());
    return {
      fields,
      readField: fields.find(field => !field.archived).key
    };
  }

  function config() {
    ensureGroup();
    return state.config || derivedConfig();
  }

  function activeFields() {
    return config().fields.filter(field => !field.archived);
  }

  function readField() {
    return activeFields()[0];
  }

  function extraFields() {
    return activeFields().slice(1);
  }

  // ---- Yükleme -------------------------------------------------------------

  // Shell (app/group-context.js) giriş yapmış üyenin çetele isteğini paket yüklenmeden başlatır.
  // Aynı adres ve 30 sn'den taze ise bu istek bir kez devralınır; zorla yenilemede kullanılmaz.
  function takePrefetchedRequest(url, options) {
    const prefetched = window.rotakipCetelePrefetch;
    if (!prefetched) return null;
    window.rotakipCetelePrefetch = null;
    if (options.force || prefetched.url !== url || Date.now() - prefetched.startedAt > 30 * 1000) return null;
    return prefetched.request;
  }

  async function load(options = {}) {
    const groupId = window.groupid;
    if (!groupId) return null;
    ensureGroup();
    if (state.loading && !options.force) return state.loading;
    const to = metrics().todayKey();
    const from = metrics().addDays(to, -(RANGE_DAYS - 1));
    const url = `/api/cetele/${encodeURIComponent(groupId)}?from=${from}&to=${to}`;
    state.loading = (takePrefetchedRequest(url, options) || fetch(url, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin'
    })).then(async response => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Çetele yüklenemedi');
      if (state.groupId !== groupId) return null;
      state.config = data.config;
      state.entries = new Map();
      (data.entries || []).forEach(entry => state.entries.set(entryKey(entry.userId, entry.date), entry));
      // Kaydedilmeyi bekleyen yerel değişiklikler sunucu verisinin üzerinde kalır.
      state.pending.forEach((changes, key) => {
        const [userId, date] = key.split('|');
        applyChangesLocally(userId, date, changes);
      });
      state.loaded = true;
      emit();
      return state;
    }).catch(error => {
      console.warn('Çetele yüklenemedi:', error);
      state.loading = null;
      throw error;
    });
    return state.loading;
  }

  // ---- Okuma ---------------------------------------------------------------

  function dataStore() {
    const store = window.globalDataStore;
    return store && store.groupId === window.groupid ? store : null;
  }

  // { status: 'okudum' | 'okumadım', amount: number | null } ya da null.
  function readingOf(userId, date) {
    const store = dataStore();
    if (!store) return null;
    const record = store.getStatsForUser(String(userId)).find(item => item.date === date);
    if (!record || !record.status) return null;
    const amount = Number(record.amount);
    return {
      status: record.status,
      amount: record.status === 'okudum' && record.amount !== null && record.amount !== '' && Number.isFinite(amount) ? amount : null
    };
  }

  // Okuma alanının sayısal değeri: okudum + miktar → miktar, okumadım → 0, miktarsız okudum / boş → null.
  function readValueOf(userId, date) {
    const reading = readingOf(userId, date);
    if (!reading) return null;
    return reading.status === 'okumadım' ? 0 : reading.amount;
  }

  function applyReadingLocally(userId, date, reading) {
    const store = dataStore();
    if (!store || typeof store.applyLocalUpdate !== 'function') return;
    store.applyLocalUpdate(String(userId), date, reading ? reading.status : '', reading ? reading.amount : null);
    window.schedulePostToggleUiRefresh?.(String(userId));
  }

  function readingForValue(value) {
    if (value === null || value === undefined || value === '') return null;
    return Number(value) > 0 ? { status: 'okudum', amount: Number(value) } : { status: 'okumadım', amount: null };
  }

  // ---- Değerler ------------------------------------------------------------

  function getEntry(userId, date) {
    ensureGroup();
    return state.entries.get(entryKey(userId, date)) || null;
  }

  // Okuma alanı dahil o günün tüm değerleri.
  function valuesFor(userId, date) {
    const values = { ...(getEntry(userId, date)?.values || {}) };
    const field = readField();
    const value = readValueOf(userId, date);
    if (field && value !== null) values[field.key] = value;
    return values;
  }

  function entriesForUser(userId) {
    ensureGroup();
    const result = [];
    state.entries.forEach(entry => {
      if (String(entry.userId) === String(userId)) result.push(entry);
    });
    return result.sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  // Okuma alanı ya da diğer alanlardan biri doluysa o gün "dolduruldu" sayılır.
  function isFilled(userId, date) {
    return Boolean(readingOf(userId, date) || getEntry(userId, date));
  }

  // ---- Kayıt ---------------------------------------------------------------

  function applyChangesLocally(userId, date, changes) {
    const key = entryKey(userId, date);
    const values = { ...(state.entries.get(key)?.values || {}) };
    Object.entries(changes).forEach(([fieldKey, value]) => {
      if (value === null) delete values[fieldKey];
      else values[fieldKey] = value;
    });
    if (Object.keys(values).length) state.entries.set(key, { userId: String(userId), date, values });
    else state.entries.delete(key);
  }

  // Sunucuya yalnız değişen alanlar gider; gönderilmeyen alanlara sunucu dokunmaz.
  async function flush(userId, date) {
    const key = entryKey(userId, date);
    const field = readField();
    const hasExtras = state.pending.has(key);
    const hasRead = state.pendingReads.has(key);
    if (!hasExtras && !hasRead) return;
    const values = hasExtras ? { ...state.pending.get(key) } : {};
    if (hasRead) values[field.key] = state.pendingReads.get(key);
    const sentExtras = state.pending.get(key);
    const sentRead = state.pendingReads.get(key);
    state.pending.delete(key);
    state.pendingReads.delete(key);
    state.saveStates.set(key, 'saving');
    emit();
    try {
      const response = await fetch(`/api/cetele/${encodeURIComponent(state.groupId)}/entry`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ userId, date, values })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.error || 'Kaydedilemedi');
        error.code = data.code;
        error.readingEditPolicy = data.readingEditPolicy;
        throw error;
      }
      // Bu sırada yeni değişiklik geldiyse sunucu yanıtı onun üzerine yazılmaz.
      if (hasExtras && !state.pending.has(key)) {
        if (data.entry) state.entries.set(key, data.entry);
        else state.entries.delete(key);
      }
      if (data.readingChanged && !state.pendingReads.has(key)) {
        applyReadingLocally(userId, date, data.reading);
        state.readSnapshots.delete(key);
      }
      if (!state.pending.has(key) && !state.pendingReads.has(key)) state.saveStates.set(key, 'saved');
    } catch (error) {
      console.warn('Kayıt yapılamadı:', error);
      if (error.code === 'READING_EDIT_DATE_RESTRICTED' || error.code === 'REQUIRED_FIELDS_MISSING') {
        // Yerel değişiklik geri alınır; kısıt bilgisi gösterilir.
        if (hasRead && state.readSnapshots.has(key) && !state.pendingReads.has(key)) {
          applyReadingLocally(userId, date, state.readSnapshots.get(key));
          state.readSnapshots.delete(key);
        }
        state.saveStates.delete(key);
        if (error.code === 'REQUIRED_FIELDS_MISSING') {
          window.showNotification?.(error.message, 'error');
        } else {
          if (error.readingEditPolicy) window.setCurrentReadingEditPolicy?.(error.readingEditPolicy);
          window.showReadingEditRestrictionInfo?.('date_restricted');
        }
        load({ force: true }).catch(() => {});
      } else {
        // Gönderilemeyen değişiklikler, bu arada gelen yenilerin altında yeniden sıraya girer.
        if (hasExtras) state.pending.set(key, { ...sentExtras, ...(state.pending.get(key) || {}) });
        if (hasRead && !state.pendingReads.has(key)) state.pendingReads.set(key, sentRead);
        state.saveStates.set(key, 'error');
      }
    }
    emit();
  }

  function scheduleSave(userId, date) {
    const key = entryKey(userId, date);
    state.saveStates.set(key, 'pending');
    window.clearTimeout(state.saveTimers.get(key));
    state.saveTimers.set(key, window.setTimeout(() => {
      state.saveTimers.delete(key);
      void flush(String(userId), date);
    }, SAVE_DELAY_MS));
  }

  function applyValue(userId, date, fieldKey, value) {
    const key = entryKey(userId, date);
    const empty = value === null || value === undefined || value === '';
    if (readField() && fieldKey === readField().key) {
      if (!state.readSnapshots.has(key)) state.readSnapshots.set(key, readingOf(userId, date));
      state.pendingReads.set(key, empty ? null : value);
      applyReadingLocally(userId, date, readingForValue(empty ? null : value));
    } else {
      const changes = { ...(state.pending.get(key) || {}), [fieldKey]: empty ? null : value };
      state.pending.set(key, changes);
      applyChangesLocally(userId, date, { [fieldKey]: empty ? null : value });
    }
  }

  // Değeri yerelde hemen uygular; kısa bir bekleme sonrası günün değerlerini kaydeder.
  function setValue(userId, date, fieldKey, value) {
    ensureGroup();
    applyValue(userId, date, fieldKey, value);
    scheduleSave(userId, date);
    emit();
  }

  // Birden çok alanı yerelde uygular ve beklemeden tek istekte kaydeder ({ alanAnahtarı: değer | null }).
  function setValues(userId, date, changes) {
    ensureGroup();
    const key = entryKey(userId, date);
    Object.entries(changes).forEach(([fieldKey, value]) => applyValue(userId, date, fieldKey, value));
    window.clearTimeout(state.saveTimers.get(key));
    state.saveTimers.delete(key);
    return flush(String(userId), date);
  }

  function retry(userId, date) {
    void flush(String(userId), date);
  }

  // Sayfa kapanırken bekleyen kayıtlar beklemeden gönderilir.
  window.addEventListener('pagehide', () => {
    state.saveTimers.forEach((timer, key) => {
      window.clearTimeout(timer);
      const [userId, date] = key.split('|');
      const values = { ...(state.pending.get(key) || {}) };
      if (state.pendingReads.has(key) && readField()) values[readField().key] = state.pendingReads.get(key);
      try {
        fetch(`/api/cetele/${encodeURIComponent(state.groupId)}/entry`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          keepalive: true,
          body: JSON.stringify({ userId, date, values })
        });
      } catch (_error) { /* sayfa kapanıyor */ }
    });
  });

  window.RoTaKipCetele = Object.freeze({
    load,
    reset,
    setValue,
    setValues,
    retry,
    getEntry,
    valuesFor,
    readingOf,
    readValueOf,
    entriesForUser,
    isFilled,
    activeFields,
    readField,
    extraFields,
    get config() { return config(); },
    get loaded() { return state.loaded && state.groupId === window.groupid; },
    saveStateFor(userId, date) { return state.saveStates.get(entryKey(userId, date)) || null; },
    setConfig(next) {
      ensureGroup();
      state.config = next;
      emit();
    }
  });
})();
