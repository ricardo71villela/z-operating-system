const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { SOURCE, TARGETS } = require('../sync');

const src = fs.readFileSync(SOURCE, 'utf8');

for (const target of TARGETS) {
  assert.ok(fs.existsSync(target), `missing copy: ${target} — run sync.js`);
  assert.strictEqual(fs.readFileSync(target, 'utf8'), src, `stale copy: ${target} — run sync.js`);
}

// Safety properties of the module itself.
assert.match(src, /shouldCreateUser: createsAccounts/, 'account creation is decided in one place');
assert.match(src, /var createsAccounts = surface === 'onboarding';/, 'only the adhesion page creates accounts');
assert.match(src, /sb_publishable_/, 'uses the public publishable key');
assert.doesNotMatch(src, /service_role|SUPABASE_SERVICE|secret/i, 'no privileged key may appear in browser code');
assert.doesNotMatch(src, /innerHTML|insertAdjacentHTML|document\.write/, 'DOM is built with textContent only');
assert.match(src, /surface === 'admin'\s*\n?\s*\? body\.isAdmin === true/, 'admin surface requires isAdmin');
assert.match(src, /surface === 'onboarding'\s*\n?\s*\? body\.authenticated === true/, 'onboarding requires a signed-in person');
assert.match(src, /body\.partnerIds\.length > 0/, 'partner surface requires a managed Partner');
assert.match(src, /zf-auth-locked/, 'page content stays hidden until authorized');
for (const lang of ['fr', 'en']) assert.match(src, new RegExp(`\\b${lang}: \\{`), `missing ${lang} strings`);

console.log('Z_FASHION_WEB_AUTH=PASS');
