// ============================================================================
// 1. KONFIGÜRASYON VE BAĞLANTILAR
// ============================================================================

const express = require('express');
const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const moment = require('moment');
require('dotenv').config({ quiet: true });
const schedule = require('node-schedule');
const https = require('https');
const { Dropbox } = require('dropbox');
const sharp = require('sharp');
const bcrypt = require('bcrypt');
const compression = require('compression');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const { rateLimit } = require('express-rate-limit');
const crypto = require('crypto');
const { scheduleAnketJob } = require('./anket/anketService');
const {
  ERP_SKO_GROUPS,
  getErpReadingsChangeVersion,
  scheduleErpReadingsSync,
  syncErpReadingsOnDemand
} = require('./anket/erpReadingsSync');
const { scheduleErpUsersSync } = require('./anket/erpUsersSync');
const ERP_SKO_GROUP_SET = new Set(ERP_SKO_GROUPS);

const app = express();
const port = process.env.PORT || 3000;
const ISTANBUL_TIME_ZONE = 'Europe/Istanbul';
const SITE_ACTIVITY_ADMIN_GROUP_ID = 'catikati23';

function istanbulDateKey(at = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ISTANBUL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = Object.fromEntries(formatter.formatToParts(at).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftDateKey(dateKey, dayCount) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + dayCount);
  return date.toISOString().slice(0, 10);
}

function istanbulYesterdayKey(at = new Date()) {
  return shiftDateKey(istanbulDateKey(at), -1);
}

function formatIstanbulDateTime(at = new Date()) {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: ISTANBUL_TIME_ZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(at);
}

// Giriş serisi hesaplama fonksiyonu
async function handleLoginStreak(user, groupId) {
  const today = istanbulDateKey();
  const yesterday = istanbulYesterdayKey();

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
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin');
  next();
});
// Statik dosyalar önbellek yönetimi:
// Kod dosyaları (.html, .js, .css, .json) için ETag revalidasyonu (no-cache, must-revalidate)
// Görsel ve medya dosyaları için performans önbelleği (3 gün)
function createStaticOptions(isMedia = false) {
  return {
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      const fileName = path.basename(filePath).toLowerCase();
      const isVersionedBundle = fileName.endsWith('.min.js') || fileName.endsWith('.min.css');

      if (!isMedia && isVersionedBundle) {
        // HTML içindeki içerik hash'i değişince URL de değişir; aynı sürüm 3 gün ağ isteği yapmadan kullanılabilir.
        res.setHeader('Cache-Control', 'public, max-age=259200, immutable');
      } else if (!isMedia && (ext === '.html' || ext === '.js' || ext === '.css' || ext === '.json' || ext === '')) {
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

app.use(express.json({ limit: '100kb' }));

const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error('Üretimde SESSION_SECRET tanımlanmalıdır.');
}
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const sessionCookieName = isProduction ? '__Host-rotakip.sid' : 'rotakip.sid';

if (!process.env.SESSION_SECRET) {
  console.warn('SESSION_SECRET tanımlı değil; oturumlar sunucu yeniden başladığında geçersiz olacak.');
}
if (isProduction) {
  app.set('trust proxy', 1);
}

const sessionStore = MongoStore.create({
  mongoUrl: process.env.MONGO_URI,
  dbName: process.env.DB_NAME,
  collectionName: 'sessions',
  stringify: false,
  touchAfter: 24 * 60 * 60
});

app.use(session({
  name: sessionCookieName,
  secret: sessionSecret,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000
  }
}));

// Etkinlik kayıtları sayfasının HTML'i de yalnızca catikati23 yöneticilerine açıktır.
// Bu rota statik dosya middleware'inden önce tanımlanmalıdır.
app.get('/admin.html', requireSiteActivityAdmin, (req, res) => {
  sendHtmlFile(res, 'admin.html');
});

app.use(express.static(path.join(__dirname, 'public'), createStaticOptions(false)));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads'), createStaticOptions(true)));
app.use('/images', express.static(path.join(__dirname, 'public/images'), createStaticOptions(true)));
app.use('/groupAvatars', express.static(path.join(__dirname, 'public/groupAvatars'), createStaticOptions(true)));
app.use('/groupImages', express.static(path.join(__dirname, 'public/groupImages'), createStaticOptions(true)));
app.use('/userAvatars', express.static(path.join(__dirname, 'public/userAvatars'), createStaticOptions(true)));
app.use('/quotes', express.static(path.join(__dirname, 'public/quotes'), createStaticOptions(true)));

function createRateLimiter(windowMs, limit, message) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: message }
  });
}

const loginLimiter = createRateLimiter(15 * 60 * 1000, 20, 'Çok fazla giriş denemesi yaptınız. Lütfen daha sonra tekrar deneyin.');
const accountCreationLimiter = createRateLimiter(60 * 60 * 1000, 10, 'Çok fazla kayıt isteği gönderdiniz. Lütfen daha sonra tekrar deneyin.');
const publicLogLimiter = createRateLimiter(60 * 1000, 60, 'Çok fazla istek gönderdiniz.');
const imageProxyLimiter = createRateLimiter(60 * 1000, 60, 'Çok fazla görsel isteği gönderdiniz.');

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

