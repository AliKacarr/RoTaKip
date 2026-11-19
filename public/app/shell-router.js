import { ROUTES, ROUTE_ASSETS, canonicalPath, resolveRoute } from './route-config.js';
import { createFragmentView, mountFragment, preloadFragment } from './fragment-loader.js';
import { loadAssetManifest, loadBundleScripts, loadBundleStyles, preloadBundle } from './asset-loader.js';
import { invalidateGroupContext, loadGroupData, resolveGroupContext } from './group-context.js';
import {
  configureNavigation,
  getRememberedReadingPath,
  rememberReadingPath
} from './navigation.js';
import {
  initializeScrollManager,
  resetRouteScroll,
  setScrollToTopEnabled
} from './scroll-manager.js';

const COMMON_SCRIPTS = ['shell.min.js'];
const GROUP_COMMON_SCRIPTS = ['group-common.min.js'];
const GROUP_UI_SCRIPTS = ['group-ui.min.js'];
const ROUTE_TRANSITION_MIN_VISIBLE_MS = 1000;
const OKUMALAR_BACKGROUND_ASSETS = {
  statistics: {
    scripts: ['statistics.min.js'],
    styles: ['statistics.min.css']
  },
  management: {
    scripts: ['management.min.js'],
    styles: ['management.min.css']
  },
  groupUi: {
    scripts: GROUP_UI_SCRIPTS,
    styles: []
  }
};

const tabContent = document.getElementById('tabContent');
const footerRoot = document.getElementById('footerRoot');
const globalOverlayRoot = document.getElementById('globalOverlayRoot');
const overlayRoot = document.getElementById('overlayRoot');
const initialTabLoader = document.getElementById('initialTabLoader');
const backgroundViewRoot = document.createElement('div');
backgroundViewRoot.hidden = true;
backgroundViewRoot.setAttribute('aria-hidden', 'true');
document.body.appendChild(backgroundViewRoot);
const viewCache = new Map();
const lifecycleCache = new WeakMap();
const warmedViews = new WeakSet();
const globalWarmups = new Map();
const groupWarmups = new Map();
const okumalarStyleLinks = new Set();
let activeView = null;
let activeLifecycle = null;
let mountedGroupId = null;
let navigationSequence = 0;
let routeTransitionLoader = null;
let okumalarStylesEnabled = false;

window.invalidateRoTaKipGroupCache = function invalidateRoTaKipGroupCache(groupId) {
  if (!groupId) return;
  invalidateGroupContext(groupId);
  groupWarmups.clear();
};

function setOkumalarStylesEnabled(enabled) {
  okumalarStylesEnabled = enabled === true;
  okumalarStyleLinks.forEach(link => {
    link.disabled = !okumalarStylesEnabled;
  });
}

async function loadOkumalarStyles(fileNames) {
  const links = await loadBundleStyles(fileNames);
  links.forEach(link => {
    okumalarStyleLinks.add(link);
    link.disabled = !okumalarStylesEnabled;
  });
  return links;
}

function waitForStyleApplication(styleLinks) {
  const hasEnabledStyle = styleLinks.some(link => link?.isConnected && !link.disabled);
  if (!hasEnabledStyle) return Promise.resolve();
  return new Promise(resolve => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
  });
}

function showStatus() {}

function routeUsesFullScreenLoader() {
  return false;
}

function hideStatus() {
  return Promise.resolve();
}

function hasInitialTabLoader() {
  return Boolean(initialTabLoader?.isConnected);
}

function isInviteOnboardingRoute(route, url) {
  return route?.name === 'okumalar'
    && url.searchParams.has('quick-login')
    && Boolean(url.searchParams.get('invite'));
}

function keepInitialTabLoaderVisible() {
  if (!hasInitialTabLoader()) return;
  initialTabLoader.classList.remove('is-leaving');
  document.body.classList.add('initial-tab-loading');
  tabContent.classList.add('is-initial-loading');
}

function hideInitialTabLoader(expectedSequence = null) {
  if (expectedSequence !== null && expectedSequence !== navigationSequence) {
    return Promise.resolve(false);
  }
  if (!hasInitialTabLoader()) {
    document.body.classList.remove('initial-tab-loading');
    tabContent.classList.remove('is-initial-loading');
    return Promise.resolve(true);
  }
  initialTabLoader.classList.add('is-leaving');
  return new Promise(resolve => {
    window.setTimeout(() => {
      if (expectedSequence !== null && expectedSequence !== navigationSequence) {
        keepInitialTabLoaderVisible();
        resolve(false);
        return;
      }
      initialTabLoader.remove();
      document.body.classList.remove('initial-tab-loading');
      tabContent.classList.remove('is-initial-loading');
      resolve(true);
    }, 240);
  });
}

