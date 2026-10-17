const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const css = read('styles.css');
const js = read('app.js');

for (const asset of ['styles.css', 'app.js']) assert.match(html, new RegExp(asset.replace('.', '\\.')));
assert.match(html, /noindex,nofollow/);
assert.match(html, /<html lang="fr-FR" data-locale="fr">/);
assert.match(html, /<script src="\.\/zfashion-config\.js"><\/script>\s*<script src="\.\/zfashion-auth\.js" data-surface="admin"><\/script>\s*<\/head>/);
assert.ok(fs.existsSync(path.join(root, 'zfashion-auth.js')), 'missing synced zfashion-auth.js');

// Only real pages: every page in the menu is backed by a module that reads
// live data. No demonstration ribbon, no invented figures, no dead buttons.
const pages = [...html.matchAll(/<section class="page[^"]*" id="([a-z-]+)">/g)].map((m) => m[1]);
const nav = [...html.matchAll(/data-page="([a-z-]+)"/g)].map((m) => m[1]);
assert.ok(pages.length >= 1);
assert.deepStrictEqual([...nav].sort(), [...pages].sort(), 'menu and pages match');
for (const page of pages) {
  assert.match(html, new RegExp(`<section class="page[^"]*" id="${page}"><div id="admin[A-Z][A-Za-z]+"></div></section>`), `${page} is filled by a module`);
}
assert.doesNotMatch(html, /APERÇU|Aperçu|Preview|PREVIEW|démonstration|démonstratives|data-demo|Maison Nord|Atelier 27|Linea 44|€284|NOT ACTIVATED/);
assert.doesNotMatch(js, /Preview|PREVIEW|démonstration|data-demo/);
assert.doesNotMatch(html, /localeSelect|<option value="pt">/, 'the backoffice is in French only');

assert.doesNotMatch(js, /fetch\(|XMLHttpRequest|innerHTML/);
for (const selector of ['sidebar', 'topbar', 'panel', 'table']) {
  assert.match(css, new RegExp(`\\.${selector}`), `missing admin style ${selector}`);
}
assert.match(css, /\.app\{padding-top:0\}/, 'no space kept for a ribbon');
assert.match(css, /@media\(max-width:820px\)/);

console.log('Z_FASHION_ADMIN_BACKOFFICE=PASS');
