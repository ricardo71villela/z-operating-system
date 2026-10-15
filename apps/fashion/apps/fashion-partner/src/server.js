/* ============================================================
   Z FASHION PARTNER — API server
   ============================================================
   Single repository-choice point, mirroring apps/jobs/apps/api/
   src/db.ts exactly: without DATABASE_URL, behavior stays in-memory
   (nothing changes for local dev or tests run without a database);
   with DATABASE_URL set, the API talks to real Postgres via db.js.
   ============================================================ */

const http = require('http');
const { createPartner } = require('../../../packages/fashion-domain/src/partner');
const { createApplication, transition } = require('../../../packages/fashion-domain/src/onboarding');
const { initStock, applyStockUpdate, sellableQuantity } = require('../../../packages/fashion-domain/src/stock');
const { createBrand } = require('../../../packages/fashion-domain/src/brand');
const { createProduct } = require('../../../packages/fashion-domain/src/product');
const shipmentDomain = require('../../../packages/fashion-domain/src/shipment');
const returnDomain = require('../../../packages/fashion-domain/src/return');
const priceHistory = require('../../../packages/fashion-domain/src/price-history');
const { buildProductPageViewModel } = require('../../../packages/fashion-domain/src/product-page');
const { allSale, corner: cornerProducts } = require('../../../packages/fashion-domain/src/corner');
const { createCornerConfig } = require('../../../packages/fashion-domain/src/corner-config');
const accountDomain = require('../../../packages/fashion-domain/src/account');
const addressDomain = require('../../../packages/fashion-domain/src/address');
const commissionDomain = require('../../../packages/fashion-domain/src/commission');
const { buildListingCards } = require('../../../packages/fashion-domain/src/catalog-listing');
const { validatePartnerApplication } = require('../../../packages/fashion-domain/src/partner-application');
const { launchedMarkets } = require('../../../packages/fashion-domain/src/markets');
const db = require('./db');
const { resolveAuthenticatedUserId, loadSupabaseAuthConfigFromEnv } = require('./auth');
const { isAuthRequired, loadAdminUserIds, decideAccess } = require('./access');
const { loadAllowedOrigins, corsHeadersFor } = require('./cors');

const usingPostgres = !!process.env.DATABASE_URL;
const pool = usingPostgres ? db.createPool() : null;

const authRequired = isAuthRequired({ usingPostgres });
const allowedOrigins = loadAllowedOrigins();

/**
 * Request gates. Each returns a truthy value on success; on failure it
 * has already written the HTTP response (401/403/503) and returns null,
 * so a handler starts with `if (!(await authorizeXRequest(...))) return;`.
 * The decision itself lives in access.js (pure, unit-tested); these
 * wrappers only resolve the caller and write the refusal.
 *
 * In-memory mode stays open (local dev, tests/api.test.js). Postgres
 * mode requires Supabase Auth unless FASHION_ALLOW_UNAUTHENTICATED=1
 * is set explicitly — see access.js. A missing SUPABASE_URL on a real
 * server now refuses requests instead of silently opening every route.
 *
 * Partner: until the onboarding flow calls
 * platform_internal.link_fashion_partner_organisation(), every Partner
 * has zero linked organisations, so partner-scoped requests return 403
 * once auth is on. That is the correct fail-closed behavior, not a bug.
 */
async function gate(req, res, { isAllowed, forbiddenMessage }) {
  const authUserId = usingPostgres
    ? await resolveAuthenticatedUserId(req.headers['authorization'])
    : undefined;
  const decision = await decideAccess({ usingPostgres, authRequired, authUserId, isAllowed, forbiddenMessage });
  if (!decision.ok) {
    sendJson(res, decision.status, { error: decision.error });
    return null;
  }
  return decision;
}

async function authorizePartnerRequest(req, res, partnerId) {
  if (!partnerId) {
    sendJson(res, 422, { error: 'partnerId is required' });
    return null;
  }
  const decision = await gate(req, res, {
    isAllowed: async (userId) => {
      const allowedPartnerIds = await db.resolveFashionPartnerIdsForAuthUser(pool, userId);
      return allowedPartnerIds.includes(partnerId);
    },
    forbiddenMessage: `not authorized to manage partner ${partnerId}`,
  });
  return decision ? partnerId : null;
}

/** For routes addressed by a record id (shipment, return): authenticate
 *  first, then look up the owning Partner and check the caller manages
 *  it. An unknown id is refused like a foreign one (403), so the route
 *  does not reveal which ids exist to unauthenticated callers. */
async function authorizeOwnedRecordRequest(req, res, lookupPartnerId, label) {
  const decision = await gate(req, res, {
    isAllowed: async (userId) => {
      const partnerId = await lookupPartnerId();
      if (!partnerId) return false;
      const allowedPartnerIds = await db.resolveFashionPartnerIdsForAuthUser(pool, userId);
      return allowedPartnerIds.includes(partnerId);
    },
    forbiddenMessage: `not authorized to manage ${label}`,
  });
  return decision ? true : null;
}

/** A client acts only on their own account: fashion.clients.id is the
 *  Supabase auth user id, so the :clientId in the URL must equal the
 *  authenticated caller's id. */
async function authorizeClientRequest(req, res, clientId) {
  const decision = await gate(req, res, {
    isAllowed: (userId) => userId === clientId,
    forbiddenMessage: 'not authorized to access this client account',
  });
  return decision ? clientId : null;
}

/** Operations staff only (approve/reject/suspend a Partner). Admins are
 *  the auth user ids in FASHION_ADMIN_USER_IDS until ZOS has a real
 *  admin-role model; an empty list means nobody may do this. */
async function authorizeAdminRequest(req, res) {
  const adminUserIds = loadAdminUserIds();
  const decision = await gate(req, res, {
    isAllowed: (userId) => adminUserIds.includes(userId),
    forbiddenMessage: 'admin access required',
  });
  return decision ? true : null;
}

/**
 * GET /me — who the caller is, for the Partner dashboard and the admin
 * backoffice to decide what to show after sign-in. Requires a valid
 * token in database mode (same gate as every scoped route); never
 * grants anything itself — every other route still checks on its own.
 */
