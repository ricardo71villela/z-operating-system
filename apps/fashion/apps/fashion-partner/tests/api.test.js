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

  // Real Products, owned by partner_atelier, to exercise Stock against —
  // Stock now requires the Product to actually exist and belong to the
  // calling Partner (ownership check closed 2026-08-21), so arbitrary
  // string ids no longer work here.
  res = await request('POST', '/partners/partner_atelier/brands', { name: 'Atelier du Marais (stock fixtures)' });
  const stockBrandId = res.body.brand.id;

  res = await request('POST', '/partners/partner_atelier/products', {
    brandId: stockBrandId, names: { fr: 'Sac (fixture stock)' }, gender: 'unisex',
    categories: ['accessories_leather_goods'],
  });
  const bagId = res.body.product.id;

  res = await request('POST', '/partners/partner_atelier/products', {
    brandId: stockBrandId, names: { fr: 'Chaussure (fixture stock)' }, gender: 'unisex',
    categories: ['accessories_leather_goods'],
  });
  const shoeId = res.body.product.id;

  res = await request('POST', '/partners/partner_atelier/products', {
    brandId: stockBrandId, names: { fr: 'Ceinture (fixture stock)' }, gender: 'unisex',
    categories: ['accessories_leather_goods'],
  });
  const beltId = res.body.product.id;

  // Stock feed over HTTP, now Partner-scoped in the route.
  res = await request('POST', `/partners/partner_atelier/stock/${bagId}`, { quantityAvailable: 5, observedAt: '2026-08-20T10:00:00.000Z' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.sellable, 5);

  // A stale update is rejected over HTTP.
  res = await request('POST', `/partners/partner_atelier/stock/${bagId}`, { quantityAvailable: 20, observedAt: '2026-08-20T09:00:00.000Z' });
  assert.strictEqual(res.status, 422);
  assert.ok(/stale update rejected/.test(res.body.error));

  res = await request('GET', `/partners/partner_atelier/stock/${bagId}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.stock.quantityAvailable, 5);

  // A different Partner cannot update or read this Partner's stock —
  // ownership check closes the gap flagged in STOCK-FEED-CONTRACT.md.
  res = await request('POST', `/partners/partner_other/stock/${bagId}`, { quantityAvailable: 99, observedAt: '2026-08-20T11:00:00.000Z' });
  assert.strictEqual(res.status, 403);
  assert.ok(/does not belong to partner/.test(res.body.error));

  res = await request('GET', `/partners/partner_other/stock/${bagId}`);
  assert.strictEqual(res.status, 403);

  // The rejected cross-Partner attempt never touched the real stock.
  res = await request('GET', `/partners/partner_atelier/stock/${bagId}`);
  assert.strictEqual(res.body.stock.quantityAvailable, 5);

  // A stock update for a Product that doesn't exist at all is a 404,
  // never silently accepted.
  res = await request('POST', '/partners/partner_atelier/stock/does_not_exist', { quantityAvailable: 1, observedAt: '2026-08-20T11:00:00.000Z' });
  assert.strictEqual(res.status, 404);

  // --- Public Catalog read surface over HTTP ---

  // No price recorded yet — a clear 422, never a fabricated price.
  res = await request('GET', `/catalog/products/${bagId}`);
  assert.strictEqual(res.status, 422);
  assert.ok(/no price recorded/.test(res.body.error));

  // A brand-new Product, created with an initial price this time, to
  // exercise the full Catalog view model.
  res = await request('POST', '/partners/partner_atelier/products', {
    brandId: stockBrandId, names: { fr: 'Escarpins catalogue' }, gender: 'female',
    categories: ['footwear'], size: { system: 'EU', value: 38 }, priceMinorUnits: 13900,
  });
  const catalogProductId = res.body.product.id;
  res = await request('POST', `/partners/partner_atelier/stock/${catalogProductId}`, { quantityAvailable: 4, observedAt: '2026-08-20T10:00:00.000Z' });
  assert.strictEqual(res.status, 200);

  res = await request('GET', `/catalog/products/${catalogProductId}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.productPage.productId, catalogProductId);
  assert.strictEqual(res.body.productPage.price.amountMinorUnits, 13900);
  assert.strictEqual(res.body.productPage.availability.label, 'low_stock'); // 4 <= LOW_STOCK_THRESHOLD
  assert.strictEqual(res.body.productPage.seller.legalName, 'Atelier du Marais');

  // A non-existent Product is a 404, same as every other read endpoint.
  res = await request('GET', '/catalog/products/does_not_exist');
  assert.strictEqual(res.status, 404);

  // --- Public All Sale listing over HTTP ---

  // A second Product, different gender, to prove filtering is real.
  res = await request('POST', '/partners/partner_atelier/products', {
    brandId: stockBrandId, names: { fr: 'Chemise homme' }, gender: 'male',
    categories: ['clothing'], size: { system: 'alpha', value: 'L' },
  });
  const menswearId = res.body.product.id;
  await request('POST', `/partners/partner_atelier/stock/${menswearId}`, { quantityAvailable: 10, observedAt: '2026-08-20T10:00:00.000Z' });

  res = await request('GET', '/catalog/all-sale');
  assert.strictEqual(res.status, 200);
  // Every previously-created sellable, priced, non-cornerExclusive
  // Product shows up — at minimum the female catalogProductId and this
  // new male menswearId.
  const ids = res.body.products.map((p) => p.productId);
  assert.ok(ids.includes(catalogProductId));
  assert.ok(ids.includes(menswearId));

  // Filtering by gender is real — never a decorative query param.
  res = await request('GET', '/catalog/all-sale?gender=male');
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.products.every((p) => p.gender === 'male'));
  assert.ok(res.body.products.map((p) => p.productId).includes(menswearId));
  assert.ok(!res.body.products.map((p) => p.productId).includes(catalogProductId));

  // Each card carries the decoration a listing needs: availability,
  // price, and the selling Corner's (Partner's) name — never just a
  // bare Product record.
  const menswearCard = res.body.products.find((p) => p.productId === menswearId);
  assert.strictEqual(menswearCard.availability.label, 'in_stock'); // 10 > LOW_STOCK_THRESHOLD
  assert.strictEqual(menswearCard.priceMinorUnits, null); // no price recorded for this fixture — honest, never fabricated
  assert.strictEqual(menswearCard.cornerName, 'Atelier du Marais');

  // Filtering by size: only sizeless/mismatched Products are excluded.
  res = await request('GET', '/catalog/all-sale?category=footwear&sizeValue=38');
  assert.ok(res.body.products.map((p) => p.productId).includes(catalogProductId));

  res = await request('GET', '/catalog/all-sale?category=footwear&sizeValue=41');
  assert.ok(!res.body.products.map((p) => p.productId).includes(catalogProductId));

  // --- Corner Config + public Corners directory over HTTP ---

  // No Corner configured yet — the directory is empty, never fabricated
  // from legalName as a stand-in.
  res = await request('GET', '/catalog/corners');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.corners.find((c) => c.partnerId === 'partner_atelier'), undefined);

  // Requesting a Corner detail before it's configured is a 404.
  res = await request('GET', '/catalog/corners/partner_atelier');
  assert.strictEqual(res.status, 404);

  // byline over 140 chars is rejected — corner-config.js's own rule,
  // reached over HTTP.
  res = await request('POST', '/partners/partner_atelier/corner-config', {
    displayName: 'Atelier du Marais', byline: 'x'.repeat(141), logoUrl: 'https://example.com/logo.png',
  });
  assert.strictEqual(res.status, 422);
  assert.ok(/exceeds 140 characters/.test(res.body.error));

  res = await request('POST', '/partners/partner_atelier/corner-config', {
    displayName: 'Atelier du Marais', byline: 'Prêt-à-porter parisien depuis 2015.',
    accentColor: '#C97C7C', logoUrl: 'https://example.com/logo.png',
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.cornerConfig.displayName, 'Atelier du Marais');

  // Now the Corner appears in the public directory.
  res = await request('GET', '/catalog/corners');
  assert.ok(res.body.corners.some((c) => c.partnerId === 'partner_atelier'));

  // Corner detail returns this Partner's products, decorated like an
  // All Sale card — and includes cornerExclusive Products (All Sale
  // deliberately excludes them, Corner detail does not, same
  // distinction DOMAIN-SKETCH.md already establishes).
  res = await request('POST', '/partners/partner_atelier/products', {
    brandId: stockBrandId, names: { fr: 'Pièce exclusive Corner' }, gender: 'unisex',
    categories: ['accessories_leather_goods'], cornerExclusive: true,
  });
  const exclusiveId = res.body.product.id;

  res = await request('GET', '/catalog/corners/partner_atelier');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.cornerConfig.displayName, 'Atelier du Marais');
  const cornerIds = res.body.products.map((p) => p.productId);
  assert.ok(cornerIds.includes(catalogProductId));
  assert.ok(cornerIds.includes(menswearId));
  assert.ok(cornerIds.includes(exclusiveId)); // cornerExclusive shows here

  // A different Partner's Corner detail never leaks partner_atelier's Products.
  res = await request('POST', '/partners', { id: 'partner_other_corner', legalName: 'Autre Boutique', countryIso: 'FR', locales: ['fr'], categories: ['clothing'] });
  await request('POST', '/partners/partner_other_corner/transition', { toStatus: 'under_review' });
  await request('POST', '/partners/partner_other_corner/transition', { toStatus: 'approved' });
  await request('POST', '/partners/partner_other_corner/transition', { toStatus: 'active', feedReliabilityTier: 'live' });
  res = await request('POST', '/partners/partner_other_corner/corner-config', {
    displayName: 'Autre Boutique', logoUrl: 'https://example.com/other.png',
  });
  assert.strictEqual(res.status, 200);
  res = await request('GET', '/catalog/corners/partner_other_corner');
  assert.strictEqual(res.body.products.length, 0);

  // --- Bulk stock feed over HTTP ---
  res = await request('POST', '/partners/partner_atelier/stock/bulk', {
    updates: [
      { productId: shoeId, quantityAvailable: 12, observedAt: '2026-08-20T10:00:00.000Z' },
      { productId: beltId, quantityAvailable: 8, observedAt: '2026-08-20T10:00:00.000Z' },
      // stale relative to bagId's already-applied 10:00 update — this one item should fail
      { productId: bagId, quantityAvailable: 99, observedAt: '2026-08-20T09:00:00.000Z' },
    ],
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.summary.total, 3);
  assert.strictEqual(res.body.summary.ok, 2);
  assert.strictEqual(res.body.summary.failed, 1);
  const shoeResult = res.body.results.find((r) => r.productId === shoeId);
  assert.strictEqual(shoeResult.ok, true);
  assert.strictEqual(shoeResult.sellable, 12);
  const bagResult = res.body.results.find((r) => r.productId === bagId);
  assert.strictEqual(bagResult.ok, false);
  assert.ok(/stale update rejected/.test(bagResult.error));

  // bagId's stock is untouched by its own failed item in the batch —
  // still 5 from the single-item update earlier, the stale bulk item
  // never silently overwrote it.
  res = await request('GET', `/partners/partner_atelier/stock/${bagId}`);
  assert.strictEqual(res.body.stock.quantityAvailable, 5);

  // A bulk item for a foreign-owned Product fails only that item, same
  // per-item discipline as a stale item.
  res = await request('POST', '/partners/partner_other/stock/bulk', {
    updates: [{ productId: shoeId, quantityAvailable: 1, observedAt: '2026-08-20T12:00:00.000Z' }],
  });
  assert.strictEqual(res.body.summary.failed, 1);
  assert.ok(/does not belong to partner/.test(res.body.results[0].error));

  // A non-array `updates` is rejected outright, never partially processed.
  res = await request('POST', '/partners/partner_atelier/stock/bulk', { updates: 'not-an-array' });
  assert.strictEqual(res.status, 400);

  // --- Shipment lifecycle over HTTP ---
  res = await request('POST', '/shipments', {
    orderId: 'order_48213', partnerId: 'partner_atelier', productIds: [productId],
  });
  assert.strictEqual(res.status, 201);
  const shipmentId = res.body.shipment.id;
  assert.strictEqual(res.body.shipment.status, 'confirmed');

  res = await request('GET', '/partners/partner_atelier/shipments');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.shipments.length, 1);

  res = await request('POST', `/shipments/${shipmentId}/transition`, { toStatus: 'preparing' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.shipment.status, 'preparing');

  // Skipping straight to 'delivered' is rejected over HTTP too.
  res = await request('POST', `/shipments/${shipmentId}/transition`, { toStatus: 'delivered' });
  assert.strictEqual(res.status, 422);
  assert.ok(/cannot move from "preparing" to "delivered"/.test(res.body.error));

  res = await request('POST', `/shipments/${shipmentId}/transition`, { toStatus: 'shipped' });
  assert.strictEqual(res.status, 200);
  res = await request('POST', `/shipments/${shipmentId}/transition`, { toStatus: 'delivered' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.shipment.status, 'delivered');
  assert.ok(res.body.shipment.deliveredAt);

  // --- Return lifecycle over HTTP ---
  res = await request('POST', '/returns', {
    orderId: 'order_48213', partnerId: 'partner_atelier', productId,
    deliveredAt: res.body.shipment.deliveredAt, reason: 'Ne convient pas',
  });
  assert.strictEqual(res.status, 201);
  const returnId = res.body.return.id;
  assert.strictEqual(res.body.return.status, 'requested');

  res = await request('GET', '/partners/partner_atelier/returns');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.returns.length, 1);

  res = await request('POST', `/returns/${returnId}/transition`, { toStatus: 'approved' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.return.status, 'approved');

  server.close();
  console.log('fashion-partner API: all integration checks passed.');
}

run().catch((err) => { console.error(err); server.close(); process.exit(1); });
