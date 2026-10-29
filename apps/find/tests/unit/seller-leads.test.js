/* Contract: contacts vendeurs exclusifs (estimation gratuite → une seule
   agence, la première qui achète). Sans réseau : Supabase et Stripe simulés.
   Les règles (en vente, anonymat, exclusivité, conflits) sont testées en SQL
   (migration 20261029230000) ; ici le serveur, Stripe et l'espace Partner. */
'use strict';

const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { EventEmitter } = require('events');

const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const APPS = path.join(__dirname, '..', '..', 'apps');
const ROOT = path.join(__dirname, '..', '..', '..', '..');

let passed = 0;
function check(label, value) { assert(value, label); passed += 1; console.log('PASS:', label); }

const PARTNER = '11111111-2222-4333-8444-555555555555';
const USER = '99999999-8888-4777-8666-555555555555';
const REQUEST = '44444444-5555-4666-8777-888888888888';
const ORDER = '33333333-4444-4555-8666-777777777777';
const STRIPE = 'https://stripe.test/v1';
const state = { lead: { ok: true, order_id: ORDER, kind: 'seller_lead_qualified', amount_ht_cents: 7900, place: 'Annecy', qualified: true }, rpc: [], sessions: [] };
function reply(status, body) { return { ok: status < 400, status, text: async () => JSON.stringify(body), json: async () => body }; }
function form(body) { return Object.fromEntries(new URLSearchParams(body || '')); }

global.fetch = async (url, opts) => {
  const o = opts || {};
  const u = String(url);
  const method = o.method || 'GET';
  if (u.endsWith('/auth/v1/user')) return /Bearer good/.test(o.headers.Authorization) ? reply(200, { id: USER, email: 'agence@example.fr' }) : reply(401, {});
  if (u.includes('/rest/v1/')) {
    const p = u.split('/rest/v1/')[1];
    const body = o.body ? JSON.parse(o.body) : null;
    if (p.startsWith('rpc/')) {
      const name = p.slice(4);
      state.rpc.push({ name, body });
      if (name === 'zfind_order_seller_lead') return reply(200, state.lead);
      if (name === 'zfind_partner_active_listings') return reply(200, 3);
      return reply(200, null);
    }
    if (p.startsWith('profiles')) return reply(200, [{ partner_id: PARTNER, role: 'partner_user' }]);
    if (p.startsWith('partners')) return reply(200, [{ id: PARTNER, name: 'Agence du Lac', created_at: '2026-10-20T10:00:00Z', status: 'active' }]);
    if (p.startsWith('zfind_partner_signups')) return reply(200, [{ legal_name: 'Agence du Lac SARL', email: 'contact@agence.fr', country: 'FR', address: '1 rue du Port', postcode: '74000', city: 'Annecy', created_at: '2026-10-20T10:00:00Z' }]);
    if (p.startsWith('zfind_billing_accounts')) return reply(method === 'POST' ? 201 : 200, method === 'POST' ? [body] : []);
    if (p.startsWith('zfind_billing_subscriptions')) return reply(200, []);
    if (p.startsWith('zfind_stripe_events')) return reply(method === 'GET' ? 200 : 201, method === 'GET' ? [] : null);
    return reply(404, {});
  }
  if (u.startsWith(STRIPE)) {
    const p = u.slice(STRIPE.length);
    if (p.startsWith('/tax_rates') && method === 'GET') return reply(200, { data: [{ id: 'txr_fr20', metadata: { zfind: 'fr_tva_20' } }] });
    if (p === '/customers') return reply(200, { id: 'cus_1' });
    if (/^\/customers\/cus_1/.test(p)) return reply(200, { id: 'cus_1' });
    if (p === '/checkout/sessions') { state.sessions.push(form(o.body)); return reply(200, { id: 'cs_sl', url: 'https://checkout.stripe.com/c/cs_sl' }); }
    return reply(404, {});
  }
  return reply(404, {});
};

function req(method, route, { body, headers, raw } = {}) {
  const r = new EventEmitter();
  r.method = method;
  r.headers = Object.assign({ 'x-forwarded-for': `10.6.0.${Math.floor(Math.random() * 250)}`, origin: 'https://partner.zfind.online' }, headers || {});
  r.query = { route };
  r.url = `/api/billing/${route}`;
  if (raw !== undefined) r.rawBody = Buffer.from(raw); else r.body = body;
  return r;
}
function res() { return { statusCode: 0, headers: {}, raw: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.raw = b || ''; }, get json() { return JSON.parse(this.raw || '{}'); } }; }
const AUTH = { authorization: 'Bearer good' };

