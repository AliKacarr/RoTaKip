'use strict';

const { rateLimit } = require('express-rate-limit');

function createRateLimiter(windowMs, limit, message) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: message }
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

module.exports = {
  accountCreationLimiter,
  imageProxyLimiter,
  loginLimiter,
  publicLogLimiter
};
