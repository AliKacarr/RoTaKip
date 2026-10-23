(function initializeSecurityUtils() {
    const entities = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };

    window.escapeHtml = function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, character => entities[character]);
    };

    window.safeImageSrc = function safeImageSrc(value, fallback = '/images/default.png') {
        if (typeof value !== 'string' || !value.trim()) return fallback;
        try {
            const url = new URL(value.trim(), window.location.origin);
            const host = url.hostname.toLowerCase();
            const isSameOrigin = url.origin === window.location.origin;
            const isDropbox = url.protocol === 'https:' && (
                host === 'dropbox.com' || host.endsWith('.dropbox.com') ||
                host === 'dropboxusercontent.com' || host.endsWith('.dropboxusercontent.com')
            );
            return isSameOrigin || isDropbox ? url.href : fallback;
        } catch (_) {
            return fallback;
        }
    };

    window.safeExternalUrl = function safeExternalUrl(value, fallback = '') {
        if (typeof value !== 'string' || !value.trim()) return fallback;
        try {
            const url = new URL(value.trim(), window.location.origin);
            return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : fallback;
        } catch (_) {
            return fallback;
        }
    };
})();

const deferredScriptLoads = new Map();

function loadDeferredScriptOnce(src, isReady) {
    if (typeof isReady === 'function' && isReady()) {
        return Promise.resolve();
    }
    if (deferredScriptLoads.has(src)) {
        return deferredScriptLoads.get(src);
    }

    const loadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = resolve;
        script.onerror = () => {
            deferredScriptLoads.delete(src);
            script.remove();
            reject(new Error(`Ertelenmiş script yüklenemedi: ${src}`));
        };
        document.head.appendChild(script);
    });

    deferredScriptLoads.set(src, loadPromise);
    return loadPromise;
}

function runAfterPageLoadWhenIdle(task, timeout = 4000) {
    const runWhenIdle = () => {
        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(() => task(), { timeout });
        } else {
            window.setTimeout(task, 1500);
        }
    };

    if (document.readyState === 'complete') {
        runWhenIdle();
    } else {
        window.addEventListener('load', runWhenIdle, { once: true });
    }
}

window.loadGoogleAnalytics = async function loadGoogleAnalytics() {
    if (window.googleAnalyticsInitialized) return;
    window.googleAnalyticsInitialized = true;

    const measurementId = 'G-VDTE86G15P';
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() {
        window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', measurementId);

    try {
        await loadDeferredScriptOnce(
            `https://www.googletagmanager.com/gtag/js?id=${measurementId}`,
            () => Boolean(document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${measurementId}"]`))
        );
    } catch (error) {
        window.googleAnalyticsInitialized = false;
        console.error('Google Analytics yüklenemedi:', error);
    }
};

window.scheduleGoogleAnalyticsLoad = function scheduleGoogleAnalyticsLoad() {
    runAfterPageLoadWhenIdle(() => window.loadGoogleAnalytics());
};

window.scheduleGoogleAnalyticsAfterPrimaryContent = function scheduleGoogleAnalyticsAfterPrimaryContent() {
    if (window.rotakipPrimaryContentReady) {
        window.scheduleGoogleAnalyticsLoad();
        return;
    }
    window.addEventListener('rotakip:primary-content-ready', () => {
        window.scheduleGoogleAnalyticsLoad();
    }, { once: true });
};

window.loadTawkDeferred = async function loadTawkDeferred() {
    if (window.Tawk_API) return;
    window.Tawk_API = {};
    window.Tawk_LoadStart = new Date();

    try {
        await loadDeferredScriptOnce(
            'https://embed.tawk.to/68278ccfe4781d19149b3d72/1ird7s2qf',
            () => Boolean(document.querySelector('script[src*="embed.tawk.to/68278ccfe4781d19149b3d72"]'))
        );
    } catch (error) {
        delete window.Tawk_API;
        console.error('Tawk.to yüklenemedi:', error);
    }
};

window.scheduleTawkLoad = function scheduleTawkLoad() {
    runAfterPageLoadWhenIdle(() => window.loadTawkDeferred());
};

window.loadOneSignalDeferred = async function loadOneSignalDeferred() {
    if (window.oneSignalDeferredLoadStarted) return;
    window.oneSignalDeferredLoadStarted = true;

    try {
        await loadDeferredScriptOnce(
            '/env.js',
            () => typeof window.ONESIGNAL_APP_ID !== 'undefined'
        );

        if (!window.ONESIGNAL_APP_ID) {
            console.warn('OneSignal APP_ID bulunamadı');
            return;
        }

        await loadDeferredScriptOnce(
            '/push/onesignal-init.js',
            () => window.OneSignalInitialized === true
        );
        await loadDeferredScriptOnce(
            'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js',
            () => typeof window.OneSignal !== 'undefined'
        );
    } catch (error) {
        window.oneSignalDeferredLoadStarted = false;
        console.error('OneSignal ertelenmiş yükleme hatası:', error);
    }
};

window.scheduleOneSignalLoad = function scheduleOneSignalLoad() {
    runAfterPageLoadWhenIdle(() => window.loadOneSignalDeferred(), 5000);
};

