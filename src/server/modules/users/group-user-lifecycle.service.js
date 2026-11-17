'use strict';

async function runCleanupTasks(tasks) {
  const results = await Promise.allSettled(tasks);
  return results
    .filter(result => result.status === 'rejected')
    .map(result => result.reason);
}

async function deleteGroupUser({
  user,
  userFilter,
  users,
  readingStatuses,
  invalidateSessions,
  deleteInvites,
  deleteProfileImage
}) {
  const deletedUser = await users.findOneAndDelete(userFilter || { _id: user._id });
  if (!deletedUser) return { applied: false, cleanupErrors: [] };

  const userId = String(user._id);
  const cleanupErrors = await runCleanupTasks([
    invalidateSessions(userId),
    readingStatuses.deleteMany({ userId }),
    deleteInvites(userId),
    deleteProfileImage(user.profileImage)
  ]);

  return { applied: true, user: deletedUser, cleanupErrors };
}

async function passivateGroupUser({
  user,
  userFilter,
  users,
  passiveVisibility,
  invalidateSessions,
  deleteInvites
}) {
  const updatedUser = await users.findOneAndUpdate(
    userFilter || { _id: user._id },
    { $set: { visibility: passiveVisibility } },
    { returnDocument: 'after' }
  );
  if (!updatedUser) return { applied: false, cleanupErrors: [] };

  const userId = String(user._id);
  const cleanupErrors = await runCleanupTasks([
    invalidateSessions(userId),
    deleteInvites(userId)
  ]);

  return { applied: true, user: updatedUser, cleanupErrors };
}

module.exports = {
  deleteGroupUser,
  passivateGroupUser
};
