'use strict';

const mongoose = require('mongoose');
const {
  deleteFromDropboxByUrl,
  deleteGroupImageFromDropboxByUrl
} = require('../../integrations/dropbox/dropbox.service');
const { UserGroup } = require('./group.models');

// MongoDB index'lerini oluşturma fonksiyonu
async function createIndexesForGroup(groupId) {
  const db = mongoose.connection.db;
  await db.collection(`readingstatuses_${groupId}`).createIndex(
    { userId: 1, date: 1 },
    { unique: true, name: 'uniq_user_date' }
  );
  await db.collection(`users_${groupId}`).createIndex(
    { name: 1 },
    { name: 'idx_name' }
  );
  await db.collection(`users_${groupId}`).createIndex(
    { username: 1 },
    {
      unique: true,
      name: 'uniq_username',
      partialFilterExpression: { username: { $type: 'string' } }
    }
  );
  // username ve authority birlikte sorgulanıyor (admin kontrolü için)
  await db.collection(`users_${groupId}`).createIndex(
    { username: 1, authority: 1 },
    { name: 'idx_username_authority' }
  );
  await db.collection(`users_${groupId}`).createIndex(
    { visibility: 1 },
    { name: 'idx_visibility' }
  );

  console.log(`Grup index'leri hazır: ${groupId}`);
}

async function rollbackGroupCreation({
  groupId,
  groupRecordId,
  uploadedGroupImageUrl,
  uploadedAdminProfileImageUrl
}) {
  const rollbackErrors = [];

  if (groupId && groupRecordId) {
    try {
      await dropGroupCollections(groupId);
    } catch (error) {
      rollbackErrors.push(error);
    }

    try {
      await UserGroup.deleteOne({ _id: groupRecordId, groupId });
    } catch (error) {
      rollbackErrors.push(error);
    }
  }

  const imageCleanupTasks = [
    [uploadedGroupImageUrl, deleteGroupImageFromDropboxByUrl],
    [uploadedAdminProfileImageUrl, deleteFromDropboxByUrl]
  ];

  for (const [imageUrl, deleteImage] of imageCleanupTasks) {
    if (!imageUrl) continue;
    try {
      await deleteImage(imageUrl);
    } catch (error) {
      rollbackErrors.push(error);
    }
  }

  if (rollbackErrors.length > 0) {
    throw new AggregateError(rollbackErrors, `Grup oluşturma geri alma işlemi tamamlanamadı: ${groupId || 'bilinmiyor'}`);
  }
}



async function dropGroupCollections(groupId) {
  const collectionNames = [
    `users_${groupId}`,
    `readingstatuses_${groupId}`
  ];
  const dropErrors = [];

  for (const collectionName of collectionNames) {
    try {
      await mongoose.connection.db.dropCollection(collectionName);
      console.log(`✅ Grup koleksiyonu silindi: ${collectionName}`);
    } catch (error) {
      if (error.code === 26 || error.codeName === 'NamespaceNotFound') {
        console.log(`ℹ️ Grup koleksiyonu zaten yok: ${collectionName}`);
        continue;
      }

      console.error(`❌ Grup koleksiyonu silme hatası (${collectionName}):`, error);
      dropErrors.push(error);
    }
  }

  if (dropErrors.length > 0) {
    throw new AggregateError(dropErrors, `Grup koleksiyonları tamamen silinemedi: ${groupId}`);
  }
}




module.exports = {
  createIndexesForGroup,
  dropGroupCollections,
  rollbackGroupCreation
};

