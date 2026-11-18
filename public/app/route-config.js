export const ROUTES = Object.freeze({
  groups: {
    name: 'groups',
    navigationName: 'okumalar',
    path: '/gruplar',
    fragment: '/fragments/gruplar.html',
    title: 'Okuma Grupları',
    requiresGroup: false
  },
  okumalar: {
    name: 'okumalar',
    fragment: ['/fragments/group-header.html', '/fragments/okumalar.html'],
    title: 'Okumalar',
    requiresGroup: true
  },
  tesbihat: {
    name: 'tesbihat',
    path: '/tesbihat',
    fragment: '/fragments/tesbihat.html',
    title: 'Tesbihat',
    requiresGroup: false
  },
  videos: {
    name: 'videos',
    path: '/videolar',
    fragment: '/fragments/videos.html',
    title: 'Videolar',
    requiresGroup: false
  },
  tefekkur: {
    name: 'tefekkur',
    path: '/tefekkur',
    fragment: '/fragments/tefekkur.html',
    title: 'Tefekkür',
    requiresGroup: false
  },
  articles: {
    name: 'articles',
    path: '/makaleler',
    fragment: '/fragments/articles.html',
    title: 'Makaleler',
    requiresGroup: false
  }
});

export const ROUTE_ASSETS = Object.freeze({
  groups: {
    scripts: ['groups-directory.min.js'],
    styles: ['groups-directory.min.css']
  },
  okumalar: {
    scripts: ['okumalar.min.js'],
    styles: ['okumalar.min.css']
  },
  tesbihat: { scripts: [], styles: [] },
  videos: { scripts: ['videos.min.js'], styles: ['videos.min.css'] },
  tefekkur: { scripts: ['tefekkur.min.js'], styles: ['tefekkur.min.css'] },
  articles: { scripts: ['articles.min.js'], styles: ['articles.min.css'] }
});

const GROUP_ROUTE_PATTERN = /^\/grup\/([^/]+)\/?$/i;

export function decodeGroupId(value) {
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    return value;
  }
}

export function resolveRoute(pathname) {
  const path = String(pathname || '/');
  const groupMatch = path.match(GROUP_ROUTE_PATTERN);
  if (groupMatch) {
    return { ...ROUTES.okumalar, groupId: decodeGroupId(groupMatch[1]) };
  }

  const globalRoute = Object.values(ROUTES).find(route => route.path === path.replace(/\/$/, '') || route.path === path);
  return globalRoute ? { ...globalRoute, groupId: null } : null;
}

export function groupRoutePath(groupId) {
  if (!groupId) return '/gruplar';
  return `/grup/${encodeURIComponent(groupId)}/`;
}

export function canonicalPath(route) {
  if (!route) return '/';
  return route.requiresGroup ? groupRoutePath(route.groupId) : route.path;
}
