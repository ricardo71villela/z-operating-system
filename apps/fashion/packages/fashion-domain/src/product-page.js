/* ============================================================
   Z FASHION — PRODUCT PAGE VIEW MODEL (bounded context: fashion-domain)
   ============================================================
   Owns: assembling the data a Product Page needs to render — the
   single most consequential gap flagged in the customer-side audit
   (2026-08-21): Homepage and Corner both had a view model before any
   HTML existed; Product Page had neither. This file closes that gap
   for the domain layer, same bridging-function pattern already
   established (corner-page.js, Z Find's viewmodels.js), pure
   composition, no I/O, no new storage.

   A Client deciding whether to buy needs, at minimum: what the thing
   actually is (Product + Brand), whether it can actually be bought
   right now (Stock, via sellableQuantity — never inferred from
   quantityAvailable alone, since reservations already in flight must
   reduce what's shown as buyable), what it costs today including any
   active Campaign discount (price-history.js/campaign-pricing.js),
   who sells and ships it (Partner disclosure — a Phase 2 legal
   requirement per DOMAIN-SKETCH.md, not just a trust nicety), and
   what else might fit (recommendations.js's same-Corner/fallback
   asymmetry, honestly labeled).
   ============================================================ */

const { sellableQuantity } = require('./stock');
const { productPageRecommendations } = require('./recommendations');
const { isReturnEligible } = require('./product');

const STOCK_LABELS = Object.freeze({
  OUT_OF_STOCK: 'out_of_stock',
  LOW_STOCK: 'low_stock',
  IN_STOCK: 'in_stock',
});

const LOW_STOCK_THRESHOLD = 5;

/**
 * Never a raw number shown to the Client without interpretation — a
 * sellable quantity of 1 and 47 both just mean "in stock" for browsing
 * purposes, but the low-stock band (per STOCK-FEED-CONTRACT.md's own
 * urgency framing) is worth surfacing explicitly since it changes
 * Client behavior (buy now vs. can wait), while an exact "3 left"
 * count would leak Partner inventory precision the Platform has no
 * reason to expose.
 *
 * @param {object} stock - stock.js initStock()/applyStockUpdate() shape
 * @returns {string} one of STOCK_LABELS
 */
function stockAvailabilityLabel(stock) {
  const sellable = sellableQuantity(stock);
  if (sellable <= 0) return STOCK_LABELS.OUT_OF_STOCK;
  if (sellable <= LOW_STOCK_THRESHOLD) return STOCK_LABELS.LOW_STOCK;
  return STOCK_LABELS.IN_STOCK;
}

/**
 * @param {object} args
 * @param {object} args.product - product.js createProduct() shape
 * @param {object} args.stock - stock.js shape for this exact Product
 * @param {object} [args.brand] - brand.js createBrand() shape, or null
 *   if unresolved — the view model degrades gracefully rather than
 *   throwing, since a dangling brandId is a data-quality problem to
 *   surface, not a reason to break the whole page (see corner-page.js
 *   "orphan Products" precedent)
 * @param {object} args.partner - partner.js createPartner() shape —
 *   required, never optional: the professional-seller disclosure
 *   ("Vendu et expédié par [Partner]", BRAND-VOICE.md) is a legal
 *   requirement, not decoration, so a Product Page cannot render
 *   without knowing which Partner it belongs to.
 * @param {object} [args.discount] - campaign-pricing.js
 *   computeCampaignDiscount() result, or null if no active Campaign
 *   discount applies to this Product right now
 * @param {number} args.priceMinorUnits - the price actually charged
 *   today (equals discount.finalPriceMinorUnits when a discount
 *   applies, or the Partner's plain listed price otherwise — this
 *   function does not recompute pricing, only displays what it's told)
 * @param {object[]} args.allProducts - full Product catalog, passed
 *   through to productPageRecommendations() for the same-Corner/
 *   fallback computation
 */
function buildProductPageViewModel({ product, stock, brand, partner, discount, priceMinorUnits, allProducts }) {
  if (!product) throw new Error('buildProductPageViewModel: product is required');
  if (!stock) throw new Error('buildProductPageViewModel: stock is required');
  if (!partner) {
    throw new Error(
      'buildProductPageViewModel: partner is required — the professional-seller ' +
      'disclosure ("Vendu et expédié par...") is a legal requirement (EU Omnibus ' +
      'Directive), never an optional field on this page.'
    );
  }
  if (typeof priceMinorUnits !== 'number' || priceMinorUnits < 0) {
    throw new Error('buildProductPageViewModel: priceMinorUnits must be a non-negative number');
  }

  const recommendations = productPageRecommendations(allProducts || [], product);

  return Object.freeze({
    productId: product.id,
    categories: product.categories,
    gender: product.gender,
    ageSegments: product.ageSegments,
    brandName: brand ? brand.name : null,
    size: product.size,
    format: product.format,
    seller: {
      partnerId: partner.id,
      legalName: partner.legalName,
      // The disclosure line itself lives in the presentation layer
      // (BRAND-VOICE.md owns the exact copy); this view model exposes
      // only the fact the copy needs, never pre-renders French text
      // into a domain object that other locales will also read from.
    },
    price: Object.freeze({
      amountMinorUnits: priceMinorUnits,
      discount: discount
        ? Object.freeze({
            referencePriceMinorUnits: discount.referencePriceMinorUnits,
            discountPercent: discount.discountPercent,
          })
        : null,
    }),
    availability: Object.freeze({
      label: stockAvailabilityLabel(stock),
      sellable: sellableQuantity(stock) > 0,
    }),
    // At browsing time there is no seal state yet — sealBroken: false is
    // the correct "not purchased yet" assumption, so this reuses the exact
    // rule product.js already owns (Cosmetics hygiene-seal exception)
    // rather than re-deriving it here as a second source of truth.
    returnEligible: isReturnEligible(product, { sealBroken: false }),
    recommendations: Object.freeze({
      label: recommendations.label,
      productIds: recommendations.products.map((p) => p.id),
    }),
  });
}

module.exports = {
  STOCK_LABELS,
  LOW_STOCK_THRESHOLD,
  stockAvailabilityLabel,
  buildProductPageViewModel,
};
