/*
 * Okumalar › Yönetim: satır listesi ve alttan açılan paneller.
 * Ayar formları group-management.js'in bildiği DOM öğeleridir; bu dosya yalnız onları
 * ilgili satıra dokununca panele taşır, kapanınca gizli kapsayıcıya geri koyar ve
 * satırlardaki kısa özetleri (kurallar, istek sayısı, üye sayısı) günceller.
 */
(function initializeOkumalarManage() {
  const PANEL_TITLES = {
    info: 'Grup bilgileri',
    rules: 'Kurallar',
    add: 'Üye ekle',
    invite: 'Giriş bağlantısı gönder',
    requests: 'Katılma istekleri',
    logs: 'Etkinlik kayıtları'
  };
  const RETURN_DELAY_MS = 280;
  let observer = null;

  function root() {
    return document.querySelector('.main-area.ok-manage');
  }

  function holder() {
    return root()?.querySelector('.ok-manage-panels') || null;
  }

  function panel(name) {
    return document.querySelector(`[data-manage-body="${name}"]`);
  }

  function selectedText(id) {
    const select = document.getElementById(id);
    const option = select && select.options[select.selectedIndex];
    return option ? option.textContent.trim() : '';
  }

  function setText(id, text) {
    const element = document.getElementById(id);
    if (element && element.textContent !== text) element.textContent = text;
  }

  function updateSummaries() {
    const rules = [
      selectedText('readingEditPolicySelect'),
      document.getElementById('autoMarkUnreadSelect')?.value === 'true' ? 'otomatik ✖ açık' : ''
    ].filter(Boolean);
    setText('okumalarManageRulesSummary', rules.join(' · ') || 'Düzenleme, otomasyonlar');
    setText('okumalarManageInfoSummary', selectedText('groupVisibility') || 'Ad, açıklama, resim');

    const requests = document.querySelectorAll('#joinRequestsList .join-request-item').length;
    const badge = document.getElementById('okumalarManageRequestsBadge');
    if (badge) {
      badge.hidden = requests === 0;
      badge.textContent = String(requests);
    }
    setText('okumalarManageRequestsSummary', requests ? `${requests} bekleyen istek` : 'Bekleyen istek yok');

    const active = document.querySelectorAll('#userList .user-container').length;
    const passive = document.querySelectorAll('#passiveUserList .user-container').length;
    setText('okumalarManageMemberCount', active ? `${active} aktif` : '');
    setText('okumalarManagePassiveCount', passive ? `(${passive})` : '');
  }

  function openPanel(name) {
    const body = panel(name);
    if (!body || !window.RoTaKipBottomSheet) return;
    const sheet = window.RoTaKipBottomSheet.open({
      title: PANEL_TITLES[name] || '',
      className: 'ok-sheet ok-manage-sheet',
      content: body,
      onClose: () => {
        window.setTimeout(() => {
          // Bu arada aynı panel yeniden açıldıysa yerinde bırak.
          if (body.parentElement === sheet.body) holder()?.appendChild(body);
          updateSummaries();
        }, RETURN_DELAY_MS);
      }
    });
    if (name === 'requests' && typeof window.loadJoinRequests === 'function') void window.loadJoinRequests();
    if (name === 'add') window.setTimeout(() => document.getElementById('newUserInput')?.focus(), 60);
  }

  function bind() {
    const area = root();
    if (!area || area.dataset.manageBound === 'true') return;
    area.dataset.manageBound = 'true';
    area.addEventListener('click', event => {
      const row = event.target.closest('[data-manage-panel]');
      if (row) openPanel(row.dataset.managePanel);
    });
    // Paneller sayfa dışına taşındığında da değişiklikleri yakalamak için olaylar panellere bağlanır.
    Object.keys(PANEL_TITLES).forEach(name => panel(name)?.addEventListener('change', updateSummaries));
    observer?.disconnect();
    observer = new MutationObserver(updateSummaries);
    ['joinRequestsList', 'userList', 'passiveUserList'].forEach(id => {
      const element = document.getElementById(id);
      if (element) observer.observe(element, { childList: true });
    });
  }

  window.openOkumalarManagePanel = openPanel;
  window.renderOkumalarManage = function renderOkumalarManage() {
    bind();
    updateSummaries();
    window.renderHeroThemePicker?.();
  };
})();
