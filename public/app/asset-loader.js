const scriptPromises = new Map();
const stylePromises = new Map();
const preloadKeys = new Set();
let manifestPromise = null;

export function loadAssetManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch('/assets-manifest.json', {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin'
    }).then(response => {
      if (!response.ok) throw new Error('Asset manifesti yüklenemedi.');
      return response.json();
    }).catch(error => {
      manifestPromise = null;
      throw error;
    });
  }
  return manifestPromise;
}

export async function resolveAsset(fileName) {
  const manifest = await loadAssetManifest();
  const resolved = manifest[fileName] || fileName;
  return resolved.startsWith('/') ? resolved : `/${resolved}`;
}

export function loadClassicScript(src) {
  if (scriptPromises.has(src)) return scriptPromises.get(src);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = () => resolve(script);
    script.onerror = () => {
      scriptPromises.delete(src);
      reject(new Error(`${src} scripti yüklenemedi.`));
    };
    document.head.appendChild(script);
  });
  scriptPromises.set(src, promise);
  return promise;
}

export async function loadClassicScripts(sources) {
  for (const source of sources) await loadClassicScript(source);
}

export async function loadBundleScripts(fileNames) {
  for (const fileName of fileNames) {
    await loadClassicScript(await resolveAsset(fileName));
  }
}

export function loadStyle(href) {
  if (stylePromises.has(href)) return stylePromises.get(href);
  const promise = new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve(link);
    link.onerror = () => {
      stylePromises.delete(href);
      reject(new Error(`${href} stili yüklenemedi.`));
    };
    document.head.appendChild(link);
  });
  stylePromises.set(href, promise);
  return promise;
}

export async function loadBundleStyles(fileNames) {
  await Promise.all(fileNames.map(async fileName => loadStyle(await resolveAsset(fileName))));
}

export function preloadScript(src) {
  const key = `script:${src}`;
  if (scriptPromises.has(src) || preloadKeys.has(key)) return;
  preloadKeys.add(key);
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'script';
  link.href = src;
  document.head.appendChild(link);
}

export async function preloadBundle(fileName, asType = 'script') {
  const href = await resolveAsset(fileName);
  if (asType === 'script' && scriptPromises.has(href)) return;
  if (asType === 'style' && stylePromises.has(href)) return;
  const key = `${asType}:${href}`;
  if (preloadKeys.has(key)) return;
  preloadKeys.add(key);
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = asType;
  link.href = href;
  document.head.appendChild(link);
}
