/*
 * Okumalar bölüm sekmeleri: /grup/:id/?bolum=bugun|grup|yonetim
 * Eski adresler (?bolum=tablo|istatistik|siralama) Grup bölümünü açar.
 * Bölüm geçişleri history.pushState ile yapılır; shell-router aynı grup içindeki
 * popstate olaylarını sekmeyi yeniden kurmadan RoTaKipOkumalarSections.syncFromUrl()'e iletir.
 */
(function initializeOkumalarSections() {
  const SECTIONS = ['bugun', 'grup', 'yonetim'];
  const LEGACY_SECTIONS = { tablo: 'grup', istatistik: 'grup', siralama: 'grup' };
  const DEFAULT_SECTION = 'bugun';
  let activeSection = null;
  let bound = false;
  let renderTimer = 0;
  const renderedSections = new Set();
  const ENTER_DISTANCE = 72;
  const ENTER_MS = 420;

  function isAdmin() {
    return typeof LocalStorageManager !== 'undefined' && LocalStorageManager.isAdmin();
  }

  // Giriş yapmamış (misafir) ziyaretçi yalnız Grup bölümünü görür; sekme şeridi gizlenir.
  function isGuest() {
    return typeof LocalStorageManager === 'undefined' || !LocalStorageManager.getCurrentUserInfo();
  }

  function sectionFromUrl(url = new URL(window.location.href)) {
    if (isGuest()) return 'grup';
    const raw = String(url.searchParams.get('bolum') || '').toLocaleLowerCase('tr-TR');
    const requested = LEGACY_SECTIONS[raw] || raw;
    if (!SECTIONS.includes(requested)) return DEFAULT_SECTION;
    if (requested === 'yonetim' && !isAdmin()) return DEFAULT_SECTION;
    return requested;
  }

  function urlForSection(section) {
    const url = new URL(window.location.href);
    if (section === DEFAULT_SECTION) url.searchParams.delete('bolum');
    else url.searchParams.set('bolum', section);
    return url;
  }

  function tabs() {
    return Array.from(document.querySelectorAll('.okumalar-section-tab'));
  }

  function refreshAccess() {
    const guest = isGuest();
    const nav = document.getElementById('okumalarSections');
    const wasHidden = Boolean(nav && nav.hidden);
    if (nav) nav.hidden = guest;
    if (guest && activeSection && activeSection !== 'grup') apply('grup', { keepScroll: true, scrollTab: false });
    // Misafir giriş yapınca Grup'tan Sayfam'a (Bugün) geçilir; adres de buna göre güncellenir.
    else if (!guest && wasHidden) open(DEFAULT_SECTION, { replace: true, keepScroll: true, scrollTab: false });
    const adminTab = document.getElementById('okumalarTabYonetim');
    if (adminTab) adminTab.hidden = !isAdmin();
    const inviteButton = document.getElementById('okumalarInviteButton');
    // Davet yalnız yöneticiler içindir.
    if (inviteButton) inviteButton.hidden = !isAdmin();
    if (activeSection === 'yonetim' && !isAdmin()) apply(DEFAULT_SECTION);
  }

  function keepTabsInView() {
    const nav = document.getElementById('okumalarSections');
    if (!nav) return;
    // Sekme şeridi sticky olduğu için kaydırılınca getBoundingClientRect().top hep 0 kalır; doğal konumu
    // ölçmek için şerit anlığına sabitlenmeden çıkarılır (aynı görevde, çizim olmaz).
    const previous = nav.style.position;
    nav.style.position = 'relative';
    const naturalTop = nav.getBoundingClientRect().top + window.scrollY;
    nav.style.position = previous;
    // Kullanıcı kapağın altına inmişse yeni bölüm sekmelerin hemen altından başlar (kısa bölümde sayfa
    // dibine yapışmaz).
    if (window.scrollY > naturalTop) window.scrollTo({ top: naturalTop, left: 0, behavior: 'auto' });
  }

  function onSectionShown(section) {
    if (section === 'grup') {
      window.renderOkumalarRanking?.();
      // Misafire yalnız sıralama kartı çizilir; istatistik ve mesajlar giriş yapınca yüklenir.
      if (!isGuest()) {
        window.renderOkumalarStats?.();
        void window.renderReadingMessagePanels?.();
      }
    }
    if (section === 'yonetim') {
      window.renderOkumalarTrackingSettings?.();
      window.renderOkumalarManage?.();
    }
    if (section === 'bugun') {
      window.renderOkumalarToday?.();
      window.renderOkumalarStats?.();
    }
  }

  // Seçili sekmenin arkasındaki kayan gösterge. Sekme şeridi gizliyken (ölçü yok) gösterge kapanır ve
  // seçili sekme kendi zeminini kullanır; ilk konumlandırma geçişsizdir, sonrakiler kayarak olur.
  function positionIndicator() {
    const track = document.querySelector('.okumalar-sections-track');
    if (!track) return;
    const tab = track.querySelector('.okumalar-section-tab.is-active');
    if (!tab || tab.hidden || !tab.offsetWidth) {
      track.classList.remove('has-indicator', 'is-animated');
      return;
    }
    track.style.setProperty('--ok-tab-x', `${tab.offsetLeft}px`);
    track.style.setProperty('--ok-tab-w', `${tab.offsetWidth}px`);
    if (track.classList.contains('has-indicator')) return;
    track.classList.add('has-indicator');
    window.requestAnimationFrame(() => {
      if (track.classList.contains('has-indicator')) track.classList.add('is-animated');
    });
  }

  // Yeni bölüm, sekmenin geldiği yönden hafifçe kayarak belirir.
  function animateSectionEnter(panel, previous, target) {
    if (!panel) return;
    const forward = SECTIONS.indexOf(target) > SECTIONS.indexOf(previous);
    // Sayfam → Grup: yeni sayfa sağdan gelir; Grup → Sayfam: soldan.
    panel.style.setProperty('--ok-enter-x', `${forward ? ENTER_DISTANCE : -ENTER_DISTANCE}px`);
    panel.classList.remove('is-entering');
    void panel.offsetWidth;
    panel.classList.add('is-entering');
    panel.addEventListener('animationend', () => panel.classList.remove('is-entering'), { once: true });
  }

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function apply(section, options = {}) {
    const target = SECTIONS.includes(section) ? section : DEFAULT_SECTION;
    const previous = activeSection;
    const changed = target !== activeSection;
    activeSection = target;
    tabs().forEach(tab => {
      const active = tab.dataset.bolum === target;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active) {
        // Yalnız sekme şeridi kaydırılır; sayfanın dikey konumu değişmez.
        const track = tab.parentElement;
        if (track && track.scrollWidth > track.clientWidth) {
          track.scrollTo({
            left: tab.offsetLeft - (track.clientWidth - tab.offsetWidth) / 2,
            behavior: options.scrollTab === false ? 'auto' : 'smooth'
          });
        }
      }
    });
    positionIndicator();
    document.querySelectorAll('.okumalar-bolum').forEach(panel => {
      panel.hidden = panel.dataset.okumalarBolum !== target;
      if (changed && previous && !panel.hidden) animateSectionEnter(panel, previous, target);
    });
    if (changed) {
      if (options.keepScroll !== true) keepTabsInView();
      window.clearTimeout(renderTimer);
      if (previous && renderedSections.has(target) && !prefersReducedMotion()) {
        // Daha önce çizilmiş bölümün yenilenmesi geçiş animasyonu bitince yapılır; ağır çizim animasyonu duraksatmasın.
        renderTimer = window.setTimeout(() => {
          if (activeSection === target) onSectionShown(target);
        }, ENTER_MS + 40);
      } else {
        renderedSections.add(target);
        onSectionShown(target);
      }
    }
    return target;
  }

  function open(section, options = {}) {
    const target = SECTIONS.includes(section) ? section : DEFAULT_SECTION;
    const url = urlForSection(target);
    if (`${url.pathname}${url.search}` !== `${window.location.pathname}${window.location.search}`) {
      history[options.replace ? 'replaceState' : 'pushState']({ rotakipOkumalarSection: target }, '', `${url.pathname}${url.search}${url.hash}`);
    }
    apply(target, options);
  }

  function bindTabs() {
    if (bound) return;
    const track = document.querySelector('.okumalar-sections-track');
    if (!track) return;
    bound = true;
    if (typeof ResizeObserver === 'function') {
      // Şerit görünür olunca, Yönetim sekmesi açılınca ya da yazı tipi yüklenince gösterge yeniden hizalanır.
      const observer = new ResizeObserver(positionIndicator);
      observer.observe(track);
      tabs().forEach(tab => observer.observe(tab));
    }
    track.addEventListener('click', event => {
      const tab = event.target.closest('.okumalar-section-tab');
      if (!tab || tab.hidden) return;
      open(tab.dataset.bolum);
    });
    track.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const visible = tabs().filter(tab => !tab.hidden);
      const index = visible.findIndex(tab => tab.dataset.bolum === activeSection);
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % visible.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + visible.length) % visible.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = visible.length - 1;
      event.preventDefault();
      visible[next].focus();
      open(visible[next].dataset.bolum);
    });
    document.getElementById('okumalarInviteButton')?.addEventListener('click', openInviteSheet);
  }

  // ---- Kapak bilgisi ve davet ------------------------------------------------

  window.updateOkumalarHeroMeta = function updateOkumalarHeroMeta() {
    const meta = document.getElementById('okumalarHeroMeta');
    const metrics = window.RoTaKipReadingMetrics;
    if (!meta || !metrics) return;
    const users = window.globalDataStore && window.globalDataStore.groupId === window.groupid
      ? window.globalDataStore.getUsers()
      : [];
    const parts = [metrics.monthLabel()];
    if (users.length) parts.push(`${users.length.toLocaleString('tr-TR')} üye`);
    meta.textContent = parts.join(' · ');
  };

  function groupLink() {
    return new URL(`/grup/${encodeURIComponent(window.groupid || '')}/`, window.location.origin).href;
  }

  async function shareGroupLink() {
    const groupName = (window.currentGroupData && window.currentGroupData.groupName) || 'RoTaKip grubu';
    const url = groupLink();
    if (navigator.share) {
      try {
        await navigator.share({ title: groupName, text: `${groupName} okuma grubuna göz at:`, url });
        return;
      } catch (error) {
        if (error && error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      window.showNotification?.('Grup bağlantısı kopyalandı', 'success');
    } catch (_error) {
      window.prompt('Grup bağlantısını kopyalayın:', url);
    }
  }

  function openInviteSheet() {
    if (!isAdmin()) return;
    if (!window.RoTaKipBottomSheet) {
      void shareGroupLink();
      return;
    }
    const content = document.createElement('div');
    content.className = 'ok-invite-sheet';
    content.innerHTML = `
      <button type="button" class="ok-option" data-invite="member">
        <span class="ok-option-icon" aria-hidden="true"><i class="fa-solid fa-user-plus"></i></span>
        <span class="ok-option-text"><strong>Üye ekle ve davet linki gönder</strong><small>Kayıt gerektirmez; kişi linkle hesabını kendisi tamamlar.</small></span>
        <i class="fa-solid fa-chevron-right ok-option-chevron" aria-hidden="true"></i>
      </button>
      <button type="button" class="ok-option" data-invite="share">
        <span class="ok-option-icon" aria-hidden="true"><i class="fa-solid fa-share-nodes"></i></span>
        <span class="ok-option-text"><strong>Grup bağlantısını paylaş</strong><small>İsteyenler Okumalarım sayfasından katılma isteği gönderebilir.</small></span>
        <i class="fa-solid fa-chevron-right ok-option-chevron" aria-hidden="true"></i>
      </button>`;
    const sheet = window.RoTaKipBottomSheet.open({
      title: 'Davet et',
      subtitle: 'Gruba yeni okuyucular kat',
      className: 'ok-sheet',
      content
    });
    content.querySelector('[data-invite="member"]').addEventListener('click', () => {
      sheet.close();
      open('yonetim');
      // Önceki panel kapanış animasyonunu bitirsin, sonra Üye ekle paneli açılsın.
      window.setTimeout(() => window.openOkumalarManagePanel?.('add'), 300);
    });
    content.querySelector('[data-invite="share"]').addEventListener('click', () => {
      sheet.close();
      void shareGroupLink();
    });
  }

  // ---- Grup bilgisi, Bildir ve Gruptan ayrıl -----------------------------------

  const REPORT_REASONS = [
    ['uygunsuz', 'Uygunsuz içerik'],
    ['sahte', 'Yanıltıcı veya sahte grup'],
    ['spam', 'Spam / istenmeyen paylaşım'],
    ['diger', 'Diğer']
  ];

  function openGroupInfoSheet() {
    if (!window.RoTaKipBottomSheet) return;
    const group = window.currentGroupData || {};
    const description = String(group.description || '').trim();
    const content = document.createElement('p');
    content.className = `ok-group-info-text${description ? '' : ' is-empty'}`;
    content.textContent = description || 'Bu grup için açıklama eklenmemiş.';
    window.RoTaKipBottomSheet.open({
      title: group.groupName || 'Grup bilgisi',
      subtitle: 'Grup açıklaması',
      className: 'ok-sheet',
      content
    });
  }

  function openReportSheet() {
    const content = document.createElement('form');
    content.innerHTML = `
      <fieldset class="ok-report-reasons">
        ${REPORT_REASONS.map(([value, label], index) => `<label class="ok-report-reason"><input type="radio" name="reason" value="${value}"${index === 0 ? ' checked' : ''}><span>${label}</span></label>`).join('')}
      </fieldset>
      <button type="submit" class="ok-report-submit">Bildir</button>`;
    const sheet = window.RoTaKipBottomSheet.open({
      title: 'Grubu bildir',
      subtitle: 'Bildirimin yöneticilere iletilir',
      className: 'ok-sheet',
      content
    });
    content.addEventListener('submit', async event => {
      event.preventDefault();
      const submit = content.querySelector('.ok-report-submit');
      submit.disabled = true;
      try {
        const response = await fetch(`/api/group-reports/${encodeURIComponent(window.groupid || '')}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: content.elements.reason.value })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || data.error || 'Bildirim gönderilemedi');
        sheet.close();
        window.showNotification?.('Bildirimin için teşekkürler', 'success');
      } catch (error) {
        submit.disabled = false;
        window.showNotification?.(error.message || 'Bildirim gönderilemedi', 'error');
      }
    });
  }

  // Gruptan ayrılmak, kişinin bu gruptaki hesabını silmektir (hesap silme ile aynı uç nokta).
  async function leaveGroup() {
    const me = typeof LocalStorageManager !== 'undefined' ? LocalStorageManager.getCurrentUserInfo() : null;
    if (!me) return;
    if (!window.confirm('Gruptan ayrılmak istediğinden emin misin? Bu gruptaki hesabın ve okuma kayıtların silinir; bu işlem geri alınamaz.')) return;
    try {
      const response = await fetch(`/api/delete-user/${encodeURIComponent(me.groupId || window.groupid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: me.userId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        window.showNotification?.(data.error || 'Gruptan ayrılınamadı', 'error');
        return;
      }
      LocalStorageManager.logoutUser();
      window.showNotification?.(data.groupDeleted ? 'Gruptan ayrıldın, grup da silindi' : 'Gruptan ayrıldın', 'success');
      window.navigateRoTaKip?.('/gruplar');
    } catch (error) {
      console.error('Gruptan ayrılırken hata:', error);
      window.showNotification?.('Gruptan ayrılınamadı', 'error');
    }
  }

  function openMoreSheet() {
    if (!window.RoTaKipBottomSheet) return;
    const content = document.createElement('div');
    content.className = 'ok-invite-sheet';
    const guest = isGuest();
    content.innerHTML = `
      ${guest ? '' : `<button type="button" class="ok-option" data-more="logout">
        <span class="ok-option-icon" aria-hidden="true"><i class="fa-solid fa-arrow-right-from-bracket"></i></span>
        <span class="ok-option-text"><strong>Çıkış yap</strong><small>Hesabından çıkış yaparsın, kayıtların silinmez.</small></span>
      </button>`}
      <button type="button" class="ok-option" data-more="report">
        <span class="ok-option-icon" aria-hidden="true"><i class="fa-regular fa-flag"></i></span>
        <span class="ok-option-text"><strong>Bildir</strong><small>Bu grupla ilgili bir sorun var.</small></span>
      </button>
      ${guest ? '' : `<button type="button" class="ok-option is-danger" data-more="leave">
        <span class="ok-option-icon" aria-hidden="true"><i class="fa-solid fa-trash"></i></span>
        <span class="ok-option-text"><strong>Hesabımı sil</strong><small>Hesabın ve okuma kayıtların bu gruptan silinir.</small></span>
      </button>`}`;
    const sheet = window.RoTaKipBottomSheet.open({ title: 'Seçenekler', className: 'ok-sheet', content });
    content.querySelector('[data-more="report"]').addEventListener('click', () => {
      sheet.close();
      // Önceki panel kapanış animasyonunu bitirsin, sonra Bildir paneli açılsın.
      window.setTimeout(openReportSheet, 300);
    });
    content.querySelector('[data-more="logout"]')?.addEventListener('click', () => {
      sheet.close();
      window.logoutFromProfile?.();
    });
    content.querySelector('[data-more="leave"]')?.addEventListener('click', () => {
      sheet.close();
      void leaveGroup();
    });
  }

  // Üst çubuk düğmeleri kapakla birlikte yeniden kurulabildiği için olaylar belgeden dinlenir.
  document.addEventListener('click', event => {
    if (event.target.closest('#okumalarInfoButton')) openGroupInfoSheet();
    else if (event.target.closest('#okumalarMoreButton')) openMoreSheet();
  });

  // ---- Dışa açılan arayüz ----------------------------------------------------

  window.RoTaKipOkumalarSections = Object.freeze({
    init() {
      bindTabs();
      refreshAccess();
      window.updateOkumalarHeroMeta();
      // Kapak ve Sayfam yeniden kuruldu: duyuru simgesi/şeridi eldeki veriyle çizilir, eskiyse yenilenir.
      void window.RoTaKipAnnouncements?.load();
      return apply(sectionFromUrl(), { keepScroll: true, scrollTab: false });
    },
    syncFromUrl() {
      refreshAccess();
      apply(sectionFromUrl());
      return true;
    },
    navigate(url) {
      const target = sectionFromUrl(url);
      open(target);
      return true;
    },
    open,
    refreshAccess,
    get active() {
      return activeSection;
    }
  });

  function refreshActiveSectionViews() {
    if (activeSection) onSectionShown(activeSection);
  }

  window.addEventListener('rotakip:auth-changed', () => {
    refreshAccess();
    // Giriş yapan kişi değişince çetele görünürlük yetkisi de değişir.
    if (window.RoTaKipCetele?.loaded) window.RoTaKipCetele.load({ force: true }).catch(() => {});
    refreshActiveSectionViews();
  });

  // Yönetici alanları değiştirdiğinde tüm görünümler yeni alanlarla çizilir.
  window.addEventListener('rotakip:cetele-config-changed', refreshActiveSectionViews);
})();
