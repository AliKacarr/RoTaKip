'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const https = require('node:https');

const {
  sendOneSignalNotification
} = require('../../../src/server/integrations/onesignal/onesignal.service');
const {
  scheduleDailyNotifications,
  stopSchedulers
} = require('../../../src/server/jobs/schedulers');

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test('development ortamında OneSignal HTTP isteği gönderilmez', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const originalRequest = https.request;
  let requestCalled = false;

  process.env.NODE_ENV = 'development';
  https.request = () => {
    requestCalled = true;
    throw new Error('Development ortamında HTTP isteği oluşturulmamalı');
  };

  try {
    await sendOneSignalNotification('Test bildirimi');
    assert.equal(requestCalled, false);
  } finally {
    https.request = originalRequest;
    restoreEnvironment('NODE_ENV', previousNodeEnv);
  }
});

test('development ortamında OneSignal bildirim cronları başlatılmaz', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAppId = process.env.ONESIGNAL_APP_ID;
  const previousApiKey = process.env.ONESIGNAL_API_KEY;
  let notificationSourceCalled = false;
  let notificationSenderCalled = false;

  process.env.NODE_ENV = 'development';
  process.env.ONESIGNAL_APP_ID = 'development-app-id';
  process.env.ONESIGNAL_API_KEY = 'development-api-key';

  try {
    const jobs = scheduleDailyNotifications({
      getRandomNotification: async () => {
        notificationSourceCalled = true;
        return { message: 'Test', source: 'vecize' };
      },
      sendNotification: async () => {
        notificationSenderCalled = true;
      }
    });

    assert.equal(jobs, null);
    assert.equal(notificationSourceCalled, false);
    assert.equal(notificationSenderCalled, false);
  } finally {
    stopSchedulers();
    restoreEnvironment('NODE_ENV', previousNodeEnv);
    restoreEnvironment('ONESIGNAL_APP_ID', previousAppId);
    restoreEnvironment('ONESIGNAL_API_KEY', previousApiKey);
  }
});