(async () => {
  console.log('\n=== Z FIND — CONTACTS VENDEURS ===');
  process.env.ZFIND_SUPABASE_SERVICE_KEY = 'sb_secret_test';
  process.env.STRIPE_SECRET_KEY = 'sk_test_abc';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_abc';
  process.env.ZFIND_STRIPE_API_BASE = STRIPE;
  const handler = require(path.join(WEB, 'api', 'billing.js'));
  const stripeLib = require(path.join(WEB, 'api', '_lib', 'stripe.js'));
  const offer = require(path.join(WEB, 'src', 'services', 'pro-offer.js'));

  let r = res();
  await handler(req('POST', 'seller-lead-checkout', { headers: AUTH, body: { requestId: REQUEST } }), r);
  check('achat : page de paiement Stripe', r.statusCode === 200 && r.json.url === 'https://checkout.stripe.com/c/cs_sl');
  const call = state.rpc.find(c => c.name === 'zfind_order_seller_lead').body;
  check('prix de la grille transmis à la base (49 / 79 € HT)', call.p_amount_ht_cents === offer.PRICES.sellerLead * 100 && call.p_qualified_amount_ht_cents === offer.PRICES.sellerLeadQualified * 100 && call.p_request === REQUEST && call.p_partner === PARTNER);
  const s = state.sessions[0];
  check('contact qualifié : 7900 c HT, TVA FR', s['line_items[0][price_data][unit_amount]'] === '7900' && s['line_items[0][tax_rates][0]'] === 'txr_fr20');
  check('libellé : contact exclusif, commune, sans coordonnées', /Contact vendeur qualifié \(exclusif\)/.test(s['line_items[0][price_data][product_data][name]']) && /Annecy/.test(s['line_items[0][price_data][product_data][description]']) && !/@/.test(s['line_items[0][price_data][product_data][description]']));
  check('commande reliée (purpose seller_lead)', s['metadata[purpose]'] === 'seller_lead' && s['metadata[order_id]'] === ORDER);
  check('retour sur « Contacts vendeurs »', /#contacts-vendeurs\?retour=ok$/.test(s.success_url));

  state.lead = { ok: false, error: 'taken' };
  r = res();
  await handler(req('POST', 'seller-lead-checkout', { headers: AUTH, body: { requestId: REQUEST } }), r);
  check('déjà pris par une autre agence : 409, aucun paiement', r.statusCode === 409 && r.json.error === 'taken' && state.sessions.length === 1);
  state.lead = { ok: false, error: 'other_commune' };
  r = res();
  await handler(req('POST', 'seller-lead-checkout', { headers: AUTH, body: { requestId: REQUEST } }), r);
  check('autre commune : 422', r.statusCode === 422 && r.json.error === 'other_commune');
  r = res();
  await handler(req('POST', 'seller-lead-checkout', { headers: AUTH, body: { requestId: 'x' } }), r);
  check('identifiant invalide : 400', r.statusCode === 400);

  // webhook
  async function send(type, object) {
    const evt = JSON.stringify({ id: 'evt_' + Math.random().toString(36).slice(2), type, data: { object } });
    const rr = res();
    await handler(req('POST', 'webhook', { raw: evt, headers: { 'stripe-signature': stripeLib.signWebhookPayload(evt, 'whsec_abc') } }), rr);
    return rr;
  }
  const meta = { platform: 'zfind', purpose: 'seller_lead', order_id: ORDER, partner_id: PARTNER };
  state.rpc = [];
  r = await send('checkout.session.completed', { mode: 'payment', payment_status: 'paid', payment_intent: 'pi_1', metadata: meta });
  check('payé : contact attribué (zfind_order_paid)', r.statusCode === 200 && state.rpc.some(c => c.name === 'zfind_order_paid' && c.body.p_order === ORDER));
  state.rpc = [];
  r = await send('checkout.session.expired', { mode: 'payment', metadata: meta });
  check('abandon : de nouveau en vente (zfind_order_released)', state.rpc.some(c => c.name === 'zfind_order_released' && c.body.p_status === 'canceled'));

  // transmission par e-mail : circuit existant
  const notify = fs.readFileSync(path.join(WEB, 'api', 'lead-notify.js'), 'utf8');
  check('coordonnées envoyées par le circuit existant (zfind_pending_estimation_forwards)', /zfind_pending_estimation_forwards/.test(notify));

  // espace Partner
  const body = fs.readFileSync(path.join(APPS, 'zfind-partner', 'src', 'body.html'), 'utf8');
  const papp = fs.readFileSync(path.join(APPS, 'zfind-partner', 'src', 'app.js'), 'utf8');
  const build = fs.readFileSync(path.join(APPS, 'zfind-partner', 'scripts', 'build.js'), 'utf8');
  const ui = fs.readFileSync(path.join(APPS, 'zfind-partner', 'src', 'seller-leads.js'), 'utf8');
  const navs = (body.match(/<nav class="dash-nav">/g) || []).length;
  check('Partner : « Contacts vendeurs » dans chaque navigation', (body.match(/showSellerLeadsView\(\)">Contacts vendeurs/g) || []).length === navs && /id="view-seller-leads"/.test(body));
  check('Partner : #contacts-vendeurs (retour de Stripe), build', /#contacts-vendeurs/.test(papp) && /'view-seller-leads'/.test(papp) && /sellerLeadsJs \+/.test(build));
  check('Partner : prix lus dans la grille publique', /sellerLeadQualified/.test(ui) && !/\b49 €|\b79 €/.test(ui));

  // base
  const mig = fs.readFileSync(path.join(ROOT, 'infrastructure', 'supabase', 'migrations', '20261029230000_z_find_seller_leads_v1.sql'), 'utf8');
  const avail = mig.slice(mig.indexOf("'available'"), mig.indexOf("'purchased'"));
  check('migration : contacts en vente sans nom, e-mail ni téléphone', !/r\.name|r\.email|'phone', r\.phone/.test(avail));
  check('migration : accord exprès du propriétaire, jamais « curiosité », 30 jours', /r\.mode = 'owner' and r\.agency_consent/.test(mig) && /<> 'curious'/.test(mig) && /interval '30 days'/.test(mig));
  check('migration : l’Admin ne réattribue pas un contact vendu ou en paiement', /raise exception 'sold'/.test(mig) && /raise exception 'on_hold'/.test(mig));

  console.log(`\n${passed} checks passed.`);
})().catch(err => { console.error('FAIL:', err.message); process.exit(1); });
