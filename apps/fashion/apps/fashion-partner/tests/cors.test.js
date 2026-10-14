const assert = require('assert');
const { loadAllowedOrigins, corsHeadersFor } = require('../src/cors');

assert.deepStrictEqual(loadAllowedOrigins({}), []);
assert.deepStrictEqual(
  loadAllowedOrigins({ FASHION_ALLOWED_ORIGINS: ' https://a.test/ , ,https://b.test' }),
  ['https://a.test', 'https://b.test'],
  'trims spaces and trailing slashes, drops empties'
);

const allowed = ['https://admin.zfashion.test'];
assert.deepStrictEqual(corsHeadersFor(undefined, allowed), {}, 'no Origin header => no CORS headers');
assert.deepStrictEqual(corsHeadersFor('https://evil.test', allowed), {}, 'unknown origin => no CORS headers');
assert.deepStrictEqual(corsHeadersFor('https://admin.zfashion.test.evil.test', allowed), {}, 'exact match only');
assert.deepStrictEqual(corsHeadersFor('https://admin.zfashion.test', []), {}, 'empty allowlist => nobody');

const h = corsHeadersFor('https://admin.zfashion.test', allowed);
assert.strictEqual(h['Access-Control-Allow-Origin'], 'https://admin.zfashion.test');
assert.strictEqual(h.Vary, 'Origin');
assert.match(h['Access-Control-Allow-Headers'], /Authorization/);
assert.ok(!('Access-Control-Allow-Credentials' in h), 'tokens travel in headers, never cookies');

console.log('fashion-partner CORS: all checks passed.');
