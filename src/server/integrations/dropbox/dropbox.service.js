'use strict';

const fs = require('fs');
const { Dropbox } = require('dropbox');
const sharp = require('sharp');
const { istanbulDateKey } = require('../../shared/date-time');

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



module.exports = {
  buildDropboxImageFileName,
  checkDropboxToken,
  convertToWebP,
  deleteFromDropboxByUrl,
  deleteGroupDropboxImages,
  deleteGroupImageFromDropboxByUrl,
  generateGroupId,
  initializeDropbox,
  isDropboxHostedUrl,
  normalizeFileName,
  refreshDropboxToken,
  unlinkWithRetry,
  uploadToDropbox,
  uploadToDropboxWithRetry
};

