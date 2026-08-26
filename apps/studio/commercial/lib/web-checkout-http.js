import { randomUUID } from 'node:crypto';
import { WebCheckoutPreflightRpcError } from './web-checkout-preflight-client.js';
import { StripeWebApiError } from './stripe-web-api.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_ALLOWED_ORIGINS = new Set([
  'https://localhost',
  'https://zstudio.space',
  'https://www.zstudio.space',
]);

export class WebCheckoutAuthBoundaryError extends Error {
  constructor(code, { invalid = false, cause } = {}) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = 'WebCheckoutAuthBoundaryError';
    this.code = code;
    this.invalid = invalid;
  }
}

function bearerToken(req) {
  const raw = String(req?.headers?.authorization ?? req?.headers?.Authorization ?? '').trim();
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function parseBody(req) {
  if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8'));
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body;
}

function planFromBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('WEB_CHECKOUT_REQUEST_INVALID');
  }
  if (Object.keys(body).sort().join('\n') !== 'plan_code') {
    throw new Error('WEB_CHECKOUT_REQUEST_INVALID');
  }
  const planCode = String(body.plan_code ?? '').trim().toLowerCase();
  if (!['weekly', 'monthly', 'annual'].includes(planCode)) {
    throw new Error('WEB_CHECKOUT_PLAN_INVALID');
  }
  return planCode;
}

function cors(origin, allowedOrigins) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
  if (origin && allowedOrigins.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function sendJson(res, status, payload, origin, allowedOrigins, extra = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...cors(origin, allowedOrigins),
    ...extra,
  });
  res.end(JSON.stringify(payload));
}

export async function validateWebSupabaseBearerAndResolvePerson(
  config,
  token,
  { fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {},
) {
  const url = String(config?.supabaseUrl ?? '').trim().replace(/\/+$/, '');
  const publishableKey = String(config?.supabasePublishableKey ?? '').trim();
  if (!/^https:\/\//i.test(url) || !publishableKey || !token) {
    throw new WebCheckoutAuthBoundaryError('WEB_AUTH_CONFIG_INVALID');
  }

  const call = async (endpoint, options) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(endpoint, { ...options, signal: controller.signal });
    } catch (cause) {
      throw new WebCheckoutAuthBoundaryError('WEB_AUTH_UNAVAILABLE', { cause });
    } finally {
      clearTimeout(timer);
    }
  };

  const headers = {
    apikey: publishableKey,
    Authorization: `Bearer ${token}`,
  };

  const user = await call(`${url}/auth/v1/user`, {
    method: 'GET',
    headers,
  });
  if (!user.ok) {
    if (user.status === 401 || user.status === 403) {
      throw new WebCheckoutAuthBoundaryError('WEB_AUTH_INVALID', { invalid: true });
    }
    throw new WebCheckoutAuthBoundaryError('WEB_AUTH_UNAVAILABLE');
  }

  const account = await call(`${url}/rest/v1/rpc/zstudio_ensure_account`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!account.ok) {
    if (account.status === 401 || account.status === 403) {
      throw new WebCheckoutAuthBoundaryError('WEB_AUTH_INVALID', { invalid: true });
    }
    throw new WebCheckoutAuthBoundaryError('WEB_ACCOUNT_UNAVAILABLE');
  }

  let personId;
  try {
    personId = await account.json();
  } catch (cause) {
    throw new WebCheckoutAuthBoundaryError('WEB_ACCOUNT_RESPONSE_INVALID', { cause });
  }
  if (typeof personId !== 'string' || !UUID_PATTERN.test(personId)) {
    throw new WebCheckoutAuthBoundaryError('WEB_ACCOUNT_RESPONSE_INVALID');
  }
  return personId.toLowerCase();
}

function preflightHttpStatus(error) {
  if (!(error instanceof WebCheckoutPreflightRpcError)) return 502;
  if (error.retryable) return 503;
  if (error.databaseCode) return 409;
  return 502;
}

function stripeHttpStatus(error) {
  if (!(error instanceof StripeWebApiError)) return 502;
  return error.retryable ? 503 : 502;
}

function validRecoveredSession(session, preflight) {
  return session
    && session.status === 'open'
    && session.clientReferenceId === preflight.intentId
    && session.customer === preflight.sourceCustomerRef;
}

