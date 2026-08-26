/* ============================================================
   Z FASHION — SEARCH (bounded context: fashion-domain)
   ============================================================
   Owns: nothing stateful, same discipline as corner.js and
   recommendations.js — pure query functions over the existing
   Product list. Closes the audit finding (2026-08-21, point 3): the
   header search bar shown in every prototype so far was decorative;
   this is what makes it real.

   Depends on product.js's `names{lang}` (only usable now that Product
   actually carries a name — see the comment at the top of product.js)
   and productName()'s fr-fallback, so a search always has *something*
   to match against regardless of which locale the Client is browsing
   in, exactly the same locale-independence MARKETS-AND-I18N.md already
   established for the rest of the catalog.
   ============================================================ */

const { productName, isInAllSale } = require('./product');
const { allSale } = require('./corner');
const { productsVisibleInMarket } = require('./market');

function normalize(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // strip accents — "besace" must match "Besace"/"bésace" alike
}

/**
 * Searches Products by display name (in the given locale, falling back
 * to 'fr'), Brand name, and Category label — a substring match,
 * accent-insensitive, never a fuzzy/typo-tolerant match (that would be
 * a real search-engine feature, out of scope for this pure function;
 * see "Deliberately not built" below).
 *
 * Only searches Products eligible for All Sale (isInAllSale) — a
 * cornerExclusive drop should not be discoverable by search any more
 * than it is by browsing All Sale, same comprehensiveness rule
 * (DOMAIN-SKETCH.md "Resolved") applied consistently to this surface
 * too.
 *
 * @param {object[]} products - full Product catalog
 * @param {string} query - raw search text from the Client
 * @param {object} [options]
 * @param {string} [options.locale] - defaults to productName()'s own
 *   default ('fr')
 * @param {Object.<string,object>} [options.brandsById] - brand.js
 *   records keyed by id, used to also match on Brand name
 * @returns {object[]} matching Products, in catalog order (no
 *   relevance ranking — see "Deliberately not built")
 */
function searchProducts(products, query, { locale, brandsById = {} } = {}) {
  const q = normalize(query);
  if (!q) return [];

  return products.filter((p) => {
    if (!isInAllSale(p)) return false;

    const name = normalize(productName(p, locale));
    if (name.includes(q)) return true;

    const brand = brandsById[p.brandId];
    if (brand && normalize(brand.name).includes(q)) return true;

    if (p.categories.some((c) => normalize(c).includes(q))) return true;

    return false;
  });
}

/**
 * Same as searchProducts(), but additionally scoped by the same filter
 * shape allSale() already accepts (Segment × Gender × Category × Size ×
 * Brand × Partner) — lets a Client search *within* a filtered view
 * ("chaussures femme" already selected, now typing "cuir") rather than
 * always searching the whole catalog from scratch.
 */
function searchWithinAllSale(products, query, filter = {}, options = {}) {
  return searchProducts(allSale(products, filter), query, options);
}

/**
 * Same as searchWithinAllSale(), scoped to a single Market first — the
 * search box a Client actually types into always lives inside some
 * Market context (per the header search bar shown on every prototype),
 * so a search never reaches across Markets any more than browsing does.
 *
 * @param {object[]} products
 * @param {Object.<string,object>} partnersById
 * @param {string} marketCountryIso
 * @param {string} query
 * @param {object} [filter] - same shape allSale() accepts
 * @param {object} [options] - same shape searchProducts() accepts
 */
function searchInMarket(products, partnersById, marketCountryIso, query, filter = {}, options = {}) {
  return searchWithinAllSale(productsVisibleInMarket(products, partnersById, marketCountryIso), query, filter, options);
}

/*
   Deliberately not built here (out of scope for a pure domain
   function, flagged rather than silently absent):
   - Relevance ranking / typo tolerance — a real search index (e.g.
     Postgres full-text search or an external engine) is an
     infrastructure decision, not a fashion-domain concern.
   - Search-as-you-type debouncing / result pagination — presentation
     layer concerns.
   - Query analytics ("people also searched") — a Phase 3+ growth
     mechanic, not part of this closing-the-gap pass.
*/

module.exports = { searchProducts, searchWithinAllSale, searchInMarket };
