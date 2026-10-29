/* Contract: mises en avant « À la une » et « Agence à la une » — achat
   (Stripe Checkout, mode paiement), webhook, pages publiques, espace Partner.
   Sans réseau : Supabase (auth + REST + RPC) et api.stripe.com sont simulés.
   Les règles de capacité et de dates sont testées en SQL (migration
   20261029220000) ; ici le contrat entre le serveur, Stripe et la base. */
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
const LISTING = '22222222-3333-4444-8555-666666666666';
const ORDER = '33333333-4444-4555-8666-777777777777';
const STRIPE = 'https://stripe.test/v1';

const state = { book: { ok: true }, country: 'FR', vat: null, rpc: [], sessions: [] };
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
      const name = p.slice(4).split('?')[0];
      state.rpc.push({ name, body });
      if (name === 'zfind_order_highlight') return reply(200, state.book.ok ? { ok: true, order_id: ORDER, id: 'h1', starts_on: body.p_start, ends_on: '2026-11-08', title: 'T3 vue lac', commune: 'Annecy' } : state.book);
      if (name === 'zfind_order_highlight_pack') return reply(200, { ok: true, order_id: ORDER });
      if (name === 'zfind_order_agency_feature') return reply(200, state.book.ok ? { ok: true, order_id: ORDER, id: 'f1', month: body.p_month } : state.book);
      if (name === 'zfind_partner_active_listings') return reply(200, 12);
      return reply(200, null);
    }
    if (p.startsWith('profiles')) return reply(200, [{ partner_id: PARTNER, role: 'partner_user' }]);
    if (p.startsWith('partners')) return reply(200, [{ id: PARTNER, name: 'Agence du Lac', created_at: '2026-10-20T10:00:00Z', status: 'active' }]);
    if (p.startsWith('zfind_partner_signups')) return reply(200, [{ legal_name: 'Agence du Lac SARL', email: 'contact@agence.fr', country: state.country, address: '1 rue du Port', postcode: '74000', city: 'Annecy', created_at: '2026-10-20T10:00:00Z' }]);
    if (p.startsWith('zfind_billing_accounts')) return reply(method === 'POST' ? 201 : 200, method === 'POST' ? [body] : []);
    if (p.startsWith('zfind_billing_subscriptions')) return reply(200, []);
    if (p.startsWith('zfind_stripe_events')) return reply(method === 'GET' ? 200 : 201, method === 'GET' ? [] : null);
    return reply(404, { message: 'unknown ' + p });
  }
  if (u.startsWith(STRIPE)) {
    const p = u.slice(STRIPE.length);
    const f = form(o.body);
    if (p.startsWith('/tax_rates') && method === 'GET') return reply(200, { data: [{ id: 'txr_fr20', metadata: { zfind: 'fr_tva_20' } }] });
    if (p === '/customers') return reply(200, { id: 'cus_1' });
    if (/^\/customers\/cus_1/.test(p)) return reply(200, method === 'GET' ? { data: [] } : { id: 'cus_1' });
    if (p === '/checkout/sessions') { state.sessions.push({ f, headers: o.headers }); return reply(200, { id: 'cs_hl', url: 'https://checkout.stripe.com/c/cs_hl' }); }
    return reply(404, { error: { message: 'unknown ' + p } });
  }
  return reply(404, {});
};

function req(method, route, { body, headers, raw } = {}) {
  const r = new EventEmitter();
  r.method = method;
  r.headers = Object.assign({ 'x-forwarded-for': `10.8.0.${Math.floor(Math.random() * 250)}`, origin: 'https://partner.zfind.online' }, headers || {});
  r.query = { route };
  r.url = `/api/billing/${route}`;
  if (raw !== undefined) r.rawBody = Buffer.from(raw); else r.body = body;
  return r;
}
function res() { return { statusCode: 0, headers: {}, raw: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.raw = b || ''; }, get json() { return JSON.parse(this.raw || '{}'); } }; }
const AUTH = { authorization: 'Bearer good' };
const rpcCalls = name => state.rpc.filter(c => c.name === name);