function removeRouteTransitionLoader(loader = routeTransitionLoader) {
  if (!loader) return;
  loader.remove();
  if (routeTransitionLoader === loader) routeTransitionLoader = null;
  if (!routeTransitionLoader) {
    document.body.classList.remove('initial-tab-loading');
    tabContent.classList.remove('is-initial-loading');
  }
}

function showRouteTransitionLoader(label, options = {}) {
  removeRouteTransitionLoader();
  const loader = document.createElement('div');
  loader.className = 'initial-tab-loader route-transition-loader';
  loader.setAttribute('role', 'status');
  loader.setAttribute('aria-label', label);
  loader.dataset.shownAt = String(window.performance.now());
  loader.dataset.minimumVisibleMs = String(
    Math.max(0, Number(options.minimumVisibleMs ?? ROUTE_TRANSITION_MIN_VISIBLE_MS) || 0)
  );
  loader.innerHTML = `
    <div class="route-loader" aria-hidden="true">
      <div class="route-loader-star">⭐</div>
      <div class="route-loader-lines">
        <div class="route-loader-line"><span>Ro</span></div>
        <div class="route-loader-line"><span>Ta</span></div>
        <div class="route-loader-line"><span>Kip</span></div>
      </div>
    </div>`;
  document.body.classList.add('initial-tab-loading');
  tabContent.classList.add('is-initial-loading');
  footerRoot.hidden = true;
  tabContent.appendChild(loader);
  routeTransitionLoader = loader;
  return loader;
}

function hideRouteTransitionLoader(loader) {
  if (!loader?.isConnected) {
    removeRouteTransitionLoader(loader);
    return Promise.resolve();
  }
  return new Promise(resolve => {
    const shownAt = Number(loader.dataset.shownAt) || window.performance.now();
    const minimumVisibleMs = Number(loader.dataset.minimumVisibleMs) || 0;
    const elapsed = window.performance.now() - shownAt;
    const waitBeforeFade = Math.max(0, minimumVisibleMs - elapsed);
    window.setTimeout(() => {
      if (!loader.isConnected) {
        removeRouteTransitionLoader(loader);
        resolve();
        return;
      }
      loader.classList.add('is-leaving');
      window.setTimeout(() => {
        removeRouteTransitionLoader(loader);
        resolve();
      }, 240);
    }, waitBeforeFade);
  });
}

async function revealRouteAfterLoader(view, options = {}) {
  if (options.sequence !== undefined && options.sequence !== navigationSequence) return false;
  if (options.useInitialTabLoader) await hideInitialTabLoader(options.sequence);
  else if (options.transitionLoader) await hideRouteTransitionLoader(options.transitionLoader);
  if (options.sequence !== undefined && options.sequence !== navigationSequence) return false;
  await revealRouteContent(view);
  return true;
}

function renderError(error) {
  tabContent.innerHTML = `<section class="route-error"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i><h1>İçerik açılamadı</h1><p>${window.escapeHtml(error.message || 'Beklenmeyen bir hata oluştu.')}</p><a href="/gruplar">Gruplara dön</a></section>`;
  footerRoot.hidden = false;
}

async function ensureShellFragments() {
  await Promise.all([
    mountFragment(footerRoot, '/fragments/footer.html'),
    mountFragment(globalOverlayRoot, '/fragments/global-overlays.html')
  ]);
  initializeScrollManager();
}

function getViewCacheKey(route) {
  if (route.name === 'okumalar') return 'okumalar';
  return route.requiresGroup ? `${route.name}:${route.groupId}` : route.name;
}

function hasReadyCachedView(route) {
  const view = viewCache.get(getViewCacheKey(route));
  return Boolean(view && lifecycleCache.has(view));
}

async function getView(route) {
  const cacheKey = getViewCacheKey(route);
  if (!viewCache.has(cacheKey)) {
    const viewPromise = createFragmentView(route.fragment, route.name);
    viewCache.set(cacheKey, viewPromise);
  }
  const cachedView = viewCache.get(cacheKey);
  try {
    const view = await cachedView;
    if (viewCache.get(cacheKey) === cachedView) viewCache.set(cacheKey, view);
    return view;
  } catch (error) {
    if (viewCache.get(cacheKey) === cachedView) viewCache.delete(cacheKey);
    throw error;
  }
}

