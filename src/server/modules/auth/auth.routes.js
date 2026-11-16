'use strict';

const mongoose = require('mongoose');

function registerAuthRoutes(app, dependencies) {
  const {
    UserGroup,
    USER_VISIBILITY_ACTIVE,
    activeUserQuery,
    getGroupCollections,
    isProduction,
    isActiveUser,
    normalizeAmountType,
    normalizeInactiveMemberAction,
    normalizeReadingEditPolicy,
    requireGroupAuth,
    safeUser,
    saveSession,
    sessionCookieName,
    setSessionMembership
  } = dependencies;

  app.get('/api/auth/memberships', async (req, res) => {
    try {
      const memberships = req.session.memberships || {};
      const groupIds = Object.keys(memberships);
      if (groupIds.length === 0) return res.json({ memberships: [] });

      const groups = await UserGroup.find({ groupId: { $in: groupIds } }).lean();
      const existingIds = new Set(groups.map(group => group.groupId));
      for (const groupId of groupIds) {
        if (!existingIds.has(groupId)) delete req.session.memberships[groupId];
      }

      const result = await Promise.all(groups.map(async group => {
        const membership = memberships[group.groupId];
        const { users } = getGroupCollections(group.groupId);

        // Oturum kaydı tek başına üyelik kanıtı değildir. Kullanıcı başka bir
        // cihazdan silinmiş olabileceği için ana sayfada gerçek kaydı doğrula.
        const membershipUserId = String(membership?.userId || '');
        const user = mongoose.Types.ObjectId.isValid(membershipUserId)
          ? await users.findById(membershipUserId).select('_id authority visibility').lean()
          : null;
        if (!user || !isActiveUser(user)) {
          delete req.session.memberships[group.groupId];
          return null;
        }

        // Veritabanındaki güncel yetkiyi oturuma yansıt.
        membership.authority = user.authority;
        membership.visibility = USER_VISIBILITY_ACTIVE;

        return {
          groupId: group.groupId,
          userId: membership.userId,
          authority: user.authority,
          groupName: group.groupName,
          description: group.description,
          groupImage: group.groupImage,
          visibility: group.visibility,
          amountType: normalizeAmountType(group.amountType),
          readingEditPolicy: normalizeReadingEditPolicy(group.readingEditPolicy),
          autoMarkUnread: group.autoMarkUnread,
          inactiveMemberAction: normalizeInactiveMemberAction(group.inactiveMemberAction),
          memberCount: await users.countDocuments(activeUserQuery())
        };
      }));

      await saveSession(req);
      res.json({ memberships: result.filter(Boolean) });
    } catch (error) {
      console.error('Oturum grupları alınamadı:', error);
      res.status(500).json({ error: 'Oturum bilgileri alınamadı' });
    }
  });

  app.get('/api/auth/me/:groupId', requireGroupAuth, async (req, res) => {
    try {
      const { groupId } = req.params;
      const group = await UserGroup.findOne({ groupId }).lean();
      if (!group) return res.status(404).json({ error: 'Grup bulunamadı' });

      const { users } = getGroupCollections(groupId);
      const user = await users.findById(req.auth.userId).lean();
      if (!user || !isActiveUser(user)) {
        delete req.session.memberships[groupId];
        await saveSession(req);
        return res.status(401).json({ error: 'Oturum kullanıcısı bulunamadı' });
      }

      setSessionMembership(req, groupId, user);
      await saveSession(req);
      res.json({
        user: safeUser(user, true),
        group: {
          ...group,
          amountType: normalizeAmountType(group.amountType),
          readingEditPolicy: normalizeReadingEditPolicy(group.readingEditPolicy),
          inactiveMemberAction: normalizeInactiveMemberAction(group.inactiveMemberAction)
        }
      });
    } catch (error) {
      console.error('Oturum doğrulanamadı:', error);
      res.status(500).json({ error: 'Oturum doğrulanamadı' });
    }
  });

  app.post('/api/auth/logout/:groupId', async (req, res) => {
    const { groupId } = req.params;
    if (req.session.memberships) delete req.session.memberships[groupId];
    const hasMemberships = Object.keys(req.session.memberships || {}).length > 0;
    const hasJoinClaims = Object.keys(req.session.joinClaims || {}).length > 0;

    if (!hasMemberships) delete req.session.memberships;

    if (!hasMemberships && !hasJoinClaims) {
      return req.session.destroy(error => {
        if (error) return res.status(500).json({ error: 'Oturum kapatılamadı' });
        res.clearCookie(sessionCookieName, { httpOnly: true, sameSite: 'lax', secure: isProduction, path: '/' });
        res.json({ success: true });
      });
    }
    await saveSession(req);
    res.json({ success: true });
  });


}

module.exports = {
  registerAuthRoutes
};

