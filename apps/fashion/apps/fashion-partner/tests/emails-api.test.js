/* Run with: node apps/fashion/apps/fashion-partner/tests/emails-api.test.js
   Transactional e-mails (task 16) over HTTP, in-memory mode, against a
   local fake of Resend and Stripe: application decisions, product
   refused, paid order to the store, contact form (validation, honeypot,
   rate limit), idempotency keys, nothing sent without RESEND_API_KEY. */

const assert = require('assert');
const http = require('http');

const FAKE_PORT = 4497;
const PORT = 4498;
process.env.STRIPE_SECRET_KEY = 'sk_test_fake123';
process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_fake123';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_mail123';
process.env.FASHION_STRIPE_API_BASE = `http://127.0.0.1:${FAKE_PORT}/v1`;
process.env.RESEND_API_KEY = 're_test_fake';
process.env.FASHION_RESEND_API_BASE = `http://127.0.0.1:${FAKE_PORT}`;
process.env.FASHION_SUPPORT_EMAIL = 'contact@zfashion.test';
process.env.FASHION_PARTNER_CONSOLE_URL = 'https://partner.zfashion.test/dashboard.html';
process.env.FASHION_PARTNER_TERMS_VERSION = 'cgv-partner-2026-10';
process.env.FASHION_PARTNER_TERMS_URL = 'https://zfashion.test/conditions-partenaires';

const { server } = require('../src/server');
const { signWebhookPayload } = require('../src/stripe');
const { createMailer } = require('../src/mailer');

const fake = { emails: [], intents: new Map(), failEmails: false };
const fakeApi = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const send = (status, json) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(json)); };
    if (req.method === 'POST' && req.url === '/emails') {
      if (req.headers.authorization !== 'Bearer re_test_fake') return send(401, { name: 'unauthorized' });
      if (fake.failEmails) return send(500, { name: 'application_error' });
      const json = JSON.parse(body);
      fake.emails.push({ ...json, key: req.headers['idempotency-key'] });
      return send(200, { id: `email_${fake.emails.length}` });
    }
    const params = Object.fromEntries(new URLSearchParams(body));
    if (req.method === 'POST' && req.url === '/v1/payment_intents') {
      const id = `pi_mail${fake.intents.size + 1}`;
      const intent = { id, object: 'payment_intent', amount: Number(params.amount), currency: 'eur', status: 'requires_payment_method', client_secret: `${id}_secret_x`,
        metadata: { order_id: params['metadata[order_id]'], platform: params['metadata[platform]'] } };
      fake.intents.set(id, intent);
      return send(200, intent);
    }
    return send(404, { error: { code: 'not_found' } });
  });
});

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = typeof body === 'string' ? body : body === undefined ? null : JSON.stringify(body);
    const req = http.request({ hostname: '127.0.0.1', port: PORT, path, method, headers: { 'Content-Type': 'application/json', ...headers } }, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: chunks ? JSON.parse(chunks) : null }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
const sentTo = (addr) => fake.emails.filter((m) => m.to.includes(addr));

