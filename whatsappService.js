const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Puppeteer önbellek dizinini proje kök klasörüne yönlendir (.cache/puppeteer)
const LOCAL_CACHE_DIR = path.resolve(__dirname, '.cache', 'puppeteer');
if (!process.env.PUPPETEER_CACHE_DIR) {
  process.env.PUPPETEER_CACHE_DIR = LOCAL_CACHE_DIR;
}

const { Client, LocalAuth, Poll } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const schedule = require('node-schedule');
const { DEFAULT_GROUP_ID, DEFAULT_POLL_OPTIONS, getDailyPollTitle } = require('./whatsapp/pollConfig');

// Session dizini yolu
const SESSION_PATH = path.resolve(__dirname, 'whatsapp', 'session');
if (!fs.existsSync(SESSION_PATH)) {
  fs.mkdirSync(SESSION_PATH, { recursive: true });
}

// LocalAuth.logout override (dosya kilitlenmelerini atlamak için)
const { LocalAuth: _LocalAuth } = require('whatsapp-web.js');
_LocalAuth.prototype.logout = async function () {
  console.log('⚠️ Logout atlandı; session dizini silinmeyecek.');
};

let clientInstance = null;

// Servis Durumu
const state = {
  status: 'DISCONNECTED', // 'DISCONNECTED' | 'INITIALIZING' | 'WAITING_FOR_QR' | 'AUTHENTICATED' | 'READY' | 'ERROR'
  qrDataUrl: null,
  userInfo: null,
  lastPollSentAt: null,
  lastError: null
};

const AUTH_FILE = path.join(SESSION_PATH, 'session_authenticated.json');

/**
 * Chrome çalıştırılabilir dosya yolunu (executablePath) otomatik bulur.
 */
function getChromeExecutablePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  // 1. puppeteer kütüphanesinden varsayılan yolu almayı dene
  try {
    const puppeteer = require('puppeteer');
    const pathFromPuppeteer = puppeteer.executablePath();
    if (pathFromPuppeteer && fs.existsSync(pathFromPuppeteer)) {
      return pathFromPuppeteer;
    }
  } catch (e) {}

  // 2. Proje kökündeki .cache/puppeteer klasörünü tara
  const baseCacheDir = process.env.PUPPETEER_CACHE_DIR || LOCAL_CACHE_DIR;
  if (fs.existsSync(baseCacheDir)) {
    const findBinary = (dir) => {
      try {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        for (const file of files) {
          const fullPath = path.join(dir, file.name);
          if (file.isDirectory()) {
            const res = findBinary(fullPath);
            if (res) return res;
          } else if (file.isFile()) {
            if (file.name === 'chrome' || file.name === 'chrome.exe' || file.name === 'google-chrome') {
              return fullPath;
            }
          }
        }
      } catch (e) {}
      return null;
    };
    const localBinary = findBinary(baseCacheDir);
    if (localBinary) {
      console.log('📌 Proje yerel önbelleğinde (.cache/puppeteer) Chrome bulundu:', localBinary);
      return localBinary;
    }
  }

  // 3. Linux sistem genel tarayıcı yolları
  const systemPaths = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ];
  for (const sysPath of systemPaths) {
    if (fs.existsSync(sysPath)) {
      console.log('📌 Sistem seviyesinde Chrome/Chromium bulundu:', sysPath);
      return sysPath;
    }
  }

  return undefined;
}

/**
 * Önceden tamamlanmış ve doğrulanmış bir WhatsApp oturumu olup olmadığını kontrol eder.
 */
function hasExistingSession() {
  return fs.existsSync(AUTH_FILE);
}

/**
 * WhatsApp İstemcisini Başlatır
 * @param {boolean} onlyIfSessionExists True verilirse sadece önceden saklanmış oturum varsa başlatır (Talep üzerine QR üretmek için).
 */
