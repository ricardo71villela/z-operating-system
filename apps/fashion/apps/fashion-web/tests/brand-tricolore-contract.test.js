/* Tricolour Z Fashion mark (2026-10-15): same pin-and-Z shape, bleu → blanc → rouge. */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const light = read('brand/zfashion-mark.svg');
const dark = read('brand/zfashion-mark-dark.svg');
const mono = read('brand/zfashion-mark-mono.svg');
const shapes = (svg) => [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
assert.deepStrictEqual(shapes(light), shapes(dark), 'light and dark marks share the exact shape');
assert.deepStrictEqual(shapes(light), shapes(mono));
assert.strictEqual(shapes(light).length, 2, 'pin+ring and Z');
for (const svg of [light, dark]) {
  assert.match(svg, /<linearGradient id="zf-tricolore" gradientUnits="userSpaceOnUse" x1="0" y1="149" x2="0" y2="856">/, 'vertical gradient over the whole mark');
  assert.match(svg, /<title>Z Fashion<\/title>/);
  assert.doesNotMatch(svg, /<script|on[a-z]+=|href=/i);
}
assert.match(light, /stop-color="#000091"/, 'bleu France at the top');
assert.match(light, /stop-color="#E1000F"/, 'rouge at the point');
assert.match(dark, /stop-color="#FFFFFF"/, 'true white band on dark backgrounds');

const css = read('brand-tricolore.css');
assert.match(css, /\.site-header \.brand::before\{display:none!important\}/, 'no black tile on the home page');
assert.match(css, /zfashion-mark\.svg/);
assert.match(css, /zfashion-mark-dark\.svg/);
for (const page of ['launch.html', 'customer-shell.html', '404.html', 'technical-shell.html']) {
  const html = read(page);
  assert.match(html, /brand-tricolore\.css/, `${page} loads the tricolour styles`);
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="\/brand\/zfashion-mark\.svg">/, `${page} favicon`);
}
console.log('Z_FASHION_TRICOLOUR_MARK=PASS');
