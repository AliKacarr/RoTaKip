'use strict';

require('./config/env');

const { closeDatabase, connectDatabase } = require('./config/database');
const {
  scheduleDailyNotifications,
  scheduleTokenRefresh,
  stopSchedulers
} = require('./jobs/schedulers');
const {
  app,
  closeAppResources,
  getRandomVecizeForPush,
  initializeDatabaseIndexes,
  initializeDropbox,
  refreshDropboxToken,
  sendOneSignalNotification
} = require('./app');

let activeServer = null;
let shutdownRegistered = false;
let stopPromise = null;

function closeHttpServer() {
  const server = activeServer;
  if (!server) return Promise.resolve();

  return new Promise((resolve, reject) => {
    server.close(error => {
      if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
      else resolve();
    });
  });
}

function stopServer() {
  if (stopPromise) return stopPromise;

  stopPromise = (async () => {
    stopSchedulers();
    const failures = [];

    try {
      await closeHttpServer();
    } catch (error) {
      failures.push(error);
    }

    const resourceResults = await Promise.allSettled([
      closeAppResources(),
      closeDatabase()
    ]);
    activeServer = null;

    resourceResults.forEach(result => {
      if (result.status === 'rejected') failures.push(result.reason);
    });
    if (failures.length > 0) {
      throw new AggregateError(failures, 'Sunucu kaynakları tamamen kapatılamadı');
    }
  })();

  return stopPromise;
}

function registerShutdown() {
  if (shutdownRegistered) return;
  shutdownRegistered = true;
  const shutdown = signal => {
    console.log(`${signal} alındı; sunucu kapatılıyor...`);
    stopServer()
      .then(() => process.exit(0))
      .catch(error => {
        console.error('Sunucu kapatılırken hata:', error);
        process.exit(1);
      });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

async function startServer(options = {}) {
  if (activeServer) return activeServer;

  const port = options.port ?? process.env.PORT ?? 3000;
  const host = options.host || '0.0.0.0';

  registerShutdown();
  await connectDatabase();
  await initializeDatabaseIndexes();
  const dropboxInitialization = initializeDropbox();
  dropboxInitialization.catch(error => {
    console.error('Dropbox başlatılamadı:', error);
  });
  scheduleTokenRefresh(refreshDropboxToken);
  scheduleDailyNotifications({
    getRandomNotification: getRandomVecizeForPush,
    sendNotification: sendOneSignalNotification
  });

  const server = app.listen(port, host);
  activeServer = server;
  server.once('close', () => {
    if (activeServer === server) activeServer = null;
  });

  try {
    await new Promise((resolve, reject) => {
      const onListening = () => {
        server.off('error', onError);
        resolve();
      };
      const onError = error => {
        server.off('listening', onListening);
        reject(error);
      };
      server.once('listening', onListening);
      server.once('error', onError);
    });
  } catch (error) {
    try {
      await stopServer();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Sunucu başlatılamadı ve kaynaklar tamamen kapatılamadı',
        { cause: cleanupError }
      );
    }
    throw error;
  }

  const address = server.address();
  const listeningPort = typeof address === 'object' && address ? address.port : port;
  console.log(`Uygulama ${host}:${listeningPort} adresinde çalışıyor`);

  return server;
}

if (require.main === module) {
  startServer().catch(async error => {
    console.error('Sunucu başlatılamadı:', error);
    try {
      await stopServer();
    } catch (cleanupError) {
      console.error('Başlatma hatasından sonra kaynaklar kapatılamadı:', cleanupError);
    }
    process.exitCode = 1;
  });
}

module.exports = {
  startServer,
  stopServer
};
