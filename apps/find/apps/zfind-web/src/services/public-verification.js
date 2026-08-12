/* ============================================================
   Z FIND — services/public-verification.js
   ============================================================
   Public read-only adapter for the deliberately constrained
   Property Verification RPC created by migration 0019.

   This adapter never reads verification_assessments directly.

   The database projection is responsible for:
   - published Property visibility;
   - explicit verification-kind publication policy;
   - latest-assessment semantics;
   - positive/current outcome filtering;
   - removal of internal audit fields.

   This service must never:
   - expose evidence or assessor identity;
   - expose confidence or source_reference;
   - calculate a Trust Score;
   - read partners.trust_level.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./supabaseClient'));
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.publicVerification = factory(
      root.ZFindServices.supabaseClient
    );
  }
})(typeof window !== 'undefined' ? window : this, function (supabaseClientModule) {

const { getSupabaseClient, safeQuery } = supabaseClientModule;

async function listPublicPropertyVerification(propertyId) {
  if (
    typeof propertyId !== 'string' ||
    propertyId.trim() === ''
  ) {
    return {
      data: null,
      error: {
        type: 'validation_error',
        context: 'publicVerification.listPublicPropertyVerification',
        message: 'Public Property Verification requires a non-empty Property id.'
      }
    };
  }

  const client = getSupabaseClient();

  return safeQuery(
    () => client.rpc(
      'zfind_public_property_verification',
      { p_property_id: propertyId }
    ),
    'publicVerification.listPublicPropertyVerification'
  );
}

return {
  listPublicPropertyVerification
};

});
