// Task 19: nothing on the served site says "preview" or "demonstration".
// The served pages are the ones vercel.json routes to; the old preview
// pages (index.html, fr.html, polished.html) stay in the repository for
// their own contracts but are left out of the build.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const DEMO = /APERÇU|Aperçu|aperçu|Preview|PREVIEW|démonstration|démonstratif|preview-ribbon|tech-ribbon|footerPreview/;

for (const page of ['launch.html', 'customer-shell.html', '404.html', 'technical-shell.html']) {
  const html = read(page).replace(/<script[\s\S]*?<\/script>/g, '');
  const visible = html.replace(/<style[\s\S]*?<\/style>/g, '');
  assert.doesNotMatch(visible, DEMO, `${page} has no preview wording`);
}

const vercel = JSON.parse(read('vercel.json'));
assert.match(vercel.buildCommand, /rm -f public\/fr\.html public\/polished\.html/, 'old preview pages are not deployed');
const served = new Set(vercel.rewrites.map((r) => r.destination));
for (const old of ['/fr.html', '/polished.html', '/index.html']) assert.ok(!served.has(old), `${old} is not routed`);

// Page titles and descriptions set per language on the home page.
const i18n = read('launch-i18n.js');
for (const m of i18n.matchAll(/title:'([^']*)'|description:'([^']*)'/g)) {
  assert.doesNotMatch(m[1] || m[2], /Aperçu|Preview|Vista previa|Anteprima|Vorschau|aperçu|preview|vista previa|anteprima/, `title: ${m[0]}`);
}
assert.doesNotMatch(i18n, /previewLabel/);

// Live home: buttons lead to real pages; the campaign copy is the live one.
const home = read('home-live.js');
assert.match(home, /campaignCopy: 'Des sélections réservées aux membres/);
assert.match(read('technical.js'), /^(?![\s\S]*technicalPreview)/, 'technical pages have no ribbon hook');

// Copy that the live layers do not replace.
const site = read('customer-site.js');
const routes = read('customer-routes.js');
for (const m of site.matchAll(/privateIntro:'([^']*)'/g)) assert.doesNotMatch(m[1], /démonstration|demonstra|demostra|dimostra|Demo/i);
for (const m of routes.matchAll(/checkout:'([^']*)'/g)) assert.doesNotMatch(m[1], /aperçu|Preview/i);

console.log('Z_FASHION_NO_PREVIEW=PASS');