function initWhatsAppClient(onlyIfSessionExists = false) {
  if (clientInstance && (state.status === 'READY' || state.status === 'WAITING_FOR_QR' || state.status === 'INITIALIZING')) {
    return clientInstance;
  }

  if (onlyIfSessionExists && !hasExistingSession()) {
    console.log('ℹ️ WhatsApp oturumu bulunamadı. QR kod /admin/whatsapp adresi açıldığında üretilecek.');
    state.status = 'DISCONNECTED';
    return null;
  }

  state.status = 'INITIALIZING';
  state.lastError = null;

  let execPath = getChromeExecutablePath();
  if (!execPath) {
    console.log('⚠️ Chrome bulunamadı. Otomatik `npx puppeteer browsers install chrome` çalıştırılıyor...');
    try {
      execSync('npx puppeteer browsers install chrome', {
        env: { ...process.env, PUPPETEER_CACHE_DIR: process.env.PUPPETEER_CACHE_DIR },
        stdio: 'inherit'
      });
      execPath = getChromeExecutablePath();
    } catch (installErr) {
      console.error('❌ Otomatik Chrome indirme hatası:', installErr.message);
    }
  }

  console.log('🚀 WhatsApp istemcisi başlatılıyor... Target Chrome Executable:', execPath || 'Standart Çözümleme');

  const isHeadless = process.env.PUPPETEER_HEADLESS !== 'false'; // Varsayılan sunucuda (Render) true

  clientInstance = new Client({
    authStrategy: new LocalAuth({
      dataPath: SESSION_PATH,
      clientId: 'poll-bot'
    }),
    puppeteer: {
      headless: isHeadless,
      executablePath: execPath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    }
  });

  // 1) QR Kodu Üretildiğinde
  clientInstance.on('qr', async qr => {
    state.status = 'WAITING_FOR_QR';
    try {
      state.qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 8 });
      console.log('📲 Yeni WhatsApp QR Kod üretildi. Web arayüzünden (/admin/whatsapp) okutabilirsiniz.');
    } catch (err) {
      console.error('QR Kod görseli oluşturma hatası:', err);
    }
  });

  // 2) Oturum Doğrulandığında
  clientInstance.on('authenticated', () => {
    console.log('🔐 WhatsApp oturumu doğrulandı!');
    state.status = 'AUTHENTICATED';
    state.qrDataUrl = null;
  });

  // 3) İstemci Hazır Olduğunda
  clientInstance.on('ready', async () => {
    state.status = 'READY';
    state.qrDataUrl = null;
    console.log('✅ WhatsApp İstemcisi Hazır!');

    try {
      if (clientInstance.info) {
        const me = clientInstance.info.me;
        const pushname = clientInstance.info.pushname;
        state.userInfo = {
          id: me?._serialized || me?.user,
          user: me?.user,
          pushname: pushname || 'Kullanıcı'
        };
      }
      fs.writeFileSync(AUTH_FILE, JSON.stringify(state.userInfo || { authenticated: true }, null, 2), 'utf-8');
    } catch (e) {
      console.warn('⚠️ Oturum doğrulama dosyası kaydedilirken hata:', e.message);
    }
  });

  // 4) Hata veya Bağlantı Kopması
  clientInstance.on('auth_failure', msg => {
    console.error('❌ WhatsApp Doğrulama Hatası:', msg);
    state.status = 'ERROR';
    state.lastError = `Auth Failure: ${msg}`;
    state.qrDataUrl = null;
  });

  clientInstance.on('disconnected', reason => {
    console.warn('⚠️ WhatsApp bağlantısı kesildi:', reason);
    state.status = 'DISCONNECTED';
    state.qrDataUrl = null;
    clientInstance = null;
  });

  clientInstance.initialize().catch(async err => {
    console.error('❌ WhatsApp başlatma hatası:', err);

    const isChromeNotFoundError = err.message && (
      err.message.includes('Could not find Chrome') ||
      err.message.includes('executablePath') ||
      err.message.includes('Failed to launch the browser process')
    );

    if (isChromeNotFoundError && !clientInstance._autoInstallAttempted) {
      console.log('🔄 Chrome tarayıcısı bulunamadı. `npx puppeteer browsers install chrome` otomatik çalıştırılıyor...');
      try {
        state.status = 'INITIALIZING';
        state.lastError = 'Chrome tarayıcısı otomatik indiriliyor, lütfen bekleyin...';
        execSync('npx puppeteer browsers install chrome', {
          env: { ...process.env, PUPPETEER_CACHE_DIR: process.env.PUPPETEER_CACHE_DIR },
          stdio: 'inherit'
        });
        console.log('✅ Chrome başarıyla indirildi. WhatsApp istemcisi yeniden başlatılıyor...');
        clientInstance = null;
        setTimeout(() => {
          const newClient = initWhatsAppClient(false);
          if (newClient) newClient._autoInstallAttempted = true;
        }, 1000);
        return;
      } catch (installErr) {
        console.error('❌ Otomatik Chrome indirme hatası:', installErr.message);
      }
    }

    state.status = 'ERROR';
    state.lastError = err.message;
  });

  return clientInstance;
}

