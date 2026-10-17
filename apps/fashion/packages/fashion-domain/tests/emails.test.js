const assert = require('assert');
const e = require('../src/emails');

const order = {
  id: '3f2a9c10-aaaa-bbbb-cccc-000000000001', createdAt: '2026-10-17T10:00:00Z',
  subtotalMinorUnits: 23880, shippingMinorUnits: 0, totalMinorUnits: 23880,
  shippingAddress: { recipientName: 'Léa <Martin>', line1: '12 rue des Lilas', line2: null, postalCode: '74200', city: 'Thonon-les-Bains', countryIso: 'FR' },
  items: [
    { partnerId: 'A', storeName: 'Maison Léman', brandName: 'Léman', name: 'Robe en lin', size: { value: 38 }, quantity: 2, unitPriceMinorUnits: 8990 },
    { partnerId: 'B', storeName: 'Sport Annecy', brandName: 'Alpes', name: 'Veste de trail', size: { value: 'L' }, quantity: 1, unitPriceMinorUnits: 5900 },
  ],
};

// Client confirmation: per boutique, totals, address, escaped, link.
const c = e.orderConfirmed({ order, siteUrl: 'https://zfashion.online' });
assert.strictEqual(c.subject, 'Commande ZF-3F2A9C10 confirmée');
for (const s of ['Vendu et expédié par Maison Léman', 'Vendu et expédié par Sport Annecy', '2 × Léman — Robe en lin (taille 38)', '179,80 €', '238,80 €', 'Incluse', 'Thonon-les-Bains', '14 jours']) {
  assert.ok(c.text.toLowerCase().includes(s.toLowerCase()), `text has ${s}`);
}
assert.ok(c.text.includes('Chacune des 2 boutiques'));
assert.ok(c.html.includes('Léa &lt;Martin&gt;'), 'escaped in HTML');
assert.ok(!c.html.includes('Léa <Martin>'));
assert.ok(c.html.includes('https://zfashion.online/compte/commandes/3f2a9c10-aaaa-bbbb-cccc-000000000001'));
assert.doesNotMatch(c.html, /<img|<script/i, 'no images, no scripts');

// Store: only its lines, commission, ship within 3 working days.
const s = e.storeNewOrder({
  order: { ...order, items: [{ ...order.items[0], sku: 'ROB-38' }], ticket: { subtotalMinorUnits: 17980, commissionRatePercent: 8, commissionMinorUnits: 1438 } },
  storeName: 'Maison Léman', consoleUrl: 'https://partner.zfashion.online/',
});
assert.strictEqual(s.subject, 'Nouvelle commande ZF-3F2A9C10 — à expédier');
for (const x of ['[réf. ROB-38]', 'Commission Z Fashion (8 %)', '− 14,38 €', '3 jours ouvrés', '12 rue des Lilas']) assert.ok(s.text.includes(x), x);
assert.ok(!s.text.includes('Veste de trail'), 'other stores’ lines are not shown');

// Application decisions.
const ok = e.applicationDecision({ toStatus: 'active', storeName: 'Maison Léman', consoleUrl: 'https://partner.zfashion.online/' });
assert.match(ok.subject, /active/);
assert.ok(ok.text.includes('premier mois d’abonnement est offert'));
const no = e.applicationDecision({ toStatus: 'rejected', storeName: 'X', note: 'SIRET introuvable' });
assert.ok(no.text.includes('SIRET introuvable') && no.text.includes('contester'));
assert.ok(!no.text.includes('Ouvrir mon espace'), 'no console link for a refused store');
assert.strictEqual(e.applicationDecision({ toStatus: 'applied', storeName: 'X' }), null, 'no e-mail for unknown moves');

// Product refused / withdrawn.
const p = e.productRefused({ productName: 'Jupe <plissée>', note: 'Photo floue', withdrawn: false });
assert.strictEqual(p.subject, 'Produit non validé : Jupe <plissée>');
assert.ok(p.html.includes('Jupe &lt;plissée&gt;'));
assert.match(e.productRefused({ productName: 'X', note: 'n', withdrawn: true }).subject, /^Produit retiré/);

// Contact.
const m = e.contactMessage({ name: 'Léa', email: 'lea@example.fr', orderRef: 'ZF-1234', topic: 'Retour', message: 'Bonjour\nJe voudrais retourner…' });
assert.strictEqual(m.subject, '[Contact] Retour — ZF-1234 — Léa');
assert.ok(m.html.includes('Bonjour<br>Je voudrais'));
assert.ok(e.contactReceipt({ name: 'Léa', message: 'x' }).text.includes('48 heures'));

console.log('emails.js: all checks passed.');
