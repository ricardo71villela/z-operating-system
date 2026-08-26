const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');

const shell = read('customer-shell.html');
const catalogue = read('customer-catalog.js');
const runtime = read('customer-site.js');
const css = read('customer-commerce.css');

assert.match(shell, /customer-commerce\.css/);
assert.match(shell, /customer-catalog\.js/);
assert.ok(shell.indexOf('customer-catalog.js') < shell.indexOf('customer-site.js'), 'catalogue must load before runtime');

for (const id of ['p1','p2','p3','p4','p5','p6','p7','p8','p9','p10','p11','p12']) {
  assert.match(catalogue, new RegExp(`id:'${id}'`), `missing product ${id}`);
}
for (const category of ['women','men','kids','sport','accessories','beauty']) {
  assert.match(catalogue, new RegExp(`category:'${category}'`), `missing category ${category}`);
}
for (const partner of ['atelier-27','maison-nord','linea-44']) {
  assert.match(catalogue, new RegExp(`id:'${partner}'`), `missing partner ${partner}`);
}
for (const locale of ['fr','pt','en','es','it','de']) {
  assert.match(catalogue, new RegExp(`\\b${locale}:\\{name:`), `missing localized product copy for ${locale}`);
  assert.match(catalogue, new RegExp(`\\b${locale}:\\{new:`), `missing localized badges for ${locale}`);
}
assert.match(catalogue, /privateSale:true/);
assert.match(catalogue, /sale:true/);
assert.match(catalogue, /isNew:true/);
assert.match(catalogue, /window\.ZFashionCustomerCatalog/);

for (const renderer of ['renderCategory','renderSearch','renderProduct','renderCorners','renderCorner','renderPrivateSale']) {
  assert.match(runtime, new RegExp(`const\\s+${renderer}\\s*=`), `missing ${renderer}`);
}
assert.match(runtime, /productsForCategory/);
assert.match(runtime, /searchResults/);
assert.match(runtime, /\.slug\s*===\s*slug\(\)/);
assert.match(runtime, /\.partnerId\s*===\s*partner\.id/);
assert.match(runtime, /\.privateSale/);
assert.match(runtime, /new Intl\.NumberFormat/);
assert.match(runtime, /currentSort\s*===\s*'price-asc'/);
assert.match(runtime, /currentSort\s*===\s*'price-desc'/);
assert.match(runtime, /No stock reservation|Aucune réservation de stock/);
assert.match(runtime, /Z_FASHION_CUSTOMER_COMMERCE\s*=\s*'PREVIEW_PASS'/);
assert.doesNotMatch(runtime, /fetch\(|XMLHttpRequest|supabase|stripe|paymentIntent|createOrder|reserveStock/i);

for (const selector of ['commerce-product-grid','commerce-product-detail','commerce-corner-grid','corner-profile','private-sale-banner']) {
  assert.match(css, new RegExp(`\\.${selector}`), `missing commerce style ${selector}`);
}
assert.match(css, /@media\(max-width:680px\)/);
assert.match(css, /prefers-reduced-motion/);

console.log('Z_FASHION_FULL_CUSTOMER_COMMERCE=PASS');
