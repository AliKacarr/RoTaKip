'use strict';

const https = require('https');

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




module.exports = {
  sendOneSignalNotification
};
