import { ROUTES, canonicalPath, resolveRoute } from './route-config.js';
import { createFragmentView, mountFragment, preloadFragment } from './fragment-loader.js';
import { loadAssetManifest, loadBundleScripts, loadBundleStyles, preloadBundle } from './asset-loader.js';
import { loadGroupData, resolveGroupContext } from './group-context.js';
import { configureNavigation } from './navigation.js';
import { initializeScrollManager, resetRouteScroll } from './scroll-manager.js';

const COMMON_SCRIPTS = ['shell.min.js'];
const GROUP_COMMON_SCRIPTS = ['group-common.min.js'];
const ROUTE_ASSETS = {
  weekly: { scripts: ['weekly.min.js'], styles: ['weekly.min.css'] },
  statistics: { scripts: ['statistics.min.js'], styles: ['statistics.min.css'] },
  videos: { scripts: ['videos.min.js'], styles: ['videos.min.css'] },
  mercy: { scripts: ['mercy.min.js'], styles: ['mercy.min.css'] },
  articles: { scripts: ['articles.min.js'], styles: ['articles.min.css'] }
};

const tabContent = document.getElementById('tabContent');
const groupCommonRoot = document.getElementById('groupCommonRoot');
const footerRoot = document.getElementById('footerRoot');
const overlayRoot = document.getElementById('overlayRoot');
const routeStatus = document.getElementById('routeStatus');
const viewCache = new Map();
const lifecycleCache = new WeakMap();
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
}

function hideStatus() {
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
  tabContent.innerHTML = `<section class="route-error"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i><h1>İçerik açılamadı</h1><p>${window.escapeHtml(error.message || 'Beklenmeyen bir hata oluştu.')}</p><a href="/">Gruplara dön</a></section>`;
}

async function ensureShellFragments() {
  await mountFragment(footerRoot, '/fragments/footer.html');
  initializeScrollManager();
}

async function getView(route) {
  const cacheKey = route.requiresGroup ? `${route.name}:${route.groupId}` : route.name;
  if (!viewCache.has(cacheKey)) {
    viewCache.set(cacheKey, createFragmentView(route.fragment, route.name));
  }
  return viewCache.get(cacheKey);
}

async function activateView(route) {
  const view = await getView(route);
  if (activeView && activeView !== view) activeView.remove();
  view.classList.remove('visible');
  if (!view.isConnected) tabContent.appendChild(view);
  activeView = view;
}

function updateMetadata(route, groupContext) {
  const groupSuffix = groupContext && groupContext.group ? ` · ${groupContext.group.groupName}` : '';
  document.title = `RoTaKip · ${route.title}${groupSuffix}`;
  const canonical = document.getElementById('canonicalLink');
  if (canonical) canonical.href = `${window.location.origin}${canonicalPath(route)}`;
}

async function ensureGroupCommon(route, context, data) {
  if (mountedGroupId && mountedGroupId !== route.groupId) {
    window.location.assign(canonicalPath(route));
    return false;
  }
  if (!mountedGroupId) {
    groupCommonRoot.hidden = true;
    await Promise.all([
      mountFragment(groupCommonRoot, '/fragments/group-common.html'),
      mountFragment(overlayRoot, '/fragments/common-overlays.html')
    ]);
    mountedGroupId = route.groupId;
  }
  overlayRoot.hidden = false;
  window.__rotakipResolvedGroupContext = context;
  window.initialAllData = data || null;
  await loadBundleStyles(['group-common.min.css']);
  groupCommonRoot.hidden = false;
  await loadBundleScripts(GROUP_COMMON_SCRIPTS);
  if (typeof window.initializeAdminModal === 'function') window.initializeAdminModal();
  if (typeof window.initializeDailyGift === 'function') window.initializeDailyGift();
  await window.initializeGroupPage();
  if (typeof window.syncAuthenticatedUserAreas === 'function') {
    window.syncAuthenticatedUserAreas(context.isAuthenticated === true);
  }
  return true;
}

async function initWeeklyTab() {
  await loadBundleStyles(ROUTE_ASSETS.weekly.styles);
  await loadBundleScripts(ROUTE_ASSETS.weekly.scripts);
  if (typeof window.initializeTrackerTableInteractions === 'function') window.initializeTrackerTableInteractions();
  if (typeof window.initializeGroupManagement === 'function') window.initializeGroupManagement();
  if (typeof window.showAdminIndicator === 'function') await window.showAdminIndicator();
  if (typeof window.loadTrackerTable === 'function') await window.loadTrackerTable();
  if (typeof window.renderReadingMessagePanels === 'function') await window.renderReadingMessagePanels();
  if (typeof window.initializeHomeMercyWindow === 'function') await window.initializeHomeMercyWindow();
  if (typeof window.scheduleOneSignalLoad === 'function') window.scheduleOneSignalLoad();
  return {
    destroy() {},
    async resume() {
      if (typeof window.refreshTrackerTableLayout === 'function') {
        await window.refreshTrackerTableLayout();
      } else if (typeof window.loadTrackerTable === 'function') {
        await window.loadTrackerTable();
      }
    }
  };
}

