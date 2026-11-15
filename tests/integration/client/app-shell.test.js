const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const projectRoot = path.resolve(__dirname, '../../..');
const publicDir = path.join(projectRoot, 'public');
const clientDir = path.join(projectRoot, 'src', 'client');

function readPublic(relativePath) {
  return fs.readFileSync(path.join(publicDir, relativePath), 'utf8');
}

function readClient(relativePath) {
  return fs.readFileSync(path.join(clientDir, relativePath), 'utf8');
}

function collectIds(content) {
  return Array.from(content.matchAll(/\bid=["']([^"']+)["']/g), match => match[1]);
}

function assertUniqueIds(files) {
  const ids = collectIds(files.map(readPublic).join('\n'));
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicates)], [], `Yinelenen DOM id: ${duplicates.join(', ')}`);
}

test('keşif ve Tesbihat shell sayfaları aynı beş sekmeli navigasyonu içerir', () => {
  const shell = readPublic('app-shell.html');
  const index = readPublic('gruplar.html');
  const shellStyles = readClient('shell/shell.css');
  const indexStyles = readClient('features/group-directory/group-directory.css');
  assert.match(shell, /id="appNavigation"/);
  assert.match(index, /id="appNavigation"/);
  assert.equal((shell.match(/data-route=/g) || []).length, 5);
  assert.equal((index.match(/data-route=/g) || []).length, 5);
  assert.doesNotMatch(shell, /app-navigation-brand/);
  assert.match(shell, /data-route="okumalar"[\s\S]*?fa-solid fa-compass[\s\S]*?<span>Okumalar<\/span>/);
  assert.match(shell, /data-route="tesbihat" href="\/tesbihat"[\s\S]*?<span>Tesbihat<\/span>/);
  assert.match(index, /data-route="okumalar"[\s\S]*?class="app-navigation-item is-active"|class="app-navigation-item is-active"[\s\S]*?data-route="okumalar"/);
  assert.match(index, /data-route="tesbihat" href="\/tesbihat"/);
  assert.match(index, /data-route="okumalar" href="\/gruplar"/);
  assert.match(shell, /data-route="tefekkur" href="\/tefekkur"[\s\S]*?<span>Tefekkür<\/span>/);
  assert.match(shell, /data-route="tesbihat"[\s\S]*?data-route="tefekkur"[\s\S]*?data-route="videos"[\s\S]*?data-route="articles"[\s\S]*?data-route="okumalar"/);
  assert.match(index, /data-route="tesbihat"[\s\S]*?data-route="tefekkur"[\s\S]*?data-route="videos"[\s\S]*?data-route="articles"[\s\S]*?data-route="okumalar"/);
  assert.match(shell, /id="tabContent"/);
  assert.match(shell, /id="scrollToTopBtn"/);
  assert.match(shell, /id="routeStatus"[^>]*hidden[\s\S]*?route-loader-star[\s\S]*?>Ro<[\s\S]*?>Ta<[\s\S]*?>Kip</);
  assert.match(shell, /\^\\\/grup\\\/\[\^\/\]\+\\\/\?\$/);
  assert.match(index, /<h1 class="header-title">Okuma Grupları<\/h1>/);
  assert.match(index, /Kitap okuma hedeflerinizi belirleyin ve ilerlemenizi takip edin/);
  assert.match(shell, /document\.documentElement\.classList\.add\('initial-group-route-loading'\)/);
  assert.match(shell, /shell\.min\.css\?v=/);
  assert.doesNotMatch(shell, /groups\.min\.(?:css|js)/);
  assert.doesNotMatch(shell, /class="tracker-table-shell"/);
  assert.doesNotMatch(shell, /class="videos"/);
  assert.match(indexStyles, /body\.index-navigation-body\s*\{[^}]*padding-left:\s*var\(--app-nav-width\)/s);
  assert.match(indexStyles, /@media \(max-width:\s*1180px\)[\s\S]*?body\.index-navigation-body\s*\{[^}]*padding-bottom:\s*calc\(var\(--app-nav-height\)/s);
  assert.match(shellStyles, /\.app-navigation-item\.is-active\s*\{[^}]*background:\s*transparent/s);
  assert.match(shellStyles, /\.app-navigation-item\.is-active i\s*\{[^}]*font-weight:\s*900/s);
  assert.match(shellStyles, /\.app-navigation-item:hover,[\s\S]*?background:\s*rgba\(17, 17, 17, 0\.06\)/);
  assert.match(shellStyles, /#footerRoot\s*\{[^}]*margin-top:\s*auto/s);
  assert.match(shellStyles, /\.app-shell-container\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*1080px/s);
  assert.match(shellStyles, /\.route-status\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;/s);
  assert.match(shellStyles, /\.route-status\s*\{[^}]*background:\s*#fff;/s);
  assert.match(shellStyles, /html\.initial-group-route-loading \.app-shell-container\s*\{[^}]*visibility:\s*hidden;/s);
  assert.match(shellStyles, /html\.initial-group-route-loading \.route-status\[hidden\]\s*\{[^}]*display:\s*flex;/s);
  assert.doesNotMatch(shellStyles, /\.route-status\s*\{[^}]*backdrop-filter:/s);
  assert.match(shellStyles, /\.app-navigation\s*\{[^}]*z-index:\s*9000/s);
  assert.match(shellStyles, /\.route-status\s*\{[^}]*z-index:\s*8500/s);
  assert.match(shellStyles, /\.tab-view\.visible\s*\{[^}]*tab-view-enter/s);
  assert.match(shellStyles, /--app-nav-height:\s*128px/);
  assert.match(shellStyles, /@media \(max-width:\s*1180px\)[\s\S]*?\.app-navigation-item\s*\{[^}]*min-height:\s*112px;[^}]*gap:\s*9px;[^}]*font-size:\s*23px;/s);
  assert.match(shellStyles, /@media \(max-width:\s*1180px\)[\s\S]*?\.app-navigation-item i\s*\{[^}]*font-size:\s*52px;/s);
  assert.match(shellStyles, /body\.app-shell-body \.cookie-consent-banner\s*\{[^}]*right:\s*auto;[^}]*bottom:\s*calc\(var\(--app-nav-height\)[^}]*left:\s*18px;[^}]*margin-inline:\s*0;/s);
});

