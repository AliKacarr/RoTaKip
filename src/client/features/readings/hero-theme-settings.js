/*
 * Okumalar › Yönetim › Grup bilgileri: kapak arka planı seçici (yalnız yönetici).
 * Renk geçişleri her grupta önerilir. "Grup resmi" seçeneği yalnız yönetici cihazından kendi resmini
 * yüklediyse görünür (hazır avatarlar kapakta kullanılmaz); resim yoksa varsayılan İndigo'dur.
 * Seçim hemen kaydedilir: POST /api/update-group-hero-theme/:groupId
 * Kapağın kendisi group-bootstrap.js içindeki window.applyGroupHeroTheme ile boyanır.
 */
(function initializeHeroThemeSettings() {
  const THEMES = [
    ['gorsel', 'Grup resmi'],
    ['indigo', 'İndigo'],
    ['zumrut', 'Zümrüt'],
    ['gunbatimi', 'Gün batımı'],
    ['okyanus', 'Okyanus'],
    ['gul', 'Gül'],
    ['gece', 'Gece']
  ];
  let saving = false;

  function hasPhoto() {
    return Boolean(window.isCustomGroupImage && window.isCustomGroupImage(window.currentGroupData && window.currentGroupData.groupImage));
  }

  function currentTheme() {
    const theme = window.currentGroupData && window.currentGroupData.heroTheme;
    const known = THEMES.some(([key]) => key === theme) ? theme : 'gorsel';
    return known === 'gorsel' && !hasPhoto() ? 'indigo' : known;
  }

  function render() {
    const picker = document.getElementById('heroThemePicker');
    if (!picker) return;
    const section = picker.closest('.hero-theme-section');
    const admin = typeof LocalStorageManager !== 'undefined' && LocalStorageManager.isAdmin();
    if (section) section.hidden = !admin;
    if (!admin) return;
    const selected = currentTheme();
    const photo = hasPhoto();
    const visible = THEMES.filter(([key]) => key !== 'gorsel' || photo);
    const existing = Array.from(picker.querySelectorAll('.hero-theme-option'));
    // Aynı seçenekler duruyorsa DOM yeniden kurulmaz; seçili çerçeve yumuşakça geçer.
    if (existing.length === visible.length && existing.every((button, index) => button.dataset.theme === visible[index][0])) {
      existing.forEach(button => {
        const active = button.dataset.theme === selected;
        button.classList.toggle('is-chosen', active);
        button.setAttribute('aria-checked', String(active));
        button.disabled = saving;
      });
      return;
    }
    picker.innerHTML = visible.map(([key, label]) => `
      <button type="button" class="hero-theme-option${key === selected ? ' is-chosen' : ''}" data-theme="${key}"
        role="radio" aria-checked="${key === selected}" ${saving ? 'disabled' : ''}>
        <span class="hero-theme-swatch" data-theme="${key}" aria-hidden="true">${key === 'gorsel' ? '<i class="fa-solid fa-image"></i>' : ''}</span>
        <span class="hero-theme-name">${label}</span>
      </button>`).join('');
  }

  async function select(theme) {
    if (saving || theme === currentTheme()) return;
    const previous = currentTheme();
    saving = true;
    window.applyGroupHeroTheme?.(theme);
    window.currentGroupData = { ...(window.currentGroupData || {}), heroTheme: theme };
    render();
    try {
      const response = await fetch(`/api/update-group-hero-theme/${encodeURIComponent(window.groupid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ heroTheme: theme })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Kapak arka planı kaydedilemedi');
      window.invalidateRoTaKipGroupCache?.(window.groupid);
      window.showNotification?.('Kapak arka planı güncellendi', 'success');
    } catch (error) {
      window.applyGroupHeroTheme?.(previous);
      window.currentGroupData = { ...(window.currentGroupData || {}), heroTheme: previous };
      window.showNotification?.(error.message, 'error');
    } finally {
      saving = false;
      render();
    }
  }

  document.addEventListener('click', event => {
    const option = event.target.closest && event.target.closest('.hero-theme-option');
    if (option && option.closest('#heroThemePicker')) void select(option.dataset.theme);
  });

  window.renderHeroThemePicker = render;
  window.addEventListener('rotakip:auth-changed', render);
})();
