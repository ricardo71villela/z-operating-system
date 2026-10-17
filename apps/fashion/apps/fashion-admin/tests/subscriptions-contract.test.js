// Task 9: the backoffice "Abonnements" page lists every store's subscription.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('index.html');
const js = read('backoffice-subscriptions.js');
const { STATES } = require('../../../packages/fashion-domain/src/subscription');

assert.match(html, /data-page="subscriptions"/);
assert.match(html, /<section class="page" id="subscriptions"><div id="adminSubscriptions"><\/div><\/section>/);
assert.match(html, /<script src="\.\/backoffice-products\.js"><\/script>\s*<script src="\.\/backoffice-subscriptions\.js"><\/script>/);
assert.ok(js.includes("'/admin/subscriptions'"));
assert.doesNotMatch(js, /[^.a-zA-Z]fetch\(|innerHTML|insertAdjacentHTML/);
for (const s of STATES) assert.ok(js.includes(`s_${s}:`), `label for ${s}`);
assert.match(js, /past_due: 0/, 'failed payments first');
console.log('Z_FASHION_ADMIN_SUBSCRIPTIONS=PASS');
