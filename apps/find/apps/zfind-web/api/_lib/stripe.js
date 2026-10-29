/* ============================================================
   Z FIND — Stripe (appels HTTPS directs, sans SDK)

   Même approche et même version d'API que Z Studio et Z Fashion :
   requêtes form-encoded, Idempotency-Key sur chaque écriture,
   vérification de la signature des webhooks (Stripe-Signature).
   Aucune donnée de carte ni d'IBAN ne passe par ce serveur : l'agence
   les saisit sur la page Stripe (Checkout, portail client).

   Environnement :
     STRIPE_SECRET_KEY       sk_test_… / sk_live_… (serveur uniquement)
     STRIPE_WEBHOOK_SECRET   whsec_… (vérifie POST /api/billing/webhook)
     ZFIND_STRIPE_API_BASE   tests uniquement : faux api.stripe.com
   ============================================================ */
'use strict';

const crypto = require('crypto');

const STRIPE_API_VERSION = '2026-07-29.dahlia';
const DEFAULT_API_BASE = 'https://api.stripe.com/v1';
const WEBHOOK_TOLERANCE_SECONDS = 300;
const MAX_WEBHOOK_BODY_BYTES = 262144;

class StripeError extends Error {
  constructor(code, { httpStatus, stripeCode, stripeMessage } = {}) {
    super(code);
    this.code = code;
    this.httpStatus = httpStatus;
    this.stripeCode = stripeCode;
    this.stripeMessage = stripeMessage;
  }
}

function loadStripeConfig(env) {
  const e = env || process.env;
  const secretKey = String(e.STRIPE_SECRET_KEY || '').trim();
  const webhookSecret = String(e.STRIPE_WEBHOOK_SECRET || '').trim();
  return {
    secretKey: /^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(secretKey) ? secretKey : null,
    livemode: /^(sk|rk)_live_/.test(secretKey),
    webhookSecret: /^whsec_[A-Za-z0-9]+$/.test(webhookSecret) ? webhookSecret : null,
    apiBase: String(e.ZFIND_STRIPE_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, '')
  };
}

/** Objet imbriqué → paramètres Stripe (« a[b][0][c]=… »). */
function flatten(obj, prefix, out) {
  const o = out || {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (item !== null && typeof item === 'object') ? flatten(item, `${key}[${i}]`, o) : (o[`${key}[${i}]`] = String(item)));
    else if (typeof v === 'object') flatten(v, key, o);
    else o[key] = String(v);
  }
  return o;
}

function createStripeClient({ secretKey, apiBase = DEFAULT_API_BASE, fetchImpl, timeoutMs = 15000 }) {
  const doFetch = fetchImpl || ((...a) => fetch(...a));
  async function request(method, path, { params, idempotencyKey } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers = { Authorization: `Bearer ${secretKey}`, accept: 'application/json', 'Stripe-Version': STRIPE_API_VERSION };
    let url = `${apiBase}${path}`;
    let body;
    if (params && method === 'GET') {
      const q = new URLSearchParams(flatten(params)).toString();
      if (q) url += (url.includes('?') ? '&' : '?') + q;
    } else if (params) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(flatten(params)).toString();
    }
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    let response;
    try {
      response = await doFetch(url, { method, headers, body, signal: controller.signal });
    } catch (cause) {
      throw new StripeError(cause && cause.name === 'AbortError' ? 'stripe_timeout' : 'stripe_unreachable');
    } finally {
      clearTimeout(timer);
    }
    let json = null;
    try { json = await response.json(); } catch (_) { json = null; }
    if (!response.ok) {
      const err = json && json.error ? json.error : {};
      throw new StripeError('stripe_error', { httpStatus: response.status, stripeCode: err.code || err.type || null, stripeMessage: err.message || null });
    }
    return json;
  }
  return {
    get: (path, params) => request('GET', path, { params }),
    post: (path, params, idempotencyKey) => request('POST', path, { params, idempotencyKey }),
    del: (path) => request('DELETE', path)
  };
}

/** Vérifie l'en-tête Stripe-Signature sur le corps brut et renvoie l'événement. */
function verifyWebhook(rawBody, signatureHeader, secret, nowMs) {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) throw new StripeError('webhook_body_missing');
  if (rawBody.length > MAX_WEBHOOK_BODY_BYTES) throw new StripeError('webhook_body_too_large');
  let timestamp = null;
  const signatures = [];
  for (const part of String(signatureHeader || '').split(',')) {
    const [k, ...rest] = part.split('=');
    const v = rest.join('=').trim();
    if (k.trim() === 't' && /^\d+$/.test(v)) timestamp = Number(v);
    else if (k.trim() === 'v1' && /^[a-f0-9]{64}$/i.test(v)) signatures.push(v.toLowerCase());
  }
  if (timestamp === null || !signatures.length) throw new StripeError('webhook_signature_invalid');
  if (Math.abs(Math.floor((nowMs || Date.now()) / 1000) - timestamp) > WEBHOOK_TOLERANCE_SECONDS) throw new StripeError('webhook_timestamp_outside_tolerance');
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest();
  const ok = signatures.some(sig => { const given = Buffer.from(sig, 'hex'); return given.length === expected.length && crypto.timingSafeEqual(given, expected); });
  if (!ok) throw new StripeError('webhook_signature_invalid');
  let event;
  try { event = JSON.parse(rawBody.toString('utf8')); } catch (_) { throw new StripeError('webhook_body_invalid'); }
  if (!event || typeof event.id !== 'string' || !/^evt_[A-Za-z0-9]+$/.test(event.id) || typeof event.type !== 'string') throw new StripeError('webhook_body_invalid');
  return event;
}

/** En-tête Stripe-Signature valide (tests). */
function signWebhookPayload(payload, secret, timestamp) {
  const t = timestamp || Math.floor(Date.now() / 1000);
  return `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`;
}

module.exports = { STRIPE_API_VERSION, StripeError, loadStripeConfig, createStripeClient, flatten, verifyWebhook, signWebhookPayload };
