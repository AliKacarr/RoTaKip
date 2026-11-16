'use strict';

const mongoose = require('mongoose');

function registerReadingRoutes(app, dependencies) {
  const {
    ERP_SKO_GROUP_SET,
    UserGroup,
    activeUserQuery,
    getErpReadingsChangeVersion,
    getGroupCollections,
    isReadingDateAllowedByPolicy,
    isValidReadingDate,
    istanbulDateKey,
    istanbulYesterdayKey,
    normalizeReadingEditPolicy,
    requireGroupAdmin,
    requireReadableGroup,
    requireSelfOrAdmin,
    safeUser,
    syncErpReadingsOnDemand
  } = dependencies;

  // 3.3. OKUMA İSTATİSTİKLERİ
  // ============================================================================

  // ERP bağlantılı gruplarda sayfa açıldıktan sonra senkronizasyonu arka planda
  // çalıştırır. İstemci yalnızca veritabanı gerçekten değiştiğinde sayfayı yeniler.
  app.post('/api/erp-readings-sync/:groupId', requireReadableGroup, async (req, res) => {
    const { groupId } = req.params;
    if (!ERP_SKO_GROUP_SET.has(groupId)) {
      return res.status(404).json({ error: 'Bu grup için ERP senkronizasyonu etkin değil' });
    }

    try {
      const rawKnownVersion = Number(req.body?.knownVersion);
      const knownVersion = Number.isSafeInteger(rawKnownVersion) && rawKnownVersion >= 0
        ? rawKnownVersion
        : 0;
      const result = await syncErpReadingsOnDemand({
        db: mongoose.connection.db,
        groupId
      });
      const changeVersion = result.changeVersion ?? getErpReadingsChangeVersion(groupId);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({
        success: result.success !== false,
        changed: result.changed === true || changeVersion > knownVersion,
        changeVersion,
        skipped: result.skipped || null
      });
    } catch (syncError) {
      console.error(`[ErpReadingsSync:on-demand:${groupId}]`, syncError.message || syncError);
      return res.status(502).json({
        success: false,
        changed: false,
        error: 'ERP okuma verileri şu anda güncellenemedi'
      });
    }
  });

  // Tüm verileri çekme endpoint'i
  app.get('/api/all-data/:groupId', requireReadableGroup, async (req, res) => {
    try {
      const { groupId } = req.params;

      const group = req.group;
      const erpSyncEnabled = ERP_SKO_GROUP_SET.has(groupId);
      // Sürümü sorgulardan önce al: bu sırada tamamlanan bir senkron varsa
      // istemcinin arka plan kontrolü eski anlık görüntüyü fark edebilsin.
      const erpSyncVersion = erpSyncEnabled
        ? getErpReadingsChangeVersion(groupId)
        : 0;

      // Dinamik koleksiyonları al
      const { users, readingStatuses } = getGroupCollections(groupId);

      const usersData = await users.find(activeUserQuery())
        .select('_id name profileImage authority visibility loginStreak lastLoginDate lastCongratulatedLeague')
        .sort({ name: 1 })
        .lean();
      const activeUserIds = usersData.map(user => String(user._id));
      const statsData = activeUserIds.length > 0
        ? await readingStatuses.find({ userId: { $in: activeUserIds } })
          .select('userId date status amount -_id')
          .lean()
        : [];

      res.json({
        users: usersData.map(user => safeUser(user)),
        stats: statsData,
        group,
        erpSyncEnabled,
        erpSyncVersion
      });
    } catch (error) {
      console.error('Error fetching all data:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Lig tebriği: kullanıcıların son kutlanan lig alanını güncelle (panoda kopyalama sonrası)
  app.post('/api/last-congratulated-league/:groupId', requireGroupAdmin, async (req, res) => {
    try {
      const { groupId } = req.params;
      const { items } = req.body || {};
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'items dizisi gerekli' });
      }

      const group = await UserGroup.findOne({ groupId }).lean();
      if (!group) {
        return res.status(404).json({ error: 'Grup bulunamadı' });
      }

      const { users } = getGroupCollections(groupId);
      const allowedLeagues = new Set([
        'Bronz', 'Gümüş', 'Altın', 'İnci', 'Safir', 'Zümrüt', 'Elmas', 'Yakut', 'Mercan', 'Pırlanta'
      ]);

      let updated = 0;
      const pendingDeleteFilter = []; // pending_league_congratulations'tan silinecek kayıtlar

      for (const raw of items) {
        const userId = raw && raw.userId != null ? String(raw.userId).trim() : '';
        const leagueName =
          raw && raw.leagueName != null ? String(raw.leagueName).trim() : '';
        if (!userId || !allowedLeagues.has(leagueName)) continue;
        const r = await users.findByIdAndUpdate(
          userId,
          { $set: { lastCongratulatedLeague: leagueName } },
          { returnDocument: 'after' }
        ).lean();
        if (r) {
          updated++;
          pendingDeleteFilter.push({ userId, groupId, league: leagueName });
        }
      }

      // Admin paneli tıkladı → WhatsApp botu henüz göndermemişse kuyruğu temizle
      // Böylece bot aktif olduğunda çift kutlama gitmiş olmaz.
      if (pendingDeleteFilter.length > 0) {
        try {
          const deleted = await mongoose.connection.db.collection('pending_league_congratulations').deleteMany({
            $or: pendingDeleteFilter
          });
          if (deleted.deletedCount > 0) {
            console.log(`🧹 Admin lig tebriği: ${deleted.deletedCount} adet pending_league_congratulations kaydı temizlendi. (Grup: ${groupId})`);
          }
        } catch (cleanErr) {
          // Temizleme hatası ana akışı etkilemesin
          console.error('Pending congratulations temizleme hatası:', cleanErr.message);
        }
      }

      res.json({ success: true, updated });
    } catch (error) {
      console.error('Error updating lastCongratulatedLeague:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Kullanıcı istatistikleri endpoint'i
  app.get('/api/user-stats/:groupId/:userId', requireReadableGroup, async (req, res) => {
    try {
      const { groupId, userId } = req.params;

      // Grup var mı kontrol et
      const group = await UserGroup.findOne({ groupId }).lean();
      if (!group) {
        return res.status(404).json({ error: 'Grup bulunamadı' });
      }

      // Dinamik koleksiyonu al
      const { users, readingStatuses } = getGroupCollections(groupId);

      const activeUser = await users.findOne({
        _id: userId,
        ...activeUserQuery()
      }).select('_id').lean();
      if (!activeUser) {
        return res.status(404).json({ error: 'Aktif kullanıcı bulunamadı' });
      }

      // Sadece belirli kullanıcının istatistiklerini getir
      const userStats = await readingStatuses.find({ userId }).sort({ date: 1 }).lean();

      res.json({ stats: userStats });
    } catch (error) {
      console.error('Error fetching user stats:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Okuma istatistikleri endpoint'i
  app.get('/api/reading-stats/:groupId', requireReadableGroup, async (req, res) => {
    try {
      const { groupId } = req.params;

      // Grup var mı kontrol et
      const group = await UserGroup.findOne({ groupId }).lean();
      if (!group) {
        return res.status(404).json({ error: 'Grup bulunamadı' });
      }

      // Dinamik koleksiyonları al
      const { users, readingStatuses } = getGroupCollections(groupId);

      const usersData = await users.find(activeUserQuery()).sort({ name: 1 }).lean();
      const activeUserIds = usersData.map(user => String(user._id));
      const statsData = activeUserIds.length > 0
        ? await readingStatuses.find({ userId: { $in: activeUserIds } }).lean()
        : [];

      const userStats = usersData.map(user => {
        const userReadings = statsData.filter(stat =>
          stat.userId === user._id.toString() && stat.status === 'okudum'
        );

        return {
          userId: user._id,
          name: user.name,
          profileImage: user.profileImage,
          okudum: userReadings.length
        };
      });

      res.json(userStats);
    } catch (error) {
      console.error('Error fetching reading stats:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // En uzun seriler endpoint'i
  app.get('/api/longest-streaks/:groupId', requireReadableGroup, async (req, res) => {
    try {
      const { groupId } = req.params;

      // Grup var mı kontrol et
      const group = await UserGroup.findOne({ groupId }).lean();
      if (!group) {
        return res.status(404).json({ error: 'Grup bulunamadı' });
      }

      // Dinamik koleksiyonları al
      const { users, readingStatuses } = getGroupCollections(groupId);

      const usersData = await users.find(activeUserQuery()).lean();
      const activeUserIds = usersData.map(user => String(user._id));
      const statsData = activeUserIds.length > 0
        ? await readingStatuses.find({ userId: { $in: activeUserIds } }).lean()
        : [];

      const results = usersData.map(user => {
        // Kullanıcının okuma kayıtlarını tarihe göre sırala
        const userStats = statsData
          .filter(s => s.userId === user._id.toString() && s.status === 'okudum')
          .map(s => s.date)
          .sort();

        let maxStreak = 0, currentStreak = 0;
        let streakStart = null, streakEnd = null;
        let maxStart = null, maxEnd = null;

        for (let i = 0; i < userStats.length; i++) {
          if (i === 0 || (new Date(userStats[i]) - new Date(userStats[i - 1]) === 86400000)) {
            currentStreak++;
            if (currentStreak === 1) streakStart = userStats[i];
            streakEnd = userStats[i];
          } else {
            if (currentStreak > maxStreak) {
              maxStreak = currentStreak;
              maxStart = streakStart;
              maxEnd = streakEnd;
            }
            currentStreak = 1;
            streakStart = userStats[i];
            streakEnd = userStats[i];
          }
        }

        if (currentStreak > maxStreak) {
          maxStreak = currentStreak;
          maxStart = streakStart;
          maxEnd = streakEnd;
        }

        return {
          userId: user._id,
          name: user.name,
          profileImage: user.profileImage,
          streak: maxStreak,
          startDate: maxStart,
          endDate: maxEnd
        };
      });

      results.sort((a, b) => b.streak - a.streak);

      res.json(results);
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Okuma durumu güncelleme endpoint'i
  app.post('/api/update-status/:groupId', requireSelfOrAdmin, async (req, res) => {
    try {
      const { groupId } = req.params;
      const { userId, date, status, amount } = req.body;

      if (!mongoose.isValidObjectId(userId) || !isValidReadingDate(date)) {
        return res.status(400).json({ error: 'Geçersiz kullanıcı veya tarih' });
      }
      if (!['', 'okudum', 'okumadım'].includes(status)) {
        return res.status(400).json({ error: 'Geçersiz okuma durumu' });
      }

      const hasAmount = amount !== undefined && amount !== null && amount !== '';
      const amountNum = hasAmount ? Number(amount) : null;
      if (hasAmount && (status !== 'okudum' || !Number.isInteger(amountNum) || amountNum < 0 || amountNum > 99999)) {
        return res.status(400).json({ error: 'Okuma miktarı 0-99999 arasında bir tam sayı olmalıdır' });
      }

      // Grup var mı kontrol et
      const group = await UserGroup.findOne({ groupId }).lean();
      if (!group) {
        return res.status(404).json({ error: 'Grup bulunamadı' });
      }
      if (req.auth.authority !== 'admin' && !isReadingDateAllowedByPolicy(
        date,
        group.readingEditPolicy,
        istanbulDateKey(),
        istanbulYesterdayKey()
      )) {
        const readingEditPolicy = normalizeReadingEditPolicy(group.readingEditPolicy);
        return res.status(403).json({
          code: 'READING_EDIT_DATE_RESTRICTED',
          error: 'Bu tarih grup düzenleme ayarlarına göre değiştirilemez',
          readingEditPolicy
        });
      }

      // Dinamik koleksiyonu al
      const { readingStatuses } = getGroupCollections(groupId);

      if (status) {
        if (hasAmount) {
          await readingStatuses.findOneAndUpdate(
            { userId, date },
            {
              $set: {
                userId,
                date,
                status: status || 'okudum',
                amount: amountNum
              }
            },
            { upsert: true }
          );
        } else {
          await readingStatuses.findOneAndUpdate(
            { userId, date },
            {
              $set: { userId, date, status },
              $unset: { amount: 1 }
            },
            { upsert: true }
          );
        }
      } else {
        await readingStatuses.findOneAndDelete({ userId, date });
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  });



}

module.exports = {
  registerReadingRoutes
};

