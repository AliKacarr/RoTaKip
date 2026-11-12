// Tek seferlik OneSignal başlatma koruması
if (!window.OneSignalInitialized) {
    window.OneSignalInitialized = true;
  
function initializeOneSignalSettingsVisibility() {
    const container = document.querySelector('.onesignal-customlink-container');
    const settingsSection = container?.closest('.onesignal-settings-section');
    const settingsContent = settingsSection?.querySelector('.onesignal-settings-content');

    if (!container || !settingsSection || !settingsContent) return;

    let updateFrame = null;
    let isVisible = false;

    const updateVisibility = () => {
        if (updateFrame !== null) cancelAnimationFrame(updateFrame);
        updateFrame = requestAnimationFrame(() => {
            updateFrame = null;
            const hasContent = (
                container.classList.contains('is-syncing') ||
                container.childElementCount > 0 ||
                container.textContent.trim().length > 0
            );

            if (hasContent) settingsSection.hidden = false;
            settingsSection.classList.toggle('is-visible', hasContent);
            settingsSection.style.height = hasContent ? `${settingsContent.scrollHeight}px` : '0px';
            isVisible = hasContent;
        });
    };

    settingsSection.addEventListener('transitionend', (event) => {
        if (event.propertyName === 'height' && !isVisible) {
            settingsSection.hidden = true;
        }
    });

    updateVisibility();
    new MutationObserver(updateVisibility).observe(container, {
        childList: true,
        subtree: true,
        characterData: true
    });

    if ('ResizeObserver' in window) {
        new ResizeObserver(() => {
            if (isVisible) updateVisibility();
        }).observe(settingsContent);
    } else {
        window.addEventListener('resize', updateVisibility);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeOneSignalSettingsVisibility, { once: true });
} else {
    initializeOneSignalSettingsVisibility();
}

window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal) {
      try {
        // env.js ile gelen app id'yi kullan
        const appId = window.ONESIGNAL_APP_ID;
        if (!appId) {
          console.warn('OneSignal APP_ID bulunamadı');
          return;
        }
        await OneSignal.init({ appId });
  
        console.log("✅ OneSignal başarıyla başlatıldı");

        const customLinkContainer = document.querySelector('.onesignal-customlink-container');
        const notificationButtonSelector = [
          '.onesignal-customlink-subscribe',
          '.onesignal-customlink-unsubscribe',
          '.onesignal-reset',
          '.onesignal-customlink-container-button',
          'button'
        ].join(', ');
        let notificationStateUpdateFrame = null;
        let notificationStateChanging = false;
        let notificationPlaceholder = null;
        let notificationPlaceholderStartedAt = 0;
        let notificationPlaceholderTimer = null;

        const notificationPlaceholderMinDuration = 1100;

        const isNotificationEnabled = () => (
          OneSignal.Notifications.permission === true &&
          OneSignal.User.PushSubscription.optedIn === true
        );

        const getNotificationButtons = () => {
          if (!customLinkContainer) return [];

          const buttons = Array.from(customLinkContainer.querySelectorAll(notificationButtonSelector));

          // İç içe bir düğme yapısı varsa yalnızca en dıştaki etkileşimli öğeyi
          // güncelle; açıklama içindeki bağlantılara dokunma.
          return buttons.filter((button) => {
            const ancestorButton = button.parentElement?.closest(notificationButtonSelector);
            return !ancestorButton || !customLinkContainer.contains(ancestorButton);
          });
        };

        const removeNotificationPlaceholder = () => {
          if (!notificationPlaceholder) return;

          const elapsed = performance.now() - notificationPlaceholderStartedAt;
          const hasRenderedButton = getNotificationButtons().length > 0;

          if (
            notificationStateChanging ||
            elapsed < notificationPlaceholderMinDuration ||
            (!hasRenderedButton && elapsed < 5000)
          ) {
            clearTimeout(notificationPlaceholderTimer);
            notificationPlaceholderTimer = setTimeout(
              removeNotificationPlaceholder,
              Math.max(100, notificationPlaceholderMinDuration - elapsed)
            );
            return;
          }

          customLinkContainer?.classList.remove('is-syncing');
          notificationPlaceholder.remove();
          notificationPlaceholder = null;
          notificationPlaceholderTimer = null;
        };

        const preserveNotificationControls = () => {
          if (!customLinkContainer || notificationPlaceholder) return;

          notificationPlaceholder = customLinkContainer.cloneNode(true);
          notificationPlaceholder.className = 'onesignal-customlink-placeholder';
          notificationPlaceholder.removeAttribute('id');
          notificationPlaceholder.setAttribute('aria-hidden', 'true');
          notificationPlaceholder.inert = true;
          notificationPlaceholder.style.minHeight = `${customLinkContainer.offsetHeight}px`;

          customLinkContainer.insertAdjacentElement('afterend', notificationPlaceholder);
          customLinkContainer.classList.add('is-syncing');
          notificationPlaceholderStartedAt = performance.now();
        };

        const updateNotificationButtonState = () => {
          if (notificationStateUpdateFrame !== null) {
            cancelAnimationFrame(notificationStateUpdateFrame);
          }

          notificationStateUpdateFrame = requestAnimationFrame(() => {
            notificationStateUpdateFrame = null;
            const enabled = isNotificationEnabled();
            const label = enabled ? '🔕 Bildirimleri Kapat' : '🔔 Bildirimleri Aç';

            getNotificationButtons().forEach((button) => {
              if (button.textContent.trim() !== label) button.textContent = label;
              button.setAttribute('aria-pressed', String(enabled));
              button.setAttribute('aria-busy', String(notificationStateChanging));

              if ('disabled' in button) button.disabled = notificationStateChanging;
            });
          });
        };

        const logNotificationPreferenceChange = (enabled) => {
          if (typeof logUnauthorizedAccess !== 'function') return;

          logUnauthorizedAccess(
            enabled
              ? 'OneSignal bildirimleri kapatma'
              : 'OneSignal bildirimleri açma'
          );
        };

        const handleNotificationToggle = async (event) => {
          if (!(event.target instanceof Element)) return;

          const button = event.target.closest(notificationButtonSelector);
          if (!button || !customLinkContainer?.contains(button)) return;

          // OneSignal'ın oluşturduğu bağlantının masaüstü ve mobilde farklı
          // zamanlarda yenilenmesine bağlı kalmadan tercihi SDK üzerinden değiştir.
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          if (notificationStateChanging) return;

          const enabled = isNotificationEnabled();
          notificationStateChanging = true;
          preserveNotificationControls();
          logNotificationPreferenceChange(enabled);
          updateNotificationButtonState();

          try {
            if (enabled) {
              await OneSignal.User.PushSubscription.optOut();
            } else {
              // Geçerli bir push anahtarı yoksa optIn() mobilde yerel izin
              // penceresini de açar; sonuç aşağıdaki değişim olaylarıyla eşitlenir.
              await OneSignal.User.PushSubscription.optIn();
            }
          } catch (error) {
            console.error('❌ Bildirim tercihi güncellenemedi:', error);
          } finally {
            notificationStateChanging = false;
            updateNotificationButtonState();
            removeNotificationPlaceholder();
          }
        };

        if (customLinkContainer) {
          customLinkContainer.addEventListener('click', handleNotificationToggle, true);
          new MutationObserver(() => {
            updateNotificationButtonState();
            removeNotificationPlaceholder();
          }).observe(customLinkContainer, {
            childList: true,
            subtree: true,
            characterData: true
          });
        }

        OneSignal.Notifications.addEventListener('permissionChange', updateNotificationButtonState);
        OneSignal.User.PushSubscription.addEventListener('change', updateNotificationButtonState);
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) updateNotificationButtonState();
        });
        window.addEventListener('pageshow', updateNotificationButtonState);

        updateNotificationButtonState();

        // Eğer kullanıcı daha önce izin vermiş ve aboneliği etkinse:
        if (isNotificationEnabled()) {
          console.log("🔔 Bildirim izni zaten verilmiş");
        } else {
          console.log("🚫 Bildirim izni yok");
        }
      } catch (err) {
        console.error("❌ OneSignal yükleme hatası:", err);
      }
    });
  }
