// ============================================================================
// YENİ YEREL DEPOLAMA SİSTEMİ
// ============================================================================

// Giriş serisi artırıldığında bildirim göster
window.showStreakNotification = function showStreakNotification(name, streak) {
  console.log('Giriş serisi artırıldı4');
  const toast = document.createElement('div');
  toast.className = 'toast toast-streak';
  toast.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <div style="width: 35px; height: 35px;">
        <img src="/images/fire.webp" alt="Fire" style="width: 100%; height: 100%; object-fit: contain;">
      </div>
      <div>
        <div style="font-weight: bold;">Hoş geldin ${name}!</div>
        <div style="font-size: 19px;">Giriş serin ${streak} oldu.</div>
      </div>
    </div>
  `;
  
  // Animasyon CSS'i ekle
  const style = document.createElement('style');
  style.textContent = `
    @keyframes streakPulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(toast);
  
  
  // Bildirim azcık daha uzun (6 saniye) kalsın
  setTimeout(() => {
    toast.classList.add('toast-hide');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
      if (style.parentNode) {
        style.parentNode.removeChild(style);
      }
    }, 300);
  }, 6000);
}

// Yeni yerel depolama yönetimi fonksiyonları
class LocalStorageManager {
  // Groups objesini al
  static getGroups() {
    const groups = localStorage.getItem('groups');
    return groups ? JSON.parse(groups) : {};
  }

  // Groups objesini kaydet
  static setGroups(groups) {
    localStorage.setItem('groups', JSON.stringify(groups));
  }

  // Bir gruba kullanıcı ekle/güncelle
  static addUserToGroup(groupId, userId) {
    const groups = this.getGroups();
    groups[groupId] = userId;
    this.setGroups(groups);
  }

  // Bir gruptan kullanıcıyı kaldır
  static removeUserFromGroup(groupId) {
    const groups = this.getGroups();
    delete groups[groupId];
    this.setGroups(groups);
  }

  // Mevcut grup için kullanıcı ID'sini al
  static getCurrentUserId() {
    const groupid = getGroupIdFromUrl();
    if (!groupid) return null;
    
    const groups = this.getGroups();
    return groups[groupid] || null;
  }

  // Mevcut grup için kullanıcı bilgilerini al
  static getCurrentUserInfo() {
    const groupid = getGroupIdFromUrl();
    if (!groupid) return null;

    const userId = this.getCurrentUserId();
    if (!userId) return null;

    return {
      groupId: groupid,
      userId: userId,
      userAuthority: localStorage.getItem('userAuthority'),
      userName: localStorage.getItem('userName'),
      groupName: localStorage.getItem('groupName'),
      name: localStorage.getItem('name')
    };
  }

  // Kullanıcı girişi yap
  static loginUser(groupId, userId, userAuthority, userName, groupName, name) {
    // Groups objesine ekle
    this.addUserToGroup(groupId, userId);
    
    // Mevcut grup bilgilerini kaydet
    localStorage.setItem('groupid', groupId);
    localStorage.setItem('userid', userId);
    localStorage.setItem('userAuthority', userAuthority);
    localStorage.setItem('userName', userName);
    localStorage.setItem('groupName', groupName);
    localStorage.setItem('name', name || '');
  }

  // Kullanıcı çıkışı yap
  static logoutUser() {
    const groupid = getGroupIdFromUrl();
    if (groupid) {
      this.removeUserFromGroup(groupid);
    }
    
    // Mevcut grup bilgilerini sil
    localStorage.removeItem('groupid');
    localStorage.removeItem('userid');
    localStorage.removeItem('userAuthority');
    localStorage.removeItem('userName');
    localStorage.removeItem('groupName');
    localStorage.removeItem('name');
  }

  // 5 çerezi temizle
  static clearCookies() {
    localStorage.removeItem('groupid');
    localStorage.removeItem('userid');
    localStorage.removeItem('userAuthority');
    localStorage.removeItem('userName');
    localStorage.removeItem('groupName');
  }

  // Kullanıcının giriş yapıp yapmadığını kontrol et
  static isUserLoggedIn() {
    const userInfo = this.getCurrentUserInfo();
    return userInfo !== null;
  }

  // Admin yetkisi kontrolü
  static isAdmin() {
    const userInfo = this.getCurrentUserInfo();
    return userInfo && userInfo.userAuthority === 'admin';
  }

