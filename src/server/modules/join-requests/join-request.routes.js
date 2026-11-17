'use strict';

const bcrypt = require('bcrypt');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function registerJoinRequestRoutes(app, dependencies) {
  const {
    JoinRequest,
    UserGroup,
    USER_VISIBILITY_ACTIVE,
    accountCreationLimiter,
    authenticateSession,
    buildDropboxImageFileName,
    clearSessionJoinClaim,
    convertToWebP,
    deleteFromDropboxByUrl,
    getGroupCollections,
    isAllowedAvatarPath,
    istanbulDateKey,
    isDropboxHostedUrl,
    isSafeGroupId,
    isValidPassword,
    isValidText,
    normalizeFileName,
    publicPath,
    requireGroupAdmin,
    requireGroupAuth,
    requireJoinRequestAdmin,
    requireValidUploadedImages,
    safeUser,
    saveSession,
    setSessionJoinClaim,
    unlinkWithRetry,
    upload,
    uploadToDropboxWithRetry,
    verifyJoinRequestClaim
  } = dependencies;

  // 3.6. GRUBA KATILMA İSTEKLERİ
  // ============================================================================

  // Gruba katılma isteği gönderme endpoint'i
  app.post('/api/join-group-request', accountCreationLimiter, upload.single('profileImage'), requireValidUploadedImages, async (req, res) => {
    try {
      const { groupId, userName, memberName, userPassword, selectedAvatarPath } = req.body;

      if (!isSafeGroupId(groupId) || !isValidText(userName, 40) || !isValidText(memberName, 40) || !isValidPassword(userPassword)) {
        return res.status(400).json({ error: 'Alanları kontrol edin; şifre 6-40 karakter arasında olmalıdır' });
      }
      if (!isAllowedAvatarPath(selectedAvatarPath, 'userAvatars')) {
        return res.status(400).json({ error: 'Geçersiz avatar seçimi' });
      }

      // Grup var mı kontrol et
      const group = await UserGroup.findOne({ groupId }).lean();
      if (!group) {
        return res.status(404).json({ error: 'Grup bulunamadı' });
      }

      // Zaten bu grupta katılma isteği var mı kontrol et (memberName ile)
      const existingRequest = await JoinRequest.findOne({
        groupId,
        userName: memberName,
        status: 'pending'
      }).lean();

      if (existingRequest) {
        return res.status(400).json({ error: 'Bu grup için zaten bir katılma isteğiniz bulunuyor' });
      }

      // Kullanıcı zaten bu grupta mı kontrol et (memberName ile)
      const { users } = getGroupCollections(groupId);
      const existingUser = await users.findOne({ username: memberName }).lean();
      if (existingUser) {
        return res.status(400).json({ error: 'Bu üye adı zaten bu grupta kullanılıyor' });
      }

      let profileImageUrl = '/images/default.png';
      let fileName = null;

      // Avatar seçildiyse onu kullan
      if (selectedAvatarPath) {
        profileImageUrl = selectedAvatarPath;
      }
      // Resim varsa işle
      else if (req.file) {
        try {
          // 1. Adım: Geçici klasöre kaydet (orijinal format)
          const originalFileName = req.file.originalname;
          const normalizedFileName = normalizeFileName(originalFileName);
          const baseFileName = path.parse(normalizedFileName).name;

          const tempFileName = `${Date.now()}-${normalizedFileName}`;
          const tempPath = path.join(publicPath, 'uploads', tempFileName);
          fs.copyFileSync(req.file.path, tempPath);

          // 2. Adım: WebP formatına dönüştür
          const webpFileName = `${Date.now()}-${baseFileName}.webp`;
          const webpPath = path.join(publicPath, 'uploads', webpFileName);
          const conversionSuccess = await convertToWebP(tempPath, webpPath);

          if (conversionSuccess) {
            fileName = webpFileName;
            if (!(await unlinkWithRetry(tempPath))) {
              console.log('⚠️ Orijinal dosya silinemedi:', tempPath);
            }
          } else {
            // Dönüştürme başarısızsa orijinal dosyayı kullan
            fileName = tempFileName;
          }

          // Geçici multer dosyasını temizle
          try {
            if (fs.existsSync(req.file.path)) {
              fs.unlinkSync(req.file.path);
            }
          } catch (unlinkError) {
            console.log('⚠️ Multer geçici dosya silinemedi:', req.file.path);
          }
        } catch (error) {
          console.error('Yerel kaydetme hatası:', error);
          profileImageUrl = '/images/default.png';
        }
      }

      if (fileName && !selectedAvatarPath) {
        const localPath = path.join(publicPath, 'uploads', fileName);
        try {
          const fileBuffer = fs.readFileSync(localPath);
          const dropboxFileName = buildDropboxImageFileName({
            prefix: 'katil-istek',
            groupName: group.groupName,
            groupId,
            userLabel: `${userName}-${memberName}`,
            sourceBase: path.parse(fileName).name,
            ext: path.extname(fileName) || '.webp'
          });
          profileImageUrl = await uploadToDropboxWithRetry(fileBuffer, dropboxFileName, 'userImages');
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

      // Şifreyi hash'le
      const hashedPassword = await bcrypt.hash(userPassword, 10);

      const claimToken = crypto.randomBytes(32).toString('hex');

      // Katılma isteği oluştur
      const joinRequest = new JoinRequest({
        groupId,
        userName: memberName, // joinMemberNameInput -> username
        name: userName, // joinUserNameInput -> name
        password: hashedPassword,
        claimTokenHash: crypto.createHash('sha256').update(claimToken).digest('hex'),
        profileImage: profileImageUrl,
        status: 'pending'
      });

      await joinRequest.save();
      try {
        setSessionJoinClaim(req, joinRequest._id, claimToken);
        await saveSession(req);
      } catch (sessionError) {
        await JoinRequest.findByIdAndDelete(joinRequest._id).catch(() => {});
        if (isDropboxHostedUrl(profileImageUrl)) {
          await deleteFromDropboxByUrl(profileImageUrl).catch(() => {});
        }
        throw sessionError;
      }

      // Kullanıcıya hemen yanıt ver
      res.json({
        success: true,
        requestId: joinRequest._id,
        message: 'Katılma isteğiniz başarıyla gönderildi'
      });

    } catch (error) {
      console.error('Katılma isteği hatası:', error);
      res.status(500).json({ error: 'Katılma isteği gönderilirken hata oluştu' });
    }
  });

  // ObjectId ile katılma isteği durumu kontrol endpoint'i
  app.post('/api/join-request-status-by-id/:requestId', async (req, res) => {
    try {
      const { requestId } = req.params;

      const joinRequest = await JoinRequest.findById(requestId).lean();

      if (!joinRequest) {
        clearSessionJoinClaim(req, requestId);
        return res.json({ status: 'none' });
      }
      if (!verifyJoinRequestClaim(req, joinRequest)) {
        return res.status(403).json({ error: 'Katılma isteği doğrulanamadı' });
      }

      // Eğer istek kabul edilmişse, jointogroups koleksiyonundan sil
      if (joinRequest.status === 'accepted') {
        const { users } = getGroupCollections(joinRequest.groupId);
        const user = await users.findById(requestId).lean();
        if (!user) return res.status(404).json({ error: 'Kabul edilen kullanıcı bulunamadı' });

        clearSessionJoinClaim(req, requestId);
        await authenticateSession(req, joinRequest.groupId, user);

        // Kabul edilen isteği jointogroups koleksiyonundan sil
        await JoinRequest.findByIdAndDelete(requestId);
        console.log(`Kabul edilen katılma isteği silindi: ${requestId}`);

        // Grup adını al
        const group = await UserGroup.findOne({ groupId: joinRequest.groupId }).lean();
        const groupName = group ? group.groupName : 'Bilinmeyen Grup';

        return res.json({
          status: 'accepted',
          userName: joinRequest.userName,
          groupName: groupName,
          message: 'Katılma isteğiniz kabul edildi! Artık gruba erişebilirsiniz.'
        });
      }

      // Grup adını al (tüm durumlar için)
      const group = await UserGroup.findOne({ groupId: joinRequest.groupId }).lean();
      const groupName = group ? group.groupName : 'Bilinmeyen Grup';

      return res.json({
        status: joinRequest.status,
        requestId: joinRequest._id,
        createdAt: joinRequest.createdAt,
        groupName: groupName
      });

    } catch (error) {
      console.error('Katılma isteği durum kontrol hatası:', error);
      res.status(500).json({ error: 'Durum kontrol edilirken hata oluştu' });
    }
  });

  // Gruba gelen katılma isteklerini getirme endpoint'i
  app.get('/api/join-requests/:groupId', requireGroupAdmin, async (req, res) => {
    try {
      const { groupId } = req.params;

      // Bu gruba gelen pending durumundaki katılma isteklerini getir
      const joinRequests = await JoinRequest.find({
        groupId: groupId,
        status: 'pending'
      }).sort({ createdAt: -1 }).lean();

      res.json({
        success: true,
        requests: joinRequests.map(request => ({
          _id: request._id,
          groupId: request.groupId,
          userName: request.userName,
          name: request.name,
          profileImage: request.profileImage,
          status: request.status,
          createdAt: request.createdAt,
          expiresAt: request.expiresAt
        }))
      });

    } catch (error) {
      console.error('Katılma istekleri getirme hatası:', error);
      res.status(500).json({ error: 'Katılma istekleri getirilirken hata oluştu' });
    }
  });

  // Katılma isteğini kabul etme endpoint'i
  app.post('/api/accept-join-request/:requestId', requireJoinRequestAdmin, async (req, res) => {
    try {
      const { requestId } = req.params;

      const joinRequest = req.joinRequest;

      if (joinRequest.status !== 'pending') {
        return res.status(400).json({ error: 'Bu istek zaten işlenmiş' });
      }

      // Kullanıcıyı gruba ekle
      const { users } = getGroupCollections(joinRequest.groupId);
      const today = istanbulDateKey();
      const newUser = {
        _id: joinRequest._id,
        name: joinRequest.name,
        username: joinRequest.userName,
        userpassword: joinRequest.password,
        profileImage: joinRequest.profileImage,
        authority: 'member',
        visibility: USER_VISIBILITY_ACTIVE,
        loginStreak: 1,
        lastLoginDate: today
      };

      const createdUser = await users.create(newUser);

      // Katılma isteğini accepted olarak işaretle
      await JoinRequest.findByIdAndUpdate(requestId, {
        status: 'accepted',
        processedAt: new Date()
      });

      console.log(`Katılma isteği kabul edildi: ${joinRequest.userName} -> ${joinRequest.groupId}`);

      res.json({
        success: true,
        message: 'Katılma isteği başarıyla kabul edildi',
        user: safeUser(createdUser, true)
      });

    } catch (error) {
      console.error('Katılma isteği kabul etme hatası:', error);
      res.status(500).json({ error: 'Katılma isteği kabul edilirken hata oluştu' });
    }
  });

  // Katılma isteğini reddetme endpoint'i
  app.post('/api/reject-join-request/:requestId', requireJoinRequestAdmin, async (req, res) => {
    try {
      const { requestId } = req.params;

      const joinRequest = req.joinRequest;

      if (joinRequest.status !== 'pending') {
        return res.status(400).json({ error: 'Bu istek zaten işlenmiş' });
      }

      // Katılma isteğini rejected olarak işaretle
      await JoinRequest.findByIdAndUpdate(requestId, {
        status: 'rejected',
        processedAt: new Date()
      });

      // Dropbox'dan resmi sil (eğer varsa)
      if (isDropboxHostedUrl(joinRequest.profileImage)) {
        try {
          await deleteFromDropboxByUrl(joinRequest.profileImage);
          console.log('Katılma isteği profil resmi Dropbox’tan silindi');
        } catch (dropboxError) {
          console.error('Dropbox resim silme hatası:', dropboxError);
        }
      }

      // Grup adını al
      const group = await UserGroup.findOne({ groupId: joinRequest.groupId }).lean();
      const groupName = group ? group.groupName : 'Bilinmeyen Grup';

      console.log(`Katılma isteği reddedildi: ${joinRequest.userName} -> ${joinRequest.groupId}`);

      res.json({
        success: true,
        groupName: groupName,
        message: 'Katılma isteği reddedildi'
      });

    } catch (error) {
      console.error('Katılma isteği reddetme hatası:', error);
      res.status(500).json({ error: 'Katılma isteği reddedilirken hata oluştu' });
    }
  });

  // Katılma isteğini silme endpoint'i (rejected durumundaki istekler için)
  app.delete('/api/delete-join-request/:requestId', async (req, res) => {
    try {
      const { requestId } = req.params;

      const joinRequest = await JoinRequest.findById(requestId).lean();
      if (!joinRequest) {
        return res.status(404).json({ error: 'Katılma isteği bulunamadı' });
      }
      if (!verifyJoinRequestClaim(req, joinRequest)) {
        return res.status(403).json({ error: 'Katılma isteği doğrulanamadı' });
      }
      const deletedRequest = await JoinRequest.findByIdAndDelete(requestId);
      clearSessionJoinClaim(req, requestId);
      await saveSession(req);

      // Dropbox'dan resmi sil (eğer varsa)
      if (isDropboxHostedUrl(deletedRequest.profileImage)) {
        try {
          await deleteFromDropboxByUrl(deletedRequest.profileImage);
          console.log('Katılma isteği profil resmi Dropbox’tan silindi');
        } catch (dropboxError) {
          console.error('Dropbox resim silme hatası:', dropboxError);
        }
      }

      console.log(`Katılma isteği silindi: ${deletedRequest.userName} -> ${deletedRequest.groupId}`);

      res.json({
        success: true,
        message: 'Katılma isteği başarıyla silindi'
      });

    } catch (error) {
      console.error('Katılma isteği silme hatası:', error);
      res.status(500).json({ error: 'Katılma isteği silinirken hata oluştu' });
    }
  });

  // ObjectId ile katılma isteğini iptal etme endpoint'i
  app.delete('/api/cancel-join-request-by-id/:requestId', async (req, res) => {
    try {
      const { requestId } = req.params;

      const joinRequest = await JoinRequest.findById(requestId).lean();
      if (!joinRequest) {
        return res.status(404).json({ error: 'Katılma isteği bulunamadı' });
      }
      if (!verifyJoinRequestClaim(req, joinRequest)) {
        return res.status(403).json({ error: 'Katılma isteği doğrulanamadı' });
      }
      const deletedRequest = await JoinRequest.findByIdAndDelete(requestId);
      clearSessionJoinClaim(req, requestId);
      await saveSession(req);

      // Dropbox'dan resmi sil (eğer varsa)
      if (isDropboxHostedUrl(deletedRequest.profileImage)) {
        try {
          await deleteFromDropboxByUrl(deletedRequest.profileImage);
          console.log('Katılma isteği profil resmi Dropbox’tan silindi');
        } catch (dropboxError) {
          console.error('Dropbox resim silme hatası:', dropboxError);
        }
      }

      res.json({
        success: true,
        message: 'Katılma isteği iptal edildi'
      });

    } catch (error) {
      console.error('Katılma isteği iptal hatası:', error);
      res.status(500).json({ error: 'Katılma isteği iptal edilirken hata oluştu' });
    }
  });

  // Grup koleksiyonunda ObjectId'li kullanıcı var mı kontrol etme endpoint'i
  app.get('/api/check-user-in-group/:groupId/:objectId', requireGroupAuth, async (req, res) => {
    try {
      const { groupId, objectId } = req.params;

      // Grup koleksiyonlarını al
      const { users } = getGroupCollections(groupId);

      // ObjectId ile kullanıcı ara
      const user = await users.findOne({ _id: objectId }).lean();

      if (user && (req.auth.authority === 'admin' || String(req.auth.userId) === String(objectId))) {
        res.json({
          exists: true,
          userName: user.username,
          userId: user._id
        });
      } else {
        res.json({
          exists: false
        });
      }

    } catch (error) {
      console.error('Kullanıcı kontrol hatası:', error);
      res.status(500).json({ error: 'Kullanıcı kontrol edilirken hata oluştu' });
    }
  });



}

module.exports = {
  registerJoinRequestRoutes
};
