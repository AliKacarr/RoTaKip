// whatsappService.js - Baileys Ultra Light Engine (No Chrome, 25MB RAM)

const pino = require('pino');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const schedule = require('node-schedule');
const { DEFAULT_GROUP_ID, DEFAULT_POLL_OPTIONS, getDailyPollTitle } = require('./whatsapp/pollConfig');

// Baileys modülü dinamik yükleme (ESM Uyumlu)
let makeWASocket = null;
let useMultiFileAuthState = null;
let DisconnectReason = null;
let fetchLatestWaWebVersion = null;

async function loadBaileys() {
  if (!makeWASocket) {
    const baileys = await import('@whiskeysockets/baileys');
    makeWASocket = baileys.default || baileys.makeWASocket;
    useMultiFileAuthState = baileys.useMultiFileAuthState;
    DisconnectReason = baileys.DisconnectReason;
    fetchLatestWaWebVersion = baileys.fetchLatestWaWebVersion;
  }
}

// Session ve kimlik doğrulama dizinleri
const SESSION_BASE = path.resolve(__dirname, 'whatsapp', 'session');
const BAILEYS_AUTH_PATH = path.join(SESSION_BASE, 'baileys_auth');
const AUTH_FILE = path.join(SESSION_BASE, 'session_authenticated.json');

if (!fs.existsSync(BAILEYS_AUTH_PATH)) {
  fs.mkdirSync(BAILEYS_AUTH_PATH, { recursive: true });
}

let sock = null;

// Servis Durumu
const state = {
  status: 'DISCONNECTED', // 'DISCONNECTED' | 'INITIALIZING' | 'WAITING_FOR_QR' | 'AUTHENTICATED' | 'READY' | 'ERROR'
  qrDataUrl: null,
  userInfo: null,
  lastPollSentAt: null,
  lastError: null
};

/**
 * Önceden tamamlanmış ve doğrulanmış bir WhatsApp oturumu olup olmadığını kontrol eder.
 */
function hasExistingSession() {
  return fs.existsSync(AUTH_FILE);
}

/**
 * WhatsApp İstemcisini Başlatır (Baileys Engine)
 */
async function initWhatsAppClient(onlyIfSessionExists = false) {
  if (sock && (state.status === 'READY' || state.status === 'WAITING_FOR_QR' || state.status === 'INITIALIZING')) {
    return sock;
  }

  if (onlyIfSessionExists && !hasExistingSession()) {
    console.log('ℹ️ WhatsApp oturumu bulunamadı. QR kod /admin/whatsapp adresi açıldığında üretilecek.');
    state.status = 'DISCONNECTED';
    return null;
  }

  state.status = 'INITIALIZING';
  state.lastError = null;
  console.log('🚀 WhatsApp Baileys istemcisi başlatılıyor (Süper hafif mod - Chrome gerektirmez)...');

  try {
    await loadBaileys();

    const { state: authState, saveCreds } = await useMultiFileAuthState(BAILEYS_AUTH_PATH);
    const { version } = await fetchLatestWaWebVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

    sock = makeWASocket({
      version,
      auth: authState,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      browser: ['RoTaKip', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        state.status = 'WAITING_FOR_QR';
        try {
          state.qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 8 });
          console.log('📲 Baileys WhatsApp QR Kod üretildi! /admin/whatsapp adresinden okutabilirsiniz.');
        } catch (e) {
          console.error('QR DataURL hatası:', e);
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.warn(`⚠️ WhatsApp bağlantısı kapandı (Kod: ${statusCode}). Yeniden bağlanılacak mı? ${shouldReconnect}`);

        state.status = 'DISCONNECTED';
        state.qrDataUrl = null;

        if (shouldReconnect) {
          setTimeout(() => {
            initWhatsAppClient(false);
          }, 3000);
        } else {
          state.status = 'ERROR';
          state.lastError = 'Oturum sonlandırıldı. Lütfen QR kodu tekrar okutun.';
        }
      } else if (connection === 'open') {
        state.status = 'READY';
        state.qrDataUrl = null;
        state.userInfo = {
          id: sock.user?.id || 'Bağlı',
          pushname: sock.user?.name || sock.user?.notify || 'RoTaKip Bot'
        };
        console.log('✅ WhatsApp Baileys İstemcisi Hazır! Bağlı Kullanıcı:', state.userInfo.pushname);
        try {
          fs.writeFileSync(AUTH_FILE, JSON.stringify(state.userInfo, null, 2), 'utf-8');
        } catch (e) {}
      }
    });

    return sock;
  } catch (err) {
    console.error('❌ Baileys başlatma hatası:', err);
    state.status = 'ERROR';
    state.lastError = err.message;
    return null;
  }
}

