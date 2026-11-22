'use strict';

const REQUEST_TIMEOUT_MS = 6000;
const USER_AGENT = 'RoTaKip/1.0 (prayer-location-lookup)';

// Koordinattan adres adlarını çıkaran sağlayıcılar. Her biri { countryCode, plate, names } döner;
// biri başarısız olursa sıradaki denenir.
const PROVIDERS = Object.freeze([
  {
    name: 'nominatim',
    buildUrl: (latitude, longitude) => 'https://nominatim.openstreetmap.org/reverse'
      + `?format=jsonv2&addressdetails=1&zoom=12&accept-language=tr&lat=${latitude}&lon=${longitude}`,
    parse(data) {
      const address = data?.address;
      if (!address) return null;
      return {
        countryCode: String(address.country_code || '').toUpperCase(),
        plate: plateFromIso(address['ISO3166-2-lvl4'] || address['ISO3166-2-lvl6']),
        names: Object.entries(address)
          .filter(([key]) => !/^(ISO3166|country|postcode)/.test(key))
          .map(([, value]) => value)
      };
    }
  },
  {
    name: 'bigdatacloud',
    buildUrl: (latitude, longitude) => 'https://api.bigdatacloud.net/data/reverse-geocode-client'
      + `?latitude=${latitude}&longitude=${longitude}&localityLanguage=tr`,
    parse(data) {
      if (!data || typeof data !== 'object' || !data.countryCode) return null;
      return {
        countryCode: String(data.countryCode).toUpperCase(),
        plate: plateFromIso(data.principalSubdivisionCode),
        names: [
          data.principalSubdivision,
          data.city,
          data.locality,
          ...(data.localityInfo?.administrative || []).map(entry => entry.name)
        ]
      };
    }
  }
]);

function plateFromIso(code) {
  const match = /^TR-(\d{1,2})$/.exec(String(code || ''));
  return match ? match[1].padStart(2, '0') : '';
}

async function fetchJson(fetchImpl, url, timeoutMs) {
  const response = await fetchImpl(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function createReverseGeocoder({ fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  return async function reverseGeocode(latitude, longitude) {
    let lastError = null;
    for (const provider of PROVIDERS) {
      try {
        const data = await fetchJson(fetchImpl, provider.buildUrl(latitude, longitude), timeoutMs);
        const place = provider.parse(data);
        if (place) return place;
        lastError = new Error(`${provider.name}: sonuç bulunamadı`);
      } catch (error) {
        lastError = new Error(`${provider.name}: ${error.message}`);
      }
    }
    const error = new Error(lastError?.message || 'Konum servisine ulaşılamadı');
    error.statusCode = 502;
    throw error;
  };
}

module.exports = {
  createReverseGeocoder,
  plateFromIso
};
