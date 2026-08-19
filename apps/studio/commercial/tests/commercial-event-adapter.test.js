import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  adaptAppleCurrentStateToCommercialEvent,
  buildAppleCurrentStateWriterArgs,
  buildVerifiedCommercialWriterArgs,
} from '../lib/commercial-event-adapter.js';

const personId = 'a1111111-b222-c333-d444-e55555555555';
const productId =
  'com.zoperatingsystem.zstudio.subscription.monthly';
const originalTransactionId = '2000000000000000';
const renewalTransactionId = '2000000000000005';

function snapshot(overrides = {}) {
  return {
    verification: 'verified_current_state',
    billingSource: 'apple_app_store',
    billingEnvironment: 'sandbox',
    sourceEventRef: `app:${'a'.repeat(64)}`,
    sourceSubscriptionRef: originalTransactionId,
    sourceProductRef: productId,
    personId,
    planCode: 'monthly',
    normalizedStatus: 'active',
    appleStatus: 1,
    appleRevokedEquivalent: false,
    cancelAtPeriodEnd: false,
    subscriptionGroupIdentifier: '12345678',
    effectiveAtMs: 1789761800000,
    trialStartedAtMs: null,
    trialEndsAtMs: null,
    currentPeriodStartMs: 1789761600000,
    currentPeriodEndMs: 1792440000000,
    transactionId: renewalTransactionId,
    originalTransactionId,
    currentProductId: productId,
    autoRenewProductId: productId,
    rawJwsIncluded: false,
    ...overrides,
  };
}

test('provider-neutral builder exposes exactly the SQL writer argument contract', () => {
  const args = buildVerifiedCommercialWriterArgs({
    personId,
    billingSource: 'apple_app_store',
    billingEnvironment: 'sandbox',
    sourceEventRef: 'event-1',
    sourceSubscriptionRef: 'sub-1',
    sourceProductRef: productId,
    eventType: 'renewed',
    planCode: 'monthly',
    status: 'active',
    trialStartedAtMs: null,
    trialEndsAtMs: null,
    currentPeriodStartMs: 1789761600000,
    currentPeriodEndMs: 1792440000000,
    cancelAtPeriodEnd: false,
    effectiveAtMs: 1789761800000,
  });

  assert.deepEqual(Object.keys(args), [
    'p_person_id',
    'p_billing_source',
    'p_billing_environment',
    'p_source_event_ref',
    'p_source_subscription_ref',
    'p_source_product_ref',
    'p_event_type',
    'p_plan_code',
    'p_status',
    'p_trial_started_at',
    'p_trial_ends_at',
    'p_current_period_start',
    'p_current_period_end',
    'p_cancel_at_period_end',
    'p_effective_at',
  ]);

  assert.equal(args.p_current_period_start, '2026-09-18T20:00:00.000Z');
  assert.equal(args.p_current_period_end, '2026-10-19T20:00:00.000Z');
  assert.equal(args.p_effective_at, '2026-09-18T20:03:20.000Z');
});

test('adapter contract remains bound to exact SQL function signature without mutating SQL', () => {
  const migration = fs.readFileSync(
    new URL(
      '../../../../infrastructure/supabase/migrations/'
        + '20260819130000_zstudio_commercial_activation_authority_v1.sql',
      import.meta.url,
    ),
    'utf8',
  );

  const signature = migration.match(
    /create function public\.zstudio_apply_verified_commercial_event\(([\s\S]*?)\)\s*returns jsonb/i,
  );
  assert.ok(signature);

  const sqlArgs = [...signature[1].matchAll(/^\s*(p_[a-z_]+)\s+/gm)]
    .map((match) => match[1]);

  const writerArgs = Object.keys(buildAppleCurrentStateWriterArgs(snapshot()));
  assert.deepEqual(writerArgs, sqlArgs);
  assert.equal(sqlArgs.length, 15);
});

test('initial active Apple purchase maps to activated while later transaction maps to renewed', () => {
  const initial = adaptAppleCurrentStateToCommercialEvent(snapshot({
    transactionId: originalTransactionId,
  }));
  assert.equal(initial.eventType, 'activated');

  const renewal = adaptAppleCurrentStateToCommercialEvent(snapshot());
  assert.equal(renewal.eventType, 'renewed');
});

test('trial, grace, retry, expiration and renewal-disabled states map to writer semantics', () => {
  const trial = adaptAppleCurrentStateToCommercialEvent(snapshot({
    normalizedStatus: 'trialing',
    transactionId: originalTransactionId,
    trialStartedAtMs: 1787169500000,
    trialEndsAtMs: 1787428700000,
    currentPeriodStartMs: null,
    currentPeriodEndMs: null,
  }));
  assert.equal(trial.eventType, 'trial_started');

  const grace = adaptAppleCurrentStateToCommercialEvent(snapshot({
    normalizedStatus: 'grace',
    appleStatus: 4,
    currentPeriodEndMs: 1792526400000,
  }));
  assert.equal(grace.eventType, 'grace_started');

  const retry = adaptAppleCurrentStateToCommercialEvent(snapshot({
    normalizedStatus: 'past_due',
    appleStatus: 3,
    currentPeriodStartMs: null,
    currentPeriodEndMs: null,
  }));
  assert.equal(retry.eventType, 'past_due');

  const expired = adaptAppleCurrentStateToCommercialEvent(snapshot({
    normalizedStatus: 'expired',
    appleStatus: 2,
    currentPeriodStartMs: null,
    currentPeriodEndMs: null,
  }));
  assert.equal(expired.eventType, 'expired');

  const cancelledRenewal = adaptAppleCurrentStateToCommercialEvent(snapshot({
    cancelAtPeriodEnd: true,
  }));
  assert.equal(cancelledRenewal.eventType, 'renewal_disabled');

  const graceCancelledRenewal = adaptAppleCurrentStateToCommercialEvent(snapshot({
    normalizedStatus: 'grace',
    appleStatus: 4,
    cancelAtPeriodEnd: true,
    currentPeriodEndMs: 1792526400000,
  }));
  assert.equal(graceCancelledRenewal.eventType, 'renewal_disabled');
});

