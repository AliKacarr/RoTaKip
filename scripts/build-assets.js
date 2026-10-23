const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const CleanCSS = require('clean-css');
const { minify } = require('terser');

const projectRoot = path.resolve(__dirname, '..');
const publicPath = path.join(projectRoot, 'public');

const bundles = {
  index: {
    css: ['index.css'],
    js: ['third-party.js', 'index.js']
  },
  groups: {
    css: [
      'style.css',
      'tracker-table.css',
      'user-cards.css',
      'admin-modal.css',
      'daily-gift.css',
      'quote.css',
      'stats-section.css',
      'longest-series.css',
      'monthly.css',
      'videos.css',
      'main-area.css',
      'preferences.css',
      'articles.css',
      'footer.css',
      'profile-modal.css',
      'cookies.css',
      'share-modal.css'
    ],
    js: [
      'third-party.js',
      'script.js',
      'admin-modal.js',
      'reading-edit-mode.js',
      'weekly-table-image.js',
      'tracker-table.js',
      'user-cards.js',
      'daily-gift.js',
      'longest-series.js',
      'stats-section.js',
      'monthly.js',
      'quete.js',
      'videos.js',
      'main-area.js',
      'articles.js',
      'share-quote.js',
      'share-utils.js',
      'cookies.js'
    ]
  }
};

function readRequiredFiles(fileNames) {
  const filePaths = fileNames.map(fileName => path.join(publicPath, fileName));
  const missingFiles = filePaths
    .filter(filePath => !fs.existsSync(filePath))
    .map(filePath => path.relative(projectRoot, filePath));

  if (missingFiles.length > 0) {
    throw new Error(`Asset kaynak dosyaları eksik: ${missingFiles.join(', ')}`);
  }

  return filePaths
    .map(filePath => fs.readFileSync(filePath, 'utf8'))
    .join('\n');
}

function contentHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
}

function updateHtmlAssetVersion(htmlFileName, assetFileName, version) {
  const htmlPath = path.join(publicPath, htmlFileName);
  if (!fs.existsSync(htmlPath)) return;

  const escapedAssetName = assetFileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const referencePattern = new RegExp(`${escapedAssetName}(?:\\?v=[a-f0-9]+)?`, 'g');
  const currentHtml = fs.readFileSync(htmlPath, 'utf8');
  const nextHtml = currentHtml.replace(referencePattern, `${assetFileName}?v=${version}`);

  if (nextHtml !== currentHtml) {
    fs.writeFileSync(htmlPath, nextHtml);
  }
}

async function buildBundle(bundleName, config) {
  const cssSource = readRequiredFiles(config.css);
  if (cssSource) {
    const cssResult = new CleanCSS().minify(cssSource);
    if (cssResult.errors.length > 0) {
      throw new Error(`${bundleName} CSS minify hatası: ${cssResult.errors.join(', ')}`);
    }

    const cssFileName = `${bundleName}.min.css`;
    fs.writeFileSync(path.join(publicPath, cssFileName), cssResult.styles);
    updateHtmlAssetVersion(`${bundleName}.html`, cssFileName, contentHash(cssResult.styles));
  }

  const jsSource = readRequiredFiles(config.js);
  if (jsSource) {
    const jsResult = await minify(jsSource, { compress: true, mangle: true });
    if (!jsResult.code) {
      throw new Error(`${bundleName} JS minify çıktısı boş`);
    }

    const jsFileName = `${bundleName}.min.js`;
    fs.writeFileSync(path.join(publicPath, jsFileName), jsResult.code);
    updateHtmlAssetVersion(`${bundleName}.html`, jsFileName, contentHash(jsResult.code));
  }
}

async function buildAssets() {
  for (const [bundleName, config] of Object.entries(bundles)) {
    await buildBundle(bundleName, config);
  }
  console.log('Frontend asset paketleri oluşturuldu.');
}

buildAssets().catch(error => {
  console.error('Asset build hatası:', error);
  process.exitCode = 1;
});
