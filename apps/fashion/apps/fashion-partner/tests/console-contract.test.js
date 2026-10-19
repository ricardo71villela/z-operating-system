const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('public/dashboard.html');
const js = read('public/console.js');
const { CATEGORIES, AGE_SEGMENTS } = require('../../../packages/fashion-domain/src/partner');
const { SKU_RE, SIZED_CATEGORIES } = require('../../../packages/fashion-domain/src/product');

// The real console sits behind the Partner sign-in; the old mock-up is a separate reference page.
assert.match(html, /<script src="\.\/zfashion-config\.js"><\/script>\s*<script src="\.\/zfashion-auth\.js" data-surface="partner"><\/script>/);
assert.match(html, /<script src="\.\/console\.js"><\/script>/);
assert.match(html, /noindex,nofollow/);
assert.doesNotMatch(html, /Maison Nord|démonstration|APERÇU/i, 'no demo content in the real console');
for (const tab of ['overview', 'catalogue', 'stock', 'corner', 'payouts']) {
  assert.match(html, new RegExp(`data-tab="${tab}"`));
  assert.match(html, new RegExp(`id="tab-${tab}"`));
}

// Only the authenticated helper, only the Partner API; DOM built safely.
assert.doesNotMatch(js, /[^.a-zA-Z]fetch\(/, 'every call carries the session token');
assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|document\.write|supabase|service_role/i);
for (const route of ["'/payouts'", "'/payouts/onboarding'", "'/payouts/dashboard'", "'/application'", "'/inventory'", "'/brands'", "'/corner-config'", "'/products'", "'/stock/bulk'", "'/price'"]) {
  assert.ok(js.includes(route), `missing call ${route}`);
}

// Same vocabularies and rules as the domain.
const arr = (name) => JSON.parse(JSON.stringify(vm.runInNewContext(js.match(new RegExp(`var ${name} = (\\[[^\\]]*\\]);`))[1])));
assert.deepStrictEqual(arr('CATEGORIES'), [...CATEGORIES]);
assert.deepStrictEqual(arr('SIZED'), [...SIZED_CATEGORIES]);
assert.deepStrictEqual([...arr('AGES')].sort(), [...AGE_SEGMENTS].sort());
assert.strictEqual(js.match(/var SKU_RE = (\/.*\/);/)[1], String(SKU_RE));

// Every category and age has a label in both languages.
for (const lang of ['fr', 'en']) {
  const block = js.slice(js.indexOf(`${lang}: {`), js.indexOf(lang === 'fr' ? '    en: {' : '\n  };'));
  for (const c of CATEGORIES) assert.ok(block.includes(`cat_${c}:`), `${lang} label for ${c}`);
  for (const a of AGE_SEGMENTS) assert.ok(block.includes(`age_${a}:`), `${lang} label for ${a}`);
}

// The stock-file parser: header skipped, ; or , accepted, unknown/invalid reported.
const parserSrc = js.match(/function parseStockCsv\(text\) \{[\s\S]*?\n  \}/)[0];
const ctx = { state: { inventory: [{ id: 'p1', sku: 'VES-38' }, { id: 'p2', sku: 'VES-40' }, { id: 'p3', sku: null }] } };
vm.runInNewContext(parserSrc + '; this.parse = parseStockCsv;', ctx);
const out = JSON.parse(JSON.stringify(ctx.parse('﻿reference;quantite\r\nVES-38;5\nVES-40,7\nINCONNU;3\nVES-38;oops\n\nVES-40;9\n')));
assert.deepStrictEqual(out.updates, [{ productId: 'p1', quantityAvailable: 5 }, { productId: 'p2', quantityAvailable: 9 }]);
assert.deepStrictEqual(out.unknown, ['INCONNU']);
assert.deepStrictEqual(out.invalid, [5]);
assert.deepStrictEqual(out.duplicates, ['VES-40']);

// Photos: same limits as the domain; uploads go through the API only.
const media = require('../../../packages/fashion-domain/src/media');
assert.strictEqual(Number(js.match(/MAX_BYTES = 5 \* 1024 \* 1024/) ? media.MAX_IMAGE_BYTES : -1), media.MAX_IMAGE_BYTES);
assert.ok(js.includes("var room = 8 - images.length;") && media.MAX_IMAGES_PER_PRODUCT === 8);
assert.deepStrictEqual(JSON.parse(JSON.stringify(vm.runInNewContext(js.match(/ACCEPTED = (\[[^\]]*\])/)[1]))), Object.keys(media.FORMATS));
for (const route of ["'/images'", "'/images/order'", "'/logo'"]) assert.ok(js.includes(route), `missing call ${route}`);

// Tricolour Z Fashion mark (2026-10-15) on the Partner pages, the backoffice and the shared sign-in card.
{
  const fsx = require('fs'); const px = require('path');
  const readx = (f) => fsx.readFileSync(px.join(__dirname, '..', f), 'utf8');
  for (const [file, id] of [['public/dashboard.html', 'zf-tri-pc'], ['public/adhesion.html', 'zf-tri-ad'], ['../fashion-admin/index.html', 'zf-tri-admin']]) {
    const html = readx(file);
    assert.match(html, new RegExp(`<linearGradient id="${id}"`), `${file}: tricolour mark`);
    assert.match(html, /stop-color="#E1000F"|stop-color="#FFFFFF"/);
    assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,/, `${file}: favicon`);
  }
  assert.match(readx('public/zfashion-auth.js'), /function brandMark\(\)/);
}

// Moderation (task 8): status column, reason and a way to ask a new review.
assert.match(js, /function moderationCell\(p\)/);
assert.match(js, /'\/resubmit'/);
assert.match(js, /mod_pending: 'En attente de validation'/);

// Subscription (task 9): own tab, Stripe pages only, copy for every state.
assert.match(html, /data-tab="subscription"/);
assert.match(html, /id="tab-subscription"/);
assert.match(js, /goToStripe\('\/subscription\/checkout', go\)/);
assert.match(js, /goToStripe\('\/subscription\/portal', manage\)/);
for (const st of ['not_set_up', 'trial', 'active', 'past_due', 'canceled']) assert.ok(js.includes(`sub_${st}: '`), `state ${st}`);
assert.match(js, /1 : 39 €, 2 : 49 €, 3 ou plus : 59 € HT par mois/);
console.log('Z_FASHION_PARTNER_CONSOLE=PASS');
