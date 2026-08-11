/* ============================================================
   Z FIND — services/properties.js
   ============================================================
   Read operations only in this initial delivery — write operations
   (create/update/publish) are Week 4 scope per the approved Sprint B
   plan (CRUD + publish workflow), deferred deliberately, not an
   oversight. Every read here relies on RLS to enforce "published
   listings only" for anonymous callers — this file never adds its
   own status filter as a substitute for RLS, so the two can never
   drift out of sync.

   Revised per CTO Review 0001 (Blocker 2): representations now carry
   a target_type discriminator ('property' | 'development'), since a
   Representation — and therefore a Listing — may target either. Every
   query in this file explicitly filters representations.target_type
   = 'property', even though the FK/check-constraint shape already
   implies it — explicit is preferred over relying on a reader knowing
   about a constraint defined elsewhere.

   Revised per CTO Foundation Audit (6-language): the flat `media`
   table is gone — media is now media_assets (+ variants + localized
   content) reached via the listing_media association. The embedded
   query below reflects that shape. `price_current` reads are now
   always paired with `currency_iso` — no caller may treat a bare
   number as a price without knowing its currency.
   Revised per Sprint 1.4 (Property page migration): getPropertyById
   now also embeds zones_lite (location label) and the representing
   Partner's name — neither was needed by Home/Search cards, but the
   full detail page needs both. Extending this ONE function rather
   than creating a second, near-duplicate query — per the mandate to
   reuse existing services and avoid duplicate business logic.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./supabaseClient'));
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.properties = factory(root.ZFindServices.supabaseClient);
  }
})(typeof window !== 'undefined' ? window : this, function (supabaseClientModule) {

const { getSupabaseClient, safeQuery } = supabaseClientModule;


const MEDIA_EMBED = `
  listing_media ( position, is_cover,
    media_assets (
      id, media_type, visibility, original_storage_path, mime_type, width, height,
      media_variants ( id, variant_type, storage_path, mime_type, width, height ),
      media_asset_content ( locale, alt_text, caption )
    )
  )
`;

/** Fetches one property with its published listing, content, media,
    zone and representing partner. Returns empty_result (not an
    error) if the id doesn't exist or its listing isn't published —
    RLS makes both cases look identical to an anonymous caller, which
    is correct: we never leak whether an unpublished property exists. */
async function getPropertyById(propertyId, locale) {
  const client = getSupabaseClient();
  if (!propertyId) {
    return { data: null, error: { type: 'malformed_response', context: 'properties.getPropertyById', message: 'propertyId is required.' } };
  }

  return safeQuery(
    () => client
      .from('properties')
      .select(`
        id, subtype, typology, area_sqm, plot_area_sqm, floor, zone_lite_id, development_id,
        zones_lite ( name, city, country_iso ),
        representations!inner (
          id, target_type, status,
          partners ( id, name, enquiry_policy ),
          listings!inner (
            id, channel, price_current, currency_iso, price_is_from, status,
            listing_content ( locale, title, description, translation_status ),
            ${MEDIA_EMBED}
          )
        )
      `)
      .eq('id', propertyId)
      .eq('representations.target_type', 'property')
      .eq('representations.listings.status', 'published')
      .single(),
    'properties.getPropertyById'
  );
}

/** Lists published properties in a zone — the minimal read the public
    Home page needs for Week 1. Filtering by subtype/channel/budget is
    Week 2 scope (search.js), not duplicated here. subtype now includes
    'land' — this function is subtype-agnostic, so no change to its
    own logic was needed beyond the schema supporting it. */
async function listPublishedByZone(zoneLiteId, limit) {
  const client = getSupabaseClient();
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 20;

  return safeQuery(
    () => client
      .from('properties')
      .select(`
        id, subtype, typology, area_sqm,
        representations!inner ( target_type, status, listings!inner ( id, price_current, currency_iso, status ) )
      `)
      .eq('zone_lite_id', zoneLiteId)
      .eq('representations.target_type', 'property')
      .eq('representations.listings.status', 'published')
      .limit(safeLimit),
    'properties.listPublishedByZone'
  );
}


return { getPropertyById, listPublishedByZone };

});
