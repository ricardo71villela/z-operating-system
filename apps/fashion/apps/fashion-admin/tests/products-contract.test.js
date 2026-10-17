// Task 8: the backoffice "Produits" page moderates new products.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('index.html');
const js = read('backoffice-products.js');
const { ADMIN_TRANSITIONS } = require('../../../packages/fashion-domain/src/moderation');

assert.match(html, /data-page="products"/);
assert.match(html, /<section class="page" id="products"><div id="adminProducts"><\/div><\/section>/);
assert.match(html, /<script src="\.\/backoffice-applications\.js"><\/script>\s*<script src="\.\/backoffice-products\.js"><\/script>/);

// Only the admin API, through the signed-in helper; DOM built safely.
assert.ok(js.includes("'/admin/products?status='"));
assert.ok(js.includes("'/moderation'"));
assert.doesNotMatch(js, /[^.a-zA-Z]fetch\(/);
assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|document\.write/);
assert.match(js, /function safeImage/);

// The buttons offered match the domain: pending → approve/refuse,
// approved → withdraw (= rejected), rejected → reinstate (= approved).
assert.deepStrictEqual([...ADMIN_TRANSITIONS.pending], ['approved', 'rejected']);
assert.deepStrictEqual([...ADMIN_TRANSITIONS.approved], ['rejected']);
assert.deepStrictEqual([...ADMIN_TRANSITIONS.rejected], ['approved']);
for (const k of ['approve', 'reject', 'withdraw', 'reinstate', 'notePlaceholder', 'err_note_required', 'err_conflict']) assert.ok(js.includes(`${k}:`), `copy ${k}`);
assert.match(js, /if \(!area\.value\.trim\(\)\)/, 'a refusal or withdrawal needs a note');

// French only.
assert.doesNotMatch(js, /\ben:\s*\{|\bpt:\s*\{/);
console.log('Z_FASHION_ADMIN_PRODUCTS=PASS');
