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
  assert.match(shell, /name="description" content="[^"]*okuma alışkanlıklarınızı ve grup ilerlemenizi takip edin[^"]*"/);
  assert.doesNotMatch(shell, /Namaz vakitleri ve tesbihat içeriklerine/);
  assert.match(shell, /id="appNavigation"/);
  assert.match(index, /id="appNavigation"/);
  assert.equal((shell.match(/data-route=/g) || []).length, 5);
  assert.equal((index.match(/data-route=/g) || []).length, 5);
  assert.doesNotMatch(shell, /app-navigation-brand/);
  assert.match(shell, /data-route="okumalar"[\s\S]*?fa-regular fa-compass[\s\S]*?<span>Okumalar<\/span>/);
  assert.match(shell, /data-route="tesbihat" href="\/tesbihat"[\s\S]*?<span>Tesbihat<\/span>/);
  assert.match(index, /data-route="okumalar"[\s\S]*?class="app-navigation-item is-active"|class="app-navigation-item is-active"[\s\S]*?data-route="okumalar"/);
  assert.match(index, /data-route="tesbihat" href="\/tesbihat"/);
  assert.match(index, /data-route="okumalar" href="\/gruplar"/);
  assert.match(index, /type="module" src="\/app\/group-directory-navigation\.js"/);
  assert.match(shell, /data-route="tefekkur" href="\/tefekkur"[\s\S]*?<span>Tefekkür<\/span>/);
  assert.match(shell, /data-route="tesbihat"[\s\S]*?data-route="tefekkur"[\s\S]*?data-route="videos"[\s\S]*?data-route="articles"[\s\S]*?data-route="okumalar"/);
  assert.match(index, /data-route="tesbihat"[\s\S]*?data-route="tefekkur"[\s\S]*?data-route="videos"[\s\S]*?data-route="articles"[\s\S]*?data-route="okumalar"/);
  assert.match(shell, /id="tabContent"/);
  assert.match(shell, /id="footerRoot" hidden/);
  assert.doesNotMatch(shell, /id="groupCommonRoot"/);
  assert.match(shell, /id="scrollToTopBtn"/);
  assert.match(shell, /id="routeStatus"[^>]*hidden[\s\S]*?route-loader-star[\s\S]*?>Ro<[\s\S]*?>Ta<[\s\S]*?>Kip</);
  assert.doesNotMatch(shell, /initial-group-route-loading/);
  assert.match(index, /<h1 class="header-title">Okuma Grupları<\/h1>/);
  assert.match(index, /Kitap okuma hedeflerinizi belirleyin ve ilerlemenizi takip edin/);
  assert.doesNotMatch(shell, /document\.documentElement\.classList\.add\('initial-group-route-loading'\)/);
  assert.match(shell, /shell\.min\.css\?v=/);
  assert.doesNotMatch(shell, /groups\.min\.(?:css|js)/);
  assert.doesNotMatch(shell, /class="tracker-table-shell"/);
  assert.doesNotMatch(shell, /class="videos"/);
  assert.match(indexStyles, /body\.index-navigation-body\s*\{[^}]*padding-left:\s*var\(--app-nav-width\)/s);
  assert.match(indexStyles, /@media \(max-width:\s*1180px\)[\s\S]*?body\.index-navigation-body\s*\{[^}]*padding-bottom:\s*calc\(var\(--app-nav-height\)/s);
  assert.match(shellStyles, /\.app-navigation-item\.is-active\s*\{[^}]*background:\s*transparent/s);
  assert.match(shellStyles, /\.app-navigation-item\.is-active:hover,[\s\S]*?background:\s*rgba\(17, 17, 17, 0\.06\)/);
  assert.match(shellStyles, /\.app-navigation-item\.is-active i\s*\{[^}]*font-weight:\s*900/s);
  assert.match(shellStyles, /\.app-navigation-item i\s*\{[^}]*color:\s*#111/s);
  assert.match(shellStyles, /\.app-navigation-item:hover,[\s\S]*?background:\s*rgba\(17, 17, 17, 0\.06\)/);
  assert.match(shellStyles, /#footerRoot\s*\{[^}]*margin-top:\s*auto/s);
  assert.match(shellStyles, /\.app-shell-container\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*1080px/s);
  assert.match(shellStyles, /\.route-status\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;/s);
  assert.match(shellStyles, /\.route-status\s*\{[^}]*background:\s*#fff;/s);
  assert.doesNotMatch(shellStyles, /html\.initial-group-route-loading/);
  assert.doesNotMatch(shellStyles, /\.route-status\s*\{[^}]*backdrop-filter:/s);
  assert.match(shellStyles, /\.app-navigation\s*\{[^}]*z-index:\s*9000/s);
  assert.match(shellStyles, /\.route-status\s*\{[^}]*z-index:\s*8500/s);
  assert.match(shellStyles, /\.tab-view\.visible\s*\{[^}]*tab-view-enter/s);
  assert.match(shellStyles, /--app-nav-height:\s*128px/);
  assert.match(shellStyles, /@media \(max-width:\s*1180px\)[\s\S]*?\.app-navigation-item\s*\{[^}]*min-height:\s*112px;[^}]*gap:\s*9px;[^}]*font-size:\s*23px;/s);
  assert.match(shellStyles, /@media \(max-width:\s*1180px\)[\s\S]*?\.app-navigation-item i\s*\{[^}]*font-size:\s*52px;/s);
  assert.match(shellStyles, /body\.app-shell-body \.cookie-consent-banner\s*\{[^}]*right:\s*auto;[^}]*bottom:\s*calc\(var\(--app-nav-height\)[^}]*left:\s*18px;[^}]*margin-inline:\s*0;/s);
});