/**
 * 8 Haneli Eşleşme Kodu İster (Telefon Numarası ile QR'sız Giriş)
 */
async function requestPairingCode(phoneNumber) {
  await loadBaileys();

  if (!sock || state.status === 'DISCONNECTED' || state.status === 'ERROR') {
    await initWhatsAppClient(false);
    await new Promise(r => setTimeout(r, 1500));
  }
  if (!sock) throw new Error('İstemci başlatılamadı.');

  const cleanedNumber = phoneNumber.replace(/\D/g, '');
  if (!cleanedNumber || cleanedNumber.length < 10) {
    throw new Error('Geçerli bir telefon numarası girin (örn: 905xxxxxxxxx).');
  }

  console.log(`📲 Telefon Numarası ile Eşleşme Kodu isteniyor (${cleanedNumber})...`);
  const code = await sock.requestPairingCode(cleanedNumber);
  return code;
}

/**
 * Oturumu Yeniden Başlatır (Session Sıfırlama)
 */
async function restartWhatsAppClient() {
  console.log('🔄 WhatsApp Baileys istemcisi sıfırlanıyor...');
  if (fs.existsSync(AUTH_FILE)) {
    try { fs.unlinkSync(AUTH_FILE); } catch (e) {}
  }
  if (fs.existsSync(BAILEYS_AUTH_PATH)) {
    try { fs.rmSync(BAILEYS_AUTH_PATH, { recursive: true, force: true }); } catch (e) {}
  }
  if (sock) {
    try {
      sock.end(new Error('Manual Restart'));
    } catch (e) {}
    sock = null;
  }
  state.status = 'DISCONNECTED';
  state.qrDataUrl = null;
  state.userInfo = null;
  state.lastError = null;

  return initWhatsAppClient(false);
}

/**
 * Günlük Anketi Gönderir (Baileys Native Poll)
 */
async function sendWhatsAppPoll(options = {}) {
  const {
    groupId = DEFAULT_GROUP_ID,
    pollTitleCustom = null
  } = options;

  if (!sock || state.status !== 'READY') {
    return {
      success: false,
      status: state.status,
      message: 'WhatsApp istemcisi bağlı veya hazır değil! Lütfen önce QR kodu veya eşleşme kodunu okutun.'
    };
  }

  const pollTitle = getDailyPollTitle(pollTitleCustom);

  try {
    const sent = await sock.sendMessage(groupId, {
      poll: {
        name: pollTitle,
        values: DEFAULT_POLL_OPTIONS,
        selectableCount: 1
      }
    });

    const messageId = sent?.key?.id || 'GÖNDERİLDİ';
    state.lastPollSentAt = new Date().toISOString();
    console.log(`🗳️ Baileys WhatsApp Anketi gönderildi (${pollTitle}) [Grup: ${groupId}] -> MsgId: ${messageId}`);
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
  if (!sock || state.status !== 'READY') {
    return [];
  }
  try {
    const groupsMap = await sock.groupFetchAllParticipating();
    return Object.values(groupsMap).map(g => ({
      id: g.id,
      name: g.subject,
      unreadCount: 0
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
 * Servis Durumunu Döndürür
 * @param {boolean} autoStartIfDisconnected True verilirse oturum yoksa QR üretmeyi başlatır
 */
function getWhatsAppStatus(autoStartIfDisconnected = false) {
  if (autoStartIfDisconnected && state.status === 'DISCONNECTED' && !sock) {
    initWhatsAppClient(false);
  }

  return {
    status: state.status,
    qrDataUrl: state.qrDataUrl,
    userInfo: state.userInfo,
    lastPollSentAt: state.lastPollSentAt,
    lastError: state.lastError,
    engine: 'Baileys (Ultra Light - 25MB RAM)'
  };
}

module.exports = {
  initWhatsAppClient,
  restartWhatsAppClient,
  requestPairingCode,
  sendWhatsAppPoll,
  scheduleWhatsAppPollJob,
  getWhatsAppStatus,
  getWhatsAppGroups
};