// Canvas paylaşım görsellerinde Dropbox avatarlarını aynı origin üzerinden sunar.
// Endpoint yalnızca Dropbox alan adlarını kabul eder; genel amaçlı proxy değildir.
app.get('/api/dropbox-image', imageProxyLimiter, async (req, res) => {
  const source = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  if (!source || source.length > 4096) {
    return res.status(400).json({ error: 'Geçerli bir Dropbox görsel URL’si gerekli' });
  }

  let sourceUrl;
  try {
    sourceUrl = new URL(source);
  } catch (_) {
    return res.status(400).json({ error: 'Dropbox görsel URL’si geçersiz' });
  }

  const isAllowedDropboxHost = (hostname) => {
    const normalized = String(hostname || '').toLowerCase();
    return normalized === 'dropbox.com'
      || normalized.endsWith('.dropbox.com')
      || normalized === 'dropboxusercontent.com'
      || normalized.endsWith('.dropboxusercontent.com');
  };

  if (sourceUrl.protocol !== 'https:' || !isAllowedDropboxHost(sourceUrl.hostname)) {
    return res.status(400).json({ error: 'Yalnızca Dropbox görsellerine izin verilir' });
  }
  if (sourceUrl.hostname === 'dropbox.com' || sourceUrl.hostname.endsWith('.dropbox.com')) {
    sourceUrl.searchParams.delete('dl');
    sourceUrl.searchParams.set('raw', '1');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const imageResponse = await fetch(sourceUrl, {
      redirect: 'follow',
      signal: controller.signal
    });
    if (!imageResponse.ok) {
      return res.status(502).json({ error: 'Dropbox görseli alınamadı' });
    }

    const finalUrl = new URL(imageResponse.url);
    if (!isAllowedDropboxHost(finalUrl.hostname)) {
      return res.status(502).json({ error: 'Dropbox görsel yönlendirmesi geçersiz' });
    }

    let contentType = String(imageResponse.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (contentType === 'application/octet-stream') {
      const inferredTypes = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.avif': 'image/avif'
      };
      contentType = inferredTypes[path.extname(sourceUrl.pathname).toLowerCase()] || contentType;
    }
    const allowedImageTypes = new Set([
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'image/avif'
    ]);
    if (!allowedImageTypes.has(contentType)) {
      return res.status(415).json({ error: 'Dropbox yanıtı desteklenen bir görsel değil' });
    }

    const maxImageBytes = 8 * 1024 * 1024;
    const declaredLength = Number(imageResponse.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxImageBytes) {
      return res.status(413).json({ error: 'Dropbox görseli çok büyük' });
    }

    if (!imageResponse.body) {
      return res.status(502).json({ error: 'Dropbox görseli boş döndü' });
    }
    const reader = imageResponse.body.getReader();
    const chunks = [];
    let receivedBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > maxImageBytes) {
        controller.abort();
        return res.status(413).json({ error: 'Dropbox görseli çok büyük' });
      }
      chunks.push(Buffer.from(value));
    }
    const imageBuffer = Buffer.concat(chunks, receivedBytes);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(imageBuffer);
  } catch (error) {
    if (error?.name === 'AbortError') {
      return res.status(504).json({ error: 'Dropbox görsel isteği zaman aşımına uğradı' });
    }
    console.error('Dropbox görsel proxy hatası:', error.message);
    return res.status(502).json({ error: 'Dropbox görseli alınamadı' });
  } finally {
    clearTimeout(timeoutId);
  }
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
  return istanbulDateKey();
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
    await dbx.filesUpload({
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

    // Dropbox paylasim linklerini indirme yerine dogrudan goruntu olarak sun.
    const url = new URL(shareResponse.result.url);
    url.searchParams.delete('dl');
    url.searchParams.set('raw', '1');
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

async function listAllDropboxFolderEntries(folderPath) {
  let response = await dbx.filesListFolder({ path: folderPath });
  const entries = [...response.result.entries];

  while (response.result.has_more) {
    response = await dbx.filesListFolderContinue({ cursor: response.result.cursor });
    entries.push(...response.result.entries);
  }

  return entries;
}

// URL'den Dropbox dosyasını sil
async function deleteFromDropboxByUrl(fileUrl) {
  try {
    // URL'den dosya adını ayıkla
    const url = new URL(fileUrl);
    const pathParts = url.pathname.split('/');
    const fileName = decodeURIComponent(pathParts[pathParts.length - 1]); // Son parça dosya adı


    // userImages klasöründeki tüm dosyaları listele
    const entries = await listAllDropboxFolderEntries('/userImages');

    // Dosya adını Dropbox'taki gerçek adıyla eşleştir
    const exactFile = entries.find(f => {
      // Önce tam eşleşme dene
      if (f.name === fileName) return true;

      // Timestamp kısmını karşılaştır (eski dosyalar için)
      const dbTimestamp = f.name.split('-')[0];
      const urlTimestamp = fileName.split('-')[0];
      return dbTimestamp === urlTimestamp;
    });

    if (!exactFile) {
      console.log(`ℹ️ Dropbox kullanıcı resmi zaten yok: ${fileName}`);
      return;
    }

    // Silinecek dosyanın yolu (Dropbox'taki gerçek adıyla)
    const filePath = `/userImages/${exactFile.name}`;

    // Dropbox'tan sil
    await dbx.filesDeleteV2({ path: filePath });
  } catch (error) {
    // Dosya bulunamadıysa silme işlemi idempotent olarak başarılı kabul edilir
    if (error.status === 409) {
      console.log(`ℹ️ Dropbox kullanıcı resmi zaten yok: ${fileUrl}`);
      return;
    }

    console.error('Dropbox kullanıcı resmi silme hatası:', error);
    throw error;
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

    const dropboxPath = `/groupImages/${fileName}`;

    // Dropbox'tan sil
    await dbx.filesDeleteV2({ path: dropboxPath });
  } catch (error) {
    // 409 hatası "not_found" demek, dosya zaten silinmiş - bu normal
    if (error.status === 409) {
      console.log(`ℹ️ Dropbox grup resmi zaten yok: ${fileUrl}`);
      return;
    }

    console.error('Dropbox grup resmi silme hatası:', error);
    throw error;
  }
}

async function deleteGroupDropboxImages(group, users) {
  const deletionTasks = [];
  const queuedUrls = new Set();

  const queueDeletion = (fileUrl, deleteImage) => {
    if (!isDropboxHostedUrl(fileUrl) || queuedUrls.has(fileUrl)) return;
    queuedUrls.add(fileUrl);
    deletionTasks.push(deleteImage(fileUrl));
  };

  queueDeletion(group?.groupImage, deleteGroupImageFromDropboxByUrl);
  for (const user of users) {
    queueDeletion(user.profileImage, deleteFromDropboxByUrl);
  }

  const results = await Promise.allSettled(deletionTasks);
  const errors = results
    .filter(result => result.status === 'rejected')
    .map(result => result.reason);

  if (errors.length > 0) {
    throw new AggregateError(errors, 'Gruba ait Dropbox resimleri tamamen silinemedi');
  }
}

// Multer konfigürasyonları
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]);

