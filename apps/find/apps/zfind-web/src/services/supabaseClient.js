/* ============================================================
   Z FIND — SUPABASE CLIENT (shared configuration)
   ============================================================
   Uses ONLY the Project URL and the publishable (anon) key — both
   are safe to expose in client-side code (they are subject to RLS,
   never bypass it). This file must NEVER read or reference a
   service_role key or a database password — neither exists in this
   codebase, by design, and neither should ever be added here.

   Configuration source (Sprint 1.1 — UMD adaptation, logic unchanged):
   - In Node (tests, scripts): process.env.SUPABASE_URL / SUPABASE_ANON_KEY,
     exactly as before.
   - In the browser (the built prototype): window.__ZFIND_CONFIG__,
     populated at build time by scripts/build.js using the exact same
     placeholder-substitution mechanism already used for the logo
     (__PATH_D__) — see BROWSER-CONFIG-STRATEGY.md, which proposed this
     approach; this is its first real implementation.
   Both must be set. Missing either fails loudly and immediately — this
   module never falls back to a guessed or empty value, in either
   environment.

   Module loading (Sprint 1.1): this file now uses a small UMD-style
   wrapper so the SAME source — same logic, same tests already proven
   against it — works as a Node module (require/module.exports, for
   the existing test suite) AND as a plain browser <script> tag (no
   bundler; the built prototype is still one static HTML file). Only
   the outer loading shell changed; getSupabaseClient() and safeQuery()
   below are byte-identical in behavior to the pre-Sprint-1.1 version.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    // Node path (tests, scripts/test-connectivity.js) — unchanged.
    module.exports = factory(require('@supabase/supabase-js').createClient, null);
  } else {
    // Browser path — no require(); createClient comes from the
    // Supabase UMD build loaded via <script> tag (see body.html),
    // which exposes a global `supabase.createClient`.
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.supabaseClient = factory(root.supabase && root.supabase.createClient, root.__ZFIND_CONFIG__);
  }
})(typeof window !== 'undefined' ? window : this, function (createClient, browserConfig) {

let _client = null;

function readConfig() {
  const isNode = typeof process !== 'undefined' && process.env && Object.keys(process.env).length > 0;
  if (isNode) {
    return { url: process.env.SUPABASE_URL, anonKey: process.env.SUPABASE_ANON_KEY, source: 'process.env (Node)' };
  }
  return {
    url: browserConfig && browserConfig.supabaseUrl,
    anonKey: browserConfig && browserConfig.supabaseAnonKey,
    source: 'window.__ZFIND_CONFIG__ (browser, injected at build time)',
  };
}

function getSupabaseClient() {
  if (_client) return _client;

  if (typeof createClient !== 'function') {
    throw new Error(
      'Supabase client configuration error: the Supabase SDK was not found. ' +
      'In the browser this means the Supabase UMD <script> tag did not load before this file ran — check body.html.'
    );
  }

  const { url, anonKey, source } = readConfig();

  const missing = [];
  if (!url) missing.push('SUPABASE_URL');
  if (!anonKey) missing.push('SUPABASE_ANON_KEY');
  if (missing.length) {
    throw new Error(
      `Supabase client configuration error: missing required value(s): ${missing.join(', ')} (expected via ${source}). ` +
      `See .env.example (Node) or the build-time config injection (browser) — Project URL and publishable key from Supabase Project Settings → API.`
    );
  }

  // Defensive check: a service_role key is a long JWT; the publishable
  // key has its own distinct prefix. This does not guarantee misuse is
  // impossible, but it catches the most common accidental mistake of
  // pasting the wrong key.
  if (anonKey.startsWith('eyJ') && anonKey.length > 200) {
    throw new Error(
      'Supabase client configuration error: SUPABASE_ANON_KEY looks like it may be a service_role JWT, not the publishable key. ' +
      'Refusing to start — this must never be used in client-side code.'
    );
  }

  _client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return _client;
}

/** Wraps a Supabase call with consistent, explicit error handling for
    every failure mode this layer must account for. Never throws a raw
    Supabase/network error up to the UI unshaped.

    `allowNullData` (Sprint 1.6 final correction): for write-only
    operations submitted WITHOUT .select() — the correct, minimal-
    privilege way to INSERT when the caller only has INSERT grant, not
    SELECT (exactly leads' real grant: `grant insert on leads to
    anon`, no SELECT) — Postgrest returns `Prefer: return=minimal`,
    an empty body, and therefore `data === null` on genuine success.
    Without this flag, safeQuery previously classified that as
    `empty_result` (an error) — meaning a lead could be inserted
    successfully and the UI would still report failure to the
    visitor. Confirmed directly against the installed SDK's response
    parser (PostgrestBuilder.ts): body === '' leaves data as null with
    no error, deliberately, for exactly this case. */
