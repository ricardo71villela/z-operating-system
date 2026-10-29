/* Contract: /api/billing — abonnements des agences avec Stripe.
   Sans réseau : Supabase (auth + REST) et api.stripe.com sont simulés. */
'use strict';

const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { EventEmitter } = require('events');

const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const ROOT = path.join(__dirname, '..', '..', '..', '..');

let passed = 0;
function check(label, value) { assert(value, label); passed += 1; console.log('PASS:', label); }

const PARTNER = '11111111-2222-4333-8444-555555555555';
const USER = '99999999-8888-4777-8666-555555555555';
const STRIPE = 'https://stripe.test/v1';

// ------------------------------------------------------------------ faux services
const state = {
  profile: { partner_id: PARTNER, role: 'partner_user' },
  signupCountry: 'FR', signupCreated: '2026-10-20T10:00:00Z',
  active: 12, account: null, subscription: null, events: {},
  prices: {}, taxRates: [], stripeSub: null
};
const calls = [];
function reply(status, body) { return { ok: status < 400, status, text: async () => JSON.stringify(body), json: async () => body }; }
function form(body) { return Object.fromEntries(new URLSearchParams(body || '')); }

global.fetch = async (url, opts) => {
  const o = opts || {};
  const u = String(url);
  const method = o.method || 'GET';
  calls.push({ method, url: u, body: o.body });
  // Supabase Auth
  if (u.endsWith('/auth/v1/user')) return /Bearer good/.test(o.headers.Authorization) ? reply(200, { id: USER, email: 'agence@example.fr' }) : reply(401, {});
  // Supabase REST
  if (u.includes('/rest/v1/')) {
    const p = u.split('/rest/v1/')[1];
    const body = o.body ? JSON.parse(o.body) : null;
    if (p.startsWith('profiles')) return reply(200, [state.profile]);
    if (p.startsWith('partners')) return reply(200, [{ id: PARTNER, name: 'Agence du Lac', created_at: '2026-10-20T10:00:00Z', status: 'active' }]);
    if (p.startsWith('zfind_partner_signups')) return reply(200, [{ legal_name: 'Agence du Lac SARL', email: 'contact@agence.fr', country: state.signupCountry, address: '1 rue du Port', postcode: '74200', city: 'Thonon-les-Bains', created_at: state.signupCreated }]);
    if (p.startsWith('rpc/zfind_partner_active_listings')) return reply(200, state.active);
    if (p.startsWith('zfind_billing_accounts')) {
      if (method === 'POST') { state.account = Object.assign({}, state.account, body); return reply(201, [state.account]); }
      return reply(200, state.account ? [state.account] : []);
    }
    if (p.startsWith('zfind_billing_subscriptions')) {
      if (method === 'POST') { state.subscription = Object.assign({}, state.subscription, body); return reply(201, []); }
      if (method === 'PATCH') { state.subscription = Object.assign({}, state.subscription, body); return reply(204, null); }
      return reply(200, state.subscription ? [state.subscription] : []);
    }
    if (p.startsWith('zfind_stripe_events')) {
      const id = decodeURIComponent((p.match(/id=eq\.([^&]+)/) || [])[1] || '');
      if (method === 'POST') { state.events[body.id] = { id: body.id, processed_at: null }; return reply(201, null); }
      if (method === 'PATCH') { Object.assign(state.events[id], body); return reply(204, null); }
      return reply(200, state.events[id] ? [state.events[id]] : []);
    }
    return reply(404, { message: 'unknown ' + p });
  }
  // Stripe
  if (u.startsWith(STRIPE)) {
    const p = u.slice(STRIPE.length);
    const f = form(o.body);
    if (p.startsWith('/prices') && method === 'GET') { const key = new URL(u).searchParams.get('lookup_keys[0]'); return reply(200, { data: state.prices[key] ? [state.prices[key]] : [] }); }
    if (p === '/products') return reply(200, { id: f.id });
    if (p === '/prices') { const pr = { id: `price_${f.lookup_key}`, lookup_key: f.lookup_key, unit_amount: Number(f.unit_amount) }; state.prices[f.lookup_key] = pr; return reply(200, pr); }
    if (p.startsWith('/tax_rates') && method === 'GET') return reply(200, { data: state.taxRates });
    if (p === '/tax_rates') { const t = { id: 'txr_fr20', metadata: { zfind: 'fr_tva_20' } }; state.taxRates.push(t); return reply(200, t); }
    if (p === '/customers') return reply(200, { id: 'cus_1' });
    if (/^\/customers\/cus_1\/tax_ids/.test(p)) return reply(200, method === 'GET' ? { data: [] } : { id: 'txi_1' });
    if (/^\/customers\/cus_1$/.test(p)) return reply(200, { id: 'cus_1' });
    if (p === '/checkout/sessions') return reply(200, { id: 'cs_1', url: 'https://checkout.stripe.com/c/cs_1' });
    if (p === '/billing_portal/sessions') return reply(200, { url: 'https://billing.stripe.com/p/1' });
    if (/^\/subscriptions\/sub_1/.test(p)) {
      if (method === 'POST') { const key = Object.keys(state.prices).find(k => state.prices[k].id === f['items[0][price]']); state.stripeSub.items.data[0].price = state.prices[key]; return reply(200, state.stripeSub); }
      return reply(200, state.stripeSub);
    }
    return reply(404, { error: { message: 'unknown ' + p } });
  }
  return reply(404, {});
};