  // Member yetkisi kontrolü
  static isMember() {
    const userInfo = this.getCurrentUserInfo();
    return userInfo && userInfo.userAuthority === 'member';
  }
}

// URL'den grup ID'sini çıkarma fonksiyonu
window.getGroupIdFromUrl = function getGroupIdFromUrl() {
  const path = window.location.pathname;
  
  // Yeni format: /groupid=catikati23
  const groupIdMatch = path.match(/\/groupid=([^\/\?]+)/);
  if (groupIdMatch) {
    const decodedGroupId = decodeURIComponent(groupIdMatch[1]);
    return decodedGroupId;
  }
  
  // Eski format desteği (geriye uyumluluk için)
  const segments = path.split('/').filter(segment => segment !== '');
  if (segments.length > 0) {
    let groupId = segments[0];
    if (groupId.includes(':')) {
      groupId = groupId.split(':')[0];
    }
    groupId = decodeURIComponent(groupId);
    groupId = groupId.replace(/[^a-zA-Z0-9_-çğıöşüÇĞIİÖŞÜ]/g, '');
    return groupId;
  }

  return null;
};

// URL'den davet parametrelerini kontrol etme fonksiyonu
window.getInviteParams = function getInviteParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const invite = urlParams.get('invite');
  const quickLogin = urlParams.get('quick-login');
  
  // URL'de quick-login parametresi var mı kontrol et
  const hasQuickLogin = quickLogin !== null;
  
  return {
    hasInvite: hasQuickLogin && invite,
    inviteToken: invite
  };
};

// Global grup ID değişkeni
window.groupid = getGroupIdFromUrl();

// Admin elementlerini gizleme fonksiyonu
function hideAdminElements() {
  const adminIndicator = document.querySelector('.admin-indicator');
  if (adminIndicator) {
    adminIndicator.classList.add('hidden');
    adminIndicator.classList.remove('show');
  }
}

// YENİ YETKİ KONTROLÜ SİSTEMİ
// Sayfa yüklendiğinde 5 çerezi sil, groups dizisinden kontrol et, varsa yeniden oluştur
async function initializeAuthSystem() {
  
  // Admin sayfaları için çerezleri silme
  const currentPath = window.location.pathname;
  if (currentPath === '/login-logs.html' || currentPath === '/admin-logs.html') {
    return true;
  }
  
  // Navigasyon butonlarını oluştur
  if (typeof createNavigationButtons === 'function') {
    createNavigationButtons();
  }
  
  // 1. Önce 5 çerezi temizle
  LocalStorageManager.clearCookies();
  
  // 2. URL'deki grup ID'sini al
  const groupid = getGroupIdFromUrl();
  if (!groupid) {
    return false;
  }

  // 3. Groups dizisinde bu grup var mı kontrol et
  const groups = LocalStorageManager.getGroups();
  const userId = groups[groupid];
  
  if (!userId) {
    return false;
  }
  
  
  try {
    // 4. Kullanıcının hala bu grupta olup olmadığını kontrol et
    const response = await fetch(`/api/users/${groupid}`);
    if (!response.ok) {
      LocalStorageManager.removeUserFromGroup(groupid);
      return false;
    }

    const data = await response.json();
    const user = data.users.find(u => u._id === userId);
    
    if (!user) {
      LocalStorageManager.removeUserFromGroup(groupid);
      return false;
    }
    
    // 5. Grup bilgilerini al
    const groupResponse = await fetch(`/api/group/${groupid}`);
    if (!groupResponse.ok) {
      return false;
    }

    const groupData = await groupResponse.json();
    
    // Giriş serisi güncelle (sayfa yüklendiğinde kontrol et)
    try {
      const streakResponse = await fetch('/api/update-login-streak', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: userId,
          groupId: groupid
        })
      });
      
      if (streakResponse.ok) {
        const streakData = await streakResponse.json();
        
        // Giriş serisi bilgisini UI'da güncelle
        const streakNumber = document.querySelector('.streak-number');
        if (streakNumber) {
          streakNumber.textContent = streakData.loginStreak;
        }
        
        // Giriş serisi artırıldıysa bildirim göster
        if (streakData.streakIncreased && user.name) {
          showStreakNotification(user.name, streakData.loginStreak);
        }
      }
    } catch (streakError) {
      console.error('Giriş serisi güncelleme hatası:', streakError);
    }
    
    // Kullanıcı profil bilgilerini UI'da güncelle
    const profileUsername = document.getElementById('profileUsername');
    const profileMemberName = document.getElementById('profileMemberName');
    const profileImagePreview = document.getElementById('profileImagePreview');
    
    if (profileUsername && user.name) {
      profileUsername.textContent = user.name;
    }
    if (profileMemberName && user.username) {
      profileMemberName.textContent = user.username;
    }
    if (profileImagePreview && user.profileImage) {
      profileImagePreview.src = user.profileImage;
    }
    
    // 7. 5 çerezi yeniden oluştur
    LocalStorageManager.loginUser(
      groupid,
      userId,
      user.authority,
      user.username,
      groupData.group.groupName,
      user.name
    );
    
  
    // UI güncellemelerini tetikle
    if (typeof window.updateProfileButton === 'function') {
      window.updateProfileButton();
    }

    if (typeof showAdminIndicator === 'function') {
      showAdminIndicator();
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Yetki kontrolü hatası:', error);
    return false;
  }
}

