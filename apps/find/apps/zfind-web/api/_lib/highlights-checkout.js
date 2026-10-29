/* ============================================================
   Z FIND — achats ponctuels « À la une » (servis par /api/billing/*)

     POST highlight-checkout        { listingId, product: '7d' | '30d', start: 'AAAA-MM-JJ' }
     POST highlight-pack-checkout   {}
     POST agency-feature-checkout   { communeCode, month: 'AAAA-MM' }

   1. La base réserve l'emplacement (35 min) et crée la commande
      (zfind_order_* : complet → { error: 'full', next_start | next_month }).
   2. Stripe Checkout en mode paiement (carte ou prélèvement SEPA), facture
      Stripe émise (TVA comme l'abonnement).
   3. Webhook : payé → zfind_order_paid ; SEPA en cours →
      zfind_order_processing ; abandon / échec → zfind_order_released.
   Prix : src/services/pro-offer.js (seule source).
   ============================================================ */
'use strict';

const S = require('./server');
const core = require('./billing-core');

const PRODUCTS = Object.freeze({
  '7d': { kind: 'highlight_7d', price: () => core.PRICES.highlight7Days, label: 'Mise en avant « À la une » — 7 jours' },
  '30d': { kind: 'highlight_30d', price: () => core.PRICES.highlight30Days, label: 'Mise en avant « À la une » — 30 jours' },
  pack: { kind: 'highlight_pack', price: () => core.PRICES.highlightPack, label: `Pack de ${core.PRICES.highlightPackSize} mises en avant « À la une » (30 jours)` },
  agency: { kind: 'agency_featured_month', price: () => core.PRICES.agencyFeaturedMonth, label: 'Agence à la une — 1 mois' }
});
const PURPOSES = new Set(['highlight', 'highlight_pack', 'agency_feature']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const COMMUNE_RE = /^(?:2A|2B|\d{2})\d{3}$|^97[1-6]\d{2}$/;

function cents(eur) { return Math.round(Number(eur) * 100); }
function frDate(iso) {
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d).replace(/^1 /, '1er ');
}
function frMonth(iso) {
  const d = new Date(String(iso).slice(0, 7) + '-15T12:00:00Z');
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}

/** Stripe Checkout (paiement unique) pour une commande déjà réservée en base. */
async function checkoutFor(deps, stripe, ctx, auth, order) {
  const billing = deps.billingInput({}, ctx, auth);
  if (Object.keys(billing.errors).length) return { status: 422, body: { ok: false, error: 'billing_details', fields: billing.errors } };
  const { customerId, regime } = await deps.ensureCustomer(stripe, ctx, billing);
  const line = {
    quantity: 1,
    price_data: { currency: 'eur', unit_amount: order.amountCents, tax_behavior: 'exclusive', product_data: { name: order.label, description: order.description, metadata: { platform: 'zfind', kind: order.kind } } }
  };
  if (regime === 'fr_standard') line.tax_rates = [(await deps.ensureFrVatRate(stripe)).id];
  const meta = { platform: 'zfind', purpose: order.purpose, order_id: order.orderId, partner_id: ctx.partner.id };
  const footer = regime === 'reverse_charge' ? core.FOOTERS.reverse_charge : regime === 'franchise' ? core.FOOTERS.franchise : '';
  const invoiceData = { description: order.description, metadata: meta };
  if (footer) invoiceData.footer = footer;
  const session = await stripe.post('/checkout/sessions', {
    mode: 'payment', customer: customerId, locale: 'fr',
    payment_method_types: ['card', 'sepa_debit'],
    line_items: [line],
    invoice_creation: { enabled: true, invoice_data: invoiceData },
    payment_intent_data: { description: order.description, metadata: meta },
    customer_update: { address: 'auto', name: 'auto' },
    billing_address_collection: 'required',
    expires_at: Math.floor(Date.now() / 1000) + 31 * 60, // la réservation en base tient 35 min
    success_url: `${deps.partnerUrl()}/#mises-en-avant?retour=ok`,
    cancel_url: `${deps.partnerUrl()}/#mises-en-avant?retour=annule`,
    metadata: meta
  }, `zfind-order-${order.orderId}`);
  await S.db('rpc/zfind_order_attach_session', { method: 'POST', body: { p_order: order.orderId, p_session: session.id } });
  return { status: 200, body: { ok: true, url: session.url } };
}

