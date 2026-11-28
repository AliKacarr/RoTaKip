/*
 * Okumalar ortak yardımcıları: düzenleme izni (grup düzenleme aralığı), kısıt bilgi penceresi,
 * oturum zaman aşımı ve veri değişince görünümleri yenileme.
 * loadTrackerTable eski adıyla korunur: yönetim/üye işlemleri veriyi değiştirdiğinde
 * tüm Okumalar görünümlerini yeniden çizer.
 */
(function initializeOkumalarCore() {
  const metrics = () => window.RoTaKipReadingMetrics;
  const SESSION_CHECK_DEBOUNCE = 5000;
  const SESSION_TIMEOUT = 20 * 60 * 1000;
  let lastSessionCheckTime = 0;
  let sessionCountdownInterval = null;
  let restrictionPreviousFocus = null;
  let refreshTimer = null;

  function currentUser() {
    return typeof LocalStorageManager !== 'undefined' ? LocalStorageManager.getCurrentUserInfo() : null;
  }

  // ---- Düzenleme izni ------------------------------------------------------

  window.isReadingDateEditableForCurrentUser = function isReadingDateEditableForCurrentUser(dateKey) {
    const user = currentUser();
    if (!user || !metrics()) return false;
    const today = metrics().todayKey();
    if (dateKey > today) return false;
    if (user.userAuthority === 'admin') return true;
    const policy = typeof window.getCurrentReadingEditPolicy === 'function'
      ? window.getCurrentReadingEditPolicy()
      : 'all';
    if (policy === 'today') return dateKey === today;
    if (policy === 'today_yesterday') return dateKey === today || dateKey === metrics().addDays(today, -1);
    return true;
  };

  window.showReadingEditRestrictionInfo = function showReadingEditRestrictionInfo(reason = 'date_restricted') {
    const policy = typeof window.getCurrentReadingEditPolicy === 'function'
      ? window.getCurrentReadingEditPolicy()
      : 'all';
    const panel = document.getElementById('readingEditRestrictionPanel');
    const title = document.getElementById('readingEditRestrictionTitle');
    const message = document.getElementById('readingEditRestrictionMessage');
    const guidance = document.getElementById('readingEditRestrictionGuidance');
    if (!panel || !title || !message || !guidance) return;
    const configurations = {
      future: {
        title: 'Bu gün henüz gelmedi',
        message: '<strong>Gelecek günlere</strong> kayıt eklenemez.',
        guidance: '<strong>Gün geldiğinde</strong> kaydınızı ekleyebilirsiniz.'
      },
      other_user: {
        title: 'Bu kayıt size ait değil',
        message: 'Yalnızca <strong>kendi kayıtlarınızı</strong> değiştirebilirsiniz.',
        guidance: 'Bir düzeltme gerekiyorsa <strong>grup yöneticinizle</strong> iletişime geçin.'
      },
      date_restricted: {
        title: 'Bu tarih düzenlemeye kapalı',
        message: policy === 'today'
          ? 'Bu grupta yalnızca <strong>bugünün</strong> kayıtları düzenlenebilir.'
          : 'Bu grupta yalnızca <strong>bugünün ve dünün</strong> kayıtları düzenlenebilir.',
        guidance: 'Geçmiş bir kaydı değiştirmeniz gerekiyorsa <strong>grup yöneticinizle</strong> iletişime geçin.'
      }
    };
    const content = configurations[reason] || configurations.date_restricted;
    title.textContent = content.title;
    message.innerHTML = content.message;
    guidance.innerHTML = content.guidance;
    if (panel.hidden) restrictionPreviousFocus = document.activeElement;
    panel.hidden = false;
    document.body.style.overflow = 'hidden';
    panel.querySelector('.reading-edit-restriction-close')?.focus();
  };

  window.closeReadingEditRestrictionInfo = function closeReadingEditRestrictionInfo() {
    const panel = document.getElementById('readingEditRestrictionPanel');
    if (!panel || panel.hidden) return;
    const active = document.activeElement;
    if (active && panel.contains(active) && typeof active.blur === 'function') active.blur();
    panel.hidden = true;
    document.body.style.overflow = '';
    if (restrictionPreviousFocus && restrictionPreviousFocus !== document.body
      && document.contains(restrictionPreviousFocus) && typeof restrictionPreviousFocus.focus === 'function') {
      restrictionPreviousFocus.focus({ preventScroll: true });
    }
    restrictionPreviousFocus = null;
  };

  function bindRestrictionPanel() {
    const panel = document.getElementById('readingEditRestrictionPanel');
    if (!panel || panel.dataset.restrictionBound === 'true') return;
    panel.dataset.restrictionBound = 'true';
    ['.reading-edit-restriction-close', '.reading-edit-restriction-x', '.reading-edit-restriction-overlay'].forEach(selector => {
      panel.querySelector(selector)?.addEventListener('click', window.closeReadingEditRestrictionInfo);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !panel.hidden) window.closeReadingEditRestrictionInfo();
    });
  }

  // ---- Oturum zaman aşımı -------------------------------------------------

  function reloadAfterSessionTimeout() {
    if (sessionCountdownInterval) window.clearInterval(sessionCountdownInterval);
    sessionCountdownInterval = null;
    const modal = document.getElementById('sessionTimeoutModal');
    if (!modal) return;
    modal.classList.remove('show');
    window.setTimeout(() => {
      modal.style.display = 'none';
      window.location.href = window.location.href;
    }, 300);
  }

  function showSessionTimeoutModal() {
    const modal = document.getElementById('sessionTimeoutModal');
    const countdownElement = document.getElementById('sessionTimeoutCountdown');
    if (!modal) return;
    modal.style.display = 'flex';
    window.setTimeout(() => modal.classList.add('show'), 10);
    if (!countdownElement) return;
    if (sessionCountdownInterval) window.clearInterval(sessionCountdownInterval);
    let countdown = 3;
    countdownElement.textContent = countdown;
    sessionCountdownInterval = window.setInterval(() => {
      if (countdown >= 0) {
        countdownElement.textContent = countdown;
        countdownElement.classList.add('countdown-pulse');
        window.setTimeout(() => countdownElement.classList.remove('countdown-pulse'), 300);
      } else {
        reloadAfterSessionTimeout();
      }
      countdown -= 1;
    }, 1000);
  }

  // true dönerse sayfa yenilenmek üzeredir; yazma işlemi yapılmamalıdır.
  window.checkSessionTimeout = function checkSessionTimeout() {
    const now = Date.now();
    if (now - lastSessionCheckTime <= SESSION_CHECK_DEBOUNCE) return false;
    const sessionStartTime = parseInt(localStorage.getItem('pageSessionStartTime') || '0', 10);
    if (now - sessionStartTime >= SESSION_TIMEOUT) {
      showSessionTimeoutModal();
      return true;
    }
    lastSessionCheckTime = now;
    return false;
  };

  // ---- Görünümleri yenileme ------------------------------------------------

  function refreshViews() {
    void window.renderReadingMessagePanels?.();
    window.renderOkumalarToday?.();
    void window.loadUserCards?.({ animateRefresh: true });
    void window.loadReadingStats?.({ animateRefresh: true });
  }

  // Bir okuma değişince sıralama, istatistik ve mesajlar kısa bir gecikmeyle bir kez yenilenir.
  window.schedulePostToggleUiRefresh = function schedulePostToggleUiRefresh() {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      try {
        refreshViews();
      } catch (error) {
        console.error('Okumalar görünümleri yenilenemedi:', error);
      }
    }, 200);
  };

  // Üye ekleme/silme gibi işlemlerden sonra çağrılır (eski adıyla).
  window.loadTrackerTable = async function loadTrackerTable() {
    refreshViews();
  };

  window.initializeOkumalarCore = function initializeOkumalarCore() {
    bindRestrictionPanel();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.initializeOkumalarCore, { once: true });
  } else {
    window.initializeOkumalarCore();
  }
})();
