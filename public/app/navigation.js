import { groupRoutePath, resolveRoute } from './route-config.js';

const LAST_READING_PATH_KEY = 'rotakip:last-okumalar-path';

function persistentGet(key) {
  try { return localStorage.getItem(key); } catch (_error) { return null; }
}

function persistentSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (_error) {
    return false;
  }
}

function normalizeReadingPath(pathname) {
  if (pathname === '/gruplar') return pathname;
  const route = resolveRoute(pathname);
  return route?.requiresGroup && route.groupId ? groupRoutePath(route.groupId) : null;
}

export function initializeNavigationIcons(nav = document.getElementById('appNavigation')) {
  if (!nav || nav.dataset.iconLayers === 'true') return;
  nav.dataset.iconLayers = 'true';

  nav.querySelectorAll('a[data-route]').forEach(link => {
    const outlineIcon = link.querySelector(':scope > i');
    if (!outlineIcon) return;

    const iconStack = document.createElement('span');
    iconStack.className = 'app-navigation-icon';
    iconStack.setAttribute('aria-hidden', 'true');
    outlineIcon.classList.add('app-navigation-icon-outline');

    const filledIcon = outlineIcon.cloneNode(true);
    filledIcon.classList.remove('fa-regular', 'app-navigation-icon-outline');
    filledIcon.classList.add('fa-solid', 'app-navigation-icon-filled');

    outlineIcon.replaceWith(iconStack);
    iconStack.append(outlineIcon, filledIcon);
  });

  if (!document.fonts || typeof document.fonts.load !== 'function') {
    nav.classList.add('icons-ready');
    return;
  }

  Promise.all([
    document.fonts.load('400 1em "Font Awesome 6 Free"'),
    document.fonts.load('900 1em "Font Awesome 6 Free"')
  ]).then(() => {
    window.requestAnimationFrame(() => nav.classList.add('icons-ready'));
  }).catch(() => {});
}

export function rememberReadingPath(pathname) {
  const normalizedPath = normalizeReadingPath(pathname);
  if (!normalizedPath) return;
  persistentSet(LAST_READING_PATH_KEY, normalizedPath);
}

export function getRememberedReadingPath() {
  return normalizeReadingPath(persistentGet(LAST_READING_PATH_KEY)) || '/gruplar';
}

function setNavigationSelection(nav, selectedRoute) {
  if (nav.dataset.activeRoute === selectedRoute) return;
  nav.querySelectorAll('[data-route]').forEach(link => {
    const active = link.dataset.route === selectedRoute;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  nav.dataset.activeRoute = selectedRoute;
}

export function configureNavigation(route, onNavigate) {
  const nav = document.getElementById('appNavigation');
  if (!nav) return;
  initializeNavigationIcons(nav);
  const okumalarPath = route.groupId
    ? groupRoutePath(route.groupId)
    : getRememberedReadingPath();

  const okumalar = nav.querySelector('[data-route="okumalar"]');
  if (okumalar) {
    okumalar.href = okumalarPath;
    okumalar.dataset.missingGroup = okumalarPath === '/gruplar' ? 'true' : 'false';
  }

  setNavigationSelection(nav, route.navigationName || route.name);

  if (nav.dataset.bound === 'true') return;
  nav.dataset.bound = 'true';
  let tapFeedbackTimer = null;
  nav.addEventListener('click', event => {
    const link = event.target.closest('a[data-route]');
    if (!link) return;
    const links = Array.from(nav.querySelectorAll('a[data-route]'));
    window.clearTimeout(tapFeedbackTimer);
    links.forEach(item => item.classList.remove('is-tap-feedback'));
    void link.offsetWidth;
    link.classList.add('is-tap-feedback');
    tapFeedbackTimer = window.setTimeout(() => link.classList.remove('is-tap-feedback'), 600);
    const url = new URL(link.href, window.location.origin);
    if (url.origin !== window.location.origin) return;
    event.preventDefault();
    if (`${url.pathname}${url.search}${url.hash}` === `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      return;
    }
    setNavigationSelection(nav, link.dataset.route);
    onNavigate(url);
  });
}