async function run() {
  await new Promise((r) => fakeApi.listen(FAKE_PORT, r));
  await new Promise((r) => server.listen(PORT, r));

  // --- a store applies; each decision e-mails its contact
  let r = await request('POST', '/partner-applications', {
    tradeName: 'Maison Léman', legalName: 'Maison Léman SARL', countryIso: 'FR', registrationNumber: '88123456700017',
    addressLine1: '12 rue Nationale', postalCode: '74200', city: 'Thonon-les-Bains', contactPhone: '04 50 00 00 00',
    categories: ['clothing'], ageSegments: ['adults'], acceptTerms: true, termsVersion: 'cgv-partner-2026-10', devAccountEmail: 'shop@example.fr',
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  const store = r.body.partnerId || r.body.application.partnerId;
  for (const toStatus of ['under_review', 'approved']) {
    r = await request('POST', `/admin/partner-applications/${store}/decision`, { toStatus });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  }
  r = await request('POST', `/admin/partner-applications/${store}/decision`, { toStatus: 'active', feedReliabilityTier: 'live' });
  assert.strictEqual(r.status, 200);
  const decisions = sentTo('shop@example.fr');
  assert.deepStrictEqual(decisions.map((m) => m.subject), [
    'Votre demande d’adhésion est en cours d’examen', 'Votre demande d’adhésion est acceptée', 'Votre boutique est active sur Z Fashion']);
  assert.ok(decisions.every((m) => m.from === 'Z Fashion <commandes@zfashion.online>' && m.reply_to === 'contact@zfashion.test'));
  assert.ok(decisions[2].html.includes('https://partner.zfashion.test/dashboard.html'));
  assert.ok(decisions[2].text.includes('premier mois'));

  // --- a refused product e-mails the store with the reason
  const brandId = (await request('POST', `/partners/${store}/brands`, { name: 'Léman' })).body.brand.id;
  r = await request('POST', `/partners/${store}/products`, { brandId, names: { fr: 'Jupe plissée' }, gender: 'female', categories: ['clothing'], size: { system: 'FR', value: 38 }, priceMinorUnits: 6500 });
  const jupe = r.body.product.id;
  await request('POST', `/admin/products/${jupe}/moderation`, { toStatus: 'rejected', note: 'Photo floue' });
  let last = fake.emails.at(-1);
  assert.strictEqual(last.subject, 'Produit non validé : Jupe plissée');
  assert.ok(last.text.includes('Photo floue'));
  assert.deepStrictEqual(last.tags, [{ name: 'type', value: 'product_refused' }]);
  await request('POST', `/partners/${store}/products/${jupe}/resubmit`);
  const count = fake.emails.length;
  await request('POST', `/admin/products/${jupe}/moderation`, { toStatus: 'approved' });
  assert.strictEqual(fake.emails.length, count, 'no e-mail on approval');
  await request('POST', `/admin/products/${jupe}/moderation`, { toStatus: 'rejected', note: 'Retiré : marque à vérifier' });
  assert.match(fake.emails.at(-1).subject, /^Produit retiré/);
  await request('POST', `/admin/products/${jupe}/moderation`, { toStatus: 'approved' });

  // --- a paid order e-mails the store (the client e-mail needs the database: skipped here)
  await request('POST', `/partners/${store}/stock/${jupe}`, { quantityAvailable: 3, observedAt: '2026-10-17T00:00:00.000Z' });
  await request('PUT', `/clients/client_mail/cart/items/${jupe}`, { quantity: 2 });
  const a = await request('POST', '/clients/client_mail/addresses', { type: 'shipping', recipientName: 'Léa Martin', line1: '3 quai de Rives', postalCode: '74200', city: 'Thonon-les-Bains', countryIso: 'FR' });
  const o = await request('POST', '/clients/client_mail/checkout', { addressId: a.body.address.id });
  assert.strictEqual(o.status, 201, JSON.stringify(o.body));
  const order = o.body.order;
  await request('POST', `/clients/client_mail/orders/${order.id}/payment`);
  const intent = [...fake.intents.values()].at(-1);
  const payload = JSON.stringify({ id: 'evt_mailpaid1', object: 'event', type: 'payment_intent.succeeded', data: { object: { ...intent, status: 'succeeded', amount_received: 13000 } } });
  r = await request('POST', '/stripe/webhook', payload, { 'Stripe-Signature': signWebhookPayload(payload, 'whsec_mail123') });
  assert.strictEqual(r.body.outcome, 'confirmed');
  const storeOrder = sentTo('shop@example.fr').at(-1);
  assert.match(storeOrder.subject, /^Nouvelle commande ZF-[0-9A-F]{8} — à expédier$/);
  assert.ok(storeOrder.text.includes('2 × Léman — Jupe plissée (taille 38)'));
  assert.ok(storeOrder.text.includes('Léa Martin') && storeOrder.text.includes('3 quai de Rives'));
  assert.ok(storeOrder.text.includes('Commission Z Fashion (8 %)'));
  assert.strictEqual(storeOrder.key, `order-paid-${order.id}-${store}`);
  const n = fake.emails.length;
  r = await request('POST', '/stripe/webhook', payload, { 'Stripe-Signature': signWebhookPayload(payload, 'whsec_mail123') });
  assert.strictEqual(r.body.outcome, 'duplicate');
  assert.strictEqual(fake.emails.length, n, 'a repeated webhook sends nothing again');

  // --- contact form
  r = await request('POST', '/contact', { name: 'L', email: 'nope', message: 'court' });
  assert.strictEqual(r.status, 422);
  assert.deepStrictEqual(r.body.fields, ['name', 'email', 'message']);
  const before = fake.emails.length;
  r = await request('POST', '/contact', { name: 'Robot', email: 'bot@example.fr', message: 'Achetez maintenant !!!', website: 'http://spam' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(fake.emails.length, before, 'honeypot: nothing sent');
  r = await request('POST', '/contact', { name: 'Léa Martin', email: 'lea@example.fr', topic: 'Retour', orderRef: 'ZF-1234ABCD', message: 'Bonjour, je voudrais retourner une jupe.' });
  assert.strictEqual(r.status, 200);
  const [toSupport, receipt] = fake.emails.slice(-2);
  assert.deepStrictEqual(toSupport.to, ['contact@zfashion.test']);
  assert.strictEqual(toSupport.reply_to, 'lea@example.fr');
  assert.strictEqual(toSupport.subject, '[Contact] Retour — ZF-1234ABCD — Léa Martin');
  assert.deepStrictEqual(receipt.to, ['lea@example.fr']);
  assert.strictEqual(receipt.subject, 'Votre message à Z Fashion');
  r = await request('POST', '/contact', { name: 'Léa', email: 'lea@example.fr', topic: 'Hack <script>', message: 'Deuxième message, assez long.' });
  assert.strictEqual(fake.emails.at(-2).subject.startsWith('[Contact] Autre'), true, 'unknown topics become Autre');
  for (let i = 0; i < 3; i += 1) await request('POST', '/contact', { name: 'Léa', email: 'lea@example.fr', message: `Message numéro ${i} assez long.` });
  r = await request('POST', '/contact', { name: 'Léa', email: 'lea@example.fr', message: 'Encore un message de trop.' });
  assert.strictEqual(r.status, 429, 'five messages an hour per address');

  // --- Resend down: the contact form says so; nothing else breaks
  fake.failEmails = true;
  const mailer = createMailer({ apiKey: 're_test_fake', from: 'x <a@b.fr>', support: 's@b.fr', apiBase: `http://127.0.0.1:${FAKE_PORT}` }, { log: { info() {}, error() {} } });
  assert.deepStrictEqual(await mailer.send({ to: 'a@b.fr', content: { subject: 's', html: 'h', text: 't' }, key: 'k' }), { sent: false, error: 'resend_500' });
  fake.failEmails = false;

  // --- no key: nothing sent, no error
  const quiet = createMailer({ apiKey: null, from: 'x <a@b.fr>', support: 's@b.fr', apiBase: `http://127.0.0.1:${FAKE_PORT}` }, { log: { info() {}, error() {} } });
  const total = fake.emails.length;
  assert.deepStrictEqual(await quiet.send({ to: 'a@b.fr', content: { subject: 's', html: 'h', text: 't' }, key: 'k' }), { sent: false, skipped: 'not_configured' });
  assert.deepStrictEqual(await quiet.send({ to: 'not-an-email', content: { subject: 's' }, key: 'k' }), { sent: false, skipped: 'no_recipient' });
  assert.strictEqual(fake.emails.length, total);

  server.close(); fakeApi.close();
  console.log('fashion-partner e-mails: all checks passed.');
}

run().catch((err) => { console.error(err); server.close(); fakeApi.close(); process.exit(1); });
