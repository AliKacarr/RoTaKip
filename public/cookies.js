document.addEventListener('DOMContentLoaded', function () {

    const cookieConsentBanner = document.getElementById('cookieConsentBanner');
    const acceptCookiesBtn = document.getElementById('acceptCookies');
    const declineCookiesBtn = document.getElementById('declineCookies');

    function checkCookieConsent() {
        const cookieConsent = localStorage.getItem('cookieConsent');
        const cookieConsentDate = localStorage.getItem('cookieConsentDate');

        // If no consent data exists, show the banner
        if (!cookieConsent) {
            showCookieBanner();
            return;
        }

        // If user accepted, we never ask again
        if (cookieConsent === 'accepted') {
            return;
        }

        // If user declined and it's been more than a week, show the banner again
        if (cookieConsent === 'declined') {
            const consentDate = new Date(cookieConsentDate);

            // Get current date with Turkey timezone adjustment (+3 hours)
            const currentDate = new Date();
            currentDate.setHours(currentDate.getHours() + 3);

            const oneWeek = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

            if (currentDate - consentDate > oneWeek) {
                // It's been more than a week since declining, ask again
                localStorage.removeItem('cookieConsent');
                localStorage.removeItem('cookieConsentDate');
                showCookieBanner();
            }
        }
    }

    function showCookieBanner() {
        cookieConsentBanner.style.display = 'block';
    }

    // Handle accept button click
    acceptCookiesBtn.addEventListener('click', function () {
        localStorage.setItem('cookieConsent', 'accepted');

        // Store date with Turkey timezone adjustment (+3 hours)
        const date = new Date();
        date.setHours(date.getHours() + 3);
        localStorage.setItem('cookieConsentDate', date.toISOString());

        cookieConsentBanner.style.display = 'none';

        if (typeof logPageVisit === 'function') {
            logPageVisit();
        }
    });

    declineCookiesBtn.addEventListener('click', function () {
        localStorage.setItem('cookieConsent', 'declined');

        // Store date with Turkey timezone adjustment (+3 hours)
        const date = new Date();
        date.setHours(date.getHours() + 3);
        localStorage.setItem('cookieConsentDate', date.toISOString());

        // Close the banner
        cookieConsentBanner.style.display = 'none';

    });

    // Check cookie consent when the page loads
    if (typeof window.scheduleGoogleAnalyticsAfterPrimaryContent === 'function') {
        window.scheduleGoogleAnalyticsAfterPrimaryContent();
    }
    checkCookieConsent();
});