function refusal(r) {
  const out = { ok: false, error: (r && r.error) || 'unavailable' };
  if (r && r.next_start) { out.nextStart = r.next_start; out.nextEnd = r.next_end; }
  if (r && r.next_month) out.nextMonth = String(r.next_month).slice(0, 7);
  return { status: r && r.error === 'full' ? 409 : r && r.error === 'partner_not_active' ? 403 : 422, body: out };
}

async function dbError(fn) {
  try { return { value: await fn() }; } catch (e) {
    const m = String(e.message || '').match(/(highlight_[a-z_]+|agency_feature_[a-z_]+)/);
    if (m) return { refused: { status: 422, body: { ok: false, error: m[1] } } };
    throw e;
  }
}

async function highlightCheckout(req, res, auth, stripe, deps) {
  const body = (await S.readBody(req).catch(() => ({}))) || {};
  const product = PRODUCTS[String(body.product || '')];
  const listingId = String(body.listingId || '');
  const start = String(body.start || '');
  if (!product || (body.product !== '7d' && body.product !== '30d')) return S.sendJson(res, 400, { ok: false, error: 'product' });
  if (!S.UUID_RE.test(listingId) || !DATE_RE.test(start)) return S.sendJson(res, 400, { ok: false, error: 'input' });
  const ctx = await deps.partnerContext(auth.partnerId);
  if (!ctx) return S.sendJson(res, 404, { ok: false, error: 'partner_not_found' });
  const amountCents = cents(product.price());
  const out = await dbError(() => S.db('rpc/zfind_order_highlight', { method: 'POST', body: { p_partner: auth.partnerId, p_listing: listingId, p_start: start, p_kind: product.kind, p_amount_ht_cents: amountCents } }));
  if (out.refused) return S.sendJson(res, out.refused.status, out.refused.body);
  const r = out.value;
  if (!r || !r.ok) { const x = refusal(r); return S.sendJson(res, x.status, x.body); }
  const description = `${product.label} : « ${r.title || 'annonce'} »${r.commune ? ', ' + r.commune : ''}, du ${frDate(r.starts_on)} au ${frDate(r.ends_on)} (exclu)`;
  try {
    const x = await checkoutFor(deps, stripe, ctx, auth, { orderId: r.order_id, kind: product.kind, amountCents, label: product.label, description, purpose: 'highlight' });
    if (x.status !== 200) await S.db('rpc/zfind_order_released', { method: 'POST', body: { p_order: r.order_id, p_status: 'canceled' } }).catch(() => null);
    return S.sendJson(res, x.status, x.body);
  } catch (e) {
    await S.db('rpc/zfind_order_released', { method: 'POST', body: { p_order: r.order_id, p_status: 'canceled' } }).catch(() => null);
    throw e;
  }
}

async function packCheckout(req, res, auth, stripe, deps) {
  const ctx = await deps.partnerContext(auth.partnerId);
  if (!ctx) return S.sendJson(res, 404, { ok: false, error: 'partner_not_found' });
  const product = PRODUCTS.pack;
  const amountCents = cents(product.price());
  const r = await S.db('rpc/zfind_order_highlight_pack', { method: 'POST', body: { p_partner: auth.partnerId, p_amount_ht_cents: amountCents } });
  if (!r || !r.ok) { const x = refusal(r); return S.sendJson(res, x.status, x.body); }
  const description = `${product.label} — à utiliser depuis l’espace Partner, sans date limite`;
  try {
    const x = await checkoutFor(deps, stripe, ctx, auth, { orderId: r.order_id, kind: product.kind, amountCents, label: product.label, description, purpose: 'highlight_pack' });
    if (x.status !== 200) await S.db('rpc/zfind_order_released', { method: 'POST', body: { p_order: r.order_id, p_status: 'canceled' } }).catch(() => null);
    return S.sendJson(res, x.status, x.body);
  } catch (e) {
    await S.db('rpc/zfind_order_released', { method: 'POST', body: { p_order: r.order_id, p_status: 'canceled' } }).catch(() => null);
    throw e;
  }
}

