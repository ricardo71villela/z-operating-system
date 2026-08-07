/* ============================================================
   Z FIND — services/zones.js
   ============================================================
   Powers the live Zone view (apps/zfind-web/src/app.js's
   renderZone()) — different from scripts/generate-seo-pages.js, which
   produces separate static HTML for search engines.

   Deliberately thin: fetching and mapping the actual listings for a
   zone already happens via viewmodels.js's loadSearchResults({
   zoneLiteId }) — reusing search.js and developments.js exactly as
   the Search page does, including card mapping via cardHTML(). This
   file only adds what that doesn't already do: looking up the zone
   row itself, and computing an honest (never misleading on a small
   sample) stats summary.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./supabaseClient'));
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.zones = factory(root.ZFindServices.supabaseClient);
  }
})(typeof window !== 'undefined' ? window : this, function (supabaseClientModule) {

const { getSupabaseClient, safeQuery } = supabaseClientModule;

// Same honesty threshold as scripts/generate-seo-pages.js's static
// generator (MIN_LISTINGS_FOR_STATS there) — kept as its own constant
// here rather than imported cross-module, since this runs in the
// browser and that one is Node-only. If the two values ever drift
// apart, that's something to catch in review, not silently.
const MIN_LISTINGS_FOR_STATS = 5;

async function getZoneById(zoneId) {
  const client = getSupabaseClient();
  return safeQuery(() => client.from('zones_lite').select('id, name, city, country_iso').eq('id', zoneId).single(), 'zones.getZoneById');
}

/** cards is whatever loadSearchResults({ zoneLiteId }) already
    returned — this never re-fetches, only summarises. */
function computeZoneStats(cards) {
  const prices = (cards || []).map(c => c.priceValue).filter(v => v != null);
  const listingCount = (cards || []).length;
  const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
  return { listingCount, avgPrice, hasEnoughForStats: listingCount >= MIN_LISTINGS_FOR_STATS };
}

return { getZoneById, computeZoneStats, MIN_LISTINGS_FOR_STATS };

});
