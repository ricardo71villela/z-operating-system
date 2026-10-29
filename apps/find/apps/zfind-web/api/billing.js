/* ============================================================
   Z FIND — /api/billing/* (Vercel serverless function)

   Facturation des agences avec Stripe. Une seule fonction (le plan
   Vercel limite leur nombre) ; vercel.json réécrit /api/billing/<route>
   en /api/billing?route=<route>.

   Depuis l'espace Partner (partner.zfind.online), avec le jeton de
   session Supabase de l'agence (Authorization: Bearer …) :
     GET  status                 compte, abonnement, annonces publiées, palier
     POST subscription-checkout  page Stripe Checkout de l'abonnement
                                 (carte ou prélèvement SEPA ; premier
                                 prélèvement à la fin des mois offerts)
     POST portal                 portail client Stripe (moyen de paiement,
                                 factures, résiliation)
     POST app-link               ouvrir Z Desk / Z Studio avec le même compte,
                                 sans nouvelle connexion (_lib/app-link.js)
     POST highlight-checkout     mise en avant « À la une » 7 / 30 jours
     POST highlight-pack-checkout pack de 5 mises en avant
     POST agency-feature-checkout « Agence à la une » (commune, mois)
                                 (_lib/highlights-checkout.js)
   Depuis Stripe :
     POST webhook                événements signés (STRIPE_WEBHOOK_SECRET)

   Le palier suit le nombre d'annonces publiées : il est recalculé avant
   chaque facture (invoice.upcoming, customer.subscription.trial_will_end),
   sans prorata. Environnement : STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
   ZFIND_SUPABASE_SERVICE_KEY, ZFIND_VAT_MODE (standard | franchise),
   ZFIND_PARTNER_URL (défaut https://partner.zfind.online).
   ============================================================ */
'use strict';

const S = require('./_lib/server');
const core = require('./_lib/billing-core');
const stripeLib = require('./_lib/stripe');
const appLinkLib = require('./_lib/app-link');
const orders = require('./_lib/highlights-checkout');

const PARTNER_ORIGINS = ['https://partner.zfind.online'];
const PREVIEW_ORIGIN_RE = /^https:\/\/zfind-partner-[a-z0-9-]+-zoperatingsystem\.vercel\.app$/;
const DEFAULT_SUPABASE_URL = 'https://dcdggqyazdddrfuzwavw.supabase.co';
const ACTIVE_STATUSES = new Set(['trialing', 'active', 'past_due', 'unpaid', 'incomplete']);

function partnerUrl() { return S.env('ZFIND_PARTNER_URL', 'https://partner.zfind.online').replace(/\/+$/, ''); }

