'use strict';

const mongoose = require('mongoose');
const {
  USER_VISIBILITY_ACTIVE,
  USER_VISIBILITY_PASSIVE,
  normalizeUserVisibility
} = require('../users/user-visibility');

function createAuthMiddleware(dependencies) {
  const {
    JoinRequest,
    SITE_ACTIVITY_ADMIN_GROUP_ID,
    UserGroup,
    getAuthGroupId,
    getGroupCollections,
    isActiveUser,
    isSafeGroupId
  } = dependencies;

  function getSessionMembership(req, groupId) {
    if (!isSafeGroupId(groupId) || !req.session?.memberships || !Object.hasOwn(req.session.memberships, groupId)) {
      return null;
    }
    return req.session.memberships[groupId] || null;
  }

  function setSessionMembership(req, groupId, user) {
    if (!isSafeGroupId(groupId)) throw new Error('Geçersiz grup kimliği');
    req.session.memberships ||= {};
    req.session.memberships[groupId] = {
      userId: String(user._id),
      authority: user.authority,
      visibility: normalizeUserVisibility(user.visibility)
    };
  }

  function saveSession(req) {
    return new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
  }

  function regenerateSession(req) {
    return new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
  }

  async function authenticateSession(req, groupId, user) {
    const previousMemberships = { ...(req.session.memberships || {}) };
    const previousJoinClaims = { ...(req.session.joinClaims || {}) };
    await regenerateSession(req);
    req.session.memberships = previousMemberships;
    if (Object.keys(previousJoinClaims).length > 0) {
      req.session.joinClaims = previousJoinClaims;
    }
    setSessionMembership(req, groupId, user);
    await saveSession(req);
  }

  async function getValidatedSessionMembership(req, groupId) {
    const membership = getSessionMembership(req, groupId);
    if (!membership) return null;

    if (membership.visibility === USER_VISIBILITY_PASSIVE) {
      delete req.session.memberships[groupId];
      await saveSession(req);
      return null;
    }

    // Yeni oturumlar aktiflik bilgisini taşır. Eski veya ERP tarafından taşınmış
    // oturumları ilk korumalı istekte yalnızca bir kez veritabanından doğrula.
    if (membership.visibility === USER_VISIBILITY_ACTIVE) return membership;

    const membershipUserId = String(membership.userId || '');
    const { users } = getGroupCollections(groupId);
    const user = mongoose.Types.ObjectId.isValid(membershipUserId)
      ? await users.findById(membershipUserId).select('_id authority visibility').lean()
      : null;

    if (!user || !isActiveUser(user)) {
      delete req.session.memberships[groupId];
      await saveSession(req);
      return null;
    }

    membership.authority = user.authority;
    membership.visibility = USER_VISIBILITY_ACTIVE;
    await saveSession(req);
    return membership;
  }

  async function requireGroupAuth(req, res, next) {
    const groupId = getAuthGroupId(req);
    try {
      const membership = await getValidatedSessionMembership(req, groupId);
      if (!membership) {
        return res.status(401).json({ error: 'Bu işlem için giriş yapmalısınız' });
      }
      req.auth = { groupId, ...membership };
      next();
    } catch (error) {
      next(error);
    }
  }

  function requireGroupAdmin(req, res, next) {
    return requireGroupAuth(req, res, () => {
      if (req.auth.authority !== 'admin') {
        return res.status(403).json({ error: 'Bu işlem için yönetici yetkisi gerekli' });
      }
      next();
    });
  }

  async function requireSiteActivityAdmin(req, res, next) {
    try {
      const membership = await getValidatedSessionMembership(req, SITE_ACTIVITY_ADMIN_GROUP_ID);
      if (!membership) {
        if (req.path === '/admin.html') {
          return res.redirect('/');
        }
        return res.status(401).json({ error: 'Bu işlem için site yöneticisi grubunda giriş yapmalısınız' });
      }
      if (membership.authority !== 'admin') {
        if (req.path === '/admin.html') {
          return res.redirect('/');
        }
        return res.status(403).json({ error: 'Bu işlem için site yöneticisi olmalısınız' });
      }
      req.auth = { groupId: SITE_ACTIVITY_ADMIN_GROUP_ID, ...membership };
      next();
    } catch (error) {
      next(error);
    }
  }

  function requireSelfOrAdmin(req, res, next) {
    return requireGroupAuth(req, res, () => {
      const targetUserId = String(req.params?.userId || req.body?.userId || req.body?.id || '');
      if (req.auth.authority !== 'admin' && targetUserId !== String(req.auth.userId)) {
        return res.status(403).json({ error: 'Yalnızca kendi hesabınızı değiştirebilirsiniz' });
      }
      next();
    });
  }

  function requireSelf(req, res, next) {
    return requireGroupAuth(req, res, () => {
      const targetUserId = String(req.params?.userId || req.body?.userId || req.body?.id || '');
      if (!targetUserId || targetUserId !== String(req.auth.userId)) {
        return res.status(403).json({ error: 'Yalnızca kendi hesabınızı değiştirebilirsiniz' });
      }
      next();
    });
  }

  async function requireJoinRequestAdmin(req, res, next) {
    try {
      const joinRequest = await JoinRequest.findById(req.params.requestId).lean();
      if (!joinRequest) return res.status(404).json({ error: 'Katılma isteği bulunamadı' });
      const membership = await getValidatedSessionMembership(req, joinRequest.groupId);
      if (!membership || membership.authority !== 'admin') {
        return res.status(403).json({ error: 'Bu işlem için yönetici yetkisi gerekli' });
      }
      req.joinRequest = joinRequest;
      req.auth = { groupId: joinRequest.groupId, ...membership };
      next();
    } catch (error) {
      next(error);
    }
  }

  async function requireReadableGroup(req, res, next) {
    try {
      const groupId = getAuthGroupId(req);
      const group = await UserGroup.findOne({ groupId }).lean();
      if (!group) return res.status(404).json({ error: 'Grup bulunamadı' });
      if (group.visibility === 'private') {
        const membership = await getValidatedSessionMembership(req, groupId);
        if (!membership) {
          return res.status(401).json({ error: 'Bu grubu görüntülemek için giriş yapmalısınız' });
        }
      }
      req.group = group;
      next();
    } catch (error) {
      next(error);
    }
  }

  function safeUser(user, includePrivate = false) {
    const result = {
      _id: user._id,
      name: user.name,
      profileImage: user.profileImage,
      authority: user.authority,
      visibility: normalizeUserVisibility(user.visibility),
      loginStreak: user.loginStreak,
      lastLoginDate: user.lastLoginDate,
      lastCongratulatedLeague: user.lastCongratulatedLeague
    };
    if (includePrivate) {
      result.username = user.username;
    }
    return result;
  }



  return {
    authenticateSession,
    getSessionMembership,
    requireGroupAdmin,
    requireGroupAuth,
    requireJoinRequestAdmin,
    requireReadableGroup,
    requireSelf,
    requireSelfOrAdmin,
    requireSiteActivityAdmin,
    safeUser,
    saveSession,
    setSessionMembership
  };
}

module.exports = {
  createAuthMiddleware
};