// Grup doğrulama fonksiyonu
async function validateGroup() {
  try {
    const response = await fetch(`/api/group/${window.groupid}`);

    if (!response.ok) {
      if (response.status === 404) {
        window.location.href = '/';
        return false;
      }
      throw new Error('Grup doğrulama hatası');
    }

    const data = await response.json();
    const group = data.group;
    
    // Davet parametrelerini kontrol et
    const inviteParams = getInviteParams();
    
    // Eğer davet linki ile gelinmişse hoşgeldiniz panelini aç
    if (inviteParams.hasInvite) {
      try {
        // Token doğrulama
        const encodedGroupId = encodeURIComponent(window.groupid);
        const response = await fetch(`/api/verify-invite/${encodedGroupId}?invite=${inviteParams.inviteToken}`);
        
        if (!response.ok) {
          // 404 veya başka hata - temiz grup linkine yönlendir
          const cleanUrl = `/groupid=${encodeURIComponent(window.groupid)}`;
          window.location.href = cleanUrl;
          return false;
        }
        
        const data = await response.json();

        if (data.success) {
          // Geçerli token - hoşgeldiniz panelini aç
          if (typeof window.showWelcomeInviteModal === 'function') {
            await window.showWelcomeInviteModal(group, data);
          }
          return true; // Davet linki ile gelinmişse normal akışı durdur
        } else {
          // Geçersiz token - temiz grup linkine yönlendir
          const cleanUrl = `/groupid=${encodeURIComponent(window.groupid)}`;
          window.location.href = cleanUrl;
          return false;
        }
      } catch (error) {
        console.error('Token doğrulama hatası:', error);
        // Hata durumunda da temiz grup linkine yönlendir
        const cleanUrl = `/groupid=${encodeURIComponent(window.groupid)}`;
        window.location.href = cleanUrl;
        return false;
      }
    }
    
    // Grup visibility kontrolü (sadece normal linkler için)
    if (group.visibility === 'private') {
      // Kullanıcı giriş yapmış mı kontrol et
      if (!LocalStorageManager.isUserLoggedIn()) {
        // Giriş yapmamışsa login modal'ı aç
        const groupsAuthLoginModal = document.getElementById('groupsAuthLoginModal');
        if (groupsAuthLoginModal) {
          // Private grup erişimi için modal açıldığını işaretle
          window.isPrivateGroupAccessModal = true;
          
          showModal(groupsAuthLoginModal);
          
          // Modal içindeki bilgilendirme mesajını güncelle
          const loginTitle = document.querySelector('#groupsAuthLoginModal .groups-auth-login-modal-title h2');
          if (loginTitle) {
            loginTitle.textContent = 'Gizli Gruba Erişim';
          }
          
          const loginSubtitle = document.querySelector('#groupsAuthLoginModal .groups-auth-login-modal-subtitle');
          if (loginSubtitle) {
            loginSubtitle.textContent = 'Bu grup gizlidir. Erişim için giriş yapmanız gerekmektedir.';
          }
          
          // Bilgilendirme mesajını göster
          const infoMessage = document.getElementById('groupsAuthLoginInfoMessage');
          const infoText = document.getElementById('groupsAuthLoginInfoText');
          if (infoMessage && infoText) {
            infoText.textContent = 'Bu grubu görüntülemek için giriş yapmanız veya üye olmanız gerekmektedir.';
            infoMessage.style.display = 'flex';
          }
        }
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('Grup doğrulama hatası:', error);
    window.location.href = '/';
    return false;
  }
}

// Eski isAuthenticated fonksiyonunu yeni sisteme göre güncelle
function isAuthenticated() {
  return LocalStorageManager.isUserLoggedIn();
}

// Profil butonunu dinamik hale getirme fonksiyonu
function initializeProfileButton() {
  const profileButton = document.getElementById('profileButton');
  const profileButtonText = document.getElementById('profileButtonText');
  const profileButtonIcon = document.getElementById('profileButtonIcon');
  const adminLoginModal = document.getElementById('adminLoginModal');
  
  if (!profileButton || !profileButtonText || !profileButtonIcon) return;
  
  function checkAuthStatus() {
    const userInfo = LocalStorageManager.getCurrentUserInfo();
    
    if (userInfo) {
      const username = userInfo.userName || 'Kullanıcı';
      const userAuthority = userInfo.userAuthority;
      
      profileButtonText.textContent = 'Profilim';
      
      if (userAuthority === 'admin') {
        profileButton.title = 'Yönetici Profili: ' + username;
        profileButtonIcon.className = 'fa-solid fa-user-circle';
        profileButtonIcon.style.color = '#4e54c8';
      } else {
        profileButton.title = 'Üye Profili: ' + username;
        profileButtonIcon.className = 'fa-solid fa-user';
        profileButtonIcon.style.color = '#4e54c8';
      }
      
      profileButton.onclick = function() {
        if (typeof showAdminInfoPanel === 'function') {
          showAdminInfoPanel();
        }
      };
    } else {
      profileButtonText.textContent = 'Giriş Yap';
      profileButton.title = 'Kullanıcı Girişi';
      
      profileButtonIcon.className = 'fa-solid fa-sign-in-alt';
      profileButtonIcon.style.color = '#007bff';
      
      profileButton.onclick = function() {
        if (adminLoginModal) {
          adminLoginModal.style.display = 'flex';
        }
      };
    }
  }
  
  checkAuthStatus();
  
  // LocalStorage değişikliklerini dinle
  window.addEventListener('storage', function(e) {
    if (e.key === 'groups' || e.key === 'groupid' || e.key === 'userid' || e.key === 'userAuthority' || e.key === 'userName' || e.key === 'groupName') {
      checkAuthStatus();
    }
  });
  
  // Programatik localStorage değişikliklerini de dinle
  const originalSetItem = localStorage.setItem;
  localStorage.setItem = function(key, value) {
    originalSetItem.call(this, key, value);
    if (key === 'groups' || key === 'groupid' || key === 'userid' || key === 'userAuthority' || key === 'userName' || key === 'groupName') {
      setTimeout(checkAuthStatus, 100);
    }
  };
  
  window.updateProfileButton = checkAuthStatus;
}

// Title'ı grup adına göre güncelleme fonksiyonu
async function updatePageTitle() {
  const pageTitle = document.getElementById('page-title');
  const secretAdminLogin = document.getElementById('secretAdminLogin');
  
  if (!pageTitle && !secretAdminLogin) return;

  const groupId = getGroupIdFromUrl();
  if (!groupId) return;

  try {
    const response = await fetch(`/api/group/${groupId}`);
    if (response.ok) {
      const data = await response.json();
      const groupName = data.group.groupName;
      
      if (pageTitle) {
        pageTitle.textContent = `RoTaKip ${groupName}`;
      }
      
      if (secretAdminLogin) {
        const groupImage = data.group.groupImage;
        const imgSrc = groupImage || '/images/open-book.webp';
        
        secretAdminLogin.innerHTML = `
          <img src="${imgSrc}" class="secretAdminLoginImage" alt="Grup Resmi" style="border-radius: 6px;" onerror="this.src='/images/open-book.webp'">
          <h2 style="margin: 0; font-size: inherit; font-weight: inherit;">${groupName} Okuma Grubu</h2>
        `;
      }
    }
  } catch (error) {
    console.error('Grup bilgisi alınamadı:', error);
  }
}

// URL'den _r parametresini temizleme fonksiyonu
function cleanUrlFromRefreshParam() {
  const url = new URL(window.location.href);
  if (url.searchParams.has('_r')) {
    url.searchParams.delete('_r');
    // URL'yi temizle ama sayfa yenileme yapma
    window.history.replaceState({}, '', url.toString());
  }
}

// Ana DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', async function () {
  try {
    
    // Sayfa açılış zamanını kaydet veya güncelle
    const sessionStartTimeKey = 'pageSessionStartTime';
    const now = Date.now();
    localStorage.setItem(sessionStartTimeKey, now.toString());
    
    // URL'den _r parametresini temizle
    cleanUrlFromRefreshParam();
    
    // Admin sayfaları için özel kontrol
    const currentPath = window.location.pathname;
    if (currentPath === '/login-logs.html' || currentPath === '/admin-logs.html') {
      // Admin sayfaları için çerezleri silmeden devam et
      return;
    }
    
    // Grup ID'si yoksa ana sayfaya yönlendir
    if (window.groupid === null) {
      console.log('❌ Group ID is null, redirecting to home');
      window.location.href = '/';
      return;
    }

    // YENİ YETKİ KONTROLÜ SİSTEMİ
    await initializeAuthSystem();

    // Grup doğrulama
    await validateGroup();

    // Profil butonunu başlat
    initializeProfileButton();

    // Title'ı güncelle
    updatePageTitle();


    // Global veri deposu başlatma
    if (!window.GlobalDataStore) {
      class GlobalDataStore {
        constructor() {
          this.groupId = null;
          this.users = [];
          this.stats = [];
          this.userMap = new Map(); // userId -> user
          this.statMap = new Map(); // userId -> { date: status }
          this.userReadingCounts = new Map(); // userId -> okudum count
          this.longestStreaks = []; // [{ userId, name, profileImage, streak, startDate, endDate }]
        }

        async init(groupId) {
          this.groupId = groupId;
          const res = await fetch(`/api/all-data/${groupId}`);
          const data = await res.json();
          this.users = Array.isArray(data.users) ? data.users : [];
          this.stats = Array.isArray(data.stats) ? data.stats : [];
          this._rebuildIndexes();
          await this._buildLongestStreaks();
        }

        _rebuildIndexes() {
          this.userMap.clear();
          this.statMap.clear();
          this.userReadingCounts.clear();

          for (const u of this.users) {
            this.userMap.set(u._id, u);
            this.statMap.set(u._id, {});
          }

          for (const s of this.stats) {
            if (!this.statMap.has(s.userId)) {
              this.statMap.set(s.userId, {});
            }
            this.statMap.get(s.userId)[s.date] = s.status;
          }

          // Okudum sayıları
          for (const u of this.users) {
            const map = this.statMap.get(u._id) || {};
            const okCount = Object.values(map).filter(v => v === 'okudum').length;
            this.userReadingCounts.set(u._id, okCount);
          }
        }

        getAllData() {
          return { users: this.users.slice(), stats: this.stats.slice() };
        }

        getUsers() { return this.users.slice(); }
        getStats() { return this.stats.slice(); }
        getUserMap() { return this.userMap; }
        getStatMap() { return this.statMap; }
        getUserReadingCounts() { return this.userReadingCounts; }

        async _buildLongestStreaks() {
          // Sunucudan almak yerine eldeki stats üzerinden hesapla
          const results = [];
          for (const u of this.users) {
            const map = this.statMap.get(u._id) || {};
            const okDates = Object.keys(map).filter(d => map[d] === 'okudum').sort();
            let maxStreak = 0, currentStreak = 0;
            let streakStart = null, streakEnd = null;
            let maxStart = null, maxEnd = null;

            for (let i = 0; i < okDates.length; i++) {
              const prev = i > 0 ? new Date(okDates[i - 1]) : null;
              const curr = new Date(okDates[i]);
              if (i === 0 || (prev && (curr - prev) === 86400000)) {
                currentStreak++;
                if (currentStreak === 1) streakStart = okDates[i];
                streakEnd = okDates[i];
              } else {
                if (currentStreak > maxStreak) {
                  maxStreak = currentStreak; maxStart = streakStart; maxEnd = streakEnd;
                }
                currentStreak = 1; streakStart = okDates[i]; streakEnd = okDates[i];
              }
            }
            if (currentStreak > maxStreak) {
              maxStreak = currentStreak; maxStart = streakStart; maxEnd = streakEnd;
            }
            results.push({ userId: u._id, name: u.name, profileImage: u.profileImage, streak: maxStreak, startDate: maxStart, endDate: maxEnd });
          }
          results.sort((a, b) => b.streak - a.streak);
          this.longestStreaks = results;
        }

        getLongestStreaks() { return this.longestStreaks.slice(); }

        // Özet istatistik: okudum/okumadım sayıları
        getReadingStatsSummary() {
          const summary = [];
          for (const u of this.users) {
            const map = this.statMap.get(u._id) || {};
            const values = Object.values(map);
            const okudum = values.filter(v => v === 'okudum').length;
            const okumadim = values.filter(v => v === 'okumadım').length;
            summary.push({ userId: u._id, name: u.name, profileImage: u.profileImage, okudum, okumadim });
          }
          return summary;
        }

        // UI güncellemelerinden çağrılacak: hem cache’i hem dizi’yi günceller
        applyLocalUpdate(userId, date, status) {
          // stats array upsert/delete
          const idx = this.stats.findIndex(s => s.userId === userId && s.date === date);
          if (status) {
            const newObj = { userId, date, status };
            if (idx >= 0) this.stats[idx] = newObj; else this.stats.push(newObj);
          } else {
            if (idx >= 0) this.stats.splice(idx, 1);
          }

          // statMap
          if (!this.statMap.has(userId)) this.statMap.set(userId, {});
          const userMap = this.statMap.get(userId);
          if (status) userMap[date] = status; else delete userMap[date];

          // okudum sayacı
          const prev = this.userReadingCounts.get(userId) || 0;
          let next = prev;
          if (status === 'okudum') {
            // Eğer önceki durum okudum değilse artır
            const before = idx >= 0 ? (this.stats[idx]?.status) : undefined;
            if (before !== 'okudum') next = prev + 1;
          } else if (status === 'okumadım' || status === '') {
            // Okudum’dan başka şeye geçtiyse azalt
            if (userMap[date] !== 'okudum') {
              // nothing
            }
            // Güvenli yeniden sayım (kenar durumlarından kaçınmak için)
            const map = this.statMap.get(userId) || {};
            next = Object.values(map).filter(v => v === 'okudum').length;
          }
          this.userReadingCounts.set(userId, Math.max(0, next));

          // En uzun serileri yeniden hesapla (hafif veri setleri için yeterli)
          this._buildLongestStreaks();
        }
      }
      window.GlobalDataStore = GlobalDataStore;
    }

    if (!window.globalDataStore) {
      window.globalDataStore = new window.GlobalDataStore();
      await window.globalDataStore.init(window.groupid);
    }


    
    // 1️⃣ Öncelikli: tracker-table hemen yüklensin
    await loadTrackerTable();

    // 2️⃣ Arkada, hızlı yüklenebilecek veya birbirinden bağımsız fonksiyonları paralel çalıştır
    Promise.all([
      loadUserCards(),
      renderLongestSeries(),
      loadMonthlyCalendar(),
      loadReadingStats()
    ]).catch(err => console.error("İlk paralel yüklemelerde hata:", err));

    // 3️⃣ Daha az öncelikli veya estetik içerikleri (ayet, hadis, alıntı, dua vs.) paralel başlat
    Promise.all([
      fetchRandomQuoteImage(),
      fetchRandomAyet(),
      fetchRandomQuote(),
      fetchRandomHadis(),
      fetchRandomDua()
    ]).catch(err => console.error("Rastgele içerik yüklemede hata:", err));

    // 4️⃣ Medya, makale ve yönetici listesi gibi en sona kalanlar
    Promise.all([
      initializeVideos(),
      (typeof ArticlesManager !== 'undefined'
        ? (window.articlesManager = new ArticlesManager(), Promise.resolve())
        : Promise.resolve()),
      (LocalStorageManager.isAdmin() ? renderUserList() : Promise.resolve()),
      logPageVisit()
    ]).catch(err => console.error("Son yükleme grubunda hata:", err));

  } catch (error) {
    console.error('Sayfa yüklenirken hata oluştu:', error);
  }
});

