/**
 * Session Watcher - Otomatik Sayfa Yenileme
 * 
 * Bu dosya kullanıcının uzun süre sonra (1 saat) sayfaya dönmesi durumunda
 * otomatik olarak sayfayı yeniler. Masaüstü ve mobil tarayıcılarda çalışır.
 * 
 * Özellikler:
 * - Sayfa yüklendiğinde mevcut zamanı kaydeder
 * - Kullanıcı 1 saatten uzun süre sonra dönerse sayfa yenilenir
 * - pageshow olayını kullanarak geri dönmeyi algılar
 * - event.persisted === true durumunda da yeniler (bellekten geri yükleme)
 * - window.location.reload() ile sayfayı yeniden yükler
 */

(function() {
    'use strict';
    
    // Konfigürasyon
    const SESSION_TIMEOUT = 30 * 60 * 1000; // 15 dakika
    const STORAGE_KEY = 'sessionStartTime';
    
    // Session başlangıç zamanını kaydet
    function saveSessionStart() {
        const currentTime = Date.now();
        try {
            localStorage.setItem(STORAGE_KEY, currentTime.toString());
          } catch (error) {
            console.warn('Session zamanı kaydedilemedi:', error);
        }
    }
    
    // Session başlangıç zamanını al
    function getSessionStart() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? parseInt(stored, 10) : null;
        } catch (error) {
            console.warn('Session zamanı alınamadı:', error);
            return null;
        }
    }
    
    // Session zamanını kontrol et ve gerekirse sayfayı yenile
    function checkSessionAndReload() {
        const sessionStart = getSessionStart();
        if (!sessionStart) {
            // Eğer session zamanı yoksa, yeni bir session başlat
            saveSessionStart();
            return;
        }
        
        const currentTime = Date.now();
        const timeDiff = currentTime - sessionStart;
        
        if (timeDiff > SESSION_TIMEOUT) {
            console.log('Session süresi aşıldı, sayfa yenileniyor...');
            // Session zamanını güncelle
            saveSessionStart();
            // Sayfayı yenile
            window.location.reload();
        }
    }
    
    // Sayfa görünürlük değişikliklerini izle
    function handleVisibilityChange() {
        if (!document.hidden) {
            // Sayfa tekrar görünür olduğunda session kontrolü yap
            checkSessionAndReload();
        }
    }
    
    // Focus olayını izle
    function handleFocus() {
        checkSessionAndReload();
    }
    
    // Sayfa yüklendiğinde çalışacak ana fonksiyon
    function initializeSessionWatcher() {
        
        // İlk yüklemede session zamanını kaydet
        saveSessionStart();
        
        // pageshow olayını dinle (geri dönüş ve bellekten yükleme)
        window.addEventListener('pageshow', function(event) {
            // Geri dönüş veya bellekten yükleme durumunda session kontrolü yap
            checkSessionAndReload();
        });
        // Sayfa görünürlük değişikliklerini izle
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        // Focus olayını izle
        window.addEventListener('focus', handleFocus);
        
        // Sayfa kapatılırken session zamanını temizle (opsiyonel)
        window.addEventListener('beforeunload', function() {
            // Bu durumda session zamanını temizlemek istemeyebiliriz
            // çünkü kullanıcı geri dönebilir
        });
        
        console.log('Session Watcher başlatıldı');
    }
    
    // DOM yüklendiğinde başlat
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeSessionWatcher);
    } else {
        // DOM zaten yüklenmişse hemen başlat
        initializeSessionWatcher();
    }
    
})();
