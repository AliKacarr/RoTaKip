'use strict';

const mongoose = require('mongoose');

const mongooseOptions = {
  dbName: process.env.DB_NAME,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
  maxPoolSize: 10,
  minPoolSize: 5,
  retryWrites: true,
  retryReads: true
};

let lifecycleRegistered = false;

function registerDatabaseLifecycle() {
  if (lifecycleRegistered) return;
  lifecycleRegistered = true;
  mongoose.connection.on('error', error => {
    console.error('MongoDB bağlantı hatası:', error);
  });

  mongoose.connection.on('disconnected', () => {
    console.log('MongoDB bağlantısı kesildi');
  });

}

function connectDatabase() {
  registerDatabaseLifecycle();
  return mongoose.connect(process.env.MONGO_URI, mongooseOptions)
    .then(() => {
      console.log('MongoDB bağlantısı başarılı');
      return mongoose.connection;
    })
    .catch(error => {
      console.error('MongoDB bağlantı hatası:', error);
      return null;
    });
}

async function closeDatabase() {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.connection.close();
  console.log('MongoDB bağlantısı kapatıldı');
}

module.exports = {
  closeDatabase,
  connectDatabase,
  mongooseOptions,
  registerDatabaseLifecycle
};