function imageFileFilter(req, file, cb) {
  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
  }
  cb(null, true);
}

const imageUploadOptions = {
  limits: { fileSize: MAX_IMAGE_BYTES, files: 2 },
  fileFilter: imageFileFilter
};

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
const upload = multer({ storage, ...imageUploadOptions });

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

const uploadGroupImage = multer({ storage: groupImageStorage, ...imageUploadOptions });

function getUploadedFiles(req) {
  if (req.file) return [req.file];
  if (!req.files) return [];
  return Object.values(req.files).flat();
}

async function removeUploadedFiles(req) {
  await Promise.all(getUploadedFiles(req).map(file => unlinkWithRetry(file.path)));
}

async function requireValidUploadedImages(req, res, next) {
  res.once('finish', () => {
    removeUploadedFiles(req).catch(error => console.error('Geçici yükleme dosyası silinemedi:', error.message));
  });
  try {
    for (const file of getUploadedFiles(req)) {
      const metadata = await sharp(file.path).metadata();
      if (!['jpeg', 'png', 'webp', 'gif'].includes(metadata.format)) {
        await removeUploadedFiles(req);
        return res.status(415).json({ error: 'Yalnızca JPEG, PNG, WebP veya GIF görselleri yüklenebilir.' });
      }
    }
    next();
  } catch (_) {
    await removeUploadedFiles(req);
    res.status(415).json({ error: 'Yüklenen dosya geçerli bir görsel değil.' });
  }
}