async function activateView(route, preparedView = null) {
  const view = preparedView || await getView(route);
  if (activeView && activeView !== view) activeView.remove();
  const isReturningToOkumalar = route.name === 'okumalar' && lifecycleCache.has(view);
  const isPreparingGroupsFirstLoad = route.name === 'groups' && !lifecycleCache.has(view);
  view.classList.toggle('is-resuming', isReturningToOkumalar);
  view.classList.toggle('is-preparing-return', isPreparingGroupsFirstLoad);
  view.classList.remove('visible');
  if (view.parentNode !== tabContent) tabContent.appendChild(view);
  activeView = view;
}

async function activatePrivateGroupView(options = {}) {
  const view = await createFragmentView('/fragments/group-header.html', 'okumalar');
  view.dataset.privateGroupAccess = 'true';
  if (activeView && activeView !== view) activeView.remove();
  if (hasInitialTabLoader()) tabContent.appendChild(view);
  else tabContent.replaceChildren(view);
  activeView = view;
  if (options.reveal !== false) await revealRouteContent(view, true);
}

function updateMetadata(route, groupContext) {
  const groupSuffix = groupContext && groupContext.group ? ` · ${groupContext.group.groupName}` : '';
  document.title = groupSuffix ? `RoTaKip${groupSuffix}` : `RoTaKip · ${route.title}`;
  const canonical = document.getElementById('canonicalLink');
  if (canonical) canonical.href = `${window.location.origin}${canonicalPath(route)}`;
}

async function ensureGroupCommon(route, context, data) {
  const groupChanged = Boolean(mountedGroupId && mountedGroupId !== route.groupId);
  if (!mountedGroupId || groupChanged) {
    await mountFragment(overlayRoot, '/fragments/common-overlays.html');
  }
  overlayRoot.hidden = false;
  await loadOkumalarStyles(['group-common.min.css']);
  await loadBundleScripts(GROUP_COMMON_SCRIPTS);
  if (groupChanged) window.resetRoTaKipGroupBootstrap?.(route.groupId);
  mountedGroupId = route.groupId;
  window.__rotakipResolvedGroupContext = context;
  window.initialAllData = data || null;
  window.applyResolvedGroupContext?.(context);
  if (data && window.globalDataStore?.groupId === route.groupId
    && typeof window.globalDataStore.replaceData === 'function') {
    window.globalDataStore.replaceData(route.groupId, data);
  }
  return true;
}

function resetOkumalarViewForGroup(nextGroupId) {
  if (!mountedGroupId || mountedGroupId === nextGroupId) return;

  window.resetTrackerTimelineForGroup?.();
  const okumalarView = viewCache.get('okumalar');
  if (okumalarView && !(okumalarView instanceof Promise)) {
    lifecycleCache.delete(okumalarView);
    warmedViews.delete(okumalarView);
  }
  groupWarmups.clear();
}

function portalOkumalarOverlays() {
  ['dailyGiftModal', 'dailyTasksModal'].forEach(id => {
    const modal = document.getElementById(id);
    if (modal && modal.parentElement !== overlayRoot) overlayRoot.appendChild(modal);
  });
}

function revealLeagueInfoBar(options = {}) {
  const leagueInfoBar = document.querySelector('.league-info-bar');
  if (!leagueInfoBar) return;

  const shouldAnimate = !leagueInfoBar.classList.contains('visible');
  const section = leagueInfoBar.closest('.league-info-section');
  if (section) section.style.display = 'block';
  leagueInfoBar.style.display = 'flex';
  if (shouldAnimate && options.animate !== false) {
    leagueInfoBar.classList.add('reading-content-reveal');
  }
  leagueInfoBar.classList.add('visible');
  return leagueInfoBar;
}

function stageReadingPrimaryContent(isAuthenticated) {
  document.querySelector('.tracker-table-shell')
    ?.classList.add('is-primary-reveal-pending');
  const messagePanels = document.querySelector('.reading-message-panels');
  if (messagePanels) messagePanels.hidden = true;
  const authenticatedLayoutElements = [
    document.getElementById('authenticatedUserAreas'),
    document.getElementById('readingEditModeBar')
  ].filter(Boolean);
  authenticatedLayoutElements.forEach(element => {
    element.classList.toggle('is-initial-reveal-pending', isAuthenticated);
  });
}

