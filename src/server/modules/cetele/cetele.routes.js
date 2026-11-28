'use strict';

const mongoose = require('mongoose');
const { parseRange } = require('./cetele.service');

function registerCeteleRoutes(app, dependencies) {
  const {
    UserGroup,
    ceteleService,
    isReadingDateAllowedByPolicy,
    isValidReadingDate,
    istanbulDateKey,
    istanbulYesterdayKey,
    normalizeReadingEditPolicy,
    requireGroupAdmin,
    requireGroupAuth,
    requireSelfOrAdmin,
    shiftDateKey
  } = dependencies;

  async function loadGroup(req, res) {
    const group = await UserGroup.findOne({ groupId: req.params.groupId }).lean();
    if (!group) {
      res.status(404).json({ error: 'Grup bulunamadı' });
      return null;
    }
    return group;
  }

  function rangeFrom(req) {
    return parseRange(req.query, {
      isValidDate: isValidReadingDate,
      todayKey: istanbulDateKey(),
      shiftDateKey
    });
  }

  // Yazma isteklerinde hedef kişi, tarih ve grubun düzenleme aralığı denetlenir.
  async function prepareWrite(req, res) {
    const { userId, date } = req.body || {};
    if (!mongoose.isValidObjectId(userId) || !isValidReadingDate(date)) {
      res.status(400).json({ error: 'Geçersiz kullanıcı veya tarih' });
      return null;
    }
    const group = await loadGroup(req, res);
    if (!group) return null;
    if (req.auth.authority !== 'admin' && !isReadingDateAllowedByPolicy(
      date,
      group.readingEditPolicy,
      istanbulDateKey(),
      istanbulYesterdayKey()
    )) {
      res.status(403).json({
        code: 'READING_EDIT_DATE_RESTRICTED',
        error: 'Bu tarih grup düzenleme ayarlarına göre değiştirilemez',
        readingEditPolicy: normalizeReadingEditPolicy(group.readingEditPolicy)
      });
      return null;
    }
    return { group, userId: String(userId), date };
  }

  // Çetele yapılandırması ve tarih aralığındaki (okuma alanı dışındaki) kayıtlar.
  app.get('/api/cetele/:groupId', requireGroupAuth, async (req, res) => {
    try {
      const range = rangeFrom(req);
      if (range.error) return res.status(400).json({ error: range.error });
      const group = await loadGroup(req, res);
      if (!group) return;
      const result = await ceteleService.listEntries({
        group,
        from: range.from,
        to: range.to
      });
      res.setHeader('Cache-Control', 'no-store');
      res.json(result);
    } catch (error) {
      console.error('Çetele kayıtları alınamadı:', error);
      res.status(500).json({ error: 'Çetele kayıtları alınamadı' });
    }
  });

  app.put('/api/cetele/:groupId/entry', requireSelfOrAdmin, async (req, res) => {
    try {
      const target = await prepareWrite(req, res);
      if (!target) return;
      const result = await ceteleService.saveEntry({ ...target, values: req.body.values });
      if (result.error) return res.status(result.status).json({ error: result.error, code: result.code });
      res.json({ success: true, entry: result.entry, readingChanged: result.readingChanged, reading: result.reading });
    } catch (error) {
      console.error('Çetele kaydedilemedi:', error);
      res.status(500).json({ error: 'Çetele kaydedilemedi' });
    }
  });

  app.delete('/api/cetele/:groupId/entry', requireSelfOrAdmin, async (req, res) => {
    try {
      const target = await prepareWrite(req, res);
      if (!target) return;
      await ceteleService.deleteEntry(target);
      res.json({ success: true });
    } catch (error) {
      console.error('Çetele kaydı silinemedi:', error);
      res.status(500).json({ error: 'Çetele kaydı silinemedi' });
    }
  });

  // Alanlar (ilk alan okuma/lig alanıdır) ve ayrıntı görünürlüğü. Yalnız yönetici.
  app.put('/api/cetele/:groupId/config', requireGroupAdmin, async (req, res) => {
    try {
      const group = await loadGroup(req, res);
      if (!group) return;
      const result = await ceteleService.updateConfig({ group, body: req.body || {} });
      if (result.error) return res.status(result.status).json({ error: result.error });
      res.json({ success: true, group: result.group, config: result.config });
    } catch (error) {
      console.error('Çetele ayarları güncellenemedi:', error);
      res.status(500).json({ error: 'Çetele ayarları güncellenemedi' });
    }
  });
}

module.exports = {
  registerCeteleRoutes
};
