/* ============================================================
   Z FIND — services/partners.js
   ============================================================
   Public read-side service for the Partner profile.

   Anonymous visibility remains owned by Supabase RLS:
   - a Partner is public only when it represents published content;
   - portfolio queries only request active representations with
     published Listings;
   - no Admin/authenticated read path is reused here.

   partners.trust_level is intentionally absent from every select.
   It is a legacy marketplace projection, not Verification truth.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./supabaseClient'));
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.partners = factory(root.ZFindServices.supabaseClient);
  }
})(typeof window !== 'undefined' ? window : this, function (supabaseClientModule) {

const { getSupabaseClient, safeQuery } = supabaseClientModule;


/** Returns one publicly visible, active Partner.
    RLS makes a non-public Partner indistinguishable from a missing one. */
async function getPublicPartnerById(partnerId) {
  const client = getSupabaseClient();

  if (!partnerId) {
    return {
      data: null,
      error: {
        type: 'malformed_response',
        context: 'partners.getPublicPartnerById',
        message: 'partnerId is required.'
      }
    };
  }

  return safeQuery(
    () => client
      .from('partners')
      .select(
        'id, name, role, status, avg_response_hours, enquiry_policy, logo_storage_path'
      )
      .eq('id', partnerId)
      .eq('status', 'active')
      .single(),
    'partners.getPublicPartnerById'
  );
}


/** Property/Land cards currently published through this Partner.
    Shape deliberately matches search.search() so the existing
    mapSupabasePropertyRowToCard() is reused unchanged. */
async function listPublishedProperties(partnerId) {
  const client = getSupabaseClient();

  if (!partnerId) {
    return {
      data: null,
      error: {
        type: 'malformed_response',
        context: 'partners.listPublishedProperties',
        message: 'partnerId is required.'
      }
    };
  }

  return safeQuery(
    () => client
      .from('properties')
      .select(`
        id, subtype, typology, area_sqm, zone_lite_id,
        zones_lite ( name, city, country_iso ),
        representations!inner (
          partner_id, target_type, status,
          listings!inner (
            id, channel, transaction_type, rental_period, price_current, currency_iso, price_is_from, status,
            listing_content ( locale, title )
          )
        )
      `)
      .eq('representations.partner_id', partnerId)
      .eq('representations.target_type', 'property')
      .eq('representations.status', 'active')
      .eq('representations.listings.status', 'published'),
    'partners.listPublishedProperties'
  );
}


/** Development cards currently published through this Partner.
    Shape deliberately matches developments.listPublished() so the
    existing mapSupabaseDevelopmentRowToCard() is reused unchanged. */
async function listPublishedDevelopments(partnerId) {
  const client = getSupabaseClient();

  if (!partnerId) {
    return {
      data: null,
      error: {
        type: 'malformed_response',
        context: 'partners.listPublishedDevelopments',
        message: 'partnerId is required.'
      }
    };
  }

  return safeQuery(
    () => client
      .from('developments')
      .select(`
        id, name, zone_lite_id,
        zones_lite ( name, city, country_iso ),
        representations!inner (
          partner_id, target_type, status,
          listings!inner (
            id, channel, transaction_type, rental_period, price_current, currency_iso, price_is_from, status,
            listing_content ( locale, title )
          )
        )
      `)
      .eq('representations.partner_id', partnerId)
      .eq('representations.target_type', 'development')
      .eq('representations.status', 'active')
      .eq('representations.listings.status', 'published'),
    'partners.listPublishedDevelopments'
  );
}


return {
  getPublicPartnerById,
  listPublishedProperties,
  listPublishedDevelopments,
};

});
