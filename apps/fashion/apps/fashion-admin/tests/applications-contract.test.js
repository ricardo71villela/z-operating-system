const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('index.html');
const js = read('backoffice-applications.js');
const { ALLOWED_TRANSITIONS } = require('../../../packages/fashion-domain/src/onboarding');

// Wired in: nav entry, page, script after app.js, behind the admin sign-in.
assert.match(html, /data-page="applications"/);
assert.match(html, /<section class="page[^"]*" id="applications"><div id="adminApplications"><\/div><\/section>/);
assert.match(html, /<script src="\.\/app\.js"><\/script>\s*<script src="\.\/backoffice-applications\.js"><\/script>/);
assert.match(html, /zfashion-auth\.js" data-surface="admin"/);

// Talks only to the admin API through the authenticated helper; builds DOM safely.
for (const route of ["'/admin/partner-applications'", "'/admin/partner-applications/' + encodeURIComponent(partnerId)", "'/decision'"]) {
  assert.ok(js.includes(route), `missing call ${route}`);
}
assert.doesNotMatch(js, /[^.a-zA-Z]fetch\(/, 'no direct fetch: calls carry the session token');
assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|document\.write|supabase|service_role/i);

// The moves offered from each status are exactly the domain's transitions.
const actionsSrc = js.match(/var ACTIONS = (\{[\s\S]*?\n  \});/)[1];
const ACTIONS = JSON.parse(JSON.stringify(vm.runInNewContext(`(${actionsSrc})`)));
for (const [from, allowed] of Object.entries(ALLOWED_TRANSITIONS)) {
  const offered = (ACTIONS[from] || []).map((a) => a.to).sort();
  assert.deepStrictEqual(offered, [...allowed].sort(), `actions from ${from}`);
}
// Notes are demanded where the API demands them; activation asks the stock mode.
for (const list of Object.values(ACTIONS)) for (const a of list) {
  assert.strictEqual(!!a.needsNote, a.to === 'rejected' || a.to === 'suspended', `note rule for ${a.to}`);
  assert.strictEqual(!!a.needsTier, a.to === 'active', `stock mode rule for ${a.to}`);
}

// Every decision error the API can return has a French message.
for (const key of ['err_note_required', 'err_note_too_long', 'err_feedReliabilityTier_required', 'err_conflict', 'err_generic']) {
  assert.ok(js.includes(`${key}:`), `missing message ${key}`);
}

console.log('Z_FASHION_ADMIN_APPLICATIONS=PASS');
