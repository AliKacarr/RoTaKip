'use strict';

const crypto = require('crypto');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');

function configureSession(app) {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && !process.env.SESSION_SECRET) {
    throw new Error('Üretimde SESSION_SECRET tanımlanmalıdır.');
  }

  const secret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
  const cookieName = isProduction ? '__Host-rotakip.sid' : 'rotakip.sid';

  if (!process.env.SESSION_SECRET) {
    console.warn('SESSION_SECRET tanımlı değil; oturumlar sunucu yeniden başladığında geçersiz olacak.');
  }
  if (isProduction) {
    app.set('trust proxy', 1);
  }

  const store = MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    dbName: process.env.DB_NAME,
    collectionName: 'sessions',
    stringify: false,
    touchAfter: 24 * 60 * 60
  });

  app.use(session({
    name: cookieName,
    secret,
    store,
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

  return {
    cookieName,
    isProduction,
    store
  };
}

module.exports = {
  configureSession
};
