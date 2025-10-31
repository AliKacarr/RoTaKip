(function () {
    'use strict';

    const STORAGE_KEY = 'sessionStartTime';
    const INIT_FLAG_KEY = 'sessionWatcherInitialized';

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

    function reloadWithTimestamp() {
        const url = new URL(window.location.href);
        url.searchParams.set('_r', Date.now());
        window.location.replace(url.toString());
    }

    function initSessionWatcher() {
        const start = getSessionStart();
        const isNewSession = !start;
        const wasInitialized = sessionStorage.getItem(INIT_FLAG_KEY);

        // Eğer localStorage silinmiş ama sessionStorage hala varsa => sayfayı yenile
        if (isNewSession && wasInitialized) {
            console.log('localStorage temizlenmiş, yeni session başlatılıyor, sayfa yenileniyor...');
            saveSessionStart();
            reloadWithTimestamp();
            return;
        }

        // Normal durumda sadece session başlat
        saveSessionStart();
        sessionStorage.setItem(INIT_FLAG_KEY, 'true');

        // Sayfa bellekte tutulmuşsa (bfcache) geri dönülüyorsa => yenile
        window.addEventListener('pageshow', (e) => {
            if (e.persisted) {
                console.log('bfcache tespit edildi, sayfa yenileniyor...');
                reloadWithTimestamp();
            }
        });

        // Sayfa görünür olduğunda (arka plandan döndü) => yenile
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                console.log('Sayfa tekrar görünür oldu, yenileniyor...');
                reloadWithTimestamp();
            }
        });

        console.log('Session Watcher aktif (15 dakikalık limit kaldırıldı)');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSessionWatcher);
    } else {
        initSessionWatcher();
    }
})();
