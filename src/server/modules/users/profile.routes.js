'use strict';

const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

function registerProfileRoutes(app, dependencies) {
  const {
    deleteFromDropboxByUrl,
    getGroupCollections,
    invalidateUserSessions,
    isAllowedAvatarPath,
    isDropboxHostedUrl,
    isValidPassword,
    isValidText,
    requireSelf,
    requireSelfOrAdmin,
    saveSession,
    setSessionMembership,
    userSchema
  } = dependencies;

  app.post('/api/update-user-avatar', requireSelfOrAdmin, async (req, res) => {
    try {
      const { userId, groupId, avatarPath } = req.body;
      if (!userId || !groupId || !avatarPath) {
        return res.status(400).json({ success: false, message: 'Gerekli parametreler eksik' });
      }
      if (!isAllowedAvatarPath(avatarPath, 'userAvatars')) {
        return res.status(400).json({ success: false, message: 'Geçersiz avatar seçimi' });
      }

      const { users } = getGroupCollections(groupId);
      const user = await users.findById(userId).lean();
      if (!user) {
        return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
      }

      await users.findByIdAndUpdate(userId, { profileImage: avatarPath });
      if (avatarPath !== user.profileImage && isDropboxHostedUrl(user.profileImage)) {
        deleteFromDropboxByUrl(user.profileImage).catch(error =>
          console.error('Eski profil resmi temizlenemedi:', error)
        );
      }

      return res.json({ success: true, message: 'Avatar güncellendi' });
    } catch (error) {
      console.error('Avatar güncellenirken hata:', error);
      return res.status(500).json({ success: false, message: 'Avatar güncellenemedi' });
    }
  });

  app.post('/api/update-user-settings', requireSelf, async (req, res) => {
    try {
      const { userId, groupId, username, memberName, password } = req.body;
      if (!userId || !groupId) {
        return res.status(400).json({ success: false, message: 'Kullanıcı ID ve Grup ID gerekli' });
      }
      if ((username && !isValidText(username, 40)) || (memberName && !isValidText(memberName, 40))) {
        return res.status(400).json({ success: false, message: 'Kullanıcı alanları en fazla 40 karakter olabilir' });
      }
      if (password && !isValidPassword(password)) {
        return res.status(400).json({ success: false, message: 'Şifre 6-40 karakter arasında olmalıdır' });
      }

      const { users } = getGroupCollections(groupId);
      const updateData = {};
      if (username) updateData.name = username;
      if (memberName) updateData.username = memberName;
      if (password) updateData.userpassword = await bcrypt.hash(password, 10);

      const updatedUser = await users.findByIdAndUpdate(userId, updateData, { returnDocument: 'after' });
      if (!updatedUser) {
        return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
      }

      if (password) {
        await invalidateUserSessions(groupId, userId);
        setSessionMembership(req, groupId, updatedUser);
        await saveSession(req);
      }

      return res.json({ success: true, message: 'Ayarlar güncellendi' });
    } catch (error) {
      console.error('Ayarlar güncellenirken hata:', error);
      if (error?.code === 11000) {
        return res.status(409).json({ success: false, message: 'Bu üye adı zaten kullanılıyor' });
      }
      return res.status(500).json({ success: false, message: 'Ayarlar güncellenemedi' });
    }
  });

  app.post('/api/remove-user-profile-image', requireSelfOrAdmin, async (req, res) => {
    try {
      const { userId, groupId } = req.body;
      if (!userId || !groupId) {
        return res.status(400).json({ success: false, message: 'Kullanıcı ID ve Grup ID gerekli' });
      }

      const User = mongoose.model(`users_${groupId}`, userSchema, `users_${groupId}`);
      const user = await User.findById(userId).lean();
      if (!user) {
        return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
      }

      await User.findByIdAndUpdate(userId, { profileImage: '/images/default.png' });
      if (isDropboxHostedUrl(user.profileImage)) {
        deleteFromDropboxByUrl(user.profileImage).catch(error =>
          console.error('Eski profil resmi silme hatası:', error)
        );
      }

      return res.json({ success: true, message: 'Profil resmi silindi' });
    } catch (error) {
      console.error('Profil resmi silinirken hata:', error);
      return res.status(500).json({ success: false, message: 'Profil resmi silinemedi' });
    }
  });
}

module.exports = {
  registerProfileRoutes
};
