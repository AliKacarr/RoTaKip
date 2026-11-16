'use strict';

function registerHealthRoutes(app) {
  app.get('/api/health', (req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });
}

module.exports = {
  registerHealthRoutes
};
