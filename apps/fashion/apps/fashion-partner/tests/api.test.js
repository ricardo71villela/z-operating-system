/* Run with: node apps/fashion/apps/fashion-partner/tests/api.test.js
   Boots the real HTTP server and exercises it with real requests —
   proves the fashion-domain wiring works over the wire, not just as
   direct function calls in the domain package's own tests. */

const assert = require('assert');
const http = require('http');
const { server } = require('../src/server');

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      { hostname: '127.0.0.1', port: PORT, path, method, headers: { 'Content-Type': 'application/json' } },
      (res) => {
        let chunks = '';
        res.on('data', (c) => { chunks += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(chunks) }));
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const PORT = 4099;

async function run() {
  await new Promise((resolve) => server.listen(PORT, resolve));

  // Apply a Partner over HTTP — real createPartner() validation runs behind this.
  let res = await request('POST', '/partners', {
    id: 'partner_atelier', legalName: 'Atelier du Marais', countryIso: 'FR',
    locales: ['fr'], categories: ['accessories_leather_goods'],
  });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.application.status, 'applied');

  // Invalid application (bad countryIso) is rejected over HTTP with 422,
  // proving the @zos/geography validation reaches all the way to the wire.
  res = await request('POST', '/partners', {
    id: 'partner_bad', legalName: 'X', countryIso: 'ZZ',
    locales: ['fr'], categories: ['clothing'],
  });
  assert.strictEqual(res.status, 422);
  assert.ok(/not a recognized Country/.test(res.body.error));

  // Transition through the onboarding state machine over HTTP.
  res = await request('POST', '/partners/partner_atelier/transition', { toStatus: 'under_review' });
  assert.strictEqual(res.status, 200);
  res = await request('POST', '/partners/partner_atelier/transition', { toStatus: 'approved' });
  assert.strictEqual(res.status, 200);

  // Activating without a feed reliability tier is rejected over HTTP too.
  res = await request('POST', '/partners/partner_atelier/transition', { toStatus: 'active' });
  assert.strictEqual(res.status, 422);
  assert.ok(/without a declared feed reliability tier/.test(res.body.error));

  res = await request('POST', '/partners/partner_atelier/transition', {
    toStatus: 'active', feedReliabilityTier: 'live',
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.application.status, 'active');

  // Stock feed over HTTP.
  res = await request('POST', '/stock/prod_bag', { quantityAvailable: 5, observedAt: '2026-08-20T10:00:00.000Z' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.sellable, 5);

  // A stale update is rejected over HTTP.
  res = await request('POST', '/stock/prod_bag', { quantityAvailable: 20, observedAt: '2026-08-20T09:00:00.000Z' });
  assert.strictEqual(res.status, 422);
  assert.ok(/stale update rejected/.test(res.body.error));

  res = await request('GET', '/stock/prod_bag');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.stock.quantityAvailable, 5);

  // Brand creation over HTTP — a Product cannot exist without one.
  res = await request('POST', '/partners/partner_atelier/brands', { name: 'Atelier du Marais' });
  assert.strictEqual(res.status, 201);
  const brandId = res.body.brand.id;
  assert.strictEqual(res.body.brand.name, 'Atelier du Marais');

  // Product creation over HTTP — real createProduct() validation runs
  // behind this, same as Partner over /partners.
  res = await request('POST', '/partners/partner_atelier/products', {
    brandId, names: { fr: 'Sac besace en cuir' }, gender: 'unisex',
    categories: ['accessories_leather_goods'],
  });
  assert.strictEqual(res.status, 201);
  const productId = res.body.product.id;
  assert.strictEqual(res.body.product.names.fr, 'Sac besace en cuir');
  assert.strictEqual(res.body.product.partnerId, 'partner_atelier');

  // Missing required fields (gender) rejected over HTTP with 422, same
  // validation as direct createProduct() calls.
  res = await request('POST', '/partners/partner_atelier/products', {
    brandId, names: { fr: 'Ceinture' }, categories: ['accessories_leather_goods'],
  });
  assert.strictEqual(res.status, 422);
  assert.ok(/gender is required/.test(res.body.error));

  // A Sportswear Product without size is rejected over HTTP too — the
  // sized-category rule reaches all the way to the wire.
  res = await request('POST', '/partners/partner_atelier/products', {
    brandId, names: { fr: 'Legging' }, gender: 'female',
    categories: ['clothing', 'sportswear'], technicalPurpose: true,
  });
  assert.strictEqual(res.status, 422);
  assert.ok(/require a `size`/.test(res.body.error));

  // Listing a Partner's products over HTTP returns what was created —
  // never another Partner's Products.
  res = await request('GET', '/partners/partner_atelier/products');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.products.length, 1);
  assert.strictEqual(res.body.products[0].id, productId);

  // Fetching a single Product by id over HTTP.
  res = await request('GET', `/products/${productId}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.product.id, productId);

  // A non-existent Product returns 404, never a silent empty success.
  res = await request('GET', '/products/does_not_exist');
  assert.strictEqual(res.status, 404);

  server.close();
  console.log('fashion-partner API: all integration checks passed.');
}

run().catch((err) => { console.error(err); server.close(); process.exit(1); });
