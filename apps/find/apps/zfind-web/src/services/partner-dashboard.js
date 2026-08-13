/* ============================================================
   Z FIND — services/partner-dashboard.js
   ============================================================
   Authenticated read-side service for the Partner Dashboard.
   Ownership and visibility are enforced by Supabase RLS.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./supabaseClient'));
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.partnerDashboard = factory(root.ZFindServices.supabaseClient);
  }
})(typeof window !== 'undefined' ? window : this, function (supabaseClientModule) {

const { getSupabaseClient, safeQuery } = supabaseClientModule;

async function getOwnPartnerSummary(partnerId) {
  const client = getSupabaseClient();

  if (!partnerId) {
    return {
      data: null,
      error: {
        type: 'malformed_response',
        context: 'partnerDashboard.getOwnPartnerSummary',
        message: 'partnerId is required.'
      }
    };
  }

  return safeQuery(
    () => client.from('partners').select('id, name').eq('id', partnerId).single(),
    'partnerDashboard.getOwnPartnerSummary'
  );
}

return {
  getOwnPartnerSummary,
};

});
