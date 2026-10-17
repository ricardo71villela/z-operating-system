// Task 5: legal texts. French is binding; {{...}} = to complete before launch.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const legal = require('../legal-content.js');
const { SUBSCRIPTION_TIERS, TICKET_COMMISSION_TIERS } = require('../../../packages/fashion-domain/src/commission');

const text = (id) => {
  const d = legal.DOCS[id];
  return [d.title, ...(d.sections || []).flatMap((s) => [s.h, ...(s.p || []), ...(s.ul || [])]), ...(d.faq || []).flat()].join('\n');
};

// Every legal and service route has a document.
for (const id of ['legalNotice', 'termsSale', 'termsUse', 'privacy', 'cookies', 'consent', 'partnerTerms', 'delivery', 'refunds', 'help']) {
  assert.ok(legal.DOCS[id], `missing ${id}`);
  assert.ok((legal.DOCS[id].sections || []).length || (legal.DOCS[id].faq || []).length, `${id} is empty`);
}

// No leftover "preview" wording.
for (const id of Object.keys(legal.DOCS)) assert.doesNotMatch(text(id), /aperçu|preview|démonstration|non contractuel|validation juridique/i, id);

// CGV: what French consumer law requires a marketplace to say.
const cgv = text('termsSale');
for (const must of [
  /vendu par une Boutique/, /conclu entre le Client et cette Boutique/,                        // who sells (L. 111-7)
  /du plus récent au plus ancien/, /Aucune Boutique ne paie pour être mieux classée/,            // ranking (L. 111-7)
  /toutes taxes comprises/, /livraison en France métropolitaine est incluse/i,
  /prix le plus bas pratiqué .* trente jours/,                                                  // reference price (L. 112-1-1)
  /commande avec obligation de paiement/, /« Commander et payer »/,                              // L. 221-14
  /au plus tard 30 jours après la commande/,                                                    // L. 216-1
  /délai de 14 jours pour se rétracter/, /L\. 221-28/, /au plus tard 14 jours après/,             // L. 221-18, -24, -28
  /formulaire de rétractation/, /Je\/Nous \(\*\) vous notifie\/notifions/,                        // annex form
  /L\. 217-1 à L\. 217-32/, /1641 à 1649 du code civil/, /300 000 euros/,                         // D. 211-2 box
  /médiateur de la consommation/,                                                               // L. 612-1
]) assert.match(cgv, must, `CGV: ${must}`);
assert.ok(legal.DOCS.termsSale.sections.some((s) => s.box && /Garanties légales/.test(s.h)), 'guarantee box');

// The checkout button and the terms say the same thing.
assert.match(read('customer-checkout.js'), /orderPay: 'Commander et payer \{total\}'/);

// Partner terms: the numbers are the ones the code charges.
const partner = text('partnerTerms');
const eur = (m) => `${m / 100} €`;
for (const t of SUBSCRIPTION_TIERS) assert.ok(partner.includes(eur(t.monthlyFeeMinorUnits)), `subscription ${eur(t.monthlyFeeMinorUnits)}`);
for (const t of TICKET_COMMISSION_TIERS) assert.ok(partner.includes(`${t.ratePercent} %`), `commission ${t.ratePercent} %`);
assert.match(partner, /jusqu’à 100 €, 10 %/);
assert.match(partner, /premier mois suivant l’activation est offert/);
assert.match(partner, /livrés depuis plus de 14 jours sans retour en cours/);
assert.match(partner, /frais de paiement Stripe sont pris en charge par Z Fashion/);
assert.match(partner, /carte bancaire ou prélèvement SEPA/);
assert.match(partner, /préavis de 30 jours/);                   // P2B art. 4
assert.match(partner, /au moins 15 jours avant/);               // P2B art. 3
assert.match(partner, /Aucun Partner ne peut payer pour être mieux classé/); // P2B art. 5
assert.match(partner, /242 bis et 1649 ter A/);                 // platform tax reporting
assert.match(legal.VERSION.partner, /^cgv-partner-\d{4}-\d{2}$/);

// Privacy: every processor named; CNIL.
const privacy = text('privacy');
for (const p of ['Stripe', 'Supabase', 'Vercel', 'Resend', 'CNIL']) assert.ok(privacy.includes(p), `privacy names ${p}`);
assert.match(text('cookies'), /aucun cookie de mesure d’audience/);

// Placeholders are known and listed; the launch check finds them.
const missing = legal.placeholders();
assert.ok(missing.length > 0, 'placeholders listed until the company exists');
assert.ok(missing.every((m) => !/[{}]/.test(m)));

// Rendering: DOM only, routes and footer links in place.
const js = read('customer-legal.js');
assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|document\.write/);
assert.match(js, /mark', \{ class: 'zf-legal-todo'/, 'placeholders are highlighted');
const vercel = JSON.parse(read('vercel.json'));
assert.ok(vercel.rewrites.some((r) => r.source === '/conditions-partenaires' && r.destination === '/customer-shell.html'));
assert.match(read('customer-routes.js'), /\{id:'partnerTerms',path:'\/conditions-partenaires',group:'legal',type:'legal'\}/);
for (const page of ['launch.html', 'customer-shell.html']) {
  const html = read(page);
  for (const id of ['legalNotice', 'termsSale', 'privacy', 'cookies', 'partnerTerms']) assert.match(html, new RegExp(`data-legal-link="${id}"`), `${page} footer ${id}`);
  assert.match(html, /legal-content\.js"><\/script>\s*<script src="[./]*\/?customer-legal\.js"><\/script>/);
}
for (const f of ['customer-site.js', 'customer-completion.js', 'customer-completion-i18n.js']) assert.match(read(f), /window\.ZFashionLegal && window\.ZFashionLegal\.DOCS\[route\.id\]/, `${f} leaves legal pages to customer-legal.js`);

console.log('Z_FASHION_LEGAL=PASS');