(async () => {
  console.log('\n=== Z FIND — MISES EN AVANT ===');
  process.env.ZFIND_SUPABASE_SERVICE_KEY = 'sb_secret_test';
  process.env.STRIPE_SECRET_KEY = 'sk_test_abc';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_abc';
  process.env.ZFIND_STRIPE_API_BASE = STRIPE;
  const handler = require(path.join(WEB, 'api', 'billing.js'));
  const stripeLib = require(path.join(WEB, 'api', '_lib', 'stripe.js'));
  const offer = require(path.join(WEB, 'src', 'services', 'pro-offer.js'));

  // ---------- achat d'une mise en avant 7 jours
  let r = res();
  await handler(req('POST', 'highlight-checkout', { headers: AUTH, body: { listingId: LISTING, product: '7d', start: '2026-11-01' } }), r);
  check('7 jours : page de paiement Stripe', r.statusCode === 200 && r.json.url === 'https://checkout.stripe.com/c/cs_hl');
  const book = rpcCalls('zfind_order_highlight')[0].body;
  check('réservation en base avant Stripe : annonce, date, formule, prix de la grille (9 € HT)', book.p_listing === LISTING && book.p_start === '2026-11-01' && book.p_kind === 'highlight_7d' && book.p_amount_ht_cents === offer.PRICES.highlight7Days * 100);
  const s = state.sessions[0].f;
  check('Checkout en mode paiement, carte et SEPA', s.mode === 'payment' && s['payment_method_types[0]'] === 'card' && s['payment_method_types[1]'] === 'sepa_debit');
  check('montant HT 900 c, TVA française 20 % (agence FR)', s['line_items[0][price_data][unit_amount]'] === '900' && s['line_items[0][price_data][tax_behavior]'] === 'exclusive' && s['line_items[0][tax_rates][0]'] === 'txr_fr20');
  check('facture Stripe émise', s['invoice_creation[enabled]'] === 'true');
  check('commande reliée (metadata order_id / purpose)', s['metadata[order_id]'] === ORDER && s['metadata[purpose]'] === 'highlight' && s['payment_intent_data[metadata][order_id]'] === ORDER);
  check('libellé clair : annonce, commune, dates', /T3 vue lac/.test(s['line_items[0][price_data][product_data][description]']) && /Annecy/.test(s['line_items[0][price_data][product_data][description]']) && /1er novembre 2026/.test(s['line_items[0][price_data][product_data][description]']));
  const exp = Number(s.expires_at) - Math.floor(Date.now() / 1000);
  check('session Stripe expirée avant la fin de la réservation (31 min < 35 min)', exp > 30 * 60 && exp < 35 * 60);
  check('retour sur « Mises en avant »', /#mises-en-avant\?retour=ok$/.test(s.success_url) && /#mises-en-avant\?retour=annule$/.test(s.cancel_url));
  check('session Stripe rattachée à la commande', rpcCalls('zfind_order_attach_session').some(c => c.body.p_order === ORDER && c.body.p_session === 'cs_hl'));
  check('clé d’idempotence Stripe par commande', state.sessions[0].headers['Idempotency-Key'] === `zfind-order-${ORDER}`);

  // ---------- complet
  state.book = { ok: false, error: 'full', next_start: '2026-11-08', next_end: '2026-11-15' };
  r = res();
  await handler(req('POST', 'highlight-checkout', { headers: AUTH, body: { listingId: LISTING, product: '7d', start: '2026-11-01' } }), r);
  check('complet : 409 et première date libre', r.statusCode === 409 && r.json.error === 'full' && r.json.nextStart === '2026-11-08' && r.json.nextEnd === '2026-11-15');
  check('complet : aucun paiement ouvert', state.sessions.length === 1);
  state.book = { ok: false, error: 'partner_not_active' };
  r = res();
  await handler(req('POST', 'highlight-checkout', { headers: AUTH, body: { listingId: LISTING, product: '30d', start: '2026-11-01' } }), r);
  check('agence pas encore validée : 403', r.statusCode === 403 && r.json.error === 'partner_not_active');
  state.book = { ok: true };

  r = res();
  await handler(req('POST', 'highlight-checkout', { headers: AUTH, body: { listingId: LISTING, product: 'pack', start: '2026-11-01' } }), r);
  check('formule inconnue pour une annonce : 400', r.statusCode === 400);
  r = res();
  await handler(req('POST', 'highlight-checkout', { headers: AUTH, body: { listingId: 'x', product: '7d', start: '01/11/2026' } }), r);
  check('saisie invalide : 400', r.statusCode === 400);
  r = res();
  await handler(req('POST', 'highlight-checkout', { headers: { authorization: 'Bearer bad' }, body: { listingId: LISTING, product: '7d', start: '2026-11-01' } }), r);
  check('sans session : 401', r.statusCode === 401);

  // ---------- facturation incomplète (Belgique sans n° de TVA) : réservation libérée
  state.country = 'BE';
  state.rpc = [];
  r = res();
  await handler(req('POST', 'highlight-checkout', { headers: AUTH, body: { listingId: LISTING, product: '30d', start: '2026-11-01' } }), r);
  check('BE sans n° de TVA : 422 billing_details', r.statusCode === 422 && r.json.error === 'billing_details');
  check('… et l’emplacement est libéré aussitôt', rpcCalls('zfind_order_released').some(c => c.body.p_order === ORDER && c.body.p_status === 'canceled'));
  state.country = 'FR';

  // ---------- pack et Agence à la une
  r = res();
  await handler(req('POST', 'highlight-pack-checkout', { headers: AUTH, body: {} }), r);
  const sp = state.sessions[state.sessions.length - 1].f;
  check('pack de 5 : 119 € HT', r.statusCode === 200 && sp['line_items[0][price_data][unit_amount]'] === String(offer.PRICES.highlightPack * 100) && sp['metadata[purpose]'] === 'highlight_pack');
  r = res();
  await handler(req('POST', 'agency-feature-checkout', { headers: AUTH, body: { communeCode: '74010', month: '2026-12', communeName: 'Annecy' } }), r);
  const sa = state.sessions[state.sessions.length - 1].f;
  const af = rpcCalls('zfind_order_agency_feature').pop().body;
  check('Agence à la une : commune, 1er du mois, 99 € HT', r.statusCode === 200 && af.p_commune === '74010' && af.p_month === '2026-12-01' && af.p_amount_ht_cents === offer.PRICES.agencyFeaturedMonth * 100);
  check('Agence à la une : libellé « Annecy (74010), décembre 2026 »', /Annecy \(74010\), décembre 2026/.test(sa['line_items[0][price_data][product_data][description]']));
  state.book = { ok: false, error: 'full', next_month: '2027-01-01' };
  r = res();
  await handler(req('POST', 'agency-feature-checkout', { headers: AUTH, body: { communeCode: '74010', month: '2026-12' } }), r);
  check('Agence à la une complète : mois suivant proposé', r.statusCode === 409 && r.json.nextMonth === '2027-01');
  state.book = { ok: true };
  r = res();
  await handler(req('POST', 'agency-feature-checkout', { headers: AUTH, body: { communeCode: 'Annecy', month: '2026-12' } }), r);
  check('code commune invalide : 400', r.statusCode === 400);

  // ---------- webhook
  async function send(type, object) {
    const evt = JSON.stringify({ id: 'evt' + Math.random().toString(36).slice(2), type, data: { object } }).replace('"id":"evt', '"id":"evt_');
    const rr = res();
    await handler(req('POST', 'webhook', { raw: evt, headers: { 'stripe-signature': stripeLib.signWebhookPayload(evt, 'whsec_abc') } }), rr);
    return rr;
  }
  const meta = { platform: 'zfind', purpose: 'highlight', order_id: ORDER, partner_id: PARTNER };
  state.rpc = [];
  r = await send('checkout.session.completed', { mode: 'payment', payment_status: 'paid', payment_intent: 'pi_1', metadata: meta });
  check('carte payée : commande payée, emplacement confirmé', r.statusCode === 200 && rpcCalls('zfind_order_paid').some(c => c.body.p_order === ORDER && c.body.p_payment_intent === 'pi_1'));
  state.rpc = [];
  r = await send('checkout.session.completed', { mode: 'payment', payment_status: 'unpaid', payment_intent: 'pi_2', metadata: meta });
  check('SEPA en cours : réservation prolongée, pas encore payée', rpcCalls('zfind_order_processing').length === 1 && rpcCalls('zfind_order_paid').length === 0);
  r = await send('checkout.session.async_payment_succeeded', { mode: 'payment', payment_status: 'paid', payment_intent: 'pi_2', metadata: meta });
  check('SEPA reçu : payée', rpcCalls('zfind_order_paid').length === 1);
  state.rpc = [];
  r = await send('checkout.session.async_payment_failed', { mode: 'payment', payment_intent: 'pi_3', metadata: meta });
  check('SEPA refusé : réservation libérée (failed)', rpcCalls('zfind_order_released').some(c => c.body.p_status === 'failed'));
  state.rpc = [];
  r = await send('checkout.session.expired', { mode: 'payment', metadata: meta });
  check('paiement abandonné : réservation libérée (canceled)', rpcCalls('zfind_order_released').some(c => c.body.p_status === 'canceled'));
  state.rpc = [];
  r = await send('checkout.session.completed', { mode: 'payment', payment_status: 'paid', metadata: { platform: 'autre', purpose: 'highlight', order_id: ORDER } });
  check('paiement d’une autre plateforme : ignoré', r.statusCode === 200 && state.rpc.length === 0);

  // ---------- pages publiques
  const featured = require(path.join(WEB, 'src', 'services', 'market-featured.js'));
  check('page marché / recherche : seules les mises en avant payées', typeof featured.selectPaidCards === 'function' && featured.FEATURED_SELECTION_MODE === 'paid-highlights-rotation');
  const H = require(path.join(WEB, 'api', '_lib', 'immobilier-pages.js'));
  const fb = H.featuredBlock('https://zfind.online', 'Annecy', [{ id: 'p1', title: 'T3 vue lac', price: 450000, currency: 'EUR', transaction: 'sale', subtype: 'apartment' }]);
  check('page commune : bloc « À la une » séparé et signalé', /À la une/.test(fb) && /zh-featured/.test(fb) && /T3 vue lac/.test(fb) && /payés par les agences/.test(fb));
  check('page commune : rien sans mise en avant', H.featuredBlock('https://zfind.online', 'Annecy', []) === '');
  const ab = H.featuredAgencyBlock('https://zfind.online', 'Annecy', { name: 'Agence du Lac', slug: 'agence-du-lac-annecy', city: 'Annecy' });
  check('Agence à la une : nom et lien vers sa page agence', /Agence du Lac/.test(ab) && /\/fr\/agence\/agence-du-lac-annecy/.test(ab));
  check('Agence à la une sans page publique : pas de lien', !/\/fr\/agence\//.test(H.featuredAgencyBlock('https://zfind.online', 'Annecy', { name: 'Agence X', slug: null })));
  check('nom d’agence échappé', !/<script>/.test(H.featuredAgencyBlock('https://zfind.online', 'Annecy', { name: '<script>x</script>' })));
  const imm = fs.readFileSync(path.join(WEB, 'api', 'immobilier.js'), 'utf8');
  const ag = fs.readFileSync(path.join(WEB, 'api', 'agences.js'), 'utf8');
  check('pages « Immobilier à » et « Agences à » lisent les mises en avant sans bloquer (délai 2 s)', /zfind_public_highlights/.test(imm) && /zfind_public_agency_feature/.test(imm) && /zfind_public_agency_feature/.test(ag) && /2000/.test(ag));
  const app = fs.readFileSync(path.join(WEB, 'src', 'app.js'), 'utf8');
  check('page marché et colonne de recherche : sélection payée (plus d’aperçu non payé)', (app.match(/selectPaidCards\(/g) || []).length === 2 && !/selectPreviewCards\(/.test(app));

  // ---------- espace Partner
  const body = fs.readFileSync(path.join(APPS, 'zfind-partner', 'src', 'body.html'), 'utf8');
  const papp = fs.readFileSync(path.join(APPS, 'zfind-partner', 'src', 'app.js'), 'utf8');
  const build = fs.readFileSync(path.join(APPS, 'zfind-partner', 'scripts', 'build.js'), 'utf8');
  const hl = fs.readFileSync(path.join(APPS, 'zfind-partner', 'src', 'highlights.js'), 'utf8');
  const navs = (body.match(/<nav class="dash-nav">/g) || []).length;
  check('Partner : « Mises en avant » dans chaque navigation', (body.match(/showHighlightsView\(\)">Mises en avant/g) || []).length === navs && /id="view-highlights"/.test(body));
  check('Partner : #mises-en-avant ouvre la vue (retour de Stripe)', /#mises-en-avant/.test(papp) && /'view-highlights'/.test(papp) && /highlightsJs \+/.test(build));
  check('Partner : complet → « Choisir cette date »', /Choisir cette date/.test(hl) && /Choisir ce mois/.test(hl) && /next_start/.test(hl));
  check('Partner : crédits inclus et pack, sans paiement', /zfind_partner_use_highlight_credit/.test(hl) && /Utiliser mon crédit/.test(hl));
  check('Partner : prix lus dans la grille publique', /highlight7Days/.test(hl) && /agencyFeaturedMonth/.test(hl) && !/\b9 € HT\b|\b29 € HT\b/.test(hl));

  // ---------- base
  const mig = fs.readFileSync(path.join(ROOT, 'infrastructure', 'supabase', 'migrations', '20261029220000_z_find_highlights_v1.sql'), 'utf8');
  check('migration : 6 emplacements par commune, 1 agence par commune et par mois', /select 6 \$\$/.test(mig) && /select 1 \$\$/.test(mig));
  check('migration : verrou par commune (pas de double vente)', /pg_advisory_xact_lock\(hashtext\('zfind_highlight:'/.test(mig) && /pg_advisory_xact_lock\(hashtext\('zfind_agency_feature:'/.test(mig));
  check('migration : tables fermées au navigateur, fonctions publiques en lecture seule', /revoke all on public\.zfind_highlights, public\.zfind_agency_features from public, anon, authenticated/.test(mig) && /grant execute on function public\.zfind_public_highlights\(text, text, integer\) to anon/.test(mig));
  check('toujours 12 fonctions Vercel au plus', fs.readdirSync(path.join(WEB, 'api')).filter(f => f.endsWith('.js')).length <= 12);

  console.log(`\n${passed} checks passed.`);
})().catch(err => { console.error('FAIL:', err.message); process.exit(1); });