test('Okuma mesaj paneli stilleri kendi bileşen dosyasında kalır', () => {
  const shellStyles = readClient('shell/shell.css');
  const panelStyles = readClient('features/readings/reading-message-panels.css');

  assert.doesNotMatch(shellStyles, /\.reading-message-panels\b/);
  assert.match(panelStyles, /\.reading-message-panels\s*\{[^}]*margin:\s*10px 0;/s);
  assert.match(panelStyles, /\.reading-message-panels-content\s*\{[^}]*padding:\s*20px;[^}]*box-sizing:\s*border-box;/s);
  assert.match(panelStyles, /\.reading-message-panels:not\(:has\(> \.reading-message-panels-content > \*\)\)\s*\{[^}]*display:\s*none;/s);
});

test('uygulama kabuğundaki yukarı çık butonunu yalnız shell stillendirir', () => {
  const shellStyles = readClient('shell/shell.css');
  const groupCommonStyles = readClient('features/groups/admin-modal.css');

  assert.match(shellStyles, /\.scroll-to-top-btn\s*\{/);
  assert.doesNotMatch(groupCommonStyles, /\.scroll-to-top-btn\b/);
});

test('son görüntülenen grup kalıcı tutulur ve Okumalar bağlantısında kullanılır', () => {
  const navigation = readPublic('app/navigation.js');
  const router = readPublic('app/shell-router.js');
  const directoryNavigation = readPublic('app/group-directory-navigation.js');

  assert.match(navigation, /localStorage\.setItem\(key, value\)/);
  assert.match(navigation, /localStorage\.getItem\(key\)/);
  assert.doesNotMatch(navigation, /sessionStorage/);
  assert.doesNotMatch(navigation, /if \(route\.groupId\) rememberGroup/);
  assert.match(router, /if \(!groupContext\.canRead\)[\s\S]*?return;[\s\S]*?rememberGroup\(route\.groupId\)/);
  assert.match(directoryNavigation, /getRememberedGroup\(\)/);
  assert.match(directoryNavigation, /groupRoutePath\(getRememberedGroup\(\)\)/);
});

test('asset manifesti shell ve sekme paketlerini ayrı tutar', () => {
  const manifest = JSON.parse(readPublic('assets-manifest.json'));
  const buildAssets = fs.readFileSync(path.join(projectRoot, 'scripts', 'build-assets.js'), 'utf8');
  [
    'shell.min.css', 'shell.min.js',
    'group-common.min.css', 'group-common.min.js',
    'group-ui.min.js',
    'okumalar.min.css', 'okumalar.min.js',
    'management.min.css', 'management.min.js',
    'statistics.min.css', 'statistics.min.js',
    'videos.min.css', 'videos.min.js',
    'tefekkur.min.css', 'tefekkur.min.js',
    'articles.min.css', 'articles.min.js'
  ].forEach(fileName => {
    assert.match(manifest[fileName], new RegExp(`^${fileName.replaceAll('.', '\\.')}\\?v=[a-f0-9]{12}$`));
  });
  const groupCommonStart = buildAssets.indexOf("'group-common': {");
  const groupUiStart = buildAssets.indexOf("'group-ui': {");
  const okumalarStart = buildAssets.indexOf('  okumalar: {');
  const managementStart = buildAssets.indexOf('  management: {');
  const statisticsStart = buildAssets.indexOf('  statistics: {');
  const groupCommonBundle = buildAssets.slice(groupCommonStart, groupUiStart);
  const groupUiBundle = buildAssets.slice(groupUiStart, okumalarStart);
  const okumalarBundle = buildAssets.slice(okumalarStart, managementStart);
  const managementBundle = buildAssets.slice(managementStart, statisticsStart);
  assert.ok(groupCommonStart >= 0 && groupUiStart > groupCommonStart && okumalarStart > groupUiStart && managementStart > okumalarStart && statisticsStart > managementStart);
  assert.doesNotMatch(groupCommonBundle, /reading-journey|daily-gift/);
  assert.doesNotMatch(groupCommonBundle, /admin-modal\.js/);
  assert.match(groupUiBundle, /admin-modal\.js/);
  assert.match(okumalarBundle, /reading-journey\.css/);
  assert.match(okumalarBundle, /reading-journey\.js/);
  assert.match(okumalarBundle, /daily-gift\.css/);
  assert.match(okumalarBundle, /daily-gift\.js/);
  assert.doesNotMatch(okumalarBundle, /group-management\.js/);
  assert.doesNotMatch(okumalarBundle, /group-management\.css/);
  assert.match(managementBundle, /group-management\.js/);
  assert.match(managementBundle, /group-management\.css/);
});

test('Okumalar haftalık ve analiz bileşenlerini birleştirir, Tesbihat boş başlar', () => {
  const groupHeaderFragment = readPublic('fragments/group-header.html');
  const okumalarFragment = readPublic('fragments/okumalar.html');
  const tesbihat = readPublic('fragments/tesbihat.html');
  const commonOverlays = readPublic('fragments/common-overlays.html');
  const routes = readPublic('app/route-config.js');

  assert.match(groupHeaderFragment, /id="secretAdminLogin"[\s\S]*?id="profileButton"/);
  assert.doesNotMatch(okumalarFragment, /id="secretAdminLogin"|id="profileButton"/);
  assert.match(commonOverlays, /id="groupsAuthLoginModal"/);
  assert.doesNotMatch(commonOverlays, /class="league-info-bar"|id="authenticatedUserAreas"|id="dailyGiftModal"|id="dailyTasksModal"/);

  assert.match(okumalarFragment, /class="tracker-table-shell"/);
  assert.match(okumalarFragment, /Haftalık İstatistikler[\s\S]*?id="readingEditModeBar"/);
  assert.match(okumalarFragment, /id="readingEditModeBar" class="reading-edit-mode-bar" aria-hidden="true"[\s\S]*?class="reading-edit-mode-bar-content"/);
  assert.match(okumalarFragment, /class="reading-message-panels"/);
  assert.match(okumalarFragment, /class="main-area"/);
  assert.match(okumalarFragment, /class="settings-section/);
  assert.doesNotMatch(okumalarFragment, /Günün Vecizeleri|home-tefekkur-window|quote-section-image/);
  assert.match(routes, /fragment:\s*\['\/fragments\/group-header\.html', '\/fragments\/okumalar\.html'\]/);

  assert.match(okumalarFragment, /class="league-info-section"[\s\S]*?id="authenticatedUserAreas"[\s\S]*?class="league-info-bar"[\s\S]*?<\/section>/);
  assert.match(okumalarFragment, /id="dailyGiftModal"[\s\S]*?id="dailyTasksModal"/);

  assert.match(okumalarFragment, /class="user-cards-section"/);
  assert.match(okumalarFragment, /class="user-cards-container"/);
  assert.match(okumalarFragment, /class="monthly-calendar-section"/);
  assert.match(okumalarFragment, /class="longest-series-section"/);
  assert.match(okumalarFragment, /class="stats-section"/);
  assert.doesNotMatch(okumalarFragment, /id="readingMessagesPlaceholder"|reading-message-placeholder|message-placeholder-/);
  assert.match(okumalarFragment, /id="monthlyCalendarPlaceholder"/);
  assert.match(okumalarFragment, /id="readingStatsPlaceholder"/);
  assert.match(okumalarFragment, /id="longestSeriesPlaceholder"/);
  assert.match(okumalarFragment, /id="userCardsPlaceholder"/);
  assert.match(okumalarFragment, /id="leagueInfoPlaceholder"[\s\S]*?class="league-placeholder-items"/);
  assert.equal((okumalarFragment.match(/class="league-placeholder-item"/g) || []).length, 10);
  assert.equal((okumalarFragment.match(/class="longest-placeholder-row"/g) || []).length, 4);
  assert.equal((okumalarFragment.match(/class="chart-placeholder-row chart-placeholder-row-/g) || []).length, 4);
  assert.equal((okumalarFragment.match(/class="reading-placeholder-card"/g) || []).length, 4);
  assert.match(okumalarFragment, /class="tracker-placeholder-week-actions"[\s\S]*?tracker-placeholder-week-label[\s\S]*?tracker-placeholder-share-button/);
  assert.match(okumalarFragment, /id="readingStatsPlaceholder"[\s\S]*?class="chart-placeholder-share"/);
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
  assert.doesNotMatch(commonOverlays, /readingEditModeBar/);
  assert.match(readClient('features/readings/reading-edit-mode.js'), /modeBar\.classList\.add\('show'\)[\s\S]*?aria-hidden', 'false'/);
  assert.match(readClient('features/readings/reading-edit-mode.js'), /modeBar\.classList\.remove\('show'\)[\s\S]*?aria-hidden', 'true'/);
  assert.match(readClient('features/readings/tracker-table.css'), /\.reading-edit-mode-bar\s*\{[^}]*grid-template-rows:\s*0fr;[^}]*transition:\s*grid-template-rows 0\.8s/s);
  assert.match(readClient('features/readings/tracker-table.css'), /\.reading-edit-mode-bar\.show\s*\{[^}]*grid-template-rows:\s*1fr;/s);
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
  assert.match(router, /function prepareGroupTab\(route\)[\s\S]*?resolveGroupContext\(route\.groupId\)[\s\S]*?getView\(route\)[\s\S]*?loadGroupData\(context\)/);
  assert.match(router, /target\.requiresGroup[\s\S]*?getRememberedGroup\(\)[\s\S]*?prepareGroupTab\(\{ \.\.\.target, groupId \}\)/);
  assert.match(router, /function preloadOkumalarAssets\(\)[\s\S]*?OKUMALAR_BACKGROUND_ASSETS[\s\S]*?preloadBundle\(fileName, 'script'\)[\s\S]*?preloadBundle\(fileName, 'style'\)/);
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
  const shellStyles = readClient('shell/shell.css');
  const commonStyles = readClient('shell/base.css');
  const userCardStyles = readClient('features/readings/analytics/user-cards.css');
  const messagePanelStyles = readClient('features/readings/reading-message-panels.css');
  const okumalarInit = router.match(/async function initOkumalarTab\(\)[\s\S]*?(?=async function initGlobalTab)/)?.[0] || '';
  assert.match(router, /function revealRouteContent/);
  assert.match(router, /view\.classList\.add\('visible'\);\s*footerRoot\.hidden = false;/);
  assert.doesNotMatch(router, /classList\.contains\('initial-group-route-loading'\)\) showStatus\(\)/);
  assert.match(router, /function routeUsesFullScreenLoader\(\)\s*\{\s*return false;\s*\}/);
  assert.doesNotMatch(router, /route\.name === 'tesbihat'[\s\S]*?showStatus/);
  assert.doesNotMatch(router, /function isGroupReadingTab|switchingBetweenGroupTabs/);
  assert.match(router, /if \(!revealAfterLifecycle && !activeView\.classList\.contains\('visible'\)\)[\s\S]*?await revealRouteContent\(activeView, true\)/);
  assert.match(router, /PLACEHOLDER_DELAY_MS\s*=\s*200/);
  assert.match(router, /PLACEHOLDER_MIN_VISIBLE_MS\s*=\s*450/);
  assert.match(router, /function hasReadyCachedView\(route\)[\s\S]*?lifecycleCache\.has\(view\)/);
  assert.match(router, /const cachedView = viewCache\.get\(cacheKey\)[\s\S]*?const view = await cachedView[\s\S]*?viewCache\.set\(cacheKey, view\)/);
  assert.match(router, /if \(revealAfterLifecycle\) await revealRouteContent\(activeView\)/);
  assert.doesNotMatch(router, /CACHED_ROUTE_STATUS_DELAY_MS|scheduleStatus|routeStatusShowTimer/);
  assert.match(router, /window\.waitForRoutePlaceholder\s*=\s*async function/);
  assert.match(router, /prepareRoutePlaceholders\(route, activeView, isInitialNavigation\)/);
  assert.match(router, /deferOkumalarResumeReveal[\s\S]*?lifecycleCache\.has\(activeView\)[\s\S]*?!warmedViews\.has\(activeView\)[\s\S]*?if \(!deferOkumalarResumeReveal\) await revealRouteContent/);
  assert.match(router, /if \(resumeBeforeReveal\)[\s\S]*?is-restoring-position[\s\S]*?requestAnimationFrame[\s\S]*?refreshTrackerTableLayout[\s\S]*?classList\.remove\('is-restoring-position'\)/);
  assert.match(readClient('features/readings/tracker-table.css'), /\.tracker-table-layout\.is-restoring-position\s*\{[\s\S]*?visibility:\s*hidden/);
  assert.match(router, /activeLifecycle\?\.prepareBeforeReveal === true[\s\S]*?await activeLifecycle\.resume\(\)[\s\S]*?if \(!revealAfterLifecycle && !activeView\.classList\.contains\('visible'\)\)/);
  assert.match(router, /isReturningToOkumalar[\s\S]*?lifecycleCache\.has\(view\)[\s\S]*?classList\.toggle\('is-resuming', isReturningToOkumalar\)/);
  assert.match(shellStyles, /\.tab-view-okumalar\.is-resuming\.visible[\s\S]*?animation:\s*none[\s\S]*?\.tracker-table-layout[\s\S]*?\.week-navigation[\s\S]*?transition:\s*none !important/);
  assert.doesNotMatch(router, /querySelectorAll\(['"]\.scroll-fade-in/);
  assert.match(commonStyles, /\.scroll-fade-in\s*\{[^}]*opacity:\s*1;[^}]*transform:\s*none;[^}]*transition:\s*none;/s);
  assert.match(userCardStyles, /\.user-card\s*\{[^}]*transform:\s*none;[^}]*opacity:\s*1;/s);
  assert.match(messagePanelStyles, /\.league-promotion-message,[\s\S]*?opacity:\s*1;[\s\S]*?transform:\s*none;/);
  assert.doesNotMatch(readClient('features/readings/analytics/user-cards.js'), /userCardScrollObserver|cardScrollObserver/);
  assert.match(readClient('features/readings/analytics/stats-section.js'), /readingStatsVisibilityObserver/);
  assert.match(readClient('features/readings/analytics/stats-section.js'), /animateReadingStatsWhenVisible/);
  assert.match(readClient('features/readings/analytics/longest-series.js'), /IntersectionObserver|barsToAnimate|initialBarWidth/);
  assert.doesNotMatch(okumalarInit, /window\.initializeHomeTefekkurWindow/);
  assert.match(okumalarInit, /portalOkumalarOverlays\(\)/);
  assert.match(router, /function portalOkumalarOverlays\(\)[\s\S]*?dailyGiftModal[\s\S]*?dailyTasksModal[\s\S]*?overlayRoot\.appendChild\(modal\)/);
  assert.match(okumalarInit, /resume\(\)[\s\S]*?runOkumalarBackgroundWork\(\)/);
  assert.match(okumalarInit, /prepareBeforeReveal:\s*true[\s\S]*?resume\(\)[\s\S]*?refreshTrackerTableLayout/);
  assert.match(okumalarInit, /destroy\(\)[\s\S]*?window\.captureTrackerTableScrollPosition/);
  assert.match(readClient('features/readings/tracker-table.js'), /captureTrackerTableScrollPosition[\s\S]*?timelineSavedScrollLeft = tableArea\.scrollLeft/);
  assert.match(readClient('features/readings/tracker-table.js'), /refreshTrackerTableLayout[\s\S]*?timelineIsRestoringPosition = true[\s\S]*?tableArea\.scrollTo\([\s\S]*?behavior:\s*'auto'[\s\S]*?timelineIsRestoringPosition = false/);
  assert.match(readClient('features/readings/tracker-table.js'), /addEventListener\('scroll'[\s\S]*?timelineIsRestoringPosition\) return/);
  assert.match(router, /function runOkumalarBackgroundWork\(\)[\s\S]*?window\.loadUserCards[\s\S]*?window\.loadMonthlyCalendar[\s\S]*?window\.renderLongestSeries[\s\S]*?window\.loadReadingStats/);
  assert.match(router, /OKUMALAR_BACKGROUND_ASSETS[\s\S]*?statistics:[\s\S]*?management:[\s\S]*?groupUi:/);
  assert.match(router, /loadAssetGroup[\s\S]*?Promise\.allSettled\(\[[\s\S]*?loadBundleStyles/);
  assert.match(router, /function prepareReadingPrimaryContent\(\)[\s\S]*?window\.renderReadingMessagePanels[\s\S]*?window\.initializeReadingJourney\?\.\(\{ reveal: false \}\)/);
  assert.match(router, /function revealReadingPrimaryContent\(isAuthenticated\)[\s\S]*?revealLeagueInfoBar\(\{ animate: false \}\)[\s\S]*?revealTargets[\s\S]*?removeTrackerTablePlaceholder\(\);[\s\S]*?messagePanels\.hidden = false[\s\S]*?requestAnimationFrame[\s\S]*?revealTargets\.forEach\(element => element\.classList\.add\('reading-content-reveal'\)\)[\s\S]*?syncAuthenticatedUserAreas/);
  assert.match(readClient('features/readings/tracker-table.js'), /deferPrimaryReveal[\s\S]*?weekNav\.classList\.add\('visible'\)[\s\S]*?if \(deferPrimaryReveal\) revealTrackerLayout\(\)/);
  assert.match(readClient('features/readings/tracker-table.css'), /\.tracker-table-layout\s*\{[\s\S]*?transform:\s*translateY\(16px\)[\s\S]*?\.week-navigation\s*\{[\s\S]*?transform:\s*translateY\(16px\)/);
  assert.doesNotMatch(router, /function runOkumalarBackgroundWork\(\)[\s\S]*?\['okuma mesajları'/);
  assert.match(router, /Promise\.allSettled\(tasks\.map/);
  assert.match(okumalarInit, /Promise\.all\(\[trackerReady, prepareReadingPrimaryContent\(\)\]\)[\s\S]*?revealReadingPrimaryContent\(isAuthenticated\)[\s\S]*?const readyForPrefetch = runOkumalarBackgroundWork\(\)/);
  assert.match(router, /activeLifecycle\?\.readyForPrefetch[\s\S]*?schedulePrefetch\(route\)/);
  assert.match(okumalarInit, /monthShareModal/);
  assert.match(router, /tesbihat:\s*\{ scripts:\s*\[\], styles:\s*\[\] \}/);
  assert.match(readClient('shell/shell.css'), /\.tab-view-tesbihat[\s\S]*?\.tab-view-tesbihat\.visible[\s\S]*?animation:\s*none/);
  assert.match(readClient('features/readings/tracker-table.js'), /schedulePostToggleUiRefresh[\s\S]*?window\.renderReadingMessagePanels/);
  assert.match(readClient('features/readings/tracker-table.js'), /allTimeAmountsByUser[\s\S]*?seasonAmountsByUser/);
  assert.doesNotMatch(readClient('features/readings/tracker-table.js'), /function calculateStreak\(userStats\)\s*\{\s*const allDates = Object\.keys\(userStats\)\.sort\(\)/);
  const statisticsFragment = readPublic('fragments/okumalar.html');
  assert.match(statisticsFragment, /En\s+Uzun\s+Okuma\s+Serisi/i);
  assert.match(statisticsFragment, /Okuma\s+İstatistikleri/i);
  assert.match(readClient('features/readings/analytics/monthly.js'), /window\.loadMonthlyCalendar = function/);
  assert.doesNotMatch(readClient('features/readings/reading-journey.js'), /window\.LEAGUES/);
  assert.doesNotMatch(router, /İçerik yükleniyor|Grup erişimi doğrulanıyor|Bölüm hazırlanıyor/);
  assert.doesNotMatch(readPublic('app-shell.html'), /<span>İçerik yükleniyor/);
  assert.match(router, /refreshTrackerTableLayout/);
  assert.match(readClient('features/readings/tracker-table.js'), /window\.refreshTrackerTableLayout/);
  assert.match(readPublic('fragments/okumalar.html'), /class="reading-message-panels"[^>]*hidden/);
  assert.match(readClient('features/readings/tracker-table.css'), /\.tracker-table-shell\.is-primary-reveal-pending[\s\S]*?max-height:\s*0[\s\S]*?visibility:\s*hidden/);
  assert.doesNotMatch(readPublic('fragments/okumalar.html'), /longest-series-loading|stats-loading/);
  assert.match(readPublic('fragments/okumalar.html'), /id="trackerTablePlaceholder"[\s\S]*?tracker-placeholder-table[\s\S]*?tracker-placeholder-day-grid/);
  assert.match(readClient('features/readings/tracker-table.css'), /\.tracker-table-placeholder\s*\{[\s\S]*?tracker-placeholder-shimmer/);
  assert.match(readClient('features/readings/loading-placeholders.css'), /\.reading-chart-placeholder[\s\S]*?\.user-cards-placeholder/);
  assert.match(readClient('features/readings/statistics-layout.css'), /\.chart-container\s*\{[\s\S]*?position:\s*relative[\s\S]*?height:\s*500px/);
  assert.match(readClient('features/readings/statistics-layout.css'), /#longestSeriesChart\s*\{[\s\S]*?min-height:\s*370px[\s\S]*?border:\s*1px solid #dfdfdf/);
  assert.match(readClient('features/readings/reading-message-panels.js'), /container\.replaceChildren\(\)/);
  assert.match(readClient('features/readings/analytics/monthly.js'), /monthlyCalendarPlaceholder/);
  assert.match(readClient('features/readings/analytics/stats-section.js'), /readingStatsPlaceholder/);
  assert.match(readClient('features/readings/analytics/longest-series.js'), /chart\.innerHTML = ''/);
  assert.match(readClient('features/readings/analytics/user-cards.js'), /userCardsPlaceholder/);
  assert.doesNotMatch(readClient('features/readings/analytics/user-cards.js'), /leagueInfoPlaceholder/);
  assert.match(router, /function revealLeagueInfoBar\(options = \{\}\)[\s\S]*?leagueInfoPlaceholder[\s\S]*?options\.animate !== false[\s\S]*?reading-content-reveal/);
  assert.match(readClient('features/readings/loading-placeholders.css'), /\.reading-content-reveal[\s\S]*?0\.6s[\s\S]*?translateY\(16px\)/);
  assert.match(readClient('features/readings/analytics/monthly.js'), /monthlyPlaceholder[\s\S]*?reading-content-reveal/);
  assert.match(readClient('features/readings/analytics/stats-section.js'), /readingStatsPlaceholder[\s\S]*?reading-content-reveal/);
  assert.match(readClient('features/readings/analytics/longest-series.js'), /longestSeriesPlaceholder[\s\S]*?reading-content-reveal/);
  assert.match(readClient('features/readings/analytics/user-cards.js'), /userCardsPlaceholder[\s\S]*?reading-content-reveal/);
  assert.match(readClient('features/readings/group-management.js'), /managementRoot\.classList\.add\('reading-content-reveal'\)/);
  assert.match(readClient('features/readings/group-management.js'), /if \(!document\.body\.classList\.contains\('app-shell-body'\)\)/);
  assert.match(readClient('features/groups/group-bootstrap.js'), /if \(!Object\.hasOwn\(window, 'initialAllData'\)\) window\.initialAllData = null;/);
  assert.doesNotMatch(readClient('features/groups/group-bootstrap.js'), /this\._rebuildIndexes\(\);\s*await this\._buildLongestStreaks\(\)/);
  assert.match(readClient('features/groups/group-bootstrap.js'), /ensureLongestStreaks\(\)[\s\S]*?longestStreaksPromise/);
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
    [...shared, 'fragments/common-overlays.html', 'fragments/group-header.html', 'fragments/okumalar.html'],
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

test('eski yüzen grup navigasyonu kaldırılmıştır', () => {
  const legacyFloatingNavigation = /createNavigationButtons|showAdminIndicator|admin-indicator|scroll-to-main-button|quotes-button|videos-button|articles-button/;
  const sources = [
    readClient('features/groups/admin-modal.js'),
    readClient('features/groups/admin-modal.css'),
    readClient('features/groups/group-bootstrap.js'),
    readClient('features/readings/group-management.js'),
    readPublic('app/shell-router.js')
  ];

  sources.forEach(source => assert.doesNotMatch(source, legacyFloatingNavigation));
  assert.match(
    readClient('features/readings/group-management.js'),
    /syncGroupManagementVisibility[\s\S]*?LocalStorageManager\.isAdmin\(\)[\s\S]*?managementRoot\.style\.display = isAdmin \? 'flex' : 'none'/
  );
});

test('gizli grup okuma verilerini yüklemeden mevcut giriş panelini açar', () => {
  const router = readPublic('app/shell-router.js');
  const privateGroupBranch = router.match(/if \(!groupContext\.canRead\)[\s\S]*?\n\s*}/)?.[0] || '';

  assert.match(privateGroupBranch, /ensureGroupCommon/);
  assert.match(privateGroupBranch, /activatePrivateGroupView/);
  assert.match(privateGroupBranch, /initializeGroupUi/);
  assert.match(privateGroupBranch, /initializeGroupPage/);
  assert.doesNotMatch(privateGroupBranch, /loadGroupData|private-group-message/);
  assert.match(router, /if \(!groupContext\.canRead\)[\s\S]*?return;[\s\S]*?loadGroupData\(groupContext\)/);
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
  const journeyStyles = readClient('features/readings/reading-journey.css');
  const trackerStyles = readClient('features/readings/tracker-table.css');
  const tracker = readClient('features/readings/tracker-table.js');
  const journey = readClient('features/readings/reading-journey.js');
  const editMode = readClient('features/readings/reading-edit-mode.js');
  const router = readPublic('app/shell-router.js');
  assert.doesNotMatch(commonStyles, /\.authenticated-user-areas\s*\{/);
  assert.match(journeyStyles, /\.authenticated-user-areas\s*\{[^}]*visibility:\s*hidden/s);
  assert.doesNotMatch(trackerStyles, /\.authenticated-user-areas\s*\{/);
  assert.match(journey, /window\.syncAuthenticatedUserAreas/);
  assert.doesNotMatch(editMode, /window\.showAuthenticatedUserAreas\s*=/);
  assert.match(tracker, /class="user-stats-progress-current"/);
  assert.doesNotMatch(tracker, /currentProgressObserver|MutationObserver\(emphasizeCurrentProgress\)/);
  assert.match(journey, /initializeReadingJourney\(options = \{\}\)[\s\S]*?options\.reveal !== false/);
  assert.match(journeyStyles, /grid-template-rows:\s*0fr[\s\S]*?transform:\s*translateY\(16px\)[\s\S]*?grid-template-rows:\s*1fr/);
  assert.match(router, /syncAuthenticatedUserAreas\(isAuthenticated, \{ immediate: true \}\)/);
});

test('route çözücü kanonik grup ve global adresleri ayırır', async () => {
  const moduleUrl = pathToFileURL(path.join(publicDir, 'app', 'route-config.js')).href;
  const routes = await import(moduleUrl);
  assert.deepEqual(routes.resolveRoute('/grup/ornek-grup/'), {
    ...routes.ROUTES.okumalar,
    groupId: 'ornek-grup'
  });
  assert.equal(routes.groupRoutePath('ornek-grup'), '/grup/ornek-grup/');
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
  const server = [
    path.join(projectRoot, 'src', 'server', 'app.js'),
    path.join(projectRoot, 'src', 'server', 'modules', 'pages', 'page.routes.js')
  ].map(filePath => fs.readFileSync(filePath, 'utf8')).join('\n');
  assert.match(server, /app\.get\('\/',[\s\S]*?res\.redirect\(302, '\/tesbihat'\)/);
  assert.match(server, /app\.get\('\/gruplar',[\s\S]*?sendHtmlFile\(res, publicPath, 'gruplar\.html'\)/);
  assert.match(server, /app\.get\('\/grup\/:groupId\/', \(req, res\) =>/);
  assert.doesNotMatch(server, /app\.get\('\/grup\/:groupId\/okumalar'/);
  assert.match(server, /app\.get\(\['\/tesbihat', '\/videolar', '\/tefekkur', '\/makaleler'\]/);
  assert.doesNotMatch(server, /sendHtmlFile\(res, '(?:index|groups)\.html'\)/);
  assert.doesNotMatch(server, /app\.get\('\/:groupId'/);
});

test('yönetim ve kayıt sayfaları mobil viewport tanımlar', () => {
  const viewportPattern = /<meta\s+name="viewport"\s+content="width=device-width, initial-scale=1\.0">/;
  ['admin.html', 'login-logs.html', 'access-logs.html'].forEach(fileName => {
    const html = fs.readFileSync(path.join(projectRoot, 'public', fileName), 'utf8');
    assert.match(html, viewportPattern, `${fileName} viewport etiketi içermeli`);
  });
});

test('grup yönetimi kutuları dar ekranda sarılır ve tek sütuna iner', () => {
  const css = fs.readFileSync(
    path.join(projectRoot, 'src', 'client', 'features', 'readings', 'group-management.css'),
    'utf8'
  );

  assert.match(css, /\.top-section\s*\{[\s\S]*?flex-wrap:\s*wrap;/);
  assert.match(css, /\.top-section\s*\{[\s\S]*?justify-content:\s*space-between;[\s\S]*?gap:\s*24px;/);
  assert.match(css, /\.bottom-section\s*\{[\s\S]*?flex-wrap:\s*wrap;/);
  assert.match(css, /\.group-top-section\s*\{[\s\S]*?flex-wrap:\s*wrap;/);
  assert.match(css, /\.group-left-sub-column,[\s\S]*?\.group-right-sub-column\s*\{[\s\S]*?flex:\s*1 1 415px;[\s\S]*?width:\s*415px;/);
  assert.match(css, /\.automation-settings-column,[\s\S]*?\.automation-actions-column\s*\{[\s\S]*?flex:\s*1 1 415px;[\s\S]*?width:\s*415px;/);
  assert.match(css, /\.group-actions\s*\{[\s\S]*?width:\s*415px;[\s\S]*?max-width:\s*100%;/);
  assert.match(css, /\.group-settings\s*\{[\s\S]*?box-sizing:\s*content-box;[\s\S]*?width:\s*415px;[\s\S]*?max-width:\s*calc\(100% - 50px\);/);
  assert.match(css, /\.automation-settings\s*\{[\s\S]*?width:\s*415px;[\s\S]*?max-width:\s*calc\(100% - 50px\);[\s\S]*?box-sizing:\s*content-box;/);
  assert.match(css, /\.group-settings\s*\{[\s\S]*?margin:\s*0;/);
  assert.match(css, /\.automation-section\s*\{[\s\S]*?flex:\s*0 1 auto;[\s\S]*?max-width:\s*100%;/);
  assert.match(css, /\.automation-settings\s*\{[\s\S]*?margin:\s*0;/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.automation-settings-column,[\s\S]*?\.automation-actions-column[\s\S]*?width:\s*100%;/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.group-settings,[\s\S]*?\.automation-settings\s*\{[\s\S]*?max-width:\s*calc\(100% - 34px\);/);
  const okumalar = readPublic('fragments/okumalar.html');
  assert.match(okumalar, /<div class="top-section">[\s\S]*?<div class="group-settings scroll-fade-in">[\s\S]*?<div class="automation-section scroll-fade-in">[\s\S]*?<!-- Alt Bölüm:/);
  assert.doesNotMatch(okumalar, /<section class="automation-section/);
  assert.match(okumalar, /class="bottom-section scroll-fade-in"[\s\S]*?class="user-onboarding-column"[\s\S]*?class="user-management-column"/);
  assert.doesNotMatch(okumalar, /class="(?:left|right)-column"/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.user-management-column,[\s\S]*?\.user-onboarding-column,[\s\S]*?width:\s*100%;/);
  assert.match(css, /\.main-area\s*\{[\s\S]*?max-width:\s*100%;[\s\S]*?overflow-x:\s*clip;/);
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
