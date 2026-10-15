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

function requestRaw(method, path, bytes, contentType) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port: PORT, path, method, headers: contentType ? { 'Content-Type': contentType } : {} },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          let body = null;
          try { body = JSON.parse(buf.toString()); } catch (e) { body = buf; }
          resolve({ status: res.statusCode, headers: res.headers, body });
        });
      }
    );
    req.on('error', reject);
    if (bytes) req.write(bytes);
    req.end();
  });
}

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

  // --- Client Account: Wishlist, Corner Follows, Addresses over HTTP ---
  const clientId = 'client_ines';

  // Wishlist starts empty.
  res = await request('GET', `/clients/${clientId}/wishlist`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.total, 0);

  res = await request('POST', `/clients/${clientId}/wishlist`, { productId: catalogProductId });
  assert.strictEqual(res.status, 201);
  // Idempotent add — a second identical add is not an error.
  res = await request('POST', `/clients/${clientId}/wishlist`, { productId: catalogProductId });
  assert.strictEqual(res.status, 201);

  res = await request('GET', `/clients/${clientId}/wishlist`);
  assert.strictEqual(res.body.total, 1);
  assert.strictEqual(res.body.products[0].productId, catalogProductId);
  assert.ok(res.body.products[0].name); // decorated like a real listing card, not a bare id

  res = await request('DELETE', `/clients/${clientId}/wishlist/${catalogProductId}`);
  assert.strictEqual(res.status, 200);
  res = await request('GET', `/clients/${clientId}/wishlist`);
  assert.strictEqual(res.body.total, 0);

  // Corner Follows.
  res = await request('GET', `/clients/${clientId}/follows`);
  assert.strictEqual(res.body.total, 0);

  res = await request('POST', `/clients/${clientId}/follows`, { partnerId: 'partner_atelier' });
  assert.strictEqual(res.status, 201);

  res = await request('GET', `/clients/${clientId}/follows`);
  assert.strictEqual(res.body.total, 1);
  assert.strictEqual(res.body.corners[0].displayName, 'Atelier du Marais');

  res = await request('DELETE', `/clients/${clientId}/follows/partner_atelier`);
  assert.strictEqual(res.status, 200);
  res = await request('GET', `/clients/${clientId}/follows`);
  assert.strictEqual(res.body.total, 0);

  // Addresses.
  res = await request('POST', `/clients/${clientId}/addresses`, {
    type: 'shipping', recipientName: 'Inès Moreau', line1: '10 rue de Rivoli',
    postalCode: '75001', city: 'Paris', countryIso: 'FR', isDefault: true,
  });
  assert.strictEqual(res.status, 201);
  const addr1Id = res.body.address.id;
  assert.strictEqual(res.body.address.isDefault, true);

  res = await request('POST', `/clients/${clientId}/addresses`, {
    type: 'shipping', recipientName: 'Inès Moreau (bureau)', line1: '5 avenue Foch',
    postalCode: '75116', city: 'Paris', countryIso: 'FR', isDefault: false,
  });
  const addr2Id = res.body.address.id;

  res = await request('GET', `/clients/${clientId}/addresses`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.total, 2);

  // Setting the second address as default un-defaults the first —
  // never two simultaneous defaults of the same type.
  res = await request('POST', `/clients/${clientId}/addresses/${addr2Id}/set-default`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.address.isDefault, true);

  res = await request('GET', `/clients/${clientId}/addresses`);
  const addr1After = res.body.addresses.find((a) => a.id === addr1Id);
  assert.strictEqual(addr1After.isDefault, false);

  // Invalid address (missing line1) rejected over HTTP, same
  // validation as address.js's createAddress().
  res = await request('POST', `/clients/${clientId}/addresses`, {
    type: 'shipping', line1: '', postalCode: '75001', city: 'Paris', countryIso: 'FR',
  });
  assert.strictEqual(res.status, 422);
  assert.ok(/line1 is required/.test(res.body.error));

  // --- Partner-facing Commission view over HTTP ---
  res = await request('GET', '/partners/partner_atelier/commission');
  assert.strictEqual(res.status, 200);
  // partner_atelier sells one category (accessories) -> EUR 39 HT/month.
  assert.strictEqual(res.body.categoryCount, 1);
  assert.strictEqual(res.body.monthlySubscriptionFeeMinorUnits, 3900);
  assert.strictEqual(res.body.pricesExcludeVat, true);
  assert.strictEqual(res.body.firstMonthFree, true);
  assert.deepStrictEqual(res.body.ticketCommissionTiers.map((t) => t.ratePercent), [10, 8, 6]);
  // No paid Order yet: this month's sales are 0, never estimated.
  assert.strictEqual(res.body.monthlyGmvMinorUnits, 0);
  assert.strictEqual(res.body.monthlyCommissionMinorUnits, 0);
  assert.strictEqual(res.body.monthlyTicketCount, 0);
  assert.ok(res.body.periodStart.endsWith('-01T00:00:00.000Z'));

  res = await request('GET', '/partners/does_not_exist/commission');
  assert.strictEqual(res.status, 404);

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

  // --- Store adhesion (in-memory mode)
  delete process.env.FASHION_PARTNER_TERMS_VERSION; delete process.env.FASHION_PARTNER_TERMS_URL;
  res = await request('GET', '/onboarding/offer');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.applicationsOpen, false, 'no published terms => applications closed');
  assert.deepStrictEqual(res.body.offer.subscriptionTiers.map((t) => [t.minCategories, t.monthlyFeeMinorUnits]), [[1, 3900], [2, 4900], [3, 5900]]);
  assert.deepStrictEqual(res.body.offer.ticketCommissionTiers, [
    { maxTicketMinorUnits: 10000, ratePercent: 10 }, { maxTicketMinorUnits: 20000, ratePercent: 8 }, { maxTicketMinorUnits: null, ratePercent: 6 },
  ]);
  assert.strictEqual(res.body.offer.pricesExcludeVat, true);
  assert.strictEqual(res.body.offer.firstMonthFree, true);
  assert.deepStrictEqual(res.body.launchedMarkets, ['FR']);

  const applicationBody = {
    tradeName: 'Maison Léman', legalName: 'Maison Léman SARL', countryIso: 'FR',
    registrationNumber: '88123456700017', addressLine1: '12 rue Nationale', postalCode: '74200',
    city: 'Thonon-les-Bains', contactPhone: '04 50 00 00 00', categories: ['clothing'],
    ageSegments: ['adults'], acceptTerms: true, termsVersion: 'pt-2027-01', devAccountEmail: 'shop@example.fr',
  };
  res = await request('POST', '/partner-applications', applicationBody);
  assert.strictEqual(res.status, 503);
  assert.strictEqual(res.body.error, 'partner_terms_not_published');

  process.env.FASHION_PARTNER_TERMS_VERSION = 'pt-2027-01';
  process.env.FASHION_PARTNER_TERMS_URL = 'http://not-https.example/terms';
  res = await request('GET', '/onboarding/offer');
  assert.strictEqual(res.body.applicationsOpen, false, 'terms URL must be https');
  process.env.FASHION_PARTNER_TERMS_URL = 'https://zfashion.example/cgv-partenaires';
  res = await request('GET', '/onboarding/offer');
  assert.strictEqual(res.body.applicationsOpen, true);
  assert.deepStrictEqual(res.body.terms, { version: 'pt-2027-01', url: 'https://zfashion.example/cgv-partenaires' });

  res = await request('POST', '/partner-applications', { ...applicationBody, registrationNumber: '12345678901234', acceptTerms: false });
  assert.strictEqual(res.status, 422);
  assert.deepStrictEqual(res.body.fieldErrors.map((e) => e.field).sort(), ['acceptTerms', 'registrationNumber']);

  res = await request('POST', '/partner-applications', applicationBody);
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.onboardingStatus, 'applied');
  const appliedPartnerId = res.body.partnerId;

  // --- Back-office review (task 8) + public catalogue visibility.
  // The applied store adds a product: it must not be visible to shoppers yet.
  res = await request('POST', `/partners/${appliedPartnerId}/brands`, { name: 'Maison Léman' });
  const lemanBrand = res.body.brand.id;
  res = await request('POST', `/partners/${appliedPartnerId}/products`, {
    brandId: lemanBrand, names: { fr: 'Veste Léman' }, gender: 'female', categories: ['clothing'],
    ageSegments: ['adults'], size: { system: 'EU', value: 38 }, priceMinorUnits: 18900,
  });
  assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  const lemanProduct = res.body.product.id;
  await request('POST', `/partners/${appliedPartnerId}/stock/${lemanProduct}`, { quantityAvailable: 3, observedAt: '2026-10-15T08:00:00.000Z' });
  res = await request('POST', `/partners/${appliedPartnerId}/corner-config`, { displayName: 'Maison Léman', logoUrl: 'https://example.com/leman.png' });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  const visible = async () => ({
    allSale: (await request('GET', '/catalog/all-sale')).body.products.some((p) => p.productId === lemanProduct),
    product: (await request('GET', `/products/${lemanProduct}`)).status,
    page: (await request('GET', `/catalog/products/${lemanProduct}`)).status,
    corners: (await request('GET', '/catalog/corners')).body.corners.some((c) => c.partnerId === appliedPartnerId),
    corner: (await request('GET', `/catalog/corners/${appliedPartnerId}`)).status,
  });
  assert.deepStrictEqual(await visible(), { allSale: false, product: 404, page: 404, corners: false, corner: 404 },
    'an applied store is invisible to shoppers');

  res = await request('GET', '/admin/partner-applications?status=applied');
  assert.strictEqual(res.status, 200);
  const listed = res.body.applications.find((a) => a.partnerId === appliedPartnerId);
  assert.ok(listed, 'listed for review');
  assert.strictEqual(listed.tradeName, 'Maison Léman');
  assert.strictEqual(listed.monthlySubscriptionFeeMinorUnits, 3900, 'fee for its 1 category');
  assert.strictEqual(res.body.countsByStatus.applied, 1);
  res = await request('GET', '/admin/partner-applications?status=nonsense');
  assert.strictEqual(res.status, 422);
  res = await request('GET', `/admin/partner-applications/${appliedPartnerId}`);
  assert.strictEqual(res.body.application.contactEmail, 'shop@example.fr');
  assert.strictEqual(res.body.application.termsVersion, 'pt-2027-01');
  assert.ok(res.body.application.termsAcceptedAt, 'acceptance time recorded');
  res = await request('GET', '/admin/partner-applications/nope');
  assert.strictEqual(res.status, 404);

  const decide = (id, body) => request('POST', `/admin/partner-applications/${id}/decision`, body);
  res = await decide(appliedPartnerId, { toStatus: 'approved' });
  assert.strictEqual(res.status, 409, 'cannot skip review');
  assert.strictEqual(res.body.from, 'applied');
  res = await decide(appliedPartnerId, { toStatus: 'under_review' });
  assert.strictEqual(res.status, 200);
  res = await decide(appliedPartnerId, { toStatus: 'rejected' });
  assert.strictEqual(res.status, 422, 'rejection needs a reason');
  assert.deepStrictEqual(res.body.fieldErrors, [{ field: 'note', code: 'required' }]);
  res = await decide(appliedPartnerId, { toStatus: 'approved', note: 'Dossier complet.' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.application.onboardingStatus, 'approved');
  assert.deepStrictEqual((await visible()).allSale, false, 'approved is not yet live');
  res = await decide(appliedPartnerId, { toStatus: 'active' });
  assert.strictEqual(res.status, 422, 'activation needs the stock mode');
  res = await decide(appliedPartnerId, { toStatus: 'active', feedReliabilityTier: 'degraded' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.application.feedReliabilityTier, 'degraded');
  assert.deepStrictEqual(await visible(), { allSale: true, product: 200, page: 200, corners: true, corner: 200 },
    'an active store is visible');

  res = await decide(appliedPartnerId, { toStatus: 'suspended', note: 'Stock non mis à jour depuis 30 jours.' });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await visible(), { allSale: false, product: 404, page: 404, corners: false, corner: 404 },
    'a suspended store disappears from the catalogue');
  res = await request('GET', `/partners/${appliedPartnerId}/application`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.onboardingStatus, 'suspended');
  assert.strictEqual(res.body.decisionNote, 'Stock non mis à jour depuis 30 jours.', 'the store sees why');
  assert.deepStrictEqual(res.body.categories, ['clothing'], 'the console knows which categories the store may use');
  assert.deepStrictEqual(res.body.ageSegments, ['adults']);
  res = await decide(appliedPartnerId, { toStatus: 'active', feedReliabilityTier: 'degraded' });
  assert.strictEqual(res.status, 200, 'reactivation');
  res = await request('GET', `/partners/${appliedPartnerId}/application`);
  assert.strictEqual(res.body.decisionNote, 'Stock non mis à jour depuis 30 jours.', 'note kept when reactivating without a new one');

  delete process.env.FASHION_PARTNER_TERMS_VERSION; delete process.env.FASHION_PARTNER_TERMS_URL;

  // --- Partner console (task 7): brands, inventory, price, SKU, own Corner.
  res = await request('GET', `/partners/${appliedPartnerId}/brands`);
  assert.deepStrictEqual(res.body.brands.map((b) => b.name), ['Maison Léman']);
  res = await request('POST', `/partners/${appliedPartnerId}/products`, {
    brandId: lemanBrand, sku: 'VES-40', names: { fr: 'Veste Léman 40' }, gender: 'female', categories: ['clothing'],
    size: { system: 'EU', value: 40 }, priceMinorUnits: 18900,
  });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.product.sku, 'VES-40');
  const ves40 = res.body.product.id;
  res = await request('POST', `/partners/${appliedPartnerId}/products`, {
    brandId: lemanBrand, sku: 'VES-40', names: { fr: 'Doublon' }, gender: 'female', categories: ['clothing'], size: { system: 'EU', value: 42 },
  });
  assert.strictEqual(res.status, 409, 'SKU unique per store');
  assert.strictEqual(res.body.error, 'sku_taken');
  res = await request('POST', `/partners/${appliedPartnerId}/products`, {
    brandId: lemanBrand, names: { fr: 'Prix faux' }, gender: 'female', categories: ['clothing'], size: { system: 'EU', value: 44 }, priceMinorUnits: 12.5,
  });
  assert.strictEqual(res.status, 422);
  assert.strictEqual(res.body.error, 'invalid_price');

  res = await request('GET', `/partners/${appliedPartnerId}/inventory`);
  assert.strictEqual(res.status, 200);
  const invVes40 = res.body.products.find((p) => p.id === ves40);
  assert.deepStrictEqual(
    { sku: invVes40.sku, brandName: invVes40.brandName, price: invVes40.priceMinorUnits, stock: invVes40.stock },
    { sku: 'VES-40', brandName: 'Maison Léman', price: 18900, stock: null }
  );
  const invLeman = res.body.products.find((p) => p.id === lemanProduct);
  assert.strictEqual(invLeman.stock.quantityAvailable, 3);
  assert.strictEqual(invLeman.stock.sellable, 3);

  res = await request('POST', `/partners/${appliedPartnerId}/products/${ves40}/price`, { priceMinorUnits: 16900 });
  assert.strictEqual(res.status, 200);
  res = await request('GET', `/partners/${appliedPartnerId}/inventory`);
  assert.strictEqual(res.body.products.find((p) => p.id === ves40).priceMinorUnits, 16900, 'latest price wins');
  res = await request('POST', `/partners/${appliedPartnerId}/products/${ves40}/price`, { priceMinorUnits: 0 });
  assert.strictEqual(res.status, 422);
  res = await request('POST', `/partners/partner_atelier/products/${ves40}/price`, { priceMinorUnits: 100 });
  assert.strictEqual(res.status, 403, 'another store cannot price this product');

  res = await request('GET', `/partners/${appliedPartnerId}/corner-config`);
  assert.strictEqual(res.body.cornerConfig.displayName, 'Maison Léman', 'own Corner readable whatever the status');

  // --- Product photos and logo (task 7b)
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, 2, 3]);
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48]);
  const imgPath = `/partners/${appliedPartnerId}/products/${ves40}/images`;
  res = await requestRaw('POST', imgPath, JPEG, 'image/jpeg');
  assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  const firstImage = res.body.image;
  assert.strictEqual(firstImage.position, 0);
  assert.match(firstImage.url, /\/media\/partners\/.+\/products\/.+\.jpg$/);
  res = await requestRaw('POST', imgPath, PNG, 'image/png');
  const secondImage = res.body.image;
  assert.strictEqual(secondImage.position, 1);

  res = await requestRaw('POST', imgPath, Buffer.from('<svg onload=alert(1)></svg>'), 'image/jpeg');
  assert.strictEqual(res.status, 415, 'content is checked, not the declared type');
  assert.strictEqual(res.body.error, 'unsupported_type');
  res = await requestRaw('POST', imgPath, JPEG, 'image/png');
  assert.strictEqual(res.status, 415);
  assert.strictEqual(res.body.error, 'type_mismatch');
  res = await requestRaw('POST', imgPath, Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)]), 'image/jpeg');
  assert.strictEqual(res.status, 413);
  res = await requestRaw('POST', `/partners/partner_atelier/products/${ves40}/images`, JPEG, 'image/jpeg');
  assert.strictEqual(res.status, 403, 'another store cannot add photos to this product');

  // The file is served (in-memory mode) with its real type.
  const mediaPath = new URL(firstImage.url).pathname;
  res = await requestRaw('GET', mediaPath);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers['content-type'], 'image/jpeg');
  assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
  assert.ok(Buffer.compare(res.body, JPEG) === 0);

  // Inventory lists them, cover first; reorder; delete closes the gap.
  res = await request('GET', `/partners/${appliedPartnerId}/inventory`);
  assert.deepStrictEqual(res.body.products.find((p) => p.id === ves40).images.map((i) => i.id), [firstImage.id, secondImage.id]);
  res = await request('POST', `${imgPath}/order`, { imageIds: [secondImage.id, firstImage.id] });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body.images.map((i) => [i.id, i.position]), [[secondImage.id, 0], [firstImage.id, 1]]);
  res = await request('POST', `${imgPath}/order`, { imageIds: [secondImage.id] });
  assert.strictEqual(res.status, 422, 'an order must name every photo once');

  // Public catalogue (store is active again): cover on cards and photos on the product page.
  res = await request('GET', `/catalog/products/${ves40}`);
  assert.deepStrictEqual(res.body.productPage.images.map((i) => i.id), [secondImage.id, firstImage.id]);
  const coverUrl = (await request('GET', `/partners/${appliedPartnerId}/inventory`)).body.products.find((p) => p.id === ves40).images[0].url;
  res = await request('GET', '/catalog/all-sale');
  assert.strictEqual(res.body.products.find((p) => p.productId === ves40).imageUrl, coverUrl, 'All Sale card shows the cover');
  res = await request('GET', `/catalog/corners/${appliedPartnerId}`);
  assert.ok(res.body.products.find((p) => p.productId === ves40).imageUrl.endsWith('.png'), 'Corner card shows the cover (the PNG, now first)');

  res = await request('DELETE', `${imgPath}/${secondImage.id}`);
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body.images.map((i) => [i.id, i.position]), [[firstImage.id, 0]]);
  res = await requestRaw('GET', new URL(secondImage.url).pathname);
  assert.strictEqual(res.status, 404, 'deleted file is gone');
  res = await request('DELETE', `${imgPath}/${secondImage.id}`);
  assert.strictEqual(res.status, 404);

  for (let n = 1; n < 8; n += 1) {
    res = await requestRaw('POST', imgPath, JPEG, 'image/jpeg');
    assert.strictEqual(res.status, 201);
  }
  res = await requestRaw('POST', imgPath, JPEG, 'image/jpeg');
  assert.strictEqual(res.status, 409, 'at most 8 photos');
  assert.strictEqual(res.body.error, 'image_limit');

  res = await requestRaw('POST', `/partners/${appliedPartnerId}/logo`, PNG, 'image/png');
  assert.strictEqual(res.status, 201);
  assert.match(res.body.url, /\/media\/partners\/.+\/logo\/.+\.png$/);

  // --- Cart, checkout and orders (task 10) ---
  {
    const buyer = 'client_lea';
    res = await request('POST', '/partners/partner_atelier/brands', { name: 'Maison Panier' });
    const cartBrandA = res.body.brand.id;
    res = await request('POST', '/partners/partner_other_corner/brands', { name: 'Autre Marque' });
    const cartBrandB = res.body.brand.id;
    const mk = async (partnerId, brand, name, price, qty, category = 'clothing') => {
      const r = await request('POST', `/partners/${partnerId}/products`, {
        brandId: brand, names: { fr: name }, gender: 'female', categories: [category],
        size: { system: 'alpha', value: 'M' }, ...(price === null ? {} : { priceMinorUnits: price }),
      });
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      if (qty !== null) await request('POST', `/partners/${partnerId}/stock/${r.body.product.id}`, { quantityAvailable: qty, observedAt: '2026-10-01T10:00:00.000Z' });
      return r.body.product.id;
    };
    const robe = await mk('partner_atelier', cartBrandA, 'Robe panier', 6000, 3);
    const jupe = await mk('partner_atelier', cartBrandA, 'Jupe panier', 4500, 1);
    const manteau = await mk('partner_other_corner', cartBrandB, 'Manteau panier', 25000, 2);
    const sansPrix = await mk('partner_atelier', cartBrandA, 'Sans prix', null, 5);

    // Public storefront listing: priced products of active stores only.
    res = await request('GET', '/catalog/listing');
    assert.strictEqual(res.status, 200);
    const robeCard = res.body.products.find((p) => p.id === robe);
    assert.strictEqual(robeCard.names.fr, 'Robe panier');
    assert.strictEqual(robeCard.brandName, 'Maison Panier');
    assert.strictEqual(robeCard.priceMinorUnits, 6000);
    assert.deepStrictEqual(robeCard.sections, ['women']);
    assert.deepStrictEqual(robeCard.availability, { label: 'low_stock', sellable: true });
    assert.ok(!('stock' in robeCard) && !('sku' in robeCard), 'no stock quantities or internal references');
    assert.ok(!res.body.products.some((p) => p.id === sansPrix), 'unpriced products are not listed');
    assert.ok(res.body.stores.some((st) => st.partnerId === 'partner_other_corner'));
    assert.strictEqual(res.body.products.find((p) => p.id === manteau).storeName, res.body.stores.find((st) => st.partnerId === 'partner_other_corner').name);

    res = await request('GET', `/clients/${buyer}/cart`);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.cart.lines, []);
    assert.strictEqual(res.body.cart.canCheckout, false);

    res = await request('PUT', `/clients/${buyer}/cart/items/${robe}`, { quantity: 4 });
    assert.strictEqual(res.status, 409, 'more than the stock');
    assert.deepStrictEqual(res.body, { error: 'insufficient_stock', productId: robe, sellable: 3 });
    res = await request('PUT', `/clients/${buyer}/cart/items/${robe}`, { quantity: 11 });
    assert.strictEqual(res.status, 422);
    assert.strictEqual(res.body.error, 'invalid_quantity');
    res = await request('PUT', `/clients/${buyer}/cart/items/${sansPrix}`, { quantity: 1 });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.error, 'product_unavailable', 'no price, not sold');
    res = await request('PUT', `/clients/${buyer}/cart/items/does-not-exist`, { quantity: 1 });
    assert.strictEqual(res.status, 409);

    res = await request('PUT', `/clients/${buyer}/cart/items/${robe}`, { quantity: 2 });
    assert.strictEqual(res.status, 200);
    res = await request('PUT', `/clients/${buyer}/cart/items/${jupe}`, { quantity: 1 });
    res = await request('PUT', `/clients/${buyer}/cart/items/${manteau}`, { quantity: 1 });
    assert.strictEqual(res.status, 200);
    let cart = res.body.cart;
    assert.strictEqual(cart.lines.length, 3);
    assert.strictEqual(cart.subtotalMinorUnits, 12000 + 4500 + 25000);
    assert.strictEqual(cart.shippingMinorUnits, 0);
    assert.strictEqual(cart.totalMinorUnits, 41500);
    assert.strictEqual(cart.itemCount, 4);
    assert.strictEqual(cart.canCheckout, true);
    const robeLine = cart.lines.find((l) => l.productId === robe);
    assert.strictEqual(robeLine.name, 'Robe panier');
    assert.strictEqual(robeLine.brandName, 'Maison Panier');
    assert.strictEqual(robeLine.status, 'ok');
    assert.strictEqual(cart.stores.length, 2, 'one block per store');
    assert.ok(cart.stores.every((st) => !('commissionMinorUnits' in st)), 'the client never sees the commission');
    assert.strictEqual(cart.stores.find((st) => st.partnerId === 'partner_other_corner').storeName, 'Autre Boutique');

    // Updating a line replaces the quantity; DELETE removes it.
    res = await request('PUT', `/clients/${buyer}/cart/items/${robe}`, { quantity: 1 });
    assert.strictEqual(res.body.cart.lines.find((l) => l.productId === robe).quantity, 1);
    res = await request('DELETE', `/clients/${buyer}/cart/items/${jupe}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.cart.lines.length, 2);
    res = await request('PUT', `/clients/${buyer}/cart/items/${jupe}`, { quantity: 1 });
    res = await request('PUT', `/clients/${buyer}/cart/items/${robe}`, { quantity: 2 });

    // Another client's cart is separate.
    res = await request('GET', '/clients/someone_else/cart');
    assert.deepStrictEqual(res.body.cart.lines, []);

    // Addresses: shipping in France only by default.
    res = await request('POST', `/clients/${buyer}/addresses`, {
      type: 'shipping', recipientName: 'Léa Martin', line1: '3 rue des Lilas', postalCode: '69001', city: 'Lyon', countryIso: 'FR', isDefault: true,
    });
    const leaAddress = res.body.address.id;
    res = await request('POST', `/clients/${buyer}/addresses`, {
      type: 'shipping', line1: 'Rua Augusta 1', postalCode: '1100-048', city: 'Lisboa', countryIso: 'PT',
    });
    const portugueseAddress = res.body.address.id;

    res = await request('POST', `/clients/${buyer}/checkout`, { addressId: portugueseAddress });
    assert.strictEqual(res.status, 422);
    assert.strictEqual(res.body.error, 'shipping_country_not_served');
    res = await request('POST', `/clients/${buyer}/checkout`, { addressId: addr1Id });
    assert.strictEqual(res.status, 422, "another client's address is refused");
    assert.strictEqual(res.body.error, 'address_not_found');
    res = await request('POST', '/clients/someone_else/checkout', { addressId: leaAddress });
    assert.strictEqual(res.status, 422);
    assert.strictEqual(res.body.error, 'empty_cart');

    // The price changed after the item was added: checkout uses the current price.
    res = await request('POST', `/partners/partner_atelier/products/${robe}/price`, { priceMinorUnits: 5500 });
    assert.strictEqual(res.status, 200);

    res = await request('POST', `/clients/${buyer}/checkout`, { addressId: leaAddress });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    let order = res.body.order;
    assert.strictEqual(order.status, 'pending_payment');
    assert.strictEqual(order.paymentStatus, 'requires_payment_method');
    assert.strictEqual(order.subtotalMinorUnits, 11000 + 4500 + 25000);
    assert.strictEqual(order.totalMinorUnits, 40500);
    assert.strictEqual(order.items.find((i) => i.productId === robe).unitPriceMinorUnits, 5500);
    assert.deepStrictEqual(order.shippingAddress, { recipientName: 'Léa Martin', line1: '3 rue des Lilas', line2: null, postalCode: '69001', city: 'Lyon', countryIso: 'FR' });
    assert.ok(new Date(order.paymentExpiresAt) > new Date(Date.now() + 29 * 60 * 1000), 'stock held ~30 min');
    assert.deepStrictEqual(order.stores.map((st) => [st.partnerId, st.subtotalMinorUnits]).sort(),
      [['partner_atelier', 15500], ['partner_other_corner', 25000]]);
    assert.ok(!('tickets' in order) && !('clientUserId' in order));

    // Stock is held: the last jupe cannot go into another cart.
    res = await request('PUT', `/clients/someone_else/cart/items/${jupe}`, { quantity: 1 });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.sellable, 0);
    // ...but the buyer's own cart still shows it as theirs.
    res = await request('GET', `/clients/${buyer}/cart`);
    assert.strictEqual(res.body.cart.pendingOrderId, order.id);
    assert.strictEqual(res.body.cart.canCheckout, true);

    // Checking out again replaces the unpaid Order (no double hold).
    res = await request('POST', `/clients/${buyer}/checkout`, { addressId: leaAddress });
    assert.strictEqual(res.status, 201);
    const secondOrder = res.body.order;
    res = await request('GET', `/clients/${buyer}/orders/${order.id}`);
    assert.strictEqual(res.body.order.status, 'cancelled');

    // Orders list and detail are private to the client.
    res = await request('GET', `/clients/${buyer}/orders`);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.orders.map((o) => o.status).sort(), ['cancelled', 'pending_payment']);
    res = await request('GET', `/clients/someone_else/orders/${secondOrder.id}`);
    assert.strictEqual(res.status, 404);

    // Abandoning the checkout releases the stock.
    res = await request('POST', `/clients/${buyer}/orders/${secondOrder.id}/cancel`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.order.status, 'cancelled');
    res = await request('PUT', `/clients/someone_else/cart/items/${jupe}`, { quantity: 1 });
    assert.strictEqual(res.status, 200, 'released stock is sellable again');
    res = await request('DELETE', `/clients/someone_else/cart/items/${jupe}`);

    // Changing the cart cancels an unpaid Order of that cart.
    res = await request('POST', `/clients/${buyer}/checkout`, { addressId: leaAddress });
    const thirdOrder = res.body.order;
    res = await request('PUT', `/clients/${buyer}/cart/items/${robe}`, { quantity: 3 });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.cart.pendingOrderId, null);
    res = await request('GET', `/clients/${buyer}/orders/${thirdOrder.id}`);
    assert.strictEqual(res.body.order.status, 'cancelled');

    // Insufficient stock at checkout names the product.
    await request('POST', `/partners/partner_atelier/stock/${robe}`, { quantityAvailable: 2, observedAt: '2026-10-02T10:00:00.000Z' });
    res = await request('POST', `/clients/${buyer}/checkout`, { addressId: leaAddress });
    assert.strictEqual(res.status, 409);
    assert.deepStrictEqual(res.body, { error: 'insufficient_stock', productId: robe, sellable: 2 });

    // A store only sees PAID orders (none yet: payment is the next step).
    res = await request('GET', '/partners/partner_atelier/orders');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.total, 0);
  }

  // GET /me in in-memory mode: nobody is authenticated, nothing granted.
  res = await request('GET', '/me');
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body, { authenticated: false, userId: null, isAdmin: false, partnerIds: [] });

  server.close();
  console.log('fashion-partner API: all integration checks passed.');
}

run().catch((err) => { console.error(err); server.close(); process.exit(1); });
