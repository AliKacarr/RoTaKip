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
  
        // Eğer kullanıcı daha önce izin vermişse:
        const permission = await OneSignal.Notifications.permission;
        if (permission === "granted") {
          console.log("🔔 Bildirim izni zaten verilmiş");
        } else {
          console.log("🚫 Bildirim izni yok");
        }

        // OneSignal bildirim butonları için event delegation
        document.addEventListener('click', function(e) {
            // OneSignal butonlarını kontrol et
            if (e.target.classList.contains('onesignal-reset') || 
                e.target.classList.contains('onesignal-customlink-subscribe') ||
                e.target.closest('.onesignal-reset') ||
                e.target.closest('.onesignal-customlink-subscribe')) {
                
                // Bildirim izni değiştirme işlemini logla
                if (typeof logUnauthorizedAccess === 'function') {
                    const buttonText = e.target.textContent || e.target.innerText || '';
                    if (buttonText.includes('Kapat') || buttonText.includes('🔕')) {
                        logUnauthorizedAccess('OneSignal bildirimleri kapatma');
                    } else if (buttonText.includes('Aç') || buttonText.includes('🔔')) {
                        logUnauthorizedAccess('OneSignal bildirimleri açma');
                    } else {
                        logUnauthorizedAccess('OneSignal bildirim ayarları değiştirme');
                    }
                }
            }
        });
      } catch (err) {
        console.error("❌ OneSignal yükleme hatası:", err);
      }
    });
  }
  