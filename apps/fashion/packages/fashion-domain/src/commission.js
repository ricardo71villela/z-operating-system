/* ============================================================
   Z FASHION — PARTNER PRICING (bounded context: fashion-domain)
   ============================================================
   Pricing decided by Ricardo on 2026-10-14 (replaces the earlier
   category-rate / volume-discount / quality-score model):

   1. Monthly subscription, excluding VAT (HT), by how many product
      categories the store sells (partner.js CATEGORIES):
        1 category            → EUR 39
        2 categories          → EUR 49
        3 or more categories  → EUR 59
      The first month as an active Partner is free; the fee applies
      from month 2, whatever the sales. It is access to the platform,
      not a performance fee.

   2. Commission per ticket — the part of a customer order that
      belongs to this store, at the price the customer pays for that
      store's items. The whole ticket takes one rate:
        up to EUR 100.00          → 10 %
        EUR 100.01 to EUR 200.00  → 8 %
        above EUR 200.00          → 6 %
      Commission applies from the first sale (also in the free month).
      It no longer depends on the category, and there is no
      quality-score or monthly-volume discount.

   Mirrored in SQL by migration 20261015000000_z_fashion_pricing_v2.sql
   (fashion.subscription_fee_tiers, fashion.ticket_commission_tiers and
   their functions); tests check both use the same numbers.
   ============================================================ */

const { CATEGORIES } = require('./partner');

/** Highest matching minCategories wins. Minor units = euro cents, HT. */
const SUBSCRIPTION_TIERS = Object.freeze([
  Object.freeze({ minCategories: 1, monthlyFeeMinorUnits: 3900 }),
  Object.freeze({ minCategories: 2, monthlyFeeMinorUnits: 4900 }),
  Object.freeze({ minCategories: 3, monthlyFeeMinorUnits: 5900 }),
]);

/** First tier whose maxTicketMinorUnits is >= the ticket (null = no limit). */
const TICKET_COMMISSION_TIERS = Object.freeze([
  Object.freeze({ maxTicketMinorUnits: 10000, ratePercent: 10 }),
  Object.freeze({ maxTicketMinorUnits: 20000, ratePercent: 8 }),
  Object.freeze({ maxTicketMinorUnits: null, ratePercent: 6 }),
]);

const PRICES_EXCLUDE_VAT = true;
const FIRST_MONTH_FREE = true;

function distinctKnownCategories(categories) {
  if (!Array.isArray(categories)) throw new Error('categories must be an array');
  const unknown = categories.filter((c) => !CATEGORIES.includes(c));
  if (unknown.length > 0) throw new Error(`unknown categories: ${unknown.join(', ')}`);
  return [...new Set(categories)];
}

/** Monthly subscription (HT, minor units) for a store selling these categories. */
function subscriptionFeeMinorUnits(categories) {
  const count = distinctKnownCategories(categories).length;
  if (count === 0) throw new Error('subscriptionFeeMinorUnits: a store sells at least one category');
  let fee = null;
  for (const tier of SUBSCRIPTION_TIERS) if (count >= tier.minCategories) fee = tier.monthlyFeeMinorUnits;
  return fee;
}

/**
 * @param {number} monthsSincePartnerActivated 1 for the first calendar
 *   month as 'active' (onboarding.js), 2 for the second, etc.
 * @param {string[]} categories the store's categories
 */
function subscriptionFeeOwedMinorUnits(monthsSincePartnerActivated, categories) {
  if (!Number.isInteger(monthsSincePartnerActivated) || monthsSincePartnerActivated < 1) {
    throw new Error('subscriptionFeeOwedMinorUnits: monthsSincePartnerActivated must be an integer >= 1');
  }
  const fee = subscriptionFeeMinorUnits(categories);
  return FIRST_MONTH_FREE && monthsSincePartnerActivated === 1 ? 0 : fee;
}

/** Commission rate (percent) for one ticket amount in minor units. */
function ticketCommissionRatePercent(ticketMinorUnits) {
  if (!Number.isInteger(ticketMinorUnits) || ticketMinorUnits < 0) {
    throw new Error('ticketCommissionRatePercent: ticketMinorUnits must be a non-negative integer');
  }
  const tier = TICKET_COMMISSION_TIERS.find((t) => t.maxTicketMinorUnits === null || ticketMinorUnits <= t.maxTicketMinorUnits);
  return tier.ratePercent;
}

/** Floors, never rounds up past what the rate implies. */
function commissionOwedMinorUnits(saleAmountMinorUnits, ratePercent) {
  if (!Number.isInteger(saleAmountMinorUnits) || saleAmountMinorUnits < 0) {
    throw new Error('commissionOwedMinorUnits: saleAmountMinorUnits must be a non-negative integer');
  }
  if (!Number.isInteger(ratePercent) || ratePercent < 0 || ratePercent > 100) {
    throw new Error('commissionOwedMinorUnits: ratePercent must be an integer between 0 and 100');
  }
  return Math.floor((saleAmountMinorUnits * ratePercent) / 100);
}

/** Commission owed on one ticket, rate chosen by the ticket's amount. */
function ticketCommissionOwedMinorUnits(ticketMinorUnits) {
  return commissionOwedMinorUnits(ticketMinorUnits, ticketCommissionRatePercent(ticketMinorUnits));
}

module.exports = {
  SUBSCRIPTION_TIERS,
  TICKET_COMMISSION_TIERS,
  PRICES_EXCLUDE_VAT,
  FIRST_MONTH_FREE,
  subscriptionFeeMinorUnits,
  subscriptionFeeOwedMinorUnits,
  ticketCommissionRatePercent,
  commissionOwedMinorUnits,
  ticketCommissionOwedMinorUnits,
};
