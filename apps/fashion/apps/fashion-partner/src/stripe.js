/* ============================================================
   Z FASHION PARTNER — Stripe (PaymentIntents, refunds, webhooks)
   ============================================================
   Plain HTTPS calls to the Stripe API, same approach and API version
   as Z Studio (apps/studio/commercial/lib/stripe-web-api.js): no SDK,
   form-encoded requests, Idempotency-Key on every write.

   PCI boundary: card data never reaches this server. The browser
   pays with Stripe.js (Payment Element) using the PaymentIntent's
   client_secret; this server only creates the PaymentIntent, receives
   signed webhooks and issues refunds.

   Environment:
     STRIPE_SECRET_KEY        sk_test_... / sk_live_... (server only)
     STRIPE_PUBLISHABLE_KEY   pk_test_... / pk_live_... (sent to the browser)
     STRIPE_WEBHOOK_SECRET    whsec_... (verifies POST /stripe/webhook)
     FASHION_STRIPE_API_BASE  tests only: a local fake of api.stripe.com
   ============================================================ */

const crypto = require('crypto');

const STRIPE_API_VERSION = '2026-07-29.dahlia';
const DEFAULT_API_BASE = 'https://api.stripe.com/v1';
const WEBHOOK_TOLERANCE_SECONDS = 300;
const MAX_WEBHOOK_BODY_BYTES = 262144;

class StripeError extends Error {
  constructor(code, { httpStatus, stripeCode } = {}) {
    super(code);
    this.code = code;
    this.httpStatus = httpStatus;
    this.stripeCode = stripeCode;
  }
}

function loadStripeConfig(env = process.env) {
  const secretKey = (env.STRIPE_SECRET_KEY || '').trim();
  const publishableKey = (env.STRIPE_PUBLISHABLE_KEY || '').trim();
  const webhookSecret = (env.STRIPE_WEBHOOK_SECRET || '').trim();
  const apiBase = (env.FASHION_STRIPE_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, '');
  return {
    payments: /^sk_(test|live)_[A-Za-z0-9]+$/.test(secretKey) && /^pk_(test|live)_[A-Za-z0-9]+$/.test(publishableKey)
      ? { secretKey, publishableKey, apiBase, livemode: secretKey.startsWith('sk_live_') }
      : null,
    webhookSecret: /^whsec_[A-Za-z0-9]+$/.test(webhookSecret) ? webhookSecret : null,
  };
}

