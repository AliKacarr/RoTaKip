const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');

function readPublic(relativePath) {
  return fs.readFileSync(path.join(publicDir, relativePath), 'utf8');
}

function collectIds(content) {
  return Array.from(content.matchAll(/\bid=["']([^"']+)["']/g), match => match[1]);
}

function assertUniqueIds(files) {
  const ids = collectIds(files.map(readPublic).join('\n'));
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicates)], [], `Yinelenen DOM id: ${duplicates.join(', ')}`);
}

test('shell yalnız ortak kabuk ve beş sekmeli navigasyonu içerir', () => {
  const shell = readPublic('groups.html');
  const shellStyles = readPublic('shell.css');
  assert.match(shell, /id="appNavigation"/);
  assert.equal((shell.match(/data-route=/g) || []).length, 5);
  assert.doesNotMatch(shell, /app-navigation-brand/);
  assert.match(shell, /data-route="weekly"[\s\S]*?<span>Ana Sayfa<\/span>/);
  assert.match(shell, /data-route="statistics"[\s\S]*?<span>Analizler<\/span>/);
  assert.match(shell, /id="tabContent"/);
  assert.match(shell, /id="scrollToTopBtn"/);
  assert.match(shell, /id="routeStatus"[\s\S]*?route-loader-star[\s\S]*?>Ro<[\s\S]*?>Ta<[\s\S]*?>Kip</);
  assert.match(shell, /shell\.min\.css\?v=/);
  assert.doesNotMatch(shell, /groups\.min\.(?:css|js)/);
  assert.doesNotMatch(shell, /class="tracker-table-shell"/);
  assert.doesNotMatch(shell, /class="videos"/);
  assert.doesNotMatch(readPublic('index.html'), /id="appNavigation"/);
  assert.match(shellStyles, /\.app-navigation-item\.is-active\s*\{[^}]*background:\s*transparent/s);
  assert.match(shellStyles, /\.app-navigation-item\.is-active i\s*\{[^}]*font-weight:\s*900/s);
  assert.match(shellStyles, /\.app-navigation-item:hover,[\s\S]*?background:\s*rgba\(17, 17, 17, 0\.06\)/);
  assert.match(shellStyles, /#footerRoot\s*\{[^}]*margin-top:\s*auto/s);
  assert.match(shellStyles, /\.app-shell-container\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*1080px/s);
  assert.match(shellStyles, /\.route-status\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;/s);
  assert.match(shellStyles, /\.route-status\s*\{[^}]*background:\s*#fff;/s);
  assert.doesNotMatch(shellStyles, /\.route-status\s*\{[^}]*backdrop-filter:/s);
  assert.match(shellStyles, /\.app-navigation\s*\{[^}]*z-index:\s*9000/s);
  assert.match(shellStyles, /\.route-status\s*\{[^}]*z-index:\s*8500/s);
  assert.match(shellStyles, /\.tab-view\.visible\s*\{[^}]*tab-view-enter/s);
  assert.match(shellStyles, /--app-nav-height:\s*128px/);
  assert.match(shellStyles, /@media \(max-width:\s*1180px\)[\s\S]*?\.app-navigation-item\s*\{[^}]*min-height:\s*112px;[^}]*gap:\s*9px;[^}]*font-size:\s*23px;/s);
  assert.match(shellStyles, /@media \(max-width:\s*1180px\)[\s\S]*?\.app-navigation-item i\s*\{[^}]*font-size:\s*52px;/s);
});

test('asset manifesti shell ve sekme paketlerini ayrı tutar', () => {
  const manifest = JSON.parse(readPublic('assets-manifest.json'));
  [
    'shell.min.css', 'shell.min.js',
    'group-common.min.css', 'group-common.min.js',
    'weekly.min.css', 'weekly.min.js',
    'statistics.min.css', 'statistics.min.js',
    'videos.min.css', 'videos.min.js',
    'mercy.min.css', 'mercy.min.js',
    'articles.min.css', 'articles.min.js'
  ].forEach(fileName => {
    assert.match(manifest[fileName], new RegExp(`^${fileName.replaceAll('.', '\\.')}\\?v=[a-f0-9]{12}$`));
  });
});

