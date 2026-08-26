const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');

const shell = read('customer-shell.html');
const runtime = read('customer-completion.js');
const css = read('customer-completion.css');

assert.match(shell, /customer-completion\.css/);
assert.match(shell, /customer-completion\.js/);
assert.ok(shell.indexOf('customer-site.js') < shell.indexOf('customer-completion.js'), 'completion must enhance base customer runtime');
assert.ok(shell.indexOf('customer-state.js') < shell.indexOf('customer-completion.js'), 'completion needs Preview state before rendering checkout');

for (const id of ['checkoutIdentify','checkoutDelivery','checkoutPayment','checkoutReview','checkoutConfirmation']) {
  assert.match(runtime, new RegExp(`'${id}'`), `missing checkout step ${id}`);
}
for (const pathname of ['/checkout','/checkout/livraison','/checkout/paiement','/checkout/revision','/checkout/confirmation']) {
  assert.ok(runtime.includes(pathname), `missing checkout path ${pathname}`);
}
assert.match(runtime, /checkout-progress/);
assert.match(runtime, /checkout-summary/);
assert.match(runtime, /ZF-PREVIEW-NOT-CREATED/);
assert.match(runtime, /Payment: Disabled/);
assert.match(runtime, /Stock reservation: Disabled/);
assert.match(runtime, /Order creation: Disabled/);
assert.match(runtime, /No real order will be created|Aucune commande réelle ne sera créée/);

for (const id of ['delivery','refunds','help']) assert.match(runtime, new RegExp(`route\.id === '${id}'`));
assert.match(runtime, /service-card-grid/);
assert.match(runtime, /return-steps/);
assert.match(runtime, /faq-list/);
assert.match(runtime, /previewContact/);
assert.match(runtime, /contact-form/);
assert.match(runtime, /Aucun envoi réel|Nothing was sent/);

for (const id of ['legalNotice','termsSale','termsUse','privacy','cookies']) assert.match(runtime, new RegExp(`${id}:`));
assert.match(runtime, /route\.id === 'consent'/);
assert.match(runtime, /legal-warning/);
assert.match(runtime, /legal-document/);
assert.match(runtime, /zfashion_preview_consent_v1/);
assert.match(runtime, /n’activent aucun tracker/);
assert.match(runtime, /validation juridique obligatoire|legal validation required/);

for (const locale of ['fr','pt','en','es','it','de']) assert.match(runtime, new RegExp(`\\b${locale}:\\s*\\{\\s*preview:`), `missing completion shell copy for ${locale}`);
assert.match(runtime, /window\.Z_FASHION_CUSTOMER_COMPLETION = 'PREVIEW_PASS'/);

assert.doesNotMatch(runtime, /fetch\(|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon/i);
assert.doesNotMatch(runtime, /supabase|stripe|paymentIntent|confirmPayment|reserveStock|createOrder|insert\(|update\(|delete\(/i);

for (const selector of ['checkout-progress','checkout-layout','checkout-summary','completion-options','payment-options','service-card-grid','faq-list','legal-document','consent-panel']) {
  assert.match(css, new RegExp(`\\.${selector}`), `missing completion style ${selector}`);
}
assert.match(css, /@media\(max-width:680px\)/);
assert.match(css, /prefers-reduced-motion/);

console.log('Z_FASHION_FULL_CUSTOMER_COMPLETION=PASS');
