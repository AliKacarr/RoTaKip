import { ROUTES, canonicalPath, resolveRoute } from './route-config.js';
import { createFragmentView, mountFragment, preloadFragment } from './fragment-loader.js';
import { loadAssetManifest, loadBundleScripts, loadBundleStyles, preloadBundle } from './asset-loader.js';
import { loadGroupData, resolveGroupContext } from './group-context.js';
import { configureNavigation, getRememberedGroup, rememberGroup } from './navigation.js';
import { initializeScrollManager, resetRouteScroll } from './scroll-manager.js';

const COMMON_SCRIPTS = ['shell.min.js'];
const GROUP_COMMON_SCRIPTS = ['group-common.min.js'];
const GROUP_UI_SCRIPTS = ['group-ui.min.js'];
const ROUTE_ASSETS = {
  okumalar: {
    scripts: ['okumalar.min.js'],
    styles: ['okumalar.min.css']
  },
  tesbihat: { scripts: [], styles: [] },
  videos: { scripts: ['videos.min.js'], styles: ['videos.min.css'] },
  tefekkur: { scripts: ['tefekkur.min.js'], styles: ['tefekkur.min.css'] },
  articles: { scripts: ['articles.min.js'], styles: ['articles.min.css'] }
};
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
const overlayRoot = document.getElementById('overlayRoot');
const routeStatus = document.getElementById('routeStatus');
const backgroundViewRoot = document.createElement('div');
backgroundViewRoot.hidden = true;
backgroundViewRoot.setAttribute('aria-hidden', 'true');
document.body.appendChild(backgroundViewRoot);
const viewCache = new Map();
const lifecycleCache = new WeakMap();
const warmedViews = new WeakSet();
const globalWarmups = new Map();
const groupWarmups = new Map();
const placeholderGates = new WeakMap();
const PLACEHOLDER_DELAY_MS = 200;
const PLACEHOLDER_MIN_VISIBLE_MS = 450;
let activeView = null;
let activeLifecycle = null;
let mountedGroupId = null;
let navigationSequence = 0;
let routeStatusHideTimer = null;
let routeStatusHideResolve = null;

function showStatus() {
  if (routeStatusHideTimer) window.clearTimeout(routeStatusHideTimer);
  routeStatusHideTimer = null;
  if (routeStatusHideResolve) routeStatusHideResolve();
  routeStatusHideResolve = null;
  routeStatus.classList.remove('is-leaving');
  routeStatus.hidden = false;
  document.body.classList.add('route-is-loading');
  document.documentElement.classList.remove('initial-group-route-loading');
}

function routeUsesFullScreenLoader() {
  return false;
}

function hideStatus() {
  document.documentElement.classList.remove('initial-group-route-loading');
  document.body.classList.remove('route-is-loading');
  if (routeStatus.hidden) return Promise.resolve();
  routeStatus.classList.add('is-leaving');
  return new Promise(resolve => {
    routeStatusHideResolve = resolve;
    routeStatusHideTimer = window.setTimeout(() => {
      routeStatus.hidden = true;
      routeStatus.classList.remove('is-leaving');
      routeStatusHideTimer = null;
      routeStatusHideResolve = null;
      resolve();
    }, 260);
  });
}

function renderError(error) {
  tabContent.innerHTML = `<section class="route-error"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i><h1>İçerik açılamadı</h1><p>${window.escapeHtml(error.message || 'Beklenmeyen bir hata oluştu.')}</p><a href="/gruplar">Gruplara dön</a></section>`;
  footerRoot.hidden = false;
}

async function ensureShellFragments() {
  await mountFragment(footerRoot, '/fragments/footer.html');
  initializeScrollManager();
}

function getViewCacheKey(route) {
  return route.requiresGroup ? `${route.name}:${route.groupId}` : route.name;
}

function hasReadyCachedView(route) {
  const view = viewCache.get(getViewCacheKey(route));
  return Boolean(view && lifecycleCache.has(view));
}

