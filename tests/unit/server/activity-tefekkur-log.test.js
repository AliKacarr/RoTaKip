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
