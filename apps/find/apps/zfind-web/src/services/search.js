/* ============================================================
   Z FIND — services/search.js
   ============================================================
   Implements Search as a first-class entity (approved adjustment):
   every search is logged to `searches` (filters + result_count),
   laying the groundwork for a future Saved Search without blocking
   the current result on that write — the log call is fire-and-forget
   by design, per the engineering principle: product behaviour (fast
   search results) is never held hostage by a logging concern.

   Revised per CTO Review 0001 (Blocker 2): explicitly filters
   representations.target_type = 'property', since representations can
   now also target a Development — this function searches Property
   listings only (apartment/villa/land); a Development-level search is
   a natural next increment (see the note in this delivery's response),
   not added here to keep this fix minimal and reviewable.

   Revised per CTO Foundation Audit (6-language): every price read now
   includes currency_iso alongside it — no result exposes a bare
   number without its currency.

   Revised per Sprint 1.2 (Homepage): select now also embeds
   listing_content (for the card title, per locale) and zones_lite
   (for the location label) — neither was needed by any caller before
   the Homepage started consuming this function directly.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./supabaseClient'));
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.search = factory(root.ZFindServices.supabaseClient);
  }
})(typeof window !== 'undefined' ? window : this, function (supabaseClientModule) {

const { getSupabaseClient, safeQuery } = supabaseClientModule;


async function search(filters) {
  const client = getSupabaseClient();
  const f = filters || {};

  let query = client
    .from('properties')
    .select(`
      id, subtype, typology, area_sqm, zone_lite_id,
      zones_lite ( name, city, country_iso ),
      representations!inner ( target_type, status, listings!inner (
        id, transaction_type, rental_period, price_current, currency_iso, price_is_from, status,
        listing_content ( locale, title )
      ) )
    `)
    .eq('representations.target_type', 'property')
    .eq('representations.listings.status', 'published');

  if (f.subtype) query = query.eq('subtype', f.subtype);
  if (f.zoneLiteId) query = query.eq('zone_lite_id', f.zoneLiteId);
  if (f.transactionType) query = query.eq('representations.listings.transaction_type', f.transactionType);
  if (f.rentalPeriod) query = query.eq('representations.listings.rental_period', f.rentalPeriod);
  if (f.budgetMin != null) query = query.gte('representations.listings.price_current', f.budgetMin);
  if (f.budgetMax != null) query = query.lte('representations.listings.price_current', f.budgetMax);

  const result = await safeQuery(() => query, 'search.search');

  // Fire-and-forget logging — never awaited by the caller's critical
  // path, and a logging failure never becomes a search failure.
  const resultCount = Array.isArray(result.data) ? result.data.length : 0;
  logSearch(f, resultCount).catch(() => { /* intentionally swallowed — see module doc */ });

  return result;
}

async function logSearch(filters, resultCount) {
  const client = getSupabaseClient();
  return safeQuery(
    () => client.from('searches').insert({ filters, result_count: resultCount }),
    'search.logSearch'
  );
}


return { search, logSearch };

});
