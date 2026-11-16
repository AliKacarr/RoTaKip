'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '../../..');
const serverRoot = path.join(projectRoot, 'src', 'server');

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

test('app.js ince bir composition root olarak kalır', () => {
  const appSource = fs.readFileSync(path.join(serverRoot, 'app.js'), 'utf8');
  const lineCount = appSource.split(/\r?\n/).length;

  assert.ok(lineCount <= 250, `app.js ${lineCount} satır; özellik kodu modüllere taşınmalı`);
  assert.doesNotMatch(appSource, /\bapp\.(?:get|post|put|patch|delete)\s*\(/);
  assert.match(appSource, /registerGroupRoutes\(app, routeDependencies\)/);
  assert.match(appSource, /registerReadingRoutes\(app, routeDependencies\)/);
});

test('sunucu rota dosyaları tutarlı .routes.js adlandırmasını kullanır', () => {
  const routeFiles = walk(serverRoot)
    .filter(filePath => /(?:routes|route)[.]js$/.test(path.basename(filePath)));

  assert.ok(routeFiles.length > 0);
  routeFiles.forEach(filePath => {
    assert.match(path.basename(filePath), /[.]routes[.]js$/);
  });
});

test('paket girişleri süreç başlangıcı ve geliştirme başlangıcını kullanır', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));

  assert.equal(packageJson.main, 'src/server/start.js');
  assert.equal(packageJson.scripts.start, 'node src/server/start.js');
  assert.equal(packageJson.scripts.dev, 'node --watch src/server/start.js');
});
