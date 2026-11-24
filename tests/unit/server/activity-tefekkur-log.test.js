'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { SiteActivityLog } = require('../../../src/server/modules/activity/activity.models');
const { createActivityService } = require('../../../src/server/modules/activity/activity.service');

const ACTION = 'tefekkur_bölüm_görüntüleme';
const request = { ip: '203.0.113.7', headers: { 'user-agent': 'test' }, socket: {} };

// Veritabanına bağlanmadan: aynı dakika sorgusu ve kayıt işlemi geçici olarak taklit edilir.
async function withFakeLog(existing, run) {
  const saved = [];
  const queries = [];
  const originalFindOne = SiteActivityLog.findOne;
  const originalSave = SiteActivityLog.prototype.save;
  SiteActivityLog.findOne = query => {
    queries.push(query);
    return { select() { return this; }, lean: async () => (existing ? { _id: 'var' } : null) };
  };
  SiteActivityLog.prototype.save = async function save() {
    saved.push(this.toObject());
    return this;
  };
  try {
    const { logSiteActivity } = createActivityService({ getSessionMembership: () => null });
    await run(logSiteActivity);
  } finally {
    SiteActivityLog.findOne = originalFindOne;
    SiteActivityLog.prototype.save = originalSave;
  }
  return { saved, queries };
}

test('tefekkür bölüm kaydı görünüm, bölüm ve okuma biçimini saklar', async () => {
  const { saved } = await withFakeLog(false, async logSiteActivity => {
    await logSiteActivity({ action: ACTION, req: request, view: 'slider', section: 'risale', mode: 'resim' });
    await logSiteActivity({ action: ACTION, req: request, view: 'radio', section: 'kuran-radyo', mode: null });
  });
  assert.equal(saved.length, 2);
  assert.deepEqual(
    saved.map(({ action, view, section, mode }) => ({ action, view, section, mode })),
    [
      { action: ACTION, view: 'slider', section: 'risale', mode: 'resim' },
      { action: ACTION, view: 'radio', section: 'kuran-radyo', mode: undefined }
    ]
  );
  assert.equal(saved[0].ipAddress, '203.0.113.7');
});

test('tefekkür bölüm kaydı bilinmeyen değerleri ve ana listeyi kaydetmez', async () => {
  const { saved } = await withFakeLog(false, async logSiteActivity => {
    await logSiteActivity({ action: ACTION, req: request, view: 'home', section: 'ayet' });
    await logSiteActivity({ action: ACTION, req: request, view: 'slider', section: '<script>' });
    await logSiteActivity({ action: ACTION, req: request, view: 'slider' });
    await logSiteActivity({ action: ACTION, req: request, view: 'bilinmeyen', section: 'ayet' });
  });
  assert.equal(saved.length, 0);
});

test('geçersiz okuma biçimi atılır, kayıt bölümle birlikte yazılır', async () => {
  const { saved } = await withFakeLog(false, async logSiteActivity => {
    await logSiteActivity({ action: ACTION, req: request, view: 'slider', section: 'esma', mode: 'rastgele' });
  });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].section, 'esma');
  assert.equal(saved[0].mode, undefined);
});

test('aynı dakikadaki aynı bölüm kaydı tekrarlanmaz ve sorgu bölümü içerir', async () => {
  const { saved, queries } = await withFakeLog(true, async logSiteActivity => {
    await logSiteActivity({ action: ACTION, req: request, view: 'slider', section: 'ayet' });
  });
  assert.equal(saved.length, 0);
  assert.equal(queries[0].section, 'ayet');
  assert.equal(queries[0].view, 'slider');
});

test('tefekkür alanları tesbihat ve diğer eylem kayıtlarına karışmaz', async () => {
  const { saved } = await withFakeLog(false, async logSiteActivity => {
    await logSiteActivity({ action: 'tesbihat_görüntüleme', req: request, view: 'home', section: 'ayet', mode: 'metin' });
    await logSiteActivity({ action: 'tefekkur_görüntüleme', req: request, view: 'slider', section: 'ayet' });
  });
  assert.equal(saved.length, 2);
  saved.forEach(entry => {
    assert.equal(entry.section, undefined);
    assert.equal(entry.mode, undefined);
  });
  assert.equal(saved[0].view, 'home');
  assert.equal(saved[1].view, undefined);
});