export function createWebCheckoutHttpHandler({
  loadConfig,
  resolvePerson = validateWebSupabaseBearerAndResolvePerson,
  createPreflightClient,
  createStripeClient,
  resolvePlan,
  allowedOrigins = DEFAULT_ALLOWED_ORIGINS,
} = {}) {
  if (
    typeof loadConfig !== 'function'
    || typeof resolvePerson !== 'function'
    || typeof createPreflightClient !== 'function'
    || typeof createStripeClient !== 'function'
    || typeof resolvePlan !== 'function'
  ) {
    throw new Error('WEB_CHECKOUT_HANDLER_DEPENDENCIES_INVALID');
  }

  return async function handler(req, res) {
    const requestId = randomUUID();
    const origin = String(req?.headers?.origin ?? '');
    const origins = allowedOrigins instanceof Set
      ? allowedOrigins
      : new Set(allowedOrigins ?? []);

    if (origin && !origins.has(origin)) {
      sendJson(res, 403, { code: 'ORIGIN_DENIED', request_id: requestId }, origin, origins);
      return;
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors(origin, origins));
      res.end();
      return;
    }
    if (req.method !== 'POST') {
      sendJson(
        res,
        405,
        { code: 'METHOD_NOT_ALLOWED', request_id: requestId },
        origin,
        origins,
        { Allow: 'POST, OPTIONS' },
      );
      return;
    }

    const token = bearerToken(req);
    if (!token) {
      sendJson(
        res,
        401,
        { code: 'AUTH_REQUIRED', request_id: requestId },
        origin,
        origins,
        { 'WWW-Authenticate': 'Bearer' },
      );
      return;
    }

    let planCode;
    try {
      planCode = planFromBody(parseBody(req));
    } catch (error) {
      sendJson(res, 400, { code: error.message, request_id: requestId }, origin, origins);
      return;
    }

    let config;
    try {
      config = loadConfig();
    } catch {
      sendJson(
        res,
        500,
        { code: 'COMMERCIAL_CONFIG_UNAVAILABLE', request_id: requestId },
        origin,
        origins,
      );
      return;
    }

    let personId;
    try {
      personId = await resolvePerson(config, token);
    } catch (error) {
      if (error instanceof WebCheckoutAuthBoundaryError && error.invalid) {
        sendJson(
          res,
          401,
          { code: 'AUTH_INVALID', request_id: requestId },
          origin,
          origins,
          { 'WWW-Authenticate': 'Bearer' },
        );
        return;
      }
      sendJson(
        res,
        503,
        { code: 'AUTH_UNAVAILABLE', request_id: requestId },
        origin,
        origins,
      );
      return;
    }

    let plan;
    try {
      plan = resolvePlan(planCode);
    } catch {
      sendJson(
        res,
        400,
        { code: 'WEB_CHECKOUT_PLAN_INVALID', request_id: requestId },
        origin,
        origins,
      );
      return;
    }

    const preflightClient = createPreflightClient(config);
    const stripeClient = createStripeClient(config);

    let preflight;
    try {
      preflight = await preflightClient.prepareWebCheckout({
        personId,
        planCode: plan.planCode,
        billingEnvironment: config.environment,
      });
    } catch (error) {
      const status = preflightHttpStatus(error);
      sendJson(
        res,
        status,
        {
          code:
            status === 409
              ? 'WEB_CHECKOUT_CONFLICT'
              : status === 503
                ? 'WEB_CHECKOUT_PREFLIGHT_UNAVAILABLE'
                : 'WEB_CHECKOUT_PREFLIGHT_FAILED',
          request_id: requestId,
        },
        origin,
        origins,
        status === 503 ? { 'Retry-After': '5' } : {},
      );
      return;
    }

    if (preflight.planCode !== plan.planCode || preflight.billingEnvironment !== config.environment) {
      sendJson(
        res,
        502,
        { code: 'WEB_CHECKOUT_PREFLIGHT_MISMATCH', request_id: requestId },
        origin,
        origins,
      );
      return;
    }

    let customerRef = preflight.sourceCustomerRef;

    if (preflight.sourceCheckoutSessionRef) {
      if (!customerRef) {
        sendJson(
          res,
          502,
          { code: 'WEB_CHECKOUT_PREFLIGHT_MISMATCH', request_id: requestId },
          origin,
          origins,
        );
        return;
      }
      let recovered;
      try {
        recovered = await stripeClient.retrieveCheckoutSession(
          preflight.sourceCheckoutSessionRef,
        );
      } catch (error) {
        const status = stripeHttpStatus(error);
        sendJson(
          res,
          status,
          {
            code:
              status === 503
                ? 'STRIPE_CHECKOUT_UNAVAILABLE'
                : 'STRIPE_CHECKOUT_RETRIEVE_FAILED',
            request_id: requestId,
          },
          origin,
          origins,
          status === 503 ? { 'Retry-After': '5' } : {},
        );
        return;
      }
      if (!validRecoveredSession(recovered, preflight)) {
        sendJson(
          res,
          409,
          { code: 'WEB_CHECKOUT_RECONCILIATION_REQUIRED', request_id: requestId },
          origin,
          origins,
        );
        return;
      }
      sendJson(res, 200, {
        ok: true,
        checkout_url: recovered.url,
        intent_id: preflight.intentId,
        plan_code: preflight.planCode,
        trial_eligible: preflight.trialEligible,
        expires_at: recovered.expiresAt,
        commercial_state: 'pending_provider_checkout',
        request_id: requestId,
      }, origin, origins);
      return;
    }

    if (!customerRef) {
      let createdCustomer;
      try {
        createdCustomer = await stripeClient.createCustomer({
          personId,
          bindingId: preflight.bindingId,
        });
      } catch (error) {
        if (error instanceof StripeWebApiError && !error.retryable) {
          try {
            await preflightClient.closeCheckoutIntent({
              intentId: preflight.intentId,
              personId,
              billingEnvironment: config.environment,
              finalState: 'failed',
            });
          } catch {
            // The reservation remains fail-safe and self-expiring.
          }
        }
        const status = stripeHttpStatus(error);
        sendJson(
          res,
          status,
          {
            code:
              status === 503
                ? 'STRIPE_CUSTOMER_UNAVAILABLE'
                : 'STRIPE_CUSTOMER_CREATE_FAILED',
            request_id: requestId,
          },
          origin,
          origins,
          status === 503 ? { 'Retry-After': '5' } : {},
        );
        return;
      }

      try {
        const bound = await preflightClient.bindStripeCustomer({
          bindingId: preflight.bindingId,
          personId,
          billingEnvironment: config.environment,
          sourceCustomerRef: createdCustomer.id,
        });
        customerRef = bound.sourceCustomerRef;
      } catch (error) {
        const status = preflightHttpStatus(error);
        sendJson(
          res,
          status,
          {
            code:
              status === 409
                ? 'WEB_CUSTOMER_BIND_CONFLICT'
                : status === 503
                  ? 'WEB_CUSTOMER_BIND_UNAVAILABLE'
                  : 'WEB_CUSTOMER_BIND_FAILED',
            request_id: requestId,
          },
          origin,
          origins,
          status === 503 ? { 'Retry-After': '5' } : {},
        );
        return;
      }
    }

    let session;
    try {
      session = await stripeClient.createCheckoutSession({
        personId,
        intentId: preflight.intentId,
        planCode: plan.planCode,
        priceId: config.priceByPlan[plan.planCode],
        customerId: customerRef,
        trialEligible: preflight.trialEligible,
        trialDays: plan.trialDays,
      });
    } catch (error) {
      if (error instanceof StripeWebApiError && !error.retryable) {
        try {
          await preflightClient.closeCheckoutIntent({
            intentId: preflight.intentId,
            personId,
            billingEnvironment: config.environment,
            finalState: 'failed',
          });
        } catch {
          // The reservation remains fail-safe and self-expiring.
        }
      }
      const status = stripeHttpStatus(error);
      sendJson(
        res,
        status,
        {
          code:
            status === 503
              ? 'STRIPE_CHECKOUT_UNAVAILABLE'
              : 'STRIPE_CHECKOUT_CREATE_FAILED',
          request_id: requestId,
        },
        origin,
        origins,
        status === 503 ? { 'Retry-After': '5' } : {},
      );
      return;
    }

    try {
      await preflightClient.bindCheckoutSession({
        intentId: preflight.intentId,
        personId,
        billingEnvironment: config.environment,
        sourceCheckoutSessionRef: session.id,
        providerExpiresAt: session.expiresAt,
      });
    } catch (error) {
      // Do not close the intent: a provider Session exists and must be
      // recovered through the deterministic Stripe idempotency key.
      const status = preflightHttpStatus(error);
      sendJson(
        res,
        status === 409 ? 409 : 503,
        {
          code:
            status === 409
              ? 'WEB_CHECKOUT_SESSION_BIND_CONFLICT'
              : 'WEB_CHECKOUT_SESSION_BIND_UNAVAILABLE',
          request_id: requestId,
        },
        origin,
        origins,
        status === 409 ? {} : { 'Retry-After': '5' },
      );
      return;
    }

    sendJson(res, 200, {
      ok: true,
      checkout_url: session.url,
      intent_id: preflight.intentId,
      plan_code: preflight.planCode,
      trial_eligible: preflight.trialEligible,
      expires_at: session.expiresAt,
      commercial_state: 'pending_provider_checkout',
      request_id: requestId,
    }, origin, origins);
  };
}