// Grup değişikliğinde title'ı güncelle
window.addEventListener('popstate', function() {
  updatePageTitle();
});

// Private grup erişimi için modal açıldığını belirten flag
window.isPrivateGroupAccessModal = false;



// ============================================================================
// YARDIMCI FONKSİYONLAR
// ============================================================================

// Eğer firstDayOfWeek değişkeni yoksa, localStorage'dan oku veya varsayılanı belirle
if (typeof window.firstDayOfWeek === 'undefined') {
  const savedFirstDay = localStorage.getItem('firstDayOfWeek');
  if (savedFirstDay !== null && savedFirstDay !== 'default') {
    window.firstDayOfWeek = parseInt(savedFirstDay);
  } else {
    window.firstDayOfWeek = 'default'; // Varsayılan seçenek
    localStorage.setItem('firstDayOfWeek', 'default');
  }
}

// Yetkisiz erişim kontrolü
async function logUnauthorizedAccess(action) {
  if (localStorage.getItem('cookieConsent') !== 'accepted') {
    return;
  }

  // userName kontrolü
  const userName = localStorage.getItem('userName');
  if (!userName) {
    return;
  }

  // Ad blocker veya güvenlik yazılımı kontrolü
  if (typeof fetch === 'undefined') {
    return;
  }

  try {
    const deviceInfo = {
      userAgent: navigator.userAgent,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
    };

    const response = await fetch('/api/log-unauthorized', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        action, 
        deviceInfo,
        groupId: getGroupIdFromUrl(),
        userName: userName
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
  } catch (error) {
    // Sadece gerçek hataları logla, ad blocker'ları sessizce geç
    if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
    } else {
      console.error('Error logging unauthorized access:', error);
      // Recursive call'u kaldırdık çünkü sonsuz döngüye sebep olabilir
    }
  }
}

