/* ============================================================
   Z FASHION API on Vercel — one Node function for every route.
   ============================================================
   The API itself is apps/fashion/apps/fashion-partner/src/server.js
   (the same code the tests run). Vercel sends every path here
   (vercel.json rewrites); the request is handed to that server's
   handler unchanged, raw body included (the Stripe webhook needs the
   exact signed bytes, so no body parsing happens before it).
   Environment variables: see apps/fashion/DEPLOY.md.
   ============================================================ */

const { server } = require('../../fashion-partner/src/server');

module.exports = (req, res) => {
  server.emit('request', req, res);
};

// Stripe webhooks must reach the handler as raw bytes.
module.exports.config = { api: { bodyParser: false } };
