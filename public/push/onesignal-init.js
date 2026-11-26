// Tek seferlik OneSignal başlatma koruması
if (!window.OneSignalInitialized) {
    window.OneSignalInitialized = true;
  
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

        const customLinkSelector = '.onesignal-customlink-container';
        const notificationButtonSelector = '.onesignal-customlink-container-button';
        const observedContainers = new WeakSet();
        let notificationStateUpdateFrame = null;
        let notificationStateChanging = false;

        const isNotificationEnabled = () => (
          OneSignal.Notifications.permission === true &&
          OneSignal.User.PushSubscription.optedIn === true
        );

        // Kap (Tesbihat bildirim paneli) SDK'dan sonra da oluşabileceği için her seferinde aranır.
        const getNotificationButtons = () => Array.from(
          document.querySelectorAll(`${customLinkSelector} ${notificationButtonSelector}`)
        );

        // Bildirim durumunu sayfanın geri kalanına duyurur (Tesbihat'taki zil simgesi bunu dinler) ve
        // sonraki açılışta SDK yüklenmeden simge doğru görünsün diye cihazda saklar.
        // Çerçeve beklemeden (arka plan sekmesinde de) çalışsın diye `requestAnimationFrame` dışındadır.
        const publishNotificationState = () => {
          const enabled = isNotificationEnabled();
          window.rotakipPushEnabled = enabled;
          try {
            window.localStorage.setItem('rotakip:push-enabled', enabled ? '1' : '0');
          } catch (_error) {
            // Depolama kapalı olabilir; olay yine de yayınlanır.
          }
          window.dispatchEvent(new CustomEvent('rotakip:push-state', { detail: { enabled } }));
        };

        const updateNotificationButtonState = () => {
          publishNotificationState();
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
          if (!button || !button.closest(customLinkSelector)) return;

          // OneSignal'ın oluşturduğu bağlantının masaüstü ve mobilde farklı
          // zamanlarda yenilenmesine bağlı kalmadan tercihi SDK üzerinden değiştir.
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          if (notificationStateChanging) return;

          const enabled = isNotificationEnabled();
          notificationStateChanging = true;
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
          }
        };

        const observeCustomLinkContainers = () => {
          document.querySelectorAll(customLinkSelector).forEach((container) => {
            if (observedContainers.has(container)) return;
            observedContainers.add(container);
            new MutationObserver(updateNotificationButtonState).observe(container, {
              childList: true,
              subtree: true,
              characterData: true
            });
          });
        };

        document.addEventListener('click', handleNotificationToggle, true);
        // Panel body'nin doğrudan çocuğu olarak eklenir; yalnızca bu düzey izlenir.
        new MutationObserver(observeCustomLinkContainers).observe(document.body, { childList: true });
        observeCustomLinkContainers();

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