const ARTICLE_ACTION = 'makaleler_kategori_görüntüleme';

test('makale kategori kaydı görünüm ve kategori slug\'ını saklar', async () => {
  const { saved } = await withFakeLog(false, async logSiteActivity => {
    await logSiteActivity({ action: ARTICLE_ACTION, req: request, view: 'category', section: 'kader' });
  });
  assert.equal(saved.length, 1);
  assert.deepEqual(
    { action: saved[0].action, view: saved[0].view, section: saved[0].section },
    { action: ARTICLE_ACTION, view: 'category', section: 'kader' }
  );
  assert.equal(saved[0].ipAddress, '203.0.113.7');
});

test('makale kategori kaydı bilinmeyen değerleri ve kategori listesini kaydetmez', async () => {
  const { saved } = await withFakeLog(false, async logSiteActivity => {
    await logSiteActivity({ action: ARTICLE_ACTION, req: request, view: 'home', section: 'kader' });
    await logSiteActivity({ action: ARTICLE_ACTION, req: request, view: 'category', section: '<script>' });
    await logSiteActivity({ action: ARTICLE_ACTION, req: request, view: 'category' });
    await logSiteActivity({ action: ARTICLE_ACTION, req: request, view: 'category', section: 'ayet' });
  });
  assert.equal(saved.length, 0);
});

test('makale kategori kaydı aynı dakikada tekrarlanmaz', async () => {
  const { saved, queries } = await withFakeLog(true, async logSiteActivity => {
    await logSiteActivity({ action: ARTICLE_ACTION, req: request, view: 'category', section: 'evrim' });
  });
  assert.equal(saved.length, 0);
  assert.equal(queries[0].section, 'evrim');
});

test('makale kategori slug listesi fragmentteki kategori kartlarıyla birebir aynıdır', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { ARTICLE_CATEGORY_SLUGS } = require('../../../src/server/modules/activity/activity.service');
  const fragment = fs.readFileSync(path.join(__dirname, '../../../public/fragments/articles.html'), 'utf8');
  const slugs = Array.from(fragment.matchAll(/data-slug="([^"]+)"/g), match => match[1]);
  assert.deepEqual([...slugs].sort(), [...ARTICLE_CATEGORY_SLUGS].sort());
});

const VIDEO_ACTION = 'videolar_bölüm_görüntüleme';

test('video bölüm kaydı yalnız bilinen bölümü saklar', async () => {
  const { saved } = await withFakeLog(false, async logSiteActivity => {
    await logSiteActivity({ action: VIDEO_ACTION, req: request, section: 'shorts', view: 'slider', mode: 'resim' });
    await logSiteActivity({ action: VIDEO_ACTION, req: request, section: 'hesabim' });
  });
  assert.deepEqual(
    saved.map(({ action, view, section, mode }) => ({ action, view, section, mode })),
    [
      { action: VIDEO_ACTION, view: undefined, section: 'shorts', mode: undefined },
      { action: VIDEO_ACTION, view: undefined, section: 'hesabim', mode: undefined }
    ]
  );
});

test('video bölüm kaydı bilinmeyen veya eksik bölümü kaydetmez', async () => {
  const { saved } = await withFakeLog(false, async logSiteActivity => {
    await logSiteActivity({ action: VIDEO_ACTION, req: request });
    await logSiteActivity({ action: VIDEO_ACTION, req: request, section: '<script>' });
    await logSiteActivity({ action: VIDEO_ACTION, req: request, section: 'ayet' });
  });
  assert.equal(saved.length, 0);
});

test('video bölüm listesi istemcideki bölüm adlarıyla birebir aynıdır', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { VIDEO_SECTIONS } = require('../../../src/server/modules/activity/activity.service');
  const source = fs.readFileSync(path.join(__dirname, '../../../src/client/features/videos/videos-tab.js'), 'utf8');
  const match = /const LOG_SECTIONS = \{([^}]+)\}/.exec(source);
  assert.ok(match, 'videos-tab.js LOG_SECTIONS tanımlamalı');
  const sections = Array.from(match[1].matchAll(/'([a-z]+)'/g), item => item[1]);
  assert.deepEqual([...new Set(sections)].sort(), [...VIDEO_SECTIONS].sort());
});
