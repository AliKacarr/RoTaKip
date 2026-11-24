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

function collectCssClasses(content) {
  return new Set(Array.from(
    content.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g),
    match => match[1]
  ));
}

function assertUniqueIds(files) {
  const ids = collectIds(files.map(readPublic).join('\n'));
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicates)], [], `Yinelenen DOM id: ${duplicates.join(', ')}`);
}

test('istemci stilleri ortak responsive breakpoint setini kullanır', () => {
  const allowedBreakpoints = new Set([1023, 768, 640, 480]);
  const violations = [];
  fs.readdirSync(clientDir, { recursive: true })
    .filter(fileName => fileName.endsWith('.css'))
    .forEach(fileName => {
      const styles = fs.readFileSync(path.join(clientDir, fileName), 'utf8');
      for (const match of styles.matchAll(/@media[^\n{]*\(\s*max-width\s*:\s*(\d+)px\s*\)/g)) {
        const breakpoint = Number(match[1]);
        if (!allowedBreakpoints.has(breakpoint)) {
          violations.push(`${fileName}: ${breakpoint}px`);
        }
      }
    });
  assert.deepEqual(violations, []);
});

test('shell tek navigasyonu taşır ve grup dizini yalnız görünüm içeriği sağlar', () => {
  const shell = readPublic('app-shell.html');
  const groupsFragment = readPublic('fragments/gruplar.html');
  const shellStyles = readClient('shell/shell.css');
  const indexStyles = readClient('features/group-directory/group-directory.css');
  const allClientStyles = fs.readdirSync(clientDir, { recursive: true })
    .filter(fileName => fileName.endsWith('.css'))
    .map(fileName => fs.readFileSync(path.join(clientDir, fileName), 'utf8'))
    .join('\n');
  const allPublicStyles = fs.readdirSync(publicDir, { recursive: true })
    .filter(fileName => fileName.endsWith('.css'))
    .map(fileName => fs.readFileSync(path.join(publicDir, fileName), 'utf8'))
    .join('\n');
  assert.match(shell, /name="description" content="[^"]*okuma alışkanlıklarınızı ve grup ilerlemenizi takip edin[^"]*"/);
  assert.doesNotMatch(shell, /Namaz vakitleri ve tesbihat içeriklerine/);
  assert.match(shell, /id="appNavigation"/);
  assert.equal((shell.match(/<a[^>]+data-route=/g) || []).length, 5);
  assert.doesNotMatch(shell, /app-navigation-brand/);
  assert.match(shell, /data-route="okumalar"[\s\S]*?fa-regular fa-compass[\s\S]*?<span>Okumalar<\/span>/);
  assert.equal((shell.match(/class="app-navigation-icon"/g) || []).length, 5);
  assert.equal((shell.match(/app-navigation-icon-outline/g) || []).length, 5);
  assert.equal((shell.match(/app-navigation-icon-filled/g) || []).length, 5);
  assert.match(shell, /const selectedRoute = path === '\/gruplar' \|\| path\.startsWith\('\/grup\/'\)[\s\S]*?activeLink\.classList\.add\('is-active'\)[\s\S]*?navigation\.dataset\.activeRoute = selectedRoute[\s\S]*?new MutationObserver/);
  assert.match(shell, /data-route="tesbihat" href="\/tesbihat"[\s\S]*?<span>Tesbihat<\/span>/);
  assert.match(shell, /data-route="tefekkur" href="\/tefekkur"[\s\S]*?<span>Tefekkür<\/span>/);
  assert.match(shell, /data-route="tesbihat"[\s\S]*?data-route="tefekkur"[\s\S]*?data-route="videos"[\s\S]*?data-route="articles"[\s\S]*?data-route="okumalar"/);
  assert.match(shell, /id="tabContent"/);
  assert.match(shell, /id="footerRoot" hidden/);
  assert.match(shell, /id="globalOverlayRoot"/);
  assert.doesNotMatch(shell, /id="groupCommonRoot"/);
  assert.match(shell, /id="scrollToTopBtn"[^>]*hidden/);
  assert.match(shell, /<body class="app-shell-body initial-tab-loading">/);
  assert.match(shell, /id="tabContent" class="tab-content is-initial-loading"[\s\S]*?id="initialTabLoader"[\s\S]*?route-loader-star[\s\S]*?>Ro<[\s\S]*?>Ta<[\s\S]*?>Kip</);
  assert.doesNotMatch(shell, /id="routeStatus"/);
  assert.doesNotMatch(shell, /initial-group-route-loading/);
  assert.match(groupsFragment, /<h1 class="header-title">Okuma Grupları<\/h1>/);
  assert.match(groupsFragment, /Kitap okuma hedeflerinizi belirleyin ve ilerlemenizi takip edin/);
  assert.doesNotMatch(groupsFragment, /<!DOCTYPE|<html(?:\s|>)|<head(?:\s|>)|<body(?:\s|>)|id="appNavigation"|<script(?:\s|>)|class="site-footer"/i);
  assert.doesNotMatch(shell, /document\.documentElement\.classList\.add\('initial-group-route-loading'\)/);
  assert.match(shell, /shell\.min\.css\?v=/);
  assert.doesNotMatch(shell, /groups\.min\.(?:css|js)/);
  assert.doesNotMatch(shell, /class="tracker-table-shell"/);
  assert.doesNotMatch(shell, /class="videos"/);
  assert.doesNotMatch(indexStyles, /body\.index-navigation-body|\.app-navigation\s*\{/);
  assert.doesNotMatch(shellStyles, /:root\s*\{/);
  assert.doesNotMatch(indexStyles, /:root\s*\{/);
  assert.doesNotMatch(shellStyles, /--[a-zA-Z]|var\(--/);
  assert.doesNotMatch(indexStyles, /--[a-zA-Z]|var\(--/);
  assert.doesNotMatch(allClientStyles, /\b(?:\d*\.)?\d+rem\b/);
  assert.doesNotMatch(allPublicStyles, /\b(?:\d*\.)?\d+rem\b/);
  assert.match(shellStyles, /body\.app-shell-body\s*\{[^}]*padding-left:\s*132px/s);
  assert.match(indexStyles, /\.tab-view-groups \.main-container\s*\{[^}]*padding:\s*clamp\(16px, 2\.4vw, 26px\)/s);
  assert.match(indexStyles, /\.tab-view-groups \.main-container\s*\{[^}]*background:\s*#fcfdfe/s);
  assert.match(indexStyles, /\.group-card\s*\{[^}]*border:\s*1px solid #b7c5d3/s);
  assert.match(indexStyles, /\.tab-view-groups,[\s\S]*?\.tab-view-groups \*[\s\S]*?box-sizing:\s*border-box/);
  assert.match(shellStyles, /\.app-navigation-item\.is-active\s*\{[^}]*background:\s*transparent/s);
  assert.match(shellStyles, /@media \(hover:\s*hover\) and \(pointer:\s*fine\)[\s\S]*?\.app-navigation-item\.is-active:hover[\s\S]*?background:\s*rgba\(17, 17, 17, 0\.06\)/);
  assert.doesNotMatch(shellStyles, /\.app-navigation-icon(?:\s|\.[^{])*\{[^}]*transform:/s);
  assert.doesNotMatch(shellStyles, /\.app-navigation-item\.is-active \.app-navigation-icon\s*\{[^}]*transform:/s);
  assert.doesNotMatch(shellStyles, /\.app-navigation-item\.is-active \.app-navigation-icon-outline\s*\{[^}]*transform:/s);
  assert.match(shellStyles, /\.app-navigation-icon i\s*\{[^}]*color:\s*currentColor/s);
  assert.match(shellStyles, /\.app-navigation-icon\s*\{[^}]*width:\s*1em;[^}]*height:\s*1em;[^}]*font-size:\s*38px/s);
  assert.match(shellStyles, /\.app-navigation-icon i\s*\{[^}]*position:\s*absolute;[^}]*opacity:\s*1;[^}]*transition:\s*opacity 160ms ease-out/s);
  assert.match(shellStyles, /\.app-navigation-icon \.app-navigation-icon-filled\s*\{[^}]*opacity:\s*0;/s);
  assert.match(shellStyles, /\.app-navigation\.icons-ready \.app-navigation-item\.is-active \.app-navigation-icon-outline\s*\{[^}]*opacity:\s*0[\s\S]*?\.app-navigation\.icons-ready \.app-navigation-item\.is-active \.app-navigation-icon-filled\s*\{[^}]*opacity:\s*1/s);
  assert.match(shellStyles, /\.app-navigation-item\.is-active \.app-navigation-icon-outline\s*\{[^}]*color:\s*#48505f;/);
  assert.match(shellStyles, /\[data-route="tesbihat"\]\.is-active \.app-navigation-icon-filled\s*\{[^}]*color:\s*#1e3a5f;/);
  assert.match(shellStyles, /\[data-route="tefekkur"\]\.is-active \.app-navigation-icon-filled\s*\{[^}]*color:\s*#ff6b33;/);
  assert.match(shellStyles, /\[data-route="videos"\]\.is-active \.app-navigation-icon-filled\s*\{[^}]*color:\s*#dc2626;/);
  assert.match(shellStyles, /\[data-route="articles"\]\.is-active \.app-navigation-icon-filled\s*\{[^}]*color:\s*#1a9948;/);
  assert.match(shellStyles, /\[data-route="okumalar"\]\.is-active \.app-navigation-icon-filled\s*\{[^}]*color:\s*#1a71ff;/);
  assert.doesNotMatch(shellStyles, /\.app-navigation-item:hover,\s*\n\.app-navigation-item:focus-visible/);
  assert.match(shellStyles, /\.app-navigation-item\s*\{[^}]*-webkit-tap-highlight-color:\s*transparent/s);
  assert.match(shellStyles, /\.app-navigation-item\s*\{[^}]*box-sizing:\s*border-box/s);
  assert.match(shellStyles, /#footerRoot\s*\{[^}]*margin-top:\s*auto/s);
  assert.match(shellStyles, /\.app-shell-container\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*1080px/s);
  assert.match(shellStyles, /\.initial-tab-loader\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*z-index:\s*8999;[^}]*min-height:\s*100vh;[^}]*background:\s*#fff;/s);
  assert.match(shellStyles, /body\.initial-tab-loading\s*\{[^}]*overflow:\s*hidden/s);
  assert.doesNotMatch(shellStyles, /html\.initial-group-route-loading/);
  assert.match(shellStyles, /\.app-navigation\s*\{[^}]*z-index:\s*9000/s);
  assert.match(shellStyles, /\.app-navigation\s*\{[^}]*z-index:\s*9000[\s\S]*?\.initial-tab-loader\s*\{[^}]*z-index:\s*8999/s);
  assert.match(shellStyles, /\.tab-view\.visible\s*\{[^}]*tab-view-enter/s);
  assert.match(shellStyles, /@media \(max-width:\s*1023px\)[\s\S]*?body\.app-shell-body\s*\{[^}]*padding-bottom:\s*calc\(80px \+ env\(safe-area-inset-bottom, 0px\)\)/s);
  assert.match(shellStyles, /@media \(max-width:\s*1023px\)[\s\S]*?\.app-navigation\s*\{[^}]*inset:\s*auto 0 -1px 0;[^}]*height:\s*calc\(81px \+ env\(safe-area-inset-bottom, 0px\)\);[^}]*padding:\s*0 0 env\(safe-area-inset-bottom, 0px\);[^}]*background:\s*#fff;[^}]*border-top:\s*0;[^}]*backdrop-filter:\s*none;/s);
  assert.match(shellStyles, /@media \(max-width:\s*1023px\)[\s\S]*?\.app-navigation-items\s*\{[^}]*gap:\s*0;[^}]*overflow:\s*hidden;/s);
  assert.match(shellStyles, /@media \(max-width:\s*1023px\)[\s\S]*?\.app-navigation-item\s*\{[^}]*min-height:\s*80px;[^}]*flex:\s*1 1 20%;[^}]*font-size:\s*15px;/s);
  assert.match(shellStyles, /@media \(max-width:\s*1023px\)[\s\S]*?\.app-navigation-icon\s*\{[^}]*font-size:\s*36px;/s);
  assert.match(shellStyles, /\.app-navigation-item\.is-tap-feedback::before\s*\{[^}]*app-navigation-tap-fade 560ms ease-in-out both/s);
  assert.match(shellStyles, /\.app-navigation-item::before\s*\{[^}]*inset:\s*0 -10px;[^}]*border-radius:\s*16px \/ 50%;[^}]*background:\s*#c4c4c4/s);
  assert.match(shellStyles, /@media \(max-width:\s*640px\)[\s\S]*?\.app-navigation-item::before\s*\{[^}]*inset:\s*0 -8px;[^}]*border-radius:\s*12px \/ 50%;/s);
  assert.match(shellStyles, /\.app-navigation-item:first-child\s*\{[^}]*border-radius:\s*0 20px 20px 0 \/ 0 44px 44px 0/s);
  assert.match(shellStyles, /\.app-navigation-item:last-child\s*\{[^}]*border-radius:\s*20px 0 0 20px \/ 44px 0 0 44px/s);
  assert.match(shellStyles, /\.app-navigation-icon\s*\{[^}]*display:\s*flex;[^}]*width:\s*1em;[^}]*height:\s*1em;[^}]*line-height:\s*1/s);
  assert.match(shellStyles, /@keyframes app-navigation-tap-fade[\s\S]*?0%[^}]*opacity:\s*0[\s\S]*?42%[^}]*opacity:\s*1[\s\S]*?100%[^}]*opacity:\s*0/s);
  assert.doesNotMatch(shellStyles, /@keyframes app-navigation-tap-fade[\s\S]*?opacity:\s*0\.35/s);
  assert.doesNotMatch(shellStyles, /@keyframes app-navigation-tap-fade[\s\S]*?background-color:/s);
  assert.doesNotMatch(shellStyles, /\.app-navigation-item::before\s*\{[^}]*gradient/s);
  assert.doesNotMatch(shellStyles, /app-navigation-tap[^}]*clip-path|@keyframes app-navigation-tap[^}]*clip-path/s);
  assert.doesNotMatch(shellStyles, /\.app-navigation-item\.is-active\s*\{[^}]*transform:/s);
  assert.match(shellStyles, /body\.app-shell-body \.cookie-consent-banner\s*\{[^}]*right:\s*auto;[^}]*bottom:\s*calc\(80px \+ env\(safe-area-inset-bottom, 0px\) \+ 18px\);[^}]*left:\s*18px;[^}]*margin-inline:\s*0;/s);
});

test('Okuma mesaj paneli stilleri kendi bileşen dosyasında kalır', () => {
  const shellStyles = readClient('shell/shell.css');
  const panelStyles = readClient('features/readings/reading-message-panels.css');

  assert.doesNotMatch(shellStyles, /\.reading-message-panels\b/);
  assert.match(panelStyles, /\.reading-message-panels-content\s*\{[^}]*padding:\s*0 20px 20px;[^}]*box-sizing:\s*border-box;/s);
  assert.match(panelStyles, /\.reading-message-panels:not\(:has\(> \.reading-message-panels-content > \*\)\)\s*\{[^}]*display:\s*none;/s);
});

