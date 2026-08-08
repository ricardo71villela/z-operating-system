/* ============================================================
   Z FIND — services/auth.js
   ============================================================
   Admin/Partner authentication only — no public user accounts in
   this phase. Uses Supabase Auth via the anon key; role/partner
   linkage comes from the `profiles` table, readable only by the
   authenticated user themselves under RLS (see migration 0002 for
   the authenticated policies this depends on).
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./supabaseClient'));
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.auth = factory(root.ZFindServices.supabaseClient);
  }
})(typeof window !== 'undefined' ? window : this, function (supabaseClientModule) {

const { getSupabaseClient, safeQuery } = supabaseClientModule;


async function signIn(email, password) {
  const client = getSupabaseClient();
  if (!email || !password) {
    return { data: null, error: { type: 'malformed_response', context: 'signIn', message: 'Email and password are both required.' } };
  }
  return safeQuery(() => client.auth.signInWithPassword({ email, password }), 'auth.signIn');
}

async function signOut() {
  const client = getSupabaseClient();
  return safeQuery(() => client.auth.signOut(), 'auth.signOut');
}

async function getSession() {
  const client = getSupabaseClient();
  return safeQuery(() => client.auth.getSession(), 'auth.getSession');
}

/** Returns the authenticated user's role and linked partner_id, or a
    clear error if no profile exists yet (e.g. a Supabase Auth user was
    created but never linked — see the execution guide's "create first
    admin user" steps, which cover both halves). */
async function getCurrentProfile() {
  const client = getSupabaseClient();
  const { data: sessionData, error: sessionError } = await getSession();
  if (sessionError) return { data: null, error: sessionError };

  const userId = sessionData && sessionData.session && sessionData.session.user && sessionData.session.user.id;
  if (!userId) {
    return { data: null, error: { type: 'authorization_failure', context: 'auth.getCurrentProfile', message: 'No active session.' } };
  }

  return safeQuery(
    () => client.from('profiles').select('id, partner_id, role').eq('id', userId).single(),
    'auth.getCurrentProfile'
  );
}


return { signIn, signOut, getSession, getCurrentProfile };

});
