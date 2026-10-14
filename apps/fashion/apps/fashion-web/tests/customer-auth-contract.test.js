const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const auth = read('customer-auth.js');
const shell = read('customer-shell.html');
const launch = read('launch.html');

// Loaded last on both entry points, after the demo layers it sits on top of.
assert.match(shell, /<script src="\/customer-interactions\.js"><\/script>\s*<script src="\/customer-auth\.js"><\/script>/);
assert.match(launch, /<script src="\.\/launch-i18n\.js"><\/script>\s*<script src="\.\/customer-auth\.js"><\/script>/);

// Customers sign up by signing in; registration goes through the DB-owned function.
assert.match(auth, /shouldCreateUser:\s*true/);
assert.match(auth, /rpc\('zfashion_ensure_client'\)/);
assert.match(auth, /type: 'email'/);

// Account pages require a session.
assert.match(auth, /location\.replace\('\/connexion\?next='/);

// Safety.
assert.match(auth, /sb_publishable_/);
assert.doesNotMatch(auth, /service_role|SUPABASE_SERVICE|secret/i, 'no privileged key in browser code');
assert.doesNotMatch(auth, /innerHTML|insertAdjacentHTML|document\.write/, 'DOM built with textContent only');
assert.match(auth, /href: '\/conditions-utilisation'/);
assert.match(auth, /href: '\/confidentialite'/);
for (const lang of ['fr', 'en']) assert.match(auth, new RegExp(`\\b${lang}: \\{`));

// safeNext: only same-site paths survive (no open redirect).
const safeNextSrc = auth.match(/function safeNext\(raw\) \{[\s\S]*?\n  \}/)[0];
const safeNext = vm.runInNewContext(`(${safeNextSrc.replace('function safeNext', 'function')})`);
assert.strictEqual(safeNext('/compte/commandes'), '/compte/commandes');
for (const bad of ['//evil.example', 'https://evil.example', '/\\evil.example', '', null, 'compte']) {
  assert.strictEqual(safeNext(bad), '/compte', `must reject ${bad}`);
}

console.log('Z_FASHION_CUSTOMER_AUTH=PASS');