test('ilk dört sekme ve ortak alanlar mobilde taşmadan kompakt düzene geçer', () => {
  const base = readClient('shell/base.css');
  const shell = readClient('shell/shell.css');
  const tefekkurHome = readClient('features/tefekkur/tefekkur-home.css');
  const tefekkurSlider = readClient('features/tefekkur/tefekkur-slider.css');
  const videosBase = readClient('features/videos/videos-base.css');
  const videosFeed = readClient('features/videos/videos-feed.css');
  const articles = readClient('features/articles/articles.css');
  const footer = readClient('shared/footer.css');
  const footerHtml = readPublic('fragments/footer.html');
  const cookies = readClient('shared/cookies.css');

  assert.match(base, /@media \(max-width:\s*768px\)[\s\S]*?body\.app-shell-body > \.app-shell-container[\s\S]*?box-sizing:\s*border-box;[\s\S]*?overflow-x:\s*clip;/);
  assert.match(shell, /@media \(max-width:\s*640px\)[\s\S]*?min-height:\s*58px;[\s\S]*?font-size:\s*11px;[\s\S]*?font-size:\s*clamp\(20px, 5\.8vw, 24px\)/);
  assert.match(shell, /@media \(max-width:\s*640px\)[\s\S]*?\.app-navigation\s*\{[^}]*height:\s*calc\(59px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(tefekkurHome, /@media \(max-width:\s*768px\)[\s\S]*?\.tefekkur-section-row\s*\{[^}]*min-height:\s*68px;/);
  assert.match(tefekkurSlider, /@media \(max-width:\s*768px\)[\s\S]*?\.tefekkur-slider-action\s*\{[^}]*min-height:\s*56px;/);
  assert.match(videosBase, /@media \(max-width:\s*768px\)[\s\S]*?\.videos-sections\s*\{[^}]*padding:\s*0 16px;/);
  assert.match(videosFeed, /@media \(max-width:\s*768px\)[\s\S]*?\.videos-feed\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(articles, /\.articles-category-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/s);
  assert.match(articles, /\.articles-container\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(footer, /\.footer-container\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 1\.15fr\) minmax\(0, 0\.85fr\);[^}]*"social app"[^}]*"corporate corporate";/s);
  assert.match(footer, /\.footer-section\.kurumsal h4\s*\{[^}]*display:\s*none;[\s\S]*?\.footer-section\.kurumsal ul\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*nowrap;[\s\S]*?\.footer-section\.kurumsal ul li \+ li::before\s*\{[^}]*content:\s*"•";/);
  assert.match(footer, /@media \(max-width:\s*768px\)[\s\S]*?\.footer-container\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[\s\S]*?\.footer-section\s*\{[^}]*min-width:\s*0;/);
  assert.match(footer, /@media \(max-width:\s*768px\)[\s\S]*?\.footer-section\.social-media\s*\{[^}]*order:\s*1;[\s\S]*?\.footer-section\.app-download\s*\{[^}]*order:\s*2;/);
  assert.match(footer, /\.footer-section\.app-download\s*\{[^}]*--app-download-content-width:\s*350px;[^}]*grid-area:\s*app;/);
  assert.match(footer, /\.social-link\s*\{[^}]*grid-template-columns:\s*54px minmax\(0, 1fr\) auto;[\s\S]*?\.social-link-action\s*\{[^}]*padding:\s*15px 30px;[\s\S]*?\.footer-section\.app-download \.social-contact-link\s*\{[^}]*width:\s*min\(100%, var\(--app-download-content-width\)\);[^}]*min-height:\s*48px;/);
  assert.match(footer, /\.footer-section\.app-download \.app-download-row\s*\{[^}]*width:\s*min\(100%, var\(--app-download-content-width\)\);[^}]*align-items:\s*center;[^}]*height:\s*clamp\(76px, 10vw, 100px\);[^}]*margin:\s*5px auto 0;[\s\S]*?\.footer-section\.app-download \.app-icon-container\s*\{[^}]*height:\s*100%;[^}]*aspect-ratio:\s*1;[\s\S]*?\.footer-section\.app-download \.app-icon\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/);
  assert.match(footer, /\.footer-section\.app-download \.app-buttons\s*\{[^}]*min-width:\s*0;[^}]*flex:\s*1 1 auto;[\s\S]*?\.footer-section\.app-download \.app-btn\s*\{[^}]*width:\s*100%;[^}]*box-sizing:\s*border-box;/);
  assert.doesNotMatch(footer, /\.footer-section\.social-media \.social-link:hover\s*\{[^}]*transform:/);
  assert.match(footer, /\.social-link-instagram \.social-link-action:hover\s*\{[^}]*background:\s*#007dcc;[^}]*transform:\s*translateY\(-1px\);[\s\S]*?\.social-link-youtube \.social-link-action:hover\s*\{[^}]*background:\s*#d90000;[^}]*transform:\s*translateY\(-1px\);[\s\S]*?\.social-link-spotify \.social-link-action:hover\s*\{[^}]*background:\s*#169c46;[^}]*transform:\s*translateY\(-1px\);/);
  assert.match(footer, /\.footer-section\.app-download \.app-btn:hover\s*\{[^}]*background:\s*#1f56ad;[^}]*transform:\s*translateY\(-1px\);/);
  assert.doesNotMatch(footer, /\.footer-section\.app-download \.app-icon-container:hover/);
  assert.doesNotMatch(footer, /\.footer-section\.app-download \.app-icon-container\s*\{[^}]*display:\s*none;/);
  assert.equal((footerHtml.match(/<h4>/g) || []).length, 3);
  assert.match(footerHtml, /class="social-contact-link" href="mailto:alikacardev@gmail\.com"[\s\S]*?İletişime Geç/);
  assert.match(footerHtml, /social-link-youtube[\s\S]*?social-brand-icon[\s\S]*?fab fa-youtube/);
  assert.match(footer, /\.social-link-youtube \.social-brand-icon\s*\{[^}]*color:\s*#ff0000;[^}]*background:\s*transparent;/);
  assert.match(footer, /\.social-link-instagram \.social-brand-icon i\s*\{[^}]*font-size:\s*40px;/);
  assert.match(footer, /\.social-link-spotify \.social-brand-icon\s*\{[^}]*color:\s*#1DB954;[^}]*background:\s*transparent;/);
  assert.match(footer, /\.footer-section\.app-download \.social-contact-link\s*\{[^}]*color:\s*#fff;[^}]*background:\s*#0095f6;[\s\S]*?\.footer-section\.app-download \.social-contact-link i\s*\{[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*color:\s*#fff;/);
  assert.doesNotMatch(footer, /@media \(min-width:\s*769px\)/);
  assert.doesNotMatch(footerHtml, /wa\.me|>Bize Ulaşın</);
  assert.match(cookies, /@media \(max-width:\s*640px\)[\s\S]*?\.cookie-consent-banner\s*\{[^}]*max-height:\s*calc\(100dvh - 96px - env\(safe-area-inset-bottom, 0px\)\);[^}]*overflow-y:\s*auto;/);
  assert.match(cookies, /@media \(max-width:\s*640px\)[\s\S]*?\.cookie-button\s*\{[^}]*min-height:\s*44px;[^}]*flex:\s*1 1 0;[^}]*font-size:\s*16px;/);
  assert.match(shell, /@media \(max-width:\s*640px\)[\s\S]*?\.route-loader-star\s*\{[^}]*font-size:\s*30px;[\s\S]*?\.route-loader-line\s*\{[^}]*width:\s*27px;[\s\S]*?\.route-loader-line span\s*\{[^}]*font-size:\s*16px;/);
});

test('geçmiş günler kaydırma ipucu hesaplanan merkezi kendi üzerinde kullanır', () => {
  const tracker = readClient('features/readings/tracker-table.js');

  assert.match(tracker, /swipeGuide\.style\.top = `\$\{Math\.max\(0, centeredTop\)\}px`/);
  assert.match(tracker, /swipeGuide\.style\.left = `\$\{centeredLeft\}px`/);
  assert.doesNotMatch(tracker, /timelineScrollHint\.style\.(?:top|left)\s*=/);
});

test('uygulama kabuğundaki yukarı çık butonunu yalnız shell stillendirir', () => {
  const shellStyles = readClient('shell/shell.css');
  const groupCommonStyles = readClient('features/groups/admin-modal.css');
  const groupBootstrap = readClient('features/groups/group-bootstrap.js');
  const scrollManager = readPublic('app/scroll-manager.js');
  const router = readPublic('app/shell-router.js');

  assert.match(shellStyles, /\.scroll-to-top-btn\s*\{/);
  assert.doesNotMatch(groupCommonStyles, /\.scroll-to-top-btn\b/);
  assert.doesNotMatch(groupBootstrap, /scrollToTopBtn/);
  assert.match(scrollManager, /setScrollToTopEnabled\(isEnabled\)[\s\S]*?routeEnabled = Boolean\(isEnabled\)/);
  assert.match(scrollManager, /shouldShow = routeEnabled && window\.scrollY > 700/);
  assert.match(scrollManager, /button\.hidden = !routeEnabled/);
  assert.match(router, /setScrollToTopEnabled\(route\.requiresGroup\)/);
});

test('son Okumalar konumu grup ve grup dizini arasında kalıcı tutulur', () => {
  const navigation = readPublic('app/navigation.js');
  const router = readPublic('app/shell-router.js');

  assert.match(navigation, /localStorage\.setItem\(key, value\)/);
  assert.match(navigation, /localStorage\.getItem\(key\)/);
  assert.doesNotMatch(navigation, /sessionStorage/);
  assert.match(navigation, /LAST_READING_PATH_KEY = 'rotakip:last-okumalar-path'/);
  assert.doesNotMatch(navigation, /export function (?:rememberGroup|getRememberedGroup)/);
  assert.doesNotMatch(navigation, /last-group-id|LEGACY_LAST_GROUP_KEY|legacyGroupId/);
  assert.match(navigation, /getRememberedReadingPath\(\)[\s\S]*?LAST_READING_PATH_KEY[\s\S]*?\|\| '\/gruplar'/);
  assert.match(navigation, /const okumalarPath = route\.groupId[\s\S]*?getRememberedReadingPath\(\)/);
  assert.match(navigation, /function initializeNavigationIcons\(nav[\s\S]*?app-navigation-icon-outline[\s\S]*?app-navigation-icon-filled[\s\S]*?document\.fonts\.load\('400 1em "Font Awesome 6 Free"'\)[\s\S]*?document\.fonts\.load\('900 1em "Font Awesome 6 Free"'\)[\s\S]*?icons-ready/);
  assert.match(navigation, /function setNavigationSelection\(nav, selectedRoute\)[\s\S]*?nav\.dataset\.activeRoute === selectedRoute\) return;[\s\S]*?classList\.toggle\('is-active', active\)[\s\S]*?nav\.dataset\.activeRoute = selectedRoute/);
  assert.doesNotMatch(navigation.match(/function setNavigationSelection\(nav, selectedRoute\)[\s\S]*?\n}/)?.[0] || '', /fa-solid|fa-regular/);
  assert.match(navigation, /setNavigationSelection\(nav, route\.navigationName \|\| route\.name\)/);
  assert.match(navigation, /const leavesLegacyGroupViewport = document\.documentElement\.classList\.contains\('group-legacy-viewport'\)[\s\S]*?setNavigationSelection\(nav, link\.dataset\.route\)[\s\S]*?if \(leavesLegacyGroupViewport\)[\s\S]*?window\.setTimeout\([\s\S]*?onNavigate\(url\)[\s\S]*?, 180\)[\s\S]*?return;[\s\S]*?onNavigate\(url\)/);
  assert.doesNotMatch(navigation, /updateNavigationSelection|deferSelectionUntilViewportPaint/);
  assert.doesNotMatch(navigation, /originClass|targetIndex|activeIndex|activeLink|is-tap-feedback-from-(?:left|right)/);
  assert.match(navigation, /classList\.add\('is-tap-feedback'\)/);
  assert.match(navigation, /tapFeedbackTimer = window\.setTimeout\(\(\) => link\.classList\.remove\('is-tap-feedback'\), 600\)/);
  assert.match(router, /route\.name === 'groups'\) rememberReadingPath\(canonicalPath\(route\)\)/);
  assert.doesNotMatch(router, /deferSelectionUntilViewportPaint|leavesLegacyGroupViewport/);
  assert.match(router, /if \(!groupContext\.canRead\)[\s\S]*?return;[\s\S]*?rememberReadingPath\(canonicalPath\(route\)\)/);
});