async function safeQuery(queryFn, context, options) {
  const allowNullData = !!(options && options.allowNullData);
  let result;
  try {
    result = await queryFn();
  } catch (networkErr) {
    // A genuinely thrown exception — e.g. DNS failure, connection
    // refused, or any error the underlying fetch layer raised instead
    // of returning as a normal {data, error} result.
    return { data: null, error: { type: 'network_failure', context, message: networkErr.message } };
  }

  const { data, error, status, count } = result || {};

  if (error) {
    // IMPORTANT: `status` lives on the top-level result object, not
    // nested inside `error` — supabase-js returns { data, error, count,
    // status, statusText }, and `error` itself is typically just
    // { message }. Checking `error.status` here was a real bug caught
    // by testing against this sandbox's own network-blocking proxy,
    // which returns a 403 in exactly this shape for a disallowed host.
    const looksLikeNetworkFailure =
      status == null || status === 0 ||
      /network|fetch failed|allowlist|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(error.message || '');

    // Sprint 1.4: PostgREST's .single() returns HTTP 406 with error
    // code PGRST116 when a query matches zero rows — this IS an empty
    // result (the row genuinely doesn't exist, or RLS hides it), not a
    // malformed request. Caught here, not by the .single()-using
    // caller, so every current and future caller gets this right
    // automatically, not just the one that happened to expose it.
    const isSingleRowNotFound = error.code === 'PGRST116' || status === 406;

    const type = looksLikeNetworkFailure
      ? 'network_failure'
      : isSingleRowNotFound
        ? 'empty_result'
        : (error.code === 'PGRST301' || status === 401 || status === 403)
          ? 'authorization_failure'
          : 'malformed_response';

    return { data: null, error: { type, context, message: error.message || 'Unknown Supabase error', code: error.code || null, status: status ?? null } };
  }

  if (data === null || data === undefined) {
    // Real bug, found and fixed while diagnosing a lead-safety check
    // that silently never fired: a { count:'exact', head:true } query
    // has data===null BY DESIGN (head:true returns no rows), but count
    // is real and meaningful — dropping it here made every count-only
    // check silently see `undefined`, always false, never blocking.
    if (allowNullData) return { data: null, error: null, count: count ?? null };
    return { data: null, error: { type: 'empty_result', context, message: 'Query succeeded but returned no data.' } };
  }

  if (Array.isArray(data) && data.length === 0) {
    return { data: [], error: null, count: count ?? null }; // an empty array is a valid, non-error result — distinct from `empty_result` above
  }

  return { data, error: null, count: count ?? null };
}

/** Resolves a media_assets/media_variants storage path to a URL the
    browser can actually fetch. The 'listing-media' bucket is PRIVATE
    (public: false, confirmed in migration 0001) — a bare path like
    'listings/plot-01.jpg' is never a usable URL by itself, and even a
    manually-constructed "public object" URL would not work against a
    private bucket. createSignedUrl() is the correct mechanism: it is
    a real Storage API call, subject to the EXISTING storage.objects
    RLS policy (no RLS/GRANT/migration change needed here at all) and
    returns a temporary but genuinely fetchable URL.

    Shared by both Property and Development — this was one defect in
    one mechanism, not two separate bugs, so there is exactly one fix. */
async function resolveMediaUrl(storagePath, bucket, expirySeconds) {
  if (!storagePath) return null;
  if (/^https?:\/\//i.test(storagePath)) return storagePath; // already absolute — never corrupt it by re-wrapping

  const client = getSupabaseClient();
  const targetBucket = bucket || 'listing-media';
  // Default (1 hour) is correct for a live browsing session — a
  // visitor's page is generated and consumed within minutes. Static
  // SEO pages are different: they're generated once and expected to
  // stay crawlable/shareable (Google, Facebook/OG scrapers) for weeks
  // — a 1-hour signed URL would go dead long before the page is ever
  // recrawled. Callers generating static pages must pass a long
  // expiry explicitly; this default never changes silently under them.
  const expiry = expirySeconds || 3600;
  try {
    const { data, error } = await client.storage.from(targetBucket).createSignedUrl(storagePath, expiry);
    if (error || !data || !data.signedUrl) return null;
    return data.signedUrl;
  } catch (e) {
    return null;
  }
}

return { getSupabaseClient, safeQuery, resolveMediaUrl };

});