async function agencyFeatureCheckout(req, res, auth, stripe, deps) {
  const body = (await S.readBody(req).catch(() => ({}))) || {};
  const commune = String(body.communeCode || '').toUpperCase();
  const month = String(body.month || '');
  if (!COMMUNE_RE.test(commune) || !MONTH_RE.test(month)) return S.sendJson(res, 400, { ok: false, error: 'input' });
  const ctx = await deps.partnerContext(auth.partnerId);
  if (!ctx) return S.sendJson(res, 404, { ok: false, error: 'partner_not_found' });
  const product = PRODUCTS.agency;
  const amountCents = cents(product.price());
  const out = await dbError(() => S.db('rpc/zfind_order_agency_feature', { method: 'POST', body: { p_partner: auth.partnerId, p_commune: commune, p_month: `${month}-01`, p_amount_ht_cents: amountCents } }));
  if (out.refused) return S.sendJson(res, out.refused.status, out.refused.body);
  const r = out.value;
  if (!r || !r.ok) { const x = refusal(r); return S.sendJson(res, x.status, x.body); }
  const communeName = String(body.communeName || '').replace(/[\r\n<>]/g, '').slice(0, 80);
  const description = `${product.label} : ${communeName ? communeName + ' (' + commune + ')' : 'commune ' + commune}, ${frMonth(r.month)}`;
  try {
    const x = await checkoutFor(deps, stripe, ctx, auth, { orderId: r.order_id, kind: product.kind, amountCents, label: product.label, description, purpose: 'agency_feature' });
    if (x.status !== 200) await S.db('rpc/zfind_order_released', { method: 'POST', body: { p_order: r.order_id, p_status: 'canceled' } }).catch(() => null);
    return S.sendJson(res, x.status, x.body);
  } catch (e) {
    await S.db('rpc/zfind_order_released', { method: 'POST', body: { p_order: r.order_id, p_status: 'canceled' } }).catch(() => null);
    throw e;
  }
}

/** Événements Stripe des achats ponctuels. Renvoie true si l'événement a été traité ici. */
async function handleOrderEvent(event) {
  const obj = event && event.data && event.data.object;
  if (!obj || obj.mode !== 'payment' || !obj.metadata || obj.metadata.platform !== 'zfind' || !PURPOSES.has(obj.metadata.purpose)) return false;
  const orderId = obj.metadata.order_id;
  if (!S.UUID_RE.test(String(orderId || ''))) return false;
  const pi = typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent && obj.payment_intent.id;
  switch (event.type) {
    case 'checkout.session.completed':
      if (obj.payment_status === 'paid' || obj.payment_status === 'no_payment_required') {
        await S.db('rpc/zfind_order_paid', { method: 'POST', body: { p_order: orderId, p_payment_intent: pi || null } });
      } else {
        await S.db('rpc/zfind_order_processing', { method: 'POST', body: { p_order: orderId } }); // SEPA : quelques jours
      }
      return true;
    case 'checkout.session.async_payment_succeeded':
      await S.db('rpc/zfind_order_paid', { method: 'POST', body: { p_order: orderId, p_payment_intent: pi || null } });
      return true;
    case 'checkout.session.async_payment_failed':
      await S.db('rpc/zfind_order_released', { method: 'POST', body: { p_order: orderId, p_status: 'failed' } });
      return true;
    case 'checkout.session.expired':
      await S.db('rpc/zfind_order_released', { method: 'POST', body: { p_order: orderId, p_status: 'canceled' } });
      return true;
    default:
      return false;
  }
}

module.exports = { PRODUCTS, highlightCheckout, packCheckout, agencyFeatureCheckout, handleOrderEvent, frDate, frMonth };