async function initStatisticsTab() {
  await loadBundleStyles(ROUTE_ASSETS.statistics.styles);
  await loadBundleScripts(ROUTE_ASSETS.statistics.scripts);
  if (typeof window.setupShareModal === 'function') {
    window.setupShareModal('monthShareModal', 'closeMonthShareModal');
    window.setupShareModal('longestSeriesShareModal', 'closeLongestSeriesShareModal');
    window.setupShareModal('readingStatsShareModal', 'closeReadingStatsShareModal');
  }
  const runSection = async (name, initializer) => {
    if (typeof initializer !== 'function') return;
    try {
      await initializer();
    } catch (error) {
      console.error(`${name} bölümü başlatılamadı:`, error);
    }
  };
  document.querySelectorAll('.monthly-calendar-section, .longest-series-section, .stats-section')
    .forEach(section => { section.style.display = 'block'; });
  await runSection('Okuma yolculuğu', window.initializeReadingJourney);
  await runSection('Kullanıcı kartları', window.loadUserCards);
  await runSection('Aylık istatistikler', window.loadMonthlyCalendar);
  await runSection('En uzun okuma serisi', window.renderLongestSeries);
  await runSection('Okuma istatistikleri', window.loadReadingStats);
  return {
    destroy() {
      if (typeof window.destroyReadingStatsChart === 'function') window.destroyReadingStatsChart();
    },
    async resume() {
      if (typeof window.loadReadingStats === 'function') await window.loadReadingStats();
    }
  };
}

async function initGlobalTab(route) {
  const assets = ROUTE_ASSETS[route.name];
  await loadBundleStyles(assets.styles);
  await loadBundleScripts(assets.scripts);
  const lifecycle = {
    videos: window.RoTaKipVideoTab,
    mercy: window.RoTaKipMercyTab,
    articles: window.RoTaKipArticlesTab
  }[route.name];
  if (lifecycle && typeof lifecycle.init === 'function') await lifecycle.init();
  if (lifecycle && typeof lifecycle.resume !== 'function') {
    lifecycle.resume = () => lifecycle.init && lifecycle.init();
  }
  return lifecycle || { destroy() {} };
}

function markPrimaryReady() {
  window.rotakipPrimaryContentReady = true;
  window.dispatchEvent(new Event('rotakip:primary-content-ready'));
}

function revealRouteContent(view) {
  if (!view) return;
  window.requestAnimationFrame(() => {
    view.classList.add('visible');
  });
}

function connectionAllowsPrefetch() {
  const connection = navigator.connection;
  if (!connection) return true;
  return !connection.saveData && !['slow-2g', '2g'].includes(connection.effectiveType);
}

function schedulePrefetch(route) {
  if (!connectionAllowsPrefetch()) return;
  const order = route.name === 'weekly'
    ? ['statistics', 'videos']
    : route.name === 'statistics'
      ? ['weekly', 'videos']
      : ['videos', 'mercy', 'articles'];
  const run = () => order.filter(name => name !== route.name).forEach(name => {
    const target = ROUTES[name];
    preloadFragment(target.fragment);
    const assets = ROUTE_ASSETS[name];
    if (!assets) return;
    assets.scripts.forEach(fileName => preloadBundle(fileName, 'script'));
    assets.styles.forEach(fileName => preloadBundle(fileName, 'style'));
  });
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 3500 });
  else window.setTimeout(run, 1200);
}

async function navigate(url, options = {}) {
  const sequence = ++navigationSequence;
  const route = resolveRoute(url.pathname);
  if (!route) {
    window.location.assign(url.href);
    return;
  }
  if (!options.fromPopState) history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
  showStatus();
  if (activeLifecycle && typeof activeLifecycle.destroy === 'function') activeLifecycle.destroy();
  activeLifecycle = null;
  configureNavigation(route, target => navigate(target));
  resetRouteScroll();

  try {
    let groupContext = null;
    if (route.requiresGroup) {
      showStatus();
      groupContext = await resolveGroupContext(route.groupId);
      if (sequence !== navigationSequence) return;
      updateMetadata(route, groupContext);

      if (!groupContext.canRead) {
        await ensureGroupCommon(route, groupContext, null);
        if (activeView) activeView.remove();
        activeView = null;
        tabContent.innerHTML = '<section class="route-error private-group-message"><i class="fa-solid fa-lock" aria-hidden="true"></i><h1>Gizli grup</h1><p>Bu grubun içeriğini görüntülemek için giriş yapın veya üyelik isteği gönderin.</p></section>';
        await hideStatus();
        return;
      }

      const data = await loadGroupData(groupContext);
      if (sequence !== navigationSequence) return;
      await ensureGroupCommon(route, groupContext, data);
    } else {
      groupCommonRoot.hidden = true;
      overlayRoot.hidden = true;
      updateMetadata(route, null);
    }

    showStatus();
    await loadBundleStyles(ROUTE_ASSETS[route.name].styles);
    if (sequence !== navigationSequence) return;
    await activateView(route);
    if (sequence !== navigationSequence) return;

    if (lifecycleCache.has(activeView)) {
      activeLifecycle = lifecycleCache.get(activeView);
      if (activeLifecycle && typeof activeLifecycle.resume === 'function') {
        await activeLifecycle.resume();
      }
    } else {
      activeLifecycle = route.name === 'weekly'
        ? await initWeeklyTab()
        : route.name === 'statistics'
          ? await initStatisticsTab()
          : await initGlobalTab(route);
      lifecycleCache.set(activeView, activeLifecycle);
    }
    await hideStatus();
    if (sequence !== navigationSequence) return;
    revealRouteContent(activeView);
    tabContent.focus({ preventScroll: true });
    markPrimaryReady();
    schedulePrefetch(route);
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