function createStripeClient({ secretKey, apiBase = DEFAULT_API_BASE, fetchImpl = fetch, timeoutMs = 15000 }) {
  async function request(method, path, { params, idempotencyKey } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers = { Authorization: `Bearer ${secretKey}`, accept: 'application/json', 'Stripe-Version': STRIPE_API_VERSION };
    let body;
    if (params) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(params).toString();
    }
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    let response;
    try {
      response = await fetchImpl(`${apiBase}${path}`, { method, headers, body, signal: controller.signal });
    } catch (cause) {
      throw new StripeError(cause && cause.name === 'AbortError' ? 'stripe_timeout' : 'stripe_unreachable');
    } finally {
      clearTimeout(timer);
    }
    let json = null;
    try { json = await response.json(); } catch (e) { json = null; }
    if (!response.ok) {
      throw new StripeError('stripe_error', { httpStatus: response.status, stripeCode: json && json.error ? json.error.code || json.error.type : null });
    }
    return json;
  }

  return {
    /** One PaymentIntent per Order: the idempotency key is the Order id. */
    createPaymentIntent({ orderId, clientUserId, amountMinorUnits, currency = 'eur' }) {
      return request('POST', '/payment_intents', {
        idempotencyKey: `zfashion-order-${orderId}`,
        params: {
          amount: String(amountMinorUnits),
          currency,
          'automatic_payment_methods[enabled]': 'true',
          transfer_group: `order_${orderId}`,
          'metadata[order_id]': orderId,
          'metadata[client_user_id]': clientUserId,
          'metadata[platform]': 'zfashion',
        },
      });
    },
    retrievePaymentIntent(paymentIntentId) {
      return request('GET', `/payment_intents/${encodeURIComponent(paymentIntentId)}`);
    },
    /* ---------- Connect (store payouts) ---------- */

    /** Express connected account owned by Z Fashion; Stripe collects the identity checks. */
    createConnectedAccount({ partnerId, country, email, businessName }) {
      const params = {
        country,
        'capabilities[transfers][requested]': 'true',
        'controller[fees][payer]': 'application',
        'controller[losses][payments]': 'application',
        'controller[stripe_dashboard][type]': 'express',
        'controller[requirement_collection]': 'stripe',
        'metadata[partner_id]': partnerId,
        'metadata[platform]': 'zfashion',
      };
      if (email) params.email = email;
      if (businessName) params['business_profile[name]'] = businessName;
      return request('POST', '/accounts', { idempotencyKey: `zfashion-account-${partnerId}`, params });
    },
    retrieveAccount(accountId) {
      return request('GET', `/accounts/${encodeURIComponent(accountId)}`);
    },
    createAccountLink({ accountId, refreshUrl, returnUrl }) {
      return request('POST', '/account_links', {
        params: { account: accountId, refresh_url: refreshUrl, return_url: returnUrl, type: 'account_onboarding' },
      });
    },
    createLoginLink(accountId) {
      return request('POST', `/accounts/${encodeURIComponent(accountId)}/login_links`, { params: {} });
    },
    /** Transfers already made for one Order to one store (guards against paying twice). */
    listTransfers({ transferGroup, destination }) {
      const q = new URLSearchParams({ transfer_group: transferGroup, destination, limit: '10' });
      return request('GET', `/transfers?${q}`);
    },
    createTransfer({ amountMinorUnits, destination, transferGroup, sourceTransaction, orderId, partnerId, attempt }) {
      const params = {
        amount: String(amountMinorUnits),
        currency: 'eur',
        destination,
        transfer_group: transferGroup,
        'metadata[order_id]': orderId,
        'metadata[partner_id]': partnerId,
        'metadata[platform]': 'zfashion',
      };
      if (sourceTransaction) params.source_transaction = sourceTransaction;
      return request('POST', '/transfers', { idempotencyKey: `zfashion-transfer-${orderId}-${partnerId}-${attempt}`, params });
    },

    /* ---------- Billing (store subscription, task 9) ---------- */

    /** The store as a Stripe customer of Z Fashion (one per store). */
    createCustomer({ partnerId, email, name }) {
      const params = { 'metadata[partner_id]': partnerId, 'metadata[platform]': 'zfashion', preferred_locales: 'fr' };
      if (email) params.email = email;
      if (name) params.name = name;
      return request('POST', '/customers', { idempotencyKey: `zfashion-customer-${partnerId}`, params });
    },
    listTaxRates() {
      return request('GET', '/tax_rates?active=true&limit=100');
    },
    createTaxRate({ percentage, key }) {
      return request('POST', '/tax_rates', {
        idempotencyKey: `zfashion-taxrate-${key}`,
        params: { display_name: 'TVA', percentage: String(percentage), inclusive: 'false', country: 'FR', jurisdiction: 'FR', description: `TVA ${percentage} %`, 'metadata[zfashion]': key },
      });
    },
    /** Stripe-hosted page where the store sets up its monthly subscription
     *  (payment methods enabled in the Dashboard that support recurring
     *  payments: card and SEPA Direct Debit). */
    createSubscriptionCheckout({ customerId, partnerId, feeMinorUnits, productName, taxRateId, trialEnd, successUrl, cancelUrl, attempt }) {
      const params = {
        mode: 'subscription',
        customer: customerId,
        locale: 'fr',
        success_url: successUrl,
        cancel_url: cancelUrl,
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'eur',
        'line_items[0][price_data][unit_amount]': String(feeMinorUnits),
        'line_items[0][price_data][recurring][interval]': 'month',
        'line_items[0][price_data][tax_behavior]': 'exclusive',
        'line_items[0][price_data][product_data][name]': productName,
        'line_items[0][tax_rates][0]': taxRateId,
        'tax_id_collection[enabled]': 'true',
        'customer_update[name]': 'auto',
        'customer_update[address]': 'auto',
        'billing_address_collection': 'required',
        'subscription_data[metadata][partner_id]': partnerId,
        'subscription_data[metadata][platform]': 'zfashion',
        'metadata[partner_id]': partnerId,
        'metadata[platform]': 'zfashion',
        'metadata[purpose]': 'subscription',
      };
      if (trialEnd) params['subscription_data[trial_end]'] = String(Math.floor(new Date(trialEnd).getTime() / 1000));
      return request('POST', '/checkout/sessions', { idempotencyKey: `zfashion-subscription-${partnerId}-${attempt}`, params });
    },
    retrieveSubscription(subscriptionId) {
      return request('GET', `/subscriptions/${encodeURIComponent(subscriptionId)}`);
    },
    /** Stripe customer portal: payment method, invoices, cancellation. */
    createBillingPortalSession({ customerId, returnUrl }) {
      return request('POST', '/billing_portal/sessions', { params: { customer: customerId, return_url: returnUrl, locale: 'fr' } });
    },

    /** Full refund of a payment that cannot be kept. */
    refundPaymentIntent(paymentIntentId, reasonTag) {
      return request('POST', '/refunds', {
        idempotencyKey: `zfashion-refund-${paymentIntentId}`,
        params: { payment_intent: paymentIntentId, 'metadata[reason]': reasonTag || 'not_kept', 'metadata[platform]': 'zfashion' },
      });
    },
  };
}

