// ============================================================================
// 1. KONFIGÜRASYON VE BAĞLANTILAR
// ============================================================================

const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os'); // Added OS module
const moment = require('moment');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const CleanCSS = require('clean-css');
const { minify } = require('terser');
require('dotenv').config();
const schedule = require('node-schedule');
const https = require('https');
const { Dropbox } = require('dropbox');
const sharp = require('sharp');
const bcrypt = require('bcrypt');
const compression = require('compression');
const { doldurAnket, scheduleAnketJob } = require('./anketService');

// Hash fonksiyonu
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 32bit integer'a çevir
  }
  return hash;
}
const app = express();
const port = process.env.PORT || 3000;

// Dosya varlık kontrolü
function fileExists(filePath) {
  return fs.existsSync(filePath);
}

// Otomatik minify fonksiyonu
async function generateMinifiedFiles() {
  const publicPath = path.join(__dirname, 'public');

  // Index.html için CSS ve JS dosyaları
  const indexCssFiles = ['index.css'];
  const indexJsFiles = ['index.js'];

  // Groups.html için CSS dosyaları - öncelik sırasına göre
  const groupsCssFiles = [
    'style.css',
    'tracker-table.css',
    'user-cards.css',
    'admin-modal.css',
    "daily-gift.css",
    'quote.css',
    'stats-section.css',
    'longest-series.css',
    'monthly.css',
    'videos.css',
    'main-area.css',
    'preferences.css',
    'articles.css',
    'footer.css',
    'profile-modal.css',
    'cookies.css',
    'share-modal.css'
  ];


  const groupsJsFiles = [
    'script.js',
    'admin-modal.js',
    'reading-edit-mode.js',
    'tracker-table.js',
    'user-cards.js',
    'daily-gift.js',
    'longest-series.js',
    'stats-section.js',
    'monthly.js',
    'quete.js',
    'videos.js',
    'main-area.js',
    'preferences.js',
    'articles.js',
    'share-quote.js',
    'share-utils.js',
    'cookies.js',
  ];

  const validIndexCssFiles = indexCssFiles
    .map(f => path.join(publicPath, f))
    .filter(fileExists);

  const validIndexJsFiles = indexJsFiles
    .map(f => path.join(publicPath, f))
    .filter(fileExists);

  const validGroupsCssFiles = groupsCssFiles
    .map(f => path.join(publicPath, f))
    .filter(fileExists);

  const validGroupsJsFiles = groupsJsFiles
    .map(f => path.join(publicPath, f))
    .filter(fileExists);

  try {
    const cleanCssInstance = new CleanCSS();

    // Index.html için minify
    if (validIndexCssFiles.length > 0) {
      const indexCssContent = validIndexCssFiles
        .map(file => fs.readFileSync(file, 'utf8'))
        .join('\n');
      const minifiedCss = cleanCssInstance.minify(indexCssContent);
      if (minifiedCss.errors.length > 0) {
        console.warn('⚠️ CSS minification warnings:', minifiedCss.errors);
      }
      fs.writeFileSync(path.join(publicPath, 'index.min.css'), minifiedCss.styles);
    }

    if (validIndexJsFiles.length > 0) {
      // Terser API kullanarak minify
      const indexJsContent = validIndexJsFiles
        .map(file => fs.readFileSync(file, 'utf8'))
        .join('\n');
      const minifiedJs = await minify(indexJsContent, {
        compress: true,
        mangle: true
      });
      fs.writeFileSync(path.join(publicPath, 'index.min.js'), minifiedJs.code);
    }

    // Groups.html için minify
    if (validGroupsCssFiles.length > 0) {
      const groupsCssContent = validGroupsCssFiles
        .map(file => fs.readFileSync(file, 'utf8'))
        .join('\n');
      const minifiedCss = cleanCssInstance.minify(groupsCssContent);
      if (minifiedCss.errors.length > 0) {
        console.warn('⚠️ CSS minification warnings:', minifiedCss.errors);
      }
      fs.writeFileSync(path.join(publicPath, 'groups.min.css'), minifiedCss.styles);
    }

    if (validGroupsJsFiles.length > 0) {
      // Terser API kullanarak minify
      const groupsJsContent = validGroupsJsFiles
        .map(file => fs.readFileSync(file, 'utf8'))
        .join('\n');
      const minifiedJs = await minify(groupsJsContent, {
        compress: true,
        mangle: true
      });
      fs.writeFileSync(path.join(publicPath, 'groups.min.js'), minifiedJs.code);
    }

    console.log('🎉 All minify operations completed successfully');
  } catch (err) {
    console.error('❌ Minify error:', err.message);
    console.log('⚠️ Minify hatası olsa bile uygulama çalışmaya devam edecek');
  }
}

// Giriş serisi hesaplama fonksiyonu
async function handleLoginStreak(user, groupId) {
  const today = moment().utcOffset(3).format("YYYY-MM-DD");
  const yesterday = moment().utcOffset(3).subtract(1, "days").format("YYYY-MM-DD");

  // Mevcut seri değerini al
  const currentStreak = user.loginStreak || 0;
  let streakIncreased = false;
  let newStreak = currentStreak;

  // En son girişi bugünse: hiçbir şey yapma (aynı gün içinde tekrar girmiştir)
  if (user.lastLoginDate === today) {
    // Aynı gün içinde tekrar giriş — değişiklik yok
    return { user, streakIncreased: false };
  }
  // Dün de girmişse: seriyi artır
  else if (user.lastLoginDate === yesterday) {
    newStreak = currentStreak + 1;
    streakIncreased = true;
  }
  // Arada gün(ler) varsa veya ilk giriş: sıfırla
  else {
    newStreak = 1;
    streakIncreased = false;
  }

  // Veritabanını güncelle (lean kullanıldığı için findByIdAndUpdate kullanıyoruz)
  const { users } = getGroupCollections(groupId);
  const updatedUser = await users.findByIdAndUpdate(
    user._id,
    {
      loginStreak: newStreak,
      lastLoginDate: today
    },
    { returnDocument: 'after' }
  );

  // Güncellenmiş user objesini döndür
  const resultUser = updatedUser || { ...user, loginStreak: newStreak, lastLoginDate: today };
  return { user: resultUser, streakIncreased };
}

// Middleware'ler
// Gzip sıkıştırma (compression)
app.use(compression());
// Statik dosyalar önbellek yönetimi:
// Kod dosyaları (.html, .js, .css, .json) için ETag revalidasyonu (no-cache, must-revalidate)
// Görsel ve medya dosyaları için performans önbelleği (3 gün)
function createStaticOptions(isMedia = false) {
  return {
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      if (!isMedia && (ext === '.html' || ext === '.js' || ext === '.css' || ext === '.json' || ext === '')) {
        // Kod dosyaları: Tarayıcı her girişte sunucudan ETag kontrolü yapsın (değişmediyse 304, değiştiyse 200 döner)
        res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate');
      } else if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp' || ext === '.gif' || ext === '.svg' || ext === '.ico' || ext === '.woff' || ext === '.woff2' || ext === '.ttf') {
        // Görseller ve medya dosyaları için performans önbelleği (3 gün)
        res.setHeader('Cache-Control', 'public, max-age=259200');
      } else {
        res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate');
      }
    }
  };
}

app.use(express.static(path.join(__dirname, 'public'), createStaticOptions(false)));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads'), createStaticOptions(true)));
app.use('/images', express.static(path.join(__dirname, 'public/images'), createStaticOptions(true)));
app.use('/groupAvatars', express.static(path.join(__dirname, 'public/groupAvatars'), createStaticOptions(true)));
app.use('/groupImages', express.static(path.join(__dirname, 'public/groupImages'), createStaticOptions(true)));
app.use('/userAvatars', express.static(path.join(__dirname, 'public/userAvatars'), createStaticOptions(true)));
app.use('/quotes', express.static(path.join(__dirname, 'public/quotes'), createStaticOptions(true)));
app.use(express.json());

// HTML yanıtları için strictly revalidate başlığı ekleyen yardımcı fonksiyon
function sendHtmlFile(res, fileName) {
  res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', fileName));
}

// Ana sayfa route'u
app.get('/', (req, res) => {
  sendHtmlFile(res, 'index.html');
});

// Frontend için gerekli ortam değişkenlerini JS olarak servis et
app.get('/env.js', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate');
  res.type('application/javascript');
  const appId = process.env.ONESIGNAL_APP_ID || '';
  res.send(`window.ONESIGNAL_APP_ID = ${JSON.stringify(appId)};`);
});

app.get('/groupid=:groupId', (req, res) => {
  sendHtmlFile(res, 'groups.html');
});

// Grup sayfası / geriye uyumluluk (Express 5: rota içinde regex parantezi yok)
const GROUP_ID_PATTERN = /^[a-zA-Z0-9_\-çğıöşüÇĞIİÖŞÜ]+$/;
app.get('/:groupId', (req, res) => {
  const groupId = req.params.groupId;
  // Only serve groups.html if it's not an API route or static file
  if (GROUP_ID_PATTERN.test(groupId) && !groupId.startsWith('api') && !groupId.includes('.')) {
    sendHtmlFile(res, 'groups.html');
  } else {
    res.status(404).send('Not found');
  }
});

// MongoDB bağlantı seçenekleri
const mongooseOptions = {
  dbName: process.env.DB_NAME,
  serverSelectionTimeoutMS: 5000, // Sunucu seçim zaman aşımı
  socketTimeoutMS: 45000, // Soket zaman aşımı
  connectTimeoutMS: 10000, // Bağlantı zaman aşımı
  maxPoolSize: 10, // Maksimum bağlantı havuzu boyutu
  minPoolSize: 5, // Minimum bağlantı havuzu boyutu
  retryWrites: true, // Yazma işlemlerini yeniden dene
  retryReads: true, // Okuma işlemlerini yeniden dene
};

// MongoDB bağlantısı
mongoose.connect(process.env.MONGO_URI, mongooseOptions)
  .then(() => {
    console.log('MongoDB bağlantısı başarılı');
  })
  .catch((err) => {
    console.error('MongoDB bağlantı hatası:', err);
  });

mongoose.connection.on('error', (err) => {
  console.error('MongoDB bağlantı hatası:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB bağlantısı kesildi');
});

// Uygulama kapatıldığında bağlantıyı kapat
process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    console.log('MongoDB bağlantısı kapatıldı');
    process.exit(0);
  } catch (err) {
    console.error('MongoDB bağlantısı kapatılırken hata:', err);
    process.exit(1);
  }
});


// ============================================================================
// 2. YARDIMCI FONKSİYONLAR
// ============================================================================

// Dropbox konfigürasyonu - OAuth2 ile
let dbx;
let currentAccessToken = null;
let tokenExpiry = null;

// Dropbox token yenileme fonksiyonu
async function refreshDropboxToken() {
  try {
    const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.DROPBOX_APP_KEY}:${process.env.DROPBOX_APP_SECRET}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: process.env.DROPBOX_REFRESH_TOKEN
      })
    });

    if (!response.ok) {
      throw new Error(`Token yenileme hatası: ${response.status}`);
    }

    const data = await response.json();
    currentAccessToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in * 1000);

    // Dropbox instance'ını güncelle
    dbx = new Dropbox({
      accessToken: currentAccessToken
    });

    console.log('✅ Dropbox token başarıyla yenilendi');
    return true;
  } catch (error) {
    console.error('❌ Dropbox token yenileme hatası:', error);
    return false;
  }
}

// Dropbox instance'ını başlat
async function initializeDropbox() {
  if (process.env.DROPBOX_REFRESH_TOKEN) {
    await refreshDropboxToken();
  } else {
    console.log('⚠️ DROPBOX_REFRESH_TOKEN bulunamadı, Dropbox devre dışı');
  }
}

// Dropbox token durumu kontrolü
async function checkDropboxToken() {
  try {
    // Token süresi kontrolü
    if (!currentAccessToken || (tokenExpiry && Date.now() >= tokenExpiry)) {
      console.log('🔄 Dropbox token süresi dolmuş, yenileniyor...');
      const refreshed = await refreshDropboxToken();
      if (!refreshed) {
        return { valid: false, error: 'Token yenileme başarısız' };
      }
    }

    if (!dbx) {
      return { valid: false, error: 'Dropbox başlatılmamış' };
    }

    await dbx.usersGetCurrentAccount();
    return { valid: true, error: null };
  } catch (error) {
    if (error.status === 401) {
      // Token yenileme dene
      console.log('🔄 401 hatası, token yenileniyor...');
      const refreshed = await refreshDropboxToken();
      if (refreshed) {
        try {
          await dbx.usersGetCurrentAccount();
          return { valid: true, error: null };
        } catch (retryError) {
          return { valid: false, error: 'Token yenileme sonrası hata' };
        }
      }
      return { valid: false, error: 'Token süresi dolmuş ve yenilenemedi' };
    } else if (error.status === 403) {
      return { valid: false, error: 'Yetki hatası' };
    } else {
      return { valid: false, error: 'Bağlantı hatası' };
    }
  }
}

// Türkçe karakterleri normalize et
function normalizeFileName(fileName) {
  return fileName
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ş/g, 'S')
    .replace(/İ/g, 'I')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C')
    .replace(/\s+/g, '-') // Boşlukları tire ile değiştir
    .replace(/[^a-zA-Z0-9\-\.]/g, '-'); // Özel karakterleri tire ile değiştir
}

/** Dropbox dosya adı parçaları (Türkçe vb. normalizeFileName ile latin + tire) */
function slugSegment(str, maxLen) {
  const normalized = normalizeFileName(String(str == null ? '' : str).trim());
  const flat = normalized.replace(/\./g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const sliced = (flat || 'x').slice(0, maxLen);
  return sliced || 'x';
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shortUniqSuffix() {
  return `${String(Date.now()).slice(-5)}${Math.random().toString(36).slice(2, 5)}`;
}

/**
 * Dropbox'ta okunabilir dosya adı: prefix + grup adı + grup id + kullanıcı etiketi + tarih + kaynak + benzersiz + uzantı
 * (Aynı gün çoklu yükleme için kısa benzersiz sonek tutulur.)
 */
function buildDropboxImageFileName({ prefix, groupName, groupId, userLabel, sourceBase, ext }) {
  const p = slugSegment(prefix, 18);
  const gName = slugSegment(groupName, 26);
  const gid = slugSegment(groupId, 22);
  const u = slugSegment(userLabel, 22);
  const base = slugSegment(sourceBase, 18);
  const dateStr = todayYmd();
  const uniq = shortUniqSuffix();
  const e = String(ext || '.webp').toLowerCase();
  const extNorm = e.startsWith('.') ? e : `.${e}`;
  return normalizeFileName(`${p}-${gName}-${gid}-${u}-${dateStr}-${base}-${uniq}${extNorm}`);
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Windows / OneDrive / antivirüs kilitlerine karşı güvenli silme */
async function unlinkWithRetry(filePath, { maxAttempts = 15, delayMs = 60 } = {}) {
  if (!filePath) return false;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      if (!fs.existsSync(filePath)) return true;
      await fs.promises.unlink(filePath);
      return true;
    } catch {
      await delay(delayMs);
    }
  }
  console.log('⚠️ Dosya silinemedi (deneme aşıldı):', filePath);
  return false;
}

// WebP dönüştürme fonksiyonu (giriş dosyasını bellekten oku — sharp giriş kilidini bırakır)
async function convertToWebP(inputPath, outputPath) {
  try {
    const buf = await fs.promises.readFile(inputPath);
    await sharp(buf)
      .webp({
        quality: 80, // Kalite (0-100)
        effort: 4    // Sıkıştırma seviyesi (0-6)
      })
      .toFile(outputPath);

    console.log(`✅ Resim WebP formatına dönüştürüldü: ${outputPath}`);
    return true;
  } catch (error) {
    console.error('❌ WebP dönüştürme hatası:', error);
    return false;
  }
}

// Grup ID'si oluşturma yardımcı fonksiyonu
function generateGroupId(groupName) {
  // Türkçe karakterleri değiştir
  const turkishChars = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'Ç': 'C', 'Ğ': 'G', 'İ': 'I', 'Ö': 'O', 'Ş': 'S', 'Ü': 'U' };

  // Boşlukları kaldır, küçük harfe çevir ve Türkçe karakterleri değiştir
  let id = groupName.toLowerCase();

  // Türkçe karakterleri değiştir
  for (const [turkishChar, latinChar] of Object.entries(turkishChars)) {
    id = id.replace(new RegExp(turkishChar, 'g'), latinChar);
  }

  // Sadece alfanumerik karakterleri ve boşlukları tut
  id = id.replace(/[^a-z0-9\s]/g, '');

  // Boşlukları tire ile değiştir ve birden fazla tireyi tek tireye indir
  id = id.replace(/\s+/g, '-').replace(/-+/g, '-');

  // Başındaki ve sonundaki tireleri kaldır
  id = id.replace(/^-+|-+$/g, '');

  return id;
}