test('Apple reversible revoke remains expired and can never become terminal provider-neutral revoked', () => {
  const revokedApple = adaptAppleCurrentStateToCommercialEvent(snapshot({
    normalizedStatus: 'expired',
    appleStatus: 5,
    appleRevokedEquivalent: true,
    currentPeriodStartMs: null,
    currentPeriodEndMs: null,
  }));

  assert.equal(revokedApple.eventType, 'expired');
  assert.equal(revokedApple.status, 'expired');
  assert.notEqual(revokedApple.status, 'revoked');

  assert.throws(
    () => adaptAppleCurrentStateToCommercialEvent(snapshot({
      normalizedStatus: 'revoked',
      appleStatus: 5,
      appleRevokedEquivalent: true,
      currentPeriodStartMs: null,
      currentPeriodEndMs: null,
    })),
    /APPLE_COMMERCIAL_REVOCATION_MAPPING_INVALID|APPLE_COMMERCIAL_TERMINAL_REVOKED_FORBIDDEN/,
  );
});

test('verified future triggers may explicitly select recovered or restored only for compatible current state', () => {
  assert.equal(
    adaptAppleCurrentStateToCommercialEvent(
      snapshot(),
      { eventTypeHint: 'recovered' },
    ).eventType,
    'recovered',
  );

  assert.equal(
    adaptAppleCurrentStateToCommercialEvent(
      snapshot(),
      { eventTypeHint: 'restored' },
    ).eventType,
    'restored',
  );

  const restoredTrial = adaptAppleCurrentStateToCommercialEvent(
    snapshot({
      normalizedStatus: 'trialing',
      transactionId: originalTransactionId,
      trialStartedAtMs: 1787169500000,
      trialEndsAtMs: 1787428700000,
      currentPeriodStartMs: null,
      currentPeriodEndMs: null,
    }),
    { eventTypeHint: 'restored' },
  );
  assert.equal(restoredTrial.eventType, 'restored');
  assert.equal(restoredTrial.status, 'trialing');

  assert.throws(
    () => adaptAppleCurrentStateToCommercialEvent(
      snapshot({
        normalizedStatus: 'expired',
        currentPeriodStartMs: null,
        currentPeriodEndMs: null,
      }),
      { eventTypeHint: 'restored' },
    ),
    /APPLE_COMMERCIAL_EVENT_HINT_INVALID/,
  );
});

test('writer adapter fails closed on unverified evidence, identity drift, reference drift and invalid windows', () => {
  const invalidCases = [
    [
      { verification: 'verified' },
      /APPLE_VERIFIED_CURRENT_STATE_REQUIRED/,
    ],
    [
      { rawJwsIncluded: true },
      /APPLE_VERIFIED_CURRENT_STATE_REQUIRED/,
    ],
    [
      { billingSource: 'google_play' },
      /APPLE_COMMERCIAL_BILLING_SOURCE_INVALID/,
    ],
    [
      { sourceSubscriptionRef: '2000000000000099' },
      /APPLE_COMMERCIAL_SUBSCRIPTION_REF_MISMATCH/,
    ],
    [
      { sourceProductRef: 'com.example.other' },
      /APPLE_COMMERCIAL_PRODUCT_REF_MISMATCH/,
    ],
  ];

  for (const [patch, expected] of invalidCases) {
    assert.throws(
      () => buildAppleCurrentStateWriterArgs(snapshot(patch)),
      expected,
    );
  }

  assert.throws(
    () => buildVerifiedCommercialWriterArgs({
      personId: 'not-a-uuid',
      billingSource: 'apple_app_store',
      billingEnvironment: 'sandbox',
      sourceEventRef: 'event',
      sourceSubscriptionRef: 'sub',
      sourceProductRef: productId,
      eventType: 'renewed',
      planCode: 'monthly',
      status: 'active',
      trialStartedAtMs: null,
      trialEndsAtMs: null,
      currentPeriodStartMs: 10,
      currentPeriodEndMs: 20,
      cancelAtPeriodEnd: false,
      effectiveAtMs: 20,
    }),
    /COMMERCIAL_ADAPTER_PERSON_ID_INVALID/,
  );

  assert.throws(
    () => buildVerifiedCommercialWriterArgs({
      personId,
      billingSource: 'apple_app_store',
      billingEnvironment: 'sandbox',
      sourceEventRef: 'event',
      sourceSubscriptionRef: 'sub',
      sourceProductRef: productId,
      eventType: 'renewed',
      planCode: 'monthly',
      status: 'active',
      trialStartedAtMs: null,
      trialEndsAtMs: null,
      currentPeriodStartMs: 20,
      currentPeriodEndMs: 10,
      cancelAtPeriodEnd: false,
      effectiveAtMs: 20,
    }),
    /COMMERCIAL_ADAPTER_PERIOD_WINDOW_INVALID/,
  );
});

test('writer args contain normalized state only and never raw Apple JWS fields', () => {
  const args = buildAppleCurrentStateWriterArgs(snapshot());
  const serialized = JSON.stringify(args);

  assert.equal('signedTransactionInfo' in args, false);
  assert.equal('signedRenewalInfo' in args, false);
  assert.equal('jwsRepresentation' in args, false);
  assert.equal(serialized.includes('current-transaction-jws'), false);
  assert.equal(serialized.includes('current-renewal-jws'), false);
});