function req(method, route, { body, headers, raw } = {}) {
  const r = new EventEmitter();
  r.method = method;
  r.headers = Object.assign({ 'x-forwarded-for': `10.9.0.${Math.floor(Math.random() * 250)}`, origin: 'https://partner.zfind.online' }, headers || {});
  r.query = { route };
  r.url = `/api/billing/${route}`;
  if (raw !== undefined) { r.rawBody = Buffer.from(raw); } else r.body = body;
  return r;
}
function res() { return { statusCode: 0, headers: {}, raw: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.raw = b || ''; }, get json() { return JSON.parse(this.raw || '{}'); } }; }
const AUTH = { authorization: 'Bearer good' };

(async () => {
  console.log('\n=== Z FIND BILLING (Stripe) ===');
  const core = require(path.join(WEB, 'api', '_lib', 'billing-core.js'));
  const stripeLib = require(path.join(WEB, 'api', '_lib', 'stripe.js'));

  // ---------- règles
  check('mois offerts : lancement 1er décembre 2026 → 1er mars 2027', core.freeMonthsEnd('2026-10-20T10:00:00Z', '2026-11-01T00:00:00Z').toISOString() === '2027-03-01T00:00:00.000Z');
  check('inscription après le lancement : 3 mois après l’inscription', core.freeMonthsEnd('2027-01-31T15:00:00Z', '2027-02-01T00:00:00Z').toISOString() === '2027-04-30T00:00:00.000Z');
  check('mois offerts écoulés : null', core.freeMonthsEnd('2026-10-20T10:00:00Z', '2027-03-02T00:00:00Z') === null);
  check('paliers : 25 → Essentiel, 26 → Plus, 75 → Pro, 76 → Premium', core.tierFor(25) === 'essentiel' && core.tierFor(26) === 'plus' && core.tierFor(75) === 'pro' && core.tierFor(76) === 'premium');
  check('prix en centimes depuis pro-offer.js (99 / 129 / 149 / 199 € HT)', core.priceCents('essentiel') === 9900 && core.priceCents('plus') === 12900 && core.priceCents('pro') === 14900 && core.priceCents('premium') === 19900);
  check('n° de TVA BE normalisé, format faux refusé', core.normalizeVat('be 0123.456.789', 'BE') === 'BE0123456789' && core.normalizeVat('BE123', 'BE') === null && core.normalizeVat('LU12345678', 'LU') === 'LU12345678');
  check('TVA standard : FR 20 %, BE/LU avec n° autoliquidation, sans n° 20 %',
    core.vatRegime('FR', 'FR12345678901', {}) === 'fr_standard' && core.vatRegime('BE', 'BE0123456789', {}) === 'reverse_charge' && core.vatRegime('LU', '', {}) === 'fr_standard');
  check('franchise en base : aucune TVA', core.vatRegime('FR', null, { ZFIND_VAT_MODE: 'franchise' }) === 'franchise' && /293 B/.test(core.FOOTERS.franchise));
  const sig = stripeLib.signWebhookPayload('{"id":"evt_1","type":"x"}', 'whsec_abc');
  check('signature webhook vérifiée', stripeLib.verifyWebhook(Buffer.from('{"id":"evt_1","type":"x"}'), sig, 'whsec_abc').id === 'evt_1');
  let bad = false; try { stripeLib.verifyWebhook(Buffer.from('{"id":"evt_1","type":"y"}'), sig, 'whsec_abc'); } catch (e) { bad = e.code === 'webhook_signature_invalid'; }
  check('corps modifié : signature refusée', bad);

  // ---------- handler
  process.env.ZFIND_SUPABASE_SERVICE_KEY = 'sb_secret_test';
  delete process.env.STRIPE_SECRET_KEY;
  const handler = require(path.join(WEB, 'api', 'billing.js'));

  let r = res();
  await handler(req('GET', 'status', { headers: AUTH }), r);
  check('statut lisible sans Stripe (paiements pas encore ouverts)', r.statusCode === 200 && r.json.paymentsReady === false && r.json.tier === 'essentiel' && r.json.priceHt === 99);
  r = res();
  await handler(req('POST', 'subscription-checkout', { headers: AUTH, body: {} }), r);
  check('sans clé Stripe : 503', r.statusCode === 503);

  process.env.STRIPE_SECRET_KEY = 'sk_test_abc';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_abc';
  process.env.ZFIND_STRIPE_API_BASE = STRIPE;

  r = res();
  await handler(req('GET', 'status', {}), r);
  check('sans jeton : 401', r.statusCode === 401);
  check('CORS : origine de l’espace Partner autorisée', r.headers['access-control-allow-origin'] === 'https://partner.zfind.online');
  r = res();
  await handler(req('GET', 'status', { headers: Object.assign({}, AUTH, { origin: 'https://evil.example' }) }), r);
  check('CORS : autre origine non autorisée', !r.headers['access-control-allow-origin']);

  state.profile = { partner_id: PARTNER, role: 'admin' };
  r = res();
  await handler(req('GET', 'status', { headers: AUTH }), r);
  check('compte non partenaire : 401', r.statusCode === 401);
  state.profile = { partner_id: PARTNER, role: 'partner_user' };

  r = res();
  await handler(req('GET', 'status', { headers: AUTH }), r);
  check('statut : 12 annonces → Essentiel 99 € HT, fin des mois offerts le 1er mars 2027, mode test',
    r.statusCode === 200 && r.json.activeListings === 12 && r.json.tierName === 'Essentiel' && r.json.freeMonthsEnd === '2027-03-01T00:00:00.000Z' && r.json.testMode === true && r.json.account.legalName === 'Agence du Lac SARL');

  calls.length = 0;
  r = res();
  await handler(req('POST', 'subscription-checkout', { headers: AUTH, body: { billingEmail: 'compta@agence.fr' } }), r);
  const cs = calls.find(c => c.url === `${STRIPE}/checkout/sessions`);
  const p = form(cs && cs.body);
  check('Checkout : URL Stripe renvoyée', r.statusCode === 200 && r.json.url === 'https://checkout.stripe.com/c/cs_1');
  check('Checkout : abonnement, carte et prélèvement SEPA', p.mode === 'subscription' && p['payment_method_types[0]'] === 'card' && p['payment_method_types[1]'] === 'sepa_debit');
  check('Checkout : prix Essentiel créé par lookup_key (9 900 centimes HT, mensuel)', p['line_items[0][price]'] === 'price_zfind_sub_essentiel_v1' && state.prices.zfind_sub_essentiel_v1.unit_amount === 9900);
  check('Checkout : TVA 20 % pour une agence française', p['line_items[0][tax_rates][0]'] === 'txr_fr20');
  check('Checkout : premier prélèvement le 1er mars 2027 (trial_end)', p['subscription_data[trial_end]'] === String(Date.UTC(2027, 2, 1) / 1000));
  check('Checkout : retour vers l’espace Partner', /partner\.zfind\.online\/#abonnement\?retour=ok/.test(p.success_url) && p['metadata[partner_id]'] === PARTNER);
  check('compte de facturation enregistré (client Stripe, e-mail, régime de TVA)', state.account.stripe_customer_id === 'cus_1' && state.account.billing_email === 'compta@agence.fr' && state.account.vat_regime === 'fr_standard');
  const cust = calls.find(c => c.url === `${STRIPE}/customers`);
  check('client Stripe : adresse de l’agence, pas de mention de TVA pour la France', /address%5Bcity%5D=Thonon-les-Bains/.test(cust.body) && /invoice_settings%5Bfooter%5D=(&|$)/.test(cust.body));

  state.signupCountry = 'BE'; state.account = null;
  r = res();
  await handler(req('POST', 'subscription-checkout', { headers: AUTH, body: {} }), r);
  check('agence belge sans n° de TVA : 422', r.statusCode === 422 && r.json.fields.vatNumber === 'required');
  calls.length = 0;
  r = res();
  await handler(req('POST', 'subscription-checkout', { headers: AUTH, body: { vatNumber: 'BE 0123.456.789' } }), r);
  const p2 = form(calls.find(c => c.url === `${STRIPE}/checkout/sessions`).body);
  check('agence belge avec n° de TVA : autoliquidation, sans taux, n° ajouté au client', r.statusCode === 200 && !p2['line_items[0][tax_rates][0]'] && state.account.vat_regime === 'reverse_charge'
    && calls.some(c => c.url === `${STRIPE}/customers/cus_1/tax_ids` && c.method === 'POST' && /BE0123456789/.test(c.body)));

  // ---------- webhook
  state.stripeSub = { id: 'sub_1', status: 'trialing', metadata: { partner_id: PARTNER, platform: 'zfind' }, trial_end: Date.UTC(2027, 2, 1) / 1000, cancel_at_period_end: false,
    default_payment_method: { id: 'pm_1', type: 'sepa_debit' }, items: { data: [{ id: 'si_1', current_period_end: Date.UTC(2027, 2, 1) / 1000, price: state.prices.zfind_sub_essentiel_v1 }] } };
  const evt = JSON.stringify({ id: 'evt_sub1', type: 'customer.subscription.created', data: { object: { id: 'sub_1', metadata: { partner_id: PARTNER, platform: 'zfind' } } } });
  r = res();
  await handler(req('POST', 'webhook', { raw: evt, headers: { 'stripe-signature': 'v1=00' } }), r);
  check('webhook non signé : 400', r.statusCode === 400 && !state.subscription);
  r = res();
  await handler(req('POST', 'webhook', { raw: evt, headers: { 'stripe-signature': stripeLib.signWebhookPayload(evt, 'whsec_abc') } }), r);
  check('webhook : abonnement enregistré (essai, Essentiel, SEPA)', r.statusCode === 200 && state.subscription.status === 'trialing' && state.subscription.tier === 'essentiel' && state.subscription.payment_method_type === 'sepa_debit' && state.subscription.trial_end === '2027-03-01T00:00:00.000Z');
  r = res();
  await handler(req('POST', 'webhook', { raw: evt, headers: { 'stripe-signature': stripeLib.signWebhookPayload(evt, 'whsec_abc') } }), r);
  check('webhook rejoué : ignoré', r.statusCode === 200 && r.json.duplicate === true);

  r = res();
  await handler(req('POST', 'subscription-checkout', { headers: AUTH, body: { vatNumber: 'BE0123456789' } }), r);
  check('déjà abonné : 409 (le portail sert à modifier)', r.statusCode === 409);

  state.active = 30; calls.length = 0;
  const up = JSON.stringify({ id: 'evt_up1', type: 'invoice.upcoming', data: { object: { subscription: 'sub_1' } } });
  r = res();
  await handler(req('POST', 'webhook', { raw: up, headers: { 'stripe-signature': stripeLib.signWebhookPayload(up, 'whsec_abc') } }), r);
  const upd = calls.find(c => c.url === `${STRIPE}/subscriptions/sub_1` && c.method === 'POST');
  check('avant facture : 30 annonces → palier Plus, sans prorata', r.statusCode === 200 && upd && form(upd.body)['items[0][price]'] === 'price_zfind_sub_plus_v1' && form(upd.body).proration_behavior === 'none' && state.subscription.tier === 'plus' && state.subscription.active_listings === 30);
  state.active = 28; calls.length = 0;
  const up2 = JSON.stringify({ id: 'evt_up2', type: 'invoice.upcoming', data: { object: { parent: { subscription_details: { subscription: 'sub_1' } } } } });
  r = res();
  await handler(req('POST', 'webhook', { raw: up2, headers: { 'stripe-signature': stripeLib.signWebhookPayload(up2, 'whsec_abc') } }), r);
  check('même palier : aucune modification Stripe', r.statusCode === 200 && !calls.some(c => c.url === `${STRIPE}/subscriptions/sub_1` && c.method === 'POST'));

  r = res();
  await handler(req('POST', 'portal', { headers: AUTH }), r);
  check('portail client Stripe', r.statusCode === 200 && r.json.url === 'https://billing.stripe.com/p/1');

  // ---------- déploiement et base
  const vercel = JSON.parse(fs.readFileSync(path.join(WEB, 'vercel.json'), 'utf8'));
  check('route /api/billing/:route déclarée', vercel.rewrites.some(x => x.source === '/api/billing/:route' && x.destination === '/api/billing?route=:route'));
  const fnCount = fs.readdirSync(path.join(WEB, 'api')).filter(f => f.endsWith('.js')).length;
  check(`au plus 12 fonctions (plan Vercel) : ${fnCount}`, fnCount <= 12);
  const migration = fs.readFileSync(path.join(ROOT, 'infrastructure', 'supabase', 'migrations', '20261029140000_z_find_billing_v1.sql'), 'utf8');
  check('migration : RLS, lecture par l’agence seulement, écriture serveur', /enable row level security/.test(migration) && /grant select on public\.zfind_billing_accounts, public\.zfind_billing_subscriptions, public\.zfind_billing_orders to authenticated/.test(migration)
    && /revoke all on function public\.zfind_partner_active_listings\(uuid\) from public, anon, authenticated/.test(migration) && !/drop table/i.test(migration));

  console.log(`\nBILLING: ${passed}/${passed} PASSED`);
})().catch(e => { console.error('FAIL:', e && e.message); process.exit(1); });