test('asset manifesti shell ve sekme paketlerini ayrı tutar', () => {
  const manifest = JSON.parse(readPublic('assets-manifest.json'));
  const buildAssets = fs.readFileSync(path.join(projectRoot, 'scripts', 'build-assets.js'), 'utf8');
  [
    'shell.min.css', 'shell.min.js',
    'groups-directory.min.css', 'groups-directory.min.js',
    'access-logs.min.css', 'access-logs.min.js',
    'login-logs.min.css', 'login-logs.min.js',
    'site-activity-admin.min.css', 'site-activity-admin.min.js',
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
  assert.equal(manifest['index.min.css'], undefined);
  assert.equal(manifest['index.min.js'], undefined);
  assert.match(buildAssets, /legacyAssetFiles = \['index\.min\.css', 'index\.min\.js'\][\s\S]*?fs\.rmSync\(path\.join\(publicPath, fileName\), \{ force: true \}\)/);
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

test('Okumalar haftalık ve analiz bileşenlerini birleştirir, Tesbihat namaz vakitleri ve okuyucu gösterir', () => {
  const groupHeaderFragment = readPublic('fragments/group-header.html');
  const okumalarFragment = readPublic('fragments/okumalar.html');
  const tesbihat = readPublic('fragments/tesbihat.html');
  const commonOverlays = readPublic('fragments/common-overlays.html');
  const adminModalStyles = readClient('features/groups/admin-modal.css');
  const adminModal = readClient('features/groups/admin-modal.js');
  const routes = readPublic('app/route-config.js');
  const router = readPublic('app/shell-router.js');

  assert.match(groupHeaderFragment, /id="secretAdminLogin"[\s\S]*?id="profileButton"/);
  assert.match(commonOverlays, /groups-auth-join-image-source-picker[\s\S]*?Cihazdan yükle[\s\S]*?avatar-picker-sparkle[^>]*>✨<[\s\S]*?Avatar seç/);
  assert.equal((commonOverlays.match(/✨/g) || []).length, 1);
  assert.match(adminModalStyles, /\.groups-auth-join-input-container\.groups-auth-join-image-source-picker\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;[^}]*gap:\s*12px/s);
  assert.match(adminModalStyles, /\.groups-auth-join-image-source-picker > \.groups-auth-join-file-input-label,[\s\S]*?\.groups-auth-join-image-source-picker > \.groups-auth-join-avatar-btn\s*\{[^}]*box-sizing:\s*border-box;/);
  assert.match(adminModalStyles, /\.groups-auth-join-file-input-label\s*\{[^}]*height:\s*56px/s);
  assert.match(adminModalStyles, /\.groups-auth-join-input-container \.groups-auth-join-file-input-label\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*flex-start;/s);
  assert.match(adminModalStyles, /\.groups-auth-join-avatar-btn\s*\{[^}]*height:\s*56px/s);
  assert.match(adminModalStyles, /\.groups-auth-join-avatar-btn\s*\{[^}]*justify-content:\s*flex-start;[^}]*position:\s*static/s);
  assert.match(adminModal, /function setGroupsAuthJoinAvatarButtonState\(isSelected\)[\s\S]*?Avatar seçildi[\s\S]*?classList\.toggle\('is-selected', isSelected\)/);
  assert.doesNotMatch(adminModal, /fileInputText\.textContent = 'Avatar seçildi'/);
  assert.match(groupHeaderFragment, /<button type="button" onclick="window\.navigateRoTaKip\('\/gruplar'\)" class="showGroups"/);
  assert.doesNotMatch(groupHeaderFragment, /window\.location\.href='\/gruplar'/);
  assert.doesNotMatch(okumalarFragment, /id="secretAdminLogin"|id="profileButton"/);
  assert.match(commonOverlays, /id="groupsAuthLoginModal"/);
  assert.doesNotMatch(commonOverlays, /class="league-info-bar"|id="authenticatedUserAreas"|id="dailyGiftModal"|id="dailyTasksModal"/);

  assert.match(okumalarFragment, /class="tracker-table-shell"/);
  assert.match(okumalarFragment, /Haftalık İstatistikler[\s\S]*?id="readingEditModeBar"/);
  assert.match(okumalarFragment, /id="readingEditModeBar" class="reading-edit-mode-bar" aria-hidden="true"[\s\S]*?class="reading-edit-mode-bar-content"/);
  assert.match(okumalarFragment, /class="reading-message-panels"/);
  assert.match(okumalarFragment, /class="main-area"/);
  assert.doesNotMatch(okumalarFragment, /settings-section|onesignal-customlink-container/);
  assert.doesNotMatch(okumalarFragment, /Günün Vecizeleri|home-tefekkur-window|quote-section-image/);
  assert.match(routes, /fragment:\s*\['\/fragments\/group-header\.html', '\/fragments\/okumalar\.html'\]/);

  assert.match(okumalarFragment, /class="league-info-section"[\s\S]*?id="authenticatedUserAreas"[\s\S]*?class="league-info-bar"[\s\S]*?<\/section>/);
  assert.match(okumalarFragment, /id="authenticatedUserAreas" class="authenticated-user-areas"/);
  assert.doesNotMatch(okumalarFragment, /(?:authenticatedUserAreas|readingEditModeBar)[^>]*is-initial-reveal-pending/);
  assert.match(okumalarFragment, /id="dailyGiftModal"[\s\S]*?id="dailyTasksModal"/);

  assert.match(okumalarFragment, /class="user-cards-section"/);
  assert.match(okumalarFragment, /class="user-cards-container"/);
  assert.match(okumalarFragment, /class="monthly-calendar-section"/);
  assert.match(okumalarFragment, /class="longest-series-section"/);
  assert.match(okumalarFragment, /class="stats-section"/);
  assert.doesNotMatch(okumalarFragment, /id="readingMessagesPlaceholder"|reading-message-placeholder|message-placeholder-/);
  assert.doesNotMatch(okumalarFragment, /Placeholder|placeholder-|reading-chart-placeholder|tracker-table-placeholder/);
  assert.match(okumalarFragment, /class="monthly-calendar-section" style="display: none;"/);
  assert.match(okumalarFragment, /class="stats-section" style="display: none;"/);
  assert.match(okumalarFragment, /class="longest-series-section" style="display: none;"/);
  assert.match(okumalarFragment, /class="user-cards-section" style="display: none;"/);
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
  assert.doesNotMatch(tesbihat, /section-heading|fa-calendar|tesbihatHeroNextLabel|tesbihat-hero-location|tesbihatHeroSky/);
  assert.doesNotMatch(readClient('features/tesbihat/tesbihat-home.css'), /\.tesbihat-hero-dates\s*\{[^}]*border-top/s);
  const tesbihatViews = Array.from(tesbihat.matchAll(/class="tesbihat-view" data-view="([a-z]+)"/g), match => match[1]);
  assert.deepEqual(tesbihatViews, ['home', 'location', 'types', 'reader']);
  assert.match(tesbihat, /data-view="home"[\s\S]*?class="tesbihat-change-location" data-open-location[\s\S]*?fa-location-dot[\s\S]*?id="tesbihatCurrentLocation"[\s\S]*?Değiştir[\s\S]*?id="tesbihatNotificationButton"[\s\S]*?fa-bell[\s\S]*?id="tesbihatHero"[\s\S]*?id="tesbihatCountdownMain"[\s\S]*?class="tesbihat-list-heading"[\s\S]*?id="tesbihatPrayerList"/);
  const tesbihatHome = readClient('features/tesbihat/tesbihat-home.js');
  assert.match(tesbihatHome, /id = 'tesbihatNotificationPanel'[\s\S]*?onesignal-customlink-container[\s\S]*?document\.body\.appendChild\(notificationPanel\)/);
  assert.match(tesbihatHome, /window\.scheduleOneSignalLoad/);
  assert.doesNotMatch(readClient('features/tesbihat/tesbihat-home.css'), /tesbihat-list-heading::after|tesbihat-list-heading > i/);
  assert.equal((tesbihat.match(/data-open-location/g) || []).length, 1);
  assert.match(tesbihat, /data-view="location"[^>]*hidden[\s\S]*?id="tesbihatLocationSearch"[\s\S]*?id="tesbihatUseMyLocation"[\s\S]*?id="tesbihatLocationList"/);
  assert.match(tesbihat, /data-view="types"[^>]*hidden[\s\S]*?data-tur="kisa"[\s\S]*?data-tur="uzun"[\s\S]*?data-tur="arapca-uzun"[\s\S]*?class="tesbihat-info-note"/);
  assert.match(tesbihat, /data-view="reader"[^>]*hidden[\s\S]*?class="tesbihat-reader-bar"[\s\S]*?id="tesbihatResetCounters"[\s\S]*?id="tesbihatReaderContent"/);
  assert.match(readClient('features/tesbihat/tesbihat-reader.css'), /\.tesbihat-reader-bar\s*\{[^}]*position:\s*sticky;[^}]*top:\s*20px;/s);
  const tesbihatReader = readClient('features/tesbihat/tesbihat-reader.js');
  assert.match(tesbihatReader, /resetButton\.addEventListener\('click'[\s\S]*?ns\.confirmDialog\(\{[\s\S]*?title: 'Sayaçları Sıfırla'[\s\S]*?confirmLabel: 'Sıfırla'/);
  assert.doesNotMatch(tesbihatReader, /scrollTo\(/);
  assert.doesNotMatch(tesbihatReader, /tesbihat-ring-reset/);
  assert.doesNotMatch(readClient('features/tesbihat/tesbihat-home.js'), /tesbihat-prayer-badge/);
  assert.doesNotMatch(readClient('features/tesbihat/tesbihat-home.js'), /tesbihat-prayer-now/);
  assert.match(readClient('features/tesbihat/tesbihat-home.css'), /\.tesbihat-prayer-row\.is-current\s*\{[^}]*border-left-width:\s*8px;/s);
  assert.doesNotMatch(tesbihat, /tesbihat-hero-art|<svg/);
  assert.match(tesbihatReader, /matchMedia\('\(pointer: coarse\)'\)/);
  assert.match(readClient('features/tesbihat/tesbihat-utils.js'), /ns\.confirmDialog[\s\S]*?role="alertdialog"[\s\S]*?document\.body\.appendChild\(backdrop\)/);
  assert.doesNotMatch(tesbihat, /<select|tesbihat-preparation|çok yakında/);
  assert.doesNotMatch(commonOverlays, /readingEditModeBar/);
  assert.match(readClient('features/readings/reading-edit-mode.js'), /modeBar\.classList\.add\('show'\)[\s\S]*?aria-hidden', 'false'/);
  assert.match(readClient('features/readings/reading-edit-mode.js'), /modeBar\.classList\.remove\('show'\)[\s\S]*?aria-hidden', 'true'/);
  assert.match(readClient('features/readings/tracker-table.css'), /\.reading-edit-mode-bar\s*\{[^}]*grid-template-rows:\s*0fr;[^}]*clip-path:\s*inset\(0 0 100% 0\);[^}]*grid-template-rows var\(--reading-auth-toggle-duration, 0\.8s\)/s);
  assert.match(readClient('features/readings/tracker-table.css'), /\.reading-edit-mode-bar\.show\s*\{[^}]*grid-template-rows:\s*1fr;[^}]*clip-path:\s*inset\(0\)/s);
  assert.match(readClient('features/readings/tracker-table.css'), /\.reading-edit-mode-bar\.is-initial-reveal-pending,[\s\S]*?grid-template-rows:\s*1fr;[^}]*opacity:\s*0;[^}]*transition:\s*none/s);
  assert.doesNotMatch(readClient('features/readings/reading-edit-mode.js'), /revealReadingEditModeBarInitial/);
  assert.match(router, /function revealReadingAuthControls\(isAuthenticated\)[\s\S]*?syncAuthenticatedUserAreas\(isAuthenticated, \{ immediate: true \}\)[\s\S]*?showReadingEditModeBar[\s\S]*?getBoundingClientRect\(\)[\s\S]*?classList\.remove\('is-initial-reveal-pending'\)/);
  assert.doesNotMatch(
    readClient('features/readings/analytics/user-cards.js'),
    /league-promotion-message|reading-streak-message|weak-link-message|everyone-read-message/
  );
  const messagePanels = readClient('features/readings/reading-message-panels.js');
  assert.match(messagePanels, /renderReadingMessagePanels/);
  assert.match(messagePanels, /reading-message-panel-pending[\s\S]*?revealPendingReadingMessagePanels[\s\S]*?reading-content-reveal/);
  assert.doesNotMatch(messagePanels, /observeReadingScrollReveal/);
  assert.match(messagePanels, /window\.ROTAKIP_LEAGUES/);
  assert.match(messagePanels, /confetti-overlay/);
  assert.match(messagePanels, /reading-streak-message/);
  assert.match(readClient('features/readings/reading-message-panels.css'), /kurdele\.webp/);
  assert.match(readClient('features/readings/reading-message-panels.css'), /dugum\.webp/);
  assert.doesNotMatch(readClient('features/readings/analytics/user-cards.css'), /league-promotion-message|weak-link-message/);
});

test('global fragmentler grup içeriği taşımaz', () => {
  const expectations = [
    ['fragments/tesbihat.html', 'class="tesbihat-page"'],
    ['fragments/videos.html', 'class="videos"'],
    ['fragments/tefekkur.html', 'class="tefekkur-page"'],
    ['fragments/articles.html', 'class="articles"']
  ];
  expectations.forEach(([file, marker]) => {
    const content = readPublic(file);
    assert.match(content, new RegExp(marker));
    assert.doesNotMatch(content, /tracker-table-shell|user-cards-section|main-area/);
    assert.doesNotMatch(content, /scroll-fade-in/);
  });

  const tefekkur = readPublic('fragments/tefekkur.html');
  assert.deepEqual(
    Array.from(tefekkur.matchAll(/class="tefekkur-section-row" data-section="([^"]+)"/g), match => match[1]),
    ['ayet', 'hadis', 'dua', 'risale', 'esma', 'zikirmatik', 'kuran-radyo', 'risalet-radyo']
  );
  assert.equal((tefekkur.match(/class="tefekkur-section-list"/g) || []).length, 1);
  assert.doesNotMatch(tefekkur, /tefekkur-home-hero|tefekkur-list-heading|data-section="vecize"/);
  assert.deepEqual(
    Array.from(tefekkur.matchAll(/class="tefekkur-view" data-view="([^"]+)"/g), match => match[1]),
    ['home', 'slider', 'zikirmatik', 'radio']
  );
  assert.match(tefekkur, /id="tefekkurSliderTitle"[\s\S]*?id="tefekkurSliderModes"[\s\S]*?id="tefekkurSliderChip"/);
  assert.match(tefekkur, /id="tefekkurSliderPrev"[\s\S]*?id="tefekkurSliderCounter"[\s\S]*?id="tefekkurSliderNext"[\s\S]*?id="tefekkurSliderCopy"[\s\S]*?Kopyala[\s\S]*?id="tefekkurSliderShare"[\s\S]*?Paylaş/);
  assert.doesNotMatch(tefekkur, /quote-section|home-tefekkur-window|scroll-fade-in/);
  assert.match(readClient('features/tefekkur/tefekkur-slider.css'), /\.tefekkur-slider-stage\s*\{[^}]*touch-action:\s*pan-y;/);
  assert.match(readClient('features/tefekkur/tefekkur-slider.css'), /\.tefekkur-slider-controls\s*\{[^}]*position:\s*sticky;[^}]*bottom:\s*var\(--tf-bottom-offset\);/);

  const articles = readPublic('fragments/articles.html');
  assert.deepEqual(
    Array.from(articles.matchAll(/data-category="([^"]+)"/g), match => match[1]),
    [
      'Think It',
      'Kader',
      "Allah'ın Varlığının Delilleri",
      'Sen Kimsin',
      "İslam'da Adalet",
      'Hadisler',
      "Ahiretin Varlığının Delilleri",
      'Kâinat Rehberi',
      'Gayeli ve Planlı Yaratılış',
      'Temel Sorgulama',
      'Evrim'
    ]
  );
  assert.doesNotMatch(readClient('features/articles/articles.js'), /setupCategories/);
  // Kategori listesi statik kartlardır; "Daha fazla yükle" düğmesi yoktur, kalan makaleler kaydırdıkça yüklenir.
  assert.match(articles, /class="articles-category-card"[^>]*data-slug="think-it"/);
  assert.doesNotMatch(articles, /loadMoreArticles|load-more|Daha Fazla Yükle|articles-bottom-bar/);
  assert.doesNotMatch(readClient('features/articles/articles.js'), /loadMoreArticles|load-more-btn/);
  assert.doesNotMatch(readClient('features/articles/articles.css'), /\.load-more-btn|\.category-btn/);
  assert.match(articles, /data-view="home"[\s\S]*?data-view="category"[\s\S]*?id="articlesContainer"[\s\S]*?id="articlesSentinel"/);
  assert.doesNotMatch(articles, /article-loading-image|article-loading-title|article-loading-text/);
  assert.doesNotMatch(readClient('features/articles/articles.js'), /loadingCard|article-loading-/);
  assert.doesNotMatch(readClient('features/articles/articles.js'), /article-loading-spinner/);
  assert.match(readClient('features/articles/articles.css'), /\.article-loading-image\s*\{[^}]*height:\s*175px;[^}]*article-loading/s);
  assert.match(readClient('features/articles/articles.css'), /\.article-image\s*\{[^}]*width:\s*152px;[^}]*height:\s*152px;[^}]*overflow:\s*hidden;/s);
  assert.match(readClient('features/articles/articles.css'), /\.article-image img\s*\{[^}]*height:\s*100%;[^}]*object-fit:\s*cover;/s);
});

test('makaleler kategori sayfası hazır olunca efektle açılır; makaleler önceden hazırlanır ve kaydırdıkça yüklenir', () => {
  const script = readClient('features/articles/articles.js');
  const styles = readClient('features/articles/articles.css');

  // Sekme açılırken (arka planda ısıtılırken de) her kategorinin ilk makaleleri tek istekle alınır.
  assert.match(script, /this\.loadPreview\(\)\.catch[\s\S]*?this\.render\(this\.readRoute\(\), \{ animate: false \}\);[\s\S]*?this\.schedulePreparation\(\)/);
  assert.match(script, /\/api\/articles\/preview\?perCategory=\$\{PREVIEW_PER_CATEGORY\}/);
  assert.match(script, /async prepareContent\(\)[\s\S]*?connectionAllowsPreparation\(\)[\s\S]*?preloadImage/);
  // Kategori başlığı hemen açılır; makaleler hazır olana kadar container içinde üç noktalı yükleme animasyonu görünür.
  assert.match(script, /\brender\(route, options = \{\}\)[\s\S]*?this\.showCategoryLoading\(route\.category, options\);[\s\S]*?return this\.fillCategory\(route\.category, sequence\)/);
  assert.match(script, /showCategoryLoading\(category, options\)[\s\S]*?this\.container\.replaceChildren\(this\.createLoader\(\)\)[\s\S]*?this\.setView\('category', options\)/);
  assert.match(script, /async fillCategory\(category, sequence\)[\s\S]*?await this\.ensureCategory\(category\)[\s\S]*?await this\.waitForImages\(entry\.articles\)[\s\S]*?this\.showCategoryContent\(entry\)/);
  assert.doesNotMatch(script, /await this\.render\(/);
  assert.match(styles, /\.articles-loader\s*\{[^}]*animation:\s*articles-loader-in[^}]*0\.15s/s);
  assert.match(styles, /\.articles-loader span\s*\{[^}]*border-radius:\s*50%;[^}]*animation:\s*articles-loader-dot/s);
  // Makale sayısı başlığın sağında, parantez içinde ve yeşil değil nötr renkte yazar.
  assert.match(script, /\(\$\{total\} içerik\)/);
  // Kategori sayfasında footer yoktur ve sayfa açılışı etkinlik kaydına yazılır.
  assert.match(styles, /body:has\(\.tab-view-articles \.articles-view\[data-view="category"\]:not\(\[hidden\]\)\) #footerRoot\s*\{\s*display:\s*none;/);
  assert.match(script, /action: 'makaleler_kategori_görüntüleme',\s*view: 'category',\s*section: slug/);
  assert.match(script, /if \(options\.log !== false\) logCategoryView\(/);
  assert.match(script, /log: false \}\)/);
  assert.match(styles, /\.articles-category-count\s*\{[^}]*color:\s*#6c757d;/s);
  assert.match(script, /classList\.add\('is-entering'\)/);
  assert.match(script, /prefersReducedMotion\(\)/);
  // Kalan makaleler IntersectionObserver ile sayfalı istenir.
  assert.match(script, /new IntersectionObserver[\s\S]*?this\.loadMore\(\)/);
  assert.match(script, /fetchPage\(category, entry\.articles\.length, PAGE_SIZE\)/);
  // Kategori URL'de saklanır ve sekme dönüşte görünmeden hazırlanır.
  assert.match(script, /\?kategori=\$\{encodeURIComponent/);
  assert.match(script, /prepareBeforeReveal: true/);
  assert.match(styles, /\.articles-view\.is-entering\s*\{[^}]*animation:\s*articles-view-enter[^}]*backwards/s);
  assert.match(styles, /\.article-card\.is-entering\s*\{[^}]*animation:[^}]*backwards;[^}]*animation-delay:\s*calc\(var\(--card-index, 0\) \* 70ms\)/s);
  assert.match(styles, /prefers-reduced-motion:\s*reduce[\s\S]*?\.article-card\.is-entering[\s\S]*?animation:\s*none;/);
});

