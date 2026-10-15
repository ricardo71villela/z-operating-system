/* ============================================================
   Z FASHION PARTNER — HTTP auth gate tests (Postgres mode)
   ============================================================
   Starts the real server in Postgres mode against an address where no
   database listens. Every scoped route must be refused by the auth
   gate BEFORE any query is attempted — if a route reached the
   database, it would fail with a connection error (400) instead of
   the expected 503/401, and this test would catch it.

   Part 1: auth not configured        -> 503 on every scoped route
   Part 2: auth configured, no token  -> 401 on every scoped route
   Public catalog routes are not in scope here (they are public by
   design) and are not called, since they would need a database.
   ============================================================ */

const assert = require('assert');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const SERVER = path.join(__dirname, '..', 'src', 'server.js');
const UNREACHABLE_DB = 'postgres://nobody:nothing@127.0.0.1:1/none';

const CLIENT = '11111111-1111-1111-1111-111111111111';
const PARTNER = '22222222-2222-2222-2222-222222222222';

const SCOPED_ROUTES = [
  ['GET', '/me'],
  ['POST', '/partner-applications', { tradeName: 'x' }],
  ['GET', '/admin/partner-applications'],
  ['GET', `/admin/partner-applications/${PARTNER}`],
  ['POST', `/admin/partner-applications/${PARTNER}/decision`, { toStatus: 'under_review' }],
  ['GET', `/partners/${PARTNER}/application`],
  ['GET', `/partners/${PARTNER}/brands`],
  ['GET', `/partners/${PARTNER}/inventory`],
  ['POST', `/partners/${PARTNER}/products/some-id/price`, { priceMinorUnits: 1000 }],
  ['GET', `/partners/${PARTNER}/corner-config`],
  ['POST', `/partners/${PARTNER}/products/some-id/images`, { x: 1 }],
  ['POST', `/partners/${PARTNER}/products/some-id/images/order`, { imageIds: [] }],
  ['DELETE', `/partners/${PARTNER}/products/some-id/images/img`],
  ['POST', `/partners/${PARTNER}/logo`, { x: 1 }],
  ['POST', `/partners/${PARTNER}/transition`, { toStatus: 'approved' }],
  ['POST', `/partners/${PARTNER}/brands`, { name: 'X' }],
  ['GET', `/partners/${PARTNER}/products`],
  ['POST', `/partners/${PARTNER}/stock/bulk`, { updates: [] }],
  ['GET', `/partners/${PARTNER}/commission`],
  ['POST', '/shipments', { orderId: 'o', partnerId: PARTNER, productIds: ['p'] }],
  ['POST', '/shipments/some-id/transition', { toStatus: 'shipped' }],
  ['POST', '/returns', { orderId: 'o', partnerId: PARTNER, productId: 'p' }],
  ['POST', '/returns/some-id/transition', { toStatus: 'approved' }],
  ['GET', `/clients/${CLIENT}/wishlist`],
  ['POST', `/clients/${CLIENT}/wishlist`, { productId: 'p' }],
  ['DELETE', `/clients/${CLIENT}/wishlist/p`],
  ['GET', `/clients/${CLIENT}/follows`],
  ['GET', `/clients/${CLIENT}/addresses`],
  ['POST', `/clients/${CLIENT}/addresses`, { line1: 'x' }],
  ['GET', `/clients/${CLIENT}/cart`],
  ['PUT', `/clients/${CLIENT}/cart/items/${PARTNER}`, { quantity: 1 }],
  ['DELETE', `/clients/${CLIENT}/cart/items/${PARTNER}`],
  ['POST', `/clients/${CLIENT}/checkout`, { addressId: PARTNER }],
  ['GET', `/clients/${CLIENT}/orders`],
  ['GET', `/clients/${CLIENT}/orders/${PARTNER}`],
  ['POST', `/clients/${CLIENT}/orders/${PARTNER}/cancel`],
  ['POST', `/clients/${CLIENT}/orders/${PARTNER}/payment`],
  ['GET', `/partners/${PARTNER}/orders`],
  ['GET', `/partners/${PARTNER}/payouts`],
  ['POST', `/partners/${PARTNER}/payouts/onboarding`],
  ['POST', `/partners/${PARTNER}/payouts/dashboard`],
  ['GET', '/admin/payouts'],
  ['POST', '/admin/payouts/run'],
];

function request(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      { host: '127.0.0.1', port, method, path: urlPath, headers: data ? { 'Content-Type': 'application/json' } : {} },
      (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : null }));
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function rawRequest(port, method, urlPath, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: urlPath, headers }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
}