async function prepareReadingPrimaryContent() {
  const tasks = [
    ['okuma mesajları', () => window.renderReadingMessagePanels?.()],
    ['okuma yolculuğu', () => window.initializeReadingJourney?.({ reveal: false })]
  ];
  await Promise.allSettled(tasks.map(([label, task]) => Promise.resolve()
    .then(task)
    .catch(error => console.warn(`${label} hazırlanamadı:`, error))));
}

function revealReadingAuthControls(isAuthenticated) {
  if (typeof window.syncAuthenticatedUserAreas === 'function') {
    window.syncAuthenticatedUserAreas(isAuthenticated, { immediate: true });
  }
  if (isAuthenticated) window.showReadingEditModeBar?.();
  else window.hideReadingEditModeBar?.();

  const stagedElements = [
    document.getElementById('authenticatedUserAreas'),
    document.getElementById('readingEditModeBar')
  ].filter(element => element?.classList.contains('is-initial-reveal-pending'));
  stagedElements.forEach(element => element.getBoundingClientRect());
  stagedElements.forEach(element => element.classList.remove('is-initial-reveal-pending'));
}

function revealReadingPrimaryContent(isAuthenticated) {
  const trackerShell = document.querySelector('.tracker-table-shell');
  const messagePanels = document.querySelector('.reading-message-panels');

  const leagueInfoBar = revealLeagueInfoBar({ animate: false });
  const revealTargets = [leagueInfoBar, trackerShell].filter(Boolean);
  revealTargets.forEach(element => element.classList.remove('reading-content-reveal'));
  trackerShell?.classList.remove('is-primary-reveal-pending');
  if (messagePanels) {
    messagePanels.hidden = false;
    messagePanels.classList.remove('reading-content-reveal');
  }
  if (hasInitialTabLoader()) {
    revealReadingAuthControls(isAuthenticated);
    return;
  }
  window.requestAnimationFrame(() => {
    revealTargets.forEach(element => element.classList.add('reading-content-reveal'));
    revealReadingAuthControls(isAuthenticated);
  });
}

async function initializeGroupUi() {
  await loadBundleScripts(GROUP_UI_SCRIPTS);
  if (typeof window.initializeAdminModal === 'function') window.initializeAdminModal();
}

function runOkumalarBackgroundWork() {
  const run = async () => {
    const loadAssetGroup = (label, assets) => Promise.allSettled([
      loadOkumalarStyles(assets.styles),
      ...assets.scripts.map(fileName => loadBundleScripts([fileName]))
    ]).then(results => {
      results.forEach(result => {
        if (result.status === 'rejected') {
          console.warn(`${label} arka plan paketi yüklenemedi:`, result.reason);
        }
      });
    });
    const statisticsReady = loadAssetGroup('İstatistikler', OKUMALAR_BACKGROUND_ASSETS.statistics);
    const managementReady = loadAssetGroup('Grup yönetimi', OKUMALAR_BACKGROUND_ASSETS.management);
    const groupUiReady = loadAssetGroup('Grup kullanıcı arayüzü', OKUMALAR_BACKGROUND_ASSETS.groupUi);

    const ensureLongestStreaks = () => {
      const store = window.globalDataStore;
      return store && typeof store.ensureLongestStreaks === 'function'
        ? store.ensureLongestStreaks()
        : Promise.resolve();
    };
    const tasks = [
      ['grup kullanıcı arayüzü', async () => {
        await groupUiReady;
        if (typeof window.initializeAdminModal === 'function') window.initializeAdminModal();
      }],
      ['grup yönetimi', async () => {
        await managementReady;
        if (typeof window.initializeGroupManagement === 'function') {
          return window.initializeGroupManagement();
        }
      }],
      ['liderlik panosu', async () => {
        await statisticsReady;
        await ensureLongestStreaks();
        if (typeof window.loadUserCards === 'function') return window.loadUserCards();
      }],
      ['aylık takvim', async () => {
        await statisticsReady;
        if (typeof window.loadMonthlyCalendar === 'function') return window.loadMonthlyCalendar();
      }],
      ['en uzun seri', async () => {
        await statisticsReady;
        await ensureLongestStreaks();
        if (typeof window.renderLongestSeries === 'function') return window.renderLongestSeries();
      }],
      ['okuma istatistikleri', async () => {
        await statisticsReady;
        if (typeof window.loadReadingStats === 'function') return window.loadReadingStats();
      }]
    ];
    return Promise.allSettled(tasks.map(([label, task]) => {
      if (typeof task !== 'function') return Promise.resolve();
      return Promise.resolve()
        .then(() => task())
        .catch(error => console.warn(`${label} arka planda hazırlanamadı:`, error));
    })).finally(() => {
      if (typeof window.scheduleOneSignalLoad === 'function') window.scheduleOneSignalLoad();
    });
  };

  return new Promise(resolve => {
    const start = () => window.setTimeout(() => resolve(run()), 0);
    if (document.visibilityState === 'visible') window.requestAnimationFrame(start);
    else start();
  });
}

