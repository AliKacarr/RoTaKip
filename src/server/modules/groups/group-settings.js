'use strict';

const VALID_AMOUNT_TYPES = new Set(['sayfa', 'dakika']);

const VALID_CETELE_FIELD_TYPES = new Set(['sayi', 'metin']);

// Grup kapağı (okumalar-hero) arka planı. "gorsel": grup resmi bulanık arka plan (varsayılan);
// diğerleri sabit renk geçişleridir (istemcide group-hero.css içinde tanımlıdır).
const DEFAULT_HERO_THEME = 'gorsel';
const VALID_HERO_THEMES = new Set(['gorsel', 'indigo', 'zumrut', 'gunbatimi', 'okyanus', 'gul', 'gece']);

function normalizeHeroTheme(value) {
  return VALID_HERO_THEMES.has(value) ? value : DEFAULT_HERO_THEME;
}

function normalizeAmountType(value) {
  return VALID_AMOUNT_TYPES.has(value) ? value : 'sayfa';
}

module.exports = {
  DEFAULT_HERO_THEME,
  VALID_HERO_THEMES,
  normalizeHeroTheme,
  VALID_AMOUNT_TYPES,
  VALID_CETELE_FIELD_TYPES,
  normalizeAmountType
};