function cors(req, res) {
  const origin = String((req.headers && req.headers.origin) || '');
  const extra = String(S.env('ZFIND_PARTNER_ORIGINS', '')).split(',').map(s => s.trim()).filter(Boolean);
  if (PARTNER_ORIGINS.includes(origin) || extra.includes(origin) || PREVIEW_ORIGIN_RE.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

// ------------------------------------------------------------------ agence connectée
async function authPartner(req) {
  const m = String((req.headers && req.headers.authorization) || '').match(/^Bearer\s+([A-Za-z0-9._-]+)$/);
  if (!m) return null;
  const key = String(S.env('ZFIND_SUPABASE_SERVICE_KEY', '')).trim();
  const base = S.env('SUPABASE_URL', DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
  const r = await fetch(`${base}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${m[1]}` } });
  if (!r.ok) return null;
  const user = await r.json().catch(() => null);
  if (!user || !S.UUID_RE.test(String(user.id || ''))) return null;
  const profiles = await S.db(`profiles?id=eq.${user.id}&select=partner_id,role`);
  const p = profiles && profiles[0];
  if (!p || p.role !== 'partner_user' || !S.UUID_RE.test(String(p.partner_id || ''))) return null;
  return { userId: user.id, email: user.email || null, partnerId: p.partner_id };
}

async function partnerContext(partnerId) {
  const [partners, signups, accounts, subs, count] = await Promise.all([
    S.db(`partners?id=eq.${partnerId}&select=id,name,created_at,status`),
    S.db(`zfind_partner_signups?partner_id=eq.${partnerId}&select=legal_name,trade_name,email,country,address,postcode,city,created_at&order=created_at.asc&limit=1`),
    S.db(`zfind_billing_accounts?partner_id=eq.${partnerId}&select=*`),
    S.db(`zfind_billing_subscriptions?partner_id=eq.${partnerId}&select=*`),
    S.db('rpc/zfind_partner_active_listings', { method: 'POST', body: { p_partner_id: partnerId } })
  ]);
  const partner = partners && partners[0];
  if (!partner) return null;
  const signup = (signups && signups[0]) || {};
  return {
    partner, signup,
    account: (accounts && accounts[0]) || null,
    subscription: (subs && subs[0]) || null,
    activeListings: Number(count) || 0,
    signupAt: signup.created_at || partner.created_at || null
  };
}

function statusPayload(ctx) {
  const tier = core.tierFor(ctx.activeListings);
  const freeEnd = core.freeMonthsEnd(ctx.signupAt);
  const sub = ctx.subscription;
  return {
    ok: true,
    activeListings: ctx.activeListings,
    tier, tierName: core.TIER_NAMES[tier], priceHt: core.PRICES[tier],
    freeMonthsEnd: freeEnd ? freeEnd.toISOString() : null,
    vatMode: core.vatMode(),
    account: ctx.account ? { legalName: ctx.account.legal_name, billingEmail: ctx.account.billing_email, country: ctx.account.country, vatNumber: ctx.account.vat_number, vatRegime: ctx.account.vat_regime } : {
      legalName: ctx.signup.legal_name || ctx.partner.name, billingEmail: ctx.signup.email || null, country: ctx.signup.country || 'FR', vatNumber: null, vatRegime: null
    },
    subscription: sub ? {
      status: sub.status, tier: sub.tier, tierName: core.TIER_NAMES[sub.tier] || null,
      trialEnd: sub.trial_end, currentPeriodEnd: sub.current_period_end, cancelAtPeriodEnd: !!sub.cancel_at_period_end,
      paymentMethodType: sub.payment_method_type
    } : null
  };
}

// ------------------------------------------------------------------ catalogue Stripe
async function ensureProduct(stripe) {
  try {
    await stripe.post('/products', { id: core.PRODUCT_ID, name: 'Abonnement Z Find', description: 'Publication des annonces, page agence, Z Desk et Z Studio inclus', metadata: { platform: 'zfind' } }, `zfind-product-${core.PRODUCT_ID}`);
  } catch (e) {
    if (e.stripeCode !== 'resource_already_exists') throw e;
  }
}
async function ensurePrice(stripe, tier) {
  const key = core.lookupKey(tier);
  const found = await stripe.get('/prices', { 'lookup_keys[0]': key, active: 'true', limit: '1' });
  if (found && found.data && found.data[0]) return found.data[0];
  await ensureProduct(stripe);
  return stripe.post('/prices', {
    product: core.PRODUCT_ID, currency: 'eur', unit_amount: core.priceCents(tier), tax_behavior: 'exclusive',
    recurring: { interval: 'month' }, lookup_key: key, nickname: `Z Find ${core.TIER_NAMES[tier]} (${core.PRICES[tier]} € HT / mois)`,
    metadata: { platform: 'zfind', tier }
  }, `zfind-price-${key}`);
}
async function ensureFrVatRate(stripe) {
  const list = await stripe.get('/tax_rates', { active: 'true', limit: '100' });
  const hit = ((list && list.data) || []).find(t => t.metadata && t.metadata.zfind === 'fr_tva_20');
  if (hit) return hit;
  return stripe.post('/tax_rates', { display_name: 'TVA', percentage: '20', inclusive: 'false', country: 'FR', jurisdiction: 'FR', description: 'TVA française 20 %', metadata: { zfind: 'fr_tva_20' } }, 'zfind-taxrate-fr_tva_20');
}

// ------------------------------------------------------------------ client Stripe et compte
async function saveAccount(partnerId, fields) {
  const row = Object.assign({ partner_id: partnerId, updated_at: new Date().toISOString() }, fields);
  const out = await S.db('zfind_billing_accounts?on_conflict=partner_id', { method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=representation' });
  return out && out[0];
}

async function ensureCustomer(stripe, ctx, billing) {
  const regime = core.vatRegime(billing.country, billing.vatNumber);
  const params = {
    name: billing.legalName, email: billing.billingEmail, preferred_locales: ['fr'],
    invoice_settings: { footer: regime === 'reverse_charge' ? core.FOOTERS.reverse_charge : regime === 'franchise' ? core.FOOTERS.franchise : '' },
    metadata: { partner_id: ctx.partner.id, platform: 'zfind' }
  };
  if (ctx.signup.address && ctx.signup.city) params.address = { line1: ctx.signup.address, postal_code: ctx.signup.postcode || '', city: ctx.signup.city, country: billing.country };
  let customerId = ctx.account && ctx.account.stripe_customer_id;
  if (customerId) await stripe.post(`/customers/${encodeURIComponent(customerId)}`, params);
  else customerId = (await stripe.post('/customers', params, `zfind-customer-${ctx.partner.id}`)).id;
  if (regime === 'reverse_charge') {
    const ids = await stripe.get(`/customers/${encodeURIComponent(customerId)}/tax_ids`, { limit: '10' });
    const value = core.normalizeVat(billing.vatNumber, billing.country);
    if (!((ids && ids.data) || []).some(t => t.value === value)) {
      await stripe.post(`/customers/${encodeURIComponent(customerId)}/tax_ids`, { type: 'eu_vat', value }).catch(e => { if (e.stripeCode !== 'resource_already_exists') throw e; });
    }
  }
  await saveAccount(ctx.partner.id, { stripe_customer_id: customerId, legal_name: billing.legalName, billing_email: billing.billingEmail, country: billing.country, vat_number: core.normalizeVat(billing.vatNumber, billing.country), vat_regime: regime });
  return { customerId, regime };
}

function billingInput(body, ctx, auth) {
  const country = ['FR', 'BE', 'LU'].includes(String(body.country || '').toUpperCase()) ? String(body.country).toUpperCase() : (ctx.signup.country || 'FR');
  const legalName = S.oneLine(body.legalName || (ctx.account && ctx.account.legal_name) || ctx.signup.legal_name || ctx.partner.name, 160);
  const billingEmail = S.oneLine(body.billingEmail || (ctx.account && ctx.account.billing_email) || ctx.signup.email || auth.email, 200).toLowerCase();
  const rawVat = S.oneLine(body.vatNumber || '', 40);
  const errors = {};
  if (!legalName) errors.legalName = 'required';
  if (!S.EMAIL_RE.test(billingEmail)) errors.billingEmail = 'invalid';
  if (rawVat && !core.normalizeVat(rawVat, country)) errors.vatNumber = 'invalid';
  if ((country === 'BE' || country === 'LU') && core.vatMode() === 'standard' && !rawVat) errors.vatNumber = 'required';
  return { country, legalName, billingEmail, vatNumber: rawVat, errors };
}

// ------------------------------------------------------------------ routes agence
async function subscriptionCheckout(req, res, auth, stripe) {
  const body = await S.readBody(req).catch(() => ({}));
  const ctx = await partnerContext(auth.partnerId);
  if (!ctx) return S.sendJson(res, 404, { ok: false, error: 'partner_not_found' });
  if (ctx.subscription && ACTIVE_STATUSES.has(ctx.subscription.status) && ctx.subscription.stripe_subscription_id) {
    return S.sendJson(res, 409, { ok: false, error: 'already_subscribed' });
  }
  const billing = billingInput(body || {}, ctx, auth);
  if (Object.keys(billing.errors).length) return S.sendJson(res, 422, { ok: false, error: 'validation', fields: billing.errors });
  const { customerId, regime } = await ensureCustomer(stripe, ctx, billing);
  const tier = core.tierFor(ctx.activeListings);
  const price = await ensurePrice(stripe, tier);
  const line = { price: price.id, quantity: 1 };
  if (regime === 'fr_standard') line.tax_rates = [(await ensureFrVatRate(stripe)).id];
  const freeEnd = core.freeMonthsEnd(ctx.signupAt);
  const subscriptionData = { metadata: { partner_id: ctx.partner.id, platform: 'zfind' }, description: `Abonnement Z Find — ${ctx.partner.name}` };
  // Stripe : trial_end au moins 48 h dans le futur.
  if (freeEnd && freeEnd.getTime() > Date.now() + 49 * 3600 * 1000) subscriptionData.trial_end = Math.floor(freeEnd.getTime() / 1000);
  const session = await stripe.post('/checkout/sessions', {
    mode: 'subscription', customer: customerId, locale: 'fr',
    payment_method_types: ['card', 'sepa_debit'],
    line_items: [line],
    subscription_data: subscriptionData,
    billing_address_collection: 'required',
    customer_update: { address: 'auto', name: 'auto' },
    success_url: `${partnerUrl()}/#abonnement?retour=ok`,
    cancel_url: `${partnerUrl()}/#abonnement?retour=annule`,
    metadata: { partner_id: ctx.partner.id, platform: 'zfind', purpose: 'subscription' }
  });
  return S.sendJson(res, 200, { ok: true, url: session.url });
}

async function portal(req, res, auth, stripe) {
  const accounts = await S.db(`zfind_billing_accounts?partner_id=eq.${auth.partnerId}&select=stripe_customer_id`);
  const customerId = accounts && accounts[0] && accounts[0].stripe_customer_id;
  if (!customerId) return S.sendJson(res, 409, { ok: false, error: 'no_customer' });
  const session = await stripe.post('/billing_portal/sessions', { customer: customerId, return_url: `${partnerUrl()}/#abonnement`, locale: 'fr' });
  return S.sendJson(res, 200, { ok: true, url: session.url });
}

// ------------------------------------------------------------------ webhook
function readRaw(req) {
  if (Buffer.isBuffer(req.rawBody)) return Promise.resolve(req.rawBody);
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > 262144) { reject(new Error('too_large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function unix(v) { return v ? new Date(Number(v) * 1000).toISOString() : null; }

/** Abonnement Stripe → ligne zfind_billing_subscriptions. */
async function syncSubscription(stripe, subscriptionId) {
  const sub = await stripe.get(`/subscriptions/${encodeURIComponent(subscriptionId)}`, { 'expand[0]': 'default_payment_method' });
  const partnerId = sub && sub.metadata && sub.metadata.partner_id;
  if (!S.UUID_RE.test(String(partnerId || ''))) return null;
  const item = sub.items && sub.items.data && sub.items.data[0];
  const price = item && item.price;
  const pm = sub.default_payment_method;
  const row = {
    partner_id: partnerId, stripe_subscription_id: sub.id, status: sub.status,
    tier: core.tierFromLookupKey(price && price.lookup_key), stripe_price_id: price ? price.id : null,
    trial_end: unix(sub.trial_end), current_period_end: unix((item && item.current_period_end) || sub.current_period_end),
    cancel_at_period_end: !!sub.cancel_at_period_end,
    payment_method_type: pm && typeof pm === 'object' ? pm.type : null,
    livemode: typeof sub.livemode === 'boolean' ? sub.livemode : null,
    updated_at: new Date().toISOString()
  };
  try {
    await S.db('zfind_billing_subscriptions?on_conflict=partner_id', { method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=minimal' });
  } catch (e) {
    // livemode arrive avec la migration 20261029200000 : sans elle, enregistrer le reste.
    if (!/livemode/.test(String(e.message))) throw e;
    const { livemode, ...rest } = row;
    await S.db('zfind_billing_subscriptions?on_conflict=partner_id', { method: 'POST', body: rest, prefer: 'resolution=merge-duplicates,return=minimal' });
  }
  return { sub, row, item };
}

/** Avant une facture : palier selon les annonces publiées, sans prorata. */
async function retier(stripe, subscriptionId) {
  const synced = await syncSubscription(stripe, subscriptionId);
  if (!synced || !synced.item) return null;
  const count = Number(await S.db('rpc/zfind_partner_active_listings', { method: 'POST', body: { p_partner_id: synced.row.partner_id } })) || 0;
  const tier = core.tierFor(count);
  await S.db(`zfind_billing_subscriptions?partner_id=eq.${synced.row.partner_id}`, { method: 'PATCH', body: { active_listings: count }, prefer: 'return=minimal' });
  if (tier === synced.row.tier || ['canceled', 'incomplete_expired'].includes(synced.sub.status)) return { tier, changed: false };
  const price = await ensurePrice(stripe, tier);
  await stripe.post(`/subscriptions/${encodeURIComponent(synced.sub.id)}`, {
    items: [{ id: synced.item.id, price: price.id }], proration_behavior: 'none', metadata: { partner_id: synced.row.partner_id, platform: 'zfind', tier }
  }, `zfind-retier-${synced.sub.id}-${tier}-${synced.row.current_period_end || ''}`);
  await syncSubscription(stripe, synced.sub.id);
  return { tier, changed: true };
}

async function handleEvent(stripe, event) {
  const obj = event.data && event.data.object;
  if (!obj) return;
  if (await orders.handleOrderEvent(event)) return; // achats ponctuels (mises en avant)
  switch (event.type) {
    case 'checkout.session.completed':
      if (obj.mode === 'subscription' && obj.subscription && obj.metadata && obj.metadata.platform === 'zfind') await syncSubscription(stripe, obj.subscription);
      break;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      if (obj.metadata && obj.metadata.platform === 'zfind') await syncSubscription(stripe, obj.id);
      break;
    case 'customer.subscription.trial_will_end':
      if (obj.metadata && obj.metadata.platform === 'zfind') await retier(stripe, obj.id);
      break;
    case 'invoice.upcoming': {
      const subId = obj.subscription || (obj.parent && obj.parent.subscription_details && obj.parent.subscription_details.subscription);
      if (subId) await retier(stripe, subId);
      break;
    }
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const subId = obj.subscription || (obj.parent && obj.parent.subscription_details && obj.parent.subscription_details.subscription);
      if (subId) await syncSubscription(stripe, subId);
      break;
    }
    default:
      break;
  }
}

async function webhook(req, res, cfg, stripe) {
  if (!cfg.webhookSecret) return S.sendJson(res, 503, { ok: false, error: 'not_configured' });
  let event;
  try {
    event = stripeLib.verifyWebhook(await readRaw(req), req.headers && req.headers['stripe-signature'], cfg.webhookSecret);
  } catch (e) {
    return S.sendJson(res, 400, { ok: false, error: e.code || 'invalid' });
  }
  const seen = await S.db(`zfind_stripe_events?id=eq.${encodeURIComponent(event.id)}&select=id,processed_at`);
  if (seen && seen[0] && seen[0].processed_at) return S.sendJson(res, 200, { ok: true, duplicate: true });
  if (!seen || !seen[0]) await S.db('zfind_stripe_events', { method: 'POST', body: { id: event.id, type: event.type }, prefer: 'resolution=ignore-duplicates,return=minimal' });
  try {
    await handleEvent(stripe, event);
    await S.db(`zfind_stripe_events?id=eq.${encodeURIComponent(event.id)}`, { method: 'PATCH', body: { processed_at: new Date().toISOString(), error: null }, prefer: 'return=minimal' });
    return S.sendJson(res, 200, { ok: true });
  } catch (e) {
    console.error('billing webhook:', event.type, e.code || e.message);
    await S.db(`zfind_stripe_events?id=eq.${encodeURIComponent(event.id)}`, { method: 'PATCH', body: { error: String(e.code || e.message).slice(0, 300) }, prefer: 'return=minimal' }).catch(() => null);
    return S.sendJson(res, 500, { ok: false, error: 'retry' }); // Stripe renverra l'événement
  }
}

// ------------------------------------------------------------------ entrée
async function handler(req, res) {
  const route = String(S.queryOf(req).route || '').replace(/^\/+|\/+$/g, '');
  const cfg = stripeLib.loadStripeConfig();
  if (route !== 'webhook') cors(req, res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (!S.configured(['db']) || (!cfg.secretKey && route !== 'status' && route !== 'app-link')) {
    console.error('billing: not configured (ZFIND_SUPABASE_SERVICE_KEY, STRIPE_SECRET_KEY)');
    return S.sendJson(res, 503, { ok: false, error: 'not_configured' });
  }
  const stripe = cfg.secretKey ? stripeLib.createStripeClient({ secretKey: cfg.secretKey, apiBase: cfg.apiBase }) : null;
  try {
    if (route === 'webhook') {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return S.sendJson(res, 405, { ok: false, error: 'method' }); }
      return await webhook(req, res, cfg, stripe);
    }
    const routes = { status: 'GET', 'subscription-checkout': 'POST', portal: 'POST', 'highlight-checkout': 'POST', 'highlight-pack-checkout': 'POST', 'agency-feature-checkout': 'POST', 'app-link': 'POST' };
    if (!routes[route]) return S.sendJson(res, 404, { ok: false, error: 'not_found' });
    if (req.method !== routes[route]) { res.setHeader('Allow', routes[route]); return S.sendJson(res, 405, { ok: false, error: 'method' }); }
    if (S.limited(req, 30, 600000)) return S.sendJson(res, 429, { ok: false, error: 'rate_limited' });
    const auth = await authPartner(req);
    if (!auth) return S.sendJson(res, 401, { ok: false, error: 'unauthorized' });
    if (route === 'status') {
      const ctx = await partnerContext(auth.partnerId);
      return ctx ? S.sendJson(res, 200, Object.assign(statusPayload(ctx), { paymentsReady: !!cfg.secretKey, testMode: !!cfg.secretKey && !cfg.livemode })) : S.sendJson(res, 404, { ok: false, error: 'partner_not_found' });
    }
    if (route === 'app-link') return await appLinkLib.appLink(req, res, auth);
    if (route === 'subscription-checkout') return await subscriptionCheckout(req, res, auth, stripe);
    const deps = { partnerContext, billingInput, ensureCustomer, ensureFrVatRate, partnerUrl };
    if (route === 'highlight-checkout') return await orders.highlightCheckout(req, res, auth, stripe, deps);
    if (route === 'highlight-pack-checkout') return await orders.packCheckout(req, res, auth, stripe, deps);
    if (route === 'agency-feature-checkout') return await orders.agencyFeatureCheckout(req, res, auth, stripe, deps);
    return await portal(req, res, auth, stripe);
  } catch (e) {
    console.error('billing:', route, e.code || e.message, e.stripeMessage || '');
    return S.sendJson(res, 502, { ok: false, error: e.code === 'stripe_error' ? 'stripe' : 'server' });
  }
}

module.exports = handler;
module.exports._internals = { authPartner, partnerContext, statusPayload, ensurePrice, ensureFrVatRate, ensureCustomer, billingInput, syncSubscription, retier, handleEvent };
