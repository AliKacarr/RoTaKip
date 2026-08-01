// whatsapp/send-poll-native.js

const { Client, LocalAuth, Poll } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { DEFAULT_GROUP_ID, DEFAULT_POLL_OPTIONS, getDailyPollTitle } = require('./pollConfig');

// 1) Session dizinini oluşturun
const SESSION_PATH = path.resolve(__dirname, 'session');
if (!fs.existsSync(SESSION_PATH)) fs.mkdirSync(SESSION_PATH, { recursive: true });

// 2) LocalAuth.logout override (dosya kilitlenmelerini atlamak için)
const { LocalAuth: _LocalAuth } = require('whatsapp-web.js');
_LocalAuth.prototype.logout = async function () {
  console.log('⚠️ Logout atlandı; session dizini silinmeyecek.');
};

function createClient() {
  return new Client({
    authStrategy: new LocalAuth({
      dataPath: SESSION_PATH,
      clientId: 'poll-bot'
    }),
    puppeteer: {
      headless: true, // arayüzlü mod
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    }
  });
}

async function runPollBot(options = {}) {
  const {
    groupId = DEFAULT_GROUP_ID,
    pollTitleCustom = null,
    autoClose = true,
    closeDelayMs = 30000
  } = options;

  return new Promise((resolve, reject) => {
    const client = createClient();

    // 3) QR geldiğinde ASCII QR bas
    client.on('qr', qr => {
      console.log('\n📲 Lütfen bu QR’ı okutun:\n');
      qrcode.generate(qr, { small: true });
    });

    // 4) Hazır olunca anketi gönder
    client.on('ready', async () => {
      console.log('✅ Bot hazır, anket gönderiliyor…');

      // --- Kullanıcı bilgisini alt klasöre kaydet ---
      try {
        const clientId = client.authStrategy.clientId; // örn. "poll-bot"
        const folder = path.join(SESSION_PATH, `session-${clientId}`); // LocalAuth’in klasör isimlendirmesi
        if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
        const infoFile = path.join(folder, 'user_info.json');
        if (!fs.existsSync(infoFile) && client.info) {
          const me = client.info.me; // { _serialized, user, server }
          const name = client.info.pushname;
          const info = { id: me?._serialized, user: me?.user, server: me?.server, pushname: name };
          fs.writeFileSync(infoFile, JSON.stringify(info, null, 2), 'utf-8');
          console.log('ℹ️ Bu oturum için kullanıcı kaydedildi:', info);
        }
      } catch (infoErr) {
        console.warn('⚠️ Kullanıcı bilgisi kaydedilirken uyarı:', infoErr.message);
      }

      const pollTitle = getDailyPollTitle(pollTitleCustom);
      const poll = new Poll(
        pollTitle, // Dinamik gün ve ay
        DEFAULT_POLL_OPTIONS,
        false // Tekli seçim izni
      );

      let sentMessage = null;

      // Mesajın sunucuya iletildiğini doğrulama takibi
      const ackListener = (msg, ack) => {
        if (sentMessage && msg.id._serialized === sentMessage.id._serialized) {
          console.log(`📡 Anket sunucu onayını (ACK: ${ack}) aldı.`);
        }
      };
      client.on('message_ack', ackListener);

      try {
        sentMessage = await client.sendMessage(groupId, poll);
        const messageId = sentMessage?.id?._serialized || 'Başarılı';
        console.log(`🗳️ Anket gönderim isteği iletildi (id: ${messageId}). Sunucu iletimi ve iletim senkronizasyonu bekleniyor...`);
      } catch (err) {
        console.error('❌ Anket gönderilirken hata oluştu:', err);
      }

      if (autoClose) {
        console.log(`⏳ Sunucu senkronizasyonu için ${closeDelayMs / 1000} saniye bekleniyor...`);
        setTimeout(async () => {
          console.log('⏳ Kapanış işlemi başlıyor...');
          try {
            await client.destroy();
          } catch (e) {
            console.warn('⚠️ Client destroy uyarısı:', e.message);
          }
          console.log('👋 Kapanış tamam.');
          resolve(true);
          if (require.main === module) {
            process.exit(0);
          }
        }, closeDelayMs);
      } else {
        resolve(client);
      }
    });

    client.on('auth_failure', msg => {
      console.error('❌ WhatsApp Kimlik Doğrulama Hatası:', msg);
      reject(new Error(`Auth failure: ${msg}`));
    });

    client.initialize();
  });
}

// Doğrudan çalıştırılırsa çalıştır
if (require.main === module) {
  runPollBot().catch(err => {
    console.error('Bot çalıştırma hatası:', err);
    process.exit(1);
  });
}

module.exports = {
  createClient,
  runPollBot
};
