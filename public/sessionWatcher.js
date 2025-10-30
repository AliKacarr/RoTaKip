(function() {
    'use strict';

    const SESSION_TIMEOUT = 15 * 60 * 1000; // 15 dakika
    const CHECK_INTERVAL_MS = 30 * 1000; // Periyodik kontrol: 30 saniye
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

    function reloadWithTimestamp() {
        const url = new URL(window.location.href);
        url.searchParams.set('_r', Date.now());
        window.location.replace(url.toString());
    }

    function checkSession(force = false) {
        const start = getSessionStart();
        if (!start) {
            saveSessionStart();
            return;
        }

        const diff = Date.now() - start;
        if (force || diff > SESSION_TIMEOUT) {
            console.log('Session süresi doldu, sayfa tazeleniyor...');
            saveSessionStart();
            reloadWithTimestamp();
        }
    }

    function initSessionWatcher() {
        // Sayfa yüklendiğinde eski session'ı kontrol et ve temizle
        const start = getSessionStart();
        if (start) {
            const diff = Date.now() - start;
            if (diff > SESSION_TIMEOUT) {
                console.log('Eski session tespit edildi, temizleniyor...');
                localStorage.removeItem(STORAGE_KEY);
            }
        }
        
        saveSessionStart();

        // Periyodik kontrol: belirli aralıklarla session süresini denetle
        // Sayfa aktifken kontrol eder
        let lastCheckTime = Date.now();
        setInterval(() => {
            const now = Date.now();
            const timeSinceLastCheck = now - lastCheckTime;
            
            // Eğer çok fazla zaman geçtiyse (setInterval throttle edilmiş olabilir), zorunlu kontrol et
            if (timeSinceLastCheck > CHECK_INTERVAL_MS * 2) {
                console.log('setInterval throttle edilmiş, kontrol ediliyor...');
                checkSession(true);
            } else {
                checkSession();
            }
            
            lastCheckTime = now;
        }, CHECK_INTERVAL_MS);

        // Sayfa bellekte tutulmuşsa veya geri dönülüyorsa
        window.addEventListener('pageshow', (e) => {
            if (e.persisted) {
                console.log('bfcache tespit edildi, zorunlu yenileme');
                checkSession(true);
            } else {
                checkSession();
            }
        });

        // Sayfa tekrar görünür olduğunda (arka plandan dönüldü)
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                // Arka plandan döndüğünde mutlaka kontrol et
                console.log('Sayfa tekrar görünür oldu, session kontrol ediliyor...');
                checkSession(true);
            }
        });

        // Focus olayında da kontrol et
        window.addEventListener('focus', () => checkSession());

        console.log('Session Watcher aktif');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSessionWatcher);
    } else {
        initSessionWatcher();
    }
})();
