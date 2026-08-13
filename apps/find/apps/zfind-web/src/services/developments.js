/* ============================================================
   Z FIND — services/developments.js
   ============================================================
   New in this revision (CTO Review 0001, Blocker 2): a Development
   may now be represented and listed directly (target_type =
   'development' on representations), not only reachable indirectly
   through one of its Property units. This file is the read-side
   counterpart to that schema change — same shape and discipline as
   properties.js, deliberately not merged into it, since Development
   is its own domain concept (see DOMAIN_MODEL.md) even though the
   query pattern rhymes.

   Revised per CTO Foundation Audit (6-language): media is now the
   media_assets foundation. A Development can carry its OWN media
   directly (development_media — e.g. site/building photos that exist
   independent of any specific unit), in addition to whatever media
   its individual unit Listings carry via listing_media — this file
   surfaces both, it does not assume a Development's media only comes
   from its own direct listing.

   Revised per Sprint 1.2 (Homepage): added listPublished() — no
   existing function listed all published Developments without a
   specific id, which the Homepage needs. Deliberately minimal (no
   media embed, matching the card component's own needs — see
   viewmodels.js's mapping function for why).
   Revised per Sprint 1.5 (Development page migration): getDevelopmentById
   now also embeds zones_lite — needed for the detail page's location
   label, not needed by any prior caller.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./supabaseClient'));
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.developments = factory(root.ZFindServices.supabaseClient);
  }
})(typeof window !== 'undefined' ? window : this, function (supabaseClientModule) {

const { getSupabaseClient, safeQuery } = supabaseClientModule;


const MEDIA_EMBED = `
  media_assets (
    id, media_type, visibility, original_storage_path, mime_type, width, height,
    media_variants ( id, variant_type, storage_path, mime_type, width, height ),
    media_asset_content ( locale, alt_text, caption )
  )
`;

/** Fetches one Development with its own direct listing (if it has
    one), its own direct media, plus its contained Property units. A
    Development can be published in two independent ways — this
    function surfaces both, it does not assume only one applies. */
async function getDevelopmentById(developmentId) {
  const client = getSupabaseClient();
  if (!developmentId) {
    return { data: null, error: { type: 'malformed_response', context: 'developments.getDevelopmentById', message: 'developmentId is required.' } };
  }

  return safeQuery(
    () => client
      .from('developments')
      .select(`
        id, name, zone_lite_id,
        zones_lite ( name, city, country_iso ),
        development_media ( position, is_cover, ${MEDIA_EMBED} ),
        representations!inner (
          id, target_type, status,
          partners ( id, name, enquiry_policy ),
          listings!inner (
            id, channel, transaction_type, rental_period, price_current, currency_iso, price_is_from, status,
            listing_content ( locale, title, description, translation_status ),
            listing_media ( position, is_cover, ${MEDIA_EMBED} )
          )
        )
      `)
      .eq('id', developmentId)
      .eq('representations.target_type', 'development')
      .eq('representations.listings.status', 'published')
      .single(),
    'developments.getDevelopmentById'
  );
}

/** Lists the published Property units contained in a Development —
    the "Development contains Property units" side of the requirement,
    independent of whether the Development itself also has its own
    direct listing. */
async function listUnitsForDevelopment(developmentId) {
  const client = getSupabaseClient();
  if (!developmentId) {
    return { data: null, error: { type: 'malformed_response', context: 'developments.listUnitsForDevelopment', message: 'developmentId is required.' } };
  }

  return safeQuery(
    () => client
      .from('properties')
      .select(`
        id, subtype, typology, area_sqm, floor,
        representations!inner ( target_type, status, listings!inner ( id, transaction_type, rental_period, price_current, currency_iso, price_is_from, status ) )
      `)
      .eq('development_id', developmentId)
      .eq('representations.target_type', 'property')
      .eq('representations.listings.status', 'published'),
    'developments.listUnitsForDevelopment'
  );
}


/** Lists all published Developments (those with their own direct
    representation + published Listing) — for the Homepage's
    development highlights. Deliberately minimal select (no media
    embed): the card component doesn't render an image at all, so
    fetching media here would be waste, not correctness. */
async function listPublished(zoneLiteId, transactionType, rentalPeriod) {
  const client = getSupabaseClient();
  let query = client
    .from('developments')
    .select(`
      id, name, zone_lite_id,
      zones_lite ( name, city, country_iso ),
      representations!inner ( target_type, status, listings!inner (
        id, channel, transaction_type, rental_period, price_current, currency_iso, price_is_from, status,
        listing_content ( locale, title )
      ) )
    `)
    .eq('representations.target_type', 'development')
    .eq('representations.listings.status', 'published');
  if (zoneLiteId) query = query.eq('zone_lite_id', zoneLiteId);
  if (transactionType) query = query.eq('representations.listings.transaction_type', transactionType);
  if (rentalPeriod) query = query.eq('representations.listings.rental_period', rentalPeriod);
  return safeQuery(() => query, 'developments.listPublished');
}


return { getDevelopmentById, listUnitsForDevelopment, listPublished };

});
