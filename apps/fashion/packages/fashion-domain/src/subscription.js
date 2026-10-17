/* ============================================================
   Z FASHION — STORE SUBSCRIPTION (bounded context: fashion-domain)
   ============================================================
   Task 9. The monthly subscription (commission.js: 39 / 49 / 59 EUR
   excl. VAT by number of categories) is billed by Stripe Billing,
   apart from the payouts (decided 2026-10-15). The store sets it up
   once, on a Stripe-hosted page, by card or SEPA direct debit
   (decided 2026-10-17); Stripe then invoices it every month with VAT
   (20 %) added.

   The first month after the store's activation is free: the Stripe
   subscription starts with a trial that ends one calendar month after
   activation. A store that sets up its payment after that month has
   no trial and is billed from the set-up day.

   Stripe is the source of truth for the subscription's state; this
   module maps it to what the store and the backoffice show.
   ============================================================ */

const { subscriptionFeeMinorUnits } = require('./commission');

const VAT_RATE_PERCENT = 20;
// Stripe refuses a trial ending less than 48 hours away.
const MIN_TRIAL_MS = 48 * 3600 * 1000;

const STATES = Object.freeze(['not_set_up', 'trial', 'active', 'past_due', 'canceled']);

/** One calendar month after activation (same day, clamped to month end). */
function freeMonthEnd(activatedAt) {
  if (!activatedAt) return null;
  const a = new Date(activatedAt);
  if (Number.isNaN(a.getTime())) throw new Error('freeMonthEnd: invalid activation date');
  const y = a.getUTCFullYear(); const m = a.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(a.getUTCDate(), lastDay), a.getUTCHours(), a.getUTCMinutes(), a.getUTCSeconds()));
}

/** Trial end for a subscription set up now, or null when the free month is over. */
function trialEndFor({ activatedAt, now = new Date() }) {
  const end = freeMonthEnd(activatedAt || now);
  return end.getTime() - now.getTime() >= MIN_TRIAL_MS ? end : null;
}

/** Monthly fee, excl. VAT, and the VAT and total Stripe will invoice. */
function monthlyAmounts(categories) {
  const feeMinorUnits = subscriptionFeeMinorUnits(categories);
  const vatMinorUnits = Math.round((feeMinorUnits * VAT_RATE_PERCENT) / 100);
  return Object.freeze({ feeMinorUnits, vatMinorUnits, totalMinorUnits: feeMinorUnits + vatMinorUnits, vatRatePercent: VAT_RATE_PERCENT });
}

/** Stripe subscription status → what Z Fashion shows. */
function stateFromStripeStatus(status) {
  switch (status) {
    case 'trialing': return 'trial';
    case 'active': return 'active';
    case 'past_due':
    case 'unpaid':
    case 'incomplete': return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
    case 'paused': return 'canceled';
    default: return 'not_set_up';
  }
}

/** The columns kept for a store, from a Stripe subscription object. */
function fromStripeSubscription(sub) {
  if (!sub || sub.object !== 'subscription') throw new Error('fromStripeSubscription: not a subscription');
  const item = sub.items && sub.items.data && sub.items.data[0];
  const unit = item && item.price && Number.isInteger(item.price.unit_amount) ? item.price.unit_amount : null;
  const ts = (s) => (Number.isInteger(s) ? new Date(s * 1000).toISOString() : null);
  // Since Stripe API 2025-03, the billing period lives on the item.
  const periodEnd = (item && item.current_period_end) || sub.current_period_end;
  return Object.freeze({
    stripeSubscriptionId: sub.id,
    stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer && sub.customer.id,
    stripeStatus: sub.status,
    state: stateFromStripeStatus(sub.status),
    monthlyFeeMinorUnits: unit,
    trialEndsAt: ts(sub.trial_end),
    currentPeriodEnd: ts(periodEnd),
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    canceledAt: ts(sub.canceled_at),
  });
}

/** Can the store open the Stripe page to set up its subscription? */
function canSetUp(record) {
  return !record || !record.stripeSubscriptionId || record.state === 'canceled';
}

/**
 * What the store's space shows. `record` is the stored row (or null),
 * `partner` gives the activation date and categories.
 */
function view({ record, activatedAt, categories, now = new Date() }) {
  const amounts = monthlyAmounts(categories);
  const freeUntil = activatedAt ? freeMonthEnd(activatedAt).toISOString() : null;
  const state = record && record.stripeSubscriptionId ? record.state : 'not_set_up';
  return Object.freeze({
    state,
    ...amounts,
    freeUntil,
    freeMonthOver: !!freeUntil && new Date(freeUntil) <= now,
    trialEndsAt: record ? record.trialEndsAt || null : null,
    nextBillingAt: record && ['trial', 'active', 'past_due'].includes(state) ? (state === 'trial' ? record.trialEndsAt : record.currentPeriodEnd) || null : null,
    cancelAtPeriodEnd: !!(record && record.cancelAtPeriodEnd),
    pastDueSince: record ? record.pastDueSince || null : null,
    canSetUp: canSetUp(record),
    canManage: !!(record && record.stripeCustomerId),
  });
}

module.exports = { VAT_RATE_PERCENT, STATES, freeMonthEnd, trialEndFor, monthlyAmounts, stateFromStripeStatus, fromStripeSubscription, canSetUp, view };
