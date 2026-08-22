/* ============================================================
   Z FASHION — SIZE GRID (bounded context: fashion-domain)
   ============================================================
   Owns: the canonical size-grid conversion tables promised since the
   earliest design pass (MARKETS-AND-I18N.md: "a canonical size-grid
   concept") but never actually built — flagged twice during the
   customer-side audit (2026-08-21) before finally being tackled here.

   IMPORTANT — same disclaimer every real size-guide source carries:
   these conversions are a reference/consumer guide, not an exact
   science. Brands vary their own cut and labeling meaningfully (a
   Zara M is not a Ralph Lauren M) — this table gives the Client a
   reasonable starting point, never a guarantee. Product Page copy
   must say so explicitly, never present this as precise.

   Two genuinely different conventions, not one grid pretending to
   serve both:
   - Footwear sizing differs by Gender (women's and men's EU/UK/US
     numbering are NOT the same scale at the same EU number — a
     women's EU39 and a men's EU39 are different actual foot lengths,
     confirmed by every sourced size-guide). 'unisex' falls back to
     the men's table, the common industry-neutral base for unisex
     footwear drops.
   - Clothing sizing for women follows a real per-country numeric
     split (FR/IT/DE/UK/US genuinely differ, not just relabeled) tied
     to an Alpha (XS-XXL) anchor; for men/unisex, Alpha sizing is
     treated as the canonical, near-universal system across FR/IT/DE/
     UK/US (sourced: "vêtements homme généralement identique aux
     tailles FR/UK") — no separate numeric table is invented for a
     distinction the market itself does not really make.

   Sportswear is not a third grid: a technical jacket uses the
   Clothing grid, a running shoe uses the Footwear grid — which one
   applies is decided by whether 'footwear' is among the Product's
   Categories, never by Sportswear itself.
   ============================================================ */

const CLOTHING_ALPHA_ORDER = Object.freeze(['XS', 'S', 'M', 'L', 'XL', 'XXL']);

/* Women's clothing numeric grid — sourced cross-checked: FR38=IT42(+4),
   FR38=DE36(-2), FR-28=UK, FR-30=US (all confirmed against at least two
   independent published guides, 2026-08). One FR value per Alpha step —
   real charts show overlapping ranges per brand; this is the common
   single-value simplification every "one column per system" chart
   already makes. */
const WOMENS_CLOTHING_GRID = Object.freeze([
  Object.freeze({ alpha: 'XS', fr: 34, it: 38, de: 32, uk: 6, us: 4 }),
  Object.freeze({ alpha: 'S', fr: 36, it: 40, de: 34, uk: 8, us: 6 }),
  Object.freeze({ alpha: 'M', fr: 38, it: 42, de: 36, uk: 10, us: 8 }),
  Object.freeze({ alpha: 'L', fr: 40, it: 44, de: 38, uk: 12, us: 10 }),
  Object.freeze({ alpha: 'XL', fr: 42, it: 46, de: 40, uk: 14, us: 12 }),
  Object.freeze({ alpha: 'XXL', fr: 44, it: 48, de: 42, uk: 16, us: 14 }),
]);

/* Women's footwear — EU/UK/US, sourced (EU36=UK3.5, EU42=UK8, women's
   normal range EU36-42, ~1-size US/UK gap). */
const WOMENS_FOOTWEAR_GRID = Object.freeze([
  Object.freeze({ eu: 36, uk: 3.5, us: 6 }),
  Object.freeze({ eu: 37, uk: 4, us: 6.5 }),
  Object.freeze({ eu: 38, uk: 5, us: 7.5 }),
  Object.freeze({ eu: 39, uk: 6, us: 8.5 }),
  Object.freeze({ eu: 40, uk: 6.5, us: 9 }),
  Object.freeze({ eu: 41, uk: 7.5, us: 10 }),
  Object.freeze({ eu: 42, uk: 8, us: 10.5 }),
]);

/* Men's footwear — EU/UK/US, sourced (EU42=UK8=US10, ~2-size US/UK
   gap for men, normal range EU40-45). */
const MENS_FOOTWEAR_GRID = Object.freeze([
  Object.freeze({ eu: 40, uk: 6.5, us: 8.5 }),
  Object.freeze({ eu: 41, uk: 7, us: 9 }),
  Object.freeze({ eu: 42, uk: 8, us: 10 }),
  Object.freeze({ eu: 43, uk: 9, us: 10.5 }),
  Object.freeze({ eu: 44, uk: 9.5, us: 11 }),
  Object.freeze({ eu: 45, uk: 10.5, us: 12 }),
]);

/**
 * @param {string} gender - 'female' | 'male' | 'unisex' (product.js GENDERS)
 * @returns {object[]} the footwear grid rows for that Gender — 'unisex'
 *   falls back to the men's table (documented industry-neutral base,
 *   never silently guessed per-request)
 */
function footwearGridFor(gender) {
  return gender === 'female' ? WOMENS_FOOTWEAR_GRID : MENS_FOOTWEAR_GRID;
}

/**
 * @param {number} value - the EU size value to look up
 * @param {string} gender
 * @returns {object|null} the matching grid row, or null if this exact
 *   EU value isn't in the reference table — never interpolated or
 *   guessed, a gap here is a table to extend, not a value to invent
 */
function translateFootwearSize(value, gender) {
  const grid = footwearGridFor(gender);
  return grid.find((row) => row.eu === value) || null;
}

/**
 * @param {number} frValue - the FR clothing size value (WOMENS_CLOTHING_GRID
 *   uses FR as the anchor column, same as product.js storing size.system
 *   'FR' as the canonical entry point)
 * @returns {object|null} the matching grid row, or null if not found
 */
function translateWomensClothingSize(frValue) {
  return WOMENS_CLOTHING_GRID.find((row) => row.fr === frValue) || null;
}

/**
 * Resolves a Product's size into every system this module has a table
 * for, choosing the right grid (footwear vs. clothing) from the
 * Product's own Categories, and the right Gender-scoped table from the
 * Product's own Gender — never a second guess about which table
 * applies, always read from the Product itself.
 *
 * @param {object} product - product.js createProduct() shape
 * @returns {object|null} the full conversion row for this size, or
 *   null when the Product isn't in a sized Category, has no size, or
 *   the exact value isn't in the reference table yet — never a
 *   fabricated/interpolated row
 */
function translateProductSize(product) {
  if (!product.size) return null;

  if (product.categories.includes('footwear')) {
    return translateFootwearSize(product.size.value, product.gender);
  }

  // Clothing/Sportswear (non-footwear): men/unisex sizing is Alpha-only
  // across systems (see module header) — nothing to "translate", the
  // Alpha code itself is the answer in every system.
  if (product.gender === 'female') {
    return translateWomensClothingSize(product.size.value);
  }

  if (CLOTHING_ALPHA_ORDER.includes(product.size.value)) {
    return Object.freeze({ alpha: product.size.value, fr: null, it: null, de: null, uk: null, us: null });
  }

  return null;
}

module.exports = {
  CLOTHING_ALPHA_ORDER,
  WOMENS_CLOTHING_GRID,
  WOMENS_FOOTWEAR_GRID,
  MENS_FOOTWEAR_GRID,
  footwearGridFor,
  translateFootwearSize,
  translateWomensClothingSize,
  translateProductSize,
};