/**
 * Oturumu Yeniden Başlatır (QR Kodu Yenilemek İçin)
 */
async function restartWhatsAppClient() {
  console.log('🔄 WhatsApp istemcisi yeniden başlatılıyor...');
  if (fs.existsSync(AUTH_FILE)) {
    try { fs.unlinkSync(AUTH_FILE); } catch (e) {}
  }
  if (clientInstance) {
    try {
      await clientInstance.destroy();
    } catch (e) {
      console.warn('Destruction uyarısı:', e.message);
    }
    clientInstance = null;
  }
  state.status = 'DISCONNECTED';
  state.qrDataUrl = null;
  state.userInfo = null;
  state.lastError = null;

  return initWhatsAppClient(false);
}

/**
 * Günlük Anketi Gönderir
 */
async function sendWhatsAppPoll(options = {}) {
  const {
    groupId = DEFAULT_GROUP_ID,
    pollTitleCustom = null
  } = options;

  if (!clientInstance || state.status !== 'READY') {
    return {
      success: false,
      status: state.status,
      message: 'WhatsApp istemcisi bağlı veya hazır değil! Lütfen önce QR kodu okutun.'
    };
  }

  const pollTitle = getDailyPollTitle(pollTitleCustom);
  const poll = new Poll(
    pollTitle,
    DEFAULT_POLL_OPTIONS,
    false // Tekli seçim
  );

  try {
    const sent = await clientInstance.sendMessage(groupId, poll);
    const messageId = sent?.id?._serialized || 'GÖNDERİLDİ';
    state.lastPollSentAt = new Date().toISOString();
    console.log(`🗳️ WhatsApp Anketi gönderildi (${pollTitle}) [Grup: ${groupId}] -> MsgId: ${messageId}`);
    return {
      success: true,
      messageId,
      pollTitle,
      groupId,
      sentAt: state.lastPollSentAt
    };
  } catch (err) {
    console.error('❌ WhatsApp Anket Gönderme Hatası:', err);
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Kullanıcının Dahil Olduğu WhatsApp Gruplarını Listeler
 */
async function getWhatsAppGroups() {
  if (!clientInstance || state.status !== 'READY') {
    return [];
  }
  try {
    const chats = await clientInstance.getChats();
    return chats
      .filter(c => c.isGroup)
      .map(c => ({
        id: c.id._serialized,
        name: c.name,
        unreadCount: c.unreadCount
      }));
  } catch (err) {
    console.error('Gruplar çekilirken hata:', err);
    return [];
  }
}

/**
 * Her gün saat 09:00 (Türkiye Saati) için zamanlayıcıyı başlatır.
 */
function scheduleWhatsAppPollJob() {
  const job = schedule.scheduleJob({ rule: '0 9 * * *', tz: 'Europe/Istanbul' }, async () => {
    const zaman = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
    console.log(`\n[ZAMANLAYICI - ${zaman}] Günlük WhatsApp anketi gönderimi başlatılıyor...`);
    try {
      const res = await sendWhatsAppPoll();
      console.log(`[ZAMANLAYICI] WhatsApp Anket Gönderim Sonucu:`, res);
    } catch (error) {
      console.error(`[ZAMANLAYICI] WhatsApp Anket Gönderim Hatası:`, error);
    }
  });
  console.log("✅ WhatsApp Anket Zamanlayıcısı Kuruldu: Her gün saat 09:00 (TSİ)");
  return job;
}

/**
 * Servis Durumunu Döndürür (Tarayıcıdan çağrıldığında oturum yoksa QR'ı talep üzerine başlatır)
 */
function getWhatsAppStatus() {
  if (state.status === 'DISCONNECTED' && !clientInstance) {
    initWhatsAppClient(false);
  }

  return {
    status: state.status,
    qrDataUrl: state.qrDataUrl,
    userInfo: state.userInfo,
    lastPollSentAt: state.lastPollSentAt,
    lastError: state.lastError
  };
}

module.exports = {
  initWhatsAppClient,
  restartWhatsAppClient,
  sendWhatsAppPoll,
  scheduleWhatsAppPollJob,
  getWhatsAppStatus,
  getWhatsAppGroups
};