// Kullanıcı grupları modeli
const UserGroup = mongoose.model('UserGroup', {
  groupName: String,
  groupId: { type: String, required: true },
  description: String,
  groupImage: { type: String, default: null },
  visibility: { type: String, default: 'public' },
  autoMarkUnread: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// Davet modeli — expiresAt dolunca MongoDB TTL ile silinir (expireAfterSeconds: 0)
const inviteSchema = new mongoose.Schema({
  inviteTokenHash: String,
  userId: String,
  userName: String,
  groupId: String,
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } // 7 gün sonra
});
inviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const Invite = mongoose.model('Invite', inviteSchema);

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

if (mongoose.connection.readyState === 1) {
  ensureInviteTtlIndex();
} else {
  mongoose.connection.once('connected', ensureInviteTtlIndex);
}

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

if (mongoose.connection.readyState === 1) ensureApplicationIndexes();
else mongoose.connection.once('connected', ensureApplicationIndexes);

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
      autoMarkUnread,
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
      authority: "admin"
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
    const count = await users.countDocuments();

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
    const { groupName, description, visibility, autoMarkUnread } = req.body;
    if (!isValidText(groupName, 40) || !isValidText(description || '', 200, { allowEmpty: true }) ||
        !['public', 'private'].includes(visibility)) {
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
    const avatarFilePath = path.join(__dirname, 'public', avatarPath.slice(1));
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
  if (!isSafeGroupId(groupId)) throw new Error('Geçersiz grup kimliği');
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

function getAuthGroupId(req) {
  return req.params.groupId || req.body?.groupId || req.query?.groupId;
}

function isSafeGroupId(groupId) {
  const value = String(groupId || '');
  return GROUP_ID_PATTERN.test(value) && !['__proto__', 'prototype', 'constructor'].includes(value);
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 6 && password.length <= 40;
}

function isValidText(value, maxLength, { allowEmpty = false } = {}) {
  if (typeof value !== 'string') return false;
  const length = value.trim().length;
  return (allowEmpty || length > 0) && length <= maxLength;
}

function isValidReadingDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return moment(value, 'YYYY-MM-DD', true).isValid()
    && value <= istanbulDateKey();
}

function isAllowedAvatarPath(value, folder) {
  if (!value) return true;
  if (typeof value !== 'string') return false;
  const escapedFolder = folder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^/${escapedFolder}/[a-zA-Z0-9._-]+\\.(?:jpe?g|png|webp|gif)$`, 'i').test(value);
}

function getSessionMembership(req, groupId) {
  if (!isSafeGroupId(groupId) || !req.session?.memberships || !Object.hasOwn(req.session.memberships, groupId)) {
    return null;
  }
  return req.session.memberships[groupId] || null;
}

function setSessionMembership(req, groupId, user) {
  if (!isSafeGroupId(groupId)) throw new Error('Geçersiz grup kimliği');
  req.session.memberships ||= {};
  req.session.memberships[groupId] = {
    userId: String(user._id),
    authority: user.authority
  };
}

function saveSession(req) {
  return new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
}

async function authenticateSession(req, groupId, user) {
  const previousMemberships = { ...(req.session.memberships || {}) };
  const previousJoinClaims = { ...(req.session.joinClaims || {}) };
  await regenerateSession(req);
  req.session.memberships = previousMemberships;
  if (Object.keys(previousJoinClaims).length > 0) {
    req.session.joinClaims = previousJoinClaims;
  }
  setSessionMembership(req, groupId, user);
  await saveSession(req);
}

function requireGroupAuth(req, res, next) {
  const groupId = getAuthGroupId(req);
  const membership = getSessionMembership(req, groupId);
  if (!membership) {
    return res.status(401).json({ error: 'Bu işlem için giriş yapmalısınız' });
  }
  req.auth = { groupId, ...membership };
  next();
}

function requireGroupAdmin(req, res, next) {
  requireGroupAuth(req, res, () => {
    if (req.auth.authority !== 'admin') {
      return res.status(403).json({ error: 'Bu işlem için yönetici yetkisi gerekli' });
    }
    next();
  });
}

function requireSiteActivityAdmin(req, res, next) {
  const membership = getSessionMembership(req, SITE_ACTIVITY_ADMIN_GROUP_ID);
  if (!membership) {
    if (req.path === '/admin.html') {
      return res.redirect('/');
    }
    return res.status(401).json({ error: 'Bu işlem için catikati23 grubunda giriş yapmalısınız' });
  }
  if (membership.authority !== 'admin') {
    if (req.path === '/admin.html') {
      return res.redirect('/');
    }
    return res.status(403).json({ error: 'Bu işlem için catikati23 grup yöneticisi olmalısınız' });
  }
  req.auth = { groupId: SITE_ACTIVITY_ADMIN_GROUP_ID, ...membership };
  next();
}

function requireSelfOrAdmin(req, res, next) {
  requireGroupAuth(req, res, () => {
    const targetUserId = String(req.params?.userId || req.body?.userId || req.body?.id || '');
    if (req.auth.authority !== 'admin' && targetUserId !== String(req.auth.userId)) {
      return res.status(403).json({ error: 'Yalnızca kendi hesabınızı değiştirebilirsiniz' });
    }
    next();
  });
}

function requireSelf(req, res, next) {
  requireGroupAuth(req, res, () => {
    const targetUserId = String(req.params?.userId || req.body?.userId || req.body?.id || '');
    if (!targetUserId || targetUserId !== String(req.auth.userId)) {
      return res.status(403).json({ error: 'Yalnızca kendi hesabınızı değiştirebilirsiniz' });
    }
    next();
  });
}

async function requireJoinRequestAdmin(req, res, next) {
  try {
    const joinRequest = await JoinRequest.findById(req.params.requestId).lean();
    if (!joinRequest) return res.status(404).json({ error: 'Katılma isteği bulunamadı' });
    const membership = getSessionMembership(req, joinRequest.groupId);
    if (!membership || membership.authority !== 'admin') {
      return res.status(403).json({ error: 'Bu işlem için yönetici yetkisi gerekli' });
    }
    req.joinRequest = joinRequest;
    req.auth = { groupId: joinRequest.groupId, ...membership };
    next();
  } catch (error) {
    next(error);
  }
}

async function requireReadableGroup(req, res, next) {
  try {
    const groupId = getAuthGroupId(req);
    const group = await UserGroup.findOne({ groupId }).lean();
    if (!group) return res.status(404).json({ error: 'Grup bulunamadı' });
    if (group.visibility === 'private' && !getSessionMembership(req, groupId)) {
      return res.status(401).json({ error: 'Bu grubu görüntülemek için giriş yapmalısınız' });
    }
    req.group = group;
    next();
  } catch (error) {
    next(error);
  }
}

function safeUser(user, includePrivate = false) {
  const result = {
    _id: user._id,
    name: user.name,
    profileImage: user.profileImage,
    authority: user.authority,
    loginStreak: user.loginStreak,
    lastLoginDate: user.lastLoginDate,
    lastCongratulatedLeague: user.lastCongratulatedLeague
  };
  if (includePrivate) {
    result.username = user.username;
  }
  return result;
}

async function invalidateUserSessions(groupId, userId) {
  const membershipPath = `session.memberships.${groupId}`;
  await mongoose.connection.db.collection('sessions').updateMany(
    { [`${membershipPath}.userId`]: String(userId) },
    { $unset: { [membershipPath]: '' } }
  );
}

async function invalidateGroupSessions(groupId) {
  const membershipPath = `session.memberships.${groupId}`;
  await mongoose.connection.db.collection('sessions').updateMany(
    { [membershipPath]: { $exists: true } },
    { $unset: { [membershipPath]: '' } }
  );
}

app.get('/api/auth/memberships', async (req, res) => {
  try {
    const memberships = req.session.memberships || {};
    const groupIds = Object.keys(memberships);
    if (groupIds.length === 0) return res.json({ memberships: [] });

    const groups = await UserGroup.find({ groupId: { $in: groupIds } }).lean();
    const existingIds = new Set(groups.map(group => group.groupId));
    for (const groupId of groupIds) {
      if (!existingIds.has(groupId)) delete req.session.memberships[groupId];
    }

    const result = await Promise.all(groups.map(async group => {
      const membership = memberships[group.groupId];
      const { users } = getGroupCollections(group.groupId);

      // Oturum kaydı tek başına üyelik kanıtı değildir. Kullanıcı başka bir
      // cihazdan silinmiş olabileceği için ana sayfada gerçek kaydı doğrula.
      const membershipUserId = String(membership?.userId || '');
      const user = mongoose.Types.ObjectId.isValid(membershipUserId)
        ? await users.findById(membershipUserId).select('_id authority').lean()
        : null;
      if (!user) {
        delete req.session.memberships[group.groupId];
        return null;
      }

      // Veritabanındaki güncel yetkiyi oturuma yansıt.
      membership.authority = user.authority;

      return {
        groupId: group.groupId,
        userId: membership.userId,
        authority: user.authority,
        groupName: group.groupName,
        description: group.description,
        groupImage: group.groupImage,
        visibility: group.visibility,
        autoMarkUnread: group.autoMarkUnread,
        memberCount: await users.countDocuments()
      };
    }));

    await saveSession(req);
    res.json({ memberships: result.filter(Boolean) });
  } catch (error) {
    console.error('Oturum grupları alınamadı:', error);
    res.status(500).json({ error: 'Oturum bilgileri alınamadı' });
  }
});

app.get('/api/auth/me/:groupId', requireGroupAuth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await UserGroup.findOne({ groupId }).lean();
    if (!group) return res.status(404).json({ error: 'Grup bulunamadı' });

    const { users } = getGroupCollections(groupId);
    const user = await users.findById(req.auth.userId).lean();
    if (!user) {
      delete req.session.memberships[groupId];
      await saveSession(req);
      return res.status(401).json({ error: 'Oturum kullanıcısı bulunamadı' });
    }

    setSessionMembership(req, groupId, user);
    await saveSession(req);
    res.json({ user: safeUser(user, true), group });
  } catch (error) {
    console.error('Oturum doğrulanamadı:', error);
    res.status(500).json({ error: 'Oturum doğrulanamadı' });
  }
});

app.post('/api/auth/logout/:groupId', async (req, res) => {
  const { groupId } = req.params;
  if (req.session.memberships) delete req.session.memberships[groupId];
  const hasMemberships = Object.keys(req.session.memberships || {}).length > 0;
  const hasJoinClaims = Object.keys(req.session.joinClaims || {}).length > 0;

  if (!hasMemberships) delete req.session.memberships;

  if (!hasMemberships && !hasJoinClaims) {
    return req.session.destroy(error => {
      if (error) return res.status(500).json({ error: 'Oturum kapatılamadı' });
      res.clearCookie(sessionCookieName, { httpOnly: true, sameSite: 'lax', secure: isProduction, path: '/' });
      res.json({ success: true });
    });
  }
  await saveSession(req);
  res.json({ success: true });
});

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
      .select('_id name profileImage username authority loginStreak lastLoginDate lastCongratulatedLeague')
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
    if (!name || typeof name !== 'string' || name.trim().length > 40) {
      return res.status(400).json({ error: 'Kullanıcı adı 1-40 karakter arasında olmalıdır' });
    }
    if (!isAllowedAvatarPath(selectedAvatarPath, 'userAvatars')) {
      return res.status(400).json({ error: 'Geçersiz avatar seçimi' });
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

    const plainPassword = crypto.randomBytes(24).toString('base64url');
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

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
    const user = new users({
      name,
      profileImage: profileImageUrl,
      username: username,
      userpassword: hashedPassword,
      authority: "member",
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

    // Grup yönetilemez durumda kalmasın: son kullanıcı grubu silebilir, son yönetici tek başına silinemez.
    const [totalUserCount, adminCount] = await Promise.all([
      users.countDocuments(),
      users.countDocuments({ authority: 'admin' })
    ]);

    // Son yönetici, gruptaki kullanıcı sayısından bağımsız olarak hesabını silemez.
    if (user.authority === 'admin' && adminCount <= 1) {
      return res.status(409).json({ error: 'Gruptaki son yönetici sizsiniz. Grubunuzu grup ayarlarından silebilirsiniz.' });
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

    // Yetkili oturum kalmaması için önce oturumları geçersizleştir.
    await invalidateUserSessions(groupId, id);
    await users.findByIdAndDelete(id);
    if (String(req.auth.userId) === String(id)) {
      delete req.session.memberships[groupId];
    }

    // Ana kayıt silindi; ikincil verilerin temizlenememesi canlı kullanıcıyı bozmamalı.
    await readingStatuses.deleteMany({ userId: id }).catch(error =>
      console.error('Silinen kullanıcının okuma kayıtları temizlenemedi:', error)
    );
    if (isDropboxHostedUrl(user.profileImage)) {
      await deleteFromDropboxByUrl(user.profileImage).catch(error =>
        console.error('Silinen kullanıcının Dropbox resmi temizlenemedi:', error)
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası' });
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


// 3.3. OKUMA İSTATİSTİKLERİ
// ============================================================================

// ERP bağlantılı gruplarda sayfa açıldıktan sonra senkronizasyonu arka planda
// çalıştırır. İstemci yalnızca veritabanı gerçekten değiştiğinde sayfayı yeniler.
app.post('/api/erp-readings-sync/:groupId', requireReadableGroup, async (req, res) => {
  const { groupId } = req.params;
  if (!ERP_SKO_GROUP_SET.has(groupId)) {
    return res.status(404).json({ error: 'Bu grup için ERP senkronizasyonu etkin değil' });
  }

  try {
    const rawKnownVersion = Number(req.body?.knownVersion);
    const knownVersion = Number.isSafeInteger(rawKnownVersion) && rawKnownVersion >= 0
      ? rawKnownVersion
      : 0;
    const result = await syncErpReadingsOnDemand({
      db: mongoose.connection.db,
      groupId
    });
    const changeVersion = result.changeVersion ?? getErpReadingsChangeVersion(groupId);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      success: result.success !== false,
      changed: result.changed === true || changeVersion > knownVersion,
      changeVersion,
      skipped: result.skipped || null
    });
  } catch (syncError) {
    console.error(`[ErpReadingsSync:on-demand:${groupId}]`, syncError.message || syncError);
    return res.status(502).json({
      success: false,
      changed: false,
      error: 'ERP okuma verileri şu anda güncellenemedi'
    });
  }
});

// Tüm verileri çekme endpoint'i
app.get('/api/all-data/:groupId', requireReadableGroup, async (req, res) => {
  try {
    const { groupId } = req.params;

    const group = req.group;
    const erpSyncEnabled = ERP_SKO_GROUP_SET.has(groupId);
    // Sürümü sorgulardan önce al: bu sırada tamamlanan bir senkron varsa
    // istemcinin arka plan kontrolü eski anlık görüntüyü fark edebilsin.
    const erpSyncVersion = erpSyncEnabled
      ? getErpReadingsChangeVersion(groupId)
      : 0;

    // Dinamik koleksiyonları al
    const { users, readingStatuses } = getGroupCollections(groupId);

    const [usersData, statsData] = await Promise.all([
      users.find()
        .select('_id name profileImage authority loginStreak lastLoginDate lastCongratulatedLeague')
        .sort({ name: 1 })
        .lean(),
      readingStatuses.find().select('userId date status amount -_id').lean()
    ]);

    res.json({
      users: usersData.map(user => safeUser(user)),
      stats: statsData,
      group,
      erpSyncEnabled,
      erpSyncVersion
    });
  } catch (error) {
    console.error('Error fetching all data:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Lig tebriği: kullanıcıların son kutlanan lig alanını güncelle (panoda kopyalama sonrası)
app.post('/api/last-congratulated-league/:groupId', requireGroupAdmin, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items dizisi gerekli' });
    }

    const group = await UserGroup.findOne({ groupId }).lean();
    if (!group) {
      return res.status(404).json({ error: 'Grup bulunamadı' });
    }

    const { users } = getGroupCollections(groupId);
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
        const deleted = await mongoose.connection.db.collection('pending_league_congratulations').deleteMany({
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
app.get('/api/user-stats/:groupId/:userId', requireReadableGroup, async (req, res) => {
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
app.get('/api/reading-stats/:groupId', requireReadableGroup, async (req, res) => {
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
app.get('/api/longest-streaks/:groupId', requireReadableGroup, async (req, res) => {
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
app.post('/api/update-status/:groupId', requireSelfOrAdmin, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId, date, status, amount } = req.body;

    if (!mongoose.isValidObjectId(userId) || !isValidReadingDate(date)) {
      return res.status(400).json({ error: 'Geçersiz kullanıcı veya tarih' });
    }
    if (!['', 'okudum', 'okumadım'].includes(status)) {
      return res.status(400).json({ error: 'Geçersiz okuma durumu' });
    }

    const hasAmount = amount !== undefined && amount !== null && amount !== '';
    const amountNum = hasAmount ? Number(amount) : null;
    if (hasAmount && (status !== 'okudum' || !Number.isInteger(amountNum) || amountNum < 0 || amountNum > 99999)) {
      return res.status(400).json({ error: 'Okuma miktarı 0-99999 arasında bir tam sayı olmalıdır' });
    }

    // Grup var mı kontrol et
    const group = await UserGroup.findOne({ groupId }).lean();
    if (!group) {
      return res.status(404).json({ error: 'Grup bulunamadı' });
    }

    // Dinamik koleksiyonu al
    const { readingStatuses } = getGroupCollections(groupId);

    if (status) {
      if (hasAmount) {
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
    const user = await users.findById(invite.userId).lean();

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

    // Users koleksiyonundan kullanıcıyı bul (admin veya member)
    const { users } = getGroupCollections(groupId);
    const user = await users.findOne({ username }).lean();

    if (user) {
      // Şifre kontrolü
      const isPasswordValid = await bcrypt.compare(password, user.userpassword);

      if (isPasswordValid) {
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
const AccessLog = mongoose.model('AccessLog', {
  action: String,
  timestamp: Date,
  deviceInfo: Object,
  ipAddress: String,
  groupId: String
});

// Yetkisiz erişim logu endpoint'i
app.post('/api/log-unauthorized', publicLogLimiter, async (req, res) => {
  try {
    const { action, deviceInfo, groupId } = req.body;
    const gid = isSafeGroupId(groupId) ? String(groupId) : 'catikati23';
    const storedActor = await resolveLogActor(req, gid);
    const storedAction = typeof action === 'string' ? action.trim().slice(0, 100) : 'bilinmeyen_eylem';

    if (await hasLogInSameTurkeyMinute(AccessLog, {
      groupId: gid,
      action: storedAction,
      ipAddress: storedActor
    })) {
      return res.json({ success: true });
    }

    // Create a new log entry
    const log = new AccessLog({
      action: storedAction,
      timestamp: new Date(),
      deviceInfo: buildDeviceInfo(req, deviceInfo),
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
app.get('/api/access-logs', requireGroupAdmin, async (req, res) => {
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
app.delete('/api/access-logs/day', requireGroupAdmin, async (req, res) => {
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
app.get('/api/login-logs', requireGroupAdmin, async (req, res) => {
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
      const formattedDate = new Intl.DateTimeFormat('tr-TR', {
        timeZone: ISTANBUL_TIME_ZONE,
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(new Date(log.timestamp));

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
app.delete('/api/login-logs/day', requireGroupAdmin, async (req, res) => {
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
  return req.ip || req.socket?.remoteAddress || '';
}

function buildDeviceInfo(req, fallbackDeviceInfo = {}) {
  const width = Number(fallbackDeviceInfo?.screenWidth);
  const height = Number(fallbackDeviceInfo?.screenHeight);
  return {
    userAgent: String(req.headers['user-agent'] || 'unknown').slice(0, 500),
    screenWidth: Number.isFinite(width) && width > 0 && width <= 20000 ? Math.round(width) : null,
    screenHeight: Number.isFinite(height) && height > 0 && height <= 20000 ? Math.round(height) : null
  };
}

async function resolveLogActor(req, groupId) {
  const membership = getSessionMembership(req, groupId);
  if (!membership) return extractClientIp(req);

  const { users } = getGroupCollections(groupId);
  const user = await users.findById(membership.userId).select('username').lean();
  return typeof user?.username === 'string' && user.username.trim()
    ? user.username.trim().slice(0, 100)
    : extractClientIp(req);
}

async function logSiteActivity({ action, req, groupId, deviceInfo, actor }) {
  try {
    const allowedSiteActions = new Set([
      'grup_görüntüleme',
      'ana_sayfa_görüntüleme',
      'grup_oluşturma',
      'grup_silme'
    ]);
    const normalizeSiteAction = (rawAction) => {
      const a = typeof rawAction === 'string' ? rawAction.trim() : '';
      return allowedSiteActions.has(a) ? a : 'bilinmeyen_eylem';
    };

    const normalizedAction = normalizeSiteAction(action);
    const storedGroupId = isSafeGroupId(groupId) ? String(groupId) : 'catikati23';
    const storedActor = actor || await resolveLogActor(req, storedGroupId);

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
app.get('/api/site-activity-logs', requireSiteActivityAdmin, async (req, res) => {
  try {
    const { action } = req.query;
    const query = {};
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
app.get('/api/site-activity-groups', requireSiteActivityAdmin, async (req, res) => {
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
app.delete('/api/site-activity-logs/day', requireSiteActivityAdmin, async (req, res) => {
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
      groupId: req.auth.groupId,
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
app.post('/api/log-home-visit', publicLogLimiter, async (req, res) => {
  try {
    const { deviceInfo, action } = req.body || {};

    await logSiteActivity({
      action: action || 'ana_sayfa_görüntüleme',
      req,
      groupId: null,
      deviceInfo
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error logging home visit:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Ziyaret logu endpoint'i
app.post('/api/log-visit', publicLogLimiter, async (req, res) => {
  try {
    const { deviceInfo, groupId, action } = req.body || {};
    const siteAction = (action || 'grup_görüntüleme').toString().trim();
    const shouldWriteAccessLog = (
      siteAction === 'grup_görüntüleme'
    );

    const gid = isSafeGroupId(groupId) ? String(groupId) : 'catikati23';
    const storedActor = await resolveLogActor(req, gid);

    if (shouldWriteAccessLog) {
      if (!(await hasLogInSameTurkeyMinute(LoginLog, {
        groupId: gid,
        ipAddress: storedActor
      }))) {
        const log = new LoginLog({
          deviceInfo: buildDeviceInfo(req, deviceInfo),
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
      deviceInfo,
      actor: storedActor
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error logging visit:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Ziyaret logu için adblock'a daha az takılan alternatif endpoint
app.post('/api/visit-event', publicLogLimiter, async (req, res) => {
  try {
    const { deviceInfo, groupId, action } = req.body || {};
    const siteAction = (action || 'grup_görüntüleme').toString().trim();
    const shouldWriteAccessLog = (
      siteAction === 'grup_görüntüleme'
    );

    const gid = isSafeGroupId(groupId) ? String(groupId) : 'catikati23';
    const storedActor = await resolveLogActor(req, gid);

    if (shouldWriteAccessLog) {
      if (!(await hasLogInSameTurkeyMinute(LoginLog, {
        groupId: gid,
        ipAddress: storedActor
      }))) {
        const log = new LoginLog({
          deviceInfo: buildDeviceInfo(req, deviceInfo),
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
      deviceInfo,
      actor: storedActor
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

// Gruba katılma isteği modeli — 30 gün sonra TTL ile silinir
const JOIN_REQUEST_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const joinRequestSchema = new mongoose.Schema({
  groupId: String,
  userName: String,
  name: String,
  password: String,
  claimTokenHash: String,
  profileImage: String,
  status: { type: String, default: 'pending' }, // pending, accepted, rejected
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + JOIN_REQUEST_TTL_MS) }
});
joinRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const JoinRequest = mongoose.model('JoinRequest', joinRequestSchema, 'jointogroups');

function hasMatchingJoinClaimHash(joinRequest, storedHash) {
  if (!joinRequest.claimTokenHash || !/^[a-f0-9]{64}$/i.test(String(storedHash || ''))) return false;
  const actual = Buffer.from(String(storedHash), 'hex');
  const expected = Buffer.from(joinRequest.claimTokenHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function getSessionJoinClaim(req, requestId) {
  const id = String(requestId || '');
  if (!id || !req.session?.joinClaims || !Object.hasOwn(req.session.joinClaims, id)) {
    return null;
  }
  return req.session.joinClaims[id] || null;
}

function setSessionJoinClaim(req, requestId, claimToken) {
  const id = String(requestId || '');
  if (!id || !claimToken) throw new Error('Geçersiz katılma isteği oturum bilgisi');
  req.session.joinClaims ||= {};
  req.session.joinClaims[id] = crypto.createHash('sha256').update(String(claimToken)).digest('hex');
}

function clearSessionJoinClaim(req, requestId) {
  const id = String(requestId || '');
  if (!id || !req.session?.joinClaims) return;
  delete req.session.joinClaims[id];
  if (Object.keys(req.session.joinClaims).length === 0) delete req.session.joinClaims;
}

function verifyJoinRequestClaim(req, joinRequest) {
  const requestId = String(joinRequest?._id || '');
  const sessionClaimHash = getSessionJoinClaim(req, requestId);
  return hasMatchingJoinClaimHash(joinRequest, sessionClaimHash);
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

if (mongoose.connection.readyState === 1) {
  ensureJoinRequestTtlIndex();
} else {
  mongoose.connection.once('connected', ensureJoinRequestTtlIndex);
}


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


// F. YEDEKLEME HİZMETİ
// ============================================================================

const backupSourceUri = process.env.MONGO_URI;
const backupTargetUri = process.env.BACKUP_MONGO_URI;
const backupSourceDbName = process.env.DB_NAME;
const backupDbName = process.env.BACKUP_DB_NAME;

async function cleanupOldBackups(db, prefix, keepCount) {
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  const backupCollections = collections
    .map(collection => collection.name)
    .filter(name => name.startsWith(prefix))
    .sort((a, b) => b.localeCompare(a));

  for (const collectionName of backupCollections.slice(keepCount)) {
    await db.collection(collectionName).drop();
    console.log(`✅ Eski yedek silindi: ${collectionName}`);
  }
}

async function backupCollection(sourceDb, backupDb, collectionName, timestamp) {
  const backupCollectionName = `${collectionName}_backup_${timestamp}`;
  try {
    await backupDb.createCollection(backupCollectionName);
  } catch (error) {
    if (error.code !== 48) throw error;
  }
  const target = backupDb.collection(backupCollectionName);
  await target.deleteMany({});

  let documentsCopied = 0;
  let batch = [];
  for await (const document of sourceDb.collection(collectionName).find({})) {
    batch.push(document);
    if (batch.length === 1000) {
      await target.insertMany(batch);
      documentsCopied += batch.length;
      batch = [];
    }
  }
  if (batch.length > 0) {
    await target.insertMany(batch);
    documentsCopied += batch.length;
  }

  console.log(`✅ ${collectionName}: ${documentsCopied} belge ${backupCollectionName} koleksiyonuna yedeklendi`);
  await cleanupOldBackups(backupDb, `${collectionName}_backup_`, 10);
}

async function performBackup() {
  if (!backupSourceUri || !backupSourceDbName || !backupTargetUri || !backupDbName) {
    throw new Error(
      'MONGO_URI, DB_NAME, BACKUP_MONGO_URI ve BACKUP_DB_NAME tanımlı olmalıdır.'
    );
  }

  console.log('Backup: Starting...');
  const sourceClient = new MongoClient(backupSourceUri);
  const backupClient = new MongoClient(backupTargetUri);
  try {
    await Promise.all([sourceClient.connect(), backupClient.connect()]);
    const sourceDb = sourceClient.db(backupSourceDbName);
    const backupDb = backupClient.db(backupDbName);
    const now = new Date();
    const timestamp = istanbulDateKey(now);
    const collectionNames = (await sourceDb.listCollections({}, { nameOnly: true }).toArray())
      .map(collection => collection.name)
      .filter(name => name === 'usergroups' || name.startsWith('users_') || name.startsWith('readingstatuses_'));

    for (const collectionName of collectionNames) {
      await backupCollection(sourceDb, backupDb, collectionName, timestamp);
    }

    console.log(`Backup completed at ${formatIstanbulDateTime(now)} (${ISTANBUL_TIME_ZONE})`);
  } finally {
    await Promise.allSettled([sourceClient.close(), backupClient.close()]);
  }
}

function scheduleBackup() {
  // Schedule backups to run every 1440 minutes (24 hours)
  const backupJob = schedule.scheduleJob({ rule: '0 23 * * *', tz: ISTANBUL_TIME_ZONE }, () => {
    performBackup().catch(error => console.error('Error during backup:', error));
  });

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

// Anket zamanlayıcısını başlat (Her gün saat 22:00 TSİ)
scheduleAnketJob();

// ERP Form → kullanıcı/grup senkronu (Her gece 00:30 TSİ)
scheduleErpUsersSync(() => mongoose.connection.db);

// ERP Sheets → okudum senkronu (01–19: 30 dk, 20–23: 15 dk; dün+bugün)
scheduleErpReadingsSync(() => mongoose.connection.db);

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
  'kece-kulahlilar'
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
  const yesterday = istanbulYesterdayKey();
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

  const yesterday = istanbulYesterdayKey();
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
scheduleBackup();
schedulePing();
scheduleTokenRefresh();
scheduleDailyNotifications();
scheduleTestGroupSeeder();

// ==================== Profile Management API Endpoints ====================

// Avatar güncelleme
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
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateData.userpassword = hashedPassword;
    }

    const updatedUser = await users.findByIdAndUpdate(userId, updateData, { returnDocument: 'after' });
    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
    }

    if (password) {
      await invalidateUserSessions(groupId, userId);
      setSessionMembership(req, groupId, updatedUser);
      await saveSession(req);
    }

    res.json({
      success: true,
      message: 'Ayarlar güncellendi'
    });
  } catch (error) {
    console.error('Ayarlar güncellenirken hata:', error);
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: 'Bu üye adı zaten kullanılıyor' });
    }
    res.status(500).json({ success: false, message: 'Ayarlar güncellenemedi' });
  }
});


// Profil resmi silme
app.post('/api/remove-user-profile-image', requireSelfOrAdmin, async (req, res) => {
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


// Dropbox'ı başlat
initializeDropbox();

app.use((error, req, res, next) => {
  if (!(error instanceof multer.MulterError)) return next(error);
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Görsel en fazla 5 MB olabilir.' });
  }
  return res.status(400).json({ error: 'Yalnızca JPEG, PNG, WebP veya GIF görselleri yüklenebilir.' });
});

// G. SERVER BAŞLATMA
// ============================================================================

app.listen(port, () => {
  console.log(`Uygulama http://localhost:${port} adresinde çalışıyor`);
});