/**
 * Verifies a Stripe-Signature header against the raw body and returns
 * the parsed event. Throws StripeError('webhook_signature_invalid') etc.
 */
function verifyWebhook(rawBody, signatureHeader, secret, nowMs = Date.now()) {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) throw new StripeError('webhook_body_missing');
  if (rawBody.length > MAX_WEBHOOK_BODY_BYTES) throw new StripeError('webhook_body_too_large');
  const header = String(signatureHeader || '');
  let timestamp = null;
  const signatures = [];
  for (const part of header.split(',')) {
    const [k, ...rest] = part.split('=');
    const v = rest.join('=').trim();
    if (k.trim() === 't' && /^\d+$/.test(v)) timestamp = Number(v);
    else if (k.trim() === 'v1' && /^[a-f0-9]{64}$/i.test(v)) signatures.push(v.toLowerCase());
  }
  if (timestamp === null || signatures.length === 0) throw new StripeError('webhook_signature_invalid');
  if (Math.abs(Math.floor(nowMs / 1000) - timestamp) > WEBHOOK_TOLERANCE_SECONDS) throw new StripeError('webhook_timestamp_outside_tolerance');
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest();
  const ok = signatures.some((sig) => {
    const given = Buffer.from(sig, 'hex');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
  if (!ok) throw new StripeError('webhook_signature_invalid');
  let event;
  try { event = JSON.parse(rawBody.toString('utf8')); } catch (e) { throw new StripeError('webhook_body_invalid'); }
  if (!event || typeof event.id !== 'string' || !/^evt_[A-Za-z0-9]+$/.test(event.id) || typeof event.type !== 'string') {
    throw new StripeError('webhook_body_invalid');
  }
  return event;
}

/** Builds a valid Stripe-Signature header (tests and local tools). */
function signWebhookPayload(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const sig = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

module.exports = { STRIPE_API_VERSION, StripeError, loadStripeConfig, createStripeClient, verifyWebhook, signWebhookPayload };
