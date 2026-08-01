const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Save Puppeteer Chrome binary inside project folder (.cache/puppeteer)
  // so that Render preserves it in the runtime container image.
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