async function initOkumalarTab(options = {}) {
  if (options.inviteOnboarding === true) {
    await initializeGroupUi();
    await window.initializeGroupPage();
    return {
      prepareBeforeReveal: false,
      readyForPrefetch: Promise.resolve(),
      destroy() {}
    };
  }

  await loadOkumalarStyles(ROUTE_ASSETS.okumalar.styles);
  await loadBundleScripts(ROUTE_ASSETS.okumalar.scripts);
  portalOkumalarOverlays();
  await window.initializeGroupPage();
  const context = window.__rotakipResolvedGroupContext;
  const isAuthenticated = context?.isAuthenticated === true;
  if (typeof window.syncAuthenticatedUserAreas === 'function') {
    if (!isAuthenticated) window.syncAuthenticatedUserAreas(false);
  }
  stageReadingPrimaryContent(isAuthenticated);
  if (typeof window.initializeTrackerTableInteractions === 'function') window.initializeTrackerTableInteractions();
  if (typeof window.initializeDailyGift === 'function') window.initializeDailyGift();
  if (typeof window.setupShareModal === 'function') {
    window.setupShareModal('monthShareModal', 'closeMonthShareModal');
    window.setupShareModal('longestSeriesShareModal', 'closeLongestSeriesShareModal');
    window.setupShareModal('readingStatsShareModal', 'closeReadingStatsShareModal');
  }
  const trackerReady = typeof window.loadTrackerTable === 'function'
    ? window.loadTrackerTable()
    : Promise.resolve();
  await Promise.all([trackerReady, prepareReadingPrimaryContent()]);
  revealReadingPrimaryContent(isAuthenticated);
  const readyForPrefetch = runOkumalarBackgroundWork();
  return {
    prepareBeforeReveal: true,
    readyForPrefetch,
    async resume() {
      const context = window.__rotakipResolvedGroupContext;
      revealReadingAuthControls(context?.isAuthenticated === true);
      const trackerRefresh = (async () => {
        if (typeof window.loadTrackerTable === 'function') await window.loadTrackerTable();
        if (typeof window.refreshTrackerTableLayout === 'function') {
          await window.refreshTrackerTableLayout();
        }
      })();
      await Promise.all([trackerRefresh, prepareReadingPrimaryContent()]);
      this.readyForPrefetch = runOkumalarBackgroundWork();
    }
  };
}

async function initGlobalTab(route) {
  const assets = ROUTE_ASSETS[route.name];
  const styleLinks = await loadBundleStyles(assets.styles);
  await loadBundleScripts(assets.scripts);
  const lifecycle = {
    groups: window.RoTaKipGroupsTab,
    videos: window.RoTaKipVideoTab,
    tefekkur: window.RoTaKipTefekkurTab,
    articles: window.RoTaKipArticlesTab
  }[route.name];
  if (lifecycle && typeof lifecycle.init === 'function') await lifecycle.init();
  if (route.name === 'groups') {
    let detachObserver = null;
    const disableStyles = () => styleLinks.forEach(link => { link.disabled = true; });
    return {
      prepareBeforeReveal: false,
      destroy() {
        lifecycle?.destroy?.();
        const view = document.querySelector('.tab-view-groups');
        detachObserver?.disconnect();
        if (!view?.isConnected) {
          disableStyles();
          return;
        }
        detachObserver = new MutationObserver(() => {
          if (view.isConnected) return;
          detachObserver.disconnect();
          detachObserver = null;
          disableStyles();
        });
        detachObserver.observe(document.body, { childList: true, subtree: true });
      },
      async resume() {
        detachObserver?.disconnect();
        detachObserver = null;
        styleLinks.forEach(link => { link.disabled = false; });
        await lifecycle?.resume?.();
      }
    };
  }
  if (lifecycle && typeof lifecycle.resume !== 'function') {
    lifecycle.resume = () => lifecycle.init && lifecycle.init();
  }
  return lifecycle || { destroy() {} };
}

