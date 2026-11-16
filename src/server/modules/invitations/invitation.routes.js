'use strict';

const bcrypt = require('bcrypt');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function registerInvitationRoutes(app, dependencies) {
  const {
    Invite,
    UserGroup,
    accountCreationLimiter,
    activeUserQuery,
    authenticateSession,
    buildDropboxImageFileName,
    deleteFromDropboxByUrl,
    getGroupCollections,
    invalidateUserSessions,
    isAllowedAvatarPath,
    isDropboxHostedUrl,
    isValidPassword,
    isValidText,
    normalizeFileName,
    publicPath,
    requireGroupAdmin,
    requireValidUploadedImages,
    unlinkWithRetry,
    upload,
    uploadToDropboxWithRetry
  } = dependencies;

  // 3.4. DAVET SİSTEMİ
  // ============================================================================

  // Davet oluşturma endpoint'i
  app.post('/api/create-invite/:groupId', requireGroupAdmin, async (req, res) => {
    try {
      const { groupId } = req.params;
      const { userId } = req.body;

      // Grup var mı kontrol et
      const group = await UserGroup.findOne({ groupId }).lean();
      if (!group) {
        return res.status(404).json({ error: 'Grup bulunamadı' });
      }

      // Kullanıcı var mı kontrol et
      const { users } = getGroupCollections(groupId);
      const user = await users.findOne({ _id: userId, ...activeUserQuery() }).lean();
      if (!user) {
        return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
      }

      // Rastgele token oluştur (16 byte = 32 karakter hex)
      const crypto = require('crypto');
      const inviteToken = crypto.randomBytes(16).toString('hex');
      const inviteTokenHash = crypto.createHash('sha256').update(inviteToken).digest('hex');


      // Yeni davet oluştur
      const invite = new Invite({
        inviteTokenHash,
        userId,
        userName: user.name || '',
        groupId
      });

      await invite.save();

      res.json({
        success: true,
        inviteToken,
        groupName: group.groupName,
        groupId: group.groupId
      });
    } catch (error) {
      console.error('Davet oluşturma hatası:', error);
      res.status(500).json({ error: 'Davet oluşturulurken hata oluştu' });
    }
  });

  // Davet doğrulama endpoint'i
  app.get('/api/verify-invite/:groupId', async (req, res) => {
    try {
      const { groupId } = req.params;
      const { invite } = req.query;

      // GroupId'yi decode et
      const decodedGroupId = decodeURIComponent(groupId);

      if (!invite) {
        return res.status(400).json({ error: 'Davet token\'ı gerekli' });
      }

      // Token'ı hash'le
      const crypto = require('crypto');
      const inviteTokenHash = crypto.createHash('sha256').update(invite).digest('hex');

      // Davet kaydını bul (used alanını kullanmıyoruz)
      const inviteRecord = await Invite.findOne({
        inviteTokenHash,
        groupId: decodedGroupId,
        expiresAt: { $gt: new Date() }
      }).lean();

      if (!inviteRecord) {
        return res.status(404).json({ error: 'Geçersiz veya süresi dolmuş davet' });
      }

      // Kullanıcı bilgilerini al
      const { users } = getGroupCollections(decodedGroupId);
      const user = await users.findOne({
        _id: inviteRecord.userId,
        ...activeUserQuery()
      }).lean();

      if (!user) {
        return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
      }

      // Grup bilgilerini al
      const group = await UserGroup.findOne({ groupId: decodedGroupId }).lean();
      if (!group) {
        return res.status(404).json({ error: 'Grup bulunamadı' });
      }

      res.json({
        success: true,
        groupName: group.groupName,
        groupId: group.groupId,
        userId: user._id,
        username: user.username,
        name: user.name,
        authority: user.authority,
        profileImage: user.profileImage
      });
    } catch (error) {
      console.error('Davet doğrulama hatası:', error);
      res.status(500).json({ error: 'Davet doğrulanırken hata oluştu' });
    }
  });

  // Kullanıcı bilgilerini güncelleme endpoint'i
  app.post('/api/update-user-via-invite/:groupId', accountCreationLimiter, upload.single('profileImage'), requireValidUploadedImages, async (req, res) => {
    let uploadedProfileImageUrl = null;
    let userUpdated = false;
    try {
      const { groupId } = req.params;
      const { inviteToken, userName, memberName, memberPassword, selectedAvatarPath } = req.body;
      const profileImageFile = req.file;

      if (!inviteToken || !isValidText(userName, 40) || !isValidText(memberName, 40) || !memberPassword) {
        return res.status(400).json({ error: 'Tüm alanlar gerekli' });
      }
      if (!isValidPassword(memberPassword)) {
        return res.status(400).json({ error: 'Şifre 6-40 karakter arasında olmalıdır' });
      }
      if (!isAllowedAvatarPath(selectedAvatarPath, 'userAvatars')) {
        return res.status(400).json({ error: 'Geçersiz avatar seçimi' });
      }

      const inviteTokenHash = crypto.createHash('sha256').update(inviteToken).digest('hex');
      const invite = await Invite.findOne({
        inviteTokenHash,
        groupId,
        expiresAt: { $gt: new Date() }
      }).lean();
      if (!invite) {
        return res.status(404).json({ error: 'Geçersiz davet linki' });
      }

      // Kullanıcı bilgilerini al
      const { users } = getGroupCollections(groupId);
      const user = await users.findOne({
        _id: invite.userId,
        ...activeUserQuery()
      }).lean();

      if (!user) {
        return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
      }
      if (memberName !== user.username && await users.exists({
        _id: { $ne: invite.userId },
        username: memberName
      })) {
        return res.status(409).json({ error: 'Bu kullanıcı adı zaten kullanılıyor' });
      }

      // Şifreyi hash'le
      const hashedMemberPassword = await bcrypt.hash(memberPassword, 10);

      // Profil resmi yolu
      let profileImagePath = user.profileImage || '/images/default.png';
      const oldImageUrl = user.profileImage; // Eski resim URL'ini sakla

      // Eğer avatar seçildiyse, onu kullan
      if (selectedAvatarPath) {
        profileImagePath = selectedAvatarPath;
      } else if (profileImageFile) {
        const localPath = path.join(publicPath, 'uploads', profileImageFile.filename);
        try {
          const fileBuffer = fs.readFileSync(localPath);
          const grpMeta = await UserGroup.findOne({ groupId }).lean();
          const origName = profileImageFile.originalname || profileImageFile.filename;
          const dropboxFileName = buildDropboxImageFileName({
            prefix: 'davet-profil',
            groupName: grpMeta ? grpMeta.groupName : groupId,
            groupId,
            userLabel: userName || memberName,
            sourceBase: path.parse(normalizeFileName(origName)).name,
            ext: (path.extname(origName) || '.jpg').toLowerCase()
          });
          profileImagePath = await uploadToDropboxWithRetry(fileBuffer, dropboxFileName, 'userImages');
          uploadedProfileImageUrl = profileImagePath;
          await unlinkWithRetry(localPath);
        } catch (dropboxError) {
          console.error('Dropbox yükleme hatası:', dropboxError);
          await unlinkWithRetry(localPath);
          return res.status(503).json({
            error:
              'Profil resmi buluta yüklenemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.'
          });
        }
      }

      // Kullanıcı bilgilerini güncelle
      const updatedUser = await users.findByIdAndUpdate(invite.userId, {
        username: memberName,
        userpassword: hashedMemberPassword,
        name: userName,
        profileImage: profileImagePath
      }, { returnDocument: 'after' });
      if (!updatedUser) throw new Error('Kullanıcı güncelleme sırasında silindi');
      userUpdated = true;

      if (profileImagePath !== oldImageUrl && isDropboxHostedUrl(oldImageUrl)) {
        deleteFromDropboxByUrl(oldImageUrl).catch(err =>
          console.error('Eski resim silme hatası:', err)
        );
      }

      // Davet token'ını sil
      await Invite.findByIdAndDelete(invite._id);

      // Grup bilgilerini al
      const group = await UserGroup.findOne({ groupId }).lean();

      await invalidateUserSessions(groupId, invite.userId);
      await authenticateSession(req, groupId, updatedUser);

      res.json({
        success: true,
        groupId: group.groupId,
        groupName: group.groupName,
        userId: user._id,
        username: memberName,
        name: userName,
        authority: user.authority,
        profileImage: profileImagePath
      });

    } catch (error) {
      if (uploadedProfileImageUrl && !userUpdated) {
        await deleteFromDropboxByUrl(uploadedProfileImageUrl).catch(cleanupError =>
          console.error('Kaydedilemeyen davet profil resmi temizlenemedi:', cleanupError)
        );
      }
      console.error('Kullanıcı güncelleme hatası:', error);
      if (error?.code === 11000) {
        return res.status(409).json({ error: 'Bu kullanıcı adı zaten kullanılıyor' });
      }
      res.status(500).json({ error: 'Kullanıcı güncellenirken hata oluştu' });
    }
  });


}

module.exports = {
  registerInvitationRoutes
};

