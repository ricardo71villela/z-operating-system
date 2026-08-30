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

   Search Map Foundation V1: published Property reads now also expose
   publisher-authored latitude/longitude. No coordinate is inferred,
   geocoded or defaulted. buildMapPins() is a pure projection for a
   future map/clustering surface and rejects missing/out-of-range data.
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


function normalizeCoordinatePair(latitude, longitude) {
  if (
    latitude == null || longitude == null ||
    (typeof latitude === 'string' && latitude.trim() === '') ||
    (typeof longitude === 'string' && longitude.trim() === '')
  ) {
    return null;
  }

  const lat = Number(latitude);
  const lon = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  return { latitude: lat, longitude: lon };
}


function buildMapPins(rows) {
  if (!Array.isArray(rows)) return [];

  return rows.reduce((pins, row) => {
    if (!row || row.id == null || row.id === '') return pins;

    const point = normalizeCoordinatePair(row.latitude, row.longitude);
    if (!point) return pins;

    pins.push({
      id: String(row.id),
      latitude: point.latitude,
      longitude: point.longitude,
      subtype: row.subtype || null,
      typology: row.typology || null,
      zoneLiteId: row.zone_lite_id || null
    });

    return pins;
  }, []);
}


function publishedPropertyQuery(client) {
  return client
    .from('properties')
    .select(`
      id, subtype, typology, area_sqm, zone_lite_id, latitude, longitude,
      zones_lite ( name, city, country_iso ),
      representations!inner ( target_type, status, listings!inner (
        id, transaction_type, rental_period, price_current, currency_iso, price_is_from, status,
        listing_content ( locale, title ),
        listing_media (
          position, is_cover,
          media_assets (
            id, original_storage_path,
            media_variants (
              variant_type, storage_path
            )
          )
        )
      ) )
    `)
    .eq('representations.target_type', 'property')
    .eq('representations.listings.status', 'published');
}

async function search(filters) {
  const client = getSupabaseClient();
  const f = filters || {};

  let query = publishedPropertyQuery(client);

  if (f.subtype) query = query.eq('subtype', f.subtype);
  if (f.zoneLiteId) query = query.eq('zone_lite_id', f.zoneLiteId);
  if (Array.isArray(f.zoneLiteIds) && f.zoneLiteIds.length) {
    query = query.in('zone_lite_id', f.zoneLiteIds);
  }
  if (f.transactionType) query = query.eq('representations.listings.transaction_type', f.transactionType);
  if (f.rentalPeriod) query = query.eq('representations.listings.rental_period', f.rentalPeriod);
  if (f.budgetMin != null) query = query.gte('representations.listings.price_current', f.budgetMin);
  if (f.budgetMax != null) query = query.lte('representations.listings.price_current', f.budgetMax);

  const result = await safeQuery(() => query, 'search.search');

  // Search analytics belong only to an explicit Search action.
  // Passive Market Featured rendering must never manufacture searches.
  const resultCount = Array.isArray(result.data) ? result.data.length : 0;

  // Internal zone ids implement server-side market scoping but are
  // not user-facing Search intent. Keep analytics semantic and compact.
  const analyticsFilters = Object.assign({}, f);
  delete analyticsFilters.zoneLiteIds;

  logSearch(analyticsFilters, resultCount).catch(() => {
    /* intentionally swallowed — product Search remains non-blocking */
  });

  return result;
}

/**
 * Read-only published Property inventory for non-Search discovery
 * surfaces such as Country Market Featured previews.
 *
 * Deliberately does NOT call logSearch(): opening a market page is not
 * a user-submitted Search and must not contaminate Search analytics.
 */
async function listPublished() {
  const client = getSupabaseClient();

  return safeQuery(
    () => publishedPropertyQuery(client),
    'search.listPublished'
  );
}


async function logSearch(filters, resultCount) {
  const client = getSupabaseClient();
  return safeQuery(
    () => client.from('searches').insert({ filters, result_count: resultCount }),
    'search.logSearch'
  );
}


return {
  search,
  listPublished,
  logSearch,
  normalizeCoordinatePair,
  buildMapPins
};

});
