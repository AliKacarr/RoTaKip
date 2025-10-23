/**
 * Session Watcher - Otomatik Sayfa Yenileme (Mobil uyumlu sürüm)
 * 
 * Özellikler:
 * - Sayfa yüklendiğinde mevcut zamanı kaydeder
 * - Kullanıcı 30 dakikadan uzun süre sonra dönerse sayfayı yeniler
 * - Mobil tarayıcılarda bfcache (bellekten geri yükleme) sorunlarını önler
 * - Gerektiğinde window.location.href ile yeniden yönlendirme yapar
 */

(function() {
    'use strict';
    
    const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 dakika
    const STORAGE_KEY = 'sessionStartTime';

    function saveSessionStart() {
        try {
            localStorage.setItem(STORAGE_KEY, Date.now().toString());
        } catch (err) {
            console.warn('Session zamanı kaydedilemedi:', err);
        }
    }

    function getSessionStart() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? parseInt(stored, 10) : null;
        } catch (err) {
            console.warn('Session zamanı alınamadı:', err);
            return null;
        }
    }

    function hardReload() {
        // Mobilde bazı durumlarda reload() çalışmadığı için fallback
        try {
            console.log('Sayfa yeniden yükleniyor...');
            window.location.href = window.location.href;
        } catch (e) {
            window.location.reload(true);
        }
    }

    function checkSessionAndReload(force = false) {
        const start = getSessionStart();
        if (!start) {
            saveSessionStart();
            return;
        }

        const diff = Date.now() - start;

        if (force || diff > SESSION_TIMEOUT) {
            console.log('Session süresi doldu, yenileme başlatılıyor...');
            saveSessionStart();
            hardReload();
        }
    }

    function initializeSessionWatcher() {
        saveSessionStart();

        // Sayfa bellekte tutulmuşsa (bfcache) veya geri dönülüyorsa
        window.addEventListener('pageshow', (event) => {
            if (event.persisted) {
                console.log('Bellekten geri yüklendi (bfcache) → zorunlu yenileme');
                checkSessionAndReload(true);
            } else {
                checkSessionAndReload();
            }
        });

        // Görünürlük değiştiğinde (örn. uygulamadan geri dönüldü)
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) checkSessionAndReload();
        });

        // Sekme focus olduğunda kontrol
        window.addEventListener('focus', () => checkSessionAndReload());

        console.log('Session Watcher aktif');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeSessionWatcher);
    } else {
        initializeSessionWatcher();
    }

})();
