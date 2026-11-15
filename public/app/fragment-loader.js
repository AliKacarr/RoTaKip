const fragmentPromises = new Map();

export async function fetchFragment(url) {
  if (!fragmentPromises.has(url)) {
    fragmentPromises.set(url, fetch(url, {
      headers: { Accept: 'text/html' },
      credentials: 'same-origin'
    }).then(async response => {
      if (!response.ok) throw new Error(`${url} yüklenemedi (${response.status})`);
      return response.text();
    }).catch(error => {
      fragmentPromises.delete(url);
      throw error;
    }));
  }
  return fragmentPromises.get(url);
}

export async function createFragmentView(url, routeName) {
  const urls = Array.isArray(url) ? url : [url];
  const fragments = await Promise.all(urls.map(fetchFragment));
  const view = document.createElement('div');
  view.className = `tab-view tab-view-${routeName}`;
  view.dataset.view = routeName;
  view.innerHTML = fragments.join('\n');
  return view;
}

export async function mountFragment(root, url) {
  const html = await fetchFragment(url);
  root.innerHTML = html;
}

export function preloadFragment(url) {
  const urls = Array.isArray(url) ? url : [url];
  return Promise.all(urls.map(item => fetchFragment(item).catch(() => null)));
}
