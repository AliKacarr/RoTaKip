import { groupRoutePath } from './route-config.js';

const LAST_GROUP_KEY = 'rotakip:last-group-id';

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

export function rememberGroup(groupId) {
  if (groupId) persistentSet(LAST_GROUP_KEY, groupId);
}

export function getRememberedGroup() {
  return persistentGet(LAST_GROUP_KEY);
}

export function configureNavigation(route, onNavigate) {
  const nav = document.getElementById('appNavigation');
  if (!nav) return;
  const groupId = route.groupId || getRememberedGroup();

  const okumalar = nav.querySelector('[data-route="okumalar"]');
  if (okumalar) {
    okumalar.href = groupRoutePath(groupId);
    okumalar.dataset.missingGroup = groupId ? 'false' : 'true';
  }

  nav.querySelectorAll('[data-route]').forEach(link => {
    const active = link.dataset.route === route.name;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  if (nav.dataset.bound === 'true') return;
  nav.dataset.bound = 'true';
  nav.addEventListener('click', event => {
    const link = event.target.closest('a[data-route]');
    if (!link) return;
    if (link.dataset.missingGroup === 'true') {
      event.preventDefault();
      window.location.assign('/gruplar');
      return;
    }
    const url = new URL(link.href, window.location.origin);
    if (url.origin !== window.location.origin) return;
    event.preventDefault();
    if (`${url.pathname}${url.search}${url.hash}` === `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      return;
    }
    onNavigate(url);
  });
}