async function handleMe(req, res) {
  const decision = await gate(req, res, { isAllowed: () => true, forbiddenMessage: 'forbidden' });
  if (!decision) return;
  if (!decision.userId) {
    return sendJson(res, 200, { authenticated: false, userId: null, isAdmin: false, partnerIds: [] });
  }
  const partnerIds = await db.resolveFashionPartnerIdsForAuthUser(pool, decision.userId);
  sendJson(res, 200, {
    authenticated: true,
    userId: decision.userId,
    isAdmin: loadAdminUserIds().includes(decision.userId),
    partnerIds,
  });
}

/**
 * Partner terms currently published — FASHION_PARTNER_TERMS_VERSION and
 * FASHION_PARTNER_TERMS_URL (https). Until both are set, the adhesion
 * page explains that applications are not open yet and
 * POST /partner-applications refuses with 503: a store can never accept
 * terms that do not exist.
 */
function currentPartnerTerms() {
  const version = (process.env.FASHION_PARTNER_TERMS_VERSION || '').trim();
  const url = (process.env.FASHION_PARTNER_TERMS_URL || '').trim();
  if (!version || !/^https:\/\//.test(url)) return null;
  return { version, url };
}

async function currentOffer() {
  const tiers = usingPostgres
    ? await db.getPartnerOfferPg(pool)
    : {
      subscriptionTiers: commissionDomain.SUBSCRIPTION_TIERS.map((t) => ({ ...t })),
      ticketCommissionTiers: commissionDomain.TICKET_COMMISSION_TIERS.map((t) => ({ ...t })),
    };
  return {
    currency: 'EUR',
    pricesExcludeVat: commissionDomain.PRICES_EXCLUDE_VAT,
    firstMonthFree: commissionDomain.FIRST_MONTH_FREE,
    ...tiers,
  };
}

/** GET /onboarding/offer — public: what the adhesion page shows. */
async function handleGetOnboardingOffer(req, res) {
  const terms = currentPartnerTerms();
  const offer = await currentOffer();
  sendJson(res, 200, {
    applicationsOpen: !!terms,
    terms,
    launchedMarkets: launchedMarkets(),
    offer,
  });
}

/**
 * POST /partner-applications — a signed-in person applies for a store.
 * Postgres mode: one transaction creates the organisation, membership,
 * Partner ('applied'), application record and the Partner binding, so
 * the person manages that Partner from now on (GET /me lists it).
 * Approval remains an admin action.
 */
async function handleSubmitPartnerApplication(req, res) {
  const decision = await gate(req, res, { isAllowed: () => true, forbiddenMessage: 'forbidden' });
  if (!decision) return;

  if (usingPostgres && !decision.userId) return sendJson(res, 401, { error: 'authentication required' });

  const terms = currentPartnerTerms();
  if (!terms) return sendJson(res, 503, { error: 'partner_terms_not_published' });

  const body = await readBody(req);
  const accountEmail = decision.userId ? await db.getAuthUserEmail(pool, decision.userId) : body.devAccountEmail;

  let application;
  try {
    application = validatePartnerApplication(body, { accountEmail, currentTermsVersion: terms.version });
    createPartner({ ...application, id: 'pending' });
  } catch (err) {
    return sendJson(res, 422, { error: 'invalid_application', fieldErrors: err.fieldErrors || [{ field: 'application', code: 'invalid' }] });
  }

  const offerSnapshot = { ...(await currentOffer()), termsUrl: terms.url, capturedAt: new Date().toISOString() };

  if (decision.userId) {
    try {
      const created = await db.submitPartnerApplicationPg(pool, decision.userId, application, offerSnapshot);
      return sendJson(res, 201, { ...created, onboardingStatus: 'applied' });
    } catch (err) {
      if (err.code === 'fashion_application_pending' || err.code === 'fashion_application_duplicate') {
        return sendJson(res, 409, { error: err.code });
      }
      throw err;
    }
  }

  // In-memory mode (local dev / tests only): no account to link.
  const partnerId = `partner_${memory.partnerApplications.size + 1}`;
  const partner = createPartner({ ...application, id: partnerId });
  memory.partners.set(partnerId, partner);
  memory.applications.set(partnerId, createApplication(partnerId));
  memory.partnerApplications.set(partnerId, { ...application, offerSnapshot });
  sendJson(res, 201, { partnerId, onboardingStatus: 'applied' });
}

// In-memory fallback store — only reachable when usingPostgres is false.
const memory = {
  partners: new Map(), applications: new Map(), stockByProductId: new Map(),
  brands: new Map(), products: new Map(), shipments: new Map(), returns: new Map(),
  priceHistoryByProductId: new Map(), cornerConfigs: new Map(),
  wishlist: accountDomain.emptyWishlist(), cornerFollows: accountDomain.emptyCornerFollows(),
  addressBook: addressDomain.emptyAddressBook(),
  partnerApplications: new Map(),
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function handleApplyPartner(req, res) {
  const body = await readBody(req);
  try {
    if (usingPostgres) {
      // id is DB-generated in Postgres mode — createPartner() still runs
      // for its real validation (categories, locales, minor-safe gate),
      // just with a throwaway id since the DB assigns the real one.
      const partner = createPartner({ ...body, id: 'pending' });
      const row = await db.insertPartner(pool, {
        legalName: partner.legalName,
        countryIso: body.countryIso,
        locales: partner.locales,
        categories: partner.categories,
        ageSegments: partner.ageSegments,
        minorSafeDataAcknowledged: partner.minorSafeDataAcknowledged,
      });
      return sendJson(res, 201, { partner: row });
    }

    const partner = createPartner(body);
    memory.partners.set(partner.id, partner);
    const application = createApplication(partner.id);
    memory.applications.set(partner.id, application);
    sendJson(res, 201, { partner, application });
  } catch (err) {
    sendJson(res, 422, { error: err.message });
  }
}

async function handleTransition(req, res, partnerId) {
  if (!(await authorizeAdminRequest(req, res))) return;
  const body = await readBody(req);
  try {
    if (usingPostgres) {
      const row = await db.updatePartnerStatus(pool, partnerId, {
        onboardingStatus: body.toStatus,
        feedReliabilityTier: body.feedReliabilityTier,
      });
      return sendJson(res, 200, { partner: row });
    }

    const application = memory.applications.get(partnerId);
    const partner = memory.partners.get(partnerId);
    if (!application) return sendJson(res, 404, { error: `no application for partner ${partnerId}` });
    const updated = transition(application, body.toStatus, { partner, feedReliabilityTier: body.feedReliabilityTier });
    memory.applications.set(partnerId, updated);
    sendJson(res, 200, { application: updated });
  } catch (err) {
    sendJson(res, 422, { error: err.message });
  }
}

/**
 * Third of three "Still open" STOCK-FEED-CONTRACT.md items closed
 * (2026-08-21): nothing previously stopped one Partner from pushing a
 * stock update for a Product belonging to another Partner — the
 * single-item route wasn't even Partner-scoped in its URL. Both
 * single-item and bulk stock routes now live under
 * /partners/:id/stock/... (matching every other Partner-scoped
 * endpoint added today) and this shared check runs before any write:
 * the Product must exist AND belong to the calling Partner, or the
 * request is rejected — never silently accepted for an unknown or
 * foreign Product.
 */
async function assertProductOwnership(partnerId, productId) {
  let product;
  if (usingPostgres) {
    product = await db.getProduct(pool, productId);
  } else {
    product = memory.products.get(productId) || null;
  }

  if (!product) {
    const err = new Error(`no product with id ${productId}`);
    err.statusCode = 404;
    throw err;
  }
  if (product.partnerId !== partnerId) {
    const err = new Error(`product ${productId} does not belong to partner ${partnerId}`);
    err.statusCode = 403;
    throw err;
  }
}

async function handleStockUpdate(req, res, partnerId, productId) {
  if (!(await authorizePartnerRequest(req, res, partnerId))) return;
  const body = await readBody(req);
  try {
    await assertProductOwnership(partnerId, productId);

    if (usingPostgres) {
      const updated = await db.applyStockUpdatePg(pool, productId, body.quantityAvailable, body.observedAt);
      return sendJson(res, 200, { stock: updated, sellable: sellableQuantity(updated) });
    }

    const current = memory.stockByProductId.get(productId) || initStock(productId);
    const updated = applyStockUpdate(current, body);
    memory.stockByProductId.set(productId, updated);
    sendJson(res, 200, { stock: updated, sellable: sellableQuantity(updated) });
  } catch (err) {
    sendJson(res, err.statusCode || 422, { error: err.message });
  }
}

async function handleGetStock(req, res, partnerId, productId) {
  if (!(await authorizePartnerRequest(req, res, partnerId))) return;
  try {
    await assertProductOwnership(partnerId, productId);

    if (usingPostgres) {
      const stock = await db.getStockPg(pool, productId);
      return sendJson(res, 200, { stock, sellable: sellableQuantity(stock) });
    }

    const stock = memory.stockByProductId.get(productId) || initStock(productId);
    sendJson(res, 200, { stock, sellable: sellableQuantity(stock) });
  } catch (err) {
    sendJson(res, err.statusCode || 400, { error: err.message });
  }
}

/**
 * Bulk stock feed ingestion — closes the gap STOCK-FEED-CONTRACT.md
 * itself flagged as the project's single highest-churn-risk item
 * (ponto 3 of the partner-side audit, 2026-08-21): the only stock
 * endpoint that existed before this accepted one Product at a time,
 * meaning a Partner with 200 SKUs needed 200 separate requests just to
 * push a routine update.
 *
 * Each item is processed independently through the same
 * applyStockUpdate() every single-item call already uses — a stale or
 * invalid update for one Product never blocks the other 199 in the
 * same batch from applying (per-item results, never all-or-nothing;
 * that all-or-nothing discipline belongs to checkout reservations
 * across Partners, a different concern from feed ingestion itself).
 *
 * No Partner-ownership check on productId yet — same known gap the
 * single-item stock endpoints already carry (see the comment on
 * handleStockUpdate), not newly introduced here, not silently
 * pretended solved either.
 */
async function handleBulkStockUpdate(req, res, partnerId) {
  if (!(await authorizePartnerRequest(req, res, partnerId))) return;
  const body = await readBody(req);
  if (!Array.isArray(body.updates)) {
    return sendJson(res, 400, { error: 'updates must be an array of { productId, quantityAvailable, observedAt }' });
  }

  let results;
  if (usingPostgres) {
    // Sequential, not Promise.all — each item still gets an independent
    // result (per-item failure, same as the in-memory path below), but
    // running them one at a time avoids many concurrent row locks on
    // fashion.stock racing each other for no benefit within a single
    // Partner's own batch.
    results = [];
    for (const update of body.updates) {
      try {
        await assertProductOwnership(partnerId, update.productId);
        const updated = await db.applyStockUpdatePg(pool, update.productId, update.quantityAvailable, update.observedAt);
        results.push({ productId: update.productId, ok: true, stock: updated, sellable: sellableQuantity(updated) });
      } catch (err) {
        results.push({ productId: update.productId, ok: false, error: err.message });
      }
    }
  } else {
    results = [];
    for (const update of body.updates) {
      try {
        await assertProductOwnership(partnerId, update.productId);
        const current = memory.stockByProductId.get(update.productId) || initStock(update.productId);
        const updated = applyStockUpdate(current, update);
        memory.stockByProductId.set(update.productId, updated);
        results.push({ productId: update.productId, ok: true, stock: updated, sellable: sellableQuantity(updated) });
      } catch (err) {
        // A stale/invalid/foreign-owned item never aborts the batch —
        // per-item failure, exactly matching STOCK-FEED-CONTRACT.md's
        // "rejected, not silently overwritten" rule applied one item
        // at a time.
        results.push({ productId: update.productId, ok: false, error: err.message });
      }
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  sendJson(res, 200, { results, summary: { total: results.length, ok: okCount, failed: results.length - okCount } });
}

async function handleCreateBrand(req, res, partnerId) {
  if (!(await authorizePartnerRequest(req, res, partnerId))) return;
  const body = await readBody(req);
  try {
    if (usingPostgres) {
      const brand = await db.insertBrand(pool, { name: body.name, houseLabelOfPartnerId: partnerId });
      return sendJson(res, 201, { brand });
    }

    const brand = createBrand({ id: require('crypto').randomUUID(), name: body.name, houseLabelOfPartnerId: partnerId });
    memory.brands.set(brand.id, brand);
    sendJson(res, 201, { brand });
  } catch (err) {
    sendJson(res, 422, { error: err.message });
  }
}

async function handleCreateProduct(req, res, partnerId) {
  if (!(await authorizePartnerRequest(req, res, partnerId))) return;
  const body = await readBody(req);
  try {
    if (usingPostgres) {
      // Same reasoning as handleApplyPartner's Postgres path: createProduct()
      // still runs for its real validation (categories, gender, minor-safe
      // certification, sized-category size requirement, names.fr) before
      // the DB ever sees the row — the DB's own CHECK constraints and
      // triggers are the second, independent enforcement, not the only one.
      createProduct({ ...body, id: 'pending', partnerId });
      const row = await db.insertProduct(pool, { ...body, partnerId });

      // priceMinorUnits is optional on creation — Price is a separate
      // History concept (price-history.js), never a field on Product
      // itself, so this is a courtesy write-through, not something
      // insertProduct() itself owns.
      if (typeof body.priceMinorUnits === 'number') {
        await db.recordPricePg(pool, row.id, body.priceMinorUnits, new Date().toISOString());
      }

      return sendJson(res, 201, { product: row });
    }

    const product = createProduct({ ...body, id: require('crypto').randomUUID(), partnerId });
    memory.products.set(product.id, product);

    if (typeof body.priceMinorUnits === 'number') {
      const history = memory.priceHistoryByProductId.get(product.id) || priceHistory.emptyHistory();
      memory.priceHistoryByProductId.set(
        product.id,
        priceHistory.recordPrice(history, { priceMinorUnits: body.priceMinorUnits, observedAt: new Date().toISOString() })
      );
    }

    sendJson(res, 201, { product });
  } catch (err) {
    sendJson(res, 422, { error: err.message });
  }
}

async function handleListProducts(req, res, partnerId) {
  if (!(await authorizePartnerRequest(req, res, partnerId))) return;
  try {
    if (usingPostgres) {
      const products = await db.listProductsForPartner(pool, partnerId);
      return sendJson(res, 200, { products });
    }

    const products = [...memory.products.values()].filter((p) => p.partnerId === partnerId);
    sendJson(res, 200, { products });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
}

async function handleGetProduct(req, res, productId) {
  try {
    if (usingPostgres) {
      const product = await db.getProduct(pool, productId);
      if (!product) return sendJson(res, 404, { error: `no product with id ${productId}` });
      return sendJson(res, 200, { product });
    }

    const product = memory.products.get(productId);
    if (!product) return sendJson(res, 404, { error: `no product with id ${productId}` });
    sendJson(res, 200, { product });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
}


async function handleCreateShipment(req, res) {
  const body = await readBody(req);
  if (!(await authorizePartnerRequest(req, res, body.partnerId))) return;
  try {
    if (usingPostgres) {
      const shipment = await db.insertShipment(pool, body);
      return sendJson(res, 201, { shipment });
    }

    const shipment = shipmentDomain.createShipment(body);
    const id = `${shipment.orderId}:${shipment.partnerId}`;
    const withId = { id, ...shipment };
    memory.shipments.set(id, withId);
    sendJson(res, 201, { shipment: withId });
  } catch (err) {
    sendJson(res, 422, { error: err.message });
  }
}

async function handleListShipments(req, res, partnerId) {
  if (!(await authorizePartnerRequest(req, res, partnerId))) return;
  try {
    if (usingPostgres) {
      const shipments = await db.listShipmentsForPartner(pool, partnerId);
      return sendJson(res, 200, { shipments });
    }

    const shipments = [...memory.shipments.values()].filter((s) => s.partnerId === partnerId);
    sendJson(res, 200, { shipments });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
}

async function handleTransitionShipment(req, res, shipmentId) {
  if (!(await authorizeOwnedRecordRequest(req, res, () => db.getShipmentPartnerId(pool, shipmentId), 'shipment ' + shipmentId))) return;
  const body = await readBody(req);
  try {
    if (usingPostgres) {
      const shipment = await db.updateShipmentStatus(pool, shipmentId, body.toStatus);
      return sendJson(res, 200, { shipment });
    }

    const shipment = memory.shipments.get(shipmentId);
    if (!shipment) return sendJson(res, 404, { error: `no shipment with id ${shipmentId}` });
    const updated = { id: shipmentId, ...shipmentDomain.transition(shipment, body.toStatus) };
    memory.shipments.set(shipmentId, updated);
    sendJson(res, 200, { shipment: updated });
  } catch (err) {
    sendJson(res, 422, { error: err.message });
  }
}

async function handleCreateReturn(req, res) {
  const body = await readBody(req);
  if (!(await authorizePartnerRequest(req, res, body.partnerId))) return;
  try {
    if (usingPostgres) {
      const ret = await db.insertReturn(pool, body);
      return sendJson(res, 201, { return: ret });
    }

    const product = memory.products.get(body.productId);
    if (!product) return sendJson(res, 422, { error: `no product with id ${body.productId}` });
    const ret = returnDomain.requestReturn({ ...body, product });
    const id = `${ret.orderId}:${ret.productId}`;
    const withId = { id, ...ret };
    memory.returns.set(id, withId);
    sendJson(res, 201, { return: withId });
  } catch (err) {
    sendJson(res, 422, { error: err.message });
  }
}

async function handleListReturns(req, res, partnerId) {
  if (!(await authorizePartnerRequest(req, res, partnerId))) return;
  try {
    if (usingPostgres) {
      const returns = await db.listReturnsForPartner(pool, partnerId);
      return sendJson(res, 200, { returns });
    }

    const returns = [...memory.returns.values()].filter((r) => r.partnerId === partnerId);
    sendJson(res, 200, { returns });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
}

async function handleTransitionReturn(req, res, returnId) {
  if (!(await authorizeOwnedRecordRequest(req, res, () => db.getReturnPartnerId(pool, returnId), 'return ' + returnId))) return;
  const body = await readBody(req);
  try {
    if (usingPostgres) {
      const ret = await db.updateReturnStatus(pool, returnId, body.toStatus);
      return sendJson(res, 200, { return: ret });
    }

    const ret = memory.returns.get(returnId);
    if (!ret) return sendJson(res, 404, { error: `no return with id ${returnId}` });
    const updated = { id: returnId, ...returnDomain.transition(ret, body.toStatus) };
    memory.returns.set(returnId, updated);
    sendJson(res, 200, { return: updated });
  } catch (err) {
    sendJson(res, 422, { error: err.message });
  }
}

/**
 * Public Catalog read surface — GET /catalog/products/:id. Closes the
 * gap flagged since the customer-side audit (2026-08-21): every
 * Client-facing prototype so far (Product Page included) rendered
 * hardcoded demo data, never a real endpoint — this is the first one,
 * assembling exactly what product-page.js's buildProductPageViewModel()
 * needs (Product, Stock, Brand, Partner, current price, sibling
 * catalog for recommendations/style groups).
 *
 * Deliberately public (no Partner-scoping, no auth) — a Product Page
 * is meant to be browsable by anyone, same as every real e-commerce
 * catalog. Never exposes anything Partner-management endpoints don't
 * already expose more broadly (this reads the same Product/Stock/Brand
 * rows a Partner can already read about their own catalog).
 *
 * Recommendations/style-groups see the full cross-Partner catalog
 * (db.listAllProducts()) — same-Corner recommendations and the
 * catalog-wide fallback recommendations.js defines both work fully,
 * not just the same-Corner case (fixed 2026-08-21, was originally
 * scoped to the Product's own Partner only).
 */
async function handleGetCatalogProduct(req, res, productId) {
  try {
    let product, stock, brand, partner, priceMinorUnits, siblingProducts, stockByProductId;

    if (usingPostgres) {
      product = await db.getProduct(pool, productId);
      if (!product) return sendJson(res, 404, { error: `no product with id ${productId}` });

      stock = await db.getStockPg(pool, productId);
      brand = product.brandId ? await db.getBrand(pool, product.brandId) : null;
      partner = await db.getPartner(pool, product.partnerId);
      priceMinorUnits = await db.getCurrentPricePg(pool, productId);
      // Full cross-Partner catalog now that db.listAllProducts() exists —
      // closes the "same-Corner only" simplification this endpoint
      // originally shipped with; recommendations.js's fallback path can
      // now actually find something outside the Product's own Partner.
      siblingProducts = await db.listAllProducts(pool);
      stockByProductId = await db.getStockForProductsPg(pool, siblingProducts.map((p) => p.id));
    } else {
      product = memory.products.get(productId);
      if (!product) return sendJson(res, 404, { error: `no product with id ${productId}` });

      stock = memory.stockByProductId.get(productId) || initStock(productId);
      brand = product.brandId ? memory.brands.get(product.brandId) || null : null;
      partner = memory.partners.get(product.partnerId) || null;
      priceMinorUnits = priceHistory.currentPrice(memory.priceHistoryByProductId.get(productId) || priceHistory.emptyHistory());
      siblingProducts = [...memory.products.values()];
      stockByProductId = Object.fromEntries(
        siblingProducts.map((p) => [p.id, memory.stockByProductId.get(p.id) || initStock(p.id)])
      );
    }

    if (!partner) {
      return sendJson(res, 422, { error: `product ${productId} references partner ${product.partnerId}, which was not found — cannot render without the professional-seller disclosure` });
    }
    if (priceMinorUnits === null || priceMinorUnits === undefined) {
      return sendJson(res, 422, { error: `no price recorded for product ${productId} yet` });
    }

    const viewModel = buildProductPageViewModel({
      product, stock, brand, partner, discount: null, priceMinorUnits,
      allProducts: siblingProducts, stockByProductId,
    });

    sendJson(res, 200, { productPage: viewModel });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
}

/**
 * Public Catalog listing — GET /catalog/all-sale, optionally filtered
 * by ?gender=&category=&sizeValue=&ageSegment= (same filter shape
 * allSale() already accepts in corner.js). The second real Client-
 * facing endpoint, same day as the Product Page one — All Sale is a
 * cross-Partner view by definition, so it always reads the full
 * catalog (db.listAllProducts()), never one Partner's.
 *
 * Each card is decorated via catalog-listing.js's buildListingCards()
 * (stock availability, Brand name) plus current price and the selling
 * Partner's name attached here — price/Partner-name are not
 * catalog-listing.js's concern, same separation-of-concerns the rest
 * of this domain already keeps (Price lives in price-history.js,
 * Partner identity is its own thing).
 */
async function handleGetAllSale(req, res, query) {
  try {
    const filter = {};
    if (query.get('gender')) filter.gender = query.get('gender');
    if (query.get('category')) filter.category = query.get('category');
    if (query.get('ageSegment')) filter.ageSegment = query.get('ageSegment');
    if (query.get('sizeValue')) filter.sizeValue = Number(query.get('sizeValue'));

    let allProducts, stockByProductId, brandsById, partnersById;

    if (usingPostgres) {
      allProducts = await db.listAllProducts(pool);
      stockByProductId = await db.getStockForProductsPg(pool, allProducts.map((p) => p.id));
      // Brands/Partners resolved individually below per-card — a batch
      // fetch for these would be a further optimization, not done here
      // (same honestly-scoped-for-today discipline as everything else).
    } else {
      allProducts = [...memory.products.values()];
      stockByProductId = Object.fromEntries(
        allProducts.map((p) => [p.id, memory.stockByProductId.get(p.id) || initStock(p.id)])
      );
    }

    const matching = allSale(allProducts, filter);

    const cards = [];
    for (const product of matching) {
      let brand = null, partner = null, price = null;
      if (usingPostgres) {
        brand = product.brandId ? await db.getBrand(pool, product.brandId) : null;
        partner = await db.getPartner(pool, product.partnerId);
        price = await db.getCurrentPricePg(pool, product.id);
      } else {
        brand = product.brandId ? memory.brands.get(product.brandId) || null : null;
        partner = memory.partners.get(product.partnerId) || null;
        price = priceHistory.currentPrice(memory.priceHistoryByProductId.get(product.id) || priceHistory.emptyHistory());
      }

      const [card] = buildListingCards([product], stockByProductId, brand ? { [brand.id]: brand } : {});
      cards.push({
        ...card,
        priceMinorUnits: price,
        cornerName: partner ? partner.legalName : null,
      });
    }

    sendJson(res, 200, { products: cards, total: cards.length });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
}

/**
 * Client Account endpoints — Wishlist, Corner Follows, Addresses.
 * Closes the last major Client-facing gap of today's sprint: every
 * other prototype (Product Page, All Sale, Chaussures, Corners) is
 * wired to real data, the Account panels never were. Every handler
 * starts with authorizeClientRequest(): in Postgres mode the `:clientId`
 * in the URL must equal the authenticated caller's auth user id
 * (fashion.clients.id = auth.users.id), so a client can only read or
 * change their own Wishlist, Follows and Addresses. Still open:
 * public.zfashion_ensure_client() is not called from here yet.
 */
async function handleAddWishlistItem(req, res, clientId) {
  if (!(await authorizeClientRequest(req, res, clientId))) return;
  const body = await readBody(req);
  try {
    if (usingPostgres) {
      await db.addWishlistItemPg(pool, clientId, body.productId);
    } else {
      memory.wishlist = accountDomain.addWishlistItem(memory.wishlist, clientId, body.productId);
    }
    sendJson(res, 201, { ok: true });
  } catch (err) {
    sendJson(res, 422, { error: err.message });
  }
}

async function handleRemoveWishlistItem(req, res, clientId, productId) {
  if (!(await authorizeClientRequest(req, res, clientId))) return;
  try {
    if (usingPostgres) {
      await db.removeWishlistItemPg(pool, clientId, productId);
    } else {
      memory.wishlist = accountDomain.removeWishlistItem(memory.wishlist, clientId, productId);
    }
    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
}

/** Decorates each wishlisted productId with the same listing-card
 *  shape All Sale/Corner cards already use — a Client's Wishlist is a
 *  list of Products, it should look like one, not a bare id array. */
async function handleListWishlist(req, res, clientId) {
  if (!(await authorizeClientRequest(req, res, clientId))) return;
  try {
    let entries, products, stockByProductId, brandsById;
    if (usingPostgres) {
      entries = await db.listWishlistForClientPg(pool, clientId);
      products = [];
      for (const e of entries) {
        const p = await db.getProduct(pool, e.productId);
        if (p) products.push(p);
      }
      stockByProductId = await db.getStockForProductsPg(pool, products.map((p) => p.id));
      brandsById = {};
      for (const p of products) {
        if (p.brandId && !brandsById[p.brandId]) brandsById[p.brandId] = await db.getBrand(pool, p.brandId);
      }
    } else {
      const productIds = accountDomain.listWishlistProductIds(memory.wishlist, clientId);
      products = productIds.map((id) => memory.products.get(id)).filter(Boolean);
      stockByProductId = Object.fromEntries(products.map((p) => [p.id, memory.stockByProductId.get(p.id) || initStock(p.id)]));
      brandsById = {};
      for (const p of products) {
        if (p.brandId) brandsById[p.brandId] = memory.brands.get(p.brandId) || null;
      }
    }

    const cards = buildListingCards(products, stockByProductId, brandsById);
    sendJson(res, 200, { products: cards, total: cards.length });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
}

async function handleFollowCorner(req, res, clientId) {
  if (!(await authorizeClientRequest(req, res, clientId))) return;
  const body = await readBody(req);
  try {
    if (usingPostgres) {
      await db.followCornerPg(pool, clientId, body.partnerId);
    } else {
      memory.cornerFollows = accountDomain.followCorner(memory.cornerFollows, clientId, body.partnerId);
    }
    sendJson(res, 201, { ok: true });
  } catch (err) {
    sendJson(res, 422, { error: err.message });
  }
}

async function handleUnfollowCorner(req, res, clientId, partnerId) {
  if (!(await authorizeClientRequest(req, res, clientId))) return;
  try {
    if (usingPostgres) {
      await db.unfollowCornerPg(pool, clientId, partnerId);
    } else {
      memory.cornerFollows = accountDomain.unfollowCorner(memory.cornerFollows, clientId, partnerId);
    }
    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
}

/** Decorates each followed partnerId with its Corner config — a
 *  Client follows a boutique, the response should show its name/
 *  byline/accent, not a bare id. A Partner without a configured Corner
 *  yet is skipped, same "never fabricate a Corner" rule the public
 *  directory already follows. */
async function handleListFollows(req, res, clientId) {
  if (!(await authorizeClientRequest(req, res, clientId))) return;
  try {
    let partnerIds, configs;
    if (usingPostgres) {
      const entries = await db.listFollowsForClientPg(pool, clientId);
      partnerIds = entries.map((e) => e.partnerId);
      configs = [];
      for (const id of partnerIds) {
        const c = await db.getCornerConfig(pool, id);
        if (c) configs.push(c);
      }
    } else {
      partnerIds = accountDomain.listFollowedPartnerIds(memory.cornerFollows, clientId);
      configs = partnerIds.map((id) => memory.cornerConfigs.get(id)).filter(Boolean);
    }
    sendJson(res, 200, { corners: configs, total: configs.length });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
}

async function handleCreateClientAddress(req, res, clientId) {
  if (!(await authorizeClientRequest(req, res, clientId))) return;
  const body = await readBody(req);
  try {
    if (usingPostgres) {
      const address = await db.insertClientAddressPg(pool, { ...body, clientUserId: clientId });
      return sendJson(res, 201, { address });
    }

    const address = addressDomain.createAddress({ ...body, id: require('crypto').randomUUID(), clientUserId: clientId });
    memory.addressBook = addressDomain.addAddress(memory.addressBook, address);
    sendJson(res, 201, { address });
  } catch (err) {
    sendJson(res, 422, { error: err.message });
  }
}

async function handleListClientAddresses(req, res, clientId) {
  if (!(await authorizeClientRequest(req, res, clientId))) return;
  try {
    const addresses = usingPostgres
      ? await db.listClientAddressesPg(pool, clientId)
      : addressDomain.listAddressesForClient(memory.addressBook, clientId);
    sendJson(res, 200, { addresses, total: addresses.length });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
}

async function handleSetDefaultClientAddress(req, res, clientId, addressId) {
  if (!(await authorizeClientRequest(req, res, clientId))) return;
  try {
    if (usingPostgres) {
      const address = await db.setDefaultClientAddressPg(pool, clientId, addressId);
      return sendJson(res, 200, { address });
    }

    memory.addressBook = addressDomain.setDefaultAddress(memory.addressBook, clientId, addressId);
    const address = addressDomain.listAddressesForClient(memory.addressBook, clientId).find((a) => a.id === addressId);
    sendJson(res, 200, { address });
  } catch (err) {
    sendJson(res, 422, { error: err.message });
  }
}

/**
 * Partner-facing Commission/Billing view — GET /partners/:id/commission.
 * Closes half of today's Dashboard gap flagged by Ricardo: the
 * Overview panel's own empty-state literally said "not built yet."
 *
 * Deliberately honest about what cannot be shown: no column anywhere
 * in this schema tracks a Partner's own revenue — fashion.orders.
 * total_minor_units is the whole (possibly multi-Partner) Order's
 * total, never split per Partner, and fashion.shipments (the
 * Partner-scoped unit) carries no monetary column at all. Since no
 * checkout API exists yet either (no real completed sale has ever
 * happened through this system), `monthlyGmvMinorUnits` is honestly 0
 * for every Partner today — never fabricated, never estimated from
 * Shipment counts as a stand-in for money. What this endpoint CAN
 * show honestly: the price structure itself (this store's monthly
 * subscription for its number of categories and the per-ticket
 * commission tiers) — true regardless of whether any real sale has
 * happened yet.
 */
async function handleGetPartnerCommission(req, res, partnerId) {
  if (!(await authorizePartnerRequest(req, res, partnerId))) return;
  try {
    const partner = usingPostgres ? await db.getPartner(pool, partnerId) : memory.partners.get(partnerId);
    if (!partner) return sendJson(res, 404, { error: `no partner with id ${partnerId}` });

    // Real, honest, always 0 today — no checkout API exists to create
    // a completed sale, so no Partner's GMV can be anything else.
    const monthlyGmvMinorUnits = 0;
    const offer = await currentOffer();

    sendJson(res, 200, {
      categoryCount: new Set(partner.categories || []).size,
      monthlySubscriptionFeeMinorUnits: commissionDomain.subscriptionFeeMinorUnits(partner.categories || []),
      pricesExcludeVat: offer.pricesExcludeVat,
      firstMonthFree: offer.firstMonthFree,
      ticketCommissionTiers: offer.ticketCommissionTiers,
      monthlyGmvMinorUnits,
      gmvNote: 'Aucune vente réelle possible pour l’instant — aucune API de paiement/checkout n’existe encore (voir ZOS-ALIGNMENT.md).',
    });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
}

async function handleUpsertCornerConfig(req, res, partnerId) {
  if (!(await authorizePartnerRequest(req, res, partnerId))) return;
  const body = await readBody(req);
  try {
    if (usingPostgres) {
      const config = await db.upsertCornerConfig(pool, { ...body, partnerId });
      return sendJson(res, 200, { cornerConfig: config });
    }

    const config = createCornerConfig({ ...body, partnerId });
    memory.cornerConfigs.set(partnerId, config);
    sendJson(res, 200, { cornerConfig: config });
  } catch (err) {
    sendJson(res, 422, { error: err.message });
  }
}

/**
 * Public Corners directory — GET /catalog/corners. A Partner with no
 * configured Corner yet simply doesn't appear here, never fabricated
 * from `legalName` as a fallback — showing an unconfigured Corner
 * would misrepresent a Partner who hasn't chosen their display name/
 * byline/accent color yet as if they had.
 */
async function handleListCorners(req, res) {
  try {
    const configs = usingPostgres ? await db.listCornerConfigs(pool) : [...memory.cornerConfigs.values()];
    sendJson(res, 200, { corners: configs, total: configs.length });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
}

/**
 * Public Corner detail — GET /catalog/corners/:partnerId. Every
 * Product belonging to this Partner (corner.js's corner() — includes
 * cornerExclusive Products, unlike All Sale, same distinction
 * DOMAIN-SKETCH.md already establishes), decorated the same way All
 * Sale's cards are.
 */
async function handleGetCornerDetail(req, res, partnerId) {
  try {
    let config, allProducts, stockByProductId, brandsById;

    if (usingPostgres) {
      config = await db.getCornerConfig(pool, partnerId);
      if (!config) return sendJson(res, 404, { error: `no configured Corner for partner ${partnerId}` });

      allProducts = await db.listProductsForPartner(pool, partnerId);
      stockByProductId = await db.getStockForProductsPg(pool, allProducts.map((p) => p.id));
      brandsById = {};
      for (const p of allProducts) {
        if (p.brandId && !brandsById[p.brandId]) {
          brandsById[p.brandId] = await db.getBrand(pool, p.brandId);
        }
      }
    } else {
      config = memory.cornerConfigs.get(partnerId);
      if (!config) return sendJson(res, 404, { error: `no configured Corner for partner ${partnerId}` });

      allProducts = [...memory.products.values()].filter((p) => p.partnerId === partnerId);
      stockByProductId = Object.fromEntries(
        allProducts.map((p) => [p.id, memory.stockByProductId.get(p.id) || initStock(p.id)])
      );
      brandsById = {};
      for (const p of allProducts) {
        if (p.brandId) brandsById[p.brandId] = memory.brands.get(p.brandId) || null;
      }
    }

    const cornerCatalog = cornerProducts(allProducts, partnerId);
    const cards = buildListingCards(cornerCatalog, stockByProductId, brandsById);

    sendJson(res, 200, { cornerConfig: config, products: cards, total: cards.length });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean);

  const cors = corsHeadersFor(req.headers.origin, allowedOrigins);
  for (const [name, value] of Object.entries(cors)) res.setHeader(name, value);
  if (req.method === 'OPTIONS') {
    res.writeHead(cors['Access-Control-Allow-Origin'] ? 204 : 403);
    return res.end();
  }

  try {
    if (req.method === 'GET' && parts[0] === 'health') {
      return sendJson(res, 200, { ok: true, usingPostgres });
    }
    if (req.method === 'GET' && parts[0] === 'me' && parts.length === 1) {
      return await handleMe(req, res);
    }
    if (req.method === 'GET' && parts[0] === 'onboarding' && parts[1] === 'offer' && parts.length === 2) {
      return await handleGetOnboardingOffer(req, res);
    }
    if (req.method === 'POST' && parts[0] === 'partner-applications' && parts.length === 1) {
      return await handleSubmitPartnerApplication(req, res);
    }
    if (req.method === 'POST' && parts[0] === 'partners' && parts.length === 1) {
      return await handleApplyPartner(req, res);
    }
    if (req.method === 'POST' && parts[0] === 'partners' && parts[2] === 'transition') {
      return await handleTransition(req, res, parts[1]);
    }
    if (req.method === 'POST' && parts[0] === 'partners' && parts[2] === 'stock' && parts[3] === 'bulk') {
      return await handleBulkStockUpdate(req, res, parts[1]);
    }
    if (req.method === 'POST' && parts[0] === 'partners' && parts[2] === 'stock' && parts.length === 4) {
      return await handleStockUpdate(req, res, parts[1], parts[3]);
    }
    if (req.method === 'GET' && parts[0] === 'partners' && parts[2] === 'stock' && parts.length === 4) {
      return await handleGetStock(req, res, parts[1], parts[3]);
    }
    if (req.method === 'POST' && parts[0] === 'partners' && parts[2] === 'brands') {
      return await handleCreateBrand(req, res, parts[1]);
    }
    if (req.method === 'POST' && parts[0] === 'partners' && parts[2] === 'products') {
      return await handleCreateProduct(req, res, parts[1]);
    }
    if (req.method === 'GET' && parts[0] === 'partners' && parts[2] === 'products') {
      return await handleListProducts(req, res, parts[1]);
    }
    if (req.method === 'GET' && parts[0] === 'products' && parts.length === 2) {
      return await handleGetProduct(req, res, parts[1]);
    }
    if (req.method === 'GET' && parts[0] === 'catalog' && parts[1] === 'products' && parts.length === 3) {
      return await handleGetCatalogProduct(req, res, parts[2]);
    }
    if (req.method === 'GET' && parts[0] === 'catalog' && parts[1] === 'all-sale' && parts.length === 2) {
      return await handleGetAllSale(req, res, url.searchParams);
    }
    if (req.method === 'POST' && parts[0] === 'partners' && parts[2] === 'corner-config') {
      return await handleUpsertCornerConfig(req, res, parts[1]);
    }
    if (req.method === 'GET' && parts[0] === 'partners' && parts[2] === 'commission') {
      return await handleGetPartnerCommission(req, res, parts[1]);
    }
    if (req.method === 'GET' && parts[0] === 'catalog' && parts[1] === 'corners' && parts.length === 2) {
      return await handleListCorners(req, res);
    }
    if (req.method === 'GET' && parts[0] === 'catalog' && parts[1] === 'corners' && parts.length === 3) {
      return await handleGetCornerDetail(req, res, parts[2]);
    }
    if (req.method === 'POST' && parts[0] === 'clients' && parts[2] === 'wishlist' && parts.length === 3) {
      return await handleAddWishlistItem(req, res, parts[1]);
    }
    if (req.method === 'DELETE' && parts[0] === 'clients' && parts[2] === 'wishlist' && parts.length === 4) {
      return await handleRemoveWishlistItem(req, res, parts[1], parts[3]);
    }
    if (req.method === 'GET' && parts[0] === 'clients' && parts[2] === 'wishlist' && parts.length === 3) {
      return await handleListWishlist(req, res, parts[1]);
    }
    if (req.method === 'POST' && parts[0] === 'clients' && parts[2] === 'follows' && parts.length === 3) {
      return await handleFollowCorner(req, res, parts[1]);
    }
    if (req.method === 'DELETE' && parts[0] === 'clients' && parts[2] === 'follows' && parts.length === 4) {
      return await handleUnfollowCorner(req, res, parts[1], parts[3]);
    }
    if (req.method === 'GET' && parts[0] === 'clients' && parts[2] === 'follows' && parts.length === 3) {
      return await handleListFollows(req, res, parts[1]);
    }
    if (req.method === 'POST' && parts[0] === 'clients' && parts[2] === 'addresses' && parts.length === 3) {
      return await handleCreateClientAddress(req, res, parts[1]);
    }
    if (req.method === 'GET' && parts[0] === 'clients' && parts[2] === 'addresses' && parts.length === 3) {
      return await handleListClientAddresses(req, res, parts[1]);
    }
    if (req.method === 'POST' && parts[0] === 'clients' && parts[2] === 'addresses' && parts[4] === 'set-default') {
      return await handleSetDefaultClientAddress(req, res, parts[1], parts[3]);
    }
    if (req.method === 'POST' && parts[0] === 'shipments' && parts.length === 1) {
      return await handleCreateShipment(req, res);
    }
    if (req.method === 'GET' && parts[0] === 'partners' && parts[2] === 'shipments') {
      return await handleListShipments(req, res, parts[1]);
    }
    if (req.method === 'POST' && parts[0] === 'shipments' && parts[2] === 'transition') {
      return await handleTransitionShipment(req, res, parts[1]);
    }
    if (req.method === 'POST' && parts[0] === 'returns' && parts.length === 1) {
      return await handleCreateReturn(req, res);
    }
    if (req.method === 'GET' && parts[0] === 'partners' && parts[2] === 'returns') {
      return await handleListReturns(req, res, parts[1]);
    }
    if (req.method === 'POST' && parts[0] === 'returns' && parts[2] === 'transition') {
      return await handleTransitionReturn(req, res, parts[1]);
    }
    sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    sendJson(res, 400, { error: 'invalid request: ' + err.message });
  }
});

const PORT = process.env.PORT || 4001;

if (require.main === module) {
  if (authRequired && !loadSupabaseAuthConfigFromEnv()) {
    console.error(
      'fashion-partner API refusing to start: DATABASE_URL is set but Supabase Auth is not configured ' +
      '(SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY). Every partner and client route would be refused. ' +
      'For a disposable local database only, set FASHION_ALLOW_UNAUTHENTICATED=1.'
    );
    process.exit(1);
  }
  if (usingPostgres && !authRequired) {
    console.warn('fashion-partner API: FASHION_ALLOW_UNAUTHENTICATED=1 — authentication is OFF. Never use this in production.');
  }
  server.listen(PORT, () => {
    console.log(`fashion-partner API listening on :${PORT} (usingPostgres=${usingPostgres})`);
  });
}

module.exports = { server };
