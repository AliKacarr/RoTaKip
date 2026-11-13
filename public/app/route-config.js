export const ROUTES = Object.freeze({
  weekly: {
    name: 'weekly',
    fragment: '/fragments/weekly.html',
    title: 'Ana Sayfa',
    requiresGroup: true
  },
  statistics: {
    name: 'statistics',
    fragment: '/fragments/statistics.html',
    title: 'Analizler',
    requiresGroup: true
  },
  videos: {
    name: 'videos',
    path: '/videolar',
    fragment: '/fragments/videos.html',
    title: 'Videolar',
    requiresGroup: false
  },
  mercy: {
    name: 'mercy',
    path: '/rahmet-penceresi',
    fragment: '/fragments/mercy.html',
    title: 'Rahmet Penceresi',
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

const GROUP_ROUTE_PATTERN = /^\/grup\/([^/]+)\/(haftalik|istatistikler)\/?$/i;

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
    const routeName = groupMatch[2].toLowerCase() === 'istatistikler' ? 'statistics' : 'weekly';
    return { ...ROUTES[routeName], groupId: decodeGroupId(groupMatch[1]) };
  }

  const globalRoute = Object.values(ROUTES).find(route => route.path === path.replace(/\/$/, '') || route.path === path);
  return globalRoute ? { ...globalRoute, groupId: null } : null;
}

export function groupRoutePath(groupId, routeName = 'weekly') {
  if (!groupId) return '/';
  const section = routeName === 'statistics' ? 'istatistikler' : 'haftalik';
  return `/grup/${encodeURIComponent(groupId)}/${section}`;
}

export function canonicalPath(route) {
  if (!route) return '/';
  return route.requiresGroup ? groupRoutePath(route.groupId, route.name) : route.path;
}
