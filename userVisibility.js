'use strict';

const USER_VISIBILITY_ACTIVE = 'aktif';
const USER_VISIBILITY_PASSIVE = 'pasif';
const VALID_USER_VISIBILITIES = new Set([
  USER_VISIBILITY_ACTIVE,
  USER_VISIBILITY_PASSIVE
]);

function normalizeUserVisibility(value) {
  return value === USER_VISIBILITY_PASSIVE
    ? USER_VISIBILITY_PASSIVE
    : USER_VISIBILITY_ACTIVE;
}

function activeUserQuery() {
  // visibility alanı eklenmeden önce oluşturulan kayıtlar da aktif kabul edilir.
  return { visibility: { $ne: USER_VISIBILITY_PASSIVE } };
}

function activeAdminQuery() {
  return { authority: 'admin', ...activeUserQuery() };
}

function activeMemberQuery() {
  return { authority: 'member', ...activeUserQuery() };
}

function isActiveUser(user) {
  return normalizeUserVisibility(user?.visibility) === USER_VISIBILITY_ACTIVE;
}

module.exports = {
  USER_VISIBILITY_ACTIVE,
  USER_VISIBILITY_PASSIVE,
  VALID_USER_VISIBILITIES,
  activeAdminQuery,
  activeMemberQuery,
  activeUserQuery,
  isActiveUser,
  normalizeUserVisibility
};
