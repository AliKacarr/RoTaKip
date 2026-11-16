'use strict';

const bcrypt = require('bcrypt');

function registerAdminAuthRoutes(app, dependencies) {
  const {
    UserGroup,
    authenticateSession,
    getGroupCollections,
    handleLoginStreak,
    isActiveUser,
    isSafeGroupId,
    istanbulDateKey,
    loginLimiter,
    requireSelfOrAdmin
  } = dependencies;

  // 3.5. ADMIN VE GÜVENLİK
  // ============================================================================

  // Admin girişi endpoint'i
  app.post('/api/admin-login', loginLimiter, async (req, res) => {
    try {
      const { username, password, groupId } = req.body;

      if (!isSafeGroupId(groupId) || !username || !password) {
        return res.status(400).json({ success: false, error: 'Eksik veya geçersiz giriş bilgisi' });
      }

      const group = await UserGroup.findOne({ groupId }).lean();
      if (!group) return res.json({ success: false });

      // Kullanıcıyı önce şifresiyle doğrula. Pasiflik bilgisini yalnızca doğru
      // şifre girildiğinde açıklayarak kullanıcı adı sorgulamasını önle.
      const { users } = getGroupCollections(groupId);
      const user = await users.findOne({ username }).lean();

      if (user) {
        // Şifre kontrolü
        const isPasswordValid = await bcrypt.compare(password, user.userpassword);

        if (isPasswordValid) {
          if (!isActiveUser(user)) {
            return res.json({
              success: false,
              code: 'USER_PASSIVE',
              error: 'Bu kullanıcı hesabı pasif durumda. Grup yöneticinizle iletişime geçin.'
            });
          }

          // Eksik alanları ekle (migration)
          if (user.loginStreak === undefined || user.lastLoginDate === undefined) {
            const today = istanbulDateKey();
            const loginStreak = user.loginStreak || 1;
            const lastLoginDate = user.lastLoginDate || today;
            await users.findByIdAndUpdate(user._id, { loginStreak, lastLoginDate });
            // user objesi plain object olduğu için manuel güncelle
            user.loginStreak = loginStreak;
            user.lastLoginDate = lastLoginDate;
            console.log(`🔧 Eksik alanlar eklendi: ${user.username} -> loginStreak: ${loginStreak}, lastLoginDate: ${lastLoginDate}`);
          }

          // Giriş serisi hesapla
          const { user: updatedUser, streakIncreased } = await handleLoginStreak(user, groupId);

          await authenticateSession(req, groupId, updatedUser);

          res.json({
            success: true,
            groupName: group.groupName,
            groupId: group.groupId,
            userId: updatedUser._id, // Kullanıcı ID'sini de döndür
            authority: updatedUser.authority, // Kullanıcının yetkisini de döndür
            userName: updatedUser.username, // Kullanıcının kullanıcı adını de döndür
            name: updatedUser.name, // Kullanıcının gerçek adını döndür
            profileImage: updatedUser.profileImage,
            loginStreak: updatedUser.loginStreak, // Giriş serisini de döndür
            streakIncreased: streakIncreased // Seri artırıldı mı bilgisi
          });
        } else {
          res.json({ success: false });
        }
      } else {
        res.json({ success: false });
      }
    } catch (error) {
      console.error('Admin login error:', error);
      res.status(500).json({ success: false, error: 'Server error' });
    }
  });

  // Giriş serisi güncelleme endpoint'i
  app.post('/api/update-login-streak', requireSelfOrAdmin, async (req, res) => {
    try {
      const { userId, groupId } = req.body;

      // Users koleksiyonundan kullanıcıyı bul
      const { users } = getGroupCollections(groupId);

      const user = await users.findById(userId).lean();

      if (!user) {
        console.log(`❌ Kullanıcı bulunamadı: ${userId}`);
        return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
      }

      // Giriş serisi hesapla
      const { user: updatedUser, streakIncreased } = await handleLoginStreak(user, groupId);
      res.json({
        success: true,
        loginStreak: updatedUser.loginStreak,
        lastLoginDate: updatedUser.lastLoginDate,
        streakIncreased: streakIncreased,
        name: updatedUser.name
      });
    } catch (error) {
      console.error('Giriş serisi güncelleme hatası:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Add an initial admin if none exists (you can remove this after first run)

}

module.exports = {
  registerAdminAuthRoutes
};

