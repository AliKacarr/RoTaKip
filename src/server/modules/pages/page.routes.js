'use strict';

const path = require('path');
const { isSafeGroupId } = require('../../shared/group-id');

function sendHtmlFile(res, publicPath, fileName) {
  res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate');
  res.sendFile(path.join(publicPath, fileName));
}

function registerProtectedPageRoutes(app, { publicPath, requireSiteActivityAdmin }) {
  app.get('/admin.html', requireSiteActivityAdmin, (req, res) => {
    sendHtmlFile(res, publicPath, 'admin.html');
  });
}

function appendQueryString(pathname, query) {
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, rawValue]) => {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    values.forEach(value => {
      if (value != null) params.append(key, String(value));
    });
  });
  const queryString = params.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

function registerDropboxImageProxy(app, imageProxyLimiter) {
  app.get('/api/dropbox-image', imageProxyLimiter, async (req, res) => {
    const source = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    if (!source || source.length > 4096) {
      return res.status(400).json({ error: 'Geçerli bir Dropbox görsel URL’si gerekli' });
    }

    let sourceUrl;
    try {
      sourceUrl = new URL(source);
    } catch (_) {
      return res.status(400).json({ error: 'Dropbox görsel URL’si geçersiz' });
    }

    const isAllowedDropboxHost = hostname => {
      const normalized = String(hostname || '').toLowerCase();
      return normalized === 'dropbox.com'
        || normalized.endsWith('.dropbox.com')
        || normalized === 'dropboxusercontent.com'
        || normalized.endsWith('.dropboxusercontent.com');
    };

    if (sourceUrl.protocol !== 'https:' || !isAllowedDropboxHost(sourceUrl.hostname)) {
      return res.status(400).json({ error: 'Yalnızca Dropbox görsellerine izin verilir' });
    }
    if (sourceUrl.hostname === 'dropbox.com' || sourceUrl.hostname.endsWith('.dropbox.com')) {
      sourceUrl.searchParams.delete('dl');
      sourceUrl.searchParams.set('raw', '1');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const imageResponse = await fetch(sourceUrl, {
        redirect: 'follow',
        signal: controller.signal
      });
      if (!imageResponse.ok) {
        return res.status(502).json({ error: 'Dropbox görseli alınamadı' });
      }

      const finalUrl = new URL(imageResponse.url);
      if (!isAllowedDropboxHost(finalUrl.hostname)) {
        return res.status(502).json({ error: 'Dropbox görsel yönlendirmesi geçersiz' });
      }

      let contentType = String(imageResponse.headers.get('content-type') || '')
        .split(';')[0]
        .trim()
        .toLowerCase();
      if (contentType === 'application/octet-stream') {
        const inferredTypes = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.webp': 'image/webp',
          '.gif': 'image/gif',
          '.avif': 'image/avif'
        };
        contentType = inferredTypes[path.extname(sourceUrl.pathname).toLowerCase()] || contentType;
      }
      const allowedImageTypes = new Set([
        'image/png',
        'image/jpeg',
        'image/webp',
        'image/gif',
        'image/avif'
      ]);
      if (!allowedImageTypes.has(contentType)) {
        return res.status(415).json({ error: 'Dropbox yanıtı desteklenen bir görsel değil' });
      }

      const maxImageBytes = 8 * 1024 * 1024;
      const declaredLength = Number(imageResponse.headers.get('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > maxImageBytes) {
        return res.status(413).json({ error: 'Dropbox görseli çok büyük' });
      }
      if (!imageResponse.body) {
        return res.status(502).json({ error: 'Dropbox görseli boş döndü' });
      }

      const reader = imageResponse.body.getReader();
      const chunks = [];
      let receivedBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        receivedBytes += value.byteLength;
        if (receivedBytes > maxImageBytes) {
          controller.abort();
          return res.status(413).json({ error: 'Dropbox görseli çok büyük' });
        }
        chunks.push(Buffer.from(value));
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(Buffer.concat(chunks, receivedBytes));
    } catch (error) {
      if (error?.name === 'AbortError') {
        return res.status(504).json({ error: 'Dropbox görsel isteği zaman aşımına uğradı' });
      }
      console.error('Dropbox görsel proxy hatası:', error.message);
      return res.status(502).json({ error: 'Dropbox görseli alınamadı' });
    } finally {
      clearTimeout(timeoutId);
    }
  });
}

function registerPublicPageRoutes(app, { publicPath, imageProxyLimiter }) {
  app.get('/', (req, res) => {
    res.redirect(302, '/tesbihat');
  });

  app.get('/gruplar', (req, res) => {
    sendHtmlFile(res, publicPath, 'app-shell.html');
  });

  app.get('/env.js', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate');
    res.type('application/javascript');
    const appId = process.env.ONESIGNAL_APP_ID || '';
    const siteActivityAdminGroupId = process.env.SITE_ACTIVITY_ADMIN_GROUP_ID || 'catikati23';
    res.send([
      `window.ONESIGNAL_APP_ID = ${JSON.stringify(appId)};`,
      `window.SITE_ACTIVITY_ADMIN_GROUP_ID = ${JSON.stringify(siteActivityAdminGroupId)};`
    ].join('\n'));
  });

  registerDropboxImageProxy(app, imageProxyLimiter);

  app.get('/grup/:groupId/', (req, res) => {
    if (!isSafeGroupId(req.params.groupId)) return res.status(404).send('Not found');
    return sendHtmlFile(res, publicPath, 'app-shell.html');
  });

  app.get(['/tesbihat', '/videolar', '/tefekkur', '/makaleler'], (req, res) => {
    sendHtmlFile(res, publicPath, 'app-shell.html');
  });

  app.get(['/groupid=:groupId', '/grupid=:groupId'], (req, res) => {
    if (!isSafeGroupId(req.params.groupId)) return res.status(404).send('Not found');
    const target = `/grup/${encodeURIComponent(req.params.groupId)}/`;
    return res.redirect(302, appendQueryString(target, req.query));
  });
}

module.exports = {
  registerProtectedPageRoutes,
  registerPublicPageRoutes
};
