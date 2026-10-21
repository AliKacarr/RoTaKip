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

