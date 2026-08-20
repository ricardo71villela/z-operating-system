/* ============================================================
   Z FASHION — CAMPAIGN PRICING (bounded context: fashion-domain)
   ============================================================
   Owns: validating that a Campaign price reduction is genuine
   against the 30-day reference price (price-history.js), and
   computing the displayed discount. A Partner cannot submit an
   inflated "before" price to fake a bigger discount — the reference
   price is always computed from actual price history, never taken
   from Partner input.
   ============================================================ */

const { referencePrice } = require('./price-history');

/**
 * @param {object} args
 * @param {object} args.priceHistory - price-history.js emptyHistory()/
 *   recordPrice() shape for this Product
 * @param {number} args.finalPriceMinorUnits - the Campaign-time price the
 *   Partner wants to charge
 * @param {string} args.asOf - ISO date, the Campaign's effective date
 * @param {number} [args.lookbackDays]
 * @returns {{ ok: true, referencePriceMinorUnits: number, discountPercent: number }
 *          | { ok: false, reason: string }}
 */
function computeCampaignDiscount({ priceHistory, finalPriceMinorUnits, asOf, lookbackDays }) {
  const refPrice = referencePrice(priceHistory, { asOf, lookbackDays });

  if (refPrice === null) {
    return {
      ok: false,
      reason: 'no price history in the required lookback window — cannot ' +
        'legally advertise a reduction without a genuine reference price ' +
        '(EU Omnibus Directive); this is not a data gap to fall back around',
    };
  }

  if (finalPriceMinorUnits >= refPrice) {
    return {
      ok: false,
      reason: `finalPriceMinorUnits (${finalPriceMinorUnits}) is not below the ` +
        `30-day reference price (${refPrice}) — this is not a genuine reduction ` +
        'and cannot be advertised as a discount',
    };
  }

  const discountPercent = Math.round(((refPrice - finalPriceMinorUnits) / refPrice) * 100);

  return { ok: true, referencePriceMinorUnits: refPrice, discountPercent };
}

module.exports = { computeCampaignDiscount };