test('haftalık ve istatistik fragmentleri planlanan içerik sınırlarına uyar', () => {
  const weekly = readPublic('fragments/weekly.html');
  const statistics = readPublic('fragments/statistics.html');
  const groupCommon = readPublic('fragments/group-common.html');

  assert.match(groupCommon, /id="secretAdminLogin"/);
  assert.doesNotMatch(groupCommon, /navigationAuthority|group-authority-badge/);

  assert.match(weekly, /class="tracker-table-shell"/);
  assert.match(weekly, /id="readingEditModeBar" class="reading-edit-mode-bar" hidden/);
  assert.match(weekly, /class="reading-message-panels"/);
  assert.match(weekly, /class="main-area"/);
  assert.match(weekly, /class="settings-section/);
  assert.match(weekly, /class="home-mercy-window"/);
  assert.match(weekly, /Günün Vecizeleri/);
  assert.match(weekly, /fa-solid fa-quote-right/);
  assert.equal((weekly.match(/class="quote-section-image"/g) || []).length, 2);
  assert.doesNotMatch(weekly, /class="user-cards-container"/);
  assert.doesNotMatch(weekly, /class="monthly-calendar-section"/);

  assert.match(statistics, /class="user-cards-section"/);
  assert.match(statistics, /class="user-cards-container"/);
  assert.match(statistics, /class="monthly-calendar-section"/);
  assert.match(statistics, /class="longest-series-section"/);
  assert.match(statistics, /class="stats-section"/);
  assert.doesNotMatch(statistics, /user-cards-message-panels/);
  assert.doesNotMatch(statistics, /tracker-table-shell/);
  assert.doesNotMatch(statistics, /readingEditModeBar/);
  assert.doesNotMatch(groupCommon, /readingEditModeBar/);
  assert.match(readPublic('reading-edit-mode.js'), /modeBar\.hidden = true/);
  assert.match(readPublic('reading-edit-mode.js'), /modeBar\.hidden = false/);
  assert.doesNotMatch(
    readPublic('user-cards.js'),
    /league-promotion-message|reading-streak-message|weak-link-message|everyone-read-message/
  );
  const messagePanels = readPublic('reading-message-panels.js');
  assert.match(messagePanels, /renderReadingMessagePanels/);
  assert.match(messagePanels, /window\.ROTAKIP_LEAGUES/);
  assert.match(messagePanels, /confetti-overlay/);
  assert.match(messagePanels, /reading-streak-message/);
  assert.match(readPublic('reading-message-panels.css'), /kurdele\.webp/);
  assert.match(readPublic('reading-message-panels.css'), /dugum\.webp/);
  assert.doesNotMatch(readPublic('user-cards.css'), /league-promotion-message|weak-link-message/);
});

test('global fragmentler grup içeriği taşımaz', () => {
  const expectations = [
    ['fragments/videos.html', 'class="videos"'],
    ['fragments/mercy.html', 'class="quote"'],
    ['fragments/articles.html', 'class="articles"']
  ];
  expectations.forEach(([file, marker]) => {
    const content = readPublic(file);
    assert.match(content, new RegExp(marker));
    assert.doesNotMatch(content, /tracker-table-shell|user-cards-section|main-area/);
    assert.doesNotMatch(content, /scroll-fade-in/);
  });

  const mercy = readPublic('fragments/mercy.html');
  assert.match(mercy, /class="quote-grid-container"/);
  assert.equal((mercy.match(/class="quote-section"/g) || []).length, 4);
  assert.doesNotMatch(mercy, /quote-section-image|quoteImage|refreshQuoteImage/);
  assert.match(readPublic('quote.css'), /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.doesNotMatch(readPublic('quete.js'), /fetchRandomQuoteImage|refreshQuoteImage|quoteImage/);
  assert.doesNotMatch(readPublic('home-mercy.css'), /is-loading[\s\S]*?opacity/);
  assert.match(readPublic('home-mercy.js'), /const preloadImage = new Image\(\)/);
});

test('Videolar doğrudan yenilendiğinde veri ve kart görünürlüğü tamamlanır', () => {
  const videos = readPublic('videos.js');
  assert.match(videos, /return showRandomVideos\(\)/);
  assert.doesNotMatch(videos, /scroll-fade-in|observeScrollFadeIn/);
});

test('Videolar sekmesine dönüldüğünde yalnız rastgele görünüm yenilenir', () => {
  const videos = readPublic('videos.js');
  assert.match(videos, /function resumeVideos\(\)/);
  assert.match(videos, /activeButton\?\.id === 'randomBtn'[\s\S]*?showRandomVideos\(\)[\s\S]*?Promise\.resolve\(\)/);
  assert.match(videos, /resume: resumeVideos/);
});

test('bağımsız global sekmeler yukarı kayma efekti kullanmaz', () => {
  const shellStyles = readPublic('shell.css');
  assert.match(shellStyles, /\.tab-view-videos[\s\S]*?\.tab-view-articles\.visible[\s\S]*?animation:\s*none/);
  assert.doesNotMatch(readPublic('articles.js'), /renderArticlesWithTransition|translateY\(20px\)/);
});

test('router içerikleri kaydırma animasyonu olmadan ve istatistik bölümlerini bağımsız başlatır', () => {
  const router = readPublic('app/shell-router.js');
  const commonStyles = readPublic('style.css');
  const userCardStyles = readPublic('user-cards.css');
  const messagePanelStyles = readPublic('reading-message-panels.css');
  const weeklyInit = router.match(/async function initWeeklyTab\(\)[\s\S]*?(?=async function initStatisticsTab)/)?.[0] || '';
  const statisticsInit = router.match(/async function initStatisticsTab\(\)[\s\S]*?(?=async function initGlobalTab)/)?.[0] || '';
  assert.match(router, /function revealRouteContent/);
  assert.doesNotMatch(router, /querySelectorAll\(['"]\.scroll-fade-in/);
  assert.match(commonStyles, /\.scroll-fade-in\s*\{[^}]*opacity:\s*1;[^}]*transform:\s*none;[^}]*transition:\s*none;/s);
  assert.match(userCardStyles, /\.user-card\s*\{[^}]*transform:\s*none;[^}]*opacity:\s*1;/s);
  assert.match(messagePanelStyles, /\.league-promotion-message,[\s\S]*?opacity:\s*1;[\s\S]*?transform:\s*none;/);
  assert.doesNotMatch(readPublic('user-cards.js'), /userCardScrollObserver|cardScrollObserver/);
  assert.doesNotMatch(readPublic('stats-section.js'), /readingStatsVisibilityObserver|setupReadingStatsVisibilityObserver/);
  assert.doesNotMatch(readPublic('longest-series.js'), /IntersectionObserver|barsToAnimate|initialBarWidth/);
  assert.match(weeklyInit, /window\.initializeHomeMercyWindow/);
  assert.doesNotMatch(weeklyInit, /window\.loadMonthlyCalendar/);
  assert.match(statisticsInit, /window\.loadMonthlyCalendar/);
  assert.match(statisticsInit, /monthShareModal/);
  assert.match(router, /En uzun okuma serisi/);
  assert.match(router, /Okuma istatistikleri/);
  assert.match(readPublic('monthly.js'), /window\.loadMonthlyCalendar = function/);
  assert.doesNotMatch(readPublic('reading-journey.js'), /window\.LEAGUES/);
  assert.doesNotMatch(router, /İçerik yükleniyor|Grup erişimi doğrulanıyor|Bölüm hazırlanıyor/);
  assert.doesNotMatch(readPublic('groups.html'), /<span>İçerik yükleniyor/);
  assert.match(router, /refreshTrackerTableLayout/);
  assert.match(readPublic('tracker-table.js'), /window\.refreshTrackerTableLayout/);
  assert.doesNotMatch(readPublic('shell.css'), /tab-view[\s\S]*?scale\(0\.995\)/);
});

test('her route birleşiminde DOM kimlikleri benzersizdir', () => {
  const shared = ['groups.html', 'fragments/footer.html'];
  [
    [...shared, 'fragments/common-overlays.html', 'fragments/group-common.html', 'fragments/weekly.html'],
    [...shared, 'fragments/common-overlays.html', 'fragments/group-common.html', 'fragments/statistics.html'],
    [...shared, 'fragments/videos.html'],
    [...shared, 'fragments/mercy.html'],
    [...shared, 'fragments/articles.html']
  ].forEach(assertUniqueIds);
});

test('grup pencereleri global sekmelerde yüklenmez', () => {
  const router = readPublic('app/shell-router.js');
  const shellSetup = router.match(/async function ensureShellFragments\(\)[\s\S]*?\n}/)?.[0] || '';
  const groupSetup = router.match(/async function ensureGroupCommon\([\s\S]*?\n}/)?.[0] || '';
  assert.doesNotMatch(shellSetup, /common-overlays\.html/);
  assert.match(groupSetup, /common-overlays\.html/);
  assert.match(router, /overlayRoot\.hidden = true/);
  assert.doesNotMatch(readPublic('fragments/common-overlays.html'), /id="scrollToTopBtn"/);
});

test('Analiz sekmesinde ortak avatar pencereleri gizli ve kartlar iki sütunludur', () => {
  const commonStyles = readPublic('admin-modal.css');
  const cardStyles = readPublic('user-cards.css');
  assert.match(commonStyles, /\.ready-images-modal:not\(\.show\)\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(cardStyles, /\.user-card\s*\{[^}]*width:\s*min\(430px,\s*calc\(\(100% - 30px\) \/ 2\)\)/s);
  assert.match(cardStyles, /@media screen and \(max-width:\s*1023px\)[\s\S]*?\.user-card\s*\{[^}]*width:\s*min\(400px,\s*100%\)/s);
});

test('Okuma yolculuğu doğrudan açılan Analiz sekmesinde de oturuma bağlıdır', () => {
  const commonStyles = readPublic('admin-modal.css');
  const weeklyStyles = readPublic('tracker-table.css');
  const journey = readPublic('reading-journey.js');
  const router = readPublic('app/shell-router.js');
  assert.match(commonStyles, /\.authenticated-user-areas\s*\{[^}]*visibility:\s*hidden/s);
  assert.doesNotMatch(weeklyStyles, /\.authenticated-user-areas\s*\{/);
  assert.match(journey, /window\.syncAuthenticatedUserAreas/);
  assert.match(router, /syncAuthenticatedUserAreas\(context\.isAuthenticated === true\)/);
});

test('route çözücü kanonik grup ve global adresleri ayırır', async () => {
  const moduleUrl = pathToFileURL(path.join(publicDir, 'app', 'route-config.js')).href;
  const routes = await import(moduleUrl);
  assert.deepEqual(routes.resolveRoute('/grup/catikati23/haftalik'), {
    ...routes.ROUTES.weekly,
    groupId: 'catikati23'
  });
  assert.equal(routes.resolveRoute('/grup/çatı/istatistikler').name, 'statistics');
  assert.equal(routes.resolveRoute('/videolar').requiresGroup, false);
  assert.equal(routes.resolveRoute('/rahmet-penceresi').name, 'mercy');
  assert.equal(routes.resolveRoute('/makaleler').name, 'articles');
  assert.equal(routes.resolveRoute('/bilinmeyen'), null);
});

test('gizli grupta oturumsuz istemci okuma verisini istemez', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async url => {
    calls.push(String(url));
    if (String(url).startsWith('/api/group/')) {
      return new Response(JSON.stringify({ group: { groupId: 'gizli-test', visibility: 'private' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (String(url).startsWith('/api/auth/me/')) {
      return new Response(JSON.stringify({ error: 'Giriş gerekli' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`Beklenmeyen istek: ${url}`);
  };

  try {
    const moduleUrl = `${pathToFileURL(path.join(publicDir, 'app', 'group-context.js')).href}?test=${Date.now()}`;
    const contextModule = await import(moduleUrl);
    const context = await contextModule.resolveGroupContext('gizli-test');
    assert.equal(context.canRead, false);
    await assert.rejects(contextModule.loadGroupData(context), error => error.code === 'PRIVATE_GROUP');
    assert.equal(calls.some(url => url.startsWith('/api/all-data/')), false);
  } finally {
    global.fetch = originalFetch;
  }
});