// Sayfa ziyaretleri kontrolü
async function logPageVisit() {
  if (localStorage.getItem('cookieConsent') !== 'accepted') {
    return;
  }

  // userName kontrolü
  const userName = localStorage.getItem('userName');
  if (!userName) {
    return;
  }
  
  // Ad blocker veya güvenlik yazılımı kontrolü
  if (typeof fetch === 'undefined') {
    return;
  }
  
  try {
    const deviceInfo = {
      userAgent: navigator.userAgent,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
    };

    const response = await fetch('/api/log-visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        deviceInfo,
        groupId: getGroupIdFromUrl(),
        userName: userName
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
  } catch (error) {
    // Sadece gerçek hataları logla, ad blocker'ları sessizce geç
    if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
    } else {
      console.error('Error logging page visit:', error);
    }
  }
}

// Kullanıcı adı doğrulama
async function verifyUserUsername() {
  const userInfo = LocalStorageManager.getCurrentUserInfo();
  
  if (!userInfo) {
    return false;
  }

  const { groupId, userId, userAuthority, userName } = userInfo;

  try {
    if (userAuthority === 'admin') {
      const response = await fetch('/api/verify-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: userName, groupId: groupId })
      });

      const data = await response.json();
      if (!data.valid) {
        LocalStorageManager.logoutUser();
        hideAdminElements();
        const mainArea = document.querySelector('.main-area');
        if (mainArea) mainArea.style.display = 'none';
        return false;
      }
    } else if (userAuthority === 'member') {
      const response = await fetch(`/api/group/${groupId}`);
      if (!response.ok) {
        LocalStorageManager.logoutUser();
        hideAdminElements();
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('User verification error:', error);
    return false;
  }
}

// Yukarı Çık Butonu Fonksiyonalitesi
document.addEventListener('DOMContentLoaded', function() {
  const scrollToTopBtn = document.getElementById('scrollToTopBtn');
  
  if (scrollToTopBtn) {
    let lastScrollPosition = 0;
    let scrollTimeout = null;
    
    // Sayfa kaydırma olayını dinle (throttled)
    window.addEventListener('scroll', function() {
      // Throttle: Her 100ms'de bir çalış
      if (scrollTimeout) {
        return;
      }
      
      scrollTimeout = setTimeout(() => {
        const scrollPosition = window.pageYOffset;
        const documentHeight = document.documentElement.scrollHeight;
        const windowHeight = window.innerHeight;
        const distanceFromBottom = documentHeight - (scrollPosition + windowHeight);
        
        // Admin butonları ve scroll to top butonunu kontrol et
        const adminIndicator = document.querySelector('.admin-indicator');
        const scrollToMainButton = document.querySelector('.scroll-to-main-button');
        const quotesButton = document.querySelector('.quotes-button');
        const videosButton = document.querySelector('.videos-button');
        const articlesButton = document.querySelector('.articles-button');
        
        // Sayfanın sonuna 300px kala butonları gizle
        if (distanceFromBottom < 300) {
          // Butonları gizle
          if (adminIndicator && adminIndicator.classList.contains('show')) {
            adminIndicator.classList.add('hidden');
            adminIndicator.classList.remove('show');
          }
          if (scrollToMainButton && scrollToMainButton.classList.contains('show')) {
            scrollToMainButton.classList.add('hidden');
            scrollToMainButton.classList.remove('show');
          }
          if (quotesButton && quotesButton.classList.contains('show')) {
            quotesButton.classList.add('hidden');
            quotesButton.classList.remove('show');
          }
          if (videosButton && videosButton.classList.contains('show')) {
            videosButton.classList.add('hidden');
            videosButton.classList.remove('show');
          }
          if (articlesButton && articlesButton.classList.contains('show')) {
            articlesButton.classList.add('hidden');
            articlesButton.classList.remove('show');
          }
          if (!scrollToTopBtn.classList.contains('hidden')) {
            scrollToTopBtn.classList.add('hidden');
            scrollToTopBtn.classList.remove('show');
          }
        } else {
          // Butonları göster (sadece giriş yapılmış kullanıcılar için admin butonları)
          const isLoggedIn = LocalStorageManager.isUserLoggedIn();
          const userInfo = isLoggedIn ? LocalStorageManager.getCurrentUserInfo() : null;
          
          // Önce scrollToMainButton'ı kontrol et (admin-indicator pozisyonunu etkiler)
          if (scrollToMainButton) {
            if (isLoggedIn && userInfo && userInfo.userAuthority === 'admin') {
              if (!scrollToMainButton.classList.contains('show')) {
                scrollToMainButton.classList.remove('hidden');
                scrollToMainButton.classList.add('show');
              }
            } else {
              if (!scrollToMainButton.classList.contains('hidden')) {
                scrollToMainButton.classList.add('hidden');
                scrollToMainButton.classList.remove('show');
              }
            }
          }
          // Sonra adminIndicator'ı kontrol et (scrollToMainButton durumuna göre pozisyon ayarlanır)
          if (adminIndicator) {
            if (isLoggedIn) {
              if (!adminIndicator.classList.contains('show')) {
                adminIndicator.classList.remove('hidden');
                adminIndicator.classList.add('show');
              }
            } else {
              if (!adminIndicator.classList.contains('hidden')) {
                adminIndicator.classList.add('hidden');
                adminIndicator.classList.remove('show');
              }
            }
          }
          if (quotesButton && !quotesButton.classList.contains('show')) {
            quotesButton.classList.remove('hidden');
            quotesButton.classList.add('show');
          }
          if (videosButton && !videosButton.classList.contains('show')) {
            videosButton.classList.remove('hidden');
            videosButton.classList.add('show');
          }
          if (articlesButton && !articlesButton.classList.contains('show')) {
            articlesButton.classList.remove('hidden');
            articlesButton.classList.add('show');
          }
          
          // Scroll to top butonunu orijinal mantıkla yönet
          if (scrollPosition > 1000) {
            if (!scrollToTopBtn.classList.contains('show')) {
              scrollToTopBtn.classList.add('show');
              scrollToTopBtn.classList.remove('hidden');
            }
          } else {
            if (!scrollToTopBtn.classList.contains('hidden')) {
              scrollToTopBtn.classList.remove('show');
              scrollToTopBtn.classList.add('hidden');
            }
          }
        }
        
        lastScrollPosition = scrollPosition;
        scrollTimeout = null;
      }, 500);
    });
    
    // Butona tıklandığında sayfanın en üstüne git
    scrollToTopBtn.addEventListener('click', function() {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }
});