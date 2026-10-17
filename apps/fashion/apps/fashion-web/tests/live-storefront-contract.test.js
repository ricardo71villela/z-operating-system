/* Live storefront (tasks 13–14): the site switches from the demonstration
   catalogue to the real one when zfashion-config.js gives the API address. */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const shell = read('customer-shell.html');
const launch = read('launch.html');
const config = read('zfashion-config.js');
const live = read('customer-live.js');
const home = read('home-live.js');
const checkout = read('customer-checkout.js');

// Configuration: empty by default (demonstration until the API is deployed).
assert.match(config, /window\.__ZFASHION_CONFIG__\s*=\s*\{\s*apiBaseUrl:\s*''/);

// Load order.
const order = (html, files) => files.map((f) => html.indexOf(f)).every((i, n, a) => i !== -1 && (n === 0 || a[n - 1] < i));
assert.ok(order(shell, ['zfashion-config.js', 'customer-routes.js', 'customer-state.js', 'customer-live.js', 'customer-checkout.js', 'customer-account.js', 'customer-site.js', 'customer-completion.js', 'customer-interactions.js', 'customer-auth.js']), 'shell script order');
assert.ok(order(launch, ['zfashion-config.js', 'customer-state.js', 'app.js', 'customer-auth.js', 'home-live.js']), 'home script order');

// Hand-over: every demonstration layer yields the pages the live layer owns.
assert.match(read('customer-site.js'), /window\.ZFashionLive\.owns\(route\)\)\s*\{\s*window\.ZFashionLive\.render\(\);\s*return;/);
assert.match(read('customer-interactions.js'), /ZFashionLive\.owns\(route\)\)return;/);
assert.match(read('customer-completion.js'), /ZFashionLive\.owns\(route\)\) return;/);

// Live layer: active only with an API address, public listing only, everything escaped.
for (const src of [live, home, checkout]) {
  if (src !== checkout) { assert.match(src, /apiBaseUrl/); assert.match(src, /\/catalog\/listing/); }
  if (src !== checkout) assert.match(src, /const esc = /);
  assert.doesNotMatch(src, /\$\{(name|storeName|description|sizeLabel)\([^)]*\)\}/, 'API text must go through esc()');
  assert.doesNotMatch(src, /\$\{[a-z]+\.(names|brandName|byline|storeName|name|logoUrl|accentColor)\}/, 'API fields must go through esc()');
  assert.doesNotMatch(src, /eval\(|new Function|document\.write/);
}
assert.match(live, /window\.ZFashionLive = \{/);
assert.match(live, /owns: \(r\) =>/);
assert.match(live, /register: \(routeId/);
for (const r of ['renderCategory', 'renderSearch', 'renderProduct', 'renderCorners', 'renderCorner', 'renderFavourites', 'renderBag']) {
  assert.match(live, new RegExp(`function ${r}\\(`), `missing ${r}`);
}
assert.match(live, /sections/, 'site pages come from fashion-domain storefront sections');
assert.match(live, /MAX_QTY = 10/, 'same line limit as the API');
assert.match(live, /Livraison incluse en France/);
assert.match(home, /asLink\('#accountButton', '\/compte'\); asLink\('#memberButton', '\/vente-privee'\);/, 'home buttons lead to the real pages');
for (const r of ['renderAccount', 'renderProfile', 'renderReturns', 'renderTracking']) assert.match(checkout, new RegExp(`function ${r}\\(`), `missing ${r}`);
assert.match(checkout, /account: renderAccount, profile: renderProfile, returns: renderReturns, tracking: renderTracking/, 'every account page is live');

// Checkout (task 14): signed-in calls only, Stripe-hosted card entry, bag emptied only once paid.
assert.match(checkout, /const \{ esc, money/);
assert.match(checkout, /Authorization: 'Bearer ' \+ s\.access_token/);
assert.match(checkout, /'\/clients\/' \+ encodeURIComponent\(s\.user\.id\)/);
assert.match(checkout, /const STRIPE_JS = 'https:\/\/js\.stripe\.com\/v3\/'/);
assert.match(checkout, /elements\.create\('payment'/);
assert.match(checkout, /stripe\.confirmPayment\(/);
assert.match(checkout, /return_url: location\.origin \+ '\/checkout\/confirmation\?order='/);
assert.doesNotMatch(checkout, /cardNumber|name="card|cvc|card_number/i, 'no card field outside Stripe');
assert.match(checkout, /const paid = order && \['paid', 'fulfilling', 'fulfilled'\]\.includes\(order\.status\);\s*if \(paid\) \{ STATE\.clearBag\(\)/);
assert.match(checkout, /'\/checkout', \{ addressId \}/);
assert.match(checkout, /Commander et payer/, 'French order button states the obligation to pay');
assert.match(checkout, /id="coTerms"/);
for (const id of ['checkoutIdentify', 'checkoutDelivery', 'checkoutReview', 'checkoutPayment', 'checkoutConfirmation', 'orders', 'order', 'addresses']) {
  assert.match(checkout, new RegExp(`\\b${id}: render`), `checkout registers ${id}`);
}
assert.match(read('customer-state.js'), /const clearBag = /);

console.log('Z_FASHION_LIVE_STOREFRONT=PASS');
