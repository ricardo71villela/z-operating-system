const assert = require('assert');
const s = require('../src/subscription');

// Free month: one calendar month after activation, clamped to month end.
assert.strictEqual(s.freeMonthEnd('2026-10-17T09:30:00Z').toISOString(), '2026-11-17T09:30:00.000Z');
assert.strictEqual(s.freeMonthEnd('2027-01-31T08:00:00Z').toISOString(), '2027-02-28T08:00:00.000Z');
assert.strictEqual(s.freeMonthEnd('2026-12-15T00:00:00Z').toISOString(), '2027-01-15T00:00:00.000Z');
assert.strictEqual(s.freeMonthEnd(null), null);

// Trial: the rest of the free month, or none if less than 48 h remain.
const act = '2026-10-17T09:30:00Z';
assert.strictEqual(s.trialEndFor({ activatedAt: act, now: new Date('2026-10-20T00:00:00Z') }).toISOString(), '2026-11-17T09:30:00.000Z');
assert.strictEqual(s.trialEndFor({ activatedAt: act, now: new Date('2026-11-16T00:00:00Z') }), null, 'less than 48 h left');
assert.strictEqual(s.trialEndFor({ activatedAt: act, now: new Date('2026-12-01T00:00:00Z') }), null, 'free month over');
assert.ok(s.trialEndFor({ activatedAt: null, now: new Date('2026-10-20T00:00:00Z') }), 'no activation date yet: a full month from now');

// Amounts: the commission.js fee plus 20 % VAT.
assert.deepStrictEqual({ ...s.monthlyAmounts(['clothing']) }, { feeMinorUnits: 3900, vatMinorUnits: 780, totalMinorUnits: 4680, vatRatePercent: 20 });
assert.strictEqual(s.monthlyAmounts(['clothing', 'footwear']).totalMinorUnits, 5880);
assert.strictEqual(s.monthlyAmounts(['clothing', 'footwear', 'cosmetics', 'sportswear']).feeMinorUnits, 5900);

// Stripe states.
for (const [stripe, ours] of [['trialing', 'trial'], ['active', 'active'], ['past_due', 'past_due'], ['unpaid', 'past_due'], ['incomplete', 'past_due'],
  ['canceled', 'canceled'], ['incomplete_expired', 'canceled'], ['paused', 'canceled'], ['weird', 'not_set_up']]) {
  assert.strictEqual(s.stateFromStripeStatus(stripe), ours, stripe);
}

// From a Stripe subscription (period on the item, API 2025+).
const sub = { id: 'sub_1', object: 'subscription', customer: 'cus_1', status: 'trialing', trial_end: 1794994200, cancel_at_period_end: false, canceled_at: null,
  items: { data: [{ price: { unit_amount: 4900 }, current_period_end: 1794994200 }] } };
const rec = s.fromStripeSubscription(sub);
assert.strictEqual(rec.state, 'trial');
assert.strictEqual(rec.monthlyFeeMinorUnits, 4900);
assert.strictEqual(rec.stripeCustomerId, 'cus_1');
assert.strictEqual(rec.trialEndsAt, new Date(1794994200 * 1000).toISOString());
assert.strictEqual(rec.currentPeriodEnd, rec.trialEndsAt);
assert.strictEqual(s.fromStripeSubscription({ ...sub, customer: { id: 'cus_2' }, items: { data: [] }, current_period_end: 1794994200 }).currentPeriodEnd, rec.trialEndsAt, 'older API: period on the subscription');
assert.throws(() => s.fromStripeSubscription({ object: 'invoice' }));

// What the store sees.
const now = new Date('2026-10-20T00:00:00Z');
let v = s.view({ record: null, activatedAt: act, categories: ['clothing'], now });
assert.strictEqual(v.state, 'not_set_up');
assert.strictEqual(v.canSetUp, true);
assert.strictEqual(v.canManage, false);
assert.strictEqual(v.freeUntil, '2026-11-17T09:30:00.000Z');
assert.strictEqual(v.freeMonthOver, false);
v = s.view({ record: { ...rec, pastDueSince: null }, activatedAt: act, categories: ['clothing'], now });
assert.strictEqual(v.state, 'trial');
assert.strictEqual(v.nextBillingAt, rec.trialEndsAt);
assert.strictEqual(v.canSetUp, false);
assert.strictEqual(v.canManage, true);
v = s.view({ record: { ...rec, state: 'canceled' }, activatedAt: act, categories: ['clothing'], now: new Date('2027-01-01T00:00:00Z') });
assert.strictEqual(v.canSetUp, true, 'a canceled subscription can be set up again');
assert.strictEqual(v.nextBillingAt, null);
assert.strictEqual(v.freeMonthOver, true);

console.log('subscription.js: all invariant checks passed.');