test('asset manifesti shell ve sekme paketlerini ayrı tutar', () => {
  const manifest = JSON.parse(readPublic('assets-manifest.json'));
  [
    'shell.min.css', 'shell.min.js',
    'group-common.min.css', 'group-common.min.js',
    'okumalar.min.css', 'okumalar.min.js',
    'statistics.min.css', 'statistics.min.js',
    'videos.min.css', 'videos.min.js',
    'tefekkur.min.css', 'tefekkur.min.js',
    'articles.min.css', 'articles.min.js'
  ].forEach(fileName => {
    assert.match(manifest[fileName], new RegExp(`^${fileName.replaceAll('.', '\\.')}\\?v=[a-f0-9]{12}$`));
  });
});

test('Okumalar haftalık ve analiz bileşenlerini birleştirir, Tesbihat boş başlar', () => {
  const okumalarFragment = readPublic('fragments/okumalar.html');
  const tesbihat = readPublic('fragments/tesbihat.html');
  const groupCommon = readPublic('fragments/group-common.html');
  const routes = readPublic('app/route-config.js');

  assert.match(groupCommon, /id="secretAdminLogin"/);
  assert.doesNotMatch(groupCommon, /navigationAuthority|group-authority-badge/);

  assert.match(okumalarFragment, /class="tracker-table-shell"/);
  assert.match(okumalarFragment, /Haftalık İstatistikler[\s\S]*?id="readingEditModeBar"/);
  assert.match(okumalarFragment, /id="readingEditModeBar" class="reading-edit-mode-bar" hidden/);
  assert.match(okumalarFragment, /class="reading-message-panels"/);
  assert.match(okumalarFragment, /class="main-area"/);
  assert.match(okumalarFragment, /class="settings-section/);
  assert.doesNotMatch(okumalarFragment, /Günün Vecizeleri|home-tefekkur-window|quote-section-image/);
  assert.match(routes, /fragment:\s*'\/fragments\/okumalar\.html'/);

  assert.match(groupCommon, /class="league-info-bar"[\s\S]*?id="authenticatedUserAreas"/);
  assert.doesNotMatch(okumalarFragment, /class="league-info-bar"/);

  assert.match(okumalarFragment, /class="user-cards-section"/);
  assert.match(okumalarFragment, /class="user-cards-container"/);
  assert.match(okumalarFragment, /class="monthly-calendar-section"/);
  assert.match(okumalarFragment, /class="longest-series-section"/);
  assert.match(okumalarFragment, /class="stats-section"/);
  assert.match(okumalarFragment, /class="monthly-calendar-section"[\s\S]*?class="stats-section"[\s\S]*?class="longest-series-section"[\s\S]*?class="user-cards-section"/);
  assert.doesNotMatch(okumalarFragment, /user-cards-message-panels/);
  const orderedRouteMarkup = okumalarFragment;
  const orderedSections = [
    'tracker-table-shell',
    'monthly-calendar-section',
    'stats-section',
    'longest-series-section',
    'user-cards-section',
    'main-area'
  ].map(className => orderedRouteMarkup.indexOf(`class="${className}`));
  assert.ok(orderedSections.every((position, index) => position >= 0 && (index === 0 || position > orderedSections[index - 1])));
  assert.doesNotMatch(tesbihat, /tracker-table-shell|user-cards-section|main-area|monthly-calendar-section|stats-section/);
  assert.match(tesbihat, /Ortak footer shell tarafından gösterilir/);
  assert.doesNotMatch(groupCommon, /readingEditModeBar/);
  assert.match(readClient('features/readings/reading-edit-mode.js'), /modeBar\.hidden = true/);
  assert.match(readClient('features/readings/reading-edit-mode.js'), /modeBar\.hidden = false/);
  assert.doesNotMatch(
    readClient('features/readings/analytics/user-cards.js'),
    /league-promotion-message|reading-streak-message|weak-link-message|everyone-read-message/
  );
  const messagePanels = readClient('features/readings/reading-message-panels.js');
  assert.match(messagePanels, /renderReadingMessagePanels/);
  assert.match(messagePanels, /window\.ROTAKIP_LEAGUES/);
  assert.match(messagePanels, /confetti-overlay/);
  assert.match(messagePanels, /reading-streak-message/);
  assert.match(readClient('features/readings/reading-message-panels.css'), /kurdele\.webp/);
  assert.match(readClient('features/readings/reading-message-panels.css'), /dugum\.webp/);
  assert.doesNotMatch(readClient('features/readings/analytics/user-cards.css'), /league-promotion-message|weak-link-message/);
});

test('global fragmentler grup içeriği taşımaz', () => {
  const expectations = [
    ['fragments/tesbihat.html', 'Tesbihat içeriği'],
    ['fragments/videos.html', 'class="videos"'],
    ['fragments/tefekkur.html', 'class="quote"'],
    ['fragments/articles.html', 'class="articles"']
  ];
  expectations.forEach(([file, marker]) => {
    const content = readPublic(file);
    assert.match(content, new RegExp(marker));
    assert.doesNotMatch(content, /tracker-table-shell|user-cards-section|main-area/);
    assert.doesNotMatch(content, /scroll-fade-in/);
  });

  const tefekkur = readPublic('fragments/tefekkur.html');
  assert.match(tefekkur, /class="quote-grid-container"/);
  assert.equal((tefekkur.match(/class="quote-section is-loading"/g) || []).length, 4);
  assert.equal((tefekkur.match(/class="quote-loading-placeholder"/g) || []).length, 4);
  assert.doesNotMatch(tefekkur, /Allah yolunda sevdiğiniz|Sözlerin en doğrusu|Hangi şeye dikkat etsen/);
  assert.match(tefekkur, /class="home-tefekkur-window"/);
  assert.match(tefekkur, /Günün Vecizeleri/);
  assert.equal((tefekkur.match(/class="quote-section-image"/g) || []).length, 2);
  assert.match(tefekkur, /src="\/quotes\/bir_gorsel1\.jpg"[^>]*data-image-name="bir_gorsel1\.jpg"/);
  assert.match(tefekkur, /src="\/quotes\/bir_gorsel2\.jpg"[^>]*data-image-name="bir_gorsel2\.jpg"/);
  assert.match(readClient('features/tefekkur/quote.css'), /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(readClient('features/tefekkur/quote.css'), /\.quote-loading-line\s*\{[^}]*quote-loading-shimmer/s);
  assert.match(readClient('features/tefekkur/quote.js'), /setTefekkurTextLoading[\s\S]*?showTefekkurText[\s\S]*?fetchTefekkurText/);
  assert.doesNotMatch(readClient('features/tefekkur/quote.js'), /fetchRandomQuoteImage|refreshQuoteImage|quoteImage/);
  assert.doesNotMatch(readClient('features/tefekkur/home-tefekkur.css'), /is-loading[\s\S]*?opacity/);
  assert.match(readClient('features/tefekkur/home-tefekkur.css'), /\.home-tefekkur-images\s*\{[^}]*width:\s*min\(calc\(100% - 40px\),\s*900px\)/s);
  assert.match(readClient('features/tefekkur/home-tefekkur.js'), /const preloadImage = new Image\(\)/);
  assert.match(readClient('features/tefekkur/quote.js'), /window\.initializeHomeTefekkurWindow/);

  const articles = readPublic('fragments/articles.html');
  assert.deepEqual(
    Array.from(articles.matchAll(/data-category="([^"]+)"/g), match => match[1]),
    [
      'all',
      'Think It',
      'Kader',
      "Allah'ın Varlığının Delilleri",
      'Sen Kimsin',
      "İslam'da Adalet",
      'Hadisler',
      "Ahiret'in Varlığının Delilleri",
      'Kâinat Rehberi',
      'Gayeli ve Planlı Yaratılış',
      'Temel Sorgulama',
      'Evrim'
    ]
  );
  assert.doesNotMatch(readClient('features/articles/articles.js'), /setupCategories|data\.categories/);
  assert.equal((articles.match(/class="article-image article-loading-image"/g) || []).length, 4);
  assert.match(articles, /article-loading-image[\s\S]*?article-loading-title[\s\S]*?article-loading-text/);
  assert.match(readClient('features/articles/articles.js'), /loadingCard\.repeat\(4\)/);
  assert.doesNotMatch(readClient('features/articles/articles.js'), /article-loading-spinner/);
  assert.match(readClient('features/articles/articles.css'), /\.article-loading-image\s*\{[^}]*height:\s*175px;[^}]*article-loading/s);
});

test('global sekmeler ilk geçişten önce içerikleriyle birlikte arka planda hazırlanır', () => {
  const router = readPublic('app/shell-router.js');
  const articles = readClient('features/articles/articles.js');
  assert.match(router, /const backgroundViewRoot = document\.createElement\('div'\)/);
  assert.match(router, /function warmGlobalTab\(route\)[\s\S]*?backgroundViewRoot\.appendChild\(view\)[\s\S]*?await initGlobalTab\(route\)[\s\S]*?lifecycleCache\.set\(view, lifecycle\)/);
  assert.match(router, /if \(!target\.requiresGroup\)[\s\S]*?warmGlobalTab\(target\)/);
  assert.match(router, /if \(!route\.requiresGroup && !isInitialNavigation && !hasReadyCachedView\(route\)\)[\s\S]*?await warmGlobalTab\(route\)/);
  assert.match(router, /const isFirstWarmActivation = warmedViews\.delete\(activeView\)/);
  assert.match(articles, /this\.ready = this\.init\(\)/);
  assert.match(articles, /async init\(\)[\s\S]*?await window\.articlesManager\.ready/);
});

test('Videolar doğrudan yenilendiğinde veri ve kart görünürlüğü tamamlanır', () => {
  const videos = readClient('features/videos/videos.js');
  assert.match(videos, /return showRandomVideos\(\)/);
  assert.doesNotMatch(videos, /scroll-fade-in|observeScrollFadeIn/);
});

test('Videolar sekmesindeki yeni rastgele içerik sekme arka plandayken hazırlanır', () => {
  const videos = readClient('features/videos/videos.js');
  assert.match(videos, /function resumeVideos\(\)/);
  assert.match(videos, /activeButton\?\.id === 'randomBtn'[\s\S]*?showPreparedRandomVideos\(\)[\s\S]*?Promise\.resolve\(\)/);
  assert.match(videos, /function prepareRandomVideos\(\)[\s\S]*?preloadVideoThumbnails\(videos\)/);
  assert.match(videos, /destroy\(\)[\s\S]*?activeButton\?\.id === 'randomBtn'[\s\S]*?startRandomVideoPreparation\(\)/);
  assert.match(videos, /prepareBeforeReveal:\s*true/);
  assert.match(videos, /videoRequestSequence/);
  assert.match(videos, /resume: resumeVideos/);
});

test('Tefekkür yeni metinleri arka planda hazırlayıp birlikte gösterir', () => {
  const tefekkur = readClient('features/tefekkur/quote.js');
  assert.match(tefekkur, /function prepareTefekkurContent\(\)[\s\S]*?Promise\.all\(tefekkurContentItems\.map/);
  assert.match(tefekkur, /async function resumeTefekkurTab\(\)[\s\S]*?startTefekkurContentPreparation\(\)[\s\S]*?initializeHomeTefekkurWindow[\s\S]*?Promise\.all\(\[preparation, imagePreparation\]\)[\s\S]*?content\.forEach/);
  assert.match(tefekkur, /prepareBeforeReveal:\s*true/);
  assert.match(tefekkur, /resume:\s*resumeTefekkurTab/);
  assert.match(tefekkur, /destroy\(\)[\s\S]*?startTefekkurContentPreparation\(\)/);
});

test('bağımsız global sekmeler yukarı kayma efekti kullanmaz', () => {
  const shellStyles = readClient('shell/shell.css');
  assert.match(shellStyles, /\.tab-view-videos[\s\S]*?\.tab-view-articles\.visible[\s\S]*?animation:\s*none/);
  assert.doesNotMatch(readClient('features/articles/articles.js'), /renderArticlesWithTransition|translateY\(20px\)/);
});

test('Okumalar tüm grup bileşenlerini başlatır, Tesbihat yükleme animasyonu kullanmaz', () => {
  const router = readPublic('app/shell-router.js');
  const commonStyles = readClient('shell/base.css');
  const userCardStyles = readClient('features/readings/analytics/user-cards.css');
  const messagePanelStyles = readClient('features/readings/reading-message-panels.css');
  const okumalarInit = router.match(/async function initOkumalarTab\(\)[\s\S]*?(?=async function initGlobalTab)/)?.[0] || '';
  assert.match(router, /function revealRouteContent/);
  assert.match(router, /classList\.contains\('initial-group-route-loading'\)\) showStatus\(\)/);
  assert.match(router, /function routeUsesFullScreenLoader\(route\)[\s\S]*?return route\.name === 'okumalar'/);
  assert.doesNotMatch(router, /route\.name === 'tesbihat'[\s\S]*?showStatus/);
  assert.doesNotMatch(router, /function isGroupReadingTab|switchingBetweenGroupTabs/);
  assert.match(router, /if \(!revealAfterLifecycle\) await revealRouteContent\(activeView, true\);/);
  assert.match(router, /PLACEHOLDER_DELAY_MS\s*=\s*200/);
  assert.match(router, /PLACEHOLDER_MIN_VISIBLE_MS\s*=\s*450/);
  assert.match(router, /function hasReadyCachedView\(route\)[\s\S]*?lifecycleCache\.has\(view\)/);
  assert.match(router, /const cachedView = viewCache\.get\(cacheKey\)[\s\S]*?const view = await cachedView[\s\S]*?viewCache\.set\(cacheKey, view\)/);
  assert.match(router, /if \(revealAfterLifecycle\) await revealRouteContent\(activeView\)/);
  assert.doesNotMatch(router, /CACHED_ROUTE_STATUS_DELAY_MS|scheduleStatus|routeStatusShowTimer/);
  assert.match(router, /window\.waitForRoutePlaceholder\s*=\s*async function/);
  assert.match(router, /prepareRoutePlaceholders\(route, activeView, isInitialNavigation\)/);
  assert.match(router, /activeLifecycle\?\.prepareBeforeReveal === true[\s\S]*?await activeLifecycle\.resume\(\)[\s\S]*?if \(!revealAfterLifecycle\) await revealRouteContent/);
  assert.doesNotMatch(router, /querySelectorAll\(['"]\.scroll-fade-in/);
  assert.match(commonStyles, /\.scroll-fade-in\s*\{[^}]*opacity:\s*1;[^}]*transform:\s*none;[^}]*transition:\s*none;/s);
  assert.match(userCardStyles, /\.user-card\s*\{[^}]*transform:\s*none;[^}]*opacity:\s*1;/s);
  assert.match(messagePanelStyles, /\.league-promotion-message,[\s\S]*?opacity:\s*1;[\s\S]*?transform:\s*none;/);
  assert.doesNotMatch(readClient('features/readings/analytics/user-cards.js'), /userCardScrollObserver|cardScrollObserver/);
  assert.match(readClient('features/readings/analytics/stats-section.js'), /readingStatsVisibilityObserver/);
  assert.match(readClient('features/readings/analytics/stats-section.js'), /animateReadingStatsWhenVisible/);
  assert.match(readClient('features/readings/analytics/longest-series.js'), /IntersectionObserver|barsToAnimate|initialBarWidth/);
  assert.doesNotMatch(okumalarInit, /window\.initializeHomeTefekkurWindow/);
  assert.match(okumalarInit, /resume\(\)[\s\S]*?window\.renderReadingMessagePanels/);
  assert.match(okumalarInit, /window\.loadUserCards/);
  assert.match(okumalarInit, /window\.loadMonthlyCalendar/);
  assert.match(okumalarInit, /window\.renderLongestSeries/);
  assert.match(okumalarInit, /window\.loadReadingStats/);
  assert.match(okumalarInit, /monthShareModal/);
  assert.match(router, /tesbihat:\s*\{ scripts:\s*\[\], styles:\s*\[\] \}/);
  assert.match(readClient('shell/shell.css'), /\.tab-view-tesbihat[\s\S]*?\.tab-view-tesbihat\.visible[\s\S]*?animation:\s*none/);
  assert.match(readClient('features/readings/tracker-table.js'), /schedulePostToggleUiRefresh[\s\S]*?window\.renderReadingMessagePanels/);
  const statisticsFragment = readPublic('fragments/okumalar.html');
  assert.match(statisticsFragment, /En\s+Uzun\s+Okuma\s+Serisi/i);
  assert.match(statisticsFragment, /Okuma\s+İstatistikleri/i);
  assert.match(readClient('features/readings/analytics/monthly.js'), /window\.loadMonthlyCalendar = function/);
  assert.doesNotMatch(readClient('features/readings/reading-journey.js'), /window\.LEAGUES/);
  assert.doesNotMatch(router, /İçerik yükleniyor|Grup erişimi doğrulanıyor|Bölüm hazırlanıyor/);
  assert.doesNotMatch(readPublic('app-shell.html'), /<span>İçerik yükleniyor/);
  assert.match(router, /refreshTrackerTableLayout/);
  assert.match(readClient('features/readings/tracker-table.js'), /window\.refreshTrackerTableLayout/);
  assert.doesNotMatch(readPublic('fragments/okumalar.html'), /longest-series-loading|stats-loading/);
  assert.doesNotMatch(readClient('features/readings/analytics/longest-series.js'), /waitForRoutePlaceholder|longest-series-loading/);
  assert.doesNotMatch(readClient('features/readings/analytics/stats-section.js'), /waitForRoutePlaceholder|stats-loading/);
  assert.match(readClient('features/videos/videos.js'), /await window\.waitForRoutePlaceholder\(videosContainer\)/);
  assert.match(readClient('features/articles/articles.js'), /await window\.waitForRoutePlaceholder\(container\)/);
  assert.match(readClient('features/tefekkur/quote.js'), /hasExistingText[\s\S]*?!hasExistingText[\s\S]*?setTefekkurTextLoading/);
  assert.doesNotMatch(readClient('shell/shell.css'), /tab-view[\s\S]*?scale\(0\.995\)/);
});

test('her route birleşiminde DOM kimlikleri benzersizdir', () => {
  const shared = ['app-shell.html', 'fragments/footer.html'];
  [
    [...shared, 'fragments/common-overlays.html', 'fragments/group-common.html', 'fragments/okumalar.html'],
    [...shared, 'fragments/tesbihat.html'],
    [...shared, 'fragments/videos.html'],
    [...shared, 'fragments/tefekkur.html'],
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

test('Okumalardaki avatar pencereleri gizli ve kartlar iki sütunludur', () => {
  const commonStyles = readClient('features/groups/admin-modal.css');
  const cardStyles = readClient('features/readings/analytics/user-cards.css');
  assert.match(commonStyles, /\.ready-images-modal:not\(\.show\)\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(cardStyles, /\.user-card\s*\{[^}]*width:\s*min\(430px,\s*calc\(\(100% - 30px\) \/ 2\)\)/s);
  assert.match(cardStyles, /@media screen and \(max-width:\s*1023px\)[\s\S]*?\.user-card\s*\{[^}]*width:\s*min\(400px,\s*100%\)/s);
});

test('Okuma yolculuğu Okumalar sekmesinde oturuma bağlıdır', () => {
  const commonStyles = readClient('features/groups/admin-modal.css');
  const trackerStyles = readClient('features/readings/tracker-table.css');
  const journey = readClient('features/readings/reading-journey.js');
  const router = readPublic('app/shell-router.js');
  assert.match(commonStyles, /\.authenticated-user-areas\s*\{[^}]*visibility:\s*hidden/s);
  assert.doesNotMatch(trackerStyles, /\.authenticated-user-areas\s*\{/);
  assert.match(journey, /window\.syncAuthenticatedUserAreas/);
  assert.match(router, /syncAuthenticatedUserAreas\(context\.isAuthenticated === true\)/);
});

test('route çözücü kanonik grup ve global adresleri ayırır', async () => {
  const moduleUrl = pathToFileURL(path.join(publicDir, 'app', 'route-config.js')).href;
  const routes = await import(moduleUrl);
  assert.deepEqual(routes.resolveRoute('/grup/catikati23/'), {
    ...routes.ROUTES.okumalar,
    groupId: 'catikati23'
  });
  assert.equal(routes.groupRoutePath('catikati23'), '/grup/catikati23/');
  assert.equal(routes.groupRoutePath(null), '/gruplar');
  assert.equal(routes.resolveRoute('/'), null);
  assert.equal(routes.resolveRoute('/tesbihat').name, 'tesbihat');
  assert.equal(routes.resolveRoute('/tesbihat').requiresGroup, false);
  assert.equal(routes.resolveRoute('/videolar').requiresGroup, false);
  assert.equal(routes.resolveRoute('/tefekkur').name, 'tefekkur');
  assert.equal(routes.resolveRoute('/makaleler').name, 'articles');
  assert.equal(routes.resolveRoute('/bilinmeyen'), null);
});

test('sayfa başlığı grup rotasında grup adını, global rotalarda sekme adını kullanır', () => {
  const router = readPublic('app/shell-router.js');
  assert.match(router, /document\.title = groupSuffix \? `RoTaKip\$\{groupSuffix\}` : `RoTaKip · \$\{route\.title\}`/);
});

test('sunucu Okumalar ve bağımsız sekme adreslerini sunar', () => {
  const server = fs.readFileSync(path.join(projectRoot, 'server.js'), 'utf8');
  assert.match(server, /app\.get\('\/',[\s\S]*?res\.redirect\(302, '\/tesbihat'\)/);
  assert.match(server, /app\.get\('\/gruplar',[\s\S]*?sendHtmlFile\(res, 'gruplar\.html'\)/);
  assert.match(server, /app\.get\('\/grup\/:groupId\/', sendGroupShell\)/);
  assert.doesNotMatch(server, /app\.get\('\/grup\/:groupId\/okumalar'/);
  assert.match(server, /app\.get\(\['\/tesbihat', '\/videolar', '\/tefekkur', '\/makaleler'\]/);
  assert.doesNotMatch(server, /sendHtmlFile\(res, '(?:index|groups)\.html'\)/);
  assert.doesNotMatch(server, /app\.get\('\/:groupId'/);
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
