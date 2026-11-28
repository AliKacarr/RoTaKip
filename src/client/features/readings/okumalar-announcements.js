/*
 * Okumalar › Grup duyuruları.
 * - Kapak çubuğundaki megafon (#okumalarAnnouncementsButton) giriş yapmış üyelere görünür; okunmamış
 *   duyuru sayısı rozette yazar. Dokununca duyurular alttan açılan panelde listelenir ve okundu
 *   işaretlenir (POST /api/announcements/:groupId/seen; bilgi sunucuda, cihazlar arası ortaktır).
 * - Sayfam'ın üstündeki şerit (#okumalarAnnouncementBanner) okunmamış en yeni duyuruyu gösterir.
 * - Yöneticide aynı panelin üstünde yazma formu, duyurularda Düzenle/Sil vardır; Yönetim › Duyurular
 *   satırı ([data-announcements-manage]) paneli yazma alanına odaklı açar. Süresi dolan duyurular
 *   üyelere görünmez, yönetici listesinde "Süresi doldu" etiketiyle kalır. Yönetici duyurunun
 *   görüneceği tarih aralığını seçer (başlangıç boşsa hemen, bitiş boşsa süresiz); başlangıcı
 *   gelmemiş duyuru "Planlandı" etiketiyle yalnız yöneticide listelenir.
 * Veriler grup/kişi değişince sıfırlanır; sayfa yeniden görünür olunca (2 dk'dan eskiyse) yenilenir.
 */