// Video API Konfigürasyon endpoint'i
app.get('/api/config', (req, res) => {
  res.json({
    youtubeApiKey: process.env.YOUTUBE_API_KEY || 'YOUR_DEFAULT_API_KEY'
  });
});

// Articles API endpoint
app.get('/api/articles', async (req, res) => {
  try {
    // Bağlantı hazır mı kontrol et; değilse kısa bir süre bekle
    if (!mongoose.connection.db || mongoose.connection.readyState !== 1) {
      try {
        await new Promise((resolve, reject) => {
          if (mongoose.connection.readyState === 1) return resolve();
          const onConnected = () => {
            cleanup();
            resolve();
          };
          const onError = (err) => {
            cleanup();
            reject(err);
          };
          const onTimeout = () => {
            cleanup();
            reject(new Error('DB not ready in time'));
          };
          const cleanup = () => {
            clearTimeout(timeoutId);
            mongoose.connection.off('connected', onConnected);
            mongoose.connection.off('error', onError);
          };
          mongoose.connection.once('connected', onConnected);
          mongoose.connection.once('error', onError);
          const timeoutId = setTimeout(onTimeout, 3000);
        });
      } catch (waitErr) {
        return res.status(503).json({ success: false, message: 'Veritabanı hazır değil, lütfen tekrar deneyin.' });
      }
    }

    const db = mongoose.connection.db;
    if (!db) {
      return res.status(503).json({ success: false, message: 'Veritabanı bağlantısı kurulamadı' });
    }

    const articlesCollection = db.collection('articles');

    // Tüm makaleleri getir
    const articles = await articlesCollection.find({}).toArray();

    // Kategorileri çıkar
    const categories = [...new Set(articles.map(article => article.category))];

    res.json({
      success: true,
      articles: articles,
      categories: categories
    });
  } catch (error) {
    console.error('Makaleler yüklenirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Makaleler yüklenemedi'
    });
  }
});

// Dropbox upload fonksiyonları
async function uploadToDropbox(fileBuffer, fileName, folder) {
  try {
    // Dosya adını normalize et
    const normalizedFileName = normalizeFileName(fileName);

    const dropboxPath = `/${folder}/${normalizedFileName}`;
    const response = await dbx.filesUpload({
      path: dropboxPath,
      contents: fileBuffer,
      mode: 'overwrite'
    });

    // Paylaşılabilir link oluştur
    const shareResponse = await dbx.sharingCreateSharedLinkWithSettings({
      path: dropboxPath,
      settings: {
        requested_visibility: 'public'
      }
    });

    // URL'yi parse et ve dl parametresini 1 yap
    const url = new URL(shareResponse.result.url);
    url.searchParams.set('dl', '1');
    return url.toString();
  } catch (error) {
    console.error('Dropbox upload hatası:', error);
    throw error;
  }
}

function isRetryableDropboxUploadError(err) {
  if (!err) return false;
  const code = err.code || err.errno;
  if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'ENOTFOUND' || code === 'ECONNREFUSED') {
    return true;
  }
  const msg = String(err.message || '').toLowerCase();
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('etimedout')) {
    return true;
  }
  if (err.type === 'system' && String(err.code || '').toUpperCase().includes('TIME')) {
    return true;
  }
  return false;
}

/** Ağ geçici hatalarında Dropbox yüklemesini birkaç kez dene */
async function uploadToDropboxWithRetry(fileBuffer, fileName, folder, options = {}) {
  const maxAttempts = options.maxAttempts != null ? options.maxAttempts : 4;
  const baseDelayMs = options.baseDelayMs != null ? options.baseDelayMs : 900;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await uploadToDropbox(fileBuffer, fileName, folder);
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts || !isRetryableDropboxUploadError(err)) {
        throw err;
      }
      await delay(baseDelayMs * attempt);
    }
  }
  throw lastErr;
}

async function deleteFromDropbox(fileName, folder) {
  try {
    const dropboxPath = `/${folder}/${fileName}`;
    await dbx.filesDeleteV2({
      path: dropboxPath
    });
  } catch (error) {
    console.error('Dropbox delete hatası:', error);
    // Dosya bulunamadıysa hata verme
    if (error.status !== 409) {
      throw error;
    }
  }
}

// URL'den Dropbox dosyasını sil
async function deleteFromDropboxByUrl(fileUrl) {
  try {
    // URL'den dosya adını ayıkla
    const url = new URL(fileUrl);
    const pathParts = url.pathname.split('/');
    const fileName = pathParts[pathParts.length - 1]; // Son parça dosya adı


    // userImages klasöründeki tüm dosyaları listele
    const listResponse = await dbx.filesListFolder({ path: '/userImages' });

    // Dosya adını Dropbox'taki gerçek adıyla eşleştir
    const exactFile = listResponse.result.entries.find(f => {
      // Önce tam eşleşme dene
      if (f.name === fileName) return true;

      // Timestamp kısmını karşılaştır (eski dosyalar için)
      const dbTimestamp = f.name.split('-')[0];
      const urlTimestamp = fileName.split('-')[0];
      return dbTimestamp === urlTimestamp;
    });

    if (!exactFile) {
      console.log(`❌ Dosya bulunamadı: ${fileName}`);
      return;
    }

    // Silinecek dosyanın yolu (Dropbox'taki gerçek adıyla)
    const filePath = `/userImages/${exactFile.name}`;

    // Dropbox'tan sil
    await dbx.filesDeleteV2({ path: filePath });
  } catch (error) {
    console.error('Hata detayı:', error.error);
  }
}

function isDropboxHostedUrl(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string') return false;
  return fileUrl.includes('dropbox.com') || fileUrl.includes('dropboxusercontent.com');
}

// URL'den grup resmini Dropbox'tan sil
async function deleteGroupImageFromDropboxByUrl(fileUrl) {
  try {
    // Sadece Dropbox linklerinde silme yap
    if (!isDropboxHostedUrl(fileUrl)) {
      return; // Local veya başka bir kaynak: Dropbox'tan silme
    }

    // Paylaşımlı Dropbox URL'sinden dosya adını çıkar
    // Örn: https://www.dropbox.com/scl/fi/.../group-123.webp?rlkey=...&dl=0
    const url = new URL(fileUrl);
    const pathname = url.pathname || '';
    const rawFileName = pathname.split('/').pop();
    const fileName = rawFileName ? decodeURIComponent(rawFileName) : '';
    if (!fileName) return;

    // groupImages klasöründeki gerçek dosya adını bul (normalizasyon/encoding farklarına dayanıklı)
    const listResponse = await dbx.filesListFolder({ path: '/groupImages' });
    const exactFile = listResponse.result.entries.find((f) => {
      if (f.name === fileName) return true;
      const dbTimestamp = String(f.name || '').split('-')[0];
      const urlTimestamp = String(fileName || '').split('-')[0];
      return dbTimestamp && urlTimestamp && dbTimestamp === urlTimestamp;
    });
    if (!exactFile) return;

    const dropboxPath = `/groupImages/${exactFile.name}`;

    // Dropbox'tan sil
    await dbx.filesDeleteV2({ path: dropboxPath });
  } catch (error) {
    // 409 hatası "not_found" demek, dosya zaten silinmiş - bu normal
    if (error.status !== 409) {
      console.error('Dropbox grup resmi silme hatası:', error);
    }
  }
}

// Multer konfigürasyonları
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = 'public/uploads';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Grup resmi yükleme konfigürasyonu
const groupImageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = 'public/groupImages';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    // Rastgele dosya adı oluştur
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'group-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const uploadGroupImage = multer({ storage: groupImageStorage });

// Kullanıcı modeli
const User = mongoose.model('User', {
  name: String,
  profileImage: String
});

// Okuma durumu modeli
const ReadingStatus = mongoose.model('ReadingStatus', {
  userId: String,
  date: String,
  status: String,
  amount: { type: Number, required: false }
});

// Kullanıcı grupları modeli
const UserGroup = mongoose.model('UserGroup', {
  groupName: String,
  groupId: String,
  description: String,
  groupImage: { type: String, default: null },
  visibility: { type: String, default: 'public' },
  autoMarkUnread: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// Davet modeli
const Invite = mongoose.model('Invite', {
  inviteTokenHash: String,
  userId: String,
  groupId: String,
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } // 7 gün sonra
});

// MongoDB index'lerini oluşturma fonksiyonu
async function createIndexesForGroup(groupId) {
  try {
    const db = mongoose.connection.db;

    // Yeni grup için index'leri oluştur
    await db.collection(`readingstatuses_${groupId}`).createIndex({ userId: 1, date: 1 });
    await db.collection(`users_${groupId}`).createIndex({ name: 1 });
    await db.collection(`users_${groupId}`).createIndex({ username: 1 });
    // username ve authority birlikte sorgulanıyor (admin kontrolü için)
    await db.collection(`users_${groupId}`).createIndex({ username: 1, authority: 1 });

    console.log(`Yeni grup için index'ler oluşturuldu: ${groupId}`);
  } catch (error) {
    console.error(`Index oluşturma hatası (${groupId}):`, error);
  }
}

// Dropbox durumu endpoint'i
app.get('/api/dropbox-status', async (req, res) => {
  const tokenStatus = await checkDropboxToken();

  if (tokenStatus.valid) {
    res.json({
      status: 'connected',
      message: 'Dropbox bağlantısı aktif',
      timestamp: Date.now()
    });
  } else {
    let status = 'error';
    let message = 'Dropbox bağlantı hatası';

    if (tokenStatus.error === 'Token süresi dolmuş') {
      status = 'expired';
      message = 'Dropbox access token süresi dolmuş - .env dosyasında DROPBOX_ACCESS_TOKEN güncelleyin';
    } else if (tokenStatus.error === 'Yetki hatası') {
      status = 'forbidden';
      message = 'Dropbox yetki hatası - Token yetkilerini kontrol edin';
    } else {
      status = 'connection_error';
      message = 'Dropbox bağlantı hatası - İnternet bağlantısını kontrol edin';
    }

    res.json({
      status: status,
      message: message,
      timestamp: Date.now()
    });
  }
});

// 3. API ENDPOINT'LERİ
// ============================================================================

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

    res.json({ group });
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
app.post('/api/groups', uploadGroupImage.fields([
  { name: 'groupImage', maxCount: 1 },
  { name: 'adminProfileImage', maxCount: 1 }
]), async (req, res) => {
  try {
    const {
      groupName,
      description,
      adminUserName,
      adminName,
      adminPassword,
      visibility,
      selectedGroupAvatarPath,
      selectedAdminAvatarPath
    } = req.body;

    if (!groupName) {
      return res.status(400).json({ error: 'Grup adı gereklidir' });
    }

    if (!adminUserName || !adminName || !adminPassword) {
      return res.status(400).json({ error: 'Kullanıcı adı, yönetici adı ve şifresi gereklidir' });
    }

    const baseGroupId = generateGroupId(groupName);
    let finalGroupId = baseGroupId;
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
      autoMarkUnread,
      createdAt: new Date()
    });

    await newGroup.save();

    // Varsayılan kullanıcı ekle (admin olarak)
    const { users, readingStatuses } = getGroupCollections(finalGroupId);

    // Admin şifresini hash'le
    const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);

    const defaultUser = new users({
      name: adminUserName,
      profileImage: adminProfileImageUrl,
      username: adminName,
      userpassword: hashedAdminPassword,
      authority: "admin"
    });
    await defaultUser.save();

    // Varsayılan kullanıcının bugünkü okuma durumunu "okudum" olarak kaydet
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const defaultReadingStatus = new readingStatuses({
      userId: defaultUser._id.toString(),
      date: todayStr,
      status: "okudum"
    });
    await defaultReadingStatus.save();

    // Yeni grup için index'leri oluştur
    await createIndexesForGroup(finalGroupId);

    await logSiteActivity({
      action: 'grup_oluşturma',
      req,
      groupId: finalGroupId,
      userName: adminName,
      deviceInfo: req.body?.deviceInfo
    });

    res.status(201).json({ success: true, group: newGroup, userId: defaultUser._id });
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({ error: 'Grup oluşturulurken bir hata oluştu' });
  }
});

