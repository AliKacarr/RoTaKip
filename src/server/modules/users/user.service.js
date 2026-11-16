'use strict';

const mongoose = require('mongoose');
const {
  deleteFromDropboxByUrl,
  isDropboxHostedUrl
} = require('../../integrations/dropbox/dropbox.service');
const { Invite } = require('../invitations/invitation.models');
const {
  deleteGroupUser,
  passivateGroupUser
} = require('./group-user-lifecycle.service');
const { USER_VISIBILITY_PASSIVE } = require('./user-visibility');

async function invalidateUserSessions(groupId, userId) {
  const membershipPath = `session.memberships.${groupId}`;
  await mongoose.connection.db.collection('sessions').updateMany(
    { [`${membershipPath}.userId`]: String(userId) },
    { $unset: { [membershipPath]: '' } }
  );
}

async function invalidateGroupSessions(groupId) {
  const membershipPath = `session.memberships.${groupId}`;
  await mongoose.connection.db.collection('sessions').updateMany(
    { [membershipPath]: { $exists: true } },
    { $unset: { [membershipPath]: '' } }
  );
}

function deleteUserProfileImage(profileImage) {
  if (!isDropboxHostedUrl(profileImage)) return Promise.resolve();
  return deleteFromDropboxByUrl(profileImage);
}

function deleteUserWithRelatedData({ groupId, user, users, readingStatuses, userFilter }) {
  return deleteGroupUser({
    user,
    userFilter,
    users,
    readingStatuses,
    invalidateSessions: userId => invalidateUserSessions(groupId, userId),
    deleteInvites: userId => Invite.deleteMany({ groupId, userId }),
    deleteProfileImage: deleteUserProfileImage
  });
}

function passivateUserWithAccessCleanup({ groupId, user, users, userFilter }) {
  return passivateGroupUser({
    user,
    userFilter,
    users,
    passiveVisibility: USER_VISIBILITY_PASSIVE,
    invalidateSessions: userId => invalidateUserSessions(groupId, userId),
    deleteInvites: userId => Invite.deleteMany({ groupId, userId })
  });
}

function logUserCleanupErrors(context, cleanupErrors) {
  for (const error of cleanupErrors) {
    console.error(`${context}:`, error);
  }
}

// Aynı grupta hızlıca yapılan yetki/görünürlük/silme işlemlerinin birlikte
// son aktif yöneticiyi ortadan kaldırmasını engellemek için sıraya al.
const groupUserMutationLocks = new Map();

async function acquireGroupUserMutationLock(groupId) {
  const previousMutation = groupUserMutationLocks.get(groupId) || Promise.resolve();
  let releaseCurrentMutation;
  const currentMutation = new Promise(resolve => {
    releaseCurrentMutation = resolve;
  });
  groupUserMutationLocks.set(groupId, currentMutation);
  await previousMutation.catch(() => {});

  let released = false;
  return () => {
    if (released) return;
    released = true;
    releaseCurrentMutation();
    if (groupUserMutationLocks.get(groupId) === currentMutation) {
      groupUserMutationLocks.delete(groupId);
    }
  };
}



module.exports = {
  acquireGroupUserMutationLock,
  deleteUserWithRelatedData,
  invalidateGroupSessions,
  invalidateUserSessions,
  logUserCleanupErrors,
  passivateUserWithAccessCleanup
};

