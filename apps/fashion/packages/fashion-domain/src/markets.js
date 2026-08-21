/* ============================================================
   Z FASHION — MARKETS (bounded context: fashion-domain)
   ============================================================
   Mirrors the exact 26 jurisdictions in apps/find/content/legal/ —
   per instruction, Z Fashion's market architecture must match Z
   Find's exactly, not an invented subset. France is the only market
   actually launched; every other code here is provisioned in the
   foundation so expansion never requires re-architecting, matching
   how Z Find's own content/legal/<COUNTRY> folders already exist for
   jurisdictions its product hasn't fully activated yet either.

   Deliberately NOT validated against zos.geography_locations here —
   see ZOS-ALIGNMENT.md's Database validation note: most of these 26
   codes, including FR itself, are not yet seeded as real Geography
   Country rows even for Z Find. This list is the architectural
   target, not a claim that the canonical data already exists.
   ============================================================ */

const MARKET_STATUS = Object.freeze(['launched', 'planned']);

/**
 * Keyed by country_iso (or Z Find's sub-national code shape, e.g.
 * GB-ENG, AE-DU, where the jurisdiction isn't a plain ISO-3166-1
 * country) — same code space Z Find's content/legal/<COUNTRY> folder
 * names already use, copied verbatim, not re-derived.
 */
const MARKETS = Object.freeze({
  FR: { status: 'launched' },
  ES: { status: 'planned' },
  DE: { status: 'planned' },
  IT: { status: 'planned' },
  'GB-ENG': { status: 'planned' },
  'GB-SCT': { status: 'planned' },
  'GB-WLS': { status: 'planned' },
  'GB-NIR': { status: 'planned' },
  IE: { status: 'planned' },
  US: { status: 'planned' },
  CA: { status: 'planned' },
  BR: { status: 'planned' },
  MX: { status: 'planned' },
  AR: { status: 'planned' },
  NL: { status: 'planned' },
  BE: { status: 'planned' },
  PL: { status: 'planned' },
  GR: { status: 'planned' },
  CY: { status: 'planned' },
  HR: { status: 'planned' },
  'AE-DU': { status: 'planned' },
  DO: { status: 'planned' },
  CL: { status: 'planned' },
  PA: { status: 'planned' },
  AT: { status: 'planned' },
  EE: { status: 'planned' },
});

function isKnownMarket(code) {
  return Object.prototype.hasOwnProperty.call(MARKETS, code);
}

function isLaunched(code) {
  return isKnownMarket(code) && MARKETS[code].status === 'launched';
}

function launchedMarkets() {
  return Object.keys(MARKETS).filter((code) => MARKETS[code].status === 'launched');
}

module.exports = { MARKET_STATUS, MARKETS, isKnownMarket, isLaunched, launchedMarkets };
