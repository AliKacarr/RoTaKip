'use strict';

const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const fs = require('fs');
const path = require('path');

function registerUserRoutes(app, dependencies) {
  const {
    UserGroup,
    USER_VISIBILITY_ACTIVE,
    USER_VISIBILITY_PASSIVE,
    VALID_USER_VISIBILITIES,
    acquireGroupUserMutationLock,
    activeAdminQuery,
    buildDropboxImageFileName,
    convertToWebP,
    deleteGroupDropboxImages,
    deleteFromDropboxByUrl,
    deleteUserWithRelatedData,
    dropGroupCollections,
    getGroupCollections,
    invalidateGroupSessions,
    invalidateUserSessions,
    isActiveUser,
    isAllowedAvatarPath,
    isDropboxHostedUrl,
    isValidText,
    logUserCleanupErrors,
    normalizeFileName,
    normalizeUserVisibility,
    passivateUserWithAccessCleanup,
    publicPath,
    requireGroupAdmin,
    requireSelfOrAdmin,
    requireValidUploadedImages,
    safeUser,
    unlinkWithRetry,
    upload,
    uploadToDropboxWithRetry
  } = dependencies;

  // 3.2. KULLANICI YÖNETİMİ
  // ============================================================================

  // Kullanıcı listesi endpoint'i
  app.get('/api/users/:groupId', requireGroupAdmin, async (req, res) => {
    try {
      const { groupId } = req.params;

      // Grup var mı kontrol et
      const group = await UserGroup.findOne({ groupId }).lean();
      if (!group) {
        return res.status(404).json({ error: 'Grup bulunamadı' });
      }

      // Dinamik koleksiyonu al
      const { users } = getGroupCollections(groupId);

      // Sadece kullanıcıları getir
      const usersData = await users.find()
        .select('_id name profileImage username authority visibility loginStreak lastLoginDate lastCongratulatedLeague')
        .sort({ name: 1 })
        .lean();

      res.json({ users: usersData });
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Kullanıcı ekleme endpoint'i
  app.post('/api/add-user/:groupId', requireGroupAdmin, upload.single('profileImage'), requireValidUploadedImages, async (req, res) => {
    try {
      const { groupId } = req.params;
      const { name, selectedAvatarPath } = req.body;
      const authority = req.body.authority || 'member';
      const visibility = req.body.visibility || USER_VISIBILITY_ACTIVE;
      if (!name || typeof name !== 'string' || name.trim().length > 40) {
        return res.status(400).json({ error: 'Kullanıcı adı 1-40 karakter arasında olmalıdır' });
      }
      if (!isAllowedAvatarPath(selectedAvatarPath, 'userAvatars')) {
        return res.status(400).json({ error: 'Geçersiz avatar seçimi' });
      }
      if (!VALID_USER_VISIBILITIES.has(visibility)) {
        return res.status(400).json({ error: 'Geçersiz kullanıcı görünürlüğü' });
      }
      if (!['admin', 'member'].includes(authority)) {
        return res.status(400).json({ error: 'Geçersiz kullanıcı yetkisi' });
      }

      // Grup var mı kontrol et
      const group = await UserGroup.findOne({ groupId }).lean();
      if (!group) {
        return res.status(404).json({ error: 'Grup bulunamadı' });
      }

      // Dinamik koleksiyonu al
      const { users } = getGroupCollections(groupId);

      let profileImageUrl = '/images/default.png'; // Varsayılan resim URL'i
      let fileName = null;
      /** WebP öncesi kopyalanan orijinal dosya (Dropbox hatası sonrası temizlik için; blok dışında erişilebilir olmalı) */
      let profileUploadTempPath = null;

      // Avatar seçildiyse onu kullan
      if (selectedAvatarPath) {
        profileImageUrl = selectedAvatarPath;
      }
      // Resim varsa önce yerel olarak kaydet
      else if (req.file) {
        try {
          // 1. Adım: Geçici klasöre kaydet (orijinal format)
          const originalFileName = req.file.originalname;
          const normalizedFileName = normalizeFileName(originalFileName);
          const baseFileName = path.parse(normalizedFileName).name;

          const tempFileName = `${Date.now()}-${normalizedFileName}`;
          const tempPath = path.join(publicPath, 'uploads', tempFileName);
          profileUploadTempPath = tempPath;
          fs.copyFileSync(req.file.path, tempPath);

          // 2. Adım: WebP formatına dönüştür
          const webpFileName = `${Date.now()}-${baseFileName}.webp`;
          const webpPath = path.join(publicPath, 'uploads', webpFileName);
          const conversionSuccess = await convertToWebP(tempPath, webpPath);

          if (conversionSuccess) {
            fileName = webpFileName;
            profileImageUrl = `/uploads/${fileName}`;
            if (await unlinkWithRetry(tempPath)) {
              console.log('✅ Orijinal dosya silindi (WebP dönüştürme başarılı)');
            } else {
              console.log('⚠️ Orijinal dosya silinemedi:', tempPath);
            }
          } else {
            // Dönüştürme başarısızsa orijinal dosyayı kullan
            fileName = tempFileName;
            profileImageUrl = `/uploads/${fileName}`;
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
          // Hata durumunda varsayılan resmi kullan
          profileImageUrl = '/images/default.png';
        }
      }

      // 2. Adım: Username ve password oluştur (çakışma kontrolü ile)
      let username = name;
      let randomNumber = Math.floor(Math.random() * 900) + 100; // 100-999 arası rastgele sayı

      // Username çakışması kontrolü
      let usernameExists = await users.findOne({ username }).lean();
      let attemptCount = 0;

      // Önce orijinal ismi dene
      if (usernameExists) {
        // Çakışma varsa sayı ekle
        while (usernameExists && attemptCount < 100) {
          attemptCount++;
          randomNumber = Math.floor(Math.random() * 900) + 100;
          username = name + randomNumber;
          usernameExists = await users.findOne({ username }).lean();
        }
      }

      if (usernameExists) {
        return res.status(400).json({ error: 'Bu isimde çok fazla kullanıcı var. Lütfen farklı bir isim deneyin.' });
      }

      const plainPassword = crypto.randomBytes(24).toString('base64url');
      const hashedPassword = await bcrypt.hash(plainPassword, 10);

      // Dropbox: yükleme başarılı olmadan kayıt yapma (DB'de /uploads kalmasın)
      if (fileName && !selectedAvatarPath) {
        const localPath = path.join(publicPath, 'uploads', fileName);
        try {
          const fileBuffer = fs.readFileSync(localPath);
          const dropboxFileName = buildDropboxImageFileName({
            prefix: 'profil',
            groupName: group.groupName,
            groupId,
            userLabel: name,
            sourceBase: path.parse(fileName).name,
            ext: path.extname(fileName) || '.webp'
          });
          profileImageUrl = await uploadToDropboxWithRetry(fileBuffer, dropboxFileName, 'userImages');
          await unlinkWithRetry(localPath);
        } catch (dropboxError) {
          console.error('Dropbox yükleme hatası:', dropboxError);
          await unlinkWithRetry(localPath);
          if (profileUploadTempPath) {
            await unlinkWithRetry(profileUploadTempPath);
          }
          return res.status(503).json({
            error:
              'Profil resmi buluta yüklenemedi. İnternet bağlantınızı kontrol edip bir süre sonra tekrar deneyin.'
          });
        }
      }

      // 3. Adım: Kullanıcıyı kaydet (Dropbox veya avatar / varsayılan URL ile)
      const user = new users({
        name,
        profileImage: profileImageUrl,
        username: username,
        userpassword: hashedPassword,
        authority,
        visibility,
        loginStreak: 0,
        lastLoginDate: null
      });
      await user.save();

      res.json({ success: true, user: safeUser(user, true), fileName: fileName });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Sunucu hatası' });
    }
  });

  // Kullanıcı silme endpoint'i
  app.post('/api/delete-user/:groupId', requireSelfOrAdmin, async (req, res) => {
    let releaseUserMutationLock;
    try {
      const { groupId } = req.params;
      const { id } = req.body;
      releaseUserMutationLock = await acquireGroupUserMutationLock(groupId);

      // Grup var mı kontrol et
      const group = await UserGroup.findOne({ groupId }).lean();
      if (!group) {
        return res.status(404).json({ error: 'Grup bulunamadı' });
      }

      // Dinamik koleksiyonları al
      const { users, readingStatuses } = getGroupCollections(groupId);

      // Kullanıcıyı bul ve yetkisini kontrol et
      const user = await users.findById(id).lean();
      if (!user) {
        return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
      }

      // Grup yönetilemez durumda kalmasın: en az bir aktif yönetici korunur.
      const [totalUserCount, activeAdminCount] = await Promise.all([
        users.countDocuments(),
        users.countDocuments(activeAdminQuery())
      ]);

      if (user.authority === 'admin' && isActiveUser(user) && activeAdminCount <= 1) {
        return res.status(409).json({ error: 'Grupta en az bir aktif yönetici bulunmalıdır.' });
      }

      // Yöneticisiz kalmış eski/veri dışı bir gruptaki son üye silinirse grubu da sil.
      if (totalUserCount <= 1) {
        await invalidateGroupSessions(groupId);
        await deleteGroupDropboxImages(group, [user]);
        await dropGroupCollections(groupId);
        await UserGroup.findOneAndDelete({ groupId });
        delete req.session.memberships[groupId];

        // Kullanıcıya grup silindiğini bildir
        return res.json({
          success: true,
          groupDeleted: true,
          message: 'Son kullanıcı silindiği için grup da silindi'
        });
      }

      const deletionResult = await deleteUserWithRelatedData({
        groupId,
        user,
        users,
        readingStatuses
      });
      if (!deletionResult.applied) {
        return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
      }
      if (String(req.auth.userId) === String(id)) {
        delete req.session.memberships[groupId];
      }
      logUserCleanupErrors('Silinen kullanıcının ilişkili verileri tamamen temizlenemedi', deletionResult.cleanupErrors);

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Sunucu hatası' });
    } finally {
      releaseUserMutationLock?.();
    }
  });

  // Kullanıcı ismi güncelleme endpoint'i
  app.post('/api/update-user/:groupId', requireGroupAdmin, async (req, res) => {
    const { groupId } = req.params;
    const { userId, name } = req.body;

    try {
      // Parametreleri kontrol et
      if (!userId || !isValidText(name, 40)) {
        return res.status(400).json({ error: 'userId ve name parametreleri gerekli' });
      }

      // Grup var mı kontrol et
      const group = await UserGroup.findOne({ groupId }).lean();
      if (!group) {
        return res.status(404).json({ error: 'Grup bulunamadı' });
      }

      // Dinamik koleksiyonu al
      const { users } = getGroupCollections(groupId);

      // Kullanıcıyı güncelle
      const updatedUser = await users.findByIdAndUpdate(
        userId,
        { name: name.trim() },
        { returnDocument: 'after' }
      );

      if (!updatedUser) {
        return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
      }

      res.json({ success: true, user: safeUser(updatedUser, true) });
    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).json({ error: 'Kullanıcı güncellenirken hata oluştu' });
    }
  });

  // Kullanıcı yetkisi güncelleme endpoint'i
  app.post('/api/update-user-authority/:groupId', requireGroupAdmin, async (req, res) => {
    const { groupId } = req.params;
    const { userId, authority } = req.body;
    let releaseUserMutationLock;

    try {
      // Parametreleri kontrol et
      if (!userId || !authority) {
        return res.status(400).json({ error: 'userId ve authority parametreleri gerekli' });
      }

      // Yetki değerini kontrol et
      if (!['admin', 'member'].includes(authority)) {
        return res.status(400).json({ error: 'Geçersiz yetki değeri. Sadece admin veya member olabilir' });
      }

      releaseUserMutationLock = await acquireGroupUserMutationLock(groupId);

      // Grup var mı kontrol et
      const group = await UserGroup.findOne({ groupId }).lean();
      if (!group) {
        return res.status(404).json({ error: 'Grup bulunamadı' });
      }

      // Dinamik koleksiyonu al
      const { users } = getGroupCollections(groupId);

      // Kullanıcıyı bul
      const user = await users.findById(userId).lean();
      if (!user) {
        return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
      }

      const activeAdminCount = await users.countDocuments(activeAdminQuery());

      // Son aktif yönetici üyeye çevrilemez.
      if (user.authority === 'admin' && isActiveUser(user) &&
          authority === 'member' && activeAdminCount <= 1) {
        return res.status(409).json({ error: 'Grupta en az bir aktif yönetici bulunmalıdır.' });
      }

      // Kullanıcıyı güncelle
      const updatedUser = await users.findByIdAndUpdate(
        userId,
        { authority: authority },
        { returnDocument: 'after' }
      );

      await invalidateUserSessions(groupId, userId);
      if (String(req.auth.userId) === String(userId)) {
        delete req.session.memberships[groupId];
      }

      res.json({
        success: true,
        user: safeUser(updatedUser, true),
        message: `Kullanıcı yetkisi ${authority === 'admin' ? 'Yönetici' : 'Üye'} olarak güncellendi`
      });
    } catch (error) {
      console.error('Error updating user authority:', error);
      res.status(500).json({ error: 'Kullanıcı yetkisi güncellenirken hata oluştu' });
    } finally {
      releaseUserMutationLock?.();
    }
  });

  // Kullanıcı görünürlüğü güncelleme endpoint'i
  app.post('/api/update-user-visibility/:groupId', requireGroupAdmin, async (req, res) => {
    const { groupId } = req.params;
    const { userId, visibility } = req.body;
    let releaseUserMutationLock;

    try {
      if (!userId || !VALID_USER_VISIBILITIES.has(visibility)) {
        return res.status(400).json({ error: 'Geçersiz kullanıcı veya görünürlük değeri' });
      }

      releaseUserMutationLock = await acquireGroupUserMutationLock(groupId);

      const group = await UserGroup.findOne({ groupId }).lean();
      if (!group) {
        return res.status(404).json({ error: 'Grup bulunamadı' });
      }

      const { users } = getGroupCollections(groupId);
      const user = await users.findById(userId).lean();
      if (!user) {
        return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
      }

      const currentVisibility = normalizeUserVisibility(user.visibility);
      if (currentVisibility === visibility) {
        return res.json({ success: true, user: safeUser(user, true) });
      }

      if (visibility === USER_VISIBILITY_PASSIVE) {
        const activeAdminCount = await users.countDocuments(activeAdminQuery());
        if (user.authority === 'admin' && activeAdminCount <= 1) {
          return res.status(409).json({ error: 'Grupta en az bir aktif yönetici bulunmalıdır.' });
        }
      }

      let updatedUser;
      if (visibility === USER_VISIBILITY_PASSIVE) {
        const passivationResult = await passivateUserWithAccessCleanup({
          groupId,
          user,
          users
        });
        if (!passivationResult.applied) {
          return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }
        updatedUser = passivationResult.user;
        logUserCleanupErrors('Pasife alınan kullanıcının erişim verileri tamamen temizlenemedi', passivationResult.cleanupErrors);
        if (String(req.auth.userId) === String(userId)) {
          delete req.session.memberships[groupId];
        }
      } else {
        updatedUser = await users.findByIdAndUpdate(
          userId,
          { visibility },
          { returnDocument: 'after' }
        );
      }

      res.json({
        success: true,
        user: safeUser(updatedUser, true),
        message: `Kullanıcı ${visibility === USER_VISIBILITY_ACTIVE ? 'aktif' : 'pasif'} yapıldı`
      });
    } catch (error) {
      console.error('Kullanıcı görünürlüğü güncellenemedi:', error);
      res.status(500).json({ error: 'Kullanıcı görünürlüğü güncellenemedi' });
    } finally {
      releaseUserMutationLock?.();
    }
  });

  // Kullanıcı resmi güncelleme endpoint'i
  app.post('/api/update-user-image/:groupId/:userId', requireSelfOrAdmin, upload.single('profileImage'), requireValidUploadedImages, async (req, res) => {
    const { groupId, userId } = req.params;
    let uploadedImageUrl = null;
    let imageSaved = false;

    try {
      // Grup var mı kontrol et
      const group = await UserGroup.findOne({ groupId }).lean();
      if (!group) {
        return res.status(404).json({ error: 'Grup bulunamadı' });
      }

      // Dinamik koleksiyonu al
      const { users } = getGroupCollections(groupId);

      // If a file was uploaded
      if (req.file) {
        // Find the user to get their old profile image
        const user = await users.findById(userId).lean();
        if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        const oldImageUrl = user.profileImage;

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

        let fileName;
        if (conversionSuccess) {
          fileName = webpFileName;
          if (await unlinkWithRetry(tempPath)) {
            console.log('✅ Orijinal dosya silindi (WebP dönüştürme başarılı)');
          } else {
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

        const localPath = path.join(publicPath, 'uploads', fileName);
        let newImageUrl;
        try {
          const fileBuffer = fs.readFileSync(localPath);
          const dropboxFileName = buildDropboxImageFileName({
            prefix: 'profil',
            groupName: group.groupName,
            groupId,
            userLabel: user.name || user.username || String(userId),
            sourceBase: baseFileName,
            ext: path.extname(fileName) || '.webp'
          });
          newImageUrl = await uploadToDropboxWithRetry(fileBuffer, dropboxFileName, 'userImages');
          uploadedImageUrl = newImageUrl;
        } catch (dropboxError) {
          console.error('Dropbox yükleme hatası:', dropboxError);
          await unlinkWithRetry(localPath);
          await unlinkWithRetry(tempPath);
          return res.status(503).json({
            error:
              'Profil resmi buluta yüklenemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.'
          });
        }

        await unlinkWithRetry(localPath);

        const updatedUser = await users.findByIdAndUpdate(userId, { profileImage: newImageUrl });
        if (!updatedUser) throw new Error('Kullanıcı güncelleme sırasında silindi');
        imageSaved = true;

        if (isDropboxHostedUrl(oldImageUrl)) {
          deleteFromDropboxByUrl(oldImageUrl).catch(err =>
            console.error('Eski resim silme hatası:', err)
          );
        }

        return res.json({ success: true, imageUrl: newImageUrl, fileName: fileName });
      } else {
        res.status(400).json({ error: 'No image file provided' });
      }
    } catch (error) {
      if (uploadedImageUrl && !imageSaved) {
        await deleteFromDropboxByUrl(uploadedImageUrl).catch(cleanupError =>
          console.error('Kaydedilemeyen yeni profil resmi temizlenemedi:', cleanupError)
        );
      }
      console.error('Error updating user image:', error);
      res.status(500).json({ error: 'Failed to update user image' });
    }
  });



}

module.exports = {
  registerUserRoutes
};
