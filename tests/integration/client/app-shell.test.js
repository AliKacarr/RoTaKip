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
  assert.match(shellStyles, /\[data-route="articles"\]\.is-active \.app-navigation-icon-filled\s*\{[^}]*color:\s*#2563eb;/);
  assert.match(shellStyles, /\[data-route="okumalar"\]\.is-active \.app-navigation-icon-filled\s*\{[^}]*color:\s*#1a9948;/);
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
  assert.match(shellStyles, /@media \(max-width:\s*1180px\)[\s\S]*?body\.app-shell-body\s*\{[^}]*padding-bottom:\s*calc\(80px \+ env\(safe-area-inset-bottom, 0px\)\)/s);
  assert.match(shellStyles, /@media \(max-width:\s*1180px\)[\s\S]*?\.app-navigation\s*\{[^}]*inset:\s*auto 0 -1px 0;[^}]*height:\s*calc\(81px \+ env\(safe-area-inset-bottom, 0px\)\);[^}]*padding:\s*0 0 env\(safe-area-inset-bottom, 0px\);[^}]*background:\s*#fff;[^}]*border-top:\s*0;[^}]*backdrop-filter:\s*none;/s);
  assert.match(shellStyles, /@media \(max-width:\s*1180px\)[\s\S]*?\.app-navigation-items\s*\{[^}]*gap:\s*0;[^}]*overflow:\s*hidden;/s);
  assert.match(shellStyles, /@media \(max-width:\s*1180px\)[\s\S]*?\.app-navigation-item\s*\{[^}]*min-height:\s*80px;[^}]*flex:\s*1 1 20%;[^}]*font-size:\s*15px;/s);
  assert.match(shellStyles, /@media \(max-width:\s*1180px\)[\s\S]*?\.app-navigation-icon\s*\{[^}]*font-size:\s*36px;/s);
  assert.match(shellStyles, /\.app-navigation-item\.is-tap-feedback::before\s*\{[^}]*app-navigation-tap-fade 560ms ease-in-out both/s);
  assert.match(shellStyles, /\.app-navigation-item::before\s*\{[^}]*inset:\s*0 -10px;[^}]*border-radius:\s*16px \/ 50%;[^}]*background:\s*#c4c4c4/s);
  assert.match(shellStyles, /@media \(max-width:\s*600px\)[\s\S]*?\.app-navigation-item::before\s*\{[^}]*inset:\s*0 -8px;[^}]*border-radius:\s*12px \/ 50%;/s);
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
  const quote = readClient('features/tefekkur/quote.css');
  const homeTefekkur = readClient('features/tefekkur/home-tefekkur.css');
  const videos = readClient('features/videos/videos.css');
  const articles = readClient('features/articles/articles.css');
  const footer = readClient('shared/footer.css');
  const footerHtml = readPublic('fragments/footer.html');
  const cookies = readClient('shared/cookies.css');

  assert.match(base, /@media \(max-width:\s*768px\)[\s\S]*?body\.app-shell-body > \.app-shell-container[\s\S]*?box-sizing:\s*border-box;[\s\S]*?overflow-x:\s*clip;/);
  assert.match(shell, /@media \(max-width:\s*600px\)[\s\S]*?min-height:\s*58px;[\s\S]*?font-size:\s*11px;[\s\S]*?font-size:\s*clamp\(20px, 5\.8vw, 24px\)/);
  assert.match(shell, /@media \(max-width:\s*600px\)[\s\S]*?\.app-navigation\s*\{[^}]*height:\s*calc\(59px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(quote, /@media \(max-width:\s*768px\)[\s\S]*?\.quote-grid-container\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(homeTefekkur, /@media \(max-width:\s*768px\)[\s\S]*?\.home-tefekkur-images\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(videos, /@media \(max-width:\s*768px\)[\s\S]*?\.top-bar\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(videos, /\.videos-container\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(articles, /\.articles-categories\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*overflow-x:\s*auto;/s);
  assert.match(articles, /\.articles-container\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(footer, /\.footer-container\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 1\.15fr\) minmax\(0, 0\.85fr\);[^}]*"social app"[^}]*"corporate corporate";/s);
  assert.match(footer, /\.footer-section\.kurumsal h4\s*\{[^}]*display:\s*none;[\s\S]*?\.footer-section\.kurumsal ul\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*nowrap;[\s\S]*?\.footer-section\.kurumsal ul li \+ li::before\s*\{[^}]*content:\s*"•";/);
  assert.match(footer, /@media \(max-width:\s*768px\)[\s\S]*?\.footer-container\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[\s\S]*?\.footer-section\s*\{[^}]*min-width:\s*0;/);
  assert.match(footer, /@media \(max-width:\s*768px\)[\s\S]*?\.footer-section\.social-media\s*\{[^}]*order:\s*1;[\s\S]*?\.footer-section\.app-download\s*\{[^}]*order:\s*2;/);
  assert.match(footer, /\.footer-section\.app-download\s*\{[^}]*--app-download-content-width:\s*350px;[^}]*grid-area:\s*app;/);
  assert.match(footer, /\.social-link\s*\{[^}]*grid-template-columns:\s*54px minmax\(0, 1fr\) auto;[\s\S]*?\.social-link-action\s*\{[^}]*padding:\s*15px 30px;[\s\S]*?\.footer-section\.app-download \.social-contact-link\s*\{[^}]*width:\s*min\(100%, var\(--app-download-content-width\)\);[^}]*min-height:\s*48px;/);
  assert.match(footer, /\.footer-section\.app-download \.app-download-row\s*\{[^}]*width:\s*min\(100%, var\(--app-download-content-width\)\);[^}]*align-items:\s*center;[^}]*height:\s*clamp\(76px, 7\.8125vw, 100px\);[^}]*margin:\s*5px auto 0;[\s\S]*?\.footer-section\.app-download \.app-icon-container\s*\{[^}]*height:\s*100%;[^}]*aspect-ratio:\s*1;[\s\S]*?\.footer-section\.app-download \.app-icon\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/);
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
  assert.match(cookies, /@media \(max-width:\s*600px\)[\s\S]*?\.cookie-consent-banner\s*\{[^}]*max-height:\s*calc\(100dvh - 96px - env\(safe-area-inset-bottom, 0px\)\);[^}]*overflow-y:\s*auto;/);
  assert.match(cookies, /@media \(max-width:\s*600px\)[\s\S]*?\.cookie-button\s*\{[^}]*min-height:\s*44px;[^}]*flex:\s*1 1 0;[^}]*font-size:\s*16px;/);
  assert.match(shell, /@media \(max-width:\s*600px\)[\s\S]*?\.route-loader-star\s*\{[^}]*font-size:\s*30px;[\s\S]*?\.route-loader-line\s*\{[^}]*width:\s*27px;[\s\S]*?\.route-loader-line span\s*\{[^}]*font-size:\s*16px;/);
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

