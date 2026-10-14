/* ============================================================
   Z FASHION PARTNER — access decisions
   ============================================================
   One place that decides whether a request may proceed, shared by
   the three kinds of caller the API has:

     partner — a person who manages a given fashion.partners row
     client  — a shopper acting on their own account
               (fashion.clients.id = auth.users.id, so a client may only
               act on the clientId equal to their own auth user id)
     admin   — Z Fashion operations staff, listed by auth user id in
               FASHION_ADMIN_USER_IDS until ZOS has a real admin-role
               model (see apps/fashion/docs/architecture/ZOS-ALIGNMENT.md)

   Fail-closed by default. The earlier behavior silently let every
   request through whenever Supabase Auth was not configured, which on
   a production server with a missing environment variable would have
   opened every partner and client route to anyone. Now:

     - in-memory mode (no DATABASE_URL): open, as before — local dev
       and the API test suite run this way;
     - Postgres mode: authentication is REQUIRED. If Supabase Auth is
       not configured, requests are refused with 503 rather than
       allowed. A developer pointing the API at a disposable local
       database can opt out explicitly with
       FASHION_ALLOW_UNAUTHENTICATED=1; it is never the default.

   Pure: no HTTP, no database, no Supabase client. The caller passes
   the already-resolved auth user id (see auth.js for its three-valued
   meaning) and an isAllowed() check, so every branch is unit-tested in
   tests/access.test.js without a server or a database.
   ============================================================ */

function isUnauthenticatedModeAllowed(env = process.env) {
  return env.FASHION_ALLOW_UNAUTHENTICATED === '1';
}

/** True when this process must authenticate every scoped request. */
function isAuthRequired({ usingPostgres, env = process.env }) {
  return usingPostgres && !isUnauthenticatedModeAllowed(env);
}

/** Admin auth user ids from FASHION_ADMIN_USER_IDS (comma-separated).
 *  Empty list = nobody is an admin, so admin routes are refused. */
function loadAdminUserIds(env = process.env) {
  return (env.FASHION_ADMIN_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @param {object} p
 * @param {boolean} p.usingPostgres
 * @param {boolean} p.authRequired      from isAuthRequired()
 * @param {string|null|undefined} p.authUserId  from auth.resolveAuthenticatedUserId()
 * @param {(userId: string) => Promise<boolean>|boolean} p.isAllowed
 * @param {string} p.forbiddenMessage
 * @returns {Promise<{ok: true, userId: string|null} | {ok: false, status: number, error: string}>}
 */
async function decideAccess({ usingPostgres, authRequired, authUserId, isAllowed, forbiddenMessage }) {
  if (!usingPostgres) return { ok: true, userId: null };

  if (authUserId === undefined) {
    if (authRequired) {
      return { ok: false, status: 503, error: 'authentication is not configured on this server' };
    }
    return { ok: true, userId: null };
  }

  if (authUserId === null) {
    return { ok: false, status: 401, error: 'authentication required' };
  }

  if (!(await isAllowed(authUserId))) {
    return { ok: false, status: 403, error: forbiddenMessage };
  }

  return { ok: true, userId: authUserId };
}

module.exports = { isUnauthenticatedModeAllowed, isAuthRequired, loadAdminUserIds, decideAccess };