function warmGlobalTab(route) {
  if (route.requiresGroup || route.name === 'groups') return Promise.resolve(null);
  const cachedView = viewCache.get(getViewCacheKey(route));
  if (cachedView && !(cachedView instanceof Promise) && lifecycleCache.has(cachedView)) {
    return Promise.resolve(lifecycleCache.get(cachedView));
  }
  if (globalWarmups.has(route.name)) return globalWarmups.get(route.name);

  const warmup = (async () => {
    await loadBundleStyles(ROUTE_ASSETS[route.name].styles);
    const view = await getView(route);
    if (view !== activeView && view.parentNode !== backgroundViewRoot) {
      backgroundViewRoot.appendChild(view);
    }
    const lifecycle = await initGlobalTab(route);
    lifecycleCache.set(view, lifecycle);
    warmedViews.add(view);
    return lifecycle;
  })().catch(error => {
    globalWarmups.delete(route.name);
    throw error;
  });

  globalWarmups.set(route.name, warmup);
  return warmup;
}

function preloadOkumalarAssets() {
  const groups = [
    { scripts: GROUP_COMMON_SCRIPTS, styles: ['group-common.min.css'] },
    ROUTE_ASSETS.okumalar,
    ...Object.values(OKUMALAR_BACKGROUND_ASSETS)
  ];
  const scripts = new Set(groups.flatMap(group => group.scripts || []));
  const styles = new Set(groups.flatMap(group => group.styles || []));
  return Promise.all([
    ...Array.from(scripts, fileName => preloadBundle(fileName, 'script')),
    ...Array.from(styles, fileName => preloadBundle(fileName, 'style'))
  ]);
}

function prepareGroupTab(route) {
  if (!route.requiresGroup || !route.groupId) return Promise.resolve(null);
  const cacheKey = getViewCacheKey(route);
  if (groupWarmups.has(cacheKey)) return groupWarmups.get(cacheKey);

  const warmup = Promise.all([
    resolveGroupContext(route.groupId),
    getView(route),
    preloadOkumalarAssets()
  ]).then(async ([context, view]) => {
    const data = context.canRead ? await loadGroupData(context) : null;
    return { context, data, view };
  }).catch(error => {
    groupWarmups.delete(cacheKey);
    throw error;
  });

  groupWarmups.set(cacheKey, warmup);
  return warmup;
}

function markPrimaryReady() {
  window.rotakipPrimaryContentReady = true;
  window.dispatchEvent(new Event('rotakip:primary-content-ready'));
}

function revealRouteContent(view, waitForPaint = false) {
  if (!view) return Promise.resolve();
  return new Promise(resolve => {
    window.requestAnimationFrame(() => {
      view.classList.add('visible');
      footerRoot.hidden = false;
      if (waitForPaint) window.requestAnimationFrame(resolve);
      else resolve();
    });
  });
}

window.waitForRoutePlaceholder = async function waitForRoutePlaceholder() {};

function connectionAllowsPrefetch() {
  const connection = navigator.connection;
  if (!connection) return true;
  return !connection.saveData && !['slow-2g', '2g'].includes(connection.effectiveType);
}

function schedulePrefetch(route) {
  if (!connectionAllowsPrefetch()) return;
  const order = Object.keys(ROUTES).filter(name => name !== route.name);
  const run = () => order.filter(name => name !== route.name).forEach(name => {
    const target = ROUTES[name];
    preloadFragment(target.fragment);
    const assets = ROUTE_ASSETS[name];
    if (!assets) return;
    assets.scripts.forEach(fileName => preloadBundle(fileName, 'script'));
    assets.styles.forEach(fileName => preloadBundle(fileName, 'style'));
    if (target.requiresGroup) {
      const rememberedRoute = resolveRoute(getRememberedReadingPath());
      if (!rememberedRoute?.groupId) return;
      prepareGroupTab(rememberedRoute).catch(error => {
        console.warn(`${target.title} arka planda hazırlanamadı:`, error);
      });
      return;
    }
    if (target.name === 'groups') return;
    warmGlobalTab(target).catch(error => {
      console.warn(`${target.title} arka planda hazırlanamadı:`, error);
    });
  });
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 3500 });
  else window.setTimeout(run, 1200);
}

