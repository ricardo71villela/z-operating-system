/* Run with: node apps/fashion/packages/fashion-domain/tests/commission.test.js */

const assert = require('assert');
const {
  baseCommissionRate,
  volumeDiscount,
  qualityScoreDiscount,
  effectiveCommissionRate,
  commissionOwedMinorUnits,
  subscriptionFeeOwedMinorUnits,
  MONTHLY_SUBSCRIPTION_FEE_MINOR_UNITS,
  MAX_COMBINED_DISCOUNT_PERCENTAGE_POINTS,
} = require('../src/commission');

// Base rates: every Category has one, Sportswear/Cosmetics sit below
// Clothing/Footwear/Accessories (thinner real-world margins).
assert.strictEqual(baseCommissionRate('clothing'), 13);
assert.strictEqual(baseCommissionRate('sportswear'), 10);
assert.strictEqual(baseCommissionRate('accessories_leather_goods'), 15);
assert.throws(() => baseCommissionRate('shoes'), /unknown category/);

// Volume tiers: progressive discount, small Partner gets none.
assert.strictEqual(volumeDiscount(0), 0);
assert.strictEqual(volumeDiscount(499999), 0);
assert.strictEqual(volumeDiscount(500000), 1); // exactly EUR 5,000 — tier boundary is inclusive
assert.strictEqual(volumeDiscount(1499999), 1);
assert.strictEqual(volumeDiscount(1500000), 2); // EUR 15,000
assert.strictEqual(volumeDiscount(4000000), 3); // EUR 40,000
assert.strictEqual(volumeDiscount(50000000), 3); // well above top tier — still capped at 3
assert.throws(() => volumeDiscount(-1), /non-negative/);

// PQS discount: below-minimum, missing, or null score all yield zero —
// never inferred or defaulted upward.
assert.strictEqual(qualityScoreDiscount(59), 0);
assert.strictEqual(qualityScoreDiscount(60), 2);
assert.strictEqual(qualityScoreDiscount(85), 2);
assert.strictEqual(qualityScoreDiscount(null), 0);
assert.strictEqual(qualityScoreDiscount(undefined), 0);

// Combined effective rate: small Partner, no PQS yet — pays the full base rate.
const small = effectiveCommissionRate({
  category: 'clothing', monthlyGmvMinorUnits: 200000, partnerQualityScore: null,
});
assert.strictEqual(small.baseRatePercent, 13);
assert.strictEqual(small.volumeDiscountPoints, 0);
assert.strictEqual(small.pqsDiscountPoints, 0);
assert.strictEqual(small.effectiveRatePercent, 13);

// Mid-size Partner with a good score: volume + PQS discounts stack normally
// while under the combined cap.
const mid = effectiveCommissionRate({
  category: 'clothing', monthlyGmvMinorUnits: 2000000, partnerQualityScore: 70,
});
assert.strictEqual(mid.volumeDiscountPoints, 2);
assert.strictEqual(mid.pqsDiscountPoints, 2);
assert.strictEqual(mid.appliedDiscountPoints, 4);
assert.strictEqual(mid.effectiveRatePercent, 9); // 13 - 4

// Large Partner with a top score: volume (3) + PQS (2) = 5, exactly at the
// combined cap — applied in full, not truncated below the cap.
const atCap = effectiveCommissionRate({
  category: 'accessories_leather_goods', monthlyGmvMinorUnits: 5000000, partnerQualityScore: 95,
});
assert.strictEqual(atCap.appliedDiscountPoints, MAX_COMBINED_DISCOUNT_PERCENTAGE_POINTS);
assert.strictEqual(atCap.effectiveRatePercent, 10); // 15 - 5

// The combined discount can never exceed the cap even if a future tier
// change would otherwise push volume+PQS higher — this is the invariant
// the cap exists to protect, not just today's specific numbers.
assert.ok(atCap.appliedDiscountPoints <= MAX_COMBINED_DISCOUNT_PERCENTAGE_POINTS);

// Commission owed: floors, never rounds up past what the rate implies.
assert.strictEqual(commissionOwedMinorUnits(10000, 13), 1300);
assert.strictEqual(commissionOwedMinorUnits(9999, 13), 1299); // floor(1299.87)
assert.throws(() => commissionOwedMinorUnits(-1, 13), /non-negative/);

// Subscription fee: month 1 is always free, month 2 onward is the standard
// fee — regardless of how much the Partner sold in month 1.
assert.strictEqual(subscriptionFeeOwedMinorUnits(1), 0);
assert.strictEqual(subscriptionFeeOwedMinorUnits(2), MONTHLY_SUBSCRIPTION_FEE_MINOR_UNITS);
assert.strictEqual(subscriptionFeeOwedMinorUnits(12), MONTHLY_SUBSCRIPTION_FEE_MINOR_UNITS);
assert.throws(() => subscriptionFeeOwedMinorUnits(0), />= 1/);
assert.throws(() => subscriptionFeeOwedMinorUnits(1.5), />= 1/);

console.log('commission.js: all invariant checks passed.');
