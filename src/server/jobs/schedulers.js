'use strict';

const schedule = require('node-schedule');

let morningNotificationJob = null;
let eveningNotificationJob = null;
let tokenRefreshJob = null;

function scheduleDailyNotifications({ getRandomNotification, sendNotification }) {
  if (process.env.NODE_ENV === 'development') {
    console.info('OneSignal bildirim cronları development ortamında başlatılmadı.');
    return null;
  }

  if (!(process.env.ONESIGNAL_APP_ID && process.env.ONESIGNAL_API_KEY)) {
    console.warn('OneSignal env değişkenleri eksik. Cron başlatılmadı.');
    return null;
  }

  morningNotificationJob?.cancel();
  eveningNotificationJob?.cancel();

  const runNotification = async label => {
    console.log(`${label} cron job çalışıyor`);
    const result = await getRandomNotification();
    await sendNotification(result.message, result.source);
  };

  morningNotificationJob = schedule.scheduleJob(
    { rule: '0 9 * * *', tz: 'Europe/Istanbul' },
    () => runNotification('🌅 Sabah 9:00')
  );
  eveningNotificationJob = schedule.scheduleJob(
    { rule: '0 21 * * *', tz: 'Europe/Istanbul' },
    () => runNotification('🌙 Akşam 21:00')
  );

  return {
    jobMorning: morningNotificationJob,
    jobEvening: eveningNotificationJob
  };
}

function scheduleTokenRefresh(refreshToken) {
  tokenRefreshJob?.cancel();
  tokenRefreshJob = schedule.scheduleJob('0 * * * *', async () => {
    try {
      await refreshToken();
    } catch (error) {
      console.error('Token refresh failed:', error.message);
    }
  });
  return tokenRefreshJob;
}

function stopSchedulers() {
  morningNotificationJob?.cancel();
  eveningNotificationJob?.cancel();
  tokenRefreshJob?.cancel();
  morningNotificationJob = null;
  eveningNotificationJob = null;
  tokenRefreshJob = null;
}

module.exports = {
  scheduleDailyNotifications,
  scheduleTokenRefresh,
  stopSchedulers
};
