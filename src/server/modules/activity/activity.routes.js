'use strict';

function registerActivityRoutes(app, dependencies) {
  const {
    AccessLog,
    LoginLog,
    ISTANBUL_TIME_ZONE,
    SiteActivityLog,
    UserGroup,
    buildDeviceInfo,
    getTurkeyDayBoundsFromTrDateString,
    hasLogInSameTurkeyMinute,
    isSafeGroupId,
    logSiteActivity,
    publicLogLimiter,
    requireGroupAdmin,
    requireSiteActivityAdmin,
    resolveLogActor
  } = dependencies;

  // Yetkisiz erişim logu endpoint'i
  app.post('/api/log-unauthorized', publicLogLimiter, async (req, res) => {
    try {
      const { action, deviceInfo, groupId } = req.body;
      const gid = isSafeGroupId(groupId) ? String(groupId) : null;
      const storedActor = await resolveLogActor(req, gid);
      const storedAction = typeof action === 'string' ? action.trim().slice(0, 100) : 'bilinmeyen_eylem';

      if (await hasLogInSameTurkeyMinute(AccessLog, {
        groupId: gid,
        action: storedAction,
        ipAddress: storedActor
      })) {
        return res.json({ success: true });
      }

      // Create a new log entry
      const log = new AccessLog({
        action: storedAction,
        timestamp: new Date(),
        deviceInfo: buildDeviceInfo(req, deviceInfo),
        ipAddress: storedActor,
        groupId: gid
      });

      await log.save();
      res.json({ success: true });
    } catch (error) {
      console.error('Error logging unauthorized access:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Erişim logları endpoint'i
  app.get('/api/access-logs', requireGroupAdmin, async (req, res) => {
    try {
      const { groupId } = req.query;
      let query = {};

      // If groupId is provided, filter by groupId
      if (groupId) {
        query.groupId = groupId;
      }

      const logs = await AccessLog.find(query).sort({ timestamp: -1 }).lean();
      res.json(logs);
    } catch (error) {
      console.error('Error fetching access logs:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Belirli bir İstanbul takvim günündeki accesslogs kayıtlarını sil (grup bazlı)
  app.delete('/api/access-logs/day', requireGroupAdmin, async (req, res) => {
    try {
      const { trDate, groupId } = req.body || {};
      if (!trDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(trDate))) {
        return res.status(400).json({ error: 'trDate (YYYY-MM-DD) gerekli' });
      }
      const gid = groupId ? String(groupId).trim() : '';
      if (!gid) {
        return res.status(400).json({ error: 'groupId gerekli' });
      }
      const bounds = getTurkeyDayBoundsFromTrDateString(trDate);
      if (!bounds) {
        return res.status(400).json({ error: 'Geçersiz trDate' });
      }
      const result = await AccessLog.deleteMany({
        groupId: gid,
        timestamp: { $gte: bounds.start, $lt: bounds.end }
      });
      res.json({ success: true, deletedCount: result.deletedCount });
    } catch (error) {
      console.error('Error deleting access logs by day:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Login logs endpoint
  app.get('/api/login-logs', requireGroupAdmin, async (req, res) => {
    try {
      const { groupId } = req.query;
      let query = {};

      // If groupId is provided, filter by groupId
      if (groupId) {
        query.groupId = groupId;
      }

      const logs = await LoginLog.find(query).sort({ timestamp: -1 }).lean();

      // Format the dates before sending to client
      const formattedLogs = logs.map(log => {
        const formattedDate = new Intl.DateTimeFormat('tr-TR', {
          timeZone: ISTANBUL_TIME_ZONE,
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }).format(new Date(log.timestamp));

        // Return the log with both raw date (for sorting) and formatted date
        // Note: logs are fetched with .lean(), so use plain object fields directly.
        return {
          ...log,
          timestamp: log.timestamp,
          formattedDate: formattedDate
        };
      });

      res.json(formattedLogs);
    } catch (error) {
      console.error('Error fetching login logs:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Belirli bir İstanbul takvim günündeki loginlogs kayıtlarını sil (grup bazlı)
  app.delete('/api/login-logs/day', requireGroupAdmin, async (req, res) => {
    try {
      const { trDate, groupId } = req.body || {};
      if (!trDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(trDate))) {
        return res.status(400).json({ error: 'trDate (YYYY-MM-DD) gerekli' });
      }
      const gid = groupId ? String(groupId).trim() : '';
      if (!gid) {
        return res.status(400).json({ error: 'groupId gerekli' });
      }
      const bounds = getTurkeyDayBoundsFromTrDateString(trDate);
      if (!bounds) {
        return res.status(400).json({ error: 'Geçersiz trDate' });
      }
      const result = await LoginLog.deleteMany({
        groupId: gid,
        timestamp: { $gte: bounds.start, $lt: bounds.end }
      });
      res.json({ success: true, deletedCount: result.deletedCount });
    } catch (error) {
      console.error('Error deleting login logs by day:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });


  // Site activity logs endpoint
  app.get('/api/site-activity-logs', requireSiteActivityAdmin, async (req, res) => {
    try {
      const { action } = req.query;
      const query = {};
      if (action) {
        query.action = action;
      }

      const logs = await SiteActivityLog.find(query).sort({ timestamp: -1 }).lean();
      res.json(logs);
    } catch (error) {
      console.error('Error fetching site activity logs:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Etkinlik kayıtları sayfası: tüm grupların özeti (yalnızca kimlik / ad / görünürlük)
  app.get('/api/site-activity-groups', requireSiteActivityAdmin, async (req, res) => {
    try {
      const groups = await UserGroup.find({})
        .select('groupId groupName visibility')
        .sort({ groupName: 1, groupId: 1 })
        .lean();
      res.json({ groups });
    } catch (error) {
      console.error('Error fetching groups for site activity admin:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Belirli bir İstanbul takvim günündeki siteactivitylogs kayıtlarını sil; action gönderilirse sadece o eylem
  app.delete('/api/site-activity-logs/day', requireSiteActivityAdmin, async (req, res) => {
    try {
      const { trDate, action } = req.body || {};
      if (!trDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(trDate))) {
        return res.status(400).json({ error: 'trDate (YYYY-MM-DD) gerekli' });
      }
      const bounds = getTurkeyDayBoundsFromTrDateString(trDate);
      if (!bounds) {
        return res.status(400).json({ error: 'Geçersiz trDate' });
      }
      const q = {
        groupId: req.auth.groupId,
        timestamp: { $gte: bounds.start, $lt: bounds.end }
      };
      if (action && String(action).trim()) {
        q.action = String(action).trim();
      }
      const result = await SiteActivityLog.deleteMany(q);
      res.json({ success: true, deletedCount: result.deletedCount });
    } catch (error) {
      console.error('Error deleting site activity logs by day:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Ana sayfa görüntüleme log endpoint'i
  app.post('/api/log-home-visit', publicLogLimiter, async (req, res) => {
    try {
      const { deviceInfo, action } = req.body || {};

      await logSiteActivity({
        action: action || 'ana_sayfa_görüntüleme',
        req,
        groupId: null,
        deviceInfo
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error logging home visit:', error);
      res.status(500).json({ success: false, error: 'Server error' });
    }
  });

  // Ziyaret logu endpoint'i
  app.post('/api/log-visit', publicLogLimiter, async (req, res) => {
    try {
      const { deviceInfo, groupId, action } = req.body || {};
      const siteAction = (action || 'grup_görüntüleme').toString().trim();
      const shouldWriteAccessLog = (
        siteAction === 'grup_görüntüleme'
      );

      const gid = isSafeGroupId(groupId) ? String(groupId) : null;
      const storedActor = await resolveLogActor(req, gid);

      if (shouldWriteAccessLog) {
        if (!(await hasLogInSameTurkeyMinute(LoginLog, {
          groupId: gid,
          ipAddress: storedActor
        }))) {
          const log = new LoginLog({
            deviceInfo: buildDeviceInfo(req, deviceInfo),
            ipAddress: storedActor,
            groupId: gid
          });
          await log.save();
        }
      }

      await logSiteActivity({
        action: siteAction,
        req,
        groupId,
        deviceInfo,
        actor: storedActor
      });
      res.json({ success: true });
    } catch (error) {
      console.error('Error logging visit:', error);
      res.status(500).json({ success: false, error: 'Server error' });
    }
  });

  // Ziyaret logu için adblock'a daha az takılan alternatif endpoint
  app.post('/api/visit-event', publicLogLimiter, async (req, res) => {
    try {
      const { deviceInfo, groupId, action } = req.body || {};
      const siteAction = (action || 'grup_görüntüleme').toString().trim();
      const shouldWriteAccessLog = (
        siteAction === 'grup_görüntüleme'
      );

      const gid = isSafeGroupId(groupId) ? String(groupId) : null;
      const storedActor = await resolveLogActor(req, gid);

      if (shouldWriteAccessLog) {
        if (!(await hasLogInSameTurkeyMinute(LoginLog, {
          groupId: gid,
          ipAddress: storedActor
        }))) {
          const log = new LoginLog({
            deviceInfo: buildDeviceInfo(req, deviceInfo),
            ipAddress: storedActor,
            groupId: gid
          });
          await log.save();
        }
      }

      await logSiteActivity({
        action: siteAction,
        req,
        groupId,
        deviceInfo,
        actor: storedActor
      });
      res.json({ success: true });
    } catch (error) {
      console.error('Error logging visit event:', error);
      res.status(500).json({ success: false, error: 'Server error' });
    }
  });




}

module.exports = {
  registerActivityRoutes
};

