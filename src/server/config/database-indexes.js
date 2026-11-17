'use strict';

const { UserGroup } = require('../modules/groups/group.models');
const { Invite } = require('../modules/invitations/invitation.models');
const { JoinRequest } = require('../modules/join-requests/join-request.models');

async function ensureInviteTtlIndex() {
  try {
    await Invite.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  } catch (err) {
    if (err.code !== 85 && err.code !== 86 && !/already exists/i.test(err.message)) {
      console.error('invites TTL index hatası:', err.message);
      return;
    }
    try {
      await Invite.collection.dropIndex('expiresAt_1');
      await Invite.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    } catch (retryErr) {
      console.error('invites TTL index hatası:', retryErr.message);
    }
  }
}



async function ensureApplicationIndexes() {
  try {
    await UserGroup.collection.createIndex(
      { groupId: 1 },
      { unique: true, name: 'uniq_group_id' }
    );
  } catch (error) {
    console.error('Benzersiz index hazırlama hatası:', error.message);
  }

}



async function ensureJoinRequestTtlIndex() {
  try {
    await JoinRequest.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  } catch (err) {
    if (err.code !== 85 && err.code !== 86 && !/already exists/i.test(err.message)) {
      console.error('jointogroups TTL index hatası:', err.message);
      return;
    }
    try {
      await JoinRequest.collection.dropIndex('expiresAt_1');
      await JoinRequest.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      console.log('jointogroups TTL index yeniden oluşturuldu');
    } catch (retryErr) {
      console.error('jointogroups TTL index hatası:', retryErr.message);
    }
  }
}

async function initializeDatabaseIndexes() {
  await Promise.all([
    ensureApplicationIndexes(),
    ensureInviteTtlIndex(),
    ensureJoinRequestTtlIndex()
  ]);
}




module.exports = {
  initializeDatabaseIndexes
};
