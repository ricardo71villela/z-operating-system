import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reconcileStripeWebTrigger,
  StripeWebReconciliationError,
} from '../lib/stripe-web-reconciliation.js';

const PERSON = '11111111-1111-4111-8111-111111111111';
const INTENT = '33333333-3333-4333-8333-333333333333';
const SESSION = 'cs_test_abc123';
const CUSTOMER = 'cus_abc123';
const SUB = 'sub_abc123';
const EVENT_MS = 1787263200000;
const TRIAL_START = 1787260000000;
const TRIAL_END = 1787519200000;

const config = {
  environment: 'sandbox',
  priceByPlan: {
    weekly: 'price_weekly123',
    monthly: 'price_monthly123',
    annual: 'price_annual123',
  },
};

function trigger(eventType, dataObject) {
  return {
    verification: 'verified_stripe_webhook_trigger',
    eventId: 'evt_abc123',
    eventType,
    createdMs: EVENT_MS,
    billingEnvironment: 'sandbox',
    dataObject,
    rawPayloadIncluded: false,
  };
}

function identity(overrides = {}) {
  return {
    result: 'resolved',
    personId: PERSON,
    checkoutIntentId: INTENT,
    planCode: 'monthly',
    billingEnvironment: 'sandbox',
    sourceCustomerRef: CUSTOMER,
    sourceCheckoutSessionRef: SESSION,
    trialReserved: true,
    subscriptionAlreadyKnown: false,
    ...overrides,
  };
}

function subscription(overrides = {}) {
  return {
    verification: 'verified_stripe_subscription_current_state',
    id: SUB,
    customerId: CUSTOMER,
    status: 'trialing',
    createdMs: 1787000000000,
    canceledAtMs: null,
    endedAtMs: null,
    cancelAtPeriodEnd: false,
    priceId: 'price_monthly123',
    currency: 'eur',
    recurringInterval: 'month',
    recurringIntervalCount: 1,
    currentPeriodStartMs: null,
    currentPeriodEndMs: null,
    trialStartMs: TRIAL_START,
    trialEndMs: TRIAL_END,
    metadata: {
      zos_person_id: PERSON,
      zstudio_checkout_intent_id: INTENT,
      plan_code: 'monthly',
      billing_environment: 'sandbox',
    },
    rawPayloadIncluded: false,
    ...overrides,
  };
}

