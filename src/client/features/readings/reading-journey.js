/* exported initializeReadingJourney */

function setAuthenticatedUserAreasVisibility(isVisible) {
  const areas = document.getElementById('authenticatedUserAreas');
  if (!areas) return;
  areas.setAttribute('aria-hidden', String(!isVisible));
  areas.classList.toggle('show', isVisible);
}

window.showAuthenticatedUserAreas = function showAuthenticatedUserAreas() {
  window.requestAnimationFrame(() => setAuthenticatedUserAreasVisibility(true));
};

window.hideAuthenticatedUserAreas = function hideAuthenticatedUserAreas() {
  setAuthenticatedUserAreasVisibility(false);
};

window.syncAuthenticatedUserAreas = function syncAuthenticatedUserAreas(isAuthenticated) {
  if (isAuthenticated) window.showAuthenticatedUserAreas();
  else window.hideAuthenticatedUserAreas();
};

window.initializeReadingJourney = async function initializeReadingJourney() {
  if (typeof LocalStorageManager === 'undefined' || !LocalStorageManager.isUserLoggedIn()) return;
  const userInfo = LocalStorageManager.getCurrentUserInfo();
  const store = window.globalDataStore;
  if (!userInfo || !store) return;

  const totalReading = typeof store.getUserReadingCount === 'function'
    ? store.getUserReadingCount(userInfo.userId)
    : 0;
  const sessionUser = window.currentSessionUser || {};
  let loginStreak = Number(sessionUser.loginStreak) || 0;
  if (window.loginStreakUpdatePromise) {
    const streakData = await window.loginStreakUpdatePromise.catch(() => null);
    if (streakData) loginStreak = Number(streakData.loginStreak) || 0;
  }

  const streakElement = document.getElementById('userLoginStreak');
  const totalElement = document.getElementById('userTotalReading');
  if (streakElement) streakElement.textContent = String(loginStreak);
  if (totalElement) totalElement.textContent = String(totalReading);

  const leagues = Array.isArray(window.ROTAKIP_LEAGUES)
    ? window.ROTAKIP_LEAGUES
    : [];
  if (leagues.length > 0) {
    const current = leagues.find(league => totalReading >= league.min && totalReading < league.max)
      || leagues[leagues.length - 1];
    const index = leagues.indexOf(current);
    const next = index < leagues.length - 1 ? leagues[index + 1] : current;
    const currentImage = document.getElementById('currentLeagueImg');
    const currentName = document.getElementById('currentLeagueName');
    const nextImage = document.getElementById('nextLeagueImg');
    const nextName = document.getElementById('nextLeagueName');
    const progressText = document.getElementById('leagueProgressText');
    const progressFill = document.getElementById('leagueProgressFill');
    if (currentImage) currentImage.src = `/images/${current.img}`;
    if (currentName) currentName.textContent = current.name;
    if (nextImage) nextImage.src = `/images/${next.img}`;
    if (nextName) nextName.textContent = next.name;
    if (progressText) progressText.textContent = `${totalReading}/${current.max} ⭐`;
    if (progressFill) {
      const range = Math.max(1, current.max - current.min);
      progressFill.style.width = `${Math.min(100, ((totalReading - current.min) / range) * 100)}%`;
    }
  }

  if (typeof window.showAuthenticatedUserAreas === 'function') {
    window.showAuthenticatedUserAreas();
  }
};
