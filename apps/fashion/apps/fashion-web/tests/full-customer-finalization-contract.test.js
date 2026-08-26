const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');

const shell = read('customer-shell.html');
const i18n = read('customer-completion-i18n.js');
const notFound = read('404.html');
const technicalShell = read('technical-shell.html');
const technicalRuntime = read('technical.js');
const technicalCss = read('technical.css');
const vercel = JSON.parse(read('vercel.json'));

assert.match(shell, /customer-completion-i18n\.js/);
assert.ok(shell.indexOf('customer-completion.js') < shell.indexOf('customer-completion-i18n.js'), 'detailed locale completion must enhance the completed page runtime');
assert.ok(shell.indexOf('customer-completion-i18n.js') < shell.indexOf('customer-interactions.js'), 'locale completion must settle before generic interactions');

for (const locale of ['es','it','de']) {
  assert.match(i18n, new RegExp(`\\b${locale}:\\s*\\{`), `missing detailed ${locale} completion`);
}
for (const key of ['delivery','returns','faq','legalNotice','termsSale','termsUse','privacy','cookies']) {
  assert.ok(i18n.includes(`${key}:`), `missing detailed localized block ${key}`);
}
assert.match(i18n, /Z_FASHION_COMPLETION_I18N = 'SIX_LOCALE_DETAIL_PASS'/);
assert.doesNotMatch(i18n, /fetch\(|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon|supabase|stripe|createOrder|reserveStock/i);

for (const html of [notFound, technicalShell]) {
  assert.match(html, /noindex,nofollow/);
  assert.equal((html.match(/zos-mark-white-tile\.svg/g)||[]).length, 2, 'technical shell must reuse exact approved logo asset in header and footer');
  assert.match(html, /technical\.css/);
  assert.match(html, /technical\.js/);
  for (const locale of ['fr','pt','en','es','it','de']) assert.match(html, new RegExp(`<option value="${locale}">`));
  assert.doesNotMatch(html, /Z Operating System/i);
}
assert.match(notFound, /data-technical-state="notFound"/);
assert.match(notFound, />404</);
assert.match(technicalShell, /id="technicalCode">503</);

for (const locale of ['fr','pt','en','es','it','de']) assert.match(technicalRuntime, new RegExp(`\\b${locale}:\\s*\\{`), `missing technical locale ${locale}`);
for (const state of ['notFound','error','maintenance']) assert.match(technicalRuntime, new RegExp(`${state}:\\s*\\{`), `missing technical state ${state}`);
assert.match(technicalRuntime, /Z_FASHION_TECHNICAL_STATES='PREVIEW_PASS'/);
assert.doesNotMatch(technicalRuntime, /fetch\(|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon|supabase|stripe|createOrder|reserveStock/i);

assert.match(technicalCss, /\.tech-logo img\{[^}]*filter:invert\(1\)/);
assert.match(technicalCss, /\.tech-footer-brand img/);
assert.match(technicalCss, /@media\(max-width:760px\)/);
assert.match(technicalCss, /prefers-reduced-motion/);

const rewrites = new Map(vercel.rewrites.map(r => [r.source,r.destination]));
assert.equal(rewrites.get('/404'), '/404.html');
assert.equal(rewrites.get('/erreur'), '/technical-shell.html');
assert.equal(rewrites.get('/maintenance'), '/technical-shell.html');
assert.equal(rewrites.get('/'), '/launch.html', 'homepage authority must remain unchanged');

console.log('Z_FASHION_FULL_CUSTOMER_FINALIZATION=PASS');