test('global sekmeler ilk geçişten önce içerikleriyle birlikte arka planda hazırlanır', () => {
  const router = readPublic('app/shell-router.js');
  const articles = readClient('features/articles/articles.js');
  assert.match(router, /const backgroundViewRoot = document\.createElement\('div'\)/);
  assert.match(router, /function warmGlobalTab\(route\)[\s\S]*?backgroundViewRoot\.appendChild\(view\)[\s\S]*?await initGlobalTab\(route\)[\s\S]*?lifecycleCache\.set\(view, lifecycle\)/);
  assert.match(router, /function prepareGroupTab\(route\)[\s\S]*?resolveGroupContext\(route\.groupId\)[\s\S]*?getView\(route\)[\s\S]*?loadGroupData\(context\)/);
  assert.match(router, /target\.requiresGroup[\s\S]*?resolveRoute\(getRememberedReadingPath\(\)\)[\s\S]*?if \(!rememberedRoute\?\.groupId\) return;[\s\S]*?prepareGroupTab\(rememberedRoute\)/);
  assert.match(router, /function preloadOkumalarAssets\(\)[\s\S]*?OKUMALAR_BACKGROUND_ASSETS[\s\S]*?preloadBundle\(fileName, 'script'\)[\s\S]*?preloadBundle\(fileName, 'style'\)/);
  assert.match(router, /if \(!route\.requiresGroup && !isInitialNavigation && !hasReadyCachedView\(route\)\)[\s\S]*?await warmGlobalTab\(route\)/);
  assert.match(router, /const isFirstWarmActivation = warmedViews\.delete\(activeView\)/);
  assert.match(articles, /this\.ready = this\.init\(\)/);
  assert.match(articles, /async init\(\)[\s\S]*?await window\.articlesManager\.ready/);
});

