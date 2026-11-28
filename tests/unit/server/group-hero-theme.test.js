'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_HERO_THEME,
  VALID_HERO_THEMES,
  normalizeHeroTheme
} = require('../../../src/server/modules/groups/group-settings');

test('kapak teması: bilinmeyen değer varsayılan grup resmine döner', () => {
  assert.equal(DEFAULT_HERO_THEME, 'gorsel');
  assert.equal(normalizeHeroTheme('zumrut'), 'zumrut');
  assert.equal(normalizeHeroTheme('url(javascript:alert(1))'), 'gorsel');
  assert.equal(normalizeHeroTheme(undefined), 'gorsel');
  assert.ok(VALID_HERO_THEMES.has('gece'));
});
