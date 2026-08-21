/* ============================================================
   Z FASHION — COMMISSION (bounded context: fashion-domain)
   ============================================================
   Owns: Partner monetization — the monthly subscription fee and the
   per-sale commission rate. Positioned deliberately below the two
   direct France-market precedents (Miinto ~16-20% + ~EUR98/month;
   Galeries Lafayette ~15% + ~EUR40-49/month — see
   Z-FASHION-COMPETITIVE-LANDSCAPE.md) as a market-entry decision, not
   an accident: first month free, lower category base rates, and a
   volume-progressive discount are the concrete mechanism behind that
   positioning, not just a pricing table someone could quietly drift
   away from.

   Two charges, two different lifecycles:
   - Subscription (monthlySubscriptionFeeMinorUnits): month 1 is
     always free, billed from month 2 onward. Never conditional on
     sales — it is access to the platform, not a performance fee.
   - Commission (commissionRate): applies from day 1, because it is
     charged only on a genuine sale the platform already facilitated
     (checkout, stock reservation) — waiving it in month 1 alongside
     the subscription would mean giving away the one thing that has a
     direct, immediate platform cost per transaction.

   Depends only on the CATEGORIES vocabulary (partner.js) and reads a
   Partner Quality Score as a plain number — never recomputes PQS
   itself (owned by 40-partner-quality-score, reused as-is per
   ZOS-ALIGNMENT.md).
   ============================================================ */

const { CATEGORIES } = require('./partner');

/* Base commission rate, in percentage points, by Category — set below
   both France-market precedents in every category (Z-FASHION-
   COMPETITIVE-LANDSCAPE.md). Sportswear and Cosmetics sit lower than
   Clothing/Footwear/Accessories because their real-world margins are
   thinner (technical-brand pricing discipline; retail price
   competition from Sephora/Douglas-style players) — charging them the
   same rate as Clothing would price out exactly the specialist
   boutiques Z-FASHION-STRATEGY.md's Sportswear positioning depends on. */
const BASE_COMMISSION_RATE_PERCENT = Object.freeze({
  clothing: 13,
  footwear: 13,
  sportswear: 10,
  accessories_leather_goods: 15,
  cosmetics: 11,
});

const MONTHLY_SUBSCRIPTION_FEE_MINOR_UNITS = 3500; // EUR 35.00

/* Volume tiers: monthly GMV thresholds (minor units) -> discount off
   the category base rate, in percentage points. Deliberately a small,
   ordered table — never a formula — so a new tier is a reviewable
   one-line change, same discipline OFFICIAL_SOLDES_WINDOWS applies in
   campaign.js to a different legally/commercially sensitive table. */
const VOLUME_DISCOUNT_TIERS = Object.freeze([
  { minMonthlyGmvMinorUnits: 4000000, discountPercentagePoints: 3 }, // > EUR 40,000
  { minMonthlyGmvMinorUnits: 1500000, discountPercentagePoints: 2 }, // EUR 15,000 - 40,000
  { minMonthlyGmvMinorUnits: 500000, discountPercentagePoints: 1 },  // EUR 5,000 - 15,000
  { minMonthlyGmvMinorUnits: 0, discountPercentagePoints: 0 },       // below EUR 5,000
]);

const DEFAULT_MINIMUM_PQS_FOR_DISCOUNT = 60;
const MAX_PQS_DISCOUNT_PERCENTAGE_POINTS = 2;

/* Ceiling on the combined volume + PQS discount, in percentage points
   off the category base rate. Prevents the two discounts from ever
   stacking the effective rate down to something that can no longer
   sustain the platform — same "never silently" discipline stock.js
   applies to stale updates: a combined discount above this cap is a
   bug to fix, not a number to trust. */
const MAX_COMBINED_DISCOUNT_PERCENTAGE_POINTS = 5;

/**
 * @param {string} category - one of CATEGORIES (partner.js)
 * @returns {number} the base commission rate for that category, in
 *   percentage points (e.g. 13 means 13%)
 */
function baseCommissionRate(category) {
  if (!CATEGORIES.includes(category)) {
    throw new Error(`baseCommissionRate: unknown category "${category}" — must be one of ${CATEGORIES.join(', ')}`);
  }
  return BASE_COMMISSION_RATE_PERCENT[category];
}

/**
 * @param {number} monthlyGmvMinorUnits - the Partner's trailing/current
 *   month sales volume across all Categories, in minor currency units
 * @returns {number} the volume discount, in percentage points
 */
function volumeDiscount(monthlyGmvMinorUnits) {
  if (typeof monthlyGmvMinorUnits !== 'number' || monthlyGmvMinorUnits < 0) {
    throw new Error('volumeDiscount: monthlyGmvMinorUnits must be a non-negative number');
  }
  const tier = VOLUME_DISCOUNT_TIERS.find((t) => monthlyGmvMinorUnits >= t.minMonthlyGmvMinorUnits);
  return tier.discountPercentagePoints;
}

