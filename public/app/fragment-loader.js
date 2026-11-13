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
  const html = await fetchFragment(url);
  const view = document.createElement('div');
  view.className = `tab-view tab-view-${routeName}`;
  view.dataset.view = routeName;
  view.innerHTML = html;
  return view;
}

export async function mountFragment(root, url) {
  const html = await fetchFragment(url);
  root.innerHTML = html;
}

export function preloadFragment(url) {
  return fetchFragment(url).catch(() => null);
}
