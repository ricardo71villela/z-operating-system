/* ============================================================
   Z FIND — services/identity.js
   ============================================================
   Application/infrastructure adapter for the ZOS Person bridge.

   Supabase Auth + profiles.id remain the local application identity.
   identity_bindings only exposes the optional relationship to a shared
   ZOS Person identity.

   This service never creates a ZOS Person and never rewrites profiles.id.
   Reads remain subject to the existing identity_bindings RLS policies.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./supabaseClient'),
      require('./auth')
    );
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.identity = factory(
      root.ZFindServices.supabaseClient,
      root.ZFindServices.auth
    );
  }
})(typeof window !== 'undefined' ? window : this, function (supabaseClientModule, authModule) {

const { getSupabaseClient, safeQuery } = supabaseClientModule;


/**
 * Returns the Identity Bridge row for the authenticated Z Find profile.
 *
 * The returned profile_id is the existing Supabase Auth/application UUID.
 * zos_person_id may legitimately be null while the profile is still local-only.
 */
async function getCurrentIdentityBinding() {
  const client = getSupabaseClient();

  const { data: profile, error: profileError } =
    await authModule.getCurrentProfile();

  if (profileError) {
    return { data: null, error: profileError };
  }

  if (!profile || !profile.id) {
    return {
      data: null,
      error: {
        type: 'malformed_response',
        context: 'identity.getCurrentIdentityBinding',
        message: 'Authenticated profile did not contain an id.'
      }
    };
  }

  return safeQuery(
    () => client
      .from('identity_bindings')
      .select('profile_id, zos_person_id, binding_status, linked_at')
      .eq('profile_id', profile.id)
      .single(),
    'identity.getCurrentIdentityBinding'
  );
}


return { getCurrentIdentityBinding };

});