test('grup dizini shell içinde önbellekte tutularak sekmeler arasında yeniden yüklenmez', () => {
  const router = readPublic('app/shell-router.js');
  const navigation = readPublic('app/navigation.js');
  const routes = readPublic('app/route-config.js');
  const directoryHtml = readPublic('fragments/gruplar.html');
  const directory = readClient('features/group-directory/group-directory.js');
  const directoryStyles = readClient('features/group-directory/group-directory.css');
  const managementStyles = readClient('features/readings/group-management.css');

  assert.match(routes, /name: 'groups',[\s\S]*?fragment: '\/fragments\/gruplar\.html'[\s\S]*?groups-directory\.min\.js[\s\S]*?groups-directory\.min\.css/);
  assert.doesNotMatch(router, /createGroupDirectoryView|new DOMParser\(\)/);
  assert.match(router, /const viewPromise = createFragmentView\(route\.fragment, route\.name\)/);
  assert.match(directoryHtml, /class="main-container"[\s\S]*?id="groupsGrid"[\s\S]*?id="createGroupModal"/);
  assert.doesNotMatch(directoryHtml, /<!DOCTYPE|<html(?:\s|>)|<head(?:\s|>)|<body(?:\s|>)|id="appNavigation"|<script(?:\s|>)|class="site-footer"/i);
  assert.match(router, /activeView && activeView !== view\) activeView\.remove\(\)/);
  assert.match(router, /isPreparingGroupsFirstLoad = route\.name === 'groups' && !lifecycleCache\.has\(view\)[\s\S]*?classList\.toggle\('is-preparing-return', isPreparingGroupsFirstLoad\)[\s\S]*?tabContent\.appendChild\(view\)/);
  assert.match(router, /groups: window\.RoTaKipGroupsTab[\s\S]*?prepareBeforeReveal: false[\s\S]*?!view\?\.isConnected[\s\S]*?new MutationObserver[\s\S]*?view\.isConnected[\s\S]*?disableStyles\(\)/);
  assert.match(router, /async resume\(\)[\s\S]*?detachObserver\?\.disconnect\(\)[\s\S]*?link\.disabled = false[\s\S]*?await lifecycle\?\.resume\?\.\(\)/);
  assert.match(router, /const routeStyleLinks = await loadBundleStyles\(ROUTE_ASSETS\[route\.name\]\.styles\)[\s\S]*?route\.name === 'groups'[\s\S]*?link\.disabled = false[\s\S]*?await activateView\(route(?:, null, \{ keepVisible \})?\)/);
  // Videolar gibi kendi içinde gezinen sekmelerde görünüm gizlenip yeniden açılmaz (sekme girişi efekti oynamaz).
  assert.match(router, /keepVisible = !isInitialNavigation[\s\S]*?keepVisibleInTab === true;[\s\S]*?activateView\(route, null, \{ keepVisible \}\)/);
  assert.match(router, /if \(!options\.keepVisible\) view\.classList\.remove\('visible'\)/);
  assert.match(router, /if \(!keepVisible\) activeView\.classList\.add\('is-preparing-return'\)/);
  assert.match(readClient('features/videos/videos-tab.js'), /keepVisibleInTab: true/);
  assert.match(readClient('shell/shell.css'), /\.tab-view\.is-preparing-return\s*\{[^}]*visibility:\s*hidden/s);
  assert.match(router, /window\.navigateRoTaKip = path => navigate\(new URL\(path, window\.location\.origin\)\)/);
  assert.match(router, /window\.refreshRoTaKipRoute = \(\) => navigate\(new URL\(window\.location\.href\), \{ fromPopState: true \}\)/);
  assert.match(navigation, /route\.navigationName \|\| route\.name/);
  assert.doesNotMatch(navigation, /missingGroup === 'true'/);
  assert.match(directory, /function navigateFromGroupDirectory\(path\)[\s\S]*?window\.navigateRoTaKip\(path\)/);
  assert.equal((directory.match(/navigateFromGroupDirectory\(`\/grup\//g) || []).length, 3);
  assert.match(directory, /const openGroup = \(\) =>[\s\S]*?navigateFromGroupDirectory\(`\/grup\/\$\{encodeURIComponent\(group\.groupId\)\}\/`\)/);
  assert.match(directory, /isUserGroup[\s\S]*?class="view-group-btn"[\s\S]*?Grubu Görüntüle/);
  assert.match(directory, /viewGroupBtn\?\.addEventListener\('click',[\s\S]*?e\.stopPropagation\(\)[\s\S]*?openGroup\(\)[\s\S]*?card\.addEventListener\('click', openGroup\)/);
  assert.match(directoryStyles, /\.group-stats\s*\{[\s\S]*?position:\s*static/);
  assert.match(directoryStyles, /\.join-group-btn,[\s\S]*?\.view-group-btn\s*\{[\s\S]*?position:\s*static/);
  assert.match(directoryStyles, /\.groups-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(directoryStyles, /@media \(max-width:\s*768px\)[\s\S]*?\.groups-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(directoryStyles, /\/\* ==================== Viewport layout refinements ==================== \*\/[\s\S]*?@media \(max-width:\s*768px\)[\s\S]*?\.group-card\s*\{[^}]*min-height:\s*226px;[^}]*\}[\s\S]*?\.user-group-badge\s*\{[^}]*width:\s*32px;[^}]*height:\s*32px;[^}]*\}[\s\S]*?\.user-group-badge i\s*\{[^}]*font-size:\s*12px;/s);
  assert.match(directoryStyles, /\.user-group-badge i\s*\{\s*font-size:\s*14px;\s*\}/);
  assert.match(directoryStyles, /@media \(max-width:\s*1023px\)[\s\S]*?bottom:\s*calc\(81px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(directoryStyles, /@media \(max-width:\s*640px\)[\s\S]*?bottom:\s*calc\(59px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(directoryHtml, /class="groups-directory-ready-images-btn"[\s\S]*?avatar-picker-sparkle[^>]*>✨<[\s\S]*?Avatar seç/);
  assert.equal((directoryHtml.match(/✨/g) || []).length, 3);
  assert.match(directoryHtml, /class="groups-directory-form-group"/);
  assert.match(directoryHtml, /class="groups-directory-ready-images-modal"/);
  assert.match(directoryHtml, /id="groupsDirectoryReadyImagesModal"/);
  assert.match(directoryHtml, /id="groupsDirectoryAvatarGrid"/);
  assert.match(directory, /className = 'groups-directory-avatar-item'/);
  assert.match(directory, /groupImageInput\.addEventListener\('change',[\s\S]*?this\.selectedAvatarPath = null/);
  assert.match(directory, /function setAvatarPickerButtonState\(buttonId, isSelected\)[\s\S]*?Avatar seçildi[\s\S]*?classList\.toggle\('is-selected', isSelected\)/);
  assert.doesNotMatch(directory, /fileInputText\.textContent = '(?:Avatar seçildi|Hazır görsel seçildi)'/);
  assert.match(directory, /getElementById\('groupsDirectoryReadyImagesModal'\)/);
  assert.match(directory, /getElementById\('groupsDirectoryAvatarGrid'\)/);
  assert.match(directoryStyles, /\.input-container\.image-source-picker\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto/s);
  assert.match(directoryStyles, /\.input-container \.file-input-label\s*\{[^}]*height:\s*52px/s);
  assert.match(directoryStyles, /\.tab-view-groups \.groups-directory-ready-images-btn,[\s\S]*?min-width:\s*132px;[\s\S]*?justify-content:\s*flex-start;[\s\S]*?position:\s*static;/);
  assert.match(directoryStyles, /@media \(max-width:\s*480px\)[\s\S]*?\.input-container\.image-source-picker\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(managementStyles, /\.tab-view-okumalar \.ready-images-btn\s*\{[\s\S]*?width:\s*100%;/);
  assert.doesNotMatch(managementStyles, /^\.ready-images-btn/m);
  assert.match(managementStyles, /#overlayRoot \.ready-images-modal\s*\{/);
  const directoryClassNames = collectCssClasses(directoryStyles);
  const managementClassNames = collectCssClasses(managementStyles);
  const sharedFeatureClassNames = [...directoryClassNames]
    .filter(className => managementClassNames.has(className))
    .sort();
  assert.deepEqual(sharedFeatureClassNames, ['selected', 'show']);
  const commonOverlayIds = new Set(collectIds(readPublic('fragments/common-overlays.html')));
  const sharedDirectoryOverlayIds = collectIds(directoryHtml)
    .filter(id => commonOverlayIds.has(id));
  assert.deepEqual(sharedDirectoryOverlayIds, []);
  assert.match(router, /function getViewCacheKey\(route\)[\s\S]*?route\.name === 'okumalar'[\s\S]*?return 'okumalar'/);
  assert.match(router, /const okumalarStyleLinks = new Set\(\)[\s\S]*?function setOkumalarStylesEnabled\(enabled\)[\s\S]*?link\.disabled = !okumalarStylesEnabled/);
  assert.match(router, /async function loadOkumalarStyles\(fileNames\)[\s\S]*?loadBundleStyles\(fileNames\)[\s\S]*?okumalarStyleLinks\.add\(link\)/);
  assert.match(router, /activeLifecycle = null;[\s\S]*?if \(route\.requiresGroup\) setOkumalarStylesEnabled\(true\);[\s\S]*?configureNavigation/);
  assert.match(router, /function waitForStyleApplication\(styleLinks\)[\s\S]*?requestAnimationFrame\(\(\) => window\.requestAnimationFrame\(resolve\)\)/);
  assert.match(router, /criticalStyleLinks[\s\S]*?await waitForStyleApplication\(criticalStyleLinks\)[\s\S]*?await activateView\(route, preparedView\)/);
  assert.match(router, /if \(!groupViewPrepared\)[\s\S]*?await activateView\(route(?:, null, \{ keepVisible \})?\);[\s\S]*?if \(sequence !== navigationSequence\) return;[\s\S]*?setOkumalarStylesEnabled\(false\)/);
  assert.doesNotMatch(router, /activeLifecycle = null;\s*setOkumalarStylesEnabled\(route\.requiresGroup\)/);
  assert.match(router, /const criticalStyles = isInviteOnboarding[\s\S]*?: \['group-common\.min\.css', \.\.\.ROUTE_ASSETS\[route\.name\]\.styles\][\s\S]*?loadOkumalarStyles\(criticalStyles\)/);
  assert.match(router, /loadAssetGroup[\s\S]*?loadOkumalarStyles\(assets\.styles\)/);
  assert.match(router, /function resetOkumalarViewForGroup\(nextGroupId\)[\s\S]*?resetTrackerTimelineForGroup\?\.\(\)[\s\S]*?viewCache\.get\('okumalar'\)[\s\S]*?lifecycleCache\.delete\(okumalarView\)[\s\S]*?groupWarmups\.clear\(\)/);
  assert.match(router, /if \(route\.requiresGroup\) resetOkumalarViewForGroup\(route\.groupId\)/);
  assert.match(router, /const groupChanged = Boolean\(mountedGroupId && mountedGroupId !== route\.groupId\)[\s\S]*?resetRoTaKipGroupBootstrap\?\.\(route\.groupId\)/);
  assert.match(router, /window\.invalidateRoTaKipGroupCache = function[\s\S]*?invalidateGroupContext\(groupId\)[\s\S]*?groupWarmups\.clear\(\)[\s\S]*?leavesMountedGroup[\s\S]*?invalidateRoTaKipGroupCache\(mountedGroupId\)/);
  assert.match(router, /applyResolvedGroupContext\?\.\(context\)[\s\S]*?globalDataStore\.replaceData\(route\.groupId, data\)/);
  assert.doesNotMatch(router, /mountedGroupId && mountedGroupId !== route\.groupId\)[\s\S]{0,100}?window\.location\.assign/);
  assert.match(readClient('features/groups/group-bootstrap.js'), /window\.resetRoTaKipGroupBootstrap = function[\s\S]*?window\.rotakipGroupBootstrapPromise = null[\s\S]*?options\.preserveSession !== true[\s\S]*?LocalStorageManager\.logoutUser\(\)/);
  assert.match(readClient('features/groups/group-bootstrap.js'), /window\.applyResolvedGroupContext = function[\s\S]*?LocalStorageManager\.loginUser\([\s\S]*?LocalStorageManager\.logoutUser\(\)[\s\S]*?syncGroupManagementVisibility/);
  assert.match(readClient('features/groups/group-bootstrap.js'), /replaceData\(groupId, data\)[\s\S]*?this\.groupId = groupId[\s\S]*?this\._rebuildIndexes\(\)/);
  assert.match(readClient('features/groups/admin-modal.js'), /LocalStorageManager\.loginUser\([\s\S]*?invalidateRoTaKipGroupCache\?\.[\s\S]*?LocalStorageManager\.logoutUser\(\)[\s\S]*?invalidateRoTaKipGroupCache\?\./);
  assert.match(readClient('features/groups/admin-modal.js'), /if \(requiresPrivateGroupBootstrap\)[\s\S]*?resetRoTaKipGroupBootstrap\?\.\(data\.groupId, \{ preserveSession: true \}\)[\s\S]*?refreshRoTaKipRoute\(\)\.catch[\s\S]*?window\.location\.reload\(\)/);
  assert.match(directory, /case 'accepted':[\s\S]*?invalidateRoTaKipGroupCache\?\.\(groupId\)/);
  assert.match(directory, /window\.RoTaKipGroupsTab = \{[\s\S]*?init: initializeGroupDirectory[\s\S]*?resume\(\)[\s\S]*?destroy\(\)/);
  assert.match(directory, /renderGroups\(\)[\s\S]*?if \(!groupsGrid \|\| !noResults\) return/);
  assert.match(directory, /async refreshForResume\(\)[\s\S]*?resumeRefreshPromise[\s\S]*?LocalStorageManager\.refreshMemberships\(\)[\s\S]*?const publicGroups[\s\S]*?this\.groups = \[\.\.\.userGroups, \.\.\.publicGroups\][\s\S]*?groupsGrid'\)\?\.replaceChildren\(\)[\s\S]*?renderGroups\(\{ animateEntrance: false \}\)/);
  assert.match(directory, /groupsPageInstance = new GroupsPage\(\)[\s\S]*?await groupsPageInstance\.ready/);
  assert.match(directory, /async resume\(\)\s*\{[\s\S]*?await groupsPageInstance\?\.refreshForResume\(\)/);
  assert.match(directory, /^\(\(\) => \{[\s\S]*?\}\)\(\);\s*$/);
  assert.doesNotMatch(router, /iframe|groupsDirectoryFrame|postMessage/);
  assert.doesNotMatch(directoryStyles, /groups-directory-embedded|\.app-navigation/);
  assert.match(directoryStyles, /\.tab-view-groups,[\s\S]*?\.tab-view-groups \*[\s\S]*?box-sizing:\s*border-box/);
  assert.match(readClient('shell/shell.css'), /\.tab-view-groups \.group-avatar-image\s*\{[^}]*width:\s*50px;[^}]*height:\s*50px;[^}]*object-fit:\s*cover;/s);
});

test('davet kaydı tamamlanınca grup sayfası yeni üyelik oturumuyla yeniden kurulur', () => {
  const adminModal = readClient('features/groups/admin-modal.js');

  assert.match(
    adminModal,
    /if \(updateData\.success\)[\s\S]*?LocalStorageManager\.loginUser\([\s\S]*?invalidateRoTaKipGroupCache\?\.\(updateData\.groupId\)[\s\S]*?const groupPath = `\/grup\/\$\{encodeURIComponent\(updateData\.groupId\)\}\/`;[\s\S]*?window\.location\.replace\(groupPath\);[\s\S]*?return;/
  );
});

test('davet onboarding görünümü okuma verilerini ve bileşenlerini başlatmaz', () => {
  const router = readPublic('app/shell-router.js');
  const adminModal = readClient('features/groups/admin-modal.js');

  assert.match(router, /function isInviteOnboardingRoute\(route, url\)[\s\S]*?route\?\.name === 'okumalar'[\s\S]*?searchParams\.has\('quick-login'\)[\s\S]*?searchParams\.get\('invite'\)/);
  assert.match(router, /const criticalScripts = isInviteOnboarding[\s\S]*?GROUP_COMMON_SCRIPTS[\s\S]*?const criticalStyles = isInviteOnboarding[\s\S]*?\['group-common\.min\.css'\][\s\S]*?createFragmentView\('\/fragments\/group-header\.html', route\.name\)/);
  assert.match(router, /const data = isInviteOnboarding \? null : await loadGroupData\(groupContext\)/);
  assert.match(router, /async function initOkumalarTab\(options = \{\}\)[\s\S]*?if \(options\.inviteOnboarding === true\)[\s\S]*?initializeGroupUi\(\)[\s\S]*?initializeGroupPage\(\)[\s\S]*?return \{[\s\S]*?readyForPrefetch: Promise\.resolve\(\)[\s\S]*?await loadOkumalarStyles/);
  assert.match(adminModal, /function handleWelcomeModalClose\(\)[\s\S]*?window\.location\.replace\('\/gruplar'\)[\s\S]*?window\.location\.replace\(cleanUrl\)/);
});

test('Videolar sekmesi akış, izleme, Shorts ve Hesabım bölümlerinden oluşur; modal kullanmaz', () => {
  const fragment = readPublic('fragments/videos.html');
  ['feed', 'watch', 'shorts', 'library'].forEach(view => {
    assert.match(fragment, new RegExp(`class="videos-view" data-view="${view}"`));
  });
  assert.match(fragment, /data-section="feed" href="\/videolar"[\s\S]*?data-section="shorts" href="\/videolar\?bolum=shorts"[\s\S]*?data-section="library" href="\/videolar\?bolum=hesabim"/);
  assert.doesNotMatch(fragment, /videoModal|videoFrame|video-modal/);
  assert.doesNotMatch(readClient('features/videos/videos-base.css'), /(^|\n)\s*iframe\s*\{/);

  const tab = readClient('features/videos/videos-tab.js');
  assert.match(tab, /window\.RoTaKipVideoTab = \{[\s\S]*?prepareBeforeReveal:\s*true,[\s\S]*?init,[\s\S]*?resume,[\s\S]*?destroy/);
  assert.match(tab, /params\.get\('izle'\)[\s\S]*?bolum === 'shorts'[\s\S]*?bolum === 'hesabim'/);
  assert.doesNotMatch(readClient('features/videos/videos-feed.js'), /scroll-fade-in|observeScrollFadeIn/);
});

test('Videolar sekmesinde footer yoktur; menü ve bölüm sekmeleri kaydırmaya göre gizlenir', () => {
  const base = readClient('features/videos/videos-base.css');
  // Seçici yalnızca açık sekmeyi hedefler (kabuğun arka planda ısıttığı görünüm #tabContent dışındadır).
  assert.match(base, /body:has\(#tabContent > \.tab-view-videos\) #footerRoot\s*\{\s*display:\s*none;/);
  assert.match(base, /\.videos\.is-chrome-hidden \.videos-sections\s*\{[^}]*opacity:\s*0;[^}]*transform:\s*translateY\(-110%\)/);
  assert.match(base, /@media \(max-width:\s*1023px\)[\s\S]*?body\.videos-chrome-hidden \.app-navigation\s*\{[^}]*transform:\s*translateY/);
  assert.match(base, /prefers-reduced-motion:\s*reduce[\s\S]*?body\.videos-chrome-active \.app-navigation\s*\{\s*transition:\s*none;/);

  const tab = readClient('features/videos/videos-tab.js');
  assert.match(tab, /function onChromeScroll\(\)[\s\S]*?currentRoute\?\.view === 'shorts'[\s\S]*?setChromeHidden\(/);
  // Sekmeden ayrılırken menü eski haline döner.
  assert.match(tab, /function destroy\(\)[\s\S]*?setChromeEnabled\(false\)/);
  assert.match(readClient('features/videos/videos-watch.css'), /\.videos-watch-stage\s*\{[^}]*top:\s*var\(--videos-sticky-top\)/);
  // Kaydırma tutturması ilk çipi kenara yapıştırdığından çip satırında kullanılmaz.
  assert.doesNotMatch(readClient('features/videos/videos-feed.css'), /\.videos-chips\s*\{[^}]*scroll-snap-type/);
});

test('Videolar Hesabım görünümü: başlıksız, gizli kaydırma çubuklu, ⋯ menülü koleksiyonlar; sekmeler gizlenmez', () => {
  const fragment = readPublic('fragments/videos.html');
  assert.match(fragment, /data-section="library"[^>]*>Hesabım<\/a>/);
  const library = readClient('features/videos/videos-library.js');
  assert.doesNotMatch(library, /videos-library-header/);
  assert.match(library, /videos-collections">\s*<h2 class="videos-block-title">Kitaplık<\/h2>/);
  assert.match(library, /videos-collection-stack[\s\S]*?videos-collection-cover[\s\S]*?data-action="collection-menu"/);
  const css = readClient('features/videos/videos-library.css');
  assert.match(css, /\.videos-channel-row::-webkit-scrollbar\s*\{\s*display:\s*none;/);
  assert.match(css, /\.videos-library \.videos-shelf-row,\s*\.videos-channel-row\s*\{\s*scrollbar-width:\s*none;/);
  const tab = readClient('features/videos/videos-tab.js');
  assert.match(tab, /function onChromeScroll\(\)[\s\S]*?currentRoute\?\.view === 'library'[\s\S]*?setChromeHidden\(false\)/);
  assert.match(tab, /action === 'collection-clear'/);
  assert.match(readClient('features/videos/videos-store.js'), /clearList\(listName\)/);
});

test('Video ve Shorts 5 saniye oynatılınca izlendi sayılır; ilerleme ve devam konumu bundan bağımsızdır', () => {
  const store = readClient('features/videos/videos-store.js');
  assert.match(store, /const WATCHED_SECONDS = 5;/);
  assert.match(store, /function isWatchedProgress\(position, duration\)[\s\S]*?Math\.min\(WATCHED_SECONDS, duration\)/);
  assert.doesNotMatch(store, /COMPLETED_RATIO|SHORTS_COMPLETED/);
  assert.match(store, /resumePosition\(id\)\s*\{\s*const entry = indexes\.history\.get\(id\);\s*if \(!entry \|\| !entry\.duration\) return 0;/);
  assert.match(readClient('features/videos/videos-shorts.js'), /currentTime\(\) >= ns\.store\.WATCHED_SECONDS/);
  assert.match(readClient('features/videos/videos-watch.js'), /currentTime\(\) >= ns\.store\.WATCHED_SECONDS/);
});

test('Shorts iframe\'i yatay (16:9) tutulur; YouTube\'un dikey Shorts arayüzü çerçeve dışında kalır', () => {
  const shorts = readClient('features/videos/videos-shorts.js');
  assert.match(shorts, /const frameWidth = videoHeight \* \(16 \/ 9\);[\s\S]*?width: `\$\{frameWidth\}px`,\s*height: `\$\{videoHeight\}px`/);
});

test('Videolar Shorts sağ üstteki yatay ⋯ menüsünden tam ekrana alınır ya da kanal önerilmez, Shorts dışında çıkılır', () => {
  assert.match(readPublic('fragments/videos.html'), /data-view="shorts"[\s\S]*?class="videos-shorts-more" data-action="shorts-more"[^>]*><i class="fa-solid fa-ellipsis"/);
  const tab = readClient('features/videos/videos-tab.js');
  assert.match(tab, /function syncShortsTheme\(\)[\s\S]*?if \(!inShorts\) exitFullscreen\(\);/);
  assert.match(tab, /function toggleFullscreen\(\)[\s\S]*?requestFullscreen\(\{ navigationUI: 'hide' \}\)/);
  assert.match(tab, /function openShortsMoreMenu\(button\)[\s\S]*?data-action="shorts-fullscreen"[\s\S]*?data-action="shorts-hide-channel"[\s\S]*?Bu kanalı önerme/);
  assert.match(readPublic('fragments/videos.html'), /class="videos-shorts-sound" data-action="shorts-sound"/);
  assert.match(tab, /action === 'shorts-sound'[\s\S]*?ns\.shorts\.toggleMute\(\)/);
  assert.match(tab, /function setShortsPaused\(paused\)[\s\S]*?if \(paused\) syncShortsSound\(\)/);
  assert.match(readClient('features/videos/videos-shorts.css'), /\.videos\.is-shorts-paused \.videos-shorts-sound\s*\{[^}]*display:\s*grid;/);
  assert.match(readClient('features/videos/videos-shorts.css'), /\.videos-shorts-sound\.is-pressed::after\s*\{[^}]*animation:\s*videos-shorts-sound-ripple/);
  assert.match(readClient('features/videos/videos-shorts.css'), /\n {2}\.videos-shorts-sound\s*\{[^}]*background:\s*transparent;/);
  assert.match(tab, /classList\.add\('is-pressed'\)/);
  assert.match(tab, /action === 'shorts-more'/);
  assert.match(tab, /action === 'shorts-fullscreen'/);
  assert.match(tab, /action === 'shorts-hide-channel'[\s\S]*?ns\.store\.setFollow\(channelId, false\)/);
  assert.match(tab, /addEventListener\('fullscreenchange', syncFullscreenMenu\)/);
  assert.doesNotMatch(tab, /enterImmersive/);
  assert.match(readClient('features/videos/videos-shorts.css'), /\.videos-shorts-more,\s*\.videos-shorts-sound\s*\{[^}]*position:\s*absolute;[^}]*right:\s*12px;/);
});

test('Videolar bölüm sekmeleri YouTube gibi düz metin ve kırmızı alt çizgilidir', () => {
  const fragment = readPublic('fragments/videos.html');
  assert.doesNotMatch(fragment.match(/<nav class="videos-sections"[\s\S]*?<\/nav>/)[0], /<i class=|<svg/);
  const base = readClient('features/videos/videos-base.css');
  assert.match(base, /\.videos-sections\s*\{[^}]*justify-content:\s*flex-start;[^}]*overflow-x:\s*auto;/);
  // Kırmızı çizgi her sekmede genişleyerek belirmez: nav içindeki tek gösterge sekmeler arasında kayar.
  assert.match(fragment.match(/<nav class="videos-sections"[\s\S]*?<\/nav>/)[0], /<span class="videos-section-indicator"/);
  assert.doesNotMatch(base, /\.videos-section-tab(?:\.is-active)?::after/);
  assert.match(base, /\.videos-section-indicator\s*\{[^}]*height:\s*2px;[^}]*border-radius:\s*3px;[^}]*background:\s*var\(--videos-accent\)[^}]*transform:\s*translateX\(var\(--indicator-x/);
  assert.match(base, /\.videos-section-indicator\.is-ready\s*\{[^}]*transition:\s*transform[^}]*width/);
  // Gösterge yeni sekmeye geçerken çizginin üstünden yükselen kırmızı ışıma (::before) oynar.
  assert.match(base, /\.videos-section-indicator\.is-rising::before\s*\{[^}]*animation:\s*videos-tab-rise/);
  assert.match(base, /@keyframes videos-tab-rise/);
  assert.match(readClient('features/videos/videos-tab.js'), /function placeIndicator\([\s\S]*?--indicator-x[\s\S]*?is-ready/);
  assert.doesNotMatch(base, /\.videos-section-tab\.is-active\s*\{[^}]*background:\s*var\(--videos-text\)/);
});

test('Video kartının alt satırı "▷ 466 B   4 ay önce" biçimindedir', () => {
  const feed = readClient('features/videos/videos-feed.js');
  assert.match(feed, /function statsHtml\(video\)[\s\S]*?videos-card-play[\s\S]*?formatViewsCompact\(video\.views\)[\s\S]*?videos-card-date/);
  assert.doesNotMatch(feed, /videos-card-stats">\$\{ns\.escape\(ns\.formatMeta/);
  assert.match(readClient('features/videos/videos-core.js'), /ns\.formatViewsCompact = function/);
  assert.match(readClient('features/videos/videos-feed.css'), /\.videos-card-stats\s*\{[^}]*display:\s*flex;[^}]*gap:\s*14px;/);
});

test('Videolar önizlemesinde ses düğmesi bulunur; altyazı yoktur', () => {
  const feed = readClient('features/videos/videos-feed.js');
  assert.match(feed, /data-action="preview-sound"/);
  assert.match(feed, /toggleSound\(\)[\s\S]*?this\.player\.unMute\(\)/);
  assert.match(readClient('features/videos/videos-tab.js'), /action === 'preview-sound'/);
  assert.match(readClient('features/videos/videos-feed.css'), /\.videos-preview-layer\.is-playing \.videos-preview-controls\s*\{\s*visibility:\s*visible;/);
  ['videos-feed.js', 'videos-tab.js', 'videos-player.js', 'videos-store.js'].forEach(file => {
    assert.doesNotMatch(readClient(`features/videos/${file}`), /[Cc]aptions/);
  });
});

test('Videolar kanal seçimi bölüm sekmelerinin sonundaki açılır liste (combobox) ile yapılır', () => {
  const fragment = readPublic('fragments/videos.html');
  assert.doesNotMatch(fragment, /videosChips|videos-chips/);
  const feed = readClient('features/videos/videos-feed.js');
  assert.match(feed, /renderChannelTabs\(\)\s*\{[\s\S]*?class="videos-channel-select" role="combobox"/);
  assert.match(feed, /role="option"[\s\S]*?data-channel-filter/);
  assert.match(feed, /option\('', 'Tümü'/);
  assert.doesNotMatch(feed, /videos-channel-tab/);
  const tab = readClient('features/videos/videos-tab.js');
  // Kanal seçimi bölüm geçişi değil kanal süzgeci olarak ele alınır.
  assert.match(tab, /closest\('\.videos-section-tab\[data-section\], \[data-section-link\]'\)/);
  assert.match(readClient('features/videos/videos-base.css'), /\.videos \.videos-channel-select\s*\{[^}]*margin-left:\s*auto;/);
});

test('Videolar önizlemesinde sürüklenebilir ilerleme çubuğu ve kalan süre bulunur', () => {
  const feed = readClient('features/videos/videos-feed.js');
  assert.match(feed, /videos-preview-seek" role="slider"/);
  assert.match(feed, /bindSeek\(\)\s*\{[\s\S]*?setPointerCapture[\s\S]*?seekToRatio/);
  assert.match(feed, /showProgress\(ratio\)\s*\{[\s\S]*?formatDuration\(Math\.max\(0, duration - clamped \* duration\)\)/);
  assert.match(readClient('features/videos/videos-player.js'), /seek: seconds => ready && player\.seekTo\(/);
  const css = readClient('features/videos/videos-feed.css');
  assert.match(css, /\.videos \.videos-preview-button\s*\{[^}]*background:\s*rgba\(96,\s*96,\s*96,\s*0\.55\);[^}]*color:\s*#ffffff;/);
  assert.doesNotMatch(css, /is-faded/);
  assert.match(css, /\.videos-preview-seek\s*\{[^}]*touch-action:\s*none;/);
});

test('Videolar izleme sayfasından akışa dönünce video mini oynatıcıda sürer; Shorts tam ekrandır', () => {
  const tab = readClient('features/videos/videos-tab.js');
  assert.match(tab, /const minimize = changedView[\s\S]*?previous\?\.view === 'watch'[\s\S]*?ns\.watch\.canMinimize\(\)/);
  // Sekme içi geri/ileri destroy() → resume() yolundan geçer; izleme videosu destroy()'da durdurulmaz.
  assert.match(tab, /function destroy\(\)[\s\S]*?currentRoute\.view !== 'watch'\) sections\[currentRoute\.view\]\.leave\(\)/);
  const css = readClient('features/videos/videos-watch.css');
  assert.match(css, /\.videos\.has-mini-player \.videos-watch-stage\s*\{[^}]*position:\s*fixed;/);
  assert.match(css, /\.tab-view-videos\.visible\s*\{[^}]*transform:\s*none;[^}]*animation-fill-mode:\s*backwards;/);
  assert.match(readPublic('fragments/videos.html'), /data-mini="expand"[\s\S]*?data-mini="toggle"[\s\S]*?data-mini="close"/);
  const shorts = readClient('features/videos/videos-shorts.css');
  assert.match(shorts, /\.videos\[data-view="shorts"\]:not\(\.is-shorts-paused\) \.videos-sections\s*\{[^}]*opacity:\s*0;/);
  assert.match(readClient('features/videos/videos-shorts.js'), /ns\.tab\.setShortsPaused\(this\.userPaused\)/);
});

test('Mini oynatıcı sürüklenir, Shorts sesi açık başlar ve durdurulunca kırmızı daireli çubukla sarılır', () => {
  const mini = readClient('features/videos/videos-mini.js');
  assert.match(mini, /ns\.mini = \{ init, sync, capture, shrinkFrom \}/);
  // Akıştan mini oynatıcıya geçerken oynatıcı bulunduğu yerden sağ alta küçülerek kayar (FLIP).
  assert.match(mini, /function playShrink\(first\)[\s\S]*?stage\.animate\([\s\S]*?translate\([\s\S]*?scale\(/);
  // Kabuk görünümü dönüşümlü hazırlarken (position: fixed o ataya göre konumlanır) ölçüm, görünüm oturana kadar ertelenir.
  assert.match(mini, /function shrinkFrom\(first\)[\s\S]*?viewSettled\(\)[\s\S]*?playShrink\(first\)/);
  assert.match(mini, /function viewSettled\(\)[\s\S]*?is-preparing-return[\s\S]*?getAnimations\(\)\.length === 0/);
  assert.match(readClient('features/videos/videos-tab.js'), /const first = on && !miniActive \? ns\.mini\.capture\(\) : null;[\s\S]*?ns\.mini\.shrinkFrom\(first\)/);
  assert.match(mini, /setPointerCapture[\s\S]*?stage\.classList\.add\('is-dragging'\)/);
  const watchCss = readClient('features/videos/videos-watch.css');
  assert.match(watchCss, /\.videos-mini-controls[\s\S]*?touch-action:\s*none;/);
  assert.doesNotMatch(watchCss, /videos-mini-enter/);
  const shorts = readClient('features/videos/videos-shorts.js');
  assert.match(shorts, /applySound\(player\)[\s\S]*?this\.userMuted/);
  assert.match(shorts, /bindSeek\(\)[\s\S]*?!this\.userPaused/);
  const shortsCss = readClient('features/videos/videos-shorts.css');
  assert.match(shortsCss, /\.videos-short\.is-paused \.videos-short-seek-thumb\s*\{[^}]*display:\s*block;/);
  // Kendi "Sesi aç" düğmemiz yoktur; sessiz başlayan Shorts'a dokunmak sesi açar.
  assert.doesNotMatch(shortsCss + shorts, /videos-short-sound/);
  assert.match(shorts, /tap\(\)\s*\{\s*if \(this\.muted\) this\.toggleSound\(\);\s*else this\.togglePlay\(\);/);
  assert.match(readClient('features/videos/videos-tab.js'), /action === 'short-toggle'\) ns\.shorts\.tap\(\)/);
  // Beğeni/kaydetme bildirimi gösterilmez; bildirim kutusu içeriği kadar genişler.
  assert.doesNotMatch(readClient('features/videos/videos-tab.js'), /Beğendiğin videolara eklendi|Kaydedilenlere eklendi/);
  assert.match(readClient('features/videos/videos-base.css'), /\.videos-toast\s*\{[^}]*width:\s*max-content;/);
});

test('Shorts görünümünde alt menü koyu temaya geçer', () => {
  const tab = readClient('features/videos/videos-tab.js');
  assert.match(tab, /function syncShortsTheme\(\)[\s\S]*?const inShorts = enabled && currentRoute\?\.view === 'shorts';\s*document\.body\.classList\.toggle\('videos-shorts-view', inShorts\)/);
  assert.match(tab, /resetChrome\(\);[^]*?syncShortsTheme\(\);/);
  assert.match(readClient('features/videos/videos-shorts.css'), /body\.videos-shorts-view \.app-navigation\s*\{[^}]*background:\s*#0f0f0f;/);
});

test('Videolar önizlemesi oynatıcıyı önceden kurar, video oynar oynamaz gösterir ve süre sınırı koymaz', () => {
  const feed = readClient('features/videos/videos-feed.js');
  assert.match(feed, /enable\(\)\s*\{[\s\S]*?ns\.idle\(\(\) => this\.prewarm\(\)/);
  assert.match(feed, /prewarm\(retry = true\)[\s\S]*?autoplay:\s*false/);
  assert.match(feed, /showPlaying\(\)\s*\{[\s\S]*?this\.reveal\(\);\s*\},/);
  assert.doesNotMatch(feed, /PREVIEW_TOUCH_REVEAL_DELAY_MS|PREVIEW_MAX_MS|revealTimer|stopTimer/);
  assert.match(feed, /PREVIEW_SCROLL_IDLE_MS = 150/);
});

test('Videolar sekmesi başka sekmedeyken ana akışı ve ilk küçük resimleri önceden hazırlar', () => {
  const tab = readClient('features/videos/videos-tab.js');
  const store = readClient('features/videos/videos-store.js');
  // Önce cihazdaki son yanıt çizilir, ardından sunucudan tazelenir.
  assert.match(tab, /function loadHome\([\s\S]*?ns\.store\.readHomeCache\(excludeKey\)[\s\S]*?ns\.api\.home\(excludeKey\)[\s\S]*?ns\.store\.writeHomeCache/);
  assert.match(tab, /function schedulePreparation\(\)[\s\S]*?connectionAllowsPreparation\(\)[\s\S]*?firstThumbnails[\s\S]*?firstPosters[\s\S]*?preloadImage/);
  // Isınmış sekmenin ilk gösterimi için kabuğun gezinme olayı dinlenir.
  assert.match(tab, /rotakip:primary-content-ready/);
  assert.match(store, /const HOME_CACHE_KEY = 'rotakip:videos:home-cache'/);
  // YouTube oynatıcı betiği yalnızca Videolar sekmesinde yüklenir.
  assert.match(readClient('features/videos/videos-player.js'), /loadExternalScriptOnce\(API_SRC\)/);
  assert.match(readClient('features/videos/videos-player.js'), /www\.youtube-nocookie\.com/);
});

test('Tefekkür bölümleri sekme içi URL ile açılır ve kaydırmalı okuyucu kullanır', () => {
  const tab = readClient('features/tefekkur/tefekkur-tab.js');
  const slider = readClient('features/tefekkur/tefekkur-slider.js');
  const core = readClient('features/tefekkur/tefekkur-core.js');
  assert.match(tab, /params\.get\('bolum'\)[\s\S]*?params\.get\('mod'\)/);
  assert.match(tab, /prepareBeforeReveal:\s*true/);
  assert.match(tab, /async resume\(\)\s*\{\s*await render\(readRoute\(\)\);/);
  assert.match(tab, /HISTORY_MARKER[\s\S]*?window\.history\.back\(\)/);
  assert.match(core, /risale:\s*\{[\s\S]*?kind:\s*'slides'[\s\S]*?defaultMode:\s*'metin'[\s\S]*?metin:[\s\S]*?resim:/);
  assert.match(tab, /\.tefekkur-slider-mode[\s\S]*?\{ replace: true \}/);
  assert.match(tab, /async function prepareContent\(\)[\s\S]*?connectionAllowsPreparation\(\)[\s\S]*?ns\.slider\.prefetch\(source\)[\s\S]*?ns\.radio\.preload\(\)/);
  assert.match(tab, /await render\(readRoute\(\)\);\s*schedulePreparation\(\);/);
  assert.match(tab, /action:\s*'tefekkur_bölüm_görüntüleme'[\s\S]*?section:\s*route\.bolum[\s\S]*?mode:\s*route\.mod/);
  assert.match(tab, /if \(route\.view !== 'home'\) logTefekkurView\(route\);/);
  assert.match(readClient('features/site-activity-admin/site-activity-admin.js'), /case 'tefekkur_bölüm_görüntüleme':[\s\S]*?formatTefekkurBolumEylem\(log\)/);
  assert.match(core, /esma:\s*\{[\s\S]*?source:\s*\{\s*type:\s*'esma'\s*\}[\s\S]*?chip:\s*'index'/);
  assert.match(slider, /addEventListener\('pointerdown'[\s\S]*?addEventListener\('pointermove'[\s\S]*?addEventListener\('pointerup'[\s\S]*?addEventListener\('pointercancel'/);
  assert.match(slider, /event\.key !== 'ArrowLeft' && event\.key !== 'ArrowRight'/);
  assert.match(slider, /const text = `\$\{index \+ 1\} \/ \$\{total\}`/);
  assert.match(slider, /if \(ready\) renderCounter\(state\.index\)/);
  assert.match(slider, /\/esmaulhusna\.json/);
  assert.match(slider, /\/api\/tefekkur\/images\/[\s\S]*?\/api\/tefekkur\/texts\//);

  const esma = JSON.parse(readPublic('esmaulhusna.json'));
  assert.equal(esma.length, 99);
  esma.forEach(entry => assert.match(entry.esmaulhusna_arabic, /[؀-ۿ]/));
});

test('sekme girişleri rota türüne uygun animasyon kullanır', () => {
  const shellStyles = readClient('shell/shell.css');
  const indexStyles = readClient('features/group-directory/group-directory.css');
  assert.match(shellStyles, /\.tab-view-okumalar\s*\{[^}]*transform:\s*none;[^}]*\}[\s\S]*?\.tab-view-okumalar\.visible\s*\{[^}]*okumalar-tab-view-fade 380ms ease-out forwards;/);
  assert.match(shellStyles, /@keyframes okumalar-tab-view-fade\s*\{[\s\S]*?from\s*\{\s*opacity:\s*0;\s*\}[\s\S]*?to\s*\{\s*opacity:\s*1;\s*\}/);
  assert.doesNotMatch(shellStyles, /@keyframes okumalar-tab-view-fade\s*\{[^}]*translateY/);
  assert.match(shellStyles, /\.tab-view-groups:not\(\.visible\)\s*\{[^}]*transform:\s*none;[^}]*animation:\s*none;[\s\S]*?\.tab-view-groups\.visible\s*\{[^}]*animation:\s*none;/);
  assert.match(shellStyles, /\.tab-view-videos:not\(\.visible\),[\s\S]*?\.tab-view-articles:not\(\.visible\)\s*\{[^}]*opacity:\s*0;[^}]*visibility:\s*hidden;[^}]*translateY\(16px\)/);
  assert.match(shellStyles, /\.tab-view-videos\.visible,[\s\S]*?\.tab-view-articles\.visible\s*\{[^}]*global-tab-view-enter 0.4s ease-out both/);
  assert.match(shellStyles, /\.tab-view-videos\.visible\.is-initial-route-reveal,[\s\S]*?\.tab-view-articles\.visible\.is-initial-route-reveal\s*\{[^}]*animation-duration:\s*0\.6s/);
  assert.match(shellStyles, /@keyframes global-tab-view-enter\s*\{[\s\S]*?opacity:\s*0;[^}]*translateY\(16px\)[\s\S]*?opacity:\s*1;[^}]*translateY\(0\)/);
  assert.match(readPublic('app/shell-router.js'), /view\.classList\.remove\('is-initial-route-reveal'\)[\s\S]*?activeView\.classList\.toggle\('is-initial-route-reveal', isInitialNavigation\)/);
  assert.match(indexStyles, /\.tab-view-groups:not\(\.visible\) \.main-header,[\s\S]*?\.groups-section\s*\{[^}]*opacity:\s*0;[^}]*translateY\(16px\);[^}]*animation:\s*none;/);
  assert.match(indexStyles, /\.tab-view-groups\.visible \.main-header,[\s\S]*?\.groups-section\s*\{[^}]*groups-directory-section-enter 0\.5s ease-out both;/);
  assert.match(indexStyles, /\.tab-view-groups\.visible \.actions-section\s*\{[^}]*animation-delay:\s*0\.06s;[\s\S]*?\.tab-view-groups\.visible \.groups-section\s*\{[^}]*animation-delay:\s*0\.12s;/);
  assert.match(indexStyles, /\.tab-view-groups\.visible\.is-initial-route-reveal \.main-header,[\s\S]*?animation-duration:\s*0\.6s;/);
  assert.match(indexStyles, /@keyframes groups-directory-section-enter\s*\{[\s\S]*?opacity:\s*0;[^}]*translateY\(16px\)[\s\S]*?opacity:\s*1;[^}]*translateY\(0\)/);
  assert.match(indexStyles, /prefers-reduced-motion:\s*reduce[\s\S]*?\.tab-view-groups\.visible \.groups-section\s*\{[^}]*animation:\s*none;/);
  assert.match(shellStyles, /prefers-reduced-motion:\s*reduce[\s\S]*?\.tab-view-videos\.visible,[\s\S]*?\.tab-view-articles\.visible\s*\{\s*animation:\s*none;/);
  assert.doesNotMatch(readClient('features/articles/articles.js'), /renderArticlesWithTransition|translateY\(20px\)/);
});

test('Okumalar tüm grup bileşenlerini başlatır, Tesbihat yükleme animasyonu kullanmaz', () => {
  const router = readPublic('app/shell-router.js');
  const routeConfig = readPublic('app/route-config.js');
  const shellStyles = readClient('shell/shell.css');
  const commonStyles = readClient('shell/base.css');
  const userCardStyles = readClient('features/readings/analytics/user-cards.css');
  const messagePanelStyles = readClient('features/readings/reading-message-panels.css');
  const okumalarInit = router.match(/async function initOkumalarTab\(options = \{\}\)[\s\S]*?(?=async function initGlobalTab)/)?.[0] || '';
  assert.match(router, /function revealRouteContent/);
  assert.match(router, /view\.classList\.add\('visible'\);\s*footerRoot\.hidden = false;/);
  assert.doesNotMatch(router, /classList\.contains\('initial-group-route-loading'\)\) showStatus\(\)/);
  assert.match(router, /function routeUsesFullScreenLoader\(\)\s*\{\s*return false;\s*\}/);
  assert.doesNotMatch(router, /route\.name === 'tesbihat'[\s\S]*?showStatus/);
  assert.doesNotMatch(router, /function isGroupReadingTab|switchingBetweenGroupTabs/);
  assert.match(router, /if \(!revealAfterLifecycle && !activeView\.classList\.contains\('visible'\)\)[\s\S]*?await revealRouteContent\(activeView, !resumeBeforeReveal\)/);
  assert.doesNotMatch(router, /PLACEHOLDER_DELAY_MS|PLACEHOLDER_MIN_VISIBLE_MS|preparePlaceholderGate/);
  assert.match(router, /function hasReadyCachedView\(route\)[\s\S]*?lifecycleCache\.has\(view\)/);
  assert.match(router, /const cachedView = viewCache\.get\(cacheKey\)[\s\S]*?const view = await cachedView[\s\S]*?viewCache\.set\(cacheKey, view\)/);
  assert.match(router, /const useInitialTabLoader = hasInitialTabLoader\(\)[\s\S]*?const revealAfterLifecycle = useFullScreenLoader[\s\S]*?\|\| useInitialTabLoader[\s\S]*?\|\| useOkumalarTransitionLoader[\s\S]*?\|\| useGroupsTransitionLoader/);
  assert.match(router, /const useOkumalarTransitionLoader = !useInitialTabLoader[\s\S]*?const useGroupsTransitionLoader = !useInitialTabLoader/);
  assert.match(router, /useOkumalarTransitionLoader[\s\S]*?!isInitialNavigation[\s\S]*?route\.name === 'okumalar'/);
  assert.match(router, /useGroupsTransitionLoader = !useInitialTabLoader[\s\S]*?&& !isInitialNavigation[\s\S]*?route\.name === 'groups'/);
  assert.match(router, /useGroupsTransitionLoader \? 'Gruplar hazırlanıyor' : 'Okumalar hazırlanıyor'/);
  assert.match(router, /ROUTE_TRANSITION_MIN_VISIBLE_MS = 1000[\s\S]*?waitBeforeFade[\s\S]*?loader\.classList\.add\('is-leaving'\)/);
  assert.match(router, /loader\.dataset\.minimumVisibleMs[\s\S]*?minimumVisibleMs - elapsed[\s\S]*?minimumVisibleMs: targetWasReady \? 0 : ROUTE_TRANSITION_MIN_VISIBLE_MS/);
  assert.match(router, /function keepInitialTabLoaderVisible\(\)[\s\S]*?classList\.remove\('is-leaving'\)[\s\S]*?function hideInitialTabLoader\(expectedSequence = null\)[\s\S]*?expectedSequence !== navigationSequence[\s\S]*?keepInitialTabLoaderVisible\(\)[\s\S]*?resolve\(false\)/);
  assert.match(router, /async function revealRouteAfterLoader\(view, options = \{\}\)[\s\S]*?hideInitialTabLoader\(options\.sequence\)[\s\S]*?options\.sequence !== navigationSequence[\s\S]*?await revealRouteContent\(view\)/);
  assert.match(router, /const sequence = \+\+navigationSequence;\s*keepInitialTabLoaderVisible\(\);\s*removeRouteTransitionLoader\(\)/);
  assert.match(router, /activatePrivateGroupView\(\{ reveal: !revealAfterLifecycle \}\)[\s\S]*?if \(revealAfterLifecycle\)[\s\S]*?await revealRouteAfterLoader\(activeView, \{ useInitialTabLoader, transitionLoader, sequence \}\)/);
  assert.match(router, /if \(revealAfterLifecycle\)\s*\{\s*await revealRouteAfterLoader\(activeView, \{ useInitialTabLoader, transitionLoader, sequence \}\);\s*\}/);
  assert.match(router, /runOkumalarBackgroundWork\(\{ animateRefresh: true \}\)/);
  assert.match(router, /const refreshOptions = options\.animateRefresh === true \? \{ animateRefresh: true \} : undefined;[\s\S]*?loadUserCards\(refreshOptions\)[\s\S]*?loadMonthlyCalendar\(refreshOptions\)[\s\S]*?renderLongestSeries\(refreshOptions\)[\s\S]*?loadReadingStats\(refreshOptions\)/);
  assert.match(router, /function replayReadingPrimarySectionReveal\(view\)[\s\S]*?'\.user-stats-info-area'[\s\S]*?'\.league-info-bar'[\s\S]*?'\.weekly-statistics-section'[\s\S]*?\.reading-message-panels-content > \*[\s\S]*?window\.replayReadingContentReveal\?\.\(element\)/);
  assert.match(router, /if \(revealAfterLifecycle\)[\s\S]*?await revealRouteAfterLoader[\s\S]*?revealPendingReadingMessagePanels\?\.\(activeView\)[\s\S]*?route\.name === 'okumalar' && !isInviteOnboarding[\s\S]*?replayReadingPrimarySectionReveal\(activeView\)/);
  assert.doesNotMatch(router, /is-refresh-revealing/);
  assert.match(readClient('features/readings/reading-reveal.css'), /\.user-stats-info-area\.reading-scroll-reveal:not\(\.is-revealed\),[\s\S]*?\.league-info-bar\.reading-scroll-reveal:not\(\.is-revealed\),[\s\S]*?\.reading-message-panels-content > \.reading-scroll-reveal:not\(\.is-revealed\)[^}]*translateY\(20px\)[\s\S]*?animation-name:\s*reading-viewport-reveal-compact/);
  assert.match(readClient('features/readings/reading-message-panels.js'), /panel\.classList\.add\('message-fade-in'\);[\s\S]*?!panel\.classList\.contains\('reading-scroll-reveal'\)[\s\S]*?panel\.classList\.add\('reading-content-reveal'\)/);
  assert.doesNotMatch(router, /Promise\.all\(\[revealPromise, hide(?:InitialTabLoader|RouteTransitionLoader)/);
  assert.doesNotMatch(router, /CACHED_ROUTE_STATUS_DELAY_MS|scheduleStatus|routeStatusShowTimer/);
  assert.match(router, /window\.waitForRoutePlaceholder\s*=\s*async function/);
  assert.doesNotMatch(router, /prepareRoutePlaceholders/);
  assert.match(router, /deferOkumalarResumeReveal[\s\S]*?lifecycleCache\.has\(activeView\)[\s\S]*?!warmedViews\.has\(activeView\)[\s\S]*?if \(!deferOkumalarResumeReveal && !revealAfterLifecycle\)/);
  assert.match(router, /if \(resumeBeforeReveal\)[\s\S]*?is-preparing-return[\s\S]*?is-restoring-position[\s\S]*?await activeLifecycle\.resume\(\)[\s\S]*?revealRouteContent\(activeView, !resumeBeforeReveal\)[\s\S]*?classList\.remove\('is-restoring-position'\)[\s\S]*?classList\.remove\('is-preparing-return'\)/);
  assert.doesNotMatch(router, /requestAnimationFrame\(\(\) => requestAnimationFrame\(resolve\)\)[\s\S]*?refreshTrackerTableLayout/);
  assert.match(readClient('features/readings/tracker-table.css'), /\.tracker-table-layout\.is-restoring-position\s*\{[\s\S]*?visibility:\s*hidden/);
  assert.match(router, /activeLifecycle\?\.prepareBeforeReveal === true[\s\S]*?await activeLifecycle\.resume\(\)[\s\S]*?if \(!revealAfterLifecycle && !activeView\.classList\.contains\('visible'\)\)/);
  assert.match(router, /isReturningToOkumalar[\s\S]*?lifecycleCache\.has\(view\)[\s\S]*?classList\.toggle\('is-resuming', isReturningToOkumalar\)/);
  assert.match(shellStyles, /\.tab-view-okumalar\.is-resuming\.visible[\s\S]*?animation:\s*none[\s\S]*?\.tracker-table-layout[\s\S]*?\.week-navigation[\s\S]*?transition:\s*none !important/);
  assert.match(shellStyles, /\.tab-view\.is-preparing-return\s*\{[^}]*visibility:\s*hidden/s);
  assert.doesNotMatch(router, /querySelectorAll\(['"]\.scroll-fade-in/);
  assert.match(commonStyles, /\.scroll-fade-in\s*\{[^}]*opacity:\s*1;[^}]*transform:\s*none;[^}]*transition:\s*none;/s);
  assert.match(userCardStyles, /\.user-card\s*\{[^}]*transform:\s*none;[^}]*opacity:\s*1;/s);
  assert.match(userCardStyles, /\.user-card\.reading-scroll-reveal\s*\{[^}]*opacity \.5s ease-out[^}]*transform \.6s ease-out[^}]*will-change:\s*transform, opacity/s);
  assert.match(userCardStyles, /\.user-card\.reading-scroll-reveal:not\(\.is-revealed\)\s*\{[^}]*opacity:\s*0;[^}]*translateY\(100px\)[^}]*animation:\s*none/s);
  assert.match(userCardStyles, /\.user-card\.reading-scroll-reveal\.is-revealed\s*\{[^}]*opacity:\s*1;[^}]*translateY\(0\)[^}]*animation:\s*none/s);
  assert.match(userCardStyles, /prefers-reduced-motion:\s*reduce[\s\S]*?\.user-card\.reading-scroll-reveal[\s\S]*?transition:\s*none/);
  assert.match(messagePanelStyles, /\.league-promotion-message,[\s\S]*?opacity:\s*1;[\s\S]*?transform:\s*none;/);
  assert.doesNotMatch(readClient('features/readings/analytics/user-cards.js'), /userCardScrollObserver|cardScrollObserver/);
  assert.match(readClient('features/readings/analytics/stats-section.js'), /readingStatsVisibilityObserver/);
  assert.match(readClient('features/readings/analytics/stats-section.js'), /animateReadingStatsWhenVisible/);
  assert.match(readClient('features/readings/analytics/longest-series.js'), /IntersectionObserver|barsToAnimate|initialBarWidth/);
  assert.doesNotMatch(okumalarInit, /window\.initializeHomeTefekkurWindow/);
  assert.match(okumalarInit, /portalOkumalarOverlays\(\)/);
  assert.match(router, /function portalOkumalarOverlays\(\)[\s\S]*?dailyGiftModal[\s\S]*?dailyTasksModal[\s\S]*?overlayRoot\.appendChild\(modal\)/);
  assert.match(okumalarInit, /resume\(\)[\s\S]*?runOkumalarBackgroundWork\(\{ animateRefresh: true \}\)/);
  assert.match(okumalarInit, /prepareBeforeReveal:\s*true[\s\S]*?resume\(\)[\s\S]*?await window\.loadTrackerTable\(\)[\s\S]*?await window\.refreshTrackerTableLayout\(\)/);
  assert.match(okumalarInit, /resume\(\)[\s\S]*?revealReadingAuthControls[\s\S]*?Promise\.all\(\[trackerRefresh, prepareReadingPrimaryContent\(\)\]\)/);
  assert.doesNotMatch(okumalarInit, /captureTrackerTableScrollPosition/);
  assert.doesNotMatch(readClient('features/readings/tracker-table.js'), /timelineSavedScrollLeft|timelineRestoreReleaseTimer|captureTrackerTableScrollPosition/);
  assert.match(readClient('features/readings/tracker-table.js'), /refreshTrackerTableLayout[\s\S]*?timelineIsRestoringPosition = true[\s\S]*?scrollTimelineDateIntoRightEdge\(todayKey, false\)[\s\S]*?timelineIsRestoringPosition = false/);
  assert.match(readClient('features/readings/tracker-table.js'), /resetTrackerTimelineForGroup[\s\S]*?timelineStartDate = null[\s\S]*?timelineEndDate = null[\s\S]*?timelineReferenceDate = null[\s\S]*?timelineHasPositioned = false[\s\S]*?weekOffset = 0[\s\S]*?tableArea\.scrollLeft = 0/);
  assert.doesNotMatch(readClient('features/readings/tracker-table.js'), /refreshTrackerTableLayout[\s\S]*?setTimeout\([\s\S]*?150/);
  assert.match(readClient('features/readings/tracker-table.js'), /addEventListener\('scroll'[\s\S]*?timelineIsRestoringPosition\) return/);
  assert.match(router, /function runOkumalarBackgroundWork\(options = \{\}\)[\s\S]*?window\.loadUserCards[\s\S]*?window\.loadMonthlyCalendar[\s\S]*?window\.renderLongestSeries[\s\S]*?window\.loadReadingStats/);
  assert.match(router, /OKUMALAR_BACKGROUND_ASSETS[\s\S]*?statistics:[\s\S]*?management:[\s\S]*?groupUi:/);
  assert.match(router, /loadAssetGroup[\s\S]*?Promise\.allSettled\(\[[\s\S]*?loadBundleStyles/);
  assert.match(router, /function prepareReadingPrimaryContent\(\)[\s\S]*?window\.renderReadingMessagePanels[\s\S]*?window\.initializeReadingJourney\?\.\(\{ reveal: false \}\)/);
  assert.match(router, /function revealReadingPrimaryContent\(isAuthenticated\)[\s\S]*?revealLeagueInfoBar\(\{ animate: false \}\)[\s\S]*?messagePanels\.hidden = false[\s\S]*?revealReadingAuthControls\(isAuthenticated\)/);
  assert.match(readClient('features/readings/tracker-table.js'), /deferPrimaryReveal[\s\S]*?weekNav\.classList\.add\('visible'\)[\s\S]*?isRestoringBeforeRouteReveal[\s\S]*?if \(deferPrimaryReveal \|\| isRestoringBeforeRouteReveal\) revealTrackerLayout\(\)/);
  assert.match(readClient('features/readings/tracker-table.js'), /await new Promise\(resolve => \{[\s\S]*?requestAnimationFrame[\s\S]*?updateTimelineSummaries[\s\S]*?resolve\(\)/);
  assert.match(readClient('features/readings/tracker-table.css'), /\.tracker-table-layout\s*\{[\s\S]*?transform:\s*translateY\(20px\)[\s\S]*?\.week-navigation\s*\{[\s\S]*?transform:\s*translateY\(20px\)/);
  assert.doesNotMatch(router, /function runOkumalarBackgroundWork\(options = \{\}\)[\s\S]*?\['okuma mesajları'/);
  assert.match(router, /Promise\.allSettled\(tasks\.map/);
  assert.match(okumalarInit, /Promise\.all\(\[trackerReady, prepareReadingPrimaryContent\(\)\]\)[\s\S]*?revealReadingPrimaryContent\(isAuthenticated\)[\s\S]*?const readyForPrefetch = runOkumalarBackgroundWork\(\)/);
  assert.match(router, /activeLifecycle\?\.readyForPrefetch[\s\S]*?schedulePrefetch\(route\)/);
  assert.match(okumalarInit, /monthShareModal/);
  assert.match(routeConfig, /tesbihat:\s*\{ scripts:\s*\['tesbihat\.min\.js'\], styles:\s*\['tesbihat\.min\.css'\] \}/);
  assert.match(router, /tesbihat:\s*window\.RoTaKipTesbihatTab/);
  const buildAssets = fs.readFileSync(path.join(projectRoot, 'scripts', 'build-assets.js'), 'utf8');
  assert.match(buildAssets, /tesbihat:\s*\{[\s\S]*?css:\s*\['tesbihat-base\.css', 'tesbihat-home\.css', 'location-picker\.css', 'tesbihat-reader\.css'\][\s\S]*?'tesbihat-utils\.js',\s*'tesbihat-store\.js',\s*'prayer-schedule\.js',\s*'tesbihat-home\.js',\s*'location-picker\.js',\s*'tesbihat-reader\.js',\s*'tesbihat-tab\.js'/);
  const tesbihatTab = readClient('features/tesbihat/tesbihat-tab.js');
  assert.match(tesbihatTab, /window\.RoTaKipTesbihatTab = \{\s*prepareBeforeReveal: true/);
  assert.match(tesbihatTab, /params\.has\('konum'\)[\s\S]*?view: 'reader', vakit, tur[\s\S]*?view: 'types', vakit/);
  assert.match(readClient('features/tesbihat/prayer-schedule.js'), /DEFAULT_LOCATION_ID = 9541;/);
  assert.doesNotMatch(readClient('shell/shell.css'), /tesbihat-preparation/);
  // Tesbihat'ta dış sarmalayıcı kaymaz; kayma görünümlerin kendisinde (tek katman).
  assert.match(readClient('shell/shell.css'), /\.tab-view-tesbihat\.visible\s*\{[^}]*transform:\s*none;[^}]*animation:\s*none;/);
  assert.match(readClient('features/tesbihat/tesbihat-base.css'), /\.tab-view-tesbihat\.visible \.tesbihat-page \.tesbihat-view:not\(\[hidden\]\)\s*\{[^}]*tesbihat-view-in 0.4s ease-out both/);
  assert.match(readClient('features/tesbihat/tesbihat-base.css'), /@keyframes tesbihat-view-in\s*\{[\s\S]*?translateY\(16px\)/);
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
  assert.doesNotMatch(readPublic('fragments/okumalar.html'), /Placeholder|placeholder-|tracker-table-placeholder/);
  assert.match(readClient('features/readings/statistics-layout.css'), /\.chart-container\s*\{[\s\S]*?position:\s*relative[\s\S]*?height:\s*500px/);
  assert.match(readClient('features/readings/statistics-layout.css'), /#longestSeriesChart\s*\{[\s\S]*?min-height:\s*370px[\s\S]*?border:\s*1px solid #dfdfdf/);
  assert.match(readClient('features/readings/reading-message-panels.js'), /container\.replaceChildren\(\)/);
  assert.match(readClient('features/readings/analytics/monthly.js'), /shouldRevealMonthlyContent[\s\S]*?monthlyCalendarSection\.style\.display = 'block'[\s\S]*?observeReadingScrollReveal/);
  assert.match(readClient('features/readings/analytics/stats-section.js'), /shouldRevealReadingStats[\s\S]*?statsSection\.style\.display = 'block'[\s\S]*?observeReadingScrollReveal/);
  assert.match(readClient('features/readings/analytics/longest-series.js'), /chart\.innerHTML = ''/);
  assert.doesNotMatch(readClient('features/readings/analytics/user-cards.js'), /userCardsPlaceholder/);
  assert.doesNotMatch(readClient('features/readings/analytics/user-cards.js'), /leagueInfoPlaceholder/);
  assert.match(router, /function revealLeagueInfoBar\(options = \{\}\)[\s\S]*?shouldAnimate[\s\S]*?options\.animate !== false[\s\S]*?reading-content-reveal/);
  const readingRevealStyles = readClient('features/readings/reading-reveal.css');
  assert.match(readingRevealStyles, /\.reading-content-reveal\s*\{[^}]*reading-content-reveal 0\.6s ease-out both/);
  assert.match(readingRevealStyles, /\.reading-scroll-reveal:not\(\.is-revealed\)\s*\{[^}]*translateY\(50px\)/);
  assert.match(readingRevealStyles, /\.user-cards-title\.reading-scroll-reveal:not\(\.is-revealed\)[\s\S]*?\.leaderboard-sort-bar\.reading-scroll-reveal:not\(\.is-revealed\),[\s\S]*?\{[^}]*translateY\(20px\)/);
  assert.match(readingRevealStyles, /\.weekly-statistics-section\.reading-scroll-reveal:not\(\.is-revealed\)[\s\S]*?\{[^}]*translateY\(20px\)/);
  assert.match(readingRevealStyles, /\.weekly-statistics-section\.reading-scroll-reveal\.is-revealed,[\s\S]*?\{[^}]*animation-name:\s*reading-viewport-reveal-compact/);
  assert.match(readingRevealStyles, /@keyframes reading-content-reveal\s*\{[\s\S]*?from\s*\{[^}]*translateY\(20px\)/);
  assert.match(readClient('features/readings/reading-reveal.css'), /\.reading-scroll-reveal\.is-revealed\s*\{[^}]*reading-viewport-reveal 0\.6s ease-out both/s);
  assert.doesNotMatch(readClient('features/readings/reading-reveal.css'), /0\.7s/);
  assert.match(messagePanelStyles, /\.reading-message-panel-pending\s*\{[^}]*translateY\(20px\)/);
  assert.doesNotMatch(readClient('features/readings/reading-journey.css'), /\.authenticated-user-areas\s*\{[^}]*translateY/);
  assert.match(readingRevealStyles, /\.tab-view-okumalar\s*\{[^}]*--reading-auth-toggle-duration:\s*0\.8s/);
  const readingRevealManager = readClient('features/readings/reading-reveal.js');
  assert.match(readingRevealManager, /MAX_REVEAL_VISIBLE_PIXELS = 120[\s\S]*?getVisibleViewportBottom[\s\S]*?querySelector\('\.app-navigation'\)[\s\S]*?navigationRect\.top > 0[\s\S]*?navigationRect\.bottom >= viewportHeight - 1[\s\S]*?viewportBottom = getVisibleViewportBottom\(viewportHeight\)[\s\S]*?requiredHeight = Math\.min\([\s\S]*?\* 0\.1, MAX_REVEAL_VISIBLE_PIXELS\)/);
  assert.match(readingRevealManager, /!entry\.isIntersecting[\s\S]*?resetReveal\(entry\.target\)[\s\S]*?threshold:\s*0[\s\S]*?rootMargin:\s*'0px'[\s\S]*?observeReadingScrollReveal[\s\S]*?replayReadingContentReveal/);
  assert.match(readClient('features/readings/analytics/longest-series.js'), /shouldRevealLongestSeries[\s\S]*?longestSeriesSection\.style\.display = 'block'[\s\S]*?observeReadingScrollReveal/);
  assert.match(readClient('features/readings/analytics/user-cards.js'), /container\.appendChild\(card\)[\s\S]*?observeReadingScrollReveal\?\.\(card\)/);
  assert.match(readClient('features/readings/analytics/user-cards.js'), /observeReadingScrollReveal\?\.\(sortBar\)[\s\S]*?querySelector\('\.user-cards-title'\)[\s\S]*?observeReadingScrollReveal\?\.\(userCardsTitle\)/);
  assert.match(readClient('features/readings/tracker-table.js'), /loadUserCards\(\{ animateRefresh: true \}\)[\s\S]*?loadReadingStats\(\{ animateRefresh: true \}\)[\s\S]*?renderLongestSeries\(\{ animateRefresh: true \}\)/);
  assert.doesNotMatch(readClient('features/readings/tracker-table.js'), /replayReadingContentReveal\?\.\(document\.querySelector\('\.tracker-table-shell'\)\)/);
  assert.match(readClient('features/readings/group-management.js'), /querySelectorAll\('\.group-settings, \.automation-section, \.user-onboarding-column, \.user-management-column'\)[\s\S]*?observeReadingScrollReveal/);
  assert.match(readClient('features/readings/group-management.js'), /if \(!document\.body\.classList\.contains\('app-shell-body'\)\)/);
  assert.match(readClient('features/groups/group-bootstrap.js'), /if \(!Object\.hasOwn\(window, 'initialAllData'\)\) window\.initialAllData = null;/);
  assert.doesNotMatch(readClient('features/groups/group-bootstrap.js'), /this\._rebuildIndexes\(\);\s*await this\._buildLongestStreaks\(\)/);
  assert.match(readClient('features/groups/group-bootstrap.js'), /ensureLongestStreaks\(\)[\s\S]*?longestStreaksPromise/);
  assert.doesNotMatch(readClient('features/readings/analytics/longest-series.js'), /waitForRoutePlaceholder|longest-series-loading/);
  assert.doesNotMatch(readClient('features/readings/analytics/stats-section.js'), /waitForRoutePlaceholder|stats-loading/);
  assert.doesNotMatch(readClient('features/videos/videos-feed.js'), /waitForRoutePlaceholder/);
  assert.match(readClient('features/articles/articles.js'), /await this\.waitForImages\(entry\.articles\)/);
  assert.doesNotMatch(readClient('features/articles/articles.js'), /waitForRoutePlaceholder/);
  assert.doesNotMatch(readClient('features/tefekkur/tefekkur-slider.js'), /waitForRoutePlaceholder|loading-placeholder/);
  assert.doesNotMatch(readClient('shell/shell.css'), /tab-view[\s\S]*?scale\(0\.995\)/);
});

test('her route birleşiminde DOM kimlikleri benzersizdir', () => {
  const shared = ['app-shell.html', 'fragments/footer.html', 'fragments/global-overlays.html'];
  [
    [...shared, 'fragments/gruplar.html'],
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
  const globalOverlays = readPublic('fragments/global-overlays.html');
  const commonOverlays = readPublic('fragments/common-overlays.html');
  assert.match(shellSetup, /global-overlays\.html/);
  assert.doesNotMatch(shellSetup, /common-overlays\.html/);
  assert.match(groupSetup, /common-overlays\.html/);
  assert.match(router, /overlayRoot\.hidden = true/);
  assert.match(globalOverlays, /id="sharePanel"[\s\S]*?id="closeSharePanel"[\s\S]*?id="downloadImageBtn"/);
  assert.doesNotMatch(commonOverlays, /id="sharePanel"/);
  assert.doesNotMatch(commonOverlays, /id="scrollToTopBtn"/);
  assert.match(readClient('shared/share-modal.css'), /\.share-panel\s*\{/);
  assert.doesNotMatch(readClient('features/tefekkur/tefekkur-base.css'), /\.share-panel\s*\{/);
  assert.doesNotMatch(readClient('features/tefekkur/tefekkur-share.js'), /sharePanel|ensureHtml2Canvas/);
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
  assert.match(journeyStyles, /\.authenticated-user-areas\.is-initial-reveal-pending,[\s\S]*?grid-template-rows:\s*1fr;[^}]*opacity:\s*0;[^}]*transition:\s*none/s);
  assert.match(journeyStyles, /\.authenticated-user-areas\s*\{[^}]*grid-template-rows:\s*0fr;[^}]*clip-path:\s*inset\(0 0 100% 0\);[^}]*grid-template-rows var\(--reading-auth-toggle-duration, 0\.8s\)[\s\S]*?\.authenticated-user-areas\.show\s*\{[^}]*grid-template-rows:\s*1fr;[^}]*clip-path:\s*inset\(0\)/s);
  assert.doesNotMatch(trackerStyles, /\.authenticated-user-areas\s*\{/);
  assert.match(journey, /window\.syncAuthenticatedUserAreas/);
  assert.doesNotMatch(editMode, /window\.showAuthenticatedUserAreas\s*=/);
  assert.match(tracker, /class="user-stats-progress-current"/);
  assert.doesNotMatch(tracker, /currentProgressObserver|MutationObserver\(emphasizeCurrentProgress\)/);
  assert.match(journey, /initializeReadingJourney\(options = \{\}\)[\s\S]*?options\.reveal !== false/);
  assert.match(journeyStyles, /\.authenticated-user-areas\s*\{[^}]*grid-template-rows:\s*0fr[\s\S]*?\.authenticated-user-areas\.show\s*\{[^}]*grid-template-rows:\s*1fr/s);
  assert.doesNotMatch(journey, /isVisible && areas\.classList\.contains\('is-initial-reveal-pending'\)/);
  assert.match(router, /function revealReadingAuthControls\(isAuthenticated\)[\s\S]*?stagedElements[\s\S]*?getBoundingClientRect\(\)[\s\S]*?classList\.remove\('is-initial-reveal-pending'\)/);
  assert.match(router, /function stageReadingPrimaryContent\(isAuthenticated\)[\s\S]*?authenticatedUserAreas[\s\S]*?readingEditModeBar[\s\S]*?classList\.toggle\('is-initial-reveal-pending', isAuthenticated\)/);
  assert.match(router, /stageReadingPrimaryContent\(isAuthenticated\)/);
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
  assert.equal(routes.resolveRoute('/gruplar').name, 'groups');
  assert.equal(routes.resolveRoute('/gruplar').navigationName, 'okumalar');
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
  assert.match(server, /app\.get\('\/gruplar',[\s\S]*?sendHtmlFile\(res, publicPath, 'app-shell\.html'\)/);
  assert.doesNotMatch(server, /gruplar-embedded/);
  assert.match(server, /app\.get\('\/grup\/:groupId\/', \(req, res\) =>/);
  assert.match(server, /app\.get\('\/group\/:groupId', \(req, res\) =>[\s\S]*?res\.redirect\(302, appendQueryString\(target, req\.query\)\)/);
  assert.doesNotMatch(server, /app\.get\('\/grup\/:groupId\/okumalar'/);
  assert.match(server, /app\.get\(\['\/tesbihat', '\/videolar', '\/tefekkur', '\/makaleler'\]/);
  assert.doesNotMatch(server, /sendHtmlFile\(res, '(?:index|groups)\.html'\)/);
  assert.doesNotMatch(server, /app\.get\('\/:groupId'/);
});

test('tüm bağımsız sayfalar güvenli alan destekli mobil viewport tanımlar', () => {
  const viewportPattern = /<meta\s+name="viewport"\s+content="width=device-width, initial-scale=1, viewport-fit=cover">/;
  [
    'app-shell.html',
    'admin.html',
    'login-logs.html',
    'access-logs.html',
    path.join('politikalar', 'hakkimizda.html'),
    path.join('politikalar', 'gizlilik-politikasi.html'),
    path.join('politikalar', 'cerez-politikasi.html')
  ].forEach(fileName => {
    const html = fs.readFileSync(path.join(projectRoot, 'public', fileName), 'utf8');
    assert.match(html, viewportPattern, `${fileName} viewport etiketi içermeli`);
  });
});

test('yalnız grup detay rotaları geçici eski viewport düzenini kullanır', () => {
  const shell = readPublic('app-shell.html');
  const router = readPublic('app/shell-router.js');
  const legacyNavigation = readClient('shell/group-legacy-viewport.css');
  const buildAssets = fs.readFileSync(path.join(projectRoot, 'scripts', 'build-assets.js'), 'utf8');

  assert.match(shell, /const responsiveViewport = 'width=device-width, initial-scale=1, viewport-fit=cover'/);
  assert.match(shell, /const legacyGroupViewport = 'width=980'/);
  assert.match(shell, /const usesLegacyGroupLayout = normalizedPath\.startsWith\('\/grup\/'\)/);
  assert.doesNotMatch(shell, /normalizedPath === '\/gruplar'/);
  assert.match(shell, /const legacyViewportWidth = 980[\s\S]*?const legacyScale = Math\.min\(1, Math\.max\(0\.25, renderedViewportWidth \/ legacyViewportWidth\)\)/);
  assert.match(shell, /rootStyle\.setProperty\('--group-legacy-nav-height', scaledPixels\(59\)\)/);
  assert.match(shell, /rootStyle\.setProperty\('--group-legacy-item-height', scaledPixels\(58\)\)/);
  assert.match(shell, /rootStyle\.setProperty\('--group-legacy-font-size', scaledPixels\(11\)\)/);
  assert.match(shell, /rootStyle\.setProperty\('--group-legacy-loader-star-size', scaledPixels\(30\)\)/);
  assert.match(shell, /rootStyle\.setProperty\('--group-legacy-loader-line-width', scaledPixels\(27\)\)/);
  assert.match(shell, /rootStyle\.setProperty\('--group-legacy-loader-text-size', scaledPixels\(16\)\)/);
  assert.match(shell, /document\.documentElement\.classList\.toggle\('group-legacy-viewport', usesLegacyGroupLayout\)/);
  assert.doesNotMatch(shell, /group-legacy-viewport\.min\.css/);
  assert.match(shell, /window\.syncRoTaKipViewport = syncViewport;\s*syncViewport\(path\)/);
  assert.match(router, /window\.syncRoTaKipViewport\?\.\(url\.pathname\)/);
  assert.match(buildAssets, /shell:\s*\{[\s\S]*?'shell\/shell\.css',[\s\S]*?'shell\/group-legacy-viewport\.css'[\s\S]*?html: \['app-shell\.html'\]/);
  assert.match(legacyNavigation, /@media \(max-width:\s*1023px\)/);
  assert.match(legacyNavigation, /html\.group-legacy-viewport body\.app-shell-body\s*\{[^}]*--group-legacy-body-padding/);
  assert.match(legacyNavigation, /html\.group-legacy-viewport \.app-navigation\s*\{[^}]*--group-legacy-nav-height/);
  assert.match(legacyNavigation, /html\.group-legacy-viewport \.app-navigation-item\s*\{[^}]*--group-legacy-item-height[^}]*--group-legacy-font-size/s);
  assert.match(legacyNavigation, /html\.group-legacy-viewport \.app-navigation-icon\s*\{[^}]*--group-legacy-icon-size/);
  assert.doesNotMatch(legacyNavigation, /grid-template-columns/);
  assert.match(legacyNavigation, /html\.group-legacy-viewport \.route-loader-star\s*\{[^}]*--group-legacy-loader-star-size[^}]*--group-legacy-loader-shadow-blur/s);
  assert.match(legacyNavigation, /html\.group-legacy-viewport \.route-loader-line\s*\{[^}]*--group-legacy-loader-line-width[^}]*--group-legacy-loader-line-height[^}]*group-legacy-route-loader-line-bounce/s);
  assert.match(legacyNavigation, /@keyframes group-legacy-route-loader-line-bounce[\s\S]*?--group-legacy-loader-bounce/);
  assert.doesNotMatch(legacyNavigation, /^(?:body|\.app-navigation)/m);
});

test('yönetim sayfaları bağımsız paketlenir ve shell tarafından ön yüklenmez', () => {
  const routes = readPublic('app/route-config.js');
  const router = readPublic('app/shell-router.js');
  const standalonePages = [
    ['admin.html', 'site-activity-admin'],
    ['access-logs.html', 'access-logs'],
    ['login-logs.html', 'login-logs']
  ];

  standalonePages.forEach(([fileName, bundleName]) => {
    const html = readPublic(fileName);
    assert.match(html, new RegExp(`href="${bundleName}\\.min\\.css\\?v=[a-f0-9]{12}"`));
    assert.match(html, new RegExp(`src="${bundleName}\\.min\\.js\\?v=[a-f0-9]{12}"`));
    assert.doesNotMatch(html, /<script>(?:.|\n)*?<\/script>/);
  });

  assert.match(readPublic('admin.html'), /<script src="\/env\.js"><\/script>[\s\S]*?site-activity-admin\.min\.js/);
  assert.match(readClient('features/site-activity-admin/site-activity-admin.js'), /window\.SITE_ACTIVITY_ADMIN_GROUP_ID/);

  assert.doesNotMatch(routes, /access-logs|login-logs|site-activity-admin|admin\.html/);
  assert.doesNotMatch(router, /access-logs|login-logs|site-activity-admin|admin\.html/);
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
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*?\.automation-settings-column,[\s\S]*?\.automation-actions-column[\s\S]*?width:\s*100%;/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*?\.group-settings,[\s\S]*?\.automation-settings\s*\{[\s\S]*?max-width:\s*calc\(100% - 34px\);/);
  const okumalar = readPublic('fragments/okumalar.html');
  assert.match(okumalar, /<div class="top-section">[\s\S]*?<div class="group-settings scroll-fade-in">[\s\S]*?<div class="automation-section scroll-fade-in">[\s\S]*?<!-- Alt Bölüm:/);
  assert.doesNotMatch(okumalar, /<section class="automation-section/);
  assert.match(okumalar, /class="bottom-section scroll-fade-in"[\s\S]*?class="user-onboarding-column"[\s\S]*?class="user-management-column"/);
  assert.doesNotMatch(okumalar, /class="(?:left|right)-column"/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*?\.user-management-column,[\s\S]*?\.user-onboarding-column,[\s\S]*?width:\s*100%;/);
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
