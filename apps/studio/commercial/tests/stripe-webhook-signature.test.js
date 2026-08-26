import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  verifyStripeWebhookTrigger,
  StripeWebhookVerificationError,
} from '../lib/stripe-webhook-signature.js';

const NOW = 1787263200000;
const SECRET = 'whsec_testsecret123';

function signed(body, timestamp = Math.floor(NOW / 1000)) {
  const raw = Buffer.from(body, 'utf8');
  const digest = createHmac('sha256', SECRET)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`), raw]))
    .digest('hex');
  return { raw, header: `t=${timestamp},v1=${digest}` };
}

function event(overrides = {}) {
  return JSON.stringify({
    id: 'evt_abc123',
    object: 'event',
    type: 'customer.subscription.updated',
    created: Math.floor(NOW / 1000),
    livemode: false,
    data: { object: { id: 'sub_abc123' } },
    ...overrides,
  });
}

test('verifies exact raw bytes before parsing and returns trigger-only evidence', () => {
  const { raw, header } = signed(event());
  const result = verifyStripeWebhookTrigger(
    raw,
    header,
    { environment: 'sandbox', stripeWebhookSecret: SECRET },
    { nowMs: () => NOW },
  );
  assert.equal(result.verification, 'verified_stripe_webhook_trigger');
  assert.equal(result.eventId, 'evt_abc123');
  assert.equal(result.eventType, 'customer.subscription.updated');
  assert.equal(result.billingEnvironment, 'sandbox');
  assert.equal(result.rawPayloadIncluded, false);
  assert.deepEqual(result.dataObject, { id: 'sub_abc123' });
});

test('rejects reserialized bytes even when JSON semantics are unchanged', () => {
  const original = event();
  const { header } = signed(original);
  const changed = Buffer.from(`${original}\n`, 'utf8');
  assert.throws(
    () => verifyStripeWebhookTrigger(
      changed,
      header,
      { environment: 'sandbox', stripeWebhookSecret: SECRET },
      { nowMs: () => NOW },
    ),
    (error) => error instanceof StripeWebhookVerificationError
      && error.code === 'STRIPE_WEBHOOK_SIGNATURE_MISMATCH',
  );
});

test('rejects stale signatures and environment mismatch', () => {
  const old = Math.floor(NOW / 1000) - 301;
  const stale = signed(event(), old);
  assert.throws(
    () => verifyStripeWebhookTrigger(
      stale.raw,
      stale.header,
      { environment: 'sandbox', stripeWebhookSecret: SECRET },
      { nowMs: () => NOW },
    ),
    /STRIPE_WEBHOOK_TIMESTAMP_OUTSIDE_TOLERANCE/,
  );

  const live = signed(event({ livemode: true }));
  assert.throws(
    () => verifyStripeWebhookTrigger(
      live.raw,
      live.header,
      { environment: 'sandbox', stripeWebhookSecret: SECRET },
      { nowMs: () => NOW },
    ),
    /STRIPE_WEBHOOK_EVENT_ENVIRONMENT_MISMATCH/,
  );
});

test('requires a Buffer and never accepts a parsed object as signed authority', () => {
  assert.throws(
    () => verifyStripeWebhookTrigger(
      { id: 'evt_abc123' },
      't=1,v1=deadbeef',
      { environment: 'sandbox', stripeWebhookSecret: SECRET },
    ),
    /STRIPE_WEBHOOK_RAW_BODY_REQUIRED/,
  );
});
