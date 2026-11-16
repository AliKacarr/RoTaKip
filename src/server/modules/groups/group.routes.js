'use strict';

const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

function registerGroupRoutes(app, dependencies) {
  const {
    UserGroup,
    INACTIVE_MEMBER_ACTION_NONE,
    READING_EDIT_POLICY_ALL,
    USER_VISIBILITY_ACTIVE,
    VALID_AMOUNT_TYPES,
    VALID_INACTIVE_MEMBER_ACTIONS,
    VALID_READING_EDIT_POLICIES,
    accountCreationLimiter,
    activeUserQuery,
    authenticateSession,
    buildDropboxImageFileName,
    convertToWebP,
    createIndexesForGroup,
    deleteGroupDropboxImages,
    deleteGroupImageFromDropboxByUrl,
    dropGroupCollections,
    generateGroupId,
    getGroupCollections,
    invalidateGroupSessions,
    isAllowedAvatarPath,
    isDropboxHostedUrl,
    isSafeGroupId,
    isValidPassword,
    isValidText,
    istanbulDateKey,
    logSiteActivity,
    normalizeAmountType,
    normalizeFileName,
    normalizeInactiveMemberAction,
    normalizeReadingEditPolicy,
    publicPath,
    removeUploadedFiles,
    requireGroupAdmin,
    requireReadableGroup,
    requireValidUploadedImages,
    resolveLogActor,
    rollbackGroupCreation,
    saveSession,
    unlinkWithRetry,
    uploadGroupImage,
    uploadToDropbox
  } = dependencies;

  // 3.1. GRUP YÖNETİMİ
  // ============================================================================

  // Grup doğrulama endpoint'i
  app.get('/api/group/:groupId', async (req, res) => {
    try {
      const { groupId } = req.params;
      const group = await UserGroup.findOne({ groupId }).lean();

      if (!group) {
        return res.status(404).json({ error: 'Grup bulunamadı' });
      }

      res.json({
        group: {
          ...group,
          amountType: normalizeAmountType(group.amountType),
          readingEditPolicy: normalizeReadingEditPolicy(group.readingEditPolicy),
          inactiveMemberAction: normalizeInactiveMemberAction(group.inactiveMemberAction)
        }
      });
    } catch (error) {
      console.error('Error fetching group:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Grupları listeleme API'si
  app.get('/api/groups', async (req, res) => {
    try {
      const { skip = 0, limit = 12, search = '' } = req.query;

      // Arama filtresi
      const searchFilter = search ? {
        $or: [
          { groupName: { $regex: search, $options: 'i' } },
          { groupId: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ]
      } : {};

      // Keşfet ve arama sonuçlarında gizli (private) grupları hiçbir durumda gösterme
      const visibilityFilter = { visibility: 'public' };

      // Tüm filtreleri birleştir
      const finalFilter = {
        ...searchFilter,
        ...visibilityFilter
      };

      // Grupları getir - rastgele sıralama için
      let groups;
      if (search) {
        // Arama yapılıyorsa normal sıralama
        groups = await UserGroup.find(finalFilter)
          .sort({ createdAt: -1 })
          .skip(Number(skip))
          .limit(Number(limit))
          .lean();
      } else {
        // Arama yapılmıyorsa MongoDB'nin kendi rastgele sıralama özelliğini kullan
        // Bu daha performanslı ve gerçek rastgelelik sağlar
        groups = await UserGroup.aggregate([
          { $match: finalFilter },
          { $sample: { size: Number(limit) } }
        ]);
      }

      // Toplam grup sayısını al
      const total = await UserGroup.countDocuments(finalFilter);

      res.json({ groups, total });
    } catch (error) {
      console.error('Error fetching groups:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Grup oluşturma endpoint'i
  app.post('/api/groups', accountCreationLimiter, uploadGroupImage.fields([
    { name: 'groupImage', maxCount: 1 },
    { name: 'adminProfileImage', maxCount: 1 }
  ]), requireValidUploadedImages, async (req, res) => {
    let finalGroupId = null;
    let createdGroupRecordId = null;
    let uploadedGroupImageUrl = null;
    let uploadedAdminProfileImageUrl = null;

    try {
      const {
        groupName,
        description,
        adminUserName,
        adminName,
        adminPassword,
        visibility,
        amountType,
        selectedGroupAvatarPath,
        selectedAdminAvatarPath
      } = req.body;

      if (!isValidText(groupName, 40) || !isValidText(description || '', 200, { allowEmpty: true }) ||
          !isValidText(adminUserName, 40) || !isValidText(adminName, 40)) {
        return res.status(400).json({ error: 'Grup ve kullanıcı alanlarının uzunluklarını kontrol edin' });
      }
      if (!isValidPassword(adminPassword)) {
        return res.status(400).json({ error: 'Şifre 6-40 karakter arasında olmalıdır' });
      }
      if (visibility && !['public', 'private'].includes(visibility)) {
        return res.status(400).json({ error: 'Geçersiz grup görünürlüğü' });
      }
      if (amountType !== undefined && !VALID_AMOUNT_TYPES.has(amountType)) {
        return res.status(400).json({ error: 'Geçersiz okuma birimi' });
      }
      if (!isAllowedAvatarPath(selectedGroupAvatarPath, 'groupAvatars') ||
          !isAllowedAvatarPath(selectedAdminAvatarPath, 'userAvatars')) {
        return res.status(400).json({ error: 'Geçersiz avatar seçimi' });
      }

      const baseGroupId = generateGroupId(groupName);
      finalGroupId = isSafeGroupId(baseGroupId) ? baseGroupId : `${baseGroupId}-grup`;
      let counter = 1;
      let existingGroup = await UserGroup.findOne({ groupId: finalGroupId }).lean();
      while (existingGroup) {
        finalGroupId = `${baseGroupId}${counter}`;
        counter++;
        existingGroup = await UserGroup.findOne({ groupId: finalGroupId }).lean();
      }

      let groupImageUrl = null;
      let adminProfileImageUrl = null;

      // Grup resmi işleme
      if (selectedGroupAvatarPath) {
        groupImageUrl = selectedGroupAvatarPath;
      } else if (req.files && req.files.groupImage) {
        try {
          const orig = req.files.groupImage[0].originalname;
          const base = path.parse(normalizeFileName(orig)).name;
          const ext = (path.extname(orig) || '.webp').toLowerCase();
          const fileName = buildDropboxImageFileName({
            prefix: 'grup-resmi',
            groupName,
            groupId: finalGroupId,
            userLabel: adminUserName,
            sourceBase: base,
            ext
          });
          const fileBuffer = fs.readFileSync(req.files.groupImage[0].path);
          groupImageUrl = await uploadToDropbox(fileBuffer, fileName, 'groupImages');
          uploadedGroupImageUrl = groupImageUrl;

          // Yerel dosyayı sil
          fs.unlinkSync(req.files.groupImage[0].path);
        } catch (error) {
          console.error('Dropbox grup resmi upload hatası:', error);
        }
      }

      // Admin profil resmi işleme
      if (selectedAdminAvatarPath) {
        adminProfileImageUrl = selectedAdminAvatarPath;
      } else if (req.files && req.files.adminProfileImage) {
        try {
          const orig = req.files.adminProfileImage[0].originalname;
          const base = path.parse(normalizeFileName(orig)).name;
          const ext = (path.extname(orig) || '.jpg').toLowerCase();
          const fileName = buildDropboxImageFileName({
            prefix: 'admin-profil',
            groupName,
            groupId: finalGroupId,
            userLabel: adminUserName,
            sourceBase: base,
            ext
          });
          const fileBuffer = fs.readFileSync(req.files.adminProfileImage[0].path);
          adminProfileImageUrl = await uploadToDropbox(fileBuffer, fileName, 'userImages');
          uploadedAdminProfileImageUrl = adminProfileImageUrl;

          // Yerel dosyayı sil
          fs.unlinkSync(req.files.adminProfileImage[0].path);
        } catch (error) {
          console.error('Dropbox admin profil resmi upload hatası:', error);
          adminProfileImageUrl = "/images/default.png";
        }
      } else {
        adminProfileImageUrl = "/images/default.png";
      }

      const autoMarkUnreadParam = req.body.autoMarkUnread;
      const autoMarkUnread = autoMarkUnreadParam !== undefined ? (autoMarkUnreadParam === 'true' || autoMarkUnreadParam === true) : true;

      // Yeni grup oluştur
      const newGroup = new UserGroup({
        groupName,
        groupId: finalGroupId,
        description: description || '',
        groupImage: groupImageUrl,
        visibility: visibility || 'public',
        amountType: normalizeAmountType(amountType),
        readingEditPolicy: READING_EDIT_POLICY_ALL,
        autoMarkUnread,
        inactiveMemberAction: INACTIVE_MEMBER_ACTION_NONE,
        createdAt: new Date()
      });

      await newGroup.save();
      createdGroupRecordId = newGroup._id;

      // Varsayılan kullanıcı ekle (admin olarak)
      const { users, readingStatuses } = getGroupCollections(finalGroupId);

      // Admin şifresini hash'le
      const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);

      const defaultUser = new users({
        name: adminUserName,
        profileImage: adminProfileImageUrl,
        username: adminName,
        userpassword: hashedAdminPassword,
        authority: "admin",
        visibility: USER_VISIBILITY_ACTIVE
      });
      await defaultUser.save();

      // Varsayılan kullanıcının bugünkü okuma durumunu "okudum" olarak kaydet
      const todayStr = istanbulDateKey();

      const defaultReadingStatus = new readingStatuses({
        userId: defaultUser._id.toString(),
        date: todayStr,
        status: "okudum",
        amount: 10
      });
      await defaultReadingStatus.save();

      // Yeni grup için index'leri oluştur
      await createIndexesForGroup(finalGroupId);

      await authenticateSession(req, finalGroupId, defaultUser);

      await logSiteActivity({
        action: 'grup_oluşturma',
        req,
        groupId: finalGroupId,
        deviceInfo: req.body?.deviceInfo
      });

      res.status(201).json({ success: true, group: newGroup, userId: defaultUser._id });
    } catch (error) {
      console.error('Error creating group:', error);

      if (finalGroupId && req.session?.memberships) {
        delete req.session.memberships[finalGroupId];
        if (Object.keys(req.session.memberships).length === 0) delete req.session.memberships;
        await saveSession(req).catch(sessionCleanupError =>
          console.error('Başarısız grup oluşturma oturumu temizlenemedi:', sessionCleanupError)
        );
      }

      try {
        await rollbackGroupCreation({
          groupId: finalGroupId,
          groupRecordId: createdGroupRecordId,
          uploadedGroupImageUrl,
          uploadedAdminProfileImageUrl
        });
      } catch (rollbackError) {
        console.error('Grup oluşturma geri alınamadı:', rollbackError);
      }

      await removeUploadedFiles(req).catch(cleanupError =>
        console.error('Grup oluşturma geçici dosyaları temizlenemedi:', cleanupError)
      );
      res.status(500).json({ error: 'Grup oluşturulurken bir hata oluştu' });
    }
  });

  // Grup üye sayısını getirme endpoint'i
  app.get('/api/groups/:groupId/member-count', requireReadableGroup, async (req, res) => {
    try {
      const { groupId } = req.params;

      // Grup var mı kontrol et
      const group = await UserGroup.findOne({ groupId }).lean();
      if (!group) {
        return res.status(404).json({ error: 'Grup bulunamadı' });
      }

      // Dinamik koleksiyonu al
      const { users } = getGroupCollections(groupId);

      // Kullanıcı sayısını al
      const count = await users.countDocuments(activeUserQuery());

      res.json({ count });
    } catch (error) {
      console.error('Error fetching member count:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Grup ayarlarını güncelleme endpoint'i
  app.post('/api/update-group/:groupId', requireGroupAdmin, async (req, res) => {
    try {
      const { groupId } = req.params;
      const { groupName, description, visibility, amountType, autoMarkUnread, inactiveMemberAction } = req.body;
      if (!isValidText(groupName, 40) || !isValidText(description || '', 200, { allowEmpty: true }) ||
          !['public', 'private'].includes(visibility) ||
          (amountType !== undefined && !VALID_AMOUNT_TYPES.has(amountType)) ||
          (inactiveMemberAction !== undefined && !VALID_INACTIVE_MEMBER_ACTIONS.has(inactiveMemberAction))) {
        return res.status(400).json({ error: 'Grup bilgileri geçersiz' });
      }

      // Grup var mı kontrol et
      const group = await UserGroup.findOne({ groupId }).lean();
      if (!group) {
        return res.status(404).json({ error: 'Grup bulunamadı' });
      }

      const updateFields = {
        groupName: groupName || group.groupName,
        description: description || group.description,
        visibility: visibility || group.visibility,
        amountType: normalizeAmountType(amountType || group.amountType)
      };
      if (autoMarkUnread !== undefined) {
        updateFields.autoMarkUnread = (autoMarkUnread === 'true' || autoMarkUnread === true);
      }
      if (inactiveMemberAction !== undefined) {
        updateFields.inactiveMemberAction = inactiveMemberAction;
      }

      // Grup bilgilerini güncelle
      const updatedGroup = await UserGroup.findOneAndUpdate(
        { groupId },
        updateFields,
        { returnDocument: 'after' }
      );

      res.json({ success: true, group: updatedGroup });
    } catch (error) {
      console.error('Error updating group:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Okuma birimini diğer grup ayarlarından bağımsız güncelle.
  app.post('/api/update-group-amount-type/:groupId', requireGroupAdmin, async (req, res) => {
    try {
      const { groupId } = req.params;
      const { amountType } = req.body;
      if (!VALID_AMOUNT_TYPES.has(amountType)) {
        return res.status(400).json({ error: 'Geçersiz okuma birimi' });
      }

      const updatedGroup = await UserGroup.findOneAndUpdate(
        { groupId },
        { amountType },
        { returnDocument: 'after' }
      );
      if (!updatedGroup) {
        return res.status(404).json({ error: 'Grup bulunamadı' });
      }

      res.json({ success: true, group: updatedGroup });
    } catch (error) {
      console.error('Okuma birimi güncellenemedi:', error);
      res.status(500).json({ error: 'Okuma birimi güncellenemedi' });
    }
  });

  // Üyelerin haftalık tabloda düzenleyebileceği tarih aralığını güncelle.
  app.post('/api/update-reading-edit-policy/:groupId', requireGroupAdmin, async (req, res) => {
    try {
      const { groupId } = req.params;
      const { readingEditPolicy } = req.body;
      if (!VALID_READING_EDIT_POLICIES.has(readingEditPolicy)) {
        return res.status(400).json({ error: 'Geçersiz düzenleme aralığı' });
      }

      const updatedGroup = await UserGroup.findOneAndUpdate(
        { groupId },
        { readingEditPolicy },
        { returnDocument: 'after' }
      );
      if (!updatedGroup) {
        return res.status(404).json({ error: 'Grup bulunamadı' });
      }

      res.json({ success: true, group: updatedGroup });
    } catch (error) {
      console.error('Okuma düzenleme aralığı güncellenemedi:', error);
      res.status(500).json({ error: 'Okuma düzenleme aralığı güncellenemedi' });
    }
  });

  // Zamanlanmış grup ayarlarını diğer grup alanlarından bağımsız güncelle.
  app.post('/api/update-group-automation/:groupId', requireGroupAdmin, async (req, res) => {
    try {
      const { groupId } = req.params;
      const { autoMarkUnread, inactiveMemberAction } = req.body;

      if (typeof autoMarkUnread !== 'boolean' ||
          !VALID_INACTIVE_MEMBER_ACTIONS.has(inactiveMemberAction)) {
        return res.status(400).json({ error: 'Zamanlanmış grup ayarları geçersiz' });
      }

      const updatedGroup = await UserGroup.findOneAndUpdate(
        { groupId },
        { autoMarkUnread, inactiveMemberAction },
        { returnDocument: 'after' }
      );
      if (!updatedGroup) {
        return res.status(404).json({ error: 'Grup bulunamadı' });
      }

      res.json({ success: true, group: updatedGroup });
    } catch (error) {
      console.error('Zamanlanmış grup ayarları güncellenemedi:', error);
      res.status(500).json({ error: 'Zamanlanmış grup ayarları güncellenemedi' });
    }
  });

  // Grup resmini güncelleme endpoint'i
  app.post('/api/update-group-image/:groupId', requireGroupAdmin, uploadGroupImage.single('groupImage'), requireValidUploadedImages, async (req, res) => {
    let newImageUrl = null;
    let imageSaved = false;
    try {
      const { groupId } = req.params;

      // Grup var mı kontrol et
      const group = await UserGroup.findOne({ groupId }).lean();
      if (!group) {
        return res.status(404).json({ error: 'Grup bulunamadı' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
      }

      // Yeni resmi işle: WebP'ye dönüştür -> Dropbox'a gönder
      try {
        const originalFileName = req.file.originalname;
        const baseFileName = path.parse(originalFileName).name;

        // 1. Adım: Multer tarafından zaten public/groupImages klasörüne kaydedildi
        const tempPath = req.file.path;

        // 2. Adım: WebP formatına dönüştür
        const webpFileName = `${Date.now()}-${baseFileName}.webp`;
        const webpPath = path.join(publicPath, 'groupImages', webpFileName);
        const conversionSuccess = await convertToWebP(tempPath, webpPath);

        if (conversionSuccess) {
          // 3. Adım: WebP dosyasını Dropbox'a yükle
          const fileBuffer = fs.readFileSync(webpPath);
          const dropboxName = buildDropboxImageFileName({
            prefix: 'grup-resmi',
            groupName: group.groupName,
            groupId,
            userLabel: 'gorsel',
            sourceBase: baseFileName,
            ext: '.webp'
          });
          newImageUrl = await uploadToDropbox(fileBuffer, dropboxName, 'groupImages');

          // 4. Adım: Yerel dosyaları temizle
          if (!(await unlinkWithRetry(tempPath))) {
            console.log('⚠️ Geçici dosya silinemedi:', tempPath);
          }
          if (!(await unlinkWithRetry(webpPath))) {
            console.log('⚠️ WebP dosya silinemedi:', webpPath);
          }
        } else {
          // Dönüştürme başarısızsa orijinal dosyayı kullan
          const fileBuffer = fs.readFileSync(tempPath);
          const dropboxName = buildDropboxImageFileName({
            prefix: 'grup-resmi',
            groupName: group.groupName,
            groupId,
            userLabel: 'gorsel',
            sourceBase: baseFileName,
            ext: (path.extname(originalFileName) || '.jpg').toLowerCase()
          });
          newImageUrl = await uploadToDropbox(fileBuffer, dropboxName, 'groupImages');

          // Geçici dosyayı temizle
          try {
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
          } catch (unlinkError) {
            console.log('⚠️ Geçici dosya silinemedi:', tempPath);
          }
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
        console.error('Dropbox grup resmi upload hatası:', error);
        throw error;
      }

      // Grup resmini güncelle
      const updatedGroup = await UserGroup.findOneAndUpdate(
        { groupId },
        { groupImage: newImageUrl },
        { returnDocument: 'after' }
      );
      if (!updatedGroup) throw new Error('Grup güncelleme sırasında silindi');
      imageSaved = true;

      if (isDropboxHostedUrl(group.groupImage)) {
        deleteGroupImageFromDropboxByUrl(group.groupImage).catch(err =>
          console.error('Eski grup resmi silme hatası:', err)
        );
      }

      res.json({ success: true, imageUrl: newImageUrl, group: updatedGroup });
    } catch (error) {
      if (newImageUrl && !imageSaved) {
        await deleteGroupImageFromDropboxByUrl(newImageUrl).catch(cleanupError =>
          console.error('Kaydedilemeyen yeni grup resmi temizlenemedi:', cleanupError)
        );
      }
      console.error('Error updating group image:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Grup resmini kaldırma endpoint'i
  app.post('/api/remove-group-image/:groupId', requireGroupAdmin, async (req, res) => {
    try {
      const { groupId } = req.params;

      // Grup var mı kontrol et
      const group = await UserGroup.findOne({ groupId }).lean();
      if (!group) {
        return res.status(404).json({ error: 'Grup bulunamadı' });
      }

      // Grup resmini null yap
      const updatedGroup = await UserGroup.findOneAndUpdate(
        { groupId },
        { groupImage: null },
        { returnDocument: 'after' }
      );

      if (isDropboxHostedUrl(group.groupImage)) {
        deleteGroupImageFromDropboxByUrl(group.groupImage).catch(err =>
          console.error('Grup resmi silme hatası:', err)
        );
      }

      res.json({ success: true, group: updatedGroup });
    } catch (error) {
      console.error('Error removing group image:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Hazır avatar listesi endpoint'i
  app.get('/api/group-avatars', (req, res) => {
    try {
      const avatarDir = path.join(publicPath, 'groupAvatars');

      if (!fs.existsSync(avatarDir)) {
        return res.json([]);
      }

      const files = fs.readdirSync(avatarDir);
      const avatars = files
        .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
        .map(file => ({
          name: file,
          path: `/groupAvatars/${file}`
        }));

      res.json(avatars);
    } catch (error) {
      console.error('Avatar listesi yükleme hatası:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Hazır avatar ile grup resmini güncelleme endpoint'i
  app.post('/api/update-group-image-from-avatar/:groupId', requireGroupAdmin, async (req, res) => {
    try {
      const { groupId } = req.params;
      const { avatarPath } = req.body;
      if (!avatarPath || !isAllowedAvatarPath(avatarPath, 'groupAvatars')) {
        return res.status(400).json({ error: 'Geçersiz avatar seçimi' });
      }

      // Grup var mı kontrol et
      const group = await UserGroup.findOne({ groupId }).lean();
      if (!group) {
        return res.status(404).json({ error: 'Grup bulunamadı' });
      }

      // Avatar dosyasının varlığını kontrol et
      const avatarFilePath = path.join(publicPath, avatarPath.slice(1));
      if (!fs.existsSync(avatarFilePath)) {
        return res.status(404).json({ error: 'Avatar dosyası bulunamadı' });
      }

      // Hazır avatar için yerel path'i kullan (Dropbox'a yükleme yok)
      const newImageUrl = avatarPath;

      // Grup resmini güncelle
      const updatedGroup = await UserGroup.findOneAndUpdate(
        { groupId },
        { groupImage: newImageUrl },
        { returnDocument: 'after' }
      );

      if (isDropboxHostedUrl(group.groupImage)) {
        deleteGroupImageFromDropboxByUrl(group.groupImage).catch(err =>
          console.error('Eski grup resmi silme hatası:', err)
        );
      }

      console.log(`✅ Avatar seçimi: ${newImageUrl} (Dropbox'a yüklenmedi)`);

      res.json({ success: true, imageUrl: newImageUrl, group: updatedGroup });
    } catch (error) {
      console.error('Error updating group image from avatar:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Grup silme endpoint'i
  app.delete('/api/delete-group/:groupId', requireGroupAdmin, async (req, res) => {
    try {
      const { groupId } = req.params;

      // Grup var mı kontrol et
      const group = await UserGroup.findOne({ groupId }).lean();
      if (!group) {
        return res.status(404).json({ error: 'Grup bulunamadı' });
      }

      // Dinamik koleksiyonları al
      const { users } = getGroupCollections(groupId);
      const allUsers = await users.find().lean();

      const deletionActor = await resolveLogActor(req, groupId);

      // Dropbox temizliği başarısızsa grup kaydını silme; yönetici tekrar deneyebilsin.
      await invalidateGroupSessions(groupId);
      await deleteGroupDropboxImages(group, allUsers);
      await dropGroupCollections(groupId);
      await UserGroup.findOneAndDelete({ groupId });
      delete req.session.memberships[groupId];

      await logSiteActivity({
        action: 'grup_silme',
        req,
        groupId,
        deviceInfo: req.body?.deviceInfo,
        actor: deletionActor
      }).catch(error => console.error('Grup silme etkinliği kaydedilemedi:', error));

      res.json({ success: true, message: 'Grup başarıyla silindi' });
    } catch (error) {
      console.error('Grup silme hatası:', error);
      res.status(500).json({ error: 'Server error', message: error.message });
    }
  });


}

module.exports = {
  registerGroupRoutes
};