(function initializeOkumalarAnnouncements() {
  const STALE_MS = 2 * 60 * 1000;
  const MAX_LENGTH = 600;
  const TIME_ZONE = 'Europe/Istanbul';
  const state = {
    key: '',
    items: [],
    unreadCount: 0,
    lastSeenAt: null,
    loadedAt: 0,
    request: null
  };
  // Açık panel: { api, content, editingId, seenBefore }
  let sheet = null;

  function currentUser() {
    return typeof LocalStorageManager !== 'undefined' ? LocalStorageManager.getCurrentUserInfo() : null;
  }

  function isAdmin() {
    return typeof LocalStorageManager !== 'undefined' && LocalStorageManager.isAdmin();
  }

  function groupId() {
    return window.groupid || '';
  }

  function escapeHtml(value) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(String(value ?? ''));
    const element = document.createElement('span');
    element.textContent = String(value ?? '');
    return element.innerHTML;
  }

  function notify(message, type) {
    window.showNotification?.(message, type);
  }

  function apiUrl(suffix = '') {
    return `/api/announcements/${encodeURIComponent(groupId())}${suffix}`;
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || 'İşlem tamamlanamadı');
    return data;
  }

  // Grup, kişi ya da yetki değişince eski grubun duyuruları gösterilmez.
  function syncContext() {
    const user = currentUser();
    const key = user && groupId() ? `${groupId()}|${user.userId}|${isAdmin() ? 'admin' : 'uye'}` : '';
    if (key === state.key) return;
    state.key = key;
    state.items = [];
    state.unreadCount = 0;
    state.lastSeenAt = null;
    state.loadedAt = 0;
    state.request = null;
  }

  function time(value) {
    const parsed = value ? new Date(value).getTime() : NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function isNewSince(item, seenAt) {
    return item.status === 'active' && time(item.visibleFrom || item.createdAt) > time(seenAt);
  }

  function istanbulDayKey(date) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  }

  function longDate(date) {
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', timeZone: TIME_ZONE });
  }

  function relativeTime(value) {
    const at = time(value);
    if (!at) return '';
    const minutes = Math.floor(Math.max(0, Date.now() - at) / 60000);
    if (minutes < 1) return 'az önce';
    if (minutes < 60) return `${minutes} dk önce`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} saat önce`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'dün';
    if (days < 7) return `${days} gün önce`;
    return longDate(new Date(at));
  }

  function expiryText(value) {
    if (!value) return '';
    const date = new Date(value);
    const key = istanbulDayKey(date);
    if (key === istanbulDayKey(new Date())) return 'Bugün sonuna kadar';
    if (key === istanbulDayKey(new Date(Date.now() + 86400000))) return 'Yarın sonuna kadar';
    return `${longDate(date)} tarihine kadar`;
  }

  // Görünür olduğu aralığın kısa özeti: "12 Kasım – 20 Kasım", "12 Kasım'dan itibaren" …
  function rangeText(item) {
    const start = item.startsAt ? longDate(new Date(item.startsAt)) : '';
    const end = item.expiresAt ? longDate(new Date(item.expiresAt)) : '';
    if (start && end) return start === end ? start : `${start} – ${end}`;
    if (start) return `${start} tarihinden itibaren`;
    if (end) return expiryText(item.expiresAt);
    return '';
  }

  function metaText(item) {
    return [item.authorName, relativeTime(item.createdAt), item.updatedAt ? 'düzenlendi' : '']
      .filter(Boolean)
      .join(' · ');
  }

  // ---- Veri ------------------------------------------------------------------

  async function load(options = {}) {
    syncContext();
    if (!state.key) {
      render();
      return state;
    }
    if (state.request) return state.request;
    if (!options.force && state.loadedAt && Date.now() - state.loadedAt < STALE_MS) {
      render();
      return state;
    }
    const key = state.key;
    const request = requestJson(apiUrl(isAdmin() ? '?tumu=1' : ''))
      .then(data => {
        if (state.key !== key) return state;
        state.items = Array.isArray(data.announcements) ? data.announcements : [];
        state.unreadCount = Math.max(0, Number(data.unreadCount) || 0);
        state.lastSeenAt = data.lastSeenAt || null;
        state.loadedAt = Date.now();
        return state;
      })
      .catch(error => {
        console.warn('Duyurular yüklenemedi:', error);
        return state;
      })
      .finally(() => {
        if (state.request === request) state.request = null;
        render();
      });
    state.request = request;
    return request;
  }

  async function markSeen() {
    if (!state.key || !state.unreadCount) return;
    const key = state.key;
    state.unreadCount = 0;
    state.lastSeenAt = new Date().toISOString();
    render();
    try {
      const data = await requestJson(apiUrl('/seen'), { method: 'POST' });
      if (state.key === key && data.lastSeenAt) state.lastSeenAt = data.lastSeenAt;
    } catch (error) {
      console.warn('Duyurular okundu olarak işaretlenemedi:', error);
    }
  }

  // ---- Kapak simgesi, Sayfam şeridi, Yönetim özeti ---------------------------------

  function renderButton() {
    const button = document.getElementById('okumalarAnnouncementsButton');
    if (!button) return;
    const count = state.key ? state.unreadCount : 0;
    button.hidden = !state.key;
    button.classList.toggle('has-unread', count > 0);
    const label = count ? `Duyurular (${count} yeni)` : 'Duyurular';
    button.title = label;
    button.setAttribute('aria-label', label);
    const badge = document.getElementById('okumalarAnnouncementsCount');
    if (badge) {
      badge.hidden = count === 0;
      badge.textContent = count > 9 ? '9+' : String(count);
    }
  }

  function renderBanner() {
    const banner = document.getElementById('okumalarAnnouncementBanner');
    if (!banner) return;
    const latest = state.key && state.unreadCount
      ? state.items.find(item => isNewSince(item, state.lastSeenAt))
      : null;
    if (!latest) {
      banner.hidden = true;
      banner.dataset.signature = '';
      return;
    }
    const more = state.unreadCount - 1;
    const signature = `${latest.id}|${latest.updatedAt || ''}|${more}`;
    banner.hidden = false;
    if (banner.dataset.signature === signature) return;
    banner.dataset.signature = signature;
    banner.innerHTML = `
      <button type="button" class="ok-announce-banner-body" data-announce-open>
        <span class="ok-announce-banner-icon" aria-hidden="true"><i class="fa-solid fa-bullhorn"></i></span>
        <span class="ok-announce-banner-text">
          <strong>Yeni duyuru${more > 0 ? ` <span class="ok-announce-banner-more">+${more}</span>` : ''}</strong>
          <span class="ok-announce-banner-message">${escapeHtml(latest.text)}</span>
          <small>${escapeHtml(metaText(latest))}</small>
        </span>
      </button>
      <button type="button" class="ok-announce-banner-close" data-announce-dismiss aria-label="Okundu olarak işaretle" title="Okundu olarak işaretle">
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>`;
  }

  function renderManageSummary() {
    const summary = document.getElementById('okumalarManageAnnouncementsSummary');
    if (!summary) return;
    const active = state.items.filter(item => item.status === 'active').length;
    const scheduled = state.items.filter(item => item.status === 'scheduled').length;
    const text = [active ? `${active} etkin` : '', scheduled ? `${scheduled} planlı` : '']
      .filter(Boolean).join(' · ') || 'Üyelere duyuru yap';
    if (summary.textContent !== text) summary.textContent = text;
  }

  // ---- Panel -----------------------------------------------------------------

  function formHtml() {
    return `
      <form class="ok-announce-form" novalidate>
        <label class="ok-announce-field">
          <span class="ok-announce-label">Yeni duyuru</span>
          <textarea name="text" rows="3" maxlength="${MAX_LENGTH}" placeholder="Örn. Bugün herkes 20 sayfa okumasını tamamlasın"></textarea>
        </label>
        <div class="ok-announce-dates">
          <label class="ok-announce-date">
            <span>Başlangıç tarihi</span>
            <input type="date" name="startDate">
          </label>
          <label class="ok-announce-date">
            <span>Bitiş tarihi</span>
            <input type="date" name="endDate">
          </label>
        </div>
        <div class="ok-announce-form-row">
          <small class="ok-announce-hint">Boş bırakırsan duyuru hemen yayımlanır ve süresiz kalır.</small>
          <span class="ok-announce-counter" aria-live="polite">0/${MAX_LENGTH}</span>
        </div>
        <div class="ok-announce-form-actions">
          <button type="button" class="ok-announce-cancel" hidden>Vazgeç</button>
          <button type="submit" class="ok-report-submit ok-announce-submit">Yayımla</button>
        </div>
      </form>`;
  }

  function itemHtml(item, admin) {
    const isNew = isNewSince(item, sheet && sheet.seenBefore);
    const chips = [
      isNew ? '<span class="ok-announce-chip">Yeni</span>' : '',
      item.status === 'scheduled' ? '<span class="ok-announce-chip is-info">Planlandı</span>' : '',
      item.status === 'expired' ? '<span class="ok-announce-chip is-muted">Süresi doldu</span>' : ''
    ].join('');
    // Yönetici tüm aralığı görür; üye yalnız etkin duyuruların bitişini.
    const range = admin ? rangeText(item) : (item.expiresAt ? expiryText(item.expiresAt) : '');
    const expiry = range
      ? `<p class="ok-announce-expiry"><i class="fa-regular fa-calendar" aria-hidden="true"></i>${escapeHtml(range)}</p>`
      : '';
    const actions = admin
      ? `<div class="ok-announce-actions">
          <button type="button" data-announce-edit="${escapeHtml(item.id)}"><i class="fa-solid fa-pen" aria-hidden="true"></i>Düzenle</button>
          <button type="button" class="is-danger" data-announce-delete="${escapeHtml(item.id)}"><i class="fa-solid fa-trash" aria-hidden="true"></i>Sil</button>
        </div>`
      : '';
    return `
      <li class="ok-announce-item${isNew ? ' is-new' : ''}${item.status === 'expired' ? ' is-expired' : ''}${item.status === 'scheduled' ? ' is-scheduled' : ''}">
        <div class="ok-announce-item-head">${chips}<span class="ok-announce-meta">${escapeHtml(metaText(item))}</span></div>
        <p class="ok-announce-text">${escapeHtml(item.text)}</p>
        ${expiry}${actions}
      </li>`;
  }

  function renderSheetList() {
    if (!sheet) return;
    const list = sheet.content.querySelector('.ok-announce-list-wrap');
    if (!list) return;
    const admin = isAdmin();
    if (!state.loadedAt) {
      list.innerHTML = '<p class="ok-announce-empty">Duyurular yükleniyor…</p>';
      return;
    }
    if (!state.items.length) {
      list.innerHTML = `
        <div class="ok-announce-empty">
          <i class="fa-solid fa-bullhorn" aria-hidden="true"></i>
          <p>Henüz duyuru yok.</p>
          ${admin ? '<small>Yazdığın duyuru gruptaki herkese görünür; yeni duyuru megafon simgesinde işaretlenir.</small>' : ''}
        </div>`;
      return;
    }
    list.innerHTML = `
      ${admin ? '<h3 class="ok-announce-list-title">Yayımlanan duyurular</h3>' : ''}
      <ul class="ok-announce-list">${state.items.map(item => itemHtml(item, admin)).join('')}</ul>`;
  }

  function formParts() {
    const form = sheet && sheet.content.querySelector('.ok-announce-form');
    if (!form) return null;
    return {
      form,
      textarea: form.elements.text,
      startDate: form.elements.startDate,
      endDate: form.elements.endDate,
      label: form.querySelector('.ok-announce-label'),
      counter: form.querySelector('.ok-announce-counter'),
      cancel: form.querySelector('.ok-announce-cancel'),
      submit: form.querySelector('.ok-announce-submit')
    };
  }

  function updateCounter() {
    const parts = formParts();
    if (parts) parts.counter.textContent = `${parts.textarea.value.length}/${MAX_LENGTH}`;
  }

  // Bitiş tarihi başlangıçtan (yoksa bugünden; düzenlemede kısıt yok) önceye seçilemez.
  function syncDateLimits() {
    const parts = formParts();
    if (!parts) return;
    const floor = parts.startDate.value || (sheet.editingId ? '' : istanbulDayKey(new Date()));
    parts.endDate.min = floor;
  }

  function resetForm() {
    const parts = formParts();
    if (!parts) return;
    sheet.editingId = null;
    parts.startDate.value = '';
    parts.endDate.value = '';
    syncDateLimits();
    parts.textarea.value = '';
    parts.label.textContent = 'Yeni duyuru';
    parts.submit.textContent = 'Yayımla';
    parts.cancel.hidden = true;
    updateCounter();
  }

  function startEdit(id) {
    const item = state.items.find(entry => entry.id === id);
    const parts = formParts();
    if (!item || !parts) return;
    sheet.editingId = id;
    parts.startDate.value = item.startsAt ? istanbulDayKey(new Date(item.startsAt)) : '';
    parts.endDate.value = item.expiresAt ? istanbulDayKey(new Date(item.expiresAt)) : '';
    syncDateLimits();
    parts.textarea.value = item.text;
    parts.label.textContent = 'Duyuruyu düzenle';
    parts.submit.textContent = 'Kaydet';
    parts.cancel.hidden = false;
    updateCounter();
    parts.form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    parts.textarea.focus({ preventScroll: true });
  }

  async function submitForm(event) {
    event.preventDefault();
    const parts = formParts();
    if (!parts || parts.submit.disabled) return;
    const text = parts.textarea.value.trim();
    if (!text) {
      notify('Duyuru metni boş olamaz', 'error');
      parts.textarea.focus();
      return;
    }
    const startDate = parts.startDate.value;
    const endDate = parts.endDate.value;
    if (startDate && endDate && endDate < startDate) {
      notify('Bitiş tarihi başlangıçtan önce olamaz', 'error');
      parts.endDate.focus();
      return;
    }
    const editingId = sheet.editingId;
    const current = sheet;
    parts.submit.disabled = true;
    try {
      const data = await requestJson(editingId ? apiUrl(`/${encodeURIComponent(editingId)}`) : apiUrl(), {
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify({ text, startDate, endDate })
      });
      notify(editingId ? 'Duyuru güncellendi' : 'Duyuru yayımlandı', 'success');
      // Yöneticinin kendi yeni duyurusu panelde "Yeni" etiketi almaz.
      if (!editingId && data.announcement && sheet === current) sheet.seenBefore = data.announcement.createdAt;
      if (sheet === current) resetForm();
      await load({ force: true });
    } catch (error) {
      notify(error.message || 'Duyuru kaydedilemedi', 'error');
    } finally {
      parts.submit.disabled = false;
    }
  }

  async function deleteAnnouncement(id, button) {
    if (!window.confirm('Bu duyuru silinsin mi? Üyeler artık göremez.')) return;
    button.disabled = true;
    try {
      await requestJson(apiUrl(`/${encodeURIComponent(id)}`), { method: 'DELETE' });
      if (sheet && sheet.editingId === id) resetForm();
      notify('Duyuru silindi', 'success');
      await load({ force: true });
    } catch (error) {
      button.disabled = false;
      notify(error.message || 'Duyuru silinemedi', 'error');
    }
  }

  function bindSheet(content) {
    const form = content.querySelector('.ok-announce-form');
    if (form) {
      form.addEventListener('submit', submitForm);
      form.elements.text.addEventListener('input', updateCounter);
      form.elements.startDate.addEventListener('change', syncDateLimits);
      form.querySelector('.ok-announce-cancel').addEventListener('click', resetForm);
      syncDateLimits();
    }
    content.addEventListener('click', event => {
      const edit = event.target.closest('[data-announce-edit]');
      if (edit) {
        startEdit(edit.dataset.announceEdit);
        return;
      }
      const remove = event.target.closest('[data-announce-delete]');
      if (remove) void deleteAnnouncement(remove.dataset.announceDelete, remove);
    });
  }

  function openSheet(options = {}) {
    syncContext();
    if (!window.RoTaKipBottomSheet || !state.key) return;
    if (sheet) sheet.api.close();
    const admin = isAdmin();
    const content = document.createElement('div');
    content.className = 'ok-announce-sheet';
    content.innerHTML = `${admin ? formHtml() : ''}<div class="ok-announce-list-wrap"></div>`;
    const api = window.RoTaKipBottomSheet.open({
      title: 'Duyurular',
      subtitle: admin ? 'Gruptaki herkese duyuru yap' : '',
      className: 'ok-sheet ok-announce-sheet-panel',
      content,
      onClose: () => {
        if (sheet && sheet.api === api) sheet = null;
      }
    });
    const current = { api, content, editingId: null, seenBefore: state.lastSeenAt };
    sheet = current;
    bindSheet(content);
    renderSheetList();
    if (admin && options.compose) {
      window.setTimeout(() => {
        if (sheet === current) content.querySelector('.ok-announce-form textarea')?.focus({ preventScroll: true });
      }, 320);
    }
    // Panel açılınca güncel liste alınır; o ana kadar okunmamış olanlar "Yeni" kalır, sonra okundu sayılır.
    void load({ force: true }).then(() => {
      if (sheet !== current) return;
      current.seenBefore = state.lastSeenAt;
      renderSheetList();
      void markSeen();
    });
  }

  function render() {
    syncContext();
    renderButton();
    renderBanner();
    renderManageSummary();
    renderSheetList();
  }

  // Kapak ve bölümler yeniden kurulabildiği için olaylar belgeden dinlenir.
  document.addEventListener('click', event => {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    if (target.closest('#okumalarAnnouncementsButton') || target.closest('[data-announce-open]')) openSheet();
    else if (target.closest('[data-announcements-manage]')) openSheet({ compose: true });
    else if (target.closest('[data-announce-dismiss]')) void markSeen();
  });

  window.addEventListener('rotakip:group-context-ready', () => void load({ force: true }));
  window.addEventListener('rotakip:auth-changed', () => {
    if (sheet) sheet.api.close();
    void load({ force: true });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && document.getElementById('okumalarAnnouncementsButton')) void load();
  });

  window.RoTaKipAnnouncements = Object.freeze({
    load,
    render,
    open: openSheet
  });
})();