test('Okumalar haftalık ve analiz bileşenlerini birleştirir, Tesbihat geçici bilgilendirme alanı gösterir', () => {
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
  assert.match(okumalarFragment, /class="settings-section/);
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
  assert.match(tesbihat, /<h3 class="section-heading"><i class="fa-regular fa-moon" aria-hidden="true"><\/i> Tesbihat<\/h3>/);
  assert.match(tesbihat, /class="tesbihat-preparation"[\s\S]*?Tesbihat bölümü çok yakında sizlerle[\s\S]*?RoTaKip'i kullandığınız için teşekkür ederiz[\s\S]*?mailto:alikacardev@gmail\.com[\s\S]*?Çatı Katı Elazığ İlim ve Kültür Derneği/);
  assert.doesNotMatch(tesbihat, /tesbihat-preparation-icon|fa-solid fa-moon/);
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
  assert.doesNotMatch(tefekkur, /quote-loading-placeholder|quote-loading-line/);
  assert.doesNotMatch(tefekkur, /Allah yolunda sevdiğiniz|Sözlerin en doğrusu|Hangi şeye dikkat etsen/);
  assert.match(tefekkur, /class="home-tefekkur-window"/);
  assert.match(tefekkur, /Günün Vecizeleri/);
  assert.equal((tefekkur.match(/class="quote-section-image"/g) || []).length, 2);
  assert.match(tefekkur, /src="\/quotes\/bir_gorsel1\.jpg"[^>]*data-image-name="bir_gorsel1\.jpg"/);
  assert.match(tefekkur, /src="\/quotes\/bir_gorsel2\.jpg"[^>]*data-image-name="bir_gorsel2\.jpg"/);
  assert.match(readClient('features/tefekkur/quote.css'), /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(readClient('features/tefekkur/quote.js'), /function tefekkurLoadingMarkup\(\)\s*\{\s*return '';\s*\}/);
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
  assert.doesNotMatch(articles, /article-loading-image|article-loading-title|article-loading-text/);
  assert.doesNotMatch(readClient('features/articles/articles.js'), /loadingCard|article-loading-/);
  assert.doesNotMatch(readClient('features/articles/articles.js'), /article-loading-spinner/);
  assert.match(readClient('features/articles/articles.css'), /\.article-loading-image\s*\{[^}]*height:\s*175px;[^}]*article-loading/s);
  assert.match(readClient('features/articles/articles.css'), /\.article-image\s*\{[^}]*width:\s*152px;[^}]*height:\s*152px;[^}]*overflow:\s*hidden;/s);
  assert.match(readClient('features/articles/articles.css'), /\.article-image img\s*\{[^}]*height:\s*100%;[^}]*object-fit:\s*cover;/s);
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
  assert.match(router, /const routeStyleLinks = await loadBundleStyles\(ROUTE_ASSETS\[route\.name\]\.styles\)[\s\S]*?route\.name === 'groups'[\s\S]*?link\.disabled = false[\s\S]*?await activateView\(route\)/);
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
  assert.match(directoryStyles, /@media \(max-width:\s*1180px\)[\s\S]*?bottom:\s*calc\(81px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(directoryStyles, /@media \(max-width:\s*600px\)[\s\S]*?bottom:\s*calc\(59px \+ env\(safe-area-inset-bottom, 0px\)\)/);
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
  assert.match(directoryStyles, /@media \(max-width:\s*420px\)[\s\S]*?\.input-container\.image-source-picker\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
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
  assert.match(router, /if \(!groupViewPrepared\)[\s\S]*?await activateView\(route\);[\s\S]*?if \(sequence !== navigationSequence\) return;[\s\S]*?setOkumalarStylesEnabled\(false\)/);
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

test('sekme girişleri rota türüne uygun animasyon kullanır', () => {
  const shellStyles = readClient('shell/shell.css');
  const indexStyles = readClient('features/group-directory/group-directory.css');
  assert.match(shellStyles, /\.tab-view-okumalar\s*\{[^}]*transform:\s*none;[^}]*\}[\s\S]*?\.tab-view-okumalar\.visible\s*\{[^}]*okumalar-tab-view-fade 380ms ease-out forwards;/);
  assert.match(shellStyles, /@keyframes okumalar-tab-view-fade\s*\{[\s\S]*?from\s*\{\s*opacity:\s*0;\s*\}[\s\S]*?to\s*\{\s*opacity:\s*1;\s*\}/);
  assert.doesNotMatch(shellStyles, /@keyframes okumalar-tab-view-fade\s*\{[^}]*translateY/);
  assert.match(shellStyles, /\.tab-view-groups:not\(\.visible\)\s*\{[^}]*transform:\s*none;[^}]*animation:\s*none;[\s\S]*?\.tab-view-groups\.visible\s*\{[^}]*animation:\s*none;/);
  assert.match(shellStyles, /\.tab-view-videos:not\(\.visible\),[\s\S]*?\.tab-view-articles:not\(\.visible\)\s*\{[^}]*opacity:\s*0;[^}]*visibility:\s*hidden;[^}]*translateY\(16px\)/);
  assert.match(shellStyles, /\.tab-view-videos\.visible,[\s\S]*?\.tab-view-articles\.visible\s*\{[^}]*global-tab-view-enter 0\.38s ease-out both/);
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
  assert.match(routeConfig, /tesbihat:\s*\{ scripts:\s*\[\], styles:\s*\[\] \}/);
  assert.match(readClient('shell/shell.css'), /\.tab-view-tesbihat\.visible[\s\S]*?global-tab-view-enter 0\.38s ease-out both/);
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
  assert.match(readClient('features/videos/videos.js'), /await window\.waitForRoutePlaceholder\(videosContainer\)/);
  assert.match(readClient('features/articles/articles.js'), /await window\.waitForRoutePlaceholder\(container\)/);
  assert.match(readClient('features/tefekkur/quote.js'), /hasExistingText[\s\S]*?!hasExistingText[\s\S]*?setTefekkurTextLoading/);
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
  assert.doesNotMatch(readClient('features/tefekkur/quote.css'), /\.share-panel\s*\{/);
  assert.match(readClient('features/tefekkur/share-quote.js'), /requiredShareControls[\s\S]*?some\(control => !control\)/);
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
  assert.match(legacyNavigation, /@media \(max-width:\s*1180px\)/);
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
