const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('public/adhesion.html');
const js = read('public/adhesion.js');
const domain = fs.readFileSync(path.join(root, '../../packages/fashion-domain/src/partner-application.js'), 'utf8');

// Loads the shared sign-in in account-creating mode, then the page.
assert.match(html, /<script src="\.\/zfashion-config\.js"><\/script>\s*<script src="\.\/zfashion-auth\.js" data-surface="onboarding"><\/script>/);
assert.match(html, /<script src="\.\/adhesion\.js"><\/script>/);
assert.match(html, /noindex,nofollow/);
assert.ok(fs.existsSync(path.join(root, 'public/zfashion-auth.js')));

// Talks only to the Partner API, through the authenticated helper.
assert.match(js, /apiFetch\('\/onboarding\/offer'\)/);
assert.match(js, /apiFetch\('\/partner-applications', \{ method: 'POST'/);
assert.doesNotMatch(js, /\bfetch\(/, 'no direct fetch: every call carries the session token');
assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|document\.write|supabase|service_role/i);

// Terms link comes from the API and opens safely; version is sent back.
assert.match(js, /rel: 'noopener'/);
assert.match(js, /payload\.termsVersion = /);

// Every refusal the server can produce has a message in both languages.
const domainCodes = new Set([...domain.matchAll(/add\('[a-zA-Z]+', '([a-z_]+)'\)/g)].map((m) => m[1]));
domainCodes.delete('account_email_missing'); // server-side only, never caused by the form
domainCodes.delete('terms_not_published');   // shown as the "closed" view
for (const code of [...domainCodes, 'fashion_application_pending', 'fashion_application_duplicate', 'partner_terms_not_published']) {
  for (const lang of ['fr', 'en']) {
    const block = js.slice(js.indexOf(`${lang}: {`), js.indexOf(lang === 'fr' ? 'en: {' : '};'));
    assert.ok(block.includes(`err_${code}:`), `missing ${lang} message for ${code}`);
  }
}
assert.ok(domainCodes.size >= 10, 'parsed the domain error codes');

// Every field the domain validates has a slot on the page.
for (const field of ['tradeName', 'legalName', 'registrationNumber', 'vatNumber', 'addressLine1', 'postalCode', 'city', 'contactPhone', 'website', 'categories', 'ageSegments', 'minorSafeDataAcknowledged', 'acceptTerms']) {
  assert.match(html, new RegExp(`data-for="${field}"`), `missing error slot for ${field}`);
}

console.log('Z_FASHION_PARTNER_ADHESION=PASS');
