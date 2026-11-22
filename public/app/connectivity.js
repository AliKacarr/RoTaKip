const RECOVERY_BANNER_MS = 2500;
const BANNER_ID = 'connectionBanner';

let bannerHideTimer = null;
let monitorStarted = false;

export function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

// Ağ katmanında kopan istekler (fetch TypeError'ı, yüklenemeyen script/stil paketleri)
// kullanıcıya "xyz.min.js yüklenemedi" yerine bağlantı sorunu olarak gösterilir.
export function isConnectionError(error) {
  if (isOffline()) return true;
  if (!error) return false;
  if (error.isNetworkError) return true;
  return error.name === 'TypeError' && /failed to fetch|networkerror|load failed|network request failed/i.test(error.message || '');
}

export function describeConnectionError(error) {
  if (isOffline()) {
    return {
      title: 'İnternet bağlantısı yok',
      message: 'Cihazınızın internet bağlantısı kopmuş görünüyor. Bağlantınızı kontrol edin; bağlantı gelince sayfa kendiliğinden yenilenecek.'
    };
  }
  if (isConnectionError(error)) {
    return {
      title: 'Sunucuya ulaşılamıyor',
      message: 'Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.'
    };
  }
  return null;
}

function getBanner() {
  let banner = document.getElementById(BANNER_ID);
  if (!banner) {
    banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.className = 'connection-banner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.hidden = true;
    banner.innerHTML = '<i class="fa-solid fa-wifi" aria-hidden="true"></i><span></span>';
    document.body.appendChild(banner);
  }
  return banner;
}

function showBanner(message, state) {
  window.clearTimeout(bannerHideTimer);
  const banner = getBanner();
  banner.dataset.state = state;
  banner.querySelector('span').textContent = message;
  banner.querySelector('i').className = state === 'online' ? 'fa-solid fa-circle-check' : 'fa-solid fa-wifi';
  banner.hidden = false;
}

function hideBanner() {
  const banner = document.getElementById(BANNER_ID);
  if (banner) banner.hidden = true;
}

function handleOffline() {
  showBanner('İnternet bağlantısı yok. Bağlantı gelene kadar bazı bölümler çalışmayabilir.', 'offline');
}

function handleOnline() {
  // Bağlantı hata ekranındayken geri geldiyse içerik kendiliğinden yeniden denenir.
  if (document.querySelector('.route-error[data-connection]')) {
    window.location.reload();
    return;
  }
  if (!document.getElementById(BANNER_ID) || getBanner().hidden) return;
  showBanner('Bağlantı yeniden kuruldu.', 'online');
  bannerHideTimer = window.setTimeout(hideBanner, RECOVERY_BANNER_MS);
}

export function initializeConnectivityMonitor() {
  if (monitorStarted) return;
  monitorStarted = true;
  window.addEventListener('offline', handleOffline);
  window.addEventListener('online', handleOnline);
  if (isOffline()) handleOffline();
}
