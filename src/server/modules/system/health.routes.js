'use strict';

function registerHealthRoutes(app, { isDatabaseConnected }) {
  app.get('/api/health', (req, res) => {
    const databaseConnected = isDatabaseConnected();
    res.status(databaseConnected ? 200 : 503).json({
      ok: databaseConnected,
      database: databaseConnected ? 'connected' : 'disconnected',
      timestamp: Date.now()
    });
  });
}

module.exports = {
  registerHealthRoutes
};