function deps({ currentSubscription, session, currentIdentity } = {}) {
  const calls = [];
  const d = {
    calls,
    stripeClient: {
      async retrieveSubscription(id) {
        calls.push(['retrieveSubscription', id]);
        return currentSubscription ?? subscription();
      },
      async retrieveCheckoutSession(id) {
        calls.push(['retrieveCheckoutSession', id]);
        return session;
      },
    },
    identityClient: {
      async resolveSubscription(args) {
        calls.push(['resolveSubscription', args]);
        return currentIdentity ?? identity();
      },
      async resolveCheckoutSession(args) {
        calls.push(['resolveCheckoutSession', args]);
        return currentIdentity ?? identity({ subscriptionAlreadyKnown: undefined });
      },
      async claimVerifiedTrialConsumption(args) {
        calls.push(['claimVerifiedTrialConsumption', args]);
        return { result: 'sandbox_ignored' };
      },
    },
    writerClient: {
      async applyVerifiedCommercialEvent(args) {
        calls.push(['writer', args]);
        return { result: 'applied', subscriptionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
      },
    },
    preflightClient: {
      async closeCheckoutIntent(args) {
        calls.push(['close', args]);
        return { result: 'closed' };
      },
    },
    resolvePlan(planCode) {
      return {
        planCode,
        currency: 'EUR',
        trialDays: 3,
      };
    },
    buildWriterArgs(event) {
      calls.push(['buildWriterArgs', event]);
      return { writer: event };
    },
  };
  return d;
}

test('trialing current state consumes trial before writer and closes only after writer success', async () => {
  const d = deps();
  const result = await reconcileStripeWebTrigger(
    trigger('customer.subscription.created', { id: SUB }),
    config,
    d,
  );
  assert.equal(result.result, 'reconciled');
  assert.deepEqual(d.calls.map(([name]) => name), [
    'retrieveSubscription',
    'resolveSubscription',
    'claimVerifiedTrialConsumption',
    'buildWriterArgs',
    'writer',
    'close',
  ]);
  const claim = d.calls.find(([name]) => name === 'claimVerifiedTrialConsumption')[1];
  assert.equal(claim.effectiveAtMs, TRIAL_START);
  const event = d.calls.find(([name]) => name === 'buildWriterArgs')[1];
  assert.equal(event.billingSource, 'web');
  assert.match(event.sourceEventRef, /^stripe:web:event:evt_abc123:snapshot:[0-9a-f]{32}$/);
  assert.equal(event.sourceSubscriptionRef, 'stripe:web:subscription:sub_abc123');
  assert.equal(event.sourceProductRef, 'stripe:web:price:price_monthly123');
  assert.equal(event.effectiveAtMs, TRIAL_START);
  assert.equal(event.eventType, 'trial_started');
  assert.equal(event.status, 'trialing');
  assert.equal(event.trialStartedAtMs, TRIAL_START);
  assert.equal(event.trialEndsAtMs, TRIAL_END);
});

test('terminal current state with historical trial consumes trial before writing expired', async () => {
  const d = deps({
    currentSubscription: subscription({
      status: 'canceled',
      canceledAtMs: 1787600000000,
      endedAtMs: 1787600000000,
      currentPeriodStartMs: null,
      currentPeriodEndMs: null,
    }),
  });
  await reconcileStripeWebTrigger(
    trigger('customer.subscription.deleted', { id: SUB }),
    config,
    d,
  );
  const names = d.calls.map(([name]) => name);
  assert.ok(names.indexOf('claimVerifiedTrialConsumption') < names.indexOf('writer'));
  const event = d.calls.find(([name]) => name === 'buildWriterArgs')[1];
  assert.equal(event.eventType, 'expired');
  assert.equal(event.status, 'expired');
  assert.equal(event.trialStartedAtMs, TRIAL_START);
  assert.equal(event.trialEndsAtMs, TRIAL_END);
  assert.equal(event.currentPeriodStartMs, null);
  assert.equal(event.effectiveAtMs, 1787600000000);
});

test('checkout.session.expired closes the canonical provider-bound intent with no writer', async () => {
  const session = {
    id: SESSION,
    customerId: CUSTOMER,
    clientReferenceId: INTENT,
    subscriptionId: null,
    status: 'expired',
    metadata: {
      zos_person_id: PERSON,
      zstudio_checkout_intent_id: INTENT,
      plan_code: 'monthly',
      billing_environment: 'sandbox',
    },
  };
  const d = deps({ session });
  const result = await reconcileStripeWebTrigger(
    trigger('checkout.session.expired', { id: SESSION }),
    config,
    d,
  );
  assert.equal(result.result, 'checkout_expired');
  assert.equal(d.calls.some(([name]) => name === 'writer'), false);
  const close = d.calls.find(([name]) => name === 'close')[1];
  assert.equal(close.finalState, 'expired');
});

test('checkout completion re-fetches Session then Subscription rather than trusting webhook data', async () => {
  const session = {
    id: SESSION,
    customerId: CUSTOMER,
    clientReferenceId: INTENT,
    subscriptionId: SUB,
    status: 'complete',
    metadata: {
      zos_person_id: PERSON,
      zstudio_checkout_intent_id: INTENT,
      plan_code: 'monthly',
      billing_environment: 'sandbox',
    },
  };
  const d = deps({ session });
  await reconcileStripeWebTrigger(
    trigger('checkout.session.completed', {
      id: SESSION,
      customer: 'cus_attacker',
      subscription: 'sub_attacker',
    }),
    config,
    d,
  );
  assert.deepEqual(d.calls.slice(0, 3).map(([name]) => name), [
    'retrieveCheckoutSession',
    'resolveCheckoutSession',
    'retrieveSubscription',
  ]);
  assert.equal(d.calls[0][1], SESSION);
  assert.equal(d.calls[2][1], SUB);
});

test('invoice.paid uses modern parent subscription pointer and current item period', async () => {
  const active = subscription({
    status: 'active',
    trialStartMs: TRIAL_START,
    trialEndMs: TRIAL_END,
    currentPeriodStartMs: 1787519200000,
    currentPeriodEndMs: 1790197600000,
  });
  const d = deps({ currentSubscription: active });
  await reconcileStripeWebTrigger(
    trigger('invoice.paid', {
      id: 'in_abc123',
      parent: {
        type: 'subscription_details',
        subscription_details: { subscription: SUB },
      },
    }),
    config,
    d,
  );
  const event = d.calls.find(([name]) => name === 'buildWriterArgs')[1];
  assert.equal(event.eventType, 'renewed');
  assert.equal(event.currentPeriodStartMs, 1787519200000);
  assert.equal(event.currentPeriodEndMs, 1790197600000);
});

test('support-only and unrelated verified events are acknowledged without provider or writer calls', async () => {
  for (const type of ['customer.subscription.trial_will_end', 'customer.created']) {
    const d = deps();
    const result = await reconcileStripeWebTrigger(
      trigger(type, { id: 'obj_abc' }),
      config,
      d,
    );
    assert.equal(result.commercialWrite, false);
    assert.equal(d.calls.length, 0);
  }
});

test('fails closed on exact Price mismatch before trial claim or writer', async () => {
  const d = deps({ currentSubscription: subscription({ priceId: 'price_other123' }) });
  await assert.rejects(
    () => reconcileStripeWebTrigger(
      trigger('customer.subscription.updated', { id: SUB }),
      config,
      d,
    ),
    /STRIPE_WEB_RECONCILIATION_PRICE_MISMATCH/,
  );
  assert.equal(d.calls.some(([name]) => name === 'claimVerifiedTrialConsumption'), false);
  assert.equal(d.calls.some(([name]) => name === 'writer'), false);
});

test('fails closed on unmapped unpaid current state', async () => {
  const d = deps({
    currentSubscription: subscription({
      status: 'unpaid',
      trialStartMs: null,
      trialEndMs: null,
    }),
    currentIdentity: identity({ trialReserved: false }),
  });
  await assert.rejects(
    () => reconcileStripeWebTrigger(
      trigger('invoice.payment_failed', {
        parent: {
          type: 'subscription_details',
          subscription_details: { subscription: SUB },
        },
      }),
      config,
      d,
    ),
    (error) => error instanceof StripeWebReconciliationError
      && error.code === 'STRIPE_WEB_RECONCILIATION_STATUS_UNMAPPED:unpaid',
  );
});

test('uses current provider period as ordering authority instead of webhook delivery time', async () => {
  const periodStart = 1789000000000;
  const d = deps({
    currentSubscription: subscription({
      status: 'active',
      trialStartMs: TRIAL_START,
      trialEndMs: TRIAL_END,
      currentPeriodStartMs: periodStart,
      currentPeriodEndMs: periodStart + 2_592_000_000,
    }),
  });
  await reconcileStripeWebTrigger(
    trigger('customer.subscription.updated', { id: SUB }),
    config,
    d,
  );
  const event = d.calls.find(([name]) => name === 'buildWriterArgs')[1];
  assert.equal(event.effectiveAtMs, periodStart);
  assert.notEqual(event.effectiveAtMs, EVENT_MS);
});

test('same webhook event gets a different deterministic source ref when fresh current state changes', async () => {
  const first = deps({
    currentSubscription: subscription({
      status: 'active',
      trialStartMs: TRIAL_START,
      trialEndMs: TRIAL_END,
      currentPeriodStartMs: 1787519200000,
      currentPeriodEndMs: 1790197600000,
    }),
  });
  await reconcileStripeWebTrigger(
    trigger('customer.subscription.updated', { id: SUB }),
    config,
    first,
  );
  const firstEvent = first.calls.find(([name]) => name === 'buildWriterArgs')[1];

  const second = deps({
    currentSubscription: subscription({
      status: 'past_due',
      trialStartMs: TRIAL_START,
      trialEndMs: TRIAL_END,
      currentPeriodStartMs: 1787519200000,
      currentPeriodEndMs: 1790197600000,
    }),
  });
  await reconcileStripeWebTrigger(
    trigger('customer.subscription.updated', { id: SUB }),
    config,
    second,
  );
  const secondEvent = second.calls.find(([name]) => name === 'buildWriterArgs')[1];

  assert.match(firstEvent.sourceEventRef, /^stripe:web:event:evt_abc123:snapshot:[0-9a-f]{32}$/);
  assert.match(secondEvent.sourceEventRef, /^stripe:web:event:evt_abc123:snapshot:[0-9a-f]{32}$/);
  assert.notEqual(firstEvent.sourceEventRef, secondEvent.sourceEventRef);
  assert.equal(secondEvent.effectiveAtMs, 1787519200000);
  assert.equal(secondEvent.currentPeriodStartMs, 1787519200000);
});

test('corroborates actual checkout metadata keys used by the existing checkout source', async () => {
  const session = {
    id: SESSION,
    customerId: CUSTOMER,
    clientReferenceId: INTENT,
    subscriptionId: null,
    status: 'expired',
    metadata: {
      zos_person_id: PERSON,
      zstudio_checkout_intent_id: INTENT,
      plan_code: 'wrong',
      billing_environment: 'sandbox',
    },
  };
  const d = deps({ session });
  await assert.rejects(
    () => reconcileStripeWebTrigger(
      trigger('checkout.session.expired', { id: SESSION }),
      config,
      d,
    ),
    /STRIPE_WEB_RECONCILIATION_SESSION_METADATA_PLAN_MISMATCH/,
  );
});