// Grup üye sayısını getirme endpoint'i
app.get('/api/groups/:groupId/member-count', async (req, res) => {
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
    const count = await users.countDocuments();

    res.json({ count });
  } catch (error) {
    console.error('Error fetching member count:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Grup ayarlarını güncelleme endpoint'i
app.post('/api/update-group/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { groupName, description, visibility, autoMarkUnread } = req.body;

    // Grup var mı kontrol et
    const group = await UserGroup.findOne({ groupId }).lean();
    if (!group) {
      return res.status(404).json({ error: 'Grup bulunamadı' });
    }

    const updateFields = {
      groupName: groupName || group.groupName,
      description: description || group.description,
      visibility: visibility || group.visibility
    };
    if (autoMarkUnread !== undefined) {
      updateFields.autoMarkUnread = (autoMarkUnread === 'true' || autoMarkUnread === true);
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

// Grup resmini güncelleme endpoint'i
app.post('/api/update-group-image/:groupId', uploadGroupImage.single('groupImage'), async (req, res) => {
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

    // Eski grup resmini Dropbox'tan sil
    if (isDropboxHostedUrl(group.groupImage)) {
      deleteGroupImageFromDropboxByUrl(group.groupImage).catch(err =>
        console.error('Eski grup resmi silme hatası:', err)
      );
    }

    let newImageUrl = null;

    // Yeni resmi işle: WebP'ye dönüştür -> Dropbox'a gönder
    try {
      const originalFileName = req.file.originalname;
      const baseFileName = path.parse(originalFileName).name;

      // 1. Adım: Multer tarafından zaten public/groupImages klasörüne kaydedildi
      const tempPath = req.file.path;

      // 2. Adım: WebP formatına dönüştür
      const webpFileName = `${Date.now()}-${baseFileName}.webp`;
      const webpPath = path.join(__dirname, 'public', 'groupImages', webpFileName);
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
      return res.status(500).json({ error: 'Image upload failed' });
    }

    // Grup resmini güncelle
    const updatedGroup = await UserGroup.findOneAndUpdate(
      { groupId },
      { groupImage: newImageUrl },
      { returnDocument: 'after' }
    );

    res.json({ success: true, imageUrl: newImageUrl, group: updatedGroup });
  } catch (error) {
    console.error('Error updating group image:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Grup resmini kaldırma endpoint'i
app.post('/api/remove-group-image/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;

    // Grup var mı kontrol et
    const group = await UserGroup.findOne({ groupId }).lean();
    if (!group) {
      return res.status(404).json({ error: 'Grup bulunamadı' });
    }

    // Eski grup resmini Dropbox'tan sil
    if (isDropboxHostedUrl(group.groupImage)) {
      deleteGroupImageFromDropboxByUrl(group.groupImage).catch(err =>
        console.error('Grup resmi silme hatası:', err)
      );
    }

    // Grup resmini null yap
    const updatedGroup = await UserGroup.findOneAndUpdate(
      { groupId },
      { groupImage: null },
      { returnDocument: 'after' }
    );

    res.json({ success: true, group: updatedGroup });
  } catch (error) {
    console.error('Error removing group image:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Hazır avatar listesi endpoint'i
app.get('/api/group-avatars', (req, res) => {
  try {
    const avatarDir = path.join(__dirname, 'public', 'groupAvatars');

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
app.post('/api/update-group-image-from-avatar/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { avatarPath } = req.body;

    // Grup var mı kontrol et
    const group = await UserGroup.findOne({ groupId }).lean();
    if (!group) {
      return res.status(404).json({ error: 'Grup bulunamadı' });
    }

    // Eski grup resmini Dropbox'tan sil (sadece Dropbox'ta varsa)
    if (isDropboxHostedUrl(group.groupImage)) {
      deleteGroupImageFromDropboxByUrl(group.groupImage).catch(err =>
        console.error('Eski grup resmi silme hatası:', err)
      );
    }

    // Avatar dosyasının varlığını kontrol et
    const avatarFilePath = path.join(__dirname, 'public', avatarPath);
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

    console.log(`✅ Avatar seçimi: ${newImageUrl} (Dropbox'a yüklenmedi)`);

    res.json({ success: true, imageUrl: newImageUrl, group: updatedGroup });
  } catch (error) {
    console.error('Error updating group image from avatar:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Grup silme endpoint'i
app.delete('/api/delete-group/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    const actorUserName = req.body?.userName || req.query?.userName || null;

    // Grup var mı kontrol et
    const group = await UserGroup.findOne({ groupId }).lean();
    if (!group) {
      return res.status(404).json({ error: 'Grup bulunamadı' });
    }

    // Grup resmini Dropbox'tan sil
    if (isDropboxHostedUrl(group.groupImage)) {
      deleteGroupImageFromDropboxByUrl(group.groupImage).catch(err =>
        console.error('Grup resmi silme hatası:', err)
      );
    }

    // Dinamik koleksiyonları al
    const { users, readingStatuses } = getGroupCollections(groupId);

    // Tüm kullanıcıların profil resimlerini Dropbox'tan sil
    const allUsers = await users.find().lean();
    for (const user of allUsers) {
      if (isDropboxHostedUrl(user.profileImage)) {
        deleteFromDropboxByUrl(user.profileImage).catch(err =>
          console.error('Kullanıcı resmi silme hatası:', err)
        );
      }
    }

    // Grup koleksiyonlarını sil
    await users.deleteMany({});
    await readingStatuses.deleteMany({});

    // Koleksiyonları tamamen sil - MongoDB native yöntemle
    try {
      // Doğrudan database bağlantısı ile koleksiyonları sil
      const db = mongoose.connection.db;

      // Users koleksiyonunu sil
      try {
        await db.collection(`users_${groupId}`).drop();
        console.log(`✅ Users koleksiyonu silindi: users_${groupId}`);
      } catch (dropErr) {
        if (dropErr.code === 26) {
          console.log(`ℹ️ Users koleksiyonu zaten yok: users_${groupId}`);
        } else {
          console.error('❌ Users koleksiyonu silme hatası:', dropErr);
        }
      }

      // ReadingStatuses koleksiyonunu sil
      try {
        await db.collection(`readingstatuses_${groupId}`).drop();
        console.log(`✅ ReadingStatuses koleksiyonu silindi: readingstatuses_${groupId}`);
      } catch (dropErr) {
        if (dropErr.code === 26) {
          console.log(`ℹ️ ReadingStatuses koleksiyonu zaten yok: readingstatuses_${groupId}`);
        } else {
          console.error('❌ ReadingStatuses koleksiyonu silme hatası:', dropErr);
        }
      }

    } catch (error) {
      console.error('❌ Koleksiyon silme genel hatası:', error);
    }

    // Admin kaydı artık users koleksiyonunda, ayrı silmeye gerek yok

    await logSiteActivity({
      action: 'grup_silme',
      req,
      groupId,
      userName: actorUserName,
      deviceInfo: req.body?.deviceInfo
    });

    // Grubu sil
    await UserGroup.findOneAndDelete({ groupId });

    res.json({ success: true, message: 'Grup başarıyla silindi' });
  } catch (error) {
    console.error('Grup silme hatası:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

// Global şemalar
const userSchema = new mongoose.Schema({
  name: String,
  profileImage: String,
  username: String,
  userpassword: String,
  authority: String,
  loginStreak: { type: Number, default: 0 },
  lastLoginDate: { type: String, default: null },
  lastCongratulatedLeague: { type: String, default: 'Bronz' },
  phone: { type: String, default: null }
});

const readingStatusSchema = new mongoose.Schema({
  userId: String,
  date: String,
  status: String,
  amount: { type: Number, required: false }
});

function getGroupCollections(groupId) {
  const userModelName = `users_${groupId}`;
  const readingStatusModelName = `readingstatuses_${groupId}`;

  // Eğer model zaten Mongoose'da varsa, onu kullan
  try {
    const existingUserModel = mongoose.model(userModelName);
    const existingReadingStatusModel = mongoose.model(readingStatusModelName);

    return {
      users: existingUserModel,
      readingStatuses: existingReadingStatusModel
    };
  } catch (error) {
    // Model yoksa oluştur
  }

  // Model'i oluştur
  const userModel = mongoose.model(userModelName, userSchema, userModelName);
  const readingStatusModel = mongoose.model(readingStatusModelName, readingStatusSchema, readingStatusModelName);

  return {
    users: userModel,
    readingStatuses: readingStatusModel
  };
}


// 3.2. KULLANICI YÖNETİMİ
// ============================================================================

// Kullanıcı listesi endpoint'i
app.get('/api/users/:groupId', async (req, res) => {
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
    const usersData = await users.find().sort({ name: 1 }).lean();

    res.json({ users: usersData });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Kullanıcı ekleme endpoint'i
app.post('/api/add-user/:groupId', upload.single('profileImage'), async (req, res) => {
  try {
    const { groupId } = req.params;
    const { name, selectedAvatarPath } = req.body;

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
        // useTempFolder parametresi kontrolü
        const useTempFolder = req.body.useTempFolder === 'true';

        // 1. Adım: Geçici klasöre kaydet (orijinal format)
        const originalFileName = req.file.originalname;
        const normalizedFileName = normalizeFileName(originalFileName);
        const baseFileName = path.parse(normalizedFileName).name;

        const tempFileName = `${Date.now()}-${normalizedFileName}`;
        const tempPath = path.join(__dirname, 'public', 'uploads', tempFileName);
        profileUploadTempPath = tempPath;
        fs.copyFileSync(req.file.path, tempPath);

        // 2. Adım: WebP formatına dönüştür
        const webpFileName = `${Date.now()}-${baseFileName}.webp`;
        const webpPath = path.join(__dirname, 'public', 'uploads', webpFileName);
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

    const plainPassword = name + randomNumber;
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    console.log(`Yeni kullanıcı ekleniyor: ${name}, username: ${username}, plainPassword: ${plainPassword}${attemptCount > 0 ? ` (${attemptCount} deneme sonrası)` : ''}`);

    // Dropbox: yükleme başarılı olmadan kayıt yapma (DB'de /uploads kalmasın)
    if (fileName && !selectedAvatarPath) {
      const localPath = path.join(__dirname, 'public', 'uploads', fileName);
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
    const today = moment().format("YYYY-MM-DD");
    const user = new users({
      name,
      profileImage: profileImageUrl,
      username: username,
      userpassword: hashedPassword,
      authority: "member",
      loginStreak: 1,
      lastLoginDate: today
    });
    await user.save();

    res.json({ success: true, user: user, fileName: fileName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// Kullanıcı silme endpoint'i
app.post('/api/delete-user/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { id } = req.body;

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

    // Toplam kullanıcı sayısını kontrol et
    const totalUserCount = await users.countDocuments();

    // Eğer gruptaki son kullanıcıyı silmeye çalışıyorsa grubu da sil
    if (totalUserCount <= 1) {
      // Önce kullanıcıyı sil
      await users.findByIdAndDelete(id);

      // Kullanıcının okuma durumlarını sil
      await readingStatuses.deleteMany({ userId: id });

      // Kullanıcının profil resmini Dropbox'tan sil (arka planda)
      if (isDropboxHostedUrl(user.profileImage)) {
        deleteFromDropboxByUrl(user.profileImage).catch(err =>
          console.error('Dropbox silme hatası:', err)
        );
      }

      // Grup resmi Dropbox'ta ise onu da sil
      if (isDropboxHostedUrl(group.groupImage)) {
        deleteGroupImageFromDropboxByUrl(group.groupImage).catch(err =>
          console.error('Grup resmi silme hatası:', err)
        );
      }

      // Grubu sil
      await UserGroup.findOneAndDelete({ groupId });

      // Kullanıcıya grup silindiğini bildir
      return res.json({
        success: true,
        groupDeleted: true,
        message: 'Son kullanıcı silindiği için grup da silindi'
      });
    }

    // Kullanıcıyı sil
    await users.findByIdAndDelete(id);

    // Kullanıcıya hemen yanıt ver
    res.json({ success: true });

    // Arka planda temizlik işlemleri
    if (user) {
      // Kullanıcının okuma durumlarını sil
      await readingStatuses.deleteMany({ userId: id });

      // Kullanıcının profil resmini Dropbox'tan sil (arka planda)
      if (isDropboxHostedUrl(user.profileImage)) {
        deleteFromDropboxByUrl(user.profileImage).catch(err =>
          console.error('Dropbox silme hatası:', err)
        );
      }
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// Kullanıcı ismi güncelleme endpoint'i
app.post('/api/update-user/:groupId', async (req, res) => {
  const { groupId } = req.params;
  const { userId, name } = req.body;

  try {
    // Parametreleri kontrol et
    if (!userId || !name) {
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

    res.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Kullanıcı güncellenirken hata oluştu' });
  }
});

// Telefon numarası temizleme/biçimlendirme yardımcı fonksiyonu (905312967580 formatı)
function formatPhoneNumber(phoneStr) {
  if (!phoneStr) return '';
  let digits = String(phoneStr).replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('0090')) {
    digits = digits.substring(2);
  } else if (digits.startsWith('0') && digits.length === 11) {
    digits = '90' + digits.substring(1);
  } else if (digits.length === 10 && digits.startsWith('5')) {
    digits = '90' + digits;
  }
  return digits;
}

// Kullanıcı telefon numarası güncelleme endpoint'i
app.post('/api/update-user-phone/:groupId', async (req, res) => {
  const { groupId } = req.params;
  const { userId, phone } = req.body;

  try {
    if (!userId) {
      return res.status(400).json({ error: 'userId parametresi gerekli' });
    }

    const group = await UserGroup.findOne({ groupId }).lean();
    if (!group) {
      return res.status(404).json({ error: 'Grup bulunamadı' });
    }

    const { users } = getGroupCollections(groupId);
    const formattedPhone = formatPhoneNumber(phone);

    const updatedUser = await users.findByIdAndUpdate(
      userId,
      { phone: formattedPhone },
      { returnDocument: 'after' }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }

    res.json({
      success: true,
      user: updatedUser,
      formattedPhone: formattedPhone,
      message: 'Telefon numarası başarıyla güncellendi'
    });
  } catch (error) {
    console.error('Error updating user phone:', error);
    res.status(500).json({ error: 'Kullanıcı telefon numarası güncellenirken hata oluştu' });
  }
});

// Kullanıcı yetkisi güncelleme endpoint'i
app.post('/api/update-user-authority/:groupId', async (req, res) => {
  const { groupId } = req.params;
  const { userId, authority } = req.body;

  try {
    // Parametreleri kontrol et
    if (!userId || !authority) {
      return res.status(400).json({ error: 'userId ve authority parametreleri gerekli' });
    }

    // Yetki değerini kontrol et
    if (!['admin', 'member'].includes(authority)) {
      return res.status(400).json({ error: 'Geçersiz yetki değeri. Sadece admin veya member olabilir' });
    }

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

    // Admin sayısını kontrol et
    const adminCount = await users.countDocuments({ authority: 'admin' });

    // Eğer son admin'i üye yapmaya çalışıyorsa engelle
    if (user.authority === 'admin' && authority === 'member' && adminCount <= 1) {
      return res.status(400).json({ error: 'En az bir yönetici hesabı bulunmalıdır!' });
    }

    // Kullanıcıyı güncelle
    const updatedUser = await users.findByIdAndUpdate(
      userId,
      { authority: authority },
      { returnDocument: 'after' }
    );

    res.json({
      success: true,
      user: updatedUser,
      message: `Kullanıcı yetkisi ${authority === 'admin' ? 'Yönetici' : 'Üye'} olarak güncellendi`
    });
  } catch (error) {
    console.error('Error updating user authority:', error);
    res.status(500).json({ error: 'Kullanıcı yetkisi güncellenirken hata oluştu' });
  }
});

// Kullanıcı resmi güncelleme endpoint'i
app.post('/api/update-user-image/:groupId', upload.single('profileImage'), async (req, res) => {
  const { groupId } = req.params;
  const { userId } = req.body;

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
      const oldImageUrl = user ? user.profileImage : null;

      // 1. Adım: Geçici klasöre kaydet (orijinal format)
      const originalFileName = req.file.originalname;
      const normalizedFileName = normalizeFileName(originalFileName);
      const baseFileName = path.parse(normalizedFileName).name;

      const tempFileName = `${Date.now()}-${normalizedFileName}`;
      const tempPath = path.join(__dirname, 'public', 'uploads', tempFileName);
      fs.copyFileSync(req.file.path, tempPath);

      // 2. Adım: WebP formatına dönüştür
      const webpFileName = `${Date.now()}-${baseFileName}.webp`;
      const webpPath = path.join(__dirname, 'public', 'uploads', webpFileName);
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

      const localPath = path.join(__dirname, 'public', 'uploads', fileName);
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

      await users.findByIdAndUpdate(userId, { profileImage: newImageUrl });

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
    console.error('Error updating user image:', error);
    res.status(500).json({ error: 'Failed to update user image' });
  }
});


// 3.3. OKUMA İSTATİSTİKLERİ
// ============================================================================

// Tüm verileri çekme endpoint'i
app.get('/api/all-data/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;

    // Grup var mı kontrol et
    const group = await UserGroup.findOne({ groupId }).lean();
    if (!group) {
      return res.status(404).json({ error: 'Grup bulunamadı' });
    }

    // Dinamik koleksiyonları al
    const { users, readingStatuses } = getGroupCollections(groupId);

    const usersData = await users.find().sort({ name: 1 }).lean();
    const statsData = await readingStatuses.find().lean();

    res.json({ users: usersData, stats: statsData, group });
  } catch (error) {
    console.error('Error fetching all data:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Lig tebriği: kullanıcıların son kutlanan lig alanını güncelle (panoda kopyalama sonrası)
app.post('/api/last-congratulated-league/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { items, requestingUserId, requestingUserAuthority } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items dizisi gerekli' });
    }

    if (!requestingUserId || !requestingUserAuthority) {
      return res.status(401).json({ error: 'Kullanıcı bilgileri eksik' });
    }
    if (requestingUserAuthority !== 'admin') {
      return res.status(403).json({ error: 'Bu işlem için yönetici yetkisi gerekli' });
    }

    const group = await UserGroup.findOne({ groupId }).lean();
    if (!group) {
      return res.status(404).json({ error: 'Grup bulunamadı' });
    }

    const { users } = getGroupCollections(groupId);
    const requester = await users.findById(requestingUserId).lean();
    if (!requester || requester.authority !== 'admin') {
      return res.status(403).json({ error: 'Geçersiz kullanıcı veya yetki' });
    }

    const allowedLeagues = new Set([
      'Bronz', 'Gümüş', 'Altın', 'İnci', 'Safir', 'Zümrüt', 'Elmas', 'Yakut', 'Mercan', 'Pırlanta'
    ]);

    let updated = 0;
    const pendingDeleteFilter = []; // pending_league_congratulations'tan silinecek kayıtlar

    for (const raw of items) {
      const userId = raw && raw.userId != null ? String(raw.userId).trim() : '';
      const leagueName =
        raw && raw.leagueName != null ? String(raw.leagueName).trim() : '';
      if (!userId || !allowedLeagues.has(leagueName)) continue;
      const r = await users.findByIdAndUpdate(
        userId,
        { $set: { lastCongratulatedLeague: leagueName } },
        { returnDocument: 'after' }
      ).lean();
      if (r) {
        updated++;
        pendingDeleteFilter.push({ userId, groupId, league: leagueName });
      }
    }

    // Admin paneli tıkladı → WhatsApp botu henüz göndermemişse kuyruğu temizle
    // Böylece bot aktif olduğunda çift kutlama gitmiş olmaz.
    if (pendingDeleteFilter.length > 0) {
      try {
        const deleted = await PendingCongrat.deleteMany({
          $or: pendingDeleteFilter
        });
        if (deleted.deletedCount > 0) {
          console.log(`🧹 Admin lig tebriği: ${deleted.deletedCount} adet pending_league_congratulations kaydı temizlendi. (Grup: ${groupId})`);
        }
      } catch (cleanErr) {
        // Temizleme hatası ana akışı etkilemesin
        console.error('Pending congratulations temizleme hatası:', cleanErr.message);
      }
    }

    res.json({ success: true, updated });
  } catch (error) {
    console.error('Error updating lastCongratulatedLeague:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Kullanıcı istatistikleri endpoint'i
app.get('/api/user-stats/:groupId/:userId', async (req, res) => {
  try {
    const { groupId, userId } = req.params;

    // Grup var mı kontrol et
    const group = await UserGroup.findOne({ groupId }).lean();
    if (!group) {
      return res.status(404).json({ error: 'Grup bulunamadı' });
    }

    // Dinamik koleksiyonu al
    const { readingStatuses } = getGroupCollections(groupId);

    // Sadece belirli kullanıcının istatistiklerini getir
    const userStats = await readingStatuses.find({ userId }).sort({ date: 1 }).lean();

    res.json({ stats: userStats });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Okuma istatistikleri endpoint'i
app.get('/api/reading-stats/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;

    // Grup var mı kontrol et
    const group = await UserGroup.findOne({ groupId }).lean();
    if (!group) {
      return res.status(404).json({ error: 'Grup bulunamadı' });
    }

    // Dinamik koleksiyonları al
    const { users, readingStatuses } = getGroupCollections(groupId);

    const usersData = await users.find().sort({ name: 1 }).lean();
    const statsData = await readingStatuses.find().lean();

    const userStats = usersData.map(user => {
      const userReadings = statsData.filter(stat =>
        stat.userId === user._id.toString() && stat.status === 'okudum'
      );

      return {
        userId: user._id,
        name: user.name,
        profileImage: user.profileImage,
        okudum: userReadings.length
      };
    });

    res.json(userStats);
  } catch (error) {
    console.error('Error fetching reading stats:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// En uzun seriler endpoint'i
app.get('/api/longest-streaks/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;

    // Grup var mı kontrol et
    const group = await UserGroup.findOne({ groupId }).lean();
    if (!group) {
      return res.status(404).json({ error: 'Grup bulunamadı' });
    }

    // Dinamik koleksiyonları al
    const { users, readingStatuses } = getGroupCollections(groupId);

    const usersData = await users.find().lean();
    const statsData = await readingStatuses.find().lean();

    const results = usersData.map(user => {
      // Kullanıcının okuma kayıtlarını tarihe göre sırala
      const userStats = statsData
        .filter(s => s.userId === user._id.toString() && s.status === 'okudum')
        .map(s => s.date)
        .sort();

      let maxStreak = 0, currentStreak = 0;
      let streakStart = null, streakEnd = null;
      let maxStart = null, maxEnd = null;

      for (let i = 0; i < userStats.length; i++) {
        if (i === 0 || (new Date(userStats[i]) - new Date(userStats[i - 1]) === 86400000)) {
          currentStreak++;
          if (currentStreak === 1) streakStart = userStats[i];
          streakEnd = userStats[i];
        } else {
          if (currentStreak > maxStreak) {
            maxStreak = currentStreak;
            maxStart = streakStart;
            maxEnd = streakEnd;
          }
          currentStreak = 1;
          streakStart = userStats[i];
          streakEnd = userStats[i];
        }
      }

      if (currentStreak > maxStreak) {
        maxStreak = currentStreak;
        maxStart = streakStart;
        maxEnd = streakEnd;
      }

      return {
        userId: user._id,
        name: user.name,
        profileImage: user.profileImage,
        streak: maxStreak,
        startDate: maxStart,
        endDate: maxEnd
      };
    });

    results.sort((a, b) => b.streak - a.streak);

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Okuma durumu güncelleme endpoint'i
app.post('/api/update-status/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId, date, status, amount, requestingUserId, requestingUserAuthority } = req.body;

    // Grup var mı kontrol et
    const group = await UserGroup.findOne({ groupId }).lean();
    if (!group) {
      return res.status(404).json({ error: 'Grup bulunamadı' });
    }

    // Yetki kontrolü
    if (!requestingUserId || !requestingUserAuthority) {
      return res.status(401).json({ error: 'Kullanıcı bilgileri eksik' });
    }

    // Member kullanıcıları sadece kendi verilerini güncelleyebilir
    if (requestingUserAuthority === 'member' && requestingUserId !== userId) {
      return res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
    }

    // Admin kullanıcıları tüm verileri güncelleyebilir
    if (requestingUserAuthority !== 'admin' && requestingUserAuthority !== 'member') {
      return res.status(403).json({ error: 'Geçersiz kullanıcı yetkisi' });
    }

    // Dinamik koleksiyonu al
    const { readingStatuses } = getGroupCollections(groupId);

    if (status) {
      const amountNum =
        amount !== undefined && amount !== null && amount !== ''
          ? Number(amount)
          : null;
      if (Number.isFinite(amountNum)) {
        await readingStatuses.findOneAndUpdate(
          { userId, date },
          {
            $set: {
              userId,
              date,
              status: status || 'okudum',
              amount: amountNum
            }
          },
          { upsert: true }
        );
      } else {
        await readingStatuses.findOneAndUpdate(
          { userId, date },
          {
            $set: { userId, date, status },
            $unset: { amount: 1 }
          },
          { upsert: true }
        );
      }
    } else {
      await readingStatuses.findOneAndDelete({ userId, date });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});


// 3.4. DAVET SİSTEMİ
// ============================================================================

// Davet oluşturma endpoint'i
app.post('/api/create-invite/:groupId', async (req, res) => {
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
    const user = await users.findById(userId).lean();
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
    const user = await users.findById(inviteRecord.userId).lean();

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
      profileImage: user.profileImage,
      inviteId: inviteRecord._id
    });
  } catch (error) {
    console.error('Davet doğrulama hatası:', error);
    res.status(500).json({ error: 'Davet doğrulanırken hata oluştu' });
  }
});

// Kullanıcı bilgilerini güncelleme endpoint'i
app.post('/api/update-user-via-invite/:groupId', upload.single('profileImage'), async (req, res) => {
  try {
    const { groupId } = req.params;
    const { inviteId, userName, memberName, memberPassword, selectedAvatarPath } = req.body;
    const profileImageFile = req.file;

    if (!inviteId || !userName || !memberName || !memberPassword) {
      return res.status(400).json({ error: 'Tüm alanlar gerekli' });
    }

    // Davet token'ını kontrol et (used alanını kullanmıyoruz)
    const invite = await Invite.findById(inviteId).lean();
    if (!invite || invite.groupId !== groupId) {
      return res.status(404).json({ error: 'Geçersiz davet linki' });
    }

    // Kullanıcı bilgilerini al
    const { users } = getGroupCollections(groupId);
    const user = await users.findById(invite.userId).lean();

    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
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
      const localPath = path.join(__dirname, 'public', 'uploads', profileImageFile.filename);
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
        await unlinkWithRetry(localPath);

        if (isDropboxHostedUrl(oldImageUrl)) {
          deleteFromDropboxByUrl(oldImageUrl).catch(err =>
            console.error('Eski resim silme hatası:', err)
          );
        }
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
    await users.findByIdAndUpdate(invite.userId, {
      username: memberName,
      userpassword: hashedMemberPassword,
      name: userName,
      profileImage: profileImagePath
    });

    // Davet token'ını sil
    await Invite.findByIdAndDelete(inviteId);

    // Grup bilgilerini al
    const group = await UserGroup.findOne({ groupId }).lean();

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
    console.error('Kullanıcı güncelleme hatası:', error);
    res.status(500).json({ error: 'Kullanıcı güncellenirken hata oluştu' });
  }
});

// 3.5. ADMIN VE GÜVENLİK
// ============================================================================

// Admin girişi endpoint'i
app.post('/api/admin-login', async (req, res) => {
  try {
    const { username, password, groupId } = req.body;

    // Users koleksiyonundan kullanıcıyı bul (admin veya member)
    const { users } = getGroupCollections(groupId);
    const user = await users.findOne({ username }).lean();

    if (user) {
      // Şifre kontrolü
      const isPasswordValid = await bcrypt.compare(password, user.userpassword);

      if (isPasswordValid) {
        // Eksik alanları ekle (migration)
        if (user.loginStreak === undefined || user.lastLoginDate === undefined) {
          const today = moment().format("YYYY-MM-DD");
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

        // Grup bilgisini al
        const group = await UserGroup.findOne({ groupId }).lean();
        if (!group) {
          return res.json({ success: false, error: 'Grup bulunamadı' });
        }
        res.json({
          success: true,
          groupName: group.groupName,
          groupId: group.groupId,
          userId: updatedUser._id, // Kullanıcı ID'sini de döndür
          authority: updatedUser.authority, // Kullanıcının yetkisini de döndür
          userName: updatedUser.username, // Kullanıcının kullanıcı adını de döndür
          name: updatedUser.name, // Kullanıcının gerçek adını döndür
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
app.post('/api/update-login-streak', async (req, res) => {
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

// Admin doğrulama endpoint'i
app.post('/api/verify-admin', async (req, res) => {
  try {
    const { username, groupId } = req.body;

    // Users koleksiyonundan admin kullanıcısını bul
    const { users } = getGroupCollections(groupId);
    const admin = await users.findOne({ username, authority: 'admin' }).lean();

    res.json({ valid: !!admin });
  } catch (error) {
    console.error('Error verifying admin:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add an initial admin if none exists (you can remove this after first run)
const AccessLog = mongoose.model('AccessLog', {
  action: String,
  timestamp: Date,
  deviceInfo: Object,
  ipAddress: String,
  groupId: String
});

// Yetkisiz erişim logu endpoint'i
app.post('/api/log-unauthorized', async (req, res) => {
  try {
    const { action, deviceInfo, userName, groupId } = req.body;

    // Get client IP address
    const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    const storedActor = userName || ipAddress;
    const gid = groupId || 'catikati23';

    if (await hasLogInSameTurkeyMinute(AccessLog, {
      groupId: gid,
      action,
      ipAddress: storedActor
    })) {
      return res.json({ success: true });
    }

    // Create a new log entry
    const log = new AccessLog({
      action,
      timestamp: new Date(),
      deviceInfo,
      ipAddress: storedActor,
      groupId: gid
    });

    await log.save();
    res.json({ success: true });
  } catch (error) {
    console.error('Error logging unauthorized access:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Erişim logları endpoint'i
app.get('/api/access-logs', async (req, res) => {
  try {
    const { groupId } = req.query;
    let query = {};

    // If groupId is provided, filter by groupId
    if (groupId) {
      query.groupId = groupId;
    }

    const logs = await AccessLog.find(query).sort({ timestamp: -1 }).lean();
    res.json(logs);
  } catch (error) {
    console.error('Error fetching access logs:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Belirli bir İstanbul takvim günündeki accesslogs kayıtlarını sil (grup bazlı)
app.delete('/api/access-logs/day', async (req, res) => {
  try {
    const { trDate, groupId } = req.body || {};
    if (!trDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(trDate))) {
      return res.status(400).json({ error: 'trDate (YYYY-MM-DD) gerekli' });
    }
    const gid = groupId ? String(groupId).trim() : '';
    if (!gid) {
      return res.status(400).json({ error: 'groupId gerekli' });
    }
    const bounds = getTurkeyDayBoundsFromTrDateString(trDate);
    if (!bounds) {
      return res.status(400).json({ error: 'Geçersiz trDate' });
    }
    const result = await AccessLog.deleteMany({
      groupId: gid,
      timestamp: { $gte: bounds.start, $lt: bounds.end }
    });
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    console.error('Error deleting access logs by day:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login logs endpoint
app.get('/api/login-logs', async (req, res) => {
  try {
    const { groupId } = req.query;
    let query = {};

    // If groupId is provided, filter by groupId
    if (groupId) {
      query.groupId = groupId;
    }

    const logs = await LoginLog.find(query).sort({ timestamp: -1 }).lean();

    // Format the dates before sending to client
    const formattedLogs = logs.map(log => {
      const date = new Date(log.timestamp);
      const day = date.getDate();
      const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
        'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
      const month = monthNames[date.getMonth()];
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');

      // Create a formatted date string
      const formattedDate = `${day} ${month} ${year} ${hours}:${minutes}`;

      // Return the log with both raw date (for sorting) and formatted date
      // Note: logs are fetched with .lean(), so use plain object fields directly.
      return {
        ...log,
        timestamp: log.timestamp,
        formattedDate: formattedDate
      };
    });

    res.json(formattedLogs);
  } catch (error) {
    console.error('Error fetching login logs:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Belirli bir İstanbul takvim günündeki loginlogs kayıtlarını sil (grup bazlı)
app.delete('/api/login-logs/day', async (req, res) => {
  try {
    const { trDate, groupId } = req.body || {};
    if (!trDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(trDate))) {
      return res.status(400).json({ error: 'trDate (YYYY-MM-DD) gerekli' });
    }
    const gid = groupId ? String(groupId).trim() : '';
    if (!gid) {
      return res.status(400).json({ error: 'groupId gerekli' });
    }
    const bounds = getTurkeyDayBoundsFromTrDateString(trDate);
    if (!bounds) {
      return res.status(400).json({ error: 'Geçersiz trDate' });
    }
    const result = await LoginLog.deleteMany({
      groupId: gid,
      timestamp: { $gte: bounds.start, $lt: bounds.end }
    });
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    console.error('Error deleting login logs by day:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

const requestIp = require('request-ip');

const loginLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  ipAddress: String,
  deviceInfo: Object,
  groupId: String
});

const LoginLog = mongoose.model('LoginLog', loginLogSchema);

const siteActivityLogSchema = new mongoose.Schema({
  action: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  deviceInfo: Object,
  ipAddress: String,
  groupId: String
});

const SiteActivityLog = mongoose.model('SiteActivityLog', siteActivityLogSchema, 'siteactivitylogs');

/** TR (UTC+3) takvimine göre şu anki dakikanın [başlangıç, sonraki dakika) aralığı — aynı yıl/ay/gün/saat/dakika dedup için */
function getTurkeyMinuteBounds(at = new Date()) {
  const m = moment(at).utcOffset(3);
  const start = m.clone().startOf('minute').toDate();
  const end = m.clone().add(1, 'minute').startOf('minute').toDate();
  return { start, end };
}

/** timestamp aynı TR dakikasında ve alanlar eşleşiyorsa true */
async function hasLogInSameTurkeyMinute(Model, matchFields) {
  const { start, end } = getTurkeyMinuteBounds();
  const found = await Model.findOne({
    ...matchFields,
    timestamp: { $gte: start, $lt: end }
  })
    .select('_id')
    .lean();
  return !!found;
}

/** trDate: YYYY-MM-DD (İstanbul takvim günü) — o günün [00:00, ertesi gün 00:00) aralığı UTC Date olarak */
function getTurkeyDayBoundsFromTrDateString(trDate) {
  const parts = String(trDate).split('-').map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return null;
  }
  const [y, mo, d] = parts;
  const start = moment({ year: y, month: mo - 1, date: d, hour: 0, minute: 0, second: 0, millisecond: 0 }).utcOffset(3, true);
  const end = start.clone().add(1, 'day');
  return { start: start.toDate(), end: end.toDate() };
}

function extractClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return forwardedFor[0];
  }
  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim();
  }
  return req.connection?.remoteAddress || req.socket?.remoteAddress || '';
}

function buildDeviceInfo(req, fallbackDeviceInfo = {}) {
  if (fallbackDeviceInfo && Object.keys(fallbackDeviceInfo).length > 0) {
    return fallbackDeviceInfo;
  }

  return {
    userAgent: req.headers['user-agent'] || 'unknown'
  };
}

async function logSiteActivity({ action, req, groupId, userName, deviceInfo }) {
  try {
    const allowedSiteActions = new Set([
      'grup_görüntüleme',
      'ana_sayfa_görüntüleme',
      'grup_oluşturma',
      'grup_silme'
    ]);
    const normalizeSiteAction = (rawAction) => {
      const a = typeof rawAction === 'string' ? rawAction.trim() : '';
      return allowedSiteActions.has(a) ? a : (a || 'bilinmeyen_eylem');
    };

    const normalizedAction = normalizeSiteAction(action);
    const clientIp = extractClientIp(req);
    const normalizedUserName = typeof userName === 'string' && userName.trim()
      ? userName.trim()
      : null;

    const storedActor = normalizedUserName || clientIp;
    const storedGroupId = groupId || 'catikati23';

    if (await hasLogInSameTurkeyMinute(SiteActivityLog, {
      groupId: storedGroupId,
      action: normalizedAction,
      ipAddress: storedActor
    })) {
      return;
    }

    const log = new SiteActivityLog({
      action: normalizedAction,
      timestamp: new Date(),
      deviceInfo: buildDeviceInfo(req, deviceInfo),
      ipAddress: storedActor,
      groupId: storedGroupId
    });

    await log.save();
  } catch (error) {
    console.error('Error writing site activity log:', error);
  }
}

// Site activity logs endpoint
app.get('/api/site-activity-logs', async (req, res) => {
  try {
    const { groupId, action } = req.query;
    const query = {};

    if (groupId) {
      query.groupId = groupId;
    }
    if (action) {
      query.action = action;
    }

    const logs = await SiteActivityLog.find(query).sort({ timestamp: -1 }).lean();
    res.json(logs);
  } catch (error) {
    console.error('Error fetching site activity logs:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Etkinlik kayıtları sayfası: tüm grupların özeti (yalnızca kimlik / ad / görünürlük)
app.get('/api/site-activity-groups', async (req, res) => {
  try {
    const groups = await UserGroup.find({})
      .select('groupId groupName visibility')
      .sort({ groupName: 1, groupId: 1 })
      .lean();
    res.json({ groups });
  } catch (error) {
    console.error('Error fetching groups for site activity admin:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Belirli bir İstanbul takvim günündeki siteactivitylogs kayıtlarını sil; action gönderilirse sadece o eylem
app.delete('/api/site-activity-logs/day', async (req, res) => {
  try {
    const { trDate, action } = req.body || {};
    if (!trDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(trDate))) {
      return res.status(400).json({ error: 'trDate (YYYY-MM-DD) gerekli' });
    }
    const bounds = getTurkeyDayBoundsFromTrDateString(trDate);
    if (!bounds) {
      return res.status(400).json({ error: 'Geçersiz trDate' });
    }
    const q = {
      timestamp: { $gte: bounds.start, $lt: bounds.end }
    };
    if (action && String(action).trim()) {
      q.action = String(action).trim();
    }
    const result = await SiteActivityLog.deleteMany(q);
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    console.error('Error deleting site activity logs by day:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Ana sayfa görüntüleme log endpoint'i
app.post('/api/log-home-visit', async (req, res) => {
  try {
    const { deviceInfo, userName, action } = req.body || {};

    await logSiteActivity({
      action: action || 'ana_sayfa_görüntüleme',
      req,
      groupId: null,
      userName,
      deviceInfo
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error logging home visit:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Ziyaret logu endpoint'i
app.post('/api/log-visit', async (req, res) => {
  try {
    const { deviceInfo, groupId, userName, action } = req.body || {};
    const siteAction = (action || 'grup_görüntüleme').toString().trim();
    const shouldWriteAccessLog = (
      siteAction === 'grup_görüntüleme'
    );

    // Get client IP address
    const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    const storedActor = userName || ipAddress;
    const gid = groupId || 'catikati23';

    if (shouldWriteAccessLog) {
      if (!(await hasLogInSameTurkeyMinute(LoginLog, {
        groupId: gid,
        ipAddress: storedActor
      }))) {
        const log = new LoginLog({
          deviceInfo,
          ipAddress: storedActor,
          groupId: gid
        });
        await log.save();
      }
    }

    await logSiteActivity({
      action: siteAction,
      req,
      groupId,
      userName,
      deviceInfo
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error logging visit:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Ziyaret logu için adblock'a daha az takılan alternatif endpoint
app.post('/api/visit-event', async (req, res) => {
  try {
    const { deviceInfo, groupId, userName, action } = req.body || {};
    const siteAction = (action || 'grup_görüntüleme').toString().trim();
    const shouldWriteAccessLog = (
      siteAction === 'grup_görüntüleme'
    );

    // Get client IP address
    const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    const storedActor = userName || ipAddress;
    const gid = groupId || 'catikati23';

    if (shouldWriteAccessLog) {
      if (!(await hasLogInSameTurkeyMinute(LoginLog, {
        groupId: gid,
        ipAddress: storedActor
      }))) {
        const log = new LoginLog({
          deviceInfo,
          ipAddress: storedActor,
          groupId: gid
        });
        await log.save();
      }
    }

    await logSiteActivity({
      action: siteAction,
      req,
      groupId,
      userName,
      deviceInfo
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error logging visit event:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});



// E. İÇERİK
// ============================================================================

// Günün sözü modeli
const vecizeSchema = new mongoose.Schema({
  sentence: String
});
const Vecize = mongoose.model('Vecize', vecizeSchema, 'vecizeler');

// Rastgele ayet modeli
const ayetSchema = new mongoose.Schema({
  sentence: String
});

const Ayet = mongoose.model('Ayet', ayetSchema, 'ayetler');

// Hadis modeli
const hadisSchema = new mongoose.Schema({
  sentence: String
});

const Hadis = mongoose.model('Hadis', hadisSchema, 'hadisler');

// Dua modeli
const duaSchema = new mongoose.Schema({
  sentence: String
});

const Dua = mongoose.model('Dua', duaSchema, 'dualar');

// Gruba katılma isteği modeli
const joinRequestSchema = new mongoose.Schema({
  groupId: String,
  userName: String,
  name: String,
  password: String,
  profileImage: String,
  status: { type: String, default: 'pending' }, // pending, accepted, rejected
  createdAt: { type: Date, default: Date.now }
});

const JoinRequest = mongoose.model('JoinRequest', joinRequestSchema, 'jointogroups');


// Söz resimleri endpoint'i
app.get('/api/quote-images', (req, res) => {
  const quotesDir = path.join(__dirname, 'public', 'quotes');
  fs.readdir(quotesDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Unable to list images' });
    }
    // Filter for image files only (jpg, png, jpeg, gif, webp)
    const imageFiles = files.filter(file =>
      /\.(jpg|jpeg|png|gif|webp)$/i.test(file)
    );
    res.json({ images: imageFiles });
  });
});

// User avatars endpoint'i
app.get('/api/user-avatars', (req, res) => {
  const userAvatarsDir = path.join(__dirname, 'public', 'userAvatars');
  fs.readdir(userAvatarsDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Unable to list user avatars' });
    }
    // Filter for image files only (jpg, png, jpeg, gif, webp)
    const avatarFiles = files.filter(file =>
      /\.(jpg|jpeg|png|gif|webp)$/i.test(file)
    );
    res.json(avatarFiles);
  });
});

// Rastgele söz endpoint'i
app.get('/api/random-quote', async (req, res) => {
  try {
    // Count total documents in the sentences collection
    const count = await Vecize.countDocuments();

    // If there are no sentences, return a default message
    if (count === 0) {
      return res.json({ sentence: "İlmin tâlibi (talebesi), Rahman'ın tâlibidir. İlmin talipçisi, İslâm'ın rüknüdür. Onun ser-ü mükâfatı, Peygamberlerle beraber verilir. (Hadis-i Şerif)" });
    }

    // Generate a random index
    const random = Math.floor(Math.random() * count);

    // Skip to the random document and get it
    const randomVecize = await Vecize.findOne().skip(random).lean();

    res.json({ sentence: randomVecize.sentence });
  } catch (error) {
    console.error('Error fetching random quote:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

// Rastgele ayet endpoint'i
app.get('/api/random-ayet', async (req, res) => {
  try {
    // Ayetler koleksiyonundaki toplam belge sayısını say
    const count = await Ayet.countDocuments();

    // Eğer hiç ayet yoksa, varsayılan bir mesaj döndür
    if (count === 0) {
      return res.json({ sentence: "Andolsun ki, Resûlullah, sizin için, Allah'a ve Ahiret gününe kavuşmayı umanlar ve Allah'ı çok zikredenler için güzel bir örnektir. (Ahzâb sûresi, 33/21)" });
    }

    // Rastgele bir indeks oluştur
    const random = Math.floor(Math.random() * count);

    // Rastgele belgeye atla ve al
    const randomAyet = await Ayet.findOne().skip(random).lean();

    res.json({ sentence: randomAyet.sentence });
  } catch (error) {
    console.error('Rastgele ayet alınırken hata oluştu:', error);
    res.status(500).json({ error: 'Sunucu hatası', message: error.message });
  }
});

// Rastgele hadis endpoint'i
app.get('/api/random-hadis', async (req, res) => {
  try {
    // Hadisler koleksiyonundaki toplam belge sayısını say
    const count = await Hadis.countDocuments();

    // Eğer hiç hadis yoksa, varsayılan bir mesaj döndür
    if (count === 0) {
      return res.json({ sentence: "İlmin tâlibi (talebesi), Rahman'ın tâlibidir. İlmin talipçisi, İslâm'ın rüknüdür. Onun ser-ü mükâfatı, Peygamberlerle beraber verilir. (Hadis-i Şerif)" });
    }

    // Rastgele bir indeks oluştur
    const random = Math.floor(Math.random() * count);

    // Rastgele belgeye atla ve al
    const randomHadis = await Hadis.findOne().skip(random).lean();

    res.json({ sentence: randomHadis.sentence });
  } catch (error) {
    console.error('Rastgele hadis alınırken hata oluştu:', error);
    res.status(500).json({ error: 'Sunucu hatası', message: error.message });
  }
});

// Rastgele dua endpoint'i
app.get('/api/random-dua', async (req, res) => {
  try {
    // Dualar koleksiyonundaki toplam belge sayısını say
    const count = await Dua.countDocuments();

    // Eğer hiç dua yoksa, varsayılan bir mesaj döndür
    if (count === 0) {
      return res.json({ sentence: "Allah'ım! Senden Seni sevmeyi Seni sevenleri sevmeyi ve Senin sevgine ulaştıran ameli yapmayı isterim. Allah'ım! Senin sevgini, bana canımdan, ailemden ve soğuk sudan daha sevgili kıl. (Tirmizî, Deavât,73)" });
    }

    // Rastgele bir indeks oluştur
    const random = Math.floor(Math.random() * count);

    // Rastgele belgeye atla ve al
    const randomDua = await Dua.findOne().skip(random).lean();

    res.json({ sentence: randomDua.sentence });
  } catch (error) {
    console.error('Rastgele dua alınırken hata oluştu:', error);
    res.status(500).json({ error: 'Sunucu hatası', message: error.message });
  }
});

// Rastgele hatırlatma endpoint'i
app.get('/api/random-reminder', async (req, res) => {
  try {
    // Hatırlatmalar koleksiyonundaki toplam belge sayısını say
    const count = await Hatirlatma.countDocuments();

    // Eğer hiç hatırlatma yoksa, varsayılan bir mesaj döndür
    if (count === 0) {
      return res.json({ sentence: "Her gün küçük adımlarla büyük hedeflere ulaşabilirsin. Bugün de bir adım at!" });
    }

    // Rastgele bir indeks oluştur
    const random = Math.floor(Math.random() * count);

    // Rastgele belgeye atla ve al
    const randomHatirlatma = await Hatirlatma.findOne().skip(random).lean();

    res.json({ sentence: randomHatirlatma.sentence });
  } catch (error) {
    console.error('Rastgele hatırlatma alınırken hata oluştu:', error);
    res.status(500).json({ error: 'Sunucu hatası', message: error.message });
  }
});

// 3.6. GRUBA KATILMA İSTEKLERİ
// ============================================================================

// Gruba katılma isteği gönderme endpoint'i
app.post('/api/join-group-request', upload.single('profileImage'), async (req, res) => {
  try {
    const { groupId, userName, memberName, userPassword, selectedAvatarPath } = req.body;

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
        const tempPath = path.join(__dirname, 'public', 'uploads', tempFileName);
        fs.copyFileSync(req.file.path, tempPath);

        // 2. Adım: WebP formatına dönüştür
        const webpFileName = `${Date.now()}-${baseFileName}.webp`;
        const webpPath = path.join(__dirname, 'public', 'uploads', webpFileName);
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
      const localPath = path.join(__dirname, 'public', 'uploads', fileName);
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

    // Katılma isteği oluştur
    const joinRequest = new JoinRequest({
      groupId,
      userName: memberName, // joinMemberNameInput -> username
      name: userName, // joinUserNameInput -> name
      password: hashedPassword,
      profileImage: profileImageUrl,
      status: 'pending'
    });

    await joinRequest.save();

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

// Katılma isteğini iptal etme endpoint'i
app.delete('/api/cancel-join-request/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userName } = req.body;

    // Katılma isteğini bul ve sil
    const deletedRequest = await JoinRequest.findOneAndDelete({
      groupId,
      userName,
      status: 'pending'
    });

    if (!deletedRequest) {
      return res.status(404).json({ error: 'Katılma isteği bulunamadı' });
    }

    // Eğer resim Dropbox'taysa sil
    if (isDropboxHostedUrl(deletedRequest.profileImage)) {
      deleteFromDropboxByUrl(deletedRequest.profileImage).catch(err =>
        console.error('Dropbox silme hatası:', err)
      );
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

// Kullanıcı adı benzersizlik kontrol endpoint'i
app.get('/api/check-username-exists/:groupId/:username', async (req, res) => {
  try {
    const { groupId, username } = req.params;

    // Grup koleksiyonlarını al
    const { users } = getGroupCollections(groupId);

    // Kullanıcı adı var mı kontrol et
    const existingUser = await users.findOne({ username }).lean();

    // Ayrıca pending durumundaki katılma isteklerinde de var mı kontrol et
    const existingRequest = await JoinRequest.findOne({
      groupId,
      userName: username,
      status: 'pending'
    }).lean();

    res.json({
      exists: !!(existingUser || existingRequest)
    });

  } catch (error) {
    console.error('Kullanıcı adı kontrol hatası:', error);
    res.status(500).json({ error: 'Kullanıcı adı kontrol edilirken hata oluştu' });
  }
});

// Katılma isteği durumu kontrol endpoint'i
app.get('/api/join-request-status/:groupId/:userName', async (req, res) => {
  try {
    const { groupId, userName } = req.params;

    // Katılma isteğini bul
    const joinRequest = await JoinRequest.findOne({ groupId, userName }).lean();

    if (!joinRequest) {
      return res.json({ status: 'none' });
    }

    // Eğer istek kabul edilmişse, kullanıcının gerçekten grupta olup olmadığını kontrol et
    if (joinRequest.status === 'accepted') {
      const { users } = getGroupCollections(groupId);
      const user = await users.findOne({ username: userName }).lean();

      if (user) {
        return res.json({
          status: 'accepted',
          userId: user._id,
          userName: userName,
          message: 'Katılma isteğiniz kabul edildi! Artık gruba erişebilirsiniz.'
        });
      }
    }

    return res.json({
      status: joinRequest.status,
      requestId: joinRequest._id,
      createdAt: joinRequest.createdAt
    });

  } catch (error) {
    console.error('Katılma isteği durum kontrol hatası:', error);
    res.status(500).json({ error: 'Durum kontrol edilirken hata oluştu' });
  }
});

// ObjectId ile katılma isteği durumu kontrol endpoint'i
app.get('/api/join-request-status-by-id/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;

    const joinRequest = await JoinRequest.findById(requestId).lean();

    if (!joinRequest) {
      return res.json({ status: 'none' });
    }

    // Eğer istek kabul edilmişse, jointogroups koleksiyonundan sil
    if (joinRequest.status === 'accepted') {
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
app.get('/api/join-requests/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;

    // Bu gruba gelen pending durumundaki katılma isteklerini getir
    const joinRequests = await JoinRequest.find({
      groupId: groupId,
      status: 'pending'
    }).sort({ createdAt: -1 }).lean();

    res.json({
      success: true,
      requests: joinRequests
    });

  } catch (error) {
    console.error('Katılma istekleri getirme hatası:', error);
    res.status(500).json({ error: 'Katılma istekleri getirilirken hata oluştu' });
  }
});

// Katılma isteğini kabul etme endpoint'i
app.post('/api/accept-join-request/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;

    // Katılma isteğini bul
    const joinRequest = await JoinRequest.findById(requestId).lean();
    if (!joinRequest) {
      return res.status(404).json({ error: 'Katılma isteği bulunamadı' });
    }

    if (joinRequest.status !== 'pending') {
      return res.status(400).json({ error: 'Bu istek zaten işlenmiş' });
    }

    // Kullanıcıyı gruba ekle
    const { users } = getGroupCollections(joinRequest.groupId);
    const today = moment().format("YYYY-MM-DD");
    const newUser = {
      _id: joinRequest._id,
      name: joinRequest.name,
      username: joinRequest.userName,
      userpassword: joinRequest.password,
      profileImage: joinRequest.profileImage,
      authority: 'member',
      loginStreak: 1,
      lastLoginDate: today
    };

    await users.create(newUser);

    // Katılma isteğini accepted olarak işaretle
    await JoinRequest.findByIdAndUpdate(requestId, {
      status: 'accepted',
      processedAt: new Date()
    });

    console.log(`Katılma isteği kabul edildi: ${joinRequest.userName} -> ${joinRequest.groupId}`);

    res.json({
      success: true,
      message: 'Katılma isteği başarıyla kabul edildi',
      user: newUser // Yeni kullanıcı bilgisini de döndür
    });

  } catch (error) {
    console.error('Katılma isteği kabul etme hatası:', error);
    res.status(500).json({ error: 'Katılma isteği kabul edilirken hata oluştu' });
  }
});

// Katılma isteğini reddetme endpoint'i
app.post('/api/reject-join-request/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;

    // Katılma isteğini bul
    const joinRequest = await JoinRequest.findById(requestId).lean();
    if (!joinRequest) {
      return res.status(404).json({ error: 'Katılma isteği bulunamadı' });
    }

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
        const dbx = new Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN });
        const imagePath = joinRequest.profileImage.split('/').pop();
        await dbx.filesDeleteV2({ path: `/profile-images/${imagePath}` });
        console.log(`Profil resmi silindi: ${imagePath}`);
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

    const deletedRequest = await JoinRequest.findByIdAndDelete(requestId);

    if (!deletedRequest) {
      return res.status(404).json({ error: 'Katılma isteği bulunamadı' });
    }

    // Dropbox'dan resmi sil (eğer varsa)
    if (isDropboxHostedUrl(deletedRequest.profileImage)) {
      try {
        const dbx = new Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN });
        const imagePath = deletedRequest.profileImage.split('/').pop();
        await dbx.filesDeleteV2({ path: `/profile-images/${imagePath}` });
        console.log(`Profil resmi silindi: ${imagePath}`);
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

    const deletedRequest = await JoinRequest.findByIdAndDelete(requestId);

    if (!deletedRequest) {
      return res.status(404).json({ error: 'Katılma isteği bulunamadı' });
    }

    // Dropbox'dan resmi sil (eğer varsa)
    if (isDropboxHostedUrl(deletedRequest.profileImage)) {
      try {
        const fileName = deletedRequest.profileImage.split('/').pop();
        await dropbox.filesDeleteV2({ path: `/join-requests/${fileName}` });
        console.log('Dropbox resmi silindi:', fileName);
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
app.get('/api/check-user-in-group/:groupId/:objectId', async (req, res) => {
  try {
    const { groupId, objectId } = req.params;

    // Grup koleksiyonlarını al
    const { users } = getGroupCollections(groupId);

    // ObjectId ile kullanıcı ara
    const user = await users.findOne({ _id: objectId }).lean();

    if (user) {
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


// F. YEDEKLEME HİZMETİ
// ============================================================================

const { MongoClient } = require('mongodb');

// MongoDB connection string from .env file
const uri = process.env.MONGO_URI;
const dbName = process.env.DB_NAME;
const backupDbName = process.env.BACKUP_DB_NAME || 'backups';

// Function to perform the backup
async function performBackup() {
  console.log("Backup: Starting...");
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log("Connected to MongoDB for backup");

    // Source database (the one we're backing up)
    const sourceDb = client.db(dbName);

    // Target database (where backups will be stored)
    const backupDb = client.db(backupDbName);

    // Get current date/time for collection naming
    const now = new Date();

    // Format date as "YYYY-MM-DD"
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const timestamp = `${year}-${month}-${day}`;

    // Backup usergroups collection
    const usergroups = await sourceDb.collection('usergroups').find({}).toArray();
    const usergroupsCollectionName = `usergroups_backup_${timestamp}`;
    if (usergroups.length > 0) {
      await backupDb.collection(usergroupsCollectionName).insertMany(usergroups);
      console.log(`✅ Usergroups backed up to collection: ${usergroupsCollectionName}`);
    } else {
      console.log(`ℹ️ No usergroups data to backup`);
    }

    console.log(`Backup completed at ${now.toLocaleString()}`);

    // Clean up old backups
    await cleanupOldBackups(backupDb, 'usergroups_backup_', 10);


  } catch (err) {
    console.error("Error during backup:", err);
  } finally {
    await client.close();
    console.log("MongoDB connection closed after backup");
  }
}

// Function to clean up old backups, keeping only the most recent ones
async function cleanupOldBackups(db, prefix, keepCount) {
  try {
    // Get all collections in the backup database
    const collections = await db.listCollections().toArray();

    // Filter collections that match our prefix
    const backupCollections = collections
      .filter(col => col.name.startsWith(prefix))
      .map(col => col.name);

    // Sort by date (newest first) - extract date from collection name
    backupCollections.sort((a, b) => {
      const dateA = a.replace(prefix, '');
      const dateB = b.replace(prefix, '');
      return dateB.localeCompare(dateA); // Descending order (newest first)
    });

    console.log(`Found ${backupCollections.length} backup collections for prefix ${prefix}:`, backupCollections);

    // If we have more than keepCount, delete the oldest ones
    if (backupCollections.length > keepCount) {
      const collectionsToDelete = backupCollections.slice(keepCount);
      console.log(`Deleting ${collectionsToDelete.length} old backup collections:`, collectionsToDelete);

      for (const collectionName of collectionsToDelete) {
        try {
          await db.collection(collectionName).drop();
          console.log(`✅ Deleted old backup collection: ${collectionName}`);
        } catch (dropError) {
          console.error(`❌ Failed to delete collection ${collectionName}:`, dropError.message);
        }
      }
    } else {
      console.log(`No cleanup needed for ${prefix} - only ${backupCollections.length} collections found (keeping ${keepCount})`);
    }
  } catch (err) {
    console.error(`Error cleaning up old backups with prefix ${prefix}:`, err);
  }
}

function scheduleBackup() {
  // Schedule backups to run every 1440 minutes (24 hours)
  const backupJob = schedule.scheduleJob('0 23 * * *', performBackup);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Backup service shutting down...');
    backupJob.cancel();
    process.exit(0);
  });

  return backupJob;
}

// Hatırlatmalar şeması
const hatirlatmaSchema = new mongoose.Schema({
  sentence: String
});

const Hatirlatma = mongoose.model('hatırlatmalar', hatirlatmaSchema, 'hatırlatmalar');

// Günün vecizesi bildirim cron'u (09:00 ve 21:00) - Europe/Istanbul TZ ile
async function getRandomVecizeForPush() {
  try {
    // Tüm koleksiyonlar: vecizeler, ayetler, hadisler, dualar, hatırlatmalar
    const sources = [
      { model: Vecize, name: 'vecizeler', type: 'vecize' },
      { model: Ayet, name: 'ayetler', type: 'ayet' },
      { model: Hadis, name: 'hadisler', type: 'hadis' },
      { model: Dua, name: 'dualar', type: 'dua' },
      { model: Hatirlatma, name: 'hatırlatmalar', type: 'hatırlatma' }
    ];

    // Her koleksiyonun belge sayısını al
    const counts = await Promise.all(sources.map(s => s.model.countDocuments()));

    // Boş olmayan koleksiyonları filtrele
    const availableSources = sources.filter((source, index) => counts[index] > 0);
    if (availableSources.length === 0) return { message: 'Bugün için vecize bulunamadı.', source: 'vecize' };

    // Eşit ihtimalle koleksiyon seç
    const randomSourceIndex = Math.floor(Math.random() * availableSources.length);
    const selectedSource = availableSources[randomSourceIndex];

    // Seçilen koleksiyondan rastgele belge al
    const randomIndex = Math.floor(Math.random() * counts[sources.indexOf(selectedSource)]);
    const doc = await selectedSource.model.findOne().skip(randomIndex).lean();

    return {
      message: doc?.sentence || 'Bugün için vecize bulunamadı.',
      source: selectedSource.type
    };
  } catch (e) {
    console.error('Vecize seçme hatası:', e);
    return { message: 'Bugün için vecize bulunamadı.', source: 'vecize' };
  }
}

async function sendOneSignalNotification(message, source = 'vecize') {
  try {
    // Kaynağa göre başlık belirle
    let heading = 'Bir Söz';

    if (source === 'vecize') heading = 'Bir Söz';
    else if (source === 'ayet') heading = 'Bir Ayet';
    else if (source === 'hadis') heading = 'Bir Hadis';
    else if (source === 'dua') heading = 'Bir Dua';
    else if (source === 'hatırlatma') heading = 'Bir Hatırlatma';

    const payload = JSON.stringify({
      app_id: process.env.ONESIGNAL_APP_ID,
      included_segments: ['All'],
      headings: { en: heading, tr: heading },
      contents: { en: message, tr: message }
    });

    const options = {
      hostname: 'api.onesignal.com',
      path: '/notifications',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Basic ${process.env.ONESIGNAL_API_KEY}`,
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log('Bildirim gönderildi ✅', data);
            resolve();
          } else {
            console.error('Bildirim gönderme hatası ❌', res.statusCode, data);
            reject(new Error(`OneSignal error: ${res.statusCode}`));
          }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  } catch (err) {
    console.error('Bildirim gönderme hatası ❌', err.message || err);
  }
}

// Global değişkenler - zamanlayıcıları saklamak için
let vecizeJobMorning = null;
let vecizeJobEvening = null;
function scheduleDailyNotifications() {

  if (!(process.env.ONESIGNAL_APP_ID && process.env.ONESIGNAL_API_KEY)) {
    console.warn('OneSignal env değişkenleri eksik. Cron başlatılmadı.');
    return null;
  }

  // Önceki zamanlayıcıları iptal et (eğer varsa)
  if (vecizeJobMorning) {
    console.log('⚠️ Önceki sabah zamanlayıcısı iptal ediliyor...');
    vecizeJobMorning.cancel();
    vecizeJobMorning = null;
  }

  if (vecizeJobEvening) {
    console.log('⚠️ Önceki akşam zamanlayıcısı iptal ediliyor...');
    vecizeJobEvening.cancel();
    vecizeJobEvening = null;
  }

  // TR: 09:00
  vecizeJobMorning = schedule.scheduleJob({ rule: '0 9 * * *', tz: 'Europe/Istanbul' }, async () => {
    console.log('🌅 Sabah 9:00 cron job çalışıyor');
    const result = await getRandomVecizeForPush();
    await sendOneSignalNotification(result.message, result.source);
  });

  // TR: 21:00
  vecizeJobEvening = schedule.scheduleJob({ rule: '0 21 * * *', tz: 'Europe/Istanbul' }, async () => {
    console.log('🌙 Akşam 21:00 cron job çalışıyor');
    const result = await getRandomVecizeForPush();
    await sendOneSignalNotification(result.message, result.source);
  });

  console.log('✅ Vecize bildirim zamanlayıcıları başlatıldı (Sabah 9:00, Akşam 21:00)');

  process.on('SIGINT', async () => {
    console.log('Cron job\'lar kapatılıyor...');
    vecizeJobMorning?.cancel();
    vecizeJobEvening?.cancel();
  });

  return { jobMorning: vecizeJobMorning, jobEvening: vecizeJobEvening };
}

// Sağlık kontrolü endpoint'i
app.get('/api/health', (req, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});

// Render'ı uyanık tutmak için ping sistemi
function schedulePing() {
  // Her 2 dakikada bir ping gönder
  const pingJob = schedule.scheduleJob('*/2 * * * *', async () => {
    try {
      const response = await fetch('https://rotakip.onrender.com/api/health', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        // Başarısız response'u text olarak oku
        const errorText = await response.text().catch(() => 'Unknown error');
        console.warn(`⚠️ Ping başarısız: ${response.status} ${response.statusText} - ${errorText.trim()}`);
        return;
      }

      // Sadece başarılı response'ları JSON olarak parse et
      const contentType = response.headers.get('content-type');
      if (!(contentType && contentType.includes('application/json'))) {
        const text = await response.text();
        console.warn(`⚠️ Ping yanıtı JSON değil: ${text.substring(0, 100)}`);
      }
    } catch (error) {
      // Network hatalarını sessizce handle et
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        console.warn('⚠️ Ping bağlantı hatası (network). Bir sonraki ping\'de tekrar denenecek.');
      } else if (error.message && error.message.includes('JSON')) {
        console.warn('⚠️ Ping JSON parse hatası:', error.message);
      } else {
        console.warn('⚠️ Ping hatası:', error.message || error);
      }
    }
  });

  console.log("Ping scheduler started.");

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Ping service shutting down...');
    pingJob.cancel();
  });

  return pingJob;
}

// Dropbox token yenileme sistemi
function scheduleTokenRefresh() {
  // Her 1 saatte bir token'ı yenile
  const tokenJob = schedule.scheduleJob('0 * * * *', async () => {
    try {
      await refreshDropboxToken();
    } catch (error) {
      console.error('Token refresh failed:', error.message);
    }
  });


  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Token refresh service shutting down...');
    tokenJob.cancel();
  });

  return tokenJob;
}

// Otomatik anket doldurma test endpoint'i (Manuel çalıştırmak için)
app.all('/api/admin/run-anket', async (req, res) => {
  try {
    const isHeadless = req.query.headless !== 'false';
    const result = await doldurAnket(isHeadless);
    res.json(result);
  } catch (error) {
    console.error("Anket manuel çalıştırma hatası:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Anket zamanlayıcısını başlat (Her gün saat 01:00 TSİ)
scheduleAnketJob();

// ==================== TEST GRUPLARI İÇİN SAHTE OKUMA VERİSİ EKLEYICI ====================

// Test grubu ID'leri
const TEST_GROUP_IDS = [
  'ali-kacar',
  'maksat114',
  'ısık-hızı',
  'yozgatlılar',
  'bilimin-ısıgında',
  'bozok-universitesi',
  'firat-genclik',
  'yozgat-gobelleri',
  'hisar-kapisi-cekirdek-kadro'
];

function typicalTestAmountForUser(userId) {
  let h = 0;
  const s = String(userId);
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  const bases = [10, 15, 20, 30, 50, 80];
  return bases[Math.abs(h) % bases.length];
}

function jitterTestAmount(base) {
  const r = Math.random();
  if (r < 0.55) return base;
  if (r < 0.75) return Math.max(5, base - 5);
  if (r < 0.92) return base + 10;
  return base + 20;
}

async function seedFakeReadingDataForTestGroups() {
  console.log('🤖 [TestSeeder] Sahte okuma verisi ekleme başladı...');

  // Dünün tarihini Europe/Istanbul saat dilimiyle hesapla
  const yesterday = moment().utcOffset(3).subtract(1, 'days').format('YYYY-MM-DD');
  console.log(`📅 [TestSeeder] Hedef tarih: ${yesterday}`);

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const groupId of TEST_GROUP_IDS) {
    try {
      // Grubun koleksiyonlarını al
      const { users, readingStatuses } = getGroupCollections(groupId);

      // Gruptaki tüm kullanıcıları çek
      const allUsers = await users.find().lean();

      if (!allUsers || allUsers.length === 0) {
        console.log(`⚠️  [TestSeeder] ${groupId}: Kullanıcı bulunamadı, atlanıyor.`);
        continue;
      }

      console.log(`👥 [TestSeeder] ${groupId}: ${allUsers.length} kullanıcı işlenecek.`);

      for (const user of allUsers) {
        try {
          const userId = user._id.toString();

          // Zaten bu tarih için kayıt var mı kontrol et
          const existing = await readingStatuses.findOne({ userId, date: yesterday }).lean();
          if (existing) {
            // Kayıt zaten mevcutsa dokunma
            totalSkipped++;
            continue;
          }

          // %90 ihtimalle "okudum", %10 ihtimalle "okumadım"
          const rand = Math.random();
          const status = rand < 0.90 ? 'okudum' : 'okumadım';
          const doc = {
            userId,
            date: yesterday,
            status
          };
          if (status === 'okudum') {
            doc.amount = jitterTestAmount(typicalTestAmountForUser(userId));
          }
          await readingStatuses.create(doc);
          totalInserted++;
        } catch (userErr) {
          console.error(`❌ [TestSeeder] ${groupId} kullanıcı hatası (${user._id}):`, userErr.message);
          totalErrors++;
        }
      }

      console.log(`✅ [TestSeeder] ${groupId}: Tamamlandı.`);
    } catch (groupErr) {
      console.error(`❌ [TestSeeder] ${groupId} grup hatası:`, groupErr.message);
      totalErrors++;
    }
  }

  console.log(`🏁 [TestSeeder] Tamamlandı! Eklenen: ${totalInserted}, Atlanan: ${totalSkipped}, Hata: ${totalErrors}`);

  // Test grubuna veri attıktan sonra geri kalan tüm gerçek gruplara otomatik işlem yap
  await processMissingReadingStatusesForRealGroups();
}

// Gerçek gruplarda düne ait okuma kaydı olmayan aktif kullanıcılara 'okumadım' ekleyen fonksiyon
async function processMissingReadingStatusesForRealGroups() {
  console.log('🔄 [AutoUnreadProcessor] Gerçek gruplar için eksik "okumadım" kayıtları işleniyor...');

  const yesterday = moment().utcOffset(3).subtract(1, 'days').format('YYYY-MM-DD');
  console.log(`📅 [AutoUnreadProcessor] Hedef tarih: ${yesterday}`);

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  try {
    const realGroups = await UserGroup.find({ groupId: { $nin: TEST_GROUP_IDS } }).lean();

    for (const group of realGroups) {
      // Grup seviyesinde otomatik işaretleme pasifse atla
      if (group.autoMarkUnread === false) {
        console.log(`⏸️  [AutoUnreadProcessor] ${group.groupId}: Otomatik okumadım kaydı pasif, atlanıyor.`);
        continue;
      }

      try {
        const { users, readingStatuses } = getGroupCollections(group.groupId);
        const allUsers = await users.find().lean();

        if (!allUsers || allUsers.length === 0) continue;

        for (const user of allUsers) {
          try {
            const userId = user._id.toString();

            // Şart: Bir kişinin en az 1 okuma verisi olmalı
            const hasAnyReadingStatus = await readingStatuses.exists({ userId });
            if (!hasAnyReadingStatus) {
              totalSkipped++;
              continue;
            }

            // Dün tarihli bir kaydı var mı?
            const yesterdayRecord = await readingStatuses.findOne({ userId, date: yesterday }).lean();
            if (!yesterdayRecord) {
              await readingStatuses.create({
                userId,
                date: yesterday,
                status: 'okumadım'
              });
              totalInserted++;
            } else {
              totalSkipped++;
            }
          } catch (userErr) {
            console.error(`❌ [AutoUnreadProcessor] ${group.groupId} kullanıcı hatası (${user._id}):`, userErr.message);
            totalErrors++;
          }
        }
      } catch (groupErr) {
        console.error(`❌ [AutoUnreadProcessor] ${group.groupId} grup hatası:`, groupErr.message);
        totalErrors++;
      }
    }
  } catch (err) {
    console.error('❌ [AutoUnreadProcessor] Grupları çekme hatası:', err.message);
  }

  console.log(`🏁 [AutoUnreadProcessor] Tamamlandı! Eklenen: ${totalInserted}, Atlanan: ${totalSkipped}, Hata: ${totalErrors}`);
}

// Otomatik okumadım kaydı ekleme işlemi için manuel admin endpoint'i
app.all('/api/admin/process-missing-statuses', async (req, res) => {
  try {
    await processMissingReadingStatusesForRealGroups();
    res.json({ success: true, message: 'Gerçek gruplar için eksik okumadım kayıtları işlendi.' });
  } catch (error) {
    console.error('Manuel okumadım işleme hatası:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test grubu sahte veri zamanlayıcısını başlat
function scheduleTestGroupSeeder() {
  // Her gün saat 06:00'da çalış (Europe/Istanbul)
  const seederJob = schedule.scheduleJob({ rule: '0 6 * * *', tz: 'Europe/Istanbul' }, async () => {
    console.log('⏰ [TestSeeder] 06:00 - Sahte okuma verisi ekleme tetiklendi.');
    await seedFakeReadingDataForTestGroups();
  });

  console.log('✅ Test grubu sahte veri zamanlayıcısı başlatıldı (Her gün 06:00, Europe/Istanbul).');

  process.on('SIGINT', () => {
    seederJob && seederJob.cancel();
  });

  return seederJob;
}

// Start the schedulers
const backupJob = scheduleBackup();
const pingJob = schedulePing();
const tokenJob = scheduleTokenRefresh();
const vecizeJobs = scheduleDailyNotifications();
const testSeederJob = scheduleTestGroupSeeder();

// ==================== Profile Management API Endpoints ====================

// Profil resmi güncelleme
app.post('/api/update-user-profile', upload.single('profileImage'), async (req, res) => {
  try {
    const { userId, groupId } = req.body;

    if (!userId || !groupId) {
      return res.status(400).json({ success: false, message: 'Kullanıcı ID ve Grup ID gerekli' });
    }

    const User = mongoose.model(`users_${groupId}`, userSchema, `users_${groupId}`);

    if (req.file) {
      const grpMeta = await UserGroup.findOne({ groupId }).lean();
      const uDoc = await User.findById(userId).lean();
      const origName = req.file.originalname || 'profil.jpg';
      const dropboxFileName = buildDropboxImageFileName({
        prefix: 'profil',
        groupName: grpMeta ? grpMeta.groupName : groupId,
        groupId,
        userLabel: (uDoc && (uDoc.name || uDoc.username)) || String(userId),
        sourceBase: path.parse(origName).name,
        ext: (path.extname(origName) || '.jpg').toLowerCase()
      });
      const dropboxUrl = await uploadToDropboxWithRetry(req.file.buffer, dropboxFileName, 'userImages');

      // Veritabanını güncelle
      await User.findByIdAndUpdate(userId, { profileImage: dropboxUrl });

      res.json({
        success: true,
        message: 'Profil resmi güncellendi',
        profileImageUrl: dropboxUrl
      });
    } else {
      res.status(400).json({ success: false, message: 'Resim dosyası bulunamadı' });
    }
  } catch (error) {
    console.error('Profil resmi güncellenirken hata:', error);
    res.status(500).json({ success: false, message: 'Profil resmi güncellenemedi' });
  }
});

// Avatar güncelleme
app.post('/api/update-user-avatar', async (req, res) => {
  try {
    const { userId, groupId, avatarPath } = req.body;

    if (!userId || !groupId || !avatarPath) {
      return res.status(400).json({ success: false, message: 'Gerekli parametreler eksik' });
    }

    const User = mongoose.model(`users_${groupId}`, userSchema, `users_${groupId}`);

    // Veritabanını güncelle
    await User.findByIdAndUpdate(userId, { profileImage: avatarPath });

    res.json({
      success: true,
      message: 'Avatar güncellendi'
    });
  } catch (error) {
    console.error('Avatar güncellenirken hata:', error);
    res.status(500).json({ success: false, message: 'Avatar güncellenemedi' });
  }
});

// Kullanıcı ayarları güncelleme
app.post('/api/update-user-settings', async (req, res) => {
  try {
    const { userId, groupId, username, memberName, password } = req.body;

    if (!userId || !groupId) {
      return res.status(400).json({ success: false, message: 'Kullanıcı ID ve Grup ID gerekli' });
    }

    const User = mongoose.model(`users_${groupId}`, userSchema, `users_${groupId}`);

    const updateData = {};
    if (username) updateData.name = username;
    if (memberName) updateData.username = memberName;
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateData.userpassword = hashedPassword;
    }

    await User.findByIdAndUpdate(userId, updateData);

    res.json({
      success: true,
      message: 'Ayarlar güncellendi'
    });
  } catch (error) {
    console.error('Ayarlar güncellenirken hata:', error);
    res.status(500).json({ success: false, message: 'Ayarlar güncellenemedi' });
  }
});


// Profil resmi silme
app.post('/api/remove-user-profile-image', async (req, res) => {
  try {
    const { userId, groupId } = req.body;

    if (!userId || !groupId) {
      return res.status(400).json({ success: false, message: 'Kullanıcı ID ve Grup ID gerekli' });
    }

    const User = mongoose.model(`users_${groupId}`, userSchema, `users_${groupId}`);

    // Kullanıcının mevcut profil resmini al
    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
    }

    const oldImageUrl = user.profileImage;

    // Veritabanını default resim ile güncelle
    await User.findByIdAndUpdate(userId, { profileImage: '/images/default.png' });

    // Eski resmi Dropbox'tan sil (arka planda)
    if (isDropboxHostedUrl(oldImageUrl)) {
      deleteFromDropboxByUrl(oldImageUrl).catch(err =>
        console.error('Eski profil resmi silme hatası:', err)
      );
    }

    res.json({
      success: true,
      message: 'Profil resmi silindi'
    });
  } catch (error) {
    console.error('Profil resmi silinirken hata:', error);
    res.status(500).json({ success: false, message: 'Profil resmi silinemedi' });
  }
});


// ============================================================================
// WHATSAPP ANKET (POLL) VOTE SENKRONİZASYONU
// ============================================================================

// --- Lig Sabitleri (frontend user-cards.js ile senkronize) ---
const LEAGUES = [
  { name: 'Bronz', min: 0, max: 5 },
  { name: 'Gümüş', min: 5, max: 10 },
  { name: 'Altın', min: 10, max: 20 },
  { name: 'İnci', min: 20, max: 40 },
  { name: 'Safir', min: 40, max: 60 },
  { name: 'Zümrüt', min: 60, max: 100 },
  { name: 'Elmas', min: 100, max: 150 },
  { name: 'Yakut', min: 150, max: 200 },
  { name: 'Mercan', min: 200, max: 365 },
  { name: 'Pırlanta', min: 365, max: 9999 }
];

/**
 * Verilen okudum sayısına göre ligin adını ve min değerini döndürür.
 * @param {number} okudumCount
 * @returns {{ name: string, min: number, max: number }}
 */
function calculateUserLeague(okudumCount) {
  return LEAGUES.find(l => okudumCount >= l.min && okudumCount < l.max) || LEAGUES[LEAGUES.length - 1];
}

// --- Lig Atlama Kuyruğu: pending_league_congratulations ---
const pendingCongratSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  name: { type: String },
  phone: { type: String },
  groupId: { type: String, required: true },
  groupName: { type: String },
  league: { type: String, required: true },
  leagueMin: { type: Number },
  promotionDate: { type: String }, // YYYY-MM-DD formatında lig atlama tarihi
  createdAt: { type: Date, default: Date.now },
  status: { type: String, default: 'pending' } // 'pending' | 'sent'
});

// Aynı kullanıcı aynı grup aynı lig için birden fazla kutlama gitmemesi için unique index
pendingCongratSchema.index({ userId: 1, groupId: 1, league: 1 }, { unique: true });
// 1 saat (3600 saniye) sonra otomatik sil — koleksiyon şişmesini önler
pendingCongratSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 });

const PendingCongrat = mongoose.model('PendingCongrat', pendingCongratSchema, 'pending_league_congratulations');

/**
 * Kullanıcının toplam okudum sayısını hesaplar ve lig atladıysa
 * pending_league_congratulations koleksiyonuna bir doküman ekler.
 *
 * Kutlama panelinin gözükmesindeki mantıkla birebir eşleşir (user-cards.js):
 *  - Bronz (min=0) ligi başlangıç ligi, kutlanmaz.
 *  - currentLeague !== lastCongratulatedLeague VE currentLeague rank > lastCongratulated rank ise kutla.
 *
 * @param {object} user       - Kullanıcı dokümanı (lean, { _id, name, phone, lastCongratulatedLeague })
 * @param {string} groupId    - Grubun ID'si
 * @param {string} groupName  - Grubun adı
 * @param {string} dateStr    - Okumanın tarihi (YYYY-MM-DD), lig atlama tarihi olarak saklanır
 */
async function checkAndQueueLeaguePromotion(user, groupId, groupName, dateStr) {
  try {
    const { readingStatuses } = getGroupCollections(groupId);
    const userId = String(user._id);

    // Kullanıcının toplam okudum sayısını hesapla
    const okudumCount = await readingStatuses.countDocuments({ userId, status: 'okudum' });

    // Mevcut liği bul
    const currentLeague = calculateUserLeague(okudumCount);

    // Bronz (min=0) başlangıç ligi — kutlanmaz
    if (currentLeague.min === 0) return;

    // lastCongratulatedLeague alanını oku (yoksa 'Bronz' varsay)
    const lastC = (user.lastCongratulatedLeague != null && String(user.lastCongratulatedLeague).trim() !== '')
      ? String(user.lastCongratulatedLeague).trim()
      : 'Bronz';

    // Zaten bu lig kutlandıysa çık
    if (currentLeague.name === lastC) return;

    // Lig sıralaması kontrolü (gerileme durumunda kutlama yapma)
    const rCur = LEAGUES.findIndex(l => l.name === currentLeague.name);
    const rLast = LEAGUES.findIndex(l => l.name === lastC);
    if (rCur < rLast) return;

    // Lig atlama tarihi: okumanın tarihi
    const promotionDate = dateStr || moment().utcOffset(3).format('YYYY-MM-DD');

    // Kuyruğa ekle (upsert: aynı userId+groupId+league kombinasyonu varsa güncelle, yoksa ekle)
    await PendingCongrat.findOneAndUpdate(
      { userId, groupId, league: currentLeague.name },
      {
        $set: {
          name: user.name || '',
          phone: user.phone || '',
          groupName: groupName || groupId,
          leagueMin: currentLeague.min,
          promotionDate,
          status: 'pending'
        },
        $setOnInsert: {
          createdAt: new Date()
        }
      },
      { upsert: true, returnDocument: 'after' }
    );

    console.log(`🏆 Lig Atlama Kuyruğu: ${user.name} (${user.phone}) → ${currentLeague.name} ligi. (Grup: ${groupId}, Tarih: ${promotionDate})`);
  } catch (err) {
    // Unique index ihlali (11000) veya başka bir hata → sessizce geç, okudum akışını etkileme
    if (err.code !== 11000) {
      console.error('checkAndQueueLeaguePromotion hatası:', err.message);
    }
  }
}

const pollSchema = new mongoose.Schema({
  pollId: String,
  createdAt: { type: Date },
  groupId: String,
  options: [String],
  title: String
}, { strict: false });

const pollVoteSchema = new mongoose.Schema({
  voterJid: String,
  pollId: String,
  pushName: String,
  selectedOptions: [String],
  updatedAt: String,
  voterPhone: String,
  readingGroupId: String,
  configKey: String
}, { strict: false });

const Poll = mongoose.model('Poll', pollSchema, 'polls');
const PollVote = mongoose.model('PollVote', pollVoteSchema, 'poll_votes');

// WhatsApp metin/mesaj oyları (anket dışında gelen okuma bildirimleri)
const textVoteSchema = new mongoose.Schema({
  voterJid: String,
  pushName: String,
  selectedOptions: [String],
  updatedAt: String,
  voterPhone: String,
  readingGroupId: String,
  configKey: String,
  date: String
}, { strict: false });

const TextVote = mongoose.model('TextVote', textVoteSchema, 'text_votes');

// Anket başlığından (title) tarih çıkarma fonksiyonu (Örn: "4 Ağustos", "04.08.2026", "2026-08-04")
function extractDateFromPollTitle(title, referenceYear) {
  if (!title || typeof title !== 'string') return null;
  const cleanedTitle = title.trim();
  const year = referenceYear || moment().utcOffset(3).year();

  // Pattern 1: ISO Format "YYYY-MM-DD"
  const isoMatch = cleanedTitle.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = String(isoMatch[2]).padStart(2, '0');
    const d = String(isoMatch[3]).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Pattern 2: Sayısal "DD.MM.YYYY" veya "DD.MM"
  const numMatch = cleanedTitle.match(/(\d{1,2})[-/.](\d{1,2})(?:[-/.](20\d{2}))?/);
  if (numMatch) {
    const d = String(numMatch[1]).padStart(2, '0');
    const m = String(numMatch[2]).padStart(2, '0');
    const y = numMatch[3] || String(year);
    if (parseInt(m, 10) >= 1 && parseInt(m, 10) <= 12 && parseInt(d, 10) >= 1 && parseInt(d, 10) <= 31) {
      return `${y}-${m}-${d}`;
    }
  }

  // Pattern 3: Türkçe Ay İsimli Format ("4 Ağustos", "04 Ağustos 2026")
  const monthMap = {
    'ocak': '01', 'subat': '02', 'şubat': '02', 'mart': '03', 'nisan': '04',
    'mayis': '05', 'mayıs': '05', 'haziran': '06', 'temmuz': '07', 'agustos': '08',
    'ağustos': '08', 'eylul': '09', 'eylül': '09', 'ekim': '10', 'kasim': '11',
    'kasım': '11', 'aralik': '12', 'aralık': '12'
  };

  const trMatch = cleanedTitle.match(/(\d{1,2})\s+([a-zA-ZçğıöşüÇĞİÖŞÜ]+)(?:\s+(20\d{2}))?/i);
  if (trMatch) {
    const dayStr = String(trMatch[1]).padStart(2, '0');
    const monthName = trMatch[2].toLowerCase('tr-TR');
    const yStr = trMatch[3] || String(year);

    if (monthMap[monthName]) {
      return `${yStr}-${monthMap[monthName]}-${dayStr}`;
    }
  }

  return null;
}

/** polls.createdAt (Date veya eski string) → TR günü "YYYY-MM-DD" */
function pollCreatedAtToDateStr(createdAt) {
  if (!createdAt) return null;

  if (createdAt instanceof Date) {
    if (Number.isNaN(createdAt.getTime())) return null;
    return moment(createdAt).utcOffset(3).format('YYYY-MM-DD');
  }

  const raw = String(createdAt).trim();
  if (!raw) return null;

  // Eski string biçim: "2026-08-04 12:43:07"
  const spaceDate = raw.split(' ')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(spaceDate) && !raw.includes('T')) {
    return spaceDate;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return moment(parsed).utcOffset(3).format('YYYY-MM-DD');
}

/** selectedOptions[0] → finite sayı; değilse null */
function parseAmountFromSelectedOptions(selectedOptions) {
  if (!Array.isArray(selectedOptions) || !selectedOptions.length) return null;
  const n = Number(String(selectedOptions[0]).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** readingstatuses upsert: status + opsiyonel amount */
async function upsertReadingStatusWithAmount(readingStatuses, userId, dateStr, selectedOptions) {
  const amount = parseAmountFromSelectedOptions(selectedOptions);
  const update = {
    $set: { userId, date: dateStr, status: 'okudum' }
  };
  if (amount != null) {
    update.$set.amount = amount;
  } else {
    update.$unset = { amount: 1 };
  }
  await readingStatuses.findOneAndUpdate(
    { userId, date: dateStr },
    update,
    { upsert: true, returnDocument: 'after' }
  );
  return amount;
}

// Oy değişikliğini okuma durumuna (readingstatuses_<groupId>) senkronize eden fonksiyon
// selectedOptions dizisine bakarak karar verir:
//   - selectedOptions.length > 0  → "okudum" ekle
//   - selectedOptions.length === 0 → "okudum" sil (oy geri çekilmiş)
async function syncPollVoteToReadingStatus(voteDoc) {
  try {
    if (!voteDoc || !voteDoc.pollId) return;

    // Oy veren kullanıcının telefon numarasını temizle (örn: 905010734844)
    const rawPhone = voteDoc.voterPhone || voteDoc.voterJid || '';
    const phone = formatPhoneNumber(rawPhone);
    if (!phone) return;

    // İlgili anketi (poll) bul
    const poll = await Poll.findOne({ pollId: voteDoc.pollId }).lean();

    // Tarih tespiti öncelik sırası:
    // 1. Anket Başlığı (poll.title) -> Örn: "4 Ağustos" -> "2026-08-04"
    // 2. Anket Oluşturulma Tarihi (poll.createdAt, Date) -> TR günü "2026-08-04"
    // 3. Oy Güncellenme Tarihi (voteDoc.updatedAt) -> Örn: "2026-08-04 12:25:30" -> "2026-08-04"
    // 4. Bugünün Tarihi
    const createdAtDateStr = pollCreatedAtToDateStr(poll && poll.createdAt);
    let referenceYear = moment().utcOffset(3).year();
    if (createdAtDateStr) {
      const yearFromCreatedAt = parseInt(createdAtDateStr.slice(0, 4), 10);
      if (Number.isFinite(yearFromCreatedAt)) referenceYear = yearFromCreatedAt;
    }

    let dateStr = null;
    if (poll && poll.title) {
      dateStr = extractDateFromPollTitle(poll.title, referenceYear);
    }

    if (!dateStr && createdAtDateStr) {
      dateStr = createdAtDateStr;
    }

    if (!dateStr && voteDoc && voteDoc.updatedAt) {
      dateStr = voteDoc.updatedAt.split(' ')[0];
    }

    if (!dateStr) {
      dateStr = moment().utcOffset(3).format('YYYY-MM-DD');
    }

    // Oy verilmiş mi kontrol et (selectedOptions dizisi dolu mu?)
    const hasVoted = Array.isArray(voteDoc.selectedOptions) && voteDoc.selectedOptions.length > 0;

    // Hedef okuma grubu tespiti (voteDoc.readingGroupId veya poll.groupId)
    const targetGroupId = voteDoc.readingGroupId || poll?.groupId;

    if (targetGroupId) {
      // Doğrudan ilgili gruptan işlem yap
      const { users, readingStatuses } = getGroupCollections(targetGroupId);
      const user = await users.findOne({ phone }).lean();

      if (user) {
        const userId = user._id.toString();

        if (hasVoted) {
          // Kullanıcı oy vermiş -> readingstatuses_<groupId> koleksiyonuna "okudum" kaydı ekle/güncelle
          await upsertReadingStatusWithAmount(
            readingStatuses,
            userId,
            dateStr,
            voteDoc.selectedOptions
          );
          console.log(`✅ WhatsApp Anket Senkronizasyonu: ${user.name} (${phone}) - ${dateStr} için 'okudum' eklendi. (Grup: ${targetGroupId})`);

          // Lig atlama kontrolü: okuma kaydı eklendikten sonra yeni ligi kontrol et
          const group = await UserGroup.findOne({ groupId: targetGroupId }).lean();
          await checkAndQueueLeaguePromotion(user, targetGroupId, group?.groupName || targetGroupId, dateStr);
        } else {
          // Kullanıcı oyunu geri çekmiş (selectedOptions boş) -> okuma bilgisini sil
          await readingStatuses.findOneAndDelete({ userId, date: dateStr });
          console.log(`🗑️ WhatsApp Anket Senkronizasyonu: ${user.name} (${phone}) - ${dateStr} 'okudum' kaydı silindi. (Grup: ${targetGroupId})`);
        }
      } else {
        console.warn(`⚠️ WhatsApp Anket Senkronizasyonu: ${phone} telefon numaralı kullanıcı '${targetGroupId}' grubunda bulunamadı.`);
      }
    } else {
      // Fallback: readingGroupId bilgisi yoksa veritabanındaki tüm grupları tara
      const groups = await UserGroup.find({}).lean();

      for (const group of groups) {
        const { users, readingStatuses } = getGroupCollections(group.groupId);
        const user = await users.findOne({ phone }).lean();

        if (user) {
          const userId = user._id.toString();

          if (hasVoted) {
            await upsertReadingStatusWithAmount(
              readingStatuses,
              userId,
              dateStr,
              voteDoc.selectedOptions
            );
            console.log(`✅ WhatsApp Anket Senkronizasyonu: ${user.name} (${phone}) - ${dateStr} için 'okudum' eklendi. (Grup: ${group.groupId})`);

            // Lig atlama kontrolü: okuma kaydı eklendikten sonra yeni ligi kontrol et
            await checkAndQueueLeaguePromotion(user, group.groupId, group.groupName || group.groupId, dateStr);
          } else {
            await readingStatuses.findOneAndDelete({ userId, date: dateStr });
            console.log(`🗑️ WhatsApp Anket Senkronizasyonu: ${user.name} (${phone}) - ${dateStr} 'okudum' kaydı silindi. (Grup: ${group.groupId})`);
          }
        }
      }
    }
  } catch (error) {
    console.error('WhatsApp anket senkronizasyon hatası:', error);
  }
}

/** text_votes / poll_votes ortak: telefona göre kullanıcı bul; yoksa pushName ↔ name */
async function findUserForWhatsAppVote(usersCollection, phone, pushName) {
  if (phone) {
    const byPhone = await usersCollection.findOne({ phone }).lean();
    if (byPhone) return byPhone;
  }
  const nameHint = pushName != null ? String(pushName).trim() : '';
  if (!nameHint) return null;
  const byName = await usersCollection.findOne({
    name: { $regex: `^${nameHint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }
  }).lean();
  return byName || null;
}

function resolveTextVoteDate(voteDoc) {
  if (voteDoc && voteDoc.date && /^\d{4}-\d{2}-\d{2}$/.test(String(voteDoc.date).trim())) {
    return String(voteDoc.date).trim();
  }
  if (voteDoc && voteDoc.updatedAt) {
    const part = String(voteDoc.updatedAt).split(' ')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(part)) return part;
  }
  return moment().utcOffset(3).format('YYYY-MM-DD');
}

// text_votes dokümanını readingstatuses_<groupId> ile senkronize et
async function syncTextVoteToReadingStatus(voteDoc) {
  try {
    if (!voteDoc) return;

    const rawPhone = voteDoc.voterPhone || voteDoc.voterJid || '';
    const phone = formatPhoneNumber(rawPhone);
    const pushName = voteDoc.pushName || '';
    const dateStr = resolveTextVoteDate(voteDoc);
    const hasVoted = Array.isArray(voteDoc.selectedOptions) && voteDoc.selectedOptions.length > 0;
    const targetGroupId = voteDoc.readingGroupId != null
      ? String(voteDoc.readingGroupId).trim()
      : '';

    async function applyToGroup(groupId, groupName) {
      const { users, readingStatuses } = getGroupCollections(groupId);
      const user = await findUserForWhatsAppVote(users, phone, pushName);

      if (!user) {
        console.warn(
          `⚠️ WhatsApp Mesaj Senkronizasyonu: kullanıcı bulunamadı ` +
          `(phone: ${phone || '—'}, pushName: ${pushName || '—'}, grup: ${groupId}).`
        );
        return;
      }

      const userId = user._id.toString();
      if (hasVoted) {
        await upsertReadingStatusWithAmount(
          readingStatuses,
          userId,
          dateStr,
          voteDoc.selectedOptions
        );
        console.log(
          `✅ WhatsApp Mesaj Senkronizasyonu: ${user.name} (${phone || pushName}) - ` +
          `${dateStr} için 'okudum' eklendi. (Grup: ${groupId})`
        );
        await checkAndQueueLeaguePromotion(
          user,
          groupId,
          groupName || groupId,
          dateStr
        );
      } else {
        const today = moment().utcOffset(3).format('YYYY-MM-DD');
        // selectedOptions [] : bugün → kaydı sil (➖); geçmiş gün → okumadım (✖)
        if (dateStr < today) {
          await readingStatuses.findOneAndUpdate(
            { userId, date: dateStr },
            {
              $set: { userId, date: dateStr, status: 'okumadım' },
              $unset: { amount: 1 }
            },
            { upsert: true, returnDocument: 'after' }
          );
          console.log(
            `✖ WhatsApp Mesaj Senkronizasyonu: ${user.name} (${phone || pushName}) - ` +
            `${dateStr} 'okumadım' olarak ayarlandı. (Grup: ${groupId})`
          );
        } else {
          await readingStatuses.findOneAndDelete({ userId, date: dateStr });
          console.log(
            `🗑️ WhatsApp Mesaj Senkronizasyonu: ${user.name} (${phone || pushName}) - ` +
            `${dateStr} okuma kaydı silindi (➖). (Grup: ${groupId})`
          );
        }
      }
    }

    if (targetGroupId) {
      const group = await UserGroup.findOne({ groupId: targetGroupId }).lean();
      await applyToGroup(targetGroupId, group?.groupName);
    } else {
      const groups = await UserGroup.find({}).lean();
      for (const group of groups) {
        await applyToGroup(group.groupId, group.groupName);
      }
    }
  } catch (error) {
    console.error('WhatsApp mesaj senkronizasyon hatası:', error);
  }
}

async function performTextVotesSync() {
  try {
    const pendingVotes = await TextVote.find({}).lean();
    if (pendingVotes.length === 0) return;

    for (const voteDoc of pendingVotes) {
      try {
        await syncTextVoteToReadingStatus(voteDoc);
        await TextVote.deleteOne({ _id: voteDoc._id });
        console.log(
          `🗑️ text_votes dokümanı işlendi ve silindi: ${voteDoc._id} ` +
          `(date: ${voteDoc.date}, voter: ${voteDoc.voterPhone || voteDoc.voterJid || voteDoc.pushName})`
        );
      } catch (voteErr) {
        console.error(`Text vote işleme hatası (${voteDoc._id}):`, voteErr.message);
      }
    }
  } catch (err) {
    console.error('TextVotes periyodik senkronizasyon hatası:', err.message);
  }
}

function startTextVoteSyncEngine() {
  performTextVotesSync();
  setInterval(performTextVotesSync, 10000);

  try {
    const changeStream = TextVote.watch([], { fullDocument: 'updateLookup' });
    changeStream.on('change', () => {
      performTextVotesSync();
    });
    changeStream.on('error', () => {});
  } catch (err) {
    // Change Stream yoksa periyodik tarama yeterli
  }

  console.log('🔄 WhatsApp TextVote (mesaj) Senkronizasyon Motoru başlatıldı.');
}

// Senkronizasyon Motoru: poll_votes koleksiyonundaki yeni dokümanları işle ve sil
// WhatsApp her seferinde poll_votes'a doküman ekler. Biz dokümanı okuyup
// readingstatuses'e yansıttıktan sonra poll_votes'tan sileriz.
async function performPollVotesSync() {
  try {
    const pendingVotes = await PollVote.find({}).lean();
    if (pendingVotes.length === 0) return;

    for (const voteDoc of pendingVotes) {
      try {
        // 1. Oy dokümanını readingstatuses'e senkronize et
        await syncPollVoteToReadingStatus(voteDoc);

        // 2. İşlem tamamlandı, poll_votes'tan dokümanı sil
        await PollVote.deleteOne({ _id: voteDoc._id });
        console.log(`🗑️ poll_votes dokümanı işlendi ve silindi: ${voteDoc._id} (pollId: ${voteDoc.pollId}, voter: ${voteDoc.voterPhone || voteDoc.voterJid})`);
      } catch (voteErr) {
        console.error(`Poll vote işleme hatası (${voteDoc._id}):`, voteErr.message);
        // Tek bir doküman hata verirse diğerlerine devam et
      }
    }
  } catch (err) {
    console.error('PollVotes periyodik senkronizasyon hatası:', err.message);
  }
}

// Senkronizasyon servisini başlat
function startPollVoteSyncEngine() {
  // İlk taramayı hemen yap
  performPollVotesSync();

  // Her 10 saniyede bir otomatik tara
  setInterval(performPollVotesSync, 10000);

  // MongoDB Replica Set / Atlas ortamlarında Change Stream ile anlık tetikleme
  try {
    const changeStream = PollVote.watch([], { fullDocument: 'updateLookup' });

    changeStream.on('change', () => {
      performPollVotesSync();
    });

    changeStream.on('error', () => {
      // Standalone MongoDB modunda Change Stream desteklenmez; periyodik tarama devrededir.
    });
  } catch (err) {
    // Change Stream başlatılamadıysa periyodik tarama çalışmaya devam eder
  }

  console.log('🔄 WhatsApp PollVote Senkronizasyon Motoru başlatıldı.');
}

// Webhook endpoint (WhatsApp botu doğrudan HTTP isteği ile bildirmek isterse)
app.post('/api/webhook/whatsapp-poll-vote', async (req, res) => {
  try {
    const { pollVote } = req.body;
    if (!pollVote || !pollVote.pollId) {
      return res.status(400).json({ error: 'pollVote verisi eksik' });
    }

    await syncPollVoteToReadingStatus(pollVote);
    res.json({ success: true, message: 'Anket oyu başarıyla senkronize edildi' });
  } catch (error) {
    console.error('Webhook poll vote hatası:', error);
    res.status(500).json({ error: 'Senkronizasyon hatası' });
  }
});

app.post('/api/webhook/whatsapp-text-vote', async (req, res) => {
  try {
    const { textVote } = req.body;
    if (!textVote) {
      return res.status(400).json({ error: 'textVote verisi eksik' });
    }

    await syncTextVoteToReadingStatus(textVote);
    res.json({ success: true, message: 'Mesaj oyu başarıyla senkronize edildi' });
  } catch (error) {
    console.error('Webhook text vote hatası:', error);
    res.status(500).json({ error: 'Senkronizasyon hatası' });
  }
});

// Dropbox'ı başlat
initializeDropbox();

// G. SERVER BAŞLATMA
// ============================================================================

// Server başlatıldığında otomatik minify ve Senkronizasyon Motorunu çalıştır
generateMinifiedFiles();
startPollVoteSyncEngine();
startTextVoteSyncEngine();

app.listen(port, () => {
  console.log(`Uygulama http://localhost:${port} adresinde çalışıyor`);
});