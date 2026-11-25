'use strict';

const VIDEO_ID_PATTERN = /^[\w-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com'
]);
const SHORT_HOST = 'youtu.be';
const ID_PATH_PREFIXES = new Set(['shorts', 'embed', 'live', 'v']);
const ISO_DURATION_PATTERN = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

function isYoutubeVideoId(value) {
  return typeof value === 'string' && VIDEO_ID_PATTERN.test(value);
}

// YouTube bağlantısından (youtu.be, watch?v=, shorts/, embed/, live/) video kimliğini ayıklar.
// Geçersiz ya da YouTube dışı adreslerde null döner. `allowBareId` ile çıplak 11 karakterlik kimlik de kabul edilir.
function extractYoutubeVideoId(input, { allowBareId = false } = {}) {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw || raw.length > 300) return null;
  if (allowBareId && isYoutubeVideoId(raw)) return raw;

  let url;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch (_error) {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);
  let candidate = null;
  if (host === SHORT_HOST || host === `www.${SHORT_HOST}`) {
    candidate = segments[0];
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (segments[0] === 'watch') candidate = url.searchParams.get('v');
    else if (ID_PATH_PREFIXES.has(segments[0])) candidate = segments[1];
  }
  return isYoutubeVideoId(candidate) ? candidate : null;
}

// YouTube Data API'nin ISO 8601 süresini (PT1H2M3S) saniyeye çevirir; geçersiz ya da 0 süre için 0 döner.
function parseIsoDurationSeconds(value) {
  const match = typeof value === 'string' ? ISO_DURATION_PATTERN.exec(value) : null;
  if (!match) return 0;
  const [, days, hours, minutes, seconds] = match.map(part => Number.parseInt(part, 10) || 0);
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

module.exports = {
  extractYoutubeVideoId,
  isYoutubeVideoId,
  parseIsoDurationSeconds
};