/**
 * @param {number|null|undefined} partnerQualityScore
 * @param {object} [options]
 * @param {number} [options.minimumScore]
 * @returns {number} the PQS discount, in percentage points — 0 if the
 *   Partner has no score yet or is below the minimum, never inferred
 *   or defaulted upward
 */
function qualityScoreDiscount(partnerQualityScore, { minimumScore = DEFAULT_MINIMUM_PQS_FOR_DISCOUNT } = {}) {
  if (typeof partnerQualityScore !== 'number' || partnerQualityScore < minimumScore) {
    return 0;
  }
  return MAX_PQS_DISCOUNT_PERCENTAGE_POINTS;
}

/**
 * Computes the effective commission rate for a Partner's sale in a
 * given Category, applying the volume and Partner Quality Score
 * discounts on top of the category base rate — combined discount
 * capped at MAX_COMBINED_DISCOUNT_PERCENTAGE_POINTS, never applied
 * uncapped even if volume + PQS discounts would otherwise exceed it.
 *
 * @param {object} args
 * @param {string} args.category
 * @param {number} args.monthlyGmvMinorUnits
 * @param {number|null} [args.partnerQualityScore]
 * @param {object} [args.options] - passed through to qualityScoreDiscount
 * @returns {{ baseRatePercent: number, volumeDiscountPoints: number,
 *   pqsDiscountPoints: number, appliedDiscountPoints: number,
 *   effectiveRatePercent: number }}
 */
function effectiveCommissionRate({ category, monthlyGmvMinorUnits, partnerQualityScore = null, options = {} }) {
  const baseRatePercent = baseCommissionRate(category);
  const volumeDiscountPoints = volumeDiscount(monthlyGmvMinorUnits);
  const pqsDiscountPoints = qualityScoreDiscount(partnerQualityScore, options);

  const requestedDiscountPoints = volumeDiscountPoints + pqsDiscountPoints;
  const appliedDiscountPoints = Math.min(requestedDiscountPoints, MAX_COMBINED_DISCOUNT_PERCENTAGE_POINTS);

  return {
    baseRatePercent,
    volumeDiscountPoints,
    pqsDiscountPoints,
    appliedDiscountPoints,
    effectiveRatePercent: baseRatePercent - appliedDiscountPoints,
  };
}

/**
 * Computes the commission owed on a single sale line, in minor
 * currency units. Rounds down (floor) — the Platform never collects a
 * fraction of a minor unit more than the effective rate actually
 * implies.
 *
 * @param {number} saleAmountMinorUnits
 * @param {number} effectiveRatePercent - as returned by
 *   effectiveCommissionRate().effectiveRatePercent
 * @returns {number} commission owed, in minor currency units
 */
function commissionOwedMinorUnits(saleAmountMinorUnits, effectiveRatePercent) {
  if (typeof saleAmountMinorUnits !== 'number' || saleAmountMinorUnits < 0) {
    throw new Error('commissionOwedMinorUnits: saleAmountMinorUnits must be a non-negative number');
  }
  return Math.floor((saleAmountMinorUnits * effectiveRatePercent) / 100);
}

/**
 * @param {number} monthsSincePartnerActivated - 1 for the Partner's
 *   first calendar month as 'active' (onboarding.js), 2 for the
 *   second, etc. — never a raw date computation here, so the caller
 *   owns the calendar/timezone logic and this stays a pure rule.
 * @returns {number} the subscription fee owed for that month, in
 *   minor currency units — 0 for month 1, the standard fee from month
 *   2 onward
 */
function subscriptionFeeOwedMinorUnits(monthsSincePartnerActivated) {
  if (!Number.isInteger(monthsSincePartnerActivated) || monthsSincePartnerActivated < 1) {
    throw new Error('subscriptionFeeOwedMinorUnits: monthsSincePartnerActivated must be an integer >= 1');
  }
  return monthsSincePartnerActivated === 1 ? 0 : MONTHLY_SUBSCRIPTION_FEE_MINOR_UNITS;
}

module.exports = {
  BASE_COMMISSION_RATE_PERCENT,
  MONTHLY_SUBSCRIPTION_FEE_MINOR_UNITS,
  VOLUME_DISCOUNT_TIERS,
  DEFAULT_MINIMUM_PQS_FOR_DISCOUNT,
  MAX_PQS_DISCOUNT_PERCENTAGE_POINTS,
  MAX_COMBINED_DISCOUNT_PERCENTAGE_POINTS,
  baseCommissionRate,
  volumeDiscount,
  qualityScoreDiscount,
  effectiveCommissionRate,
  commissionOwedMinorUnits,
  subscriptionFeeOwedMinorUnits,
};
