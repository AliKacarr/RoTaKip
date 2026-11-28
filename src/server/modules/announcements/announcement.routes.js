'use strict';

// Grup duyuruları: üyeler okur, yönetici yazar/düzenler/siler.
function registerAnnouncementRoutes(app, dependencies) {
  const {
    announcementService,
    requireGroupAdmin,
    requireGroupAuth
  } = dependencies;

  function sendResult(res, result, successStatus = 200) {
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    return res.status(successStatus).json({ success: true, ...result });
  }

  // Şu an görünür duyurular ve okunmamış sayısı. Yönetici ?tumu=1 ile planlı ve süresi dolanları da alır.
  app.get('/api/announcements/:groupId', requireGroupAuth, async (req, res) => {
    try {
      const includeHidden = req.auth.authority === 'admin' && req.query.tumu === '1';
      const result = await announcementService.list({
        groupId: req.auth.groupId,
        userId: req.auth.userId,
        includeHidden
      });
      res.setHeader('Cache-Control', 'no-store');
      res.json(result);
    } catch (error) {
      console.error('Duyurular alınamadı:', error);
      res.status(500).json({ error: 'Duyurular alınamadı' });
    }
  });

  app.post('/api/announcements/:groupId/seen', requireGroupAuth, async (req, res) => {
    try {
      sendResult(res, await announcementService.markSeen({ groupId: req.auth.groupId, userId: req.auth.userId }));
    } catch (error) {
      console.error('Duyurular okundu olarak işaretlenemedi:', error);
      res.status(500).json({ error: 'Duyurular okundu olarak işaretlenemedi' });
    }
  });

  app.post('/api/announcements/:groupId', requireGroupAdmin, async (req, res) => {
    try {
      const result = await announcementService.create({
        groupId: req.auth.groupId,
        userId: req.auth.userId,
        body: req.body || {}
      });
      sendResult(res, result, 201);
    } catch (error) {
      console.error('Duyuru yayımlanamadı:', error);
      res.status(500).json({ error: 'Duyuru yayımlanamadı' });
    }
  });

  app.put('/api/announcements/:groupId/:announcementId', requireGroupAdmin, async (req, res) => {
    try {
      sendResult(res, await announcementService.update({
        groupId: req.auth.groupId,
        announcementId: req.params.announcementId,
        body: req.body || {}
      }));
    } catch (error) {
      console.error('Duyuru güncellenemedi:', error);
      res.status(500).json({ error: 'Duyuru güncellenemedi' });
    }
  });

  app.delete('/api/announcements/:groupId/:announcementId', requireGroupAdmin, async (req, res) => {
    try {
      sendResult(res, await announcementService.remove({
        groupId: req.auth.groupId,
        announcementId: req.params.announcementId
      }));
    } catch (error) {
      console.error('Duyuru silinemedi:', error);
      res.status(500).json({ error: 'Duyuru silinemedi' });
    }
  });
}

module.exports = {
  registerAnnouncementRoutes
};
