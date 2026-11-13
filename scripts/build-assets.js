const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const CleanCSS = require('clean-css');
const { minify } = require('terser');

const projectRoot = path.resolve(__dirname, '..');
const publicPath = path.join(projectRoot, 'public');

const bundles = {
  index: {
    css: ['index.css', 'footer.css'],
    js: ['third-party.js', 'index.js'],
    html: ['index.html']
  },
  shell: {
    css: [
      'style.css',
      'footer.css',
      'groups-footer.css',
      'cookies.css',
      'share-modal.css',
      'shell.css'
    ],
    js: ['third-party.js', 'cookies.js'],
    html: ['groups.html']
  },
  'group-common': {
    css: [
      'admin-modal.css',
      'daily-gift.css',
      'profile-modal.css'
    ],
    js: [
      'league-config.js',
      'script.js',
      'admin-modal.js',
      'daily-gift.js',
      'reading-journey.js',
      'share-utils.js'
    ]
  },
  weekly: {
    css: [
      'tracker-table.css',
      'reading-message-panels.css',
      'home-mercy.css',
      'main-area.css',
      'preferences.css'
    ],
    js: [
      'reading-edit-mode.js',
      'weekly-table-image.js',
      'tracker-table.js',
      'reading-message-panels.js',
      'home-mercy.js',
      'main-area.js'
    ]
  },
  statistics: {
    css: [
      'user-cards.css',
      'longest-series.css',
      'stats-section.css',
      'monthly.css'
    ],
    js: [
      'user-cards.js',
      'longest-series.js',
      'stats-section.js',
      'monthly.js'
    ]
  },
  videos: {
    css: ['videos.css'],
    js: ['videos.js']
  },
  mercy: {
    css: ['quote.css'],
    js: ['quete.js', 'share-quote.js']
  },
  articles: {
    css: ['articles.css'],
    js: ['articles.js']
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

async function buildBundle(bundleName, config, manifest) {
  const cssSource = readRequiredFiles(config.css);
  if (cssSource) {
    const cssResult = new CleanCSS().minify(cssSource);
    if (cssResult.errors.length > 0) {
      throw new Error(`${bundleName} CSS minify hatası: ${cssResult.errors.join(', ')}`);
    }

    const cssFileName = `${bundleName}.min.css`;
    fs.writeFileSync(path.join(publicPath, cssFileName), cssResult.styles);
    const cssVersion = contentHash(cssResult.styles);
    manifest[cssFileName] = `${cssFileName}?v=${cssVersion}`;
    (config.html || []).forEach(htmlFileName => updateHtmlAssetVersion(htmlFileName, cssFileName, cssVersion));
  }

  const jsSource = readRequiredFiles(config.js);
  if (jsSource) {
    const jsResult = await minify(jsSource, {
      compress: {
        pure_funcs: ['console.log', 'console.debug', 'console.info']
      },
      mangle: true
    });
    if (!jsResult.code) {
      throw new Error(`${bundleName} JS minify çıktısı boş`);
    }

    const jsFileName = `${bundleName}.min.js`;
    fs.writeFileSync(path.join(publicPath, jsFileName), jsResult.code);
    const jsVersion = contentHash(jsResult.code);
    manifest[jsFileName] = `${jsFileName}?v=${jsVersion}`;
    (config.html || []).forEach(htmlFileName => updateHtmlAssetVersion(htmlFileName, jsFileName, jsVersion));
  }
}

async function buildAssets() {
  const manifest = {};
  for (const [bundleName, config] of Object.entries(bundles)) {
    await buildBundle(bundleName, config, manifest);
  }
  fs.writeFileSync(
    path.join(publicPath, 'assets-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );
  console.log('Frontend asset paketleri oluşturuldu.');
}

buildAssets().catch(error => {
  console.error('Asset build hatası:', error);
  process.exitCode = 1;
});
