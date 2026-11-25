'use strict';

const mongoose = require('mongoose');

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

// Makale kategori sayfaları `category` filtresi ve `_id` sırasıyla sayfalanır.
async function ensureArticleIndexes() {
  try {
    await mongoose.connection.db
      .collection('articles')
      .createIndex({ category: 1, _id: 1 }, { name: 'articles_category_id' });
  } catch (error) {
    console.error('articles index hatası:', error.message);
  }
}

// Tefekkür ilahileri, kullanıcı önerileri ve bildirimleri video kimliğiyle tekil tutulur.
async function ensureIlahiIndexes() {
  try {
    const db = mongoose.connection.db;
    await Promise.all([
      db.collection('ilahiler').createIndex({ videoId: 1 }, { unique: true, name: 'ilahiler_video_id' }),
      db.collection('ilahi_onerileri').createIndex({ videoId: 1 }, { unique: true, name: 'ilahi_onerileri_video_id' }),
      db.collection('ilahi_bildirimleri').createIndex({ videoId: 1 }, { unique: true, name: 'ilahi_bildirimleri_video_id' })
    ]);
  } catch (error) {
    console.error('ilahi index hatası:', error.message);
  }
}

async function initializeDatabaseIndexes() {
  await Promise.all([
    ensureArticleIndexes(),
    ensureIlahiIndexes(),
    ensureApplicationIndexes(),
    ensureInviteTtlIndex(),
    ensureJoinRequestTtlIndex()
  ]);
}




module.exports = {
  initializeDatabaseIndexes
};
