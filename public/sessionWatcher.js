(function() {
    'use strict';

    const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 dakika
    const STORAGE_KEY = 'sessionStartTime';

    // Zamanı kaydet
    function saveSessionStart() {
        try {
            localStorage.setItem(STORAGE_KEY, Date.now().toString());
        } catch (err) {
            console.warn('Session zamanı kaydedilemedi:', err);
        }
    }

    // Zamanı al
    function getSessionStart() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? parseInt(stored, 10) : null;
        } catch (err) {
            console.warn('Session zamanı alınamadı:', err);
            return null;
        }
    }

    // Yeniden yükle (timestamp parametresiyle)
    function reloadWithTimestamp() {
        const url = new URL(window.location.href);
        url.searchParams.set('_r', Date.now());
        window.location.replace(url.toString());
    }

    // Süre dolduysa yenile
    function checkSession(force = false) {
        const start = getSessionStart();
        if (!start) {
            saveSessionStart();
            return;
        }

        const diff = Date.now() - start;
        if (force || diff > SESSION_TIMEOUT) {
            console.log('Session süresi doldu, sayfa yenileniyor...');
            saveSessionStart();
            reloadWithTimestamp();
        }
    }

    // Başlangıç
    function initSessionWatcher() {
        const start = getSessionStart();

        // Eski session varsa temizle
        if (start && (Date.now() - start > SESSION_TIMEOUT)) {
            console.log('Eski session tespit edildi, temizleniyor...');
            localStorage.removeItem(STORAGE_KEY);
        }

        saveSessionStart();

        // Geri dönülme (bfcache) veya görünürlük olayları
        window.addEventListener('pageshow', (e) => {
            if (e.persisted) {
                console.log('bfcache tespit edildi, zorunlu yenileme');
                checkSession(true);
            } else {
                checkSession();
            }
        });

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) checkSession();
        });

        window.addEventListener('focus', () => checkSession());

        console.log('Session Watcher aktif');
    }

    // DOM hazırsa başlat
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSessionWatcher);
    } else {
        initSessionWatcher();
    }
})();
