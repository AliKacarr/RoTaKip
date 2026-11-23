'use strict';

const { rateLimit } = require('express-rate-limit');

function createRateLimiter(windowMs, limit, message, body = { error: message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: body
  });
}

const loginLimiter = createRateLimiter(
  15 * 60 * 1000,
  20,
  'Çok fazla giriş denemesi yaptınız. Lütfen daha sonra tekrar deneyin.'
);
const accountCreationLimiter = createRateLimiter(
  60 * 60 * 1000,
  10,
  'Çok fazla kayıt isteği gönderdiniz. Lütfen daha sonra tekrar deneyin.'
);
const publicLogLimiter = createRateLimiter(
  60 * 1000,
  60,
  'Çok fazla istek gönderdiniz.'
);
const imageProxyLimiter = createRateLimiter(
  60 * 1000,
  60,
  'Çok fazla görsel isteği gönderdiniz.'
);

// Konum çözümleme her çağrıda üçüncü taraf bir servise gider; kotayı korumak için sıkı tutulur.
// Tesbihat istemcisi hata metnini "message" alanından okuduğu için yanıt gövdesi buna uyar.
const locationLookupMessage = 'Çok fazla konum isteği gönderdiniz. Lütfen biraz bekleyip tekrar deneyin.';
const locationLookupLimiter = createRateLimiter(
  60 * 1000,
  10,
  locationLookupMessage,
  { success: false, message: locationLookupMessage }
);

module.exports = {
  accountCreationLimiter,
  imageProxyLimiter,
  locationLookupLimiter,
  loginLimiter,
  publicLogLimiter
};
