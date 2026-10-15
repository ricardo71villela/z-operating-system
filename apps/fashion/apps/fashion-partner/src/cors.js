/* ============================================================
   Z FASHION PARTNER — CORS
   ============================================================
   The Partner dashboard and the admin backoffice are static pages on
   their own origins and call this API with an Authorization header,
   which makes every request a CORS preflight. Only origins listed in
   FASHION_ALLOWED_ORIGINS (comma-separated, exact match, e.g.
   "https://partner.zfashion.online,https://admin.zfashion.online")
   receive CORS headers; any other origin gets none, so the browser
   blocks the response. No wildcard, no reflection of arbitrary
   origins. Pure — tested in tests/cors.test.js.
   ============================================================ */

function loadAllowedOrigins(env = process.env) {
  return (env.FASHION_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/** Headers to add for this request's Origin, or {} if not allowed. */
function corsHeadersFor(origin, allowedOrigins) {
  if (!origin || !allowedOrigins.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

module.exports = { loadAllowedOrigins, corsHeadersFor };