async function getView(route) {
  const cacheKey = getViewCacheKey(route);
  if (!viewCache.has(cacheKey)) {
    viewCache.set(cacheKey, createFragmentView(route.fragment, route.name));
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
  view.classList.toggle('is-resuming', isReturningToOkumalar);
  view.classList.remove('visible');
  if (view.parentNode !== tabContent) tabContent.appendChild(view);
  activeView = view;
}

async function activatePrivateGroupView() {
  const view = await createFragmentView('/fragments/group-header.html', 'okumalar');
  view.dataset.privateGroupAccess = 'true';
  if (activeView && activeView !== view) activeView.remove();
  tabContent.replaceChildren(view);
  activeView = view;
  await revealRouteContent(view, true);
}

function updateMetadata(route, groupContext) {
  const groupSuffix = groupContext && groupContext.group ? ` · ${groupContext.group.groupName}` : '';
  document.title = groupSuffix ? `RoTaKip${groupSuffix}` : `RoTaKip · ${route.title}`;
  const canonical = document.getElementById('canonicalLink');
  if (canonical) canonical.href = `${window.location.origin}${canonicalPath(route)}`;
}

async function ensureGroupCommon(route, context, data) {
  if (mountedGroupId && mountedGroupId !== route.groupId) {
    window.location.assign(canonicalPath(route));
    return false;
  }
  if (!mountedGroupId) {
    await mountFragment(overlayRoot, '/fragments/common-overlays.html');
    mountedGroupId = route.groupId;
  }
  overlayRoot.hidden = false;
  window.__rotakipResolvedGroupContext = context;
  window.initialAllData = data || null;
  await loadBundleStyles(['group-common.min.css']);
  await loadBundleScripts(GROUP_COMMON_SCRIPTS);
  return true;
}

function portalOkumalarOverlays() {
  ['dailyGiftModal', 'dailyTasksModal'].forEach(id => {
    const modal = document.getElementById(id);
    if (modal && modal.parentElement !== overlayRoot) overlayRoot.appendChild(modal);
  });
}

function removeTrackerTablePlaceholder() {
  document.getElementById('trackerTablePlaceholder')?.remove();
}

function revealLeagueInfoBar(options = {}) {
  const placeholder = document.getElementById('leagueInfoPlaceholder');
  const leagueInfoBar = document.querySelector('.league-info-bar');
  if (!leagueInfoBar) return;

  const section = leagueInfoBar.closest('.league-info-section');
  if (section) section.style.display = 'block';
  placeholder?.remove();
  leagueInfoBar.style.display = 'flex';
  if (placeholder && options.animate !== false) {
    leagueInfoBar.classList.add('reading-content-reveal');
  }
  leagueInfoBar.classList.add('visible');
  return leagueInfoBar;
}

function stageReadingPrimaryContent() {
  document.querySelector('.tracker-table-shell')
    ?.classList.add('is-primary-reveal-pending');
  const messagePanels = document.querySelector('.reading-message-panels');
  if (messagePanels) messagePanels.hidden = true;
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

function revealReadingPrimaryContent(isAuthenticated) {
  const trackerShell = document.querySelector('.tracker-table-shell');
  const messagePanels = document.querySelector('.reading-message-panels');
  const messagePanelCards = messagePanels
    ? Array.from(messagePanels.querySelectorAll('.reading-message-panels-content > *'))
    : [];

  const leagueInfoBar = revealLeagueInfoBar({ animate: false });
  const revealTargets = [leagueInfoBar, trackerShell, ...messagePanelCards].filter(Boolean);
  revealTargets.forEach(element => element.classList.remove('reading-content-reveal'));
  removeTrackerTablePlaceholder();
  trackerShell?.classList.remove('is-primary-reveal-pending');
  if (messagePanels) {
    messagePanels.hidden = false;
    messagePanels.classList.remove('reading-content-reveal');
  }
  window.requestAnimationFrame(() => {
    revealTargets.forEach(element => element.classList.add('reading-content-reveal'));
    if (typeof window.syncAuthenticatedUserAreas === 'function') {
      window.syncAuthenticatedUserAreas(isAuthenticated, { immediate: true });
    }
  });
}

async function initializeGroupUi() {
  await loadBundleScripts(GROUP_UI_SCRIPTS);
  if (typeof window.initializeAdminModal === 'function') window.initializeAdminModal();
}

function runOkumalarBackgroundWork() {
  const run = async () => {
    const loadAssetGroup = (label, assets) => Promise.allSettled([
      loadBundleStyles(assets.styles),
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

async function initOkumalarTab() {
  await loadBundleStyles(ROUTE_ASSETS.okumalar.styles);
  await loadBundleScripts(ROUTE_ASSETS.okumalar.scripts);
  portalOkumalarOverlays();
  if (new URLSearchParams(window.location.search).has('invite')) await initializeGroupUi();
  await window.initializeGroupPage();
  const context = window.__rotakipResolvedGroupContext;
  const isAuthenticated = context?.isAuthenticated === true;
  if (typeof window.syncAuthenticatedUserAreas === 'function') {
    if (!isAuthenticated) window.syncAuthenticatedUserAreas(false);
  }
  stageReadingPrimaryContent();
  if (typeof window.initializeTrackerTableInteractions === 'function') window.initializeTrackerTableInteractions();
  if (typeof window.initializeDailyGift === 'function') window.initializeDailyGift();
  if (typeof window.setupShareModal === 'function') {
    window.setupShareModal('monthShareModal', 'closeMonthShareModal');
    window.setupShareModal('longestSeriesShareModal', 'closeLongestSeriesShareModal');
    window.setupShareModal('readingStatsShareModal', 'closeReadingStatsShareModal');
  }
  document.querySelectorAll('.monthly-calendar-section, .longest-series-section, .stats-section')
    .forEach(section => { section.style.display = 'block'; });
  const trackerReady = typeof window.loadTrackerTable === 'function'
    ? window.loadTrackerTable()
    : Promise.resolve();
  await Promise.all([trackerReady, prepareReadingPrimaryContent()]);
  revealReadingPrimaryContent(isAuthenticated);
  const readyForPrefetch = runOkumalarBackgroundWork();
  return {
    prepareBeforeReveal: true,
    readyForPrefetch,
    destroy() {
      if (typeof window.captureTrackerTableScrollPosition === 'function') {
        window.captureTrackerTableScrollPosition();
      }
    },
    async resume() {
      if (typeof window.refreshTrackerTableLayout === 'function') {
        await window.refreshTrackerTableLayout();
      } else if (typeof window.loadTrackerTable === 'function') {
        await window.loadTrackerTable();
      }
      this.readyForPrefetch = runOkumalarBackgroundWork();
    }
  };
}

async function initGlobalTab(route) {
  const assets = ROUTE_ASSETS[route.name];
  await loadBundleStyles(assets.styles);
  await loadBundleScripts(assets.scripts);
  const lifecycle = {
    videos: window.RoTaKipVideoTab,
    tefekkur: window.RoTaKipTefekkurTab,
    articles: window.RoTaKipArticlesTab
  }[route.name];
  if (lifecycle && typeof lifecycle.init === 'function') await lifecycle.init();
  if (lifecycle && typeof lifecycle.resume !== 'function') {
    lifecycle.resume = () => lifecycle.init && lifecycle.init();
  }
  return lifecycle || { destroy() {} };
}

function warmGlobalTab(route) {
  if (route.requiresGroup) return Promise.resolve(null);
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

function placeholderTime() {
  return window.performance && typeof window.performance.now === 'function'
    ? window.performance.now()
    : Date.now();
}

function preparePlaceholderGate(target, delay) {
  if (!target || placeholderGates.has(target)) return;
  const gate = { shownAt: null, timer: null };
  const show = () => {
    gate.timer = null;
    gate.shownAt = placeholderTime();
    target.style.visibility = '';
  };
  target.style.visibility = 'hidden';
  if (delay <= 0) show();
  else gate.timer = window.setTimeout(show, delay);
  placeholderGates.set(target, gate);
}

function prepareRoutePlaceholders(route, view, isInitialNavigation) {
  if (!view || routeUsesFullScreenLoader(route)) return;
  const targets = [];
  if (route.name === 'videos') {
    const container = view.querySelector('#videos');
    if (container?.querySelector('.loading-card')) targets.push(container);
  } else if (route.name === 'tefekkur') {
    targets.push(...view.querySelectorAll('.quote-text.is-loading'));
  } else if (route.name === 'articles') {
    const container = view.querySelector('#articlesContainer');
    if (container?.querySelector('.article-loading-card')) targets.push(container);
  }
  const delay = isInitialNavigation ? 0 : PLACEHOLDER_DELAY_MS;
  targets.forEach(target => {
    if (target.style.display !== 'none') preparePlaceholderGate(target, delay);
  });
}

window.waitForRoutePlaceholder = async function waitForRoutePlaceholder(target) {
  const gate = target ? placeholderGates.get(target) : null;
  if (!gate) return;
  if (gate.timer) {
    window.clearTimeout(gate.timer);
    gate.timer = null;
  } else if (gate.shownAt !== null) {
    const remaining = PLACEHOLDER_MIN_VISIBLE_MS - (placeholderTime() - gate.shownAt);
    if (remaining > 0) await new Promise(resolve => window.setTimeout(resolve, remaining));
  }
  target.style.visibility = '';
  placeholderGates.delete(target);
};

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
      const groupId = getRememberedGroup();
      if (!groupId) return;
      prepareGroupTab({ ...target, groupId }).catch(error => {
        console.warn(`${target.title} arka planda hazırlanamadı:`, error);
      });
      return;
    }
    warmGlobalTab(target).catch(error => {
      console.warn(`${target.title} arka planda hazırlanamadı:`, error);
    });
  });
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 3500 });
  else window.setTimeout(run, 1200);
}

async function navigate(url, options = {}) {
  const sequence = ++navigationSequence;
  const isInitialNavigation = activeView === null;
  const route = resolveRoute(url.pathname);
  if (!route) {
    window.location.assign(url.href);
    return;
  }
  if (!options.fromPopState) history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
  const targetWasReady = hasReadyCachedView(route);
  const useFullScreenLoader = routeUsesFullScreenLoader(route)
    && !targetWasReady;
  const revealAfterLifecycle = useFullScreenLoader;
  if (useFullScreenLoader) showStatus();
  else await hideStatus();
  if (activeLifecycle && typeof activeLifecycle.destroy === 'function') activeLifecycle.destroy();
  activeLifecycle = null;
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
      const criticalScripts = [...GROUP_COMMON_SCRIPTS, ...ROUTE_ASSETS[route.name].scripts];
      const [resolvedContext, , preparedView] = await Promise.all([
        resolveGroupContext(route.groupId),
        loadBundleStyles(['group-common.min.css', ...ROUTE_ASSETS[route.name].styles]),
        getView(route),
        Promise.all(criticalScripts.map(fileName => preloadBundle(fileName, 'script')))
      ]);
      if (sequence !== navigationSequence) return;
      groupContext = resolvedContext;
      updateMetadata(route, groupContext);

      await activateView(route, preparedView);
      if (sequence !== navigationSequence) return;
      prepareRoutePlaceholders(route, activeView, isInitialNavigation);
      const deferOkumalarResumeReveal = route.name === 'okumalar'
        && lifecycleCache.has(activeView)
        && !warmedViews.has(activeView);
      if (!deferOkumalarResumeReveal) await revealRouteContent(activeView, true);
      groupViewPrepared = true;

      if (!groupContext.canRead) {
        await ensureGroupCommon(route, groupContext, null);
        await activatePrivateGroupView();
        await initializeGroupUi();
        await window.initializeGroupPage();
        await hideStatus();
        return;
      }

      rememberGroup(route.groupId);

      const data = await loadGroupData(groupContext);
      if (sequence !== navigationSequence) return;
      await ensureGroupCommon(route, groupContext, data);
    } else {
      overlayRoot.hidden = true;
      updateMetadata(route, null);
    }

    if (!groupViewPrepared) {
      await loadBundleStyles(ROUTE_ASSETS[route.name].styles);
      if (sequence !== navigationSequence) return;
      await activateView(route);
      if (sequence !== navigationSequence) return;
      prepareRoutePlaceholders(route, activeView, isInitialNavigation);
    }
    const hasCachedLifecycle = lifecycleCache.has(activeView);
    if (hasCachedLifecycle) activeLifecycle = lifecycleCache.get(activeView);
    const isFirstWarmActivation = warmedViews.delete(activeView);
    const resumeBeforeReveal = hasCachedLifecycle
      && !isFirstWarmActivation
      && activeLifecycle?.prepareBeforeReveal === true
      && typeof activeLifecycle.resume === 'function';
    if (resumeBeforeReveal) {
      activeView
        .querySelector('.tracker-table-layout')
        ?.classList.add('is-restoring-position');
      await activeLifecycle.resume();
      if (sequence !== navigationSequence) return;
    }
    if (!revealAfterLifecycle && !activeView.classList.contains('visible')) {
      await revealRouteContent(activeView, true);
    }

    if (resumeBeforeReveal) {
      const trackerLayout = activeView.querySelector('.tracker-table-layout');
      try {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await window.refreshTrackerTableLayout?.();
      } finally {
        trackerLayout?.classList.remove('is-restoring-position');
      }
      if (sequence !== navigationSequence) return;
    }

    if (hasCachedLifecycle) {
      if (!isFirstWarmActivation && !resumeBeforeReveal && activeLifecycle && typeof activeLifecycle.resume === 'function') {
        await activeLifecycle.resume();
      }
    } else {
      activeLifecycle = route.name === 'okumalar'
        ? await initOkumalarTab()
        : await initGlobalTab(route);
      lifecycleCache.set(activeView, activeLifecycle);
    }
    await hideStatus();
    if (sequence !== navigationSequence) return;
    if (revealAfterLifecycle) await revealRouteContent(activeView);
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
    renderError(error);
  }
}

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
