/* ============================================================
   Z FIND — services/identity.js
   ============================================================
   Read-only Z Find projection over canonical ZOS Identity.

   profiles.id remains the local application/Auth identity.

   The database RPC deliberately exposes both:
   - local_only;
   - linked.

   This adapter never creates a ZOS Person and never links identities.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./supabaseClient')
    );
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.identity = factory(
      root.ZFindServices.supabaseClient
    );
  }
})(typeof window !== 'undefined' ? window : this, function (supabaseClientModule) {

const { getSupabaseClient, safeQuery } = supabaseClientModule;

async function getCurrentIdentityBinding() {
  const client = getSupabaseClient();

  return safeQuery(
    () => client.rpc(
      'zfind_current_identity_binding'
    ),
    'identity.getCurrentIdentityBinding'
  );
}

return { getCurrentIdentityBinding };

});