function startServer(port, extraEnv) {
  const env = { ...process.env, DATABASE_URL: UNREACHABLE_DB, PORT: String(port), ...extraEnv };
  delete env.SUPABASE_URL; delete env.SUPABASE_PUBLISHABLE_KEY; delete env.SUPABASE_ANON_KEY;
  delete env.FASHION_ALLOW_UNAUTHENTICATED;
  Object.assign(env, extraEnv);
  const child = spawn(process.execPath, ['-e', `
    const { server } = require(${JSON.stringify(SERVER)});
    server.listen(${port}, () => console.log('READY'));
  `], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((resolve, reject) => {
    child.stdout.on('data', (c) => { if (String(c).includes('READY')) resolve(child); });
    child.stderr.on('data', (c) => process.stderr.write(c));
    child.on('exit', (code) => reject(new Error(`server exited early (${code})`)));
  });
}

function runStartup(extraEnv) {
  const env = { ...process.env, DATABASE_URL: UNREACHABLE_DB, PORT: '0', ...extraEnv };
  delete env.SUPABASE_URL; delete env.SUPABASE_PUBLISHABLE_KEY; delete env.SUPABASE_ANON_KEY;
  delete env.FASHION_ALLOW_UNAUTHENTICATED;
  Object.assign(env, extraEnv);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SERVER], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.on('data', (c) => { err += c; });
    const timer = setTimeout(() => { child.kill(); resolve({ code: 'running', err }); }, 1500);
    child.on('exit', (code) => { clearTimeout(timer); resolve({ code, err }); });
  });
}

(async () => {
  // Startup guard: Postgres mode without auth refuses to start.
  const refused = await runStartup({});
  assert.strictEqual(refused.code, 1, 'server must exit(1) without Supabase Auth in Postgres mode');
  assert.ok(refused.err.includes('refusing to start'));

  // Explicit opt-out still starts (local disposable DB only).
  const optedOut = await runStartup({ FASHION_ALLOW_UNAUTHENTICATED: '1' });
  assert.strictEqual(optedOut.code, 'running');

  // Part 1 — request-level guard (e.g. env removed after boot): 503.
  let child = await startServer(4711, {});
  try {
    for (const [method, urlPath, body] of SCOPED_ROUTES) {
      const res = await request(4711, method, urlPath, body);
      assert.strictEqual(res.status, 503, `${method} ${urlPath} must be 503 without auth config, got ${res.status} ${JSON.stringify(res.body)}`);
    }
  } finally { child.kill(); }

  // Part 2 — auth configured, no Authorization header: 401.
  child = await startServer(4712, {
    SUPABASE_URL: 'https://example.invalid', SUPABASE_PUBLISHABLE_KEY: 'test-key',
    FASHION_ALLOWED_ORIGINS: 'https://admin.example.test',
  });
  try {
    // CORS preflight: allowed origin gets headers, others get none.
    const ok = await rawRequest(4712, 'OPTIONS', '/me', { Origin: 'https://admin.example.test', 'Access-Control-Request-Method': 'GET' });
    assert.strictEqual(ok.status, 204);
    assert.strictEqual(ok.headers['access-control-allow-origin'], 'https://admin.example.test');
    assert.match(ok.headers['access-control-allow-headers'], /Authorization/);
    const bad = await rawRequest(4712, 'OPTIONS', '/me', { Origin: 'https://evil.example.test', 'Access-Control-Request-Method': 'GET' });
    assert.strictEqual(bad.status, 403);
    assert.strictEqual(bad.headers['access-control-allow-origin'], undefined);
    const refusedWithCors = await rawRequest(4712, 'GET', '/me', { Origin: 'https://admin.example.test' });
    assert.strictEqual(refusedWithCors.status, 401);
    assert.strictEqual(refusedWithCors.headers['access-control-allow-origin'], 'https://admin.example.test',
      'a 401 must still carry CORS headers so the dashboard can read it');

    // The weekly scheduler route needs its own secret, never a user token.
    const cron = await request(4712, 'POST', '/internal/payouts/run');
    assert.strictEqual(cron.status, 401);

    for (const [method, urlPath, body] of SCOPED_ROUTES) {
      const res = await request(4712, method, urlPath, body);
      assert.strictEqual(res.status, 401, `${method} ${urlPath} must be 401 without a token, got ${res.status} ${JSON.stringify(res.body)}`);
    }
  } finally { child.kill(); }

  console.log('fashion-partner auth gate: all scoped routes refused before touching the database.');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
