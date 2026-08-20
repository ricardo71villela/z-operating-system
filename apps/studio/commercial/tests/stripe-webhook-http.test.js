import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStripeWebhookHttpHandler,
  readStripeWebhookRawBody,
  StripeWebhookHttpError,
} from '../lib/stripe-webhook-http.js';
import { StripeWebhookVerificationError } from '../lib/stripe-webhook-signature.js';

function responseRecorder() {
  return {
    status: null,
    headers: null,
    body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(value = '') { this.body = value; },
  };
}

function handler(overrides = {}) {
  const calls = [];
  const h = createStripeWebhookHttpHandler({
    loadConfig: () => ({ environment: 'sandbox' }),
    verifyTrigger: (body, signature) => {
      calls.push(['verify', body.toString(), signature]);
      return {
        verification: 'verified_stripe_webhook_trigger',
        eventId: 'evt_abc', eventType: 'customer.created', createdMs: 1,
        billingEnvironment: 'sandbox', dataObject: {}, rawPayloadIncluded: false,
      };
    },
    reconcileTrigger: async (_trigger, _config, deps) => {
      calls.push(['reconcile', Object.keys(deps).sort()]);
      return { result: 'ignored_event_type', commercialWrite: false };
    },
    createStripeClient: () => ({}),
    createIdentityClient: () => ({}),
    createWriterClient: () => ({}),
    createPreflightClient: () => ({}),
    resolvePlan: () => ({}),
    buildWriterArgs: () => ({}),
    ...overrides,
  });
  return { h, calls };
}

test('accepts exact Buffer raw body and returns minimal 200 after verified reconciliation', async () => {
  const { h, calls } = handler();
  const res = responseRecorder();
  await h({
    method: 'POST',
    headers: { 'stripe-signature': 't=1,v1=abc' },
    body: Buffer.from('{"id":"evt_abc"}'),
  }, res);
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.body).received, true);
  assert.equal(calls[0][0], 'verify');
  assert.equal(calls[1][0], 'reconcile');
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('rejects already-parsed JSON body instead of reconstructing signed bytes', async () => {
  await assert.rejects(
    () => readStripeWebhookRawBody({ body: { id: 'evt_abc' } }),
    (error) => error instanceof StripeWebhookHttpError
      && error.code === 'STRIPE_WEBHOOK_RAW_BODY_REQUIRED',
  );
});

test('reads a raw request stream with size protection', async () => {
  async function* chunks() {
    yield Buffer.from('{"a":');
    yield Buffer.from('1}');
  }
  const req = chunks();
  req.body = undefined;
  const raw = await readStripeWebhookRawBody(req);
  assert.equal(raw.toString(), '{"a":1}');
});

test('invalid signature stops before any reconciliation', async () => {
  let reconciled = false;
  const { h } = handler({
    verifyTrigger: () => {
      throw new StripeWebhookVerificationError('STRIPE_WEBHOOK_SIGNATURE_MISMATCH');
    },
    reconcileTrigger: async () => { reconciled = true; },
  });
  const res = responseRecorder();
  await h({ method: 'POST', headers: {}, body: Buffer.from('{}') }, res);
  assert.equal(res.status, 400);
  assert.equal(reconciled, false);
});

test('retryable current-state failure returns 503 for Stripe retry', async () => {
  const { h } = handler({
    reconcileTrigger: async () => {
      const error = new Error('provider unavailable');
      error.retryable = true;
      throw error;
    },
  });
  const res = responseRecorder();
  await h({ method: 'POST', headers: {}, body: Buffer.from('{}') }, res);
  assert.equal(res.status, 503);
  assert.equal(res.headers['Retry-After'], '5');
});

test('non-POST is rejected without reading provider body', async () => {
  const { h, calls } = handler();
  const res = responseRecorder();
  await h({ method: 'GET', headers: {} }, res);
  assert.equal(res.status, 405);
  assert.equal(res.headers.Allow, 'POST');
  assert.equal(calls.length, 0);
});
