/* ============================================================
   Z FASHION PARTNER — Supabase Auth verification
   ============================================================
   Mirrors apps/jobs/apps/api/src/supabaseAuth.ts's verifySupabaseJWT:
   signature/JWKS verification is delegated entirely to
   @supabase/supabase-js's client.auth.getClaims() — nothing here
   reimplements JWT crypto.

   Deliberately returns three distinct outcomes from
   resolveAuthenticatedUserId(), not two, because server.js needs all
   three to behave correctly:

     undefined  — Supabase Auth is not configured (no SUPABASE_URL /
                  key in the environment). Local dev and every
                  existing test run this way today, with no
                  Authorization header at all — this must stay a
                  silent no-op, exactly like Jobs' own
                  loadSupabaseAuthConfigFromEnv() returning null.
     null       — Supabase Auth IS configured, but this specific
                  request has no valid caller (missing header,
                  malformed token, expired/invalid signature).
     string     — Supabase Auth is configured and the token verified;
                  this is the caller's auth.users.id (the `sub` claim).

   Collapsing undefined and null into one "not authenticated" value
   would make it impossible for server.js to tell "auth isn't wired up
   yet, behave as before" apart from "a real request without a valid
   token, reject it" — the same mistake the header comment in
   auth.ts warns against: never fake that a check ran when it didn't.
   ============================================================ */

const { createClient } = require('@supabase/supabase-js');

function loadSupabaseAuthConfigFromEnv() {
  const projectUrl = process.env.SUPABASE_URL;
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!projectUrl || !publicKey) return null;
  return { projectUrl, publicKey };
}

/** Verifies a Supabase-issued access token and returns the `sub` claim
 *  (auth.users.id) if valid, or null if invalid/expired/malformed.
 *  Never touches the database — purely cryptographic, via the
 *  project's own JWKS. */
async function verifySupabaseJWT(config, token) {
  try {
    const client = createClient(config.projectUrl, config.publicKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data, error } = await client.auth.getClaims(token);
    if (error) return null;
    const sub = data && data.claims ? data.claims.sub : undefined;
    return typeof sub === 'string' && sub.length > 0 ? sub : null;
  } catch {
    return null;
  }
}

/** See the module header for the meaning of each of the three
 *  possible return values. */
async function resolveAuthenticatedUserId(authorizationHeader) {
  const config = loadSupabaseAuthConfigFromEnv();
  if (!config) return undefined;

  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) return null;
  const token = authorizationHeader.slice('Bearer '.length).trim();
  if (!token) return null;

  return await verifySupabaseJWT(config, token);
}

module.exports = { loadSupabaseAuthConfigFromEnv, verifySupabaseJWT, resolveAuthenticatedUserId };
