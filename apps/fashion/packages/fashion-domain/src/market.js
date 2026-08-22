/* ============================================================
   Z FASHION — MARKET SCOPE (bounded context: fashion-domain)
   ============================================================
   Owns: scoping the catalog to a single Market — the half of
   "France-first, 6 languages, 22 markets" that had no code at all
   until now (confirmed by direct inspection: allSale()/corner()
   filtered by everything except Market). A Client browsing Market=FR
   must only ever see Products from Partners actually based in France
   — not because of a hardcoded whitelist, but because that is what
   `fashion.partners.country_iso` already means (validated against
   @zos/geography by partner.js itself).

   Deliberately does NOT hardcode a "22 supported markets" list here —
   that number was Z Find's legal-guide production scope (which
   markets it has written guides for), not a technical restriction on
   which countries a Z Fashion Partner can register in. Any Country
   @zos/geography recognizes (the same check partner.js already runs)
   is a valid Market for this module — a Partner is either
   registered there or not, no separate allowlist to keep in sync.

   Market and language (`names{lang}`, product.js) are independent
   axes, exactly as scoped from the start ("um cliente pode escolher o
   alemão para comprar em França"): this module never reads or filters
   by locale, and productName()/searchProducts()'s locale parameter
   never filters by Market. Composing them is the caller's job (e.g.
   "Market=FR, locale=de"), not something either module enforces on
   the other.
   ============================================================ */

/**
 * @param {object[]} products - full Product catalog
 * @param {Object.<string,object>} partnersById - partner.js records
 *   keyed by id — every Product referencing a Partner not present here
 *   is excluded, never assumed to be in-market by default (a dangling
 *   partnerId is a data-quality problem to surface, not a reason to
 *   guess)
 * @param {string} marketCountryIso - ISO-3166-1 alpha-2 (e.g. 'FR'),
 *   same format partner.js validates against @zos/geography
 * @returns {object[]} Products whose Partner is based in this Market
 */
function productsVisibleInMarket(products, partnersById, marketCountryIso) {
  if (!marketCountryIso) {
    throw new Error('productsVisibleInMarket: marketCountryIso is required — a catalog view is never market-less');
  }
  return products.filter((p) => {
    const partner = partnersById[p.partnerId];
    return !!partner && partner.countryIso === marketCountryIso;
  });
}

/**
 * @param {object[]} partners - partner.js records
 * @returns {string[]} the distinct countryIso values actually
 *   represented in this Partner list, alphabetically sorted — the
 *   real source for populating a Market selector (never a hardcoded
 *   list this module would have to keep in sync by hand as Partners
 *   from new countries onboard)
 */
function marketsWithPresence(partners) {
  const set = new Set(partners.map((p) => p.countryIso));
  return [...set].sort();
}

module.exports = {
  productsVisibleInMarket,
  marketsWithPresence,
};