async function navigate(url, options = {}) {
  const sequence = ++navigationSequence;
  keepInitialTabLoaderVisible();
  removeRouteTransitionLoader();
  const isInitialNavigation = activeView === null;
  const route = resolveRoute(url.pathname);
  if (!route) {
    window.location.assign(url.href);
    return;
  }
  const isInviteOnboarding = isInviteOnboardingRoute(route, url);
  window.syncRoTaKipViewport?.(url.pathname);
  const leavesMountedGroup = Boolean(mountedGroupId)
    && (!route.requiresGroup || route.groupId !== mountedGroupId);
  if (leavesMountedGroup) window.invalidateRoTaKipGroupCache(mountedGroupId);
  if (route.requiresGroup) resetOkumalarViewForGroup(route.groupId);
  setScrollToTopEnabled(route.requiresGroup);
  if (!options.fromPopState) history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
  if (route.name === 'groups') rememberReadingPath(canonicalPath(route));
  const targetWasReady = hasReadyCachedView(route);
  const useFullScreenLoader = routeUsesFullScreenLoader(route)
    && !targetWasReady;
  const useInitialTabLoader = hasInitialTabLoader();
  const useOkumalarTransitionLoader = !useInitialTabLoader
    && !isInitialNavigation
    && route.name === 'okumalar';
  const useGroupsTransitionLoader = !useInitialTabLoader
    && !isInitialNavigation
    && route.name === 'groups';
  const revealAfterLifecycle = useFullScreenLoader
    || useInitialTabLoader
    || useOkumalarTransitionLoader
    || useGroupsTransitionLoader;
  const transitionLoader = useOkumalarTransitionLoader || useGroupsTransitionLoader
    ? showRouteTransitionLoader(
      useGroupsTransitionLoader ? 'Gruplar hazırlanıyor' : 'Okumalar hazırlanıyor',
      { minimumVisibleMs: targetWasReady ? 0 : ROUTE_TRANSITION_MIN_VISIBLE_MS }
    )
    : null;
  if (useFullScreenLoader) showStatus();
  else await hideStatus();
  if (activeLifecycle && typeof activeLifecycle.destroy === 'function') activeLifecycle.destroy();
  activeLifecycle = null;
  if (route.requiresGroup) setOkumalarStylesEnabled(true);
  configureNavigation(route, target => navigate(target));
  resetRouteScroll();

  try {
    if (!route.requiresGroup && !isInitialNavigation && !hasReadyCachedView(route)) {
      await warmGlobalTab(route);
      if (sequence !== navigationSequence) return;
    }
    let groupContext = null;
    let groupViewPrepared = false;
    if (route.requiresGroup) {
      const criticalScripts = isInviteOnboarding
        ? GROUP_COMMON_SCRIPTS
        : [...GROUP_COMMON_SCRIPTS, ...ROUTE_ASSETS[route.name].scripts];
      const criticalStyles = isInviteOnboarding
        ? ['group-common.min.css']
        : ['group-common.min.css', ...ROUTE_ASSETS[route.name].styles];
      const viewPromise = isInviteOnboarding
        ? createFragmentView('/fragments/group-header.html', route.name)
        : getView(route);
      const [resolvedContext, criticalStyleLinks, preparedView] = await Promise.all([
        resolveGroupContext(route.groupId),
        loadOkumalarStyles(criticalStyles),
        viewPromise,
        Promise.all(criticalScripts.map(fileName => preloadBundle(fileName, 'script')))
      ]);
      if (sequence !== navigationSequence) return;
      await waitForStyleApplication(criticalStyleLinks);
      if (sequence !== navigationSequence) return;
      groupContext = resolvedContext;
      updateMetadata(route, groupContext);

      await activateView(route, preparedView);
      if (sequence !== navigationSequence) return;
      const deferOkumalarResumeReveal = route.name === 'okumalar'
        && lifecycleCache.has(activeView)
        && !warmedViews.has(activeView);
      if (!deferOkumalarResumeReveal && !revealAfterLifecycle) {
        await revealRouteContent(activeView, true);
      }
      groupViewPrepared = true;

      if (!groupContext.canRead) {
        await ensureGroupCommon(route, groupContext, null);
        await activatePrivateGroupView({ reveal: !revealAfterLifecycle });
        await initializeGroupUi();
        await window.initializeGroupPage();
        await hideStatus();
        if (revealAfterLifecycle) {
          await revealRouteAfterLoader(activeView, { useInitialTabLoader, transitionLoader, sequence });
        }
        return;
      }

      rememberReadingPath(canonicalPath(route));

      const data = isInviteOnboarding ? null : await loadGroupData(groupContext);
      if (sequence !== navigationSequence) return;
      await ensureGroupCommon(route, groupContext, data);
    } else {
      overlayRoot.hidden = true;
      updateMetadata(route, null);
    }

    if (!groupViewPrepared) {
      const routeStyleLinks = await loadBundleStyles(ROUTE_ASSETS[route.name].styles);
      if (route.name === 'groups') {
        routeStyleLinks.forEach(link => { link.disabled = false; });
      }
      if (sequence !== navigationSequence) return;
      await activateView(route);
      if (sequence !== navigationSequence) return;
      setOkumalarStylesEnabled(false);
    }
    const hasCachedLifecycle = lifecycleCache.has(activeView);
    if (hasCachedLifecycle) activeLifecycle = lifecycleCache.get(activeView);
    const isFirstWarmActivation = warmedViews.delete(activeView);
    const resumeBeforeReveal = hasCachedLifecycle
      && !isFirstWarmActivation
      && activeLifecycle?.prepareBeforeReveal === true
      && typeof activeLifecycle.resume === 'function';
    if (resumeBeforeReveal) {
      activeView.classList.add('is-preparing-return');
      activeView
        .querySelector('.tracker-table-layout')
        ?.classList.add('is-restoring-position');
      await activeLifecycle.resume();
      if (sequence !== navigationSequence) {
        activeView.querySelector('.tracker-table-layout')?.classList.remove('is-restoring-position');
        activeView.classList.remove('is-preparing-return');
        return;
      }
    }
    if (!revealAfterLifecycle && !activeView.classList.contains('visible')) {
      await revealRouteContent(activeView, !resumeBeforeReveal);
    }

    if (resumeBeforeReveal) {
      const trackerLayout = activeView.querySelector('.tracker-table-layout');
      trackerLayout?.classList.remove('is-restoring-position');
      activeView.classList.remove('is-preparing-return');
      if (sequence !== navigationSequence) return;
    }

    if (hasCachedLifecycle) {
      if (!isFirstWarmActivation && !resumeBeforeReveal && activeLifecycle && typeof activeLifecycle.resume === 'function') {
        await activeLifecycle.resume();
      }
    } else {
      activeLifecycle = route.name === 'okumalar'
        ? await initOkumalarTab({ inviteOnboarding: isInviteOnboarding })
        : await initGlobalTab(route);
      lifecycleCache.set(activeView, activeLifecycle);
    }
    if (route.name === 'groups') activeView.classList.remove('is-preparing-return');
    await hideStatus();
    if (sequence !== navigationSequence) return;
    if (revealAfterLifecycle) {
      await revealRouteAfterLoader(activeView, { useInitialTabLoader, transitionLoader, sequence });
    }
    window.revealPendingReadingMessagePanels?.(activeView);
    tabContent.focus({ preventScroll: true });
    markPrimaryReady();
    if (activeLifecycle?.readyForPrefetch && typeof activeLifecycle.readyForPrefetch.finally === 'function') {
      activeLifecycle.readyForPrefetch.finally(() => {
        if (sequence === navigationSequence) schedulePrefetch(route);
      });
    } else {
      schedulePrefetch(route);
    }
  } catch (error) {
    if (sequence !== navigationSequence) return;
    console.error('Route yükleme hatası:', error);
    await hideStatus();
    await hideInitialTabLoader(sequence);
    removeRouteTransitionLoader(transitionLoader);
    renderError(error);
  }
}

window.navigateRoTaKip = path => navigate(new URL(path, window.location.origin));
window.refreshRoTaKipRoute = () => navigate(new URL(window.location.href), { fromPopState: true });

async function start() {
  await loadAssetManifest();
  await ensureShellFragments();
  await loadBundleScripts(COMMON_SCRIPTS);
  if (typeof window.initializeCookieConsent === 'function') window.initializeCookieConsent();
  const route = resolveRoute(window.location.pathname);
  if (!route) {
    window.location.assign('/');
    return;
  }
  configureNavigation(route, target => navigate(target));
  window.addEventListener('popstate', () => navigate(new URL(window.location.href), { fromPopState: true }));
  await navigate(new URL(window.location.href), { fromPopState: true });
}

start().catch(async error => {
  console.error('RoTaKip shell başlatılamadı:', error);
  await hideStatus();
  renderError(error);
});
