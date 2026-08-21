/* Run with: node apps/fashion/packages/fashion-domain/tests/corner-config.test.js */

const assert = require('assert');
const { createCornerConfig, MAX_BYLINE_LENGTH } = require('../src/corner-config');

const config = createCornerConfig({
  partnerId: 'partner_atelier', displayName: 'Atelier du Marais',
  byline: 'Atelier fondé en 2015 à Paris', accentColor: '#c9a227',
  logoUrl: 'https://cdn.example.com/atelier-du-marais/logo.png',
});
assert.strictEqual(config.displayName, 'Atelier du Marais');
assert.strictEqual(config.accentColor, '#c9a227');

// Required fields.
assert.throws(
  () => createCornerConfig({ displayName: 'X', logoUrl: 'https://x' }),
  /partnerId is required/
);

// Byline over the cap is rejected, not silently truncated — the Partner
// must know it needs to shorten it, not have their story cut mid-sentence.
const longByline = 'x'.repeat(MAX_BYLINE_LENGTH + 1);
assert.throws(
  () => createCornerConfig({
    partnerId: 'p1', displayName: 'X', byline: longByline, logoUrl: 'https://x',
  }),
  /exceeds 140 characters/
);

// Invalid accent color rejected — no arbitrary CSS, only a hex value.
assert.throws(
  () => createCornerConfig({
    partnerId: 'p1', displayName: 'X', accentColor: 'red', logoUrl: 'https://x',
  }),
  /not a valid 6-digit hex color/
);

// The schema itself has no field for layout, markup, or custom components —
// nothing to assert here beyond: only the documented fields exist.
assert.deepStrictEqual(
  Object.keys(config).sort(),
  ['accentColor', 'byline', 'displayName', 'logoUrl', 'partnerId']
);

console.log('corner-config.js: all invariant checks passed.');
