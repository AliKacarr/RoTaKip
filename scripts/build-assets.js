const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const CleanCSS = require('clean-css');
const { minify } = require('terser');

const projectRoot = path.resolve(__dirname, '..');
const publicPath = path.join(projectRoot, 'public');
const clientSourcePath = path.join(projectRoot, 'src', 'client');
const legacyAssetFiles = ['index.min.css', 'index.min.js'];

const bundles = {
  'groups-directory': {
    sourceRoot: clientSourcePath,
    css: ['features/group-directory/group-directory.css'],
    js: ['features/group-directory/group-directory.js']
  },
  'access-logs': {
    sourceRoot: path.join(clientSourcePath, 'features', 'activity-logs'),
    css: ['access-logs.css'],
    js: ['access-logs.js'],
    html: ['access-logs.html']
  },
  'login-logs': {
    sourceRoot: path.join(clientSourcePath, 'features', 'activity-logs'),
    css: ['login-logs.css'],
    js: ['login-logs.js'],
    html: ['login-logs.html']
  },
  'site-activity-admin': {
    sourceRoot: path.join(clientSourcePath, 'features', 'site-activity-admin'),
    css: ['site-activity-admin.css'],
    js: ['site-activity-admin.js'],
    html: ['admin.html']
  },
  shell: {
    sourceRoot: clientSourcePath,
    css: [
      'shell/base.css',
      'shared/footer.css',
      'shared/cookies.css',
      'shared/share-modal.css',
      'shell/shell.css',
      'shell/group-legacy-viewport.css'
    ],
    js: ['shared/third-party.js', 'shared/cookies.js'],
    html: ['app-shell.html']
  },
  'group-common': {
    sourceRoot: clientSourcePath,
    css: [
      'features/groups/admin-modal.css',
      'features/profile/profile-modal.css'
    ],
    js: [
      'features/groups/league-config.js',
      'features/groups/group-bootstrap.js',
      'shared/share-utils.js'
    ]
  },
  'group-ui': {
    sourceRoot: clientSourcePath,
    css: [],
    js: ['features/groups/admin-modal.js']
  },
  okumalar: {
    sourceRoot: clientSourcePath,
    css: [
      'features/readings/reading-reveal.css',
      'features/readings/league-info.css',
      'features/readings/statistics-layout.css',
      'features/readings/tracker-table.css',
      'features/readings/reading-message-panels.css',
      'features/readings/reading-journey.css',
      'features/daily-gift/daily-gift.css',
      'features/readings/preferences.css'
    ],
    js: [
      'features/readings/reading-reveal.js',
      'features/readings/reading-edit-mode.js',
      'features/readings/reading-journey.js',
      'features/daily-gift/daily-gift.js',
      'features/readings/weekly-table-image.js',
      'features/readings/tracker-table.js',
      'features/readings/reading-message-panels.js'
    ]
  },
  management: {
    sourceRoot: clientSourcePath,
    css: ['features/readings/group-management.css'],
    js: ['features/readings/group-management.js']
  },
  statistics: {
    sourceRoot: clientSourcePath,
    css: [
      'features/readings/analytics/user-cards.css',
      'features/readings/analytics/longest-series.css',
      'features/readings/analytics/stats-section.css',
      'features/readings/analytics/monthly.css'
    ],
    js: [
      'features/readings/analytics/user-cards.js',
      'features/readings/analytics/longest-series.js',
      'features/readings/analytics/stats-section.js',
      'features/readings/analytics/monthly.js'
    ]
  },
  tesbihat: {
    sourceRoot: path.join(clientSourcePath, 'features', 'tesbihat'),
    css: ['tesbihat-base.css', 'tesbihat-home.css', 'location-picker.css', 'tesbihat-reader.css'],
    js: [
      'tesbihat-utils.js',
      'tesbihat-store.js',
      'prayer-schedule.js',
      'tesbihat-home.js',
      'location-picker.js',
      'tesbihat-reader.js',
      'tesbihat-tab.js'
    ]
  },
  videos: {
    sourceRoot: path.join(clientSourcePath, 'features', 'videos'),
    css: ['videos.css'],
    js: ['videos.js']
  },
  tefekkur: {
    sourceRoot: path.join(clientSourcePath, 'features', 'tefekkur'),
    css: ['quote.css', 'home-tefekkur.css'],
    js: ['quote.js', 'share-quote.js', 'home-tefekkur.js']
  },
  articles: {
    sourceRoot: path.join(clientSourcePath, 'features', 'articles'),
    css: ['articles.css'],
    js: ['articles.js']
  }
};

function readRequiredFiles(fileNames, sourceRoot = publicPath) {
  const filePaths = fileNames.map(fileName => path.join(sourceRoot, fileName));
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
  const cssSource = readRequiredFiles(config.css, config.sourceRoot);
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

  const jsSource = readRequiredFiles(config.js, config.sourceRoot);
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
  legacyAssetFiles.forEach(fileName => {
    fs.rmSync(path.join(publicPath, fileName), { force: true });
  });
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
