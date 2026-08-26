const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));

for (const marker of ['Z Fashion', 'All Sale', 'Corners', 'Wishlist', 'checkoutPreview', 'localeSelect', 'zos-mark-chrome.svg']) {
  assert.ok(html.includes(marker), `missing storefront marker: ${marker}`);
}
for (const locale of ['pt','en','fr','es','it','de']) {
  assert.ok(js.includes(`${locale}:{`) || js.includes(`${locale}: {`), `missing locale: ${locale}`);
}
for (const productDomain of ['women','men','sports','accessories']) {
  assert.ok(js.includes(`category:"${productDomain}"`), `missing product domain: ${productDomain}`);
}
assert.ok(html.includes('noindex,nofollow'), 'preview must remain noindex');
assert.ok(html.includes('sem pagamentos live'), 'preview must disclose payment boundary');
assert.ok(js.includes('Stock demonstrativo'), 'product detail must disclose stock boundary');
assert.ok(css.includes('@media(max-width:680px)'), 'mobile responsive contract missing');
assert.ok(css.includes('prefers-reduced-motion'), 'reduced motion accessibility contract missing');
assert.equal(vercel.cleanUrls, false, 'static .html rewrite destinations require cleanUrls disabled');
assert.equal(vercel.trailingSlash, false);

console.log('Z_FASHION_STOREFRONT_PREVIEW_CONTRACT=PASS');
