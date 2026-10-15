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
const { createApplication, transition, reviewDecisionErrors } = require('../../../packages/fashion-domain/src/onboarding');
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
const mediaDomain = require('../../../packages/fashion-domain/src/media');
const checkoutDomain = require('../../../packages/fashion-domain/src/checkout');
const { productName } = require('../../../packages/fashion-domain/src/product');
const { storefrontSections } = require('../../../packages/fashion-domain/src/storefront');
const { stockAvailabilityLabel } = require('../../../packages/fashion-domain/src/stock');
const memoryCheckout = require('./memory-checkout');
const stripeLib = require('./stripe');
const payoutsService = require('./payouts-service');
const { STRIPE_EVENT_STATUS } = require('../../../packages/fashion-domain/src/payment');
const db = require('./db');
const { resolveAuthenticatedUserId, loadSupabaseAuthConfigFromEnv } = require('./auth');
const { isAuthRequired, loadAdminUserIds, decideAccess } = require('./access');
const { loadAllowedOrigins, corsHeadersFor } = require('./cors');
const { createMediaStorage, publicUrlFor } = require('./media-storage');

const usingPostgres = !!process.env.DATABASE_URL;
const pool = usingPostgres ? db.createPool() : null;

const authRequired = isAuthRequired({ usingPostgres });
const allowedOrigins = loadAllowedOrigins();
const mediaStorage = createMediaStorage({
  usingPostgres,
  publicBaseUrl: (process.env.FASHION_PUBLIC_API_URL || `http://127.0.0.1:${process.env.PORT || 4001}`).replace(/\/+$/, ''),
});

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
  return decision || null;
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
  memory.partnerApplications.set(partnerId, { ...application, offerSnapshot, termsAcceptedAt: new Date().toISOString() });
  sendJson(res, 201, { partnerId, onboardingStatus: 'applied' });
}

/**
 * Public catalogue visibility (2026-10-15): only stores whose
 * onboarding_status is 'active' are shown to shoppers — never a store
 * that has only applied, is under review, was rejected or is suspended.
 * Applies to /catalog/*, /products/:id and the wishlist / followed
 * Corners views. Partner-scoped routes (a store managing its own
 * catalogue) are unaffected.
 */
async function activePartnerIdSet() {
  if (usingPostgres) return new Set(await db.listActivePartnerIds(pool));
  const ids = [];
  for (const [id, application] of memory.applications) if (application.status === 'active') ids.push(id);
  return new Set(ids);
}

/* ---------- Back-office: store applications (task 8) ---------- */

function applicationWithFee(application) {
  let monthlySubscriptionFeeMinorUnits = null;
  try { monthlySubscriptionFeeMinorUnits = commissionDomain.subscriptionFeeMinorUnits(application.categories || []); } catch (e) { /* unknown category: leave null */ }
  return { ...application, monthlySubscriptionFeeMinorUnits };
}

function memoryApplicationView(partnerId) {
  const form = memory.partnerApplications.get(partnerId);
  const state = memory.applications.get(partnerId);
  if (!form || !state) return null;
  const decision = memory.applicationDecisions.get(partnerId) || {};
  const { offerSnapshot, ...fields } = form;
  return {
    partnerId, ...fields, offerSnapshot,
    onboardingStatus: state.status,
    feedReliabilityTier: state.feedReliabilityTier || null,
    createdAt: state.history[0].at,
    decisionNote: decision.note || null,
    decidedAt: decision.at || null,
  };
}

const REVIEWABLE_STATUSES = ['applied', 'under_review', 'approved', 'rejected', 'active', 'suspended'];

/** GET /admin/partner-applications?status= — admins only. */
async function handleAdminListApplications(req, res, query) {
  if (!(await authorizeAdminRequest(req, res))) return;
  const status = query.get('status');
  if (status && !REVIEWABLE_STATUSES.includes(status)) return sendJson(res, 422, { error: 'unknown status' });
  if (usingPostgres) {
    const { applications, countsByStatus } = await db.listPartnerApplicationsPg(pool, { status: status || null });
    return sendJson(res, 200, { applications: applications.map(applicationWithFee), countsByStatus });
  }
  const all = [...memory.partnerApplications.keys()].map(memoryApplicationView).filter(Boolean)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const countsByStatus = {};
  for (const a of all) countsByStatus[a.onboardingStatus] = (countsByStatus[a.onboardingStatus] || 0) + 1;
  const applications = (status ? all.filter((a) => a.onboardingStatus === status) : all).map(applicationWithFee);
  sendJson(res, 200, { applications, countsByStatus });
}

/** GET /admin/partner-applications/:partnerId — admins only. */
async function handleAdminGetApplication(req, res, partnerId) {
  if (!(await authorizeAdminRequest(req, res))) return;
  const application = usingPostgres ? await db.getPartnerApplicationPg(pool, partnerId) : memoryApplicationView(partnerId);
  if (!application) return sendJson(res, 404, { error: 'application_not_found' });
  sendJson(res, 200, { application: applicationWithFee(application) });
}

/**
 * POST /admin/partner-applications/:partnerId/decision — admins only.
 * Body: { toStatus, note?, feedReliabilityTier? }. Rejecting or
 * suspending requires a note (the store is shown why); activating
 * requires the stock mode. The transition graph and the activation
 * gates are enforced by onboarding.js and, in Postgres, by the
 * database trigger.
 */
async function handleAdminDecideApplication(req, res, partnerId) {
  const decision = await authorizeAdminRequest(req, res);
  if (!decision) return;
  const body = await readBody(req);
  const fieldErrors = reviewDecisionErrors(body);
  if (fieldErrors.length) return sendJson(res, 422, { error: 'invalid_decision', fieldErrors });

  if (usingPostgres) {
    const current = await db.getPartnerApplicationPg(pool, partnerId);
    if (!current) return sendJson(res, 404, { error: 'application_not_found' });
    try {
      transition({ status: current.onboardingStatus, history: [] }, body.toStatus, {
        partner: { ageSegments: current.ageSegments, minorSafeDataAcknowledged: current.minorSafeDataAcknowledged },
        feedReliabilityTier: body.feedReliabilityTier,
      });
    } catch (err) {
      return sendJson(res, 409, { error: 'transition_not_allowed', detail: err.message, from: current.onboardingStatus });
    }
    const updated = await db.decidePartnerApplicationPg(pool, partnerId, {
      toStatus: body.toStatus,
      feedReliabilityTier: body.toStatus === 'active' ? body.feedReliabilityTier : null,
      note: body.note,
      reviewerUserId: decision.userId || null,
    });
    return sendJson(res, 200, { application: applicationWithFee(updated) });
  }

  const state = memory.applications.get(partnerId);
  if (!state || !memory.partnerApplications.has(partnerId)) return sendJson(res, 404, { error: 'application_not_found' });
  try {
    const next = transition(state, body.toStatus, { partner: memory.partners.get(partnerId), feedReliabilityTier: body.feedReliabilityTier });
    memory.applications.set(partnerId, next);
  } catch (err) {
    return sendJson(res, 409, { error: 'transition_not_allowed', detail: err.message, from: state.status });
  }
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const previous = memory.applicationDecisions.get(partnerId) || {};
  memory.applicationDecisions.set(partnerId, { note: note || previous.note || null, at: new Date().toISOString() });
  sendJson(res, 200, { application: applicationWithFee(memoryApplicationView(partnerId)) });
}

/** GET /partners/:id/application — the store's own application status
 *  and the latest decision note (e.g. why it was rejected). */
async function handleGetOwnApplication(req, res, partnerId) {
  if (!(await authorizePartnerRequest(req, res, partnerId))) return;
  const application = usingPostgres ? await db.getPartnerApplicationPg(pool, partnerId) : memoryApplicationView(partnerId);
  if (!application) return sendJson(res, 404, { error: 'application_not_found' });
  sendJson(res, 200, {
    partnerId,
    tradeName: application.tradeName,
    onboardingStatus: application.onboardingStatus,
    decisionNote: application.decisionNote,
    decidedAt: application.decidedAt,
    createdAt: application.createdAt,
    monthlySubscriptionFeeMinorUnits: applicationWithFee(application).monthlySubscriptionFeeMinorUnits,
    categories: application.categories || [],
    ageSegments: application.ageSegments || [],
    minorSafeDataAcknowledged: !!application.minorSafeDataAcknowledged,
  });
}

/* ---------- Partner console (task 7) ---------- */

/** Prices are integer euro cents, at least 0.01 and at most 100 000 EUR. */
function isValidPrice(value) {
  return Number.isInteger(value) && value > 0 && value <= 10000000;
}

/** GET /partners/:id/brands — brands the store can pick for a product. */
async function handleListBrands(req, res, partnerId) {
  if (!(await authorizePartnerRequest(req, res, partnerId))) return;
  if (usingPostgres) return sendJson(res, 200, { brands: await db.listBrandsForPartnerPg(pool, partnerId) });
  const usedIds = new Set([...memory.products.values()].filter((p) => p.partnerId === partnerId).map((p) => p.brandId));
  const brands = [...memory.brands.values()]
    .filter((b) => b.houseLabelOfPartnerId === partnerId || usedIds.has(b.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  sendJson(res, 200, { brands });
}

/**
 * GET /partners/:id/inventory — the store's products with brand name,
 * current price and stock, in one call for the Partner console.
 */
async function handleGetInventory(req, res, partnerId) {
  if (!(await authorizePartnerRequest(req, res, partnerId))) return;
  let products, stockById, priceById, brandsById;
  if (usingPostgres) {
    products = await db.listProductsForPartner(pool, partnerId);
    const ids = products.map((p) => p.id);
    stockById = await db.getStockForProductsPg(pool, ids);
    priceById = await db.getCurrentPricesPg(pool, ids);
    brandsById = Object.fromEntries((await db.listBrandsForPartnerPg(pool, partnerId)).map((b) => [b.id, b]));
  } else {
    products = [...memory.products.values()].filter((p) => p.partnerId === partnerId);
    stockById = Object.fromEntries(products.map((p) => [p.id, memory.stockByProductId.get(p.id) || null]));
    priceById = Object.fromEntries(products.map((p) => [p.id,
      priceHistory.currentPrice(memory.priceHistoryByProductId.get(p.id) || priceHistory.emptyHistory())]));
    brandsById = Object.fromEntries([...memory.brands.values()].map((b) => [b.id, b]));
  }
  const imagesById = await imagesByProductId(products.map((p) => p.id));
  const items = products.map((p) => {
    const stock = stockById[p.id] || null;
    return {
      id: p.id,
      sku: p.sku || null,
      names: p.names,
      brandId: p.brandId,
      brandName: brandsById[p.brandId] ? brandsById[p.brandId].name : null,
      categories: p.categories,
      gender: p.gender,
      ageSegments: p.ageSegments,
      size: p.size,
      format: p.format,
      priceMinorUnits: priceById[p.id] == null ? null : priceById[p.id],
      images: imagesById[p.id] || [],
      stock: stock
        ? { quantityAvailable: stock.quantityAvailable, quantityReserved: stock.quantityReserved, sellable: sellableQuantity(stock), lastUpdatedAt: stock.lastUpdatedAt }
        : null,
    };
  });
  sendJson(res, 200, { products: items, total: items.length });
}

/** POST /partners/:id/products/:productId/price — { priceMinorUnits }.
 *  Appends to the price history (never rewrites it: the legal reference
 *  price for discounts depends on that history). */
async function handleSetPrice(req, res, partnerId, productId) {
  if (!(await authorizePartnerRequest(req, res, partnerId))) return;
  const body = await readBody(req);
  if (!isValidPrice(body.priceMinorUnits)) return sendJson(res, 422, { error: 'invalid_price' });
  try {
    await assertProductOwnership(partnerId, productId);
  } catch (err) {
    return sendJson(res, err.statusCode || 422, { error: err.message });
  }
  const observedAt = new Date().toISOString();
  if (usingPostgres) {
    await db.recordPricePg(pool, productId, body.priceMinorUnits, observedAt);
  } else {
    const history = memory.priceHistoryByProductId.get(productId) || priceHistory.emptyHistory();
    memory.priceHistoryByProductId.set(productId, priceHistory.recordPrice(history, { priceMinorUnits: body.priceMinorUnits, observedAt }));
  }
  sendJson(res, 200, { productId, priceMinorUnits: body.priceMinorUnits, observedAt });
}

/** GET /partners/:id/corner-config — the store's own Corner settings,
 *  whatever its status (the public Corner routes only show active stores). */
async function handleGetOwnCornerConfig(req, res, partnerId) {
  if (!(await authorizePartnerRequest(req, res, partnerId))) return;
  const config = usingPostgres ? await db.getCornerConfig(pool, partnerId) : memory.cornerConfigs.get(partnerId) || null;
  sendJson(res, 200, { cornerConfig: config });
}

/* ---------- Product photos and store logo (task 7b) ---------- */

function imageUrl(path) { return publicUrlFor({ usingPostgres, storage: mediaStorage, path }); }
function imageView(img) { return { id: img.id, url: imageUrl(img.storagePath), position: img.position }; }

/** Photos of several products: { productId: [{ id, url, position }] }, cover first. */
async function imagesByProductId(productIds) {
  if (usingPostgres) {
    const rows = await db.listImagesForProductsPg(pool, productIds);
    return Object.fromEntries(productIds.map((id) => [id, (rows[id] || []).map(imageView)]));
  }
  return Object.fromEntries(productIds.map((id) => [id, (memory.productImages.get(id) || []).map(imageView)]));
}

/** Reads a binary request body, at most `limit` bytes (null when larger). */
function readRawBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0; let tooLarge = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) { tooLarge = true; return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(tooLarge ? null : Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readImageUpload(req, res) {
  if (!mediaStorage) { sendJson(res, 503, { error: 'media_storage_not_configured' }); return null; }
  const bytes = await readRawBody(req, mediaDomain.MAX_IMAGE_BYTES);
  if (bytes === null) { sendJson(res, 413, { error: 'too_large' }); return null; }
  const check = mediaDomain.validateImageUpload({ declaredType: req.headers['content-type'], bytes });
  if (!check.ok) { sendJson(res, check.code === 'too_large' ? 413 : 415, { error: check.code }); return null; }
  return { bytes, ...check };
}

/** POST /partners/:id/products/:productId/images — raw JPEG/PNG/WebP body. */
async function handleUploadProductImage(req, res, partnerId, productId) {
  if (!(await authorizePartnerRequest(req, res, partnerId))) return;
  try { await assertProductOwnership(partnerId, productId); } catch (err) { req.resume(); return sendJson(res, err.statusCode || 422, { error: err.message }); }
  const current = (await imagesByProductId([productId]))[productId];
  if (current.length >= mediaDomain.MAX_IMAGES_PER_PRODUCT) { req.resume(); return sendJson(res, 409, { error: 'image_limit' }); }
  const upload = await readImageUpload(req, res);
  if (!upload) return;

  const id = require('crypto').randomUUID();
  const storagePath = mediaDomain.productImagePath(partnerId, productId, id, upload.extension);
  try {
    await mediaStorage.put(storagePath, upload.bytes, upload.contentType);
  } catch (err) {
    console.error('[media] upload failed', err.message);
    return sendJson(res, 502, { error: 'storage_failed' });
  }
  try {
    let image;
    if (usingPostgres) {
      image = await db.insertProductImagePg(pool, { id, productId, partnerId, storagePath, contentType: upload.contentType, byteSize: upload.byteSize });
    } else {
      const list = memory.productImages.get(productId) || [];
      if (list.length >= mediaDomain.MAX_IMAGES_PER_PRODUCT) { const e = new Error('image_limit'); e.code = 'image_limit'; throw e; }
      image = { id, productId, partnerId, storagePath, contentType: upload.contentType, byteSize: upload.byteSize, position: list.length };
      memory.productImages.set(productId, [...list, image]);
    }
    sendJson(res, 201, { image: imageView(image) });
  } catch (err) {
    await mediaStorage.remove(storagePath).catch(() => {});
    if (err.code === 'image_limit') return sendJson(res, 409, { error: 'image_limit' });
    throw err;
  }
}

/** DELETE /partners/:id/products/:productId/images/:imageId */
async function handleDeleteProductImage(req, res, partnerId, productId, imageId) {
  if (!(await authorizePartnerRequest(req, res, partnerId))) return;
  try { await assertProductOwnership(partnerId, productId); } catch (err) { return sendJson(res, err.statusCode || 422, { error: err.message }); }
  let removed = null;
  if (usingPostgres) {
    removed = await db.deleteProductImagePg(pool, productId, imageId);
  } else {
    const list = memory.productImages.get(productId) || [];
    removed = list.find((i) => i.id === imageId) || null;
    memory.productImages.set(productId, list.filter((i) => i.id !== imageId).map((i, n) => ({ ...i, position: n })));
  }
  if (!removed) return sendJson(res, 404, { error: 'image_not_found' });
  if (mediaStorage) {
    await mediaStorage.remove(removed.storagePath).catch((err) => console.error('[media] delete failed, file left in storage', removed.storagePath, err.message));
  }
  sendJson(res, 200, { images: (await imagesByProductId([productId]))[productId] });
}

/** POST /partners/:id/products/:productId/images/order — { imageIds } (cover first). */
async function handleReorderProductImages(req, res, partnerId, productId) {
  if (!(await authorizePartnerRequest(req, res, partnerId))) return;
  try { await assertProductOwnership(partnerId, productId); } catch (err) { return sendJson(res, err.statusCode || 422, { error: err.message }); }
  const body = await readBody(req);
  const currentIds = (await imagesByProductId([productId]))[productId].map((i) => i.id);
  if (!mediaDomain.isValidImageOrder(currentIds, body.imageIds)) return sendJson(res, 422, { error: 'invalid_order' });
  if (usingPostgres) {
    await db.reorderProductImagesPg(pool, productId, body.imageIds);
  } else {
    const byId = Object.fromEntries((memory.productImages.get(productId) || []).map((i) => [i.id, i]));
    memory.productImages.set(productId, body.imageIds.map((id, n) => ({ ...byId[id], position: n })));
  }
  sendJson(res, 200, { images: (await imagesByProductId([productId]))[productId] });
}

/** POST /partners/:id/logo — raw image; returns its public URL for the Corner settings. */
async function handleUploadLogo(req, res, partnerId) {
  if (!(await authorizePartnerRequest(req, res, partnerId))) return;
  const upload = await readImageUpload(req, res);
  if (!upload) return;
  const storagePath = mediaDomain.logoPath(partnerId, require('crypto').randomUUID(), upload.extension);
  try {
    await mediaStorage.put(storagePath, upload.bytes, upload.contentType);
  } catch (err) {
    console.error('[media] logo upload failed', err.message);
    return sendJson(res, 502, { error: 'storage_failed' });
  }
  sendJson(res, 201, { url: imageUrl(storagePath) });
}

/** GET /media/<path> — in-memory mode only (local development). */
function handleMemoryMedia(req, res, path) {
  const file = mediaStorage && mediaStorage.kind === 'memory' ? mediaStorage.get(path) : null;
  if (!file) return sendJson(res, 404, { error: 'not found' });
  res.writeHead(200, { 'Content-Type': file.contentType, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=60' });
  res.end(file.bytes);
}

// In-memory fallback store — only reachable when usingPostgres is false.
const memory = {
  partners: new Map(), applications: new Map(), stockByProductId: new Map(),
  brands: new Map(), products: new Map(), shipments: new Map(), returns: new Map(),
  priceHistoryByProductId: new Map(), cornerConfigs: new Map(),
  wishlist: accountDomain.emptyWishlist(), cornerFollows: accountDomain.emptyCornerFollows(),
  addressBook: addressDomain.emptyAddressBook(),
  partnerApplications: new Map(),
  applicationDecisions: new Map(),
  productImages: new Map(),
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
      const validated = createProduct({ ...body, id: 'pending', partnerId });
      if (body.priceMinorUnits !== undefined && !isValidPrice(body.priceMinorUnits)) {
        return sendJson(res, 422, { error: 'invalid_price' });
      }
      const row = await db.insertProduct(pool, { ...validated, partnerId });

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
    if (body.priceMinorUnits !== undefined && !isValidPrice(body.priceMinorUnits)) {
      return sendJson(res, 422, { error: 'invalid_price' });
    }
    if (product.sku && [...memory.products.values()].some((p) => p.partnerId === partnerId && p.sku === product.sku)) {
      return sendJson(res, 409, { error: 'sku_taken' });
    }
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
    if (err.code === 'sku_taken') return sendJson(res, 409, { error: 'sku_taken' });
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
    const product = usingPostgres ? await db.getProduct(pool, productId) : memory.products.get(productId);
    const active = await activePartnerIdSet();
    if (!product || !active.has(product.partnerId)) return sendJson(res, 404, { error: `no product with id ${productId}` });
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

    const activeIds = await activePartnerIdSet();
    if (!activeIds.has(product.partnerId)) return sendJson(res, 404, { error: `no product with id ${productId}` });
    siblingProducts = siblingProducts.filter((p) => activeIds.has(p.partnerId));

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

    const images = (await imagesByProductId([product.id]))[product.id];
    sendJson(res, 200, { productPage: { ...viewModel, images } });
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

    const activeIds = await activePartnerIdSet();
    const matching = allSale(allProducts.filter((p) => activeIds.has(p.partnerId)), filter);

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
      const [cover] = (await imagesByProductId([product.id]))[product.id];
      cards.push({
        ...card,
        imageUrl: cover ? cover.url : null,
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
      const activeIds = await activePartnerIdSet();
      products = products.filter((p) => activeIds.has(p.partnerId));
      stockByProductId = await db.getStockForProductsPg(pool, products.map((p) => p.id));
      brandsById = {};
      for (const p of products) {
        if (p.brandId && !brandsById[p.brandId]) brandsById[p.brandId] = await db.getBrand(pool, p.brandId);
      }
    } else {
      const activeIds = await activePartnerIdSet();
      const productIds = accountDomain.listWishlistProductIds(memory.wishlist, clientId);
      products = productIds.map((id) => memory.products.get(id)).filter((p) => p && activeIds.has(p.partnerId));
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
    const activeIds = await activePartnerIdSet();
    configs = configs.filter((c) => activeIds.has(c.partnerId));
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
 * The price structure (subscription for the store's number of
 * categories, ticket commission tiers) plus this month's real sales:
 * the store's tickets of PAID Orders since the 1st of the month (UTC)
 * and the commission computed on each ticket at checkout. Unpaid or
 * cancelled checkouts are never counted as sales.
 */
async function handleGetPartnerCommission(req, res, partnerId) {
  if (!(await authorizePartnerRequest(req, res, partnerId))) return;
  try {
    const partner = usingPostgres ? await db.getPartner(pool, partnerId) : memory.partners.get(partnerId);
    if (!partner) return sendJson(res, 404, { error: `no partner with id ${partnerId}` });

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const sales = usingPostgres
      ? await db.partnerSalesSincePg(pool, partnerId, monthStart)
      : memoryCheckout.partnerSalesSince(memory, partnerId, monthStart);
    const offer = await currentOffer();

    sendJson(res, 200, {
      categoryCount: new Set(partner.categories || []).size,
      monthlySubscriptionFeeMinorUnits: commissionDomain.subscriptionFeeMinorUnits(partner.categories || []),
      pricesExcludeVat: offer.pricesExcludeVat,
      firstMonthFree: offer.firstMonthFree,
      ticketCommissionTiers: offer.ticketCommissionTiers,
      periodStart: monthStart.toISOString(),
      monthlyGmvMinorUnits: sales.gmvMinorUnits,
      monthlyCommissionMinorUnits: sales.commissionMinorUnits,
      monthlyTicketCount: sales.ticketCount,
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
    const activeIds = await activePartnerIdSet();
    const configs = (usingPostgres ? await db.listCornerConfigs(pool) : [...memory.cornerConfigs.values()])
      .filter((c) => activeIds.has(c.partnerId));
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
    if (!(await activePartnerIdSet()).has(partnerId)) {
      return sendJson(res, 404, { error: `no configured Corner for partner ${partnerId}` });
    }

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
    const coverById = await imagesByProductId(cornerCatalog.map((p) => p.id));
    const cards = buildListingCards(cornerCatalog, stockByProductId, brandsById)
      .map((card) => ({ ...card, imageUrl: (coverById[card.productId] || [])[0] ? coverById[card.productId][0].url : null }));

    sendJson(res, 200, { cornerConfig: config, products: cards, total: cards.length });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
}

/* ============================================================
   Cart, checkout and orders (task 10). The Client acts on their own
   account only (authorizeClientRequest); a store sees only its own
   lines of paid Orders (authorizePartnerRequest). Rules: checkout.js;
   database authority: migration 20261016090000_z_fashion_checkout_v2.
   Payment (Stripe) is the next step: an Order stays pending_payment
   until fashion.confirm_order_payment() runs, and is cancelled (stock
   released) when its hold runs out.
   ============================================================ */

const shippingCountries = checkoutDomain.parseShippingCountries(process.env.FASHION_SHIPPING_COUNTRIES);

const CHECKOUT_ERROR_STATUS = {
  insufficient_stock: 409, product_unavailable: 409, payment_in_progress: 409, order_not_cancellable: 409, order_not_payable: 409,
  empty_cart: 422, address_not_found: 422, shipping_country_not_served: 422, invalid_quantity: 422,
  order_not_found: 404,
};

function sendCheckoutError(res, err) {
  const status = CHECKOUT_ERROR_STATUS[err && err.code];
  if (!status) return sendJson(res, 400, { error: err.message });
  const body = { error: err.code };
  if (err.productId) body.productId = err.productId;
  if (typeof err.sellable === 'number' && !Number.isNaN(err.sellable)) body.sellable = err.sellable;
  return sendJson(res, status, body);
}

/** Names, brands, sizes, cover photos and store names for product lines. */
async function describeLines(productIds, partnerIds) {
  const ids = [...new Set(productIds)];
  const stores = [...new Set(partnerIds.filter(Boolean))];
  let productsById, brandsById, storeNames;
  if (usingPostgres) {
    productsById = await db.getProductsByIdsPg(pool, ids);
    const brandIds = [...new Set(Object.values(productsById).map((p) => p.brandId).filter(Boolean))];
    brandsById = await db.getBrandsByIdsPg(pool, brandIds);
    storeNames = await db.getStoreNamesPg(pool, stores);
  } else {
    productsById = Object.fromEntries(ids.map((id) => [id, memory.products.get(id)]).filter(([, p]) => p));
    brandsById = {};
    for (const p of Object.values(productsById)) if (p.brandId && memory.brands.get(p.brandId)) brandsById[p.brandId] = memory.brands.get(p.brandId);
    storeNames = Object.fromEntries(stores.map((id) => {
      const corner = memory.cornerConfigs.get(id);
      const form = memory.partnerApplications.get(id);
      const partner = memory.partners.get(id);
      return [id, (corner && corner.displayName) || (form && form.tradeName) || (partner && partner.legalName) || null];
    }));
  }
  const images = await imagesByProductId(ids);
  return { productsById, brandsById, storeNames, images };
}

function lineView(line, described) {
  const product = described.productsById[line.productId];
  const cover = (described.images[line.productId] || [])[0];
  return {
    ...line,
    name: product ? productName(product) : null,
    brandName: product && described.brandsById[product.brandId] ? described.brandsById[product.brandId].name : null,
    size: product ? product.size : null,
    format: product ? product.format : null,
    sku: product ? product.sku : null,
    imageUrl: cover ? cover.url : null,
    storeName: described.storeNames[line.partnerId] || null,
  };
}

async function buildCartView(clientId) {
  if (usingPostgres) await db.expirePendingOrdersPg(pool);
  else memoryCheckout.expirePendingOrders(memory);
  const open = usingPostgres ? await db.getOpenCartPg(pool, clientId) : memoryCheckout.getOpenCart(memory, clientId);
  const productIds = open.items.map((i) => i.productId);

  let productsById, pricesById, stockById;
  if (usingPostgres) {
    productsById = await db.getProductsByIdsPg(pool, productIds);
    pricesById = await db.getCurrentPricesPg(pool, productIds);
    stockById = await db.getStockForProductsPg(pool, productIds);
  } else {
    productsById = Object.fromEntries(productIds.map((id) => [id, memory.products.get(id)]).filter(([, p]) => p));
    pricesById = Object.fromEntries(productIds.map((id) => [id,
      priceHistory.currentPrice(memory.priceHistoryByProductId.get(id) || priceHistory.emptyHistory())]));
    stockById = Object.fromEntries(productIds.map((id) => [id, memory.stockByProductId.get(id) || initStock(id)]));
  }

  // Units held by this Client's own unpaid checkout are still theirs to buy.
  if (open.pendingOrderId) {
    const pending = usingPostgres ? await db.getOrderPg(pool, open.pendingOrderId) : memoryCheckout.getOrder(memory, open.pendingOrderId);
    for (const item of (pending ? pending.items : [])) {
      const s = stockById[item.productId];
      if (s) stockById[item.productId] = { ...s, quantityReserved: Math.max(0, s.quantityReserved - item.quantity) };
    }
  }

  const priced = checkoutDomain.priceCart({
    items: open.items, productsById, pricesById, stockById, activePartnerIds: await activePartnerIdSet(),
  });
  const described = await describeLines(productIds, priced.lines.map((l) => l.partnerId));
  return {
    cartId: open.cartId,
    currency: 'eur',
    lines: priced.lines.map((l) => lineView(l, described)),
    stores: priced.tickets.map((t) => ({
      partnerId: t.partnerId, storeName: described.storeNames[t.partnerId] || null,
      subtotalMinorUnits: t.subtotalMinorUnits, itemCount: t.itemCount,
    })),
    subtotalMinorUnits: priced.subtotalMinorUnits,
    shippingMinorUnits: priced.shippingMinorUnits,
    totalMinorUnits: priced.totalMinorUnits,
    itemCount: priced.itemCount,
    canCheckout: priced.canCheckout,
    pendingOrderId: open.pendingOrderId,
    maxLineQuantity: checkoutDomain.MAX_LINE_QUANTITY,
    shippingCountries: [...shippingCountries],
  };
}

/** Order for the Client: lines described, one block per store, no commission. */
async function clientOrderView(order) {
  const described = await describeLines(order.items.map((i) => i.productId), order.items.map((i) => i.partnerId));
  const { tickets, clientUserId, ...rest } = order;
  return {
    ...rest,
    items: order.items.map((i) => lineView(i, described)),
    stores: tickets.map((t) => ({
      partnerId: t.partnerId, storeName: described.storeNames[t.partnerId] || null,
      subtotalMinorUnits: t.subtotalMinorUnits, itemCount: t.itemCount,
      shipmentStatus: ((order.shipments || []).find((s) => s.partnerId === t.partnerId) || {}).status || null,
    })),
    shipments: undefined,
  };
}

/** Order for a store: its own lines and ticket (with commission), the delivery address. */
async function partnerOrderView(order) {
  const described = await describeLines(order.items.map((i) => i.productId), order.items.map((i) => i.partnerId));
  const { clientUserId, tickets, shipments, subtotalMinorUnits, shippingMinorUnits, totalMinorUnits, refundedMinorUnits, ...rest } = order;
  return {
    ...rest,
    items: order.items.map((i) => lineView(i, described)),
    ticket: tickets[0] || null,
    shipment: (shipments || [])[0] || null,
  };
}

async function handleGetCart(req, res, clientId) {
  if (!(await authorizeClientRequest(req, res, clientId))) return;
  try {
    sendJson(res, 200, { cart: await buildCartView(clientId) });
  } catch (err) {
    sendCheckoutError(res, err);
  }
}

/** PUT /clients/:id/cart/items/:productId { quantity } — 0 removes the line. */
async function handleSetCartItem(req, res, clientId, productId, forcedQuantity) {
  if (!(await authorizeClientRequest(req, res, clientId))) return;
  const body = forcedQuantity === undefined ? await readBody(req) : { quantity: forcedQuantity };
  const quantity = body.quantity;
  if (checkoutDomain.lineQuantityError(quantity)) {
    return sendJson(res, 422, { error: 'invalid_quantity', maxLineQuantity: checkoutDomain.MAX_LINE_QUANTITY });
  }
  try {
    if (usingPostgres) {
      if (!/^[0-9a-f-]{36}$/i.test(productId)) return sendJson(res, 409, { error: 'product_unavailable', productId });
      await db.setCartItemPg(pool, clientId, productId, quantity);
    } else {
      memoryCheckout.setCartItem(memory, { clientUserId: clientId, productId, quantity, activePartnerIds: await activePartnerIdSet() });
    }
    sendJson(res, 200, { cart: await buildCartView(clientId) });
  } catch (err) {
    sendCheckoutError(res, err);
  }
}

/** POST /clients/:id/checkout { addressId } — creates the pending-payment Order. */
async function handleCheckout(req, res, clientId) {
  if (!(await authorizeClientRequest(req, res, clientId))) return;
  const body = await readBody(req);
  if (!body.addressId || typeof body.addressId !== 'string') return sendJson(res, 422, { error: 'address_not_found' });
  try {
    const options = { addressId: body.addressId, allowedCountries: [...shippingCountries], holdSeconds: checkoutDomain.PAYMENT_HOLD_SECONDS };
    const orderId = usingPostgres
      ? await db.checkoutCartPg(pool, clientId, options)
      : memoryCheckout.checkoutCart(memory, { ...options, clientUserId: clientId, activePartnerIds: await activePartnerIdSet() });
    const order = usingPostgres ? await db.getOrderPg(pool, orderId) : memoryCheckout.getOrder(memory, orderId);
    sendJson(res, 201, { order: await clientOrderView(order) });
  } catch (err) {
    sendCheckoutError(res, err);
  }
}

async function handleListClientOrders(req, res, clientId) {
  if (!(await authorizeClientRequest(req, res, clientId))) return;
  try {
    if (usingPostgres) await db.expirePendingOrdersPg(pool); else memoryCheckout.expirePendingOrders(memory);
    const orders = usingPostgres ? await db.listOrdersForClientPg(pool, clientId) : memoryCheckout.listOrdersForClient(memory, clientId);
    const views = [];
    for (const o of orders) views.push(await clientOrderView(o));
    sendJson(res, 200, { orders: views, total: views.length });
  } catch (err) {
    sendCheckoutError(res, err);
  }
}

async function loadClientOrder(clientId, orderId) {
  if (usingPostgres && !/^[0-9a-f-]{36}$/i.test(orderId)) return null;
  const order = usingPostgres ? await db.getOrderPg(pool, orderId) : memoryCheckout.getOrder(memory, orderId);
  return order && order.clientUserId === clientId ? order : null;
}

async function handleGetClientOrder(req, res, clientId, orderId) {
  if (!(await authorizeClientRequest(req, res, clientId))) return;
  try {
    if (usingPostgres) await db.expirePendingOrdersPg(pool); else memoryCheckout.expirePendingOrders(memory);
    const order = await loadClientOrder(clientId, orderId);
    if (!order) return sendJson(res, 404, { error: 'order_not_found' });
    sendJson(res, 200, { order: await clientOrderView(order) });
  } catch (err) {
    sendCheckoutError(res, err);
  }
}

/** POST /clients/:id/orders/:orderId/cancel — abandons an unpaid checkout, releases the stock. */
async function handleCancelClientOrder(req, res, clientId, orderId) {
  if (!(await authorizeClientRequest(req, res, clientId))) return;
  try {
    const order = await loadClientOrder(clientId, orderId);
    if (!order) return sendJson(res, 404, { error: 'order_not_found' });
    if (usingPostgres) await db.cancelUnpaidOrderPg(pool, orderId);
    else memoryCheckout.cancelUnpaidOrder(memory, orderId);
    const updated = usingPostgres ? await db.getOrderPg(pool, orderId) : memoryCheckout.getOrder(memory, orderId);
    sendJson(res, 200, { order: await clientOrderView(updated) });
  } catch (err) {
    sendCheckoutError(res, err);
  }
}

/** GET /partners/:id/orders — the store's paid Orders (its lines only). */
async function handleListPartnerOrders(req, res, partnerId) {
  if (!(await authorizePartnerRequest(req, res, partnerId))) return;
  try {
    const orders = usingPostgres ? await db.listOrdersForPartnerPg(pool, partnerId) : memoryCheckout.listOrdersForPartner(memory, partnerId);
    const views = [];
    for (const o of orders) views.push(await partnerOrderView(o));
    sendJson(res, 200, { orders: views, total: views.length });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
}

/* ============================================================
   Payment (task 11): Stripe PaymentIntent per Order + signed webhook.
   The browser pays with Stripe.js using the client secret; only the
   webhook (signature checked) can move an Order to paid.
   ============================================================ */

const stripeConfig = stripeLib.loadStripeConfig();
const stripeClient = stripeConfig.payments
  ? stripeLib.createStripeClient({ secretKey: stripeConfig.payments.secretKey, apiBase: stripeConfig.payments.apiBase })
  : null;

/** POST /clients/:id/orders/:orderId/payment — client secret for the payment form. */
async function handleStartPayment(req, res, clientId, orderId) {
  if (!(await authorizeClientRequest(req, res, clientId))) return;
  if (!stripeClient) return sendJson(res, 503, { error: 'payments_not_configured' });
  try {
    const order = await loadClientOrder(clientId, orderId);
    if (!order) return sendJson(res, 404, { error: 'order_not_found' });
    let paymentIntentId = usingPostgres
      ? await db.startOrderPaymentPg(pool, orderId)
      : memoryCheckout.startOrderPayment(memory, orderId);

    let intent = null;
    if (paymentIntentId) {
      intent = await stripeClient.retrievePaymentIntent(paymentIntentId);
      if (intent.status === 'canceled' || intent.amount !== order.totalMinorUnits) {
        return sendJson(res, 409, { error: 'order_not_payable' });
      }
    } else {
      intent = await stripeClient.createPaymentIntent({
        orderId, clientUserId: clientId, amountMinorUnits: order.totalMinorUnits, currency: order.currency || 'eur',
      });
      paymentIntentId = intent.id;
      if (usingPostgres) await db.attachPaymentIntentPg(pool, orderId, paymentIntentId);
      else memoryCheckout.attachPaymentIntent(memory, orderId, paymentIntentId);
    }
    const payment = usingPostgres ? await db.getOrderPaymentPg(pool, orderId) : memoryCheckout.getOrderPayment(memory, orderId);
    sendJson(res, 200, {
      payment: {
        orderId,
        clientSecret: intent.client_secret,
        publishableKey: stripeConfig.payments.publishableKey,
        amountMinorUnits: order.totalMinorUnits,
        currency: order.currency || 'eur',
        expiresAt: payment.paymentExpiresAt,
        livemode: stripeConfig.payments.livemode,
      },
    });
  } catch (err) {
    if (err instanceof stripeLib.StripeError) {
      console.error('stripe payment start failed', err.code, err.httpStatus, err.stripeCode);
      return sendJson(res, 502, { error: 'payment_provider_error' });
    }
    sendCheckoutError(res, err);
  }
}

/** POST /stripe/webhook — Stripe-signed events; the only way an Order becomes paid. */
async function handleStripeWebhook(req, res) {
  if (!stripeConfig.webhookSecret || !stripeClient) return sendJson(res, 503, { error: 'payments_not_configured' });
  const raw = await readRawBody(req, 262144);
  if (!raw) return sendJson(res, 413, { error: 'webhook_body_too_large' });
  let event;
  try {
    event = stripeLib.verifyWebhook(raw, req.headers['stripe-signature'], stripeConfig.webhookSecret);
  } catch (err) {
    return sendJson(res, 400, { error: err.code || 'webhook_invalid' });
  }
  const status = STRIPE_EVENT_STATUS[event.type];
  const intent = event.data && event.data.object;
  if (!status || !intent || intent.object !== 'payment_intent' || !(intent.metadata && intent.metadata.platform === 'zfashion')) {
    return sendJson(res, 200, { received: true, outcome: 'ignored' });
  }
  const orderId = intent.metadata.order_id;
  const input = {
    eventId: event.id,
    eventType: event.type,
    paymentIntentId: intent.id,
    orderId: /^[0-9a-f-]{36}$/i.test(orderId || '') || !usingPostgres ? orderId || null : null,
    status,
    amountReceivedMinorUnits: Number.isInteger(intent.amount_received) ? intent.amount_received : null,
  };
  const onRefund = (paymentIntentId, reason) => stripeClient.refundPaymentIntent(paymentIntentId, reason);
  try {
    const outcome = usingPostgres
      ? await db.recordStripePaymentEventPg(pool, input, { onRefund })
      : await memoryCheckout.recordStripePaymentEvent(memory, input, { onRefund });
    if (outcome === 'late_payment' || outcome === 'amount_mismatch' || outcome === 'unknown_payment_intent') {
      console.warn('stripe webhook', event.id, event.type, intent.id, outcome);
    }
    sendJson(res, 200, { received: true, outcome });
  } catch (err) {
    console.error('stripe webhook processing failed', event.id, event.type, err.code || err.message);
    sendJson(res, 500, { error: 'webhook_processing_failed' }); // Stripe retries
  }
}

/* ============================================================
   Store payouts (task 12): Stripe Connect Express accounts, weekly
   transfers of closed sales (payouts.js). Database mode only — the
   ledger lives in fashion.partner_payout_lines() / partner_transfers.
   ============================================================ */

function consoleUrl() {
  const raw = (process.env.FASHION_PARTNER_CONSOLE_URL || '').trim();
  try {
    const u = new URL(raw);
    if (u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) return u;
  } catch (e) { /* not set */ }
  return null;
}

function payoutsUnavailable(res) {
  if (!usingPostgres) { sendJson(res, 503, { error: 'payouts_require_database' }); return true; }
  if (!stripeClient) { sendJson(res, 503, { error: 'payments_not_configured' }); return true; }
  return false;
}

function accountView(account) {
  if (!account) return { connected: false, ready: false, detailsSubmitted: false, payoutsEnabled: false, requirementsDue: [] };
  return {
    connected: true,
    ready: account.transfersActive && account.payoutsEnabled,
    detailsSubmitted: account.detailsSubmitted,
    payoutsEnabled: account.payoutsEnabled,
    requirementsDue: account.requirementsDue,
  };
}

/** GET /partners/:id/payouts — account status, every paid ticket with its payout state, totals. */
async function handleGetPartnerPayouts(req, res, partnerId) {
  if (!(await authorizePartnerRequest(req, res, partnerId))) return;
  if (payoutsUnavailable(res)) return;
  try {
    let account = await db.getPayoutAccountPg(pool, partnerId);
    if (account) {
      try { account = await payoutsService.refreshAccount({ pool, db, stripe: stripeClient }, partnerId); } catch (err) { /* keep cached status */ }
    }
    const lines = payoutsService.withExpectedDates(await db.listPayoutLinesPg(pool, partnerId));
    sendJson(res, 200, { account: accountView(account), lines, totals: payoutsService.summarize(lines), payoutWeekday: 'monday' });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
}

/** POST /partners/:id/payouts/onboarding — Stripe-hosted page where the store gives its identity and bank account. */
async function handlePayoutOnboarding(req, res, partnerId) {
  if (!(await authorizePartnerRequest(req, res, partnerId))) return;
  if (payoutsUnavailable(res)) return;
  const base = consoleUrl();
  if (!base) return sendJson(res, 503, { error: 'payouts_not_configured' });
  try {
    let account = await db.getPayoutAccountPg(pool, partnerId);
    if (!account) {
      const application = await db.getPartnerApplicationPg(pool, partnerId);
      const partner = await db.getPartner(pool, partnerId);
      if (!partner) return sendJson(res, 404, { error: 'partner_not_found' });
      if (!['approved', 'active'].includes(partner.onboardingStatus)) return sendJson(res, 409, { error: 'store_not_approved' });
      const created = await stripeClient.createConnectedAccount({
        partnerId,
        country: (application && application.countryIso) || partner.countryIso || 'FR',
        email: application && application.contactEmail,
        businessName: application && application.tradeName,
      });
      account = await db.upsertPayoutAccountPg(pool, partnerId, payoutsService.accountStatus(created));
    }
    const back = (flag) => { const u = new URL(base.toString()); u.searchParams.set('payouts', flag); u.hash = 'payouts'; return u.toString(); };
    const link = await stripeClient.createAccountLink({ accountId: account.stripeAccountId, refreshUrl: back('refresh'), returnUrl: back('return') });
    sendJson(res, 200, { url: link.url });
  } catch (err) {
    if (err instanceof stripeLib.StripeError) {
      console.error('stripe connect onboarding failed', partnerId, err.code, err.httpStatus, err.stripeCode);
      return sendJson(res, 502, { error: 'payment_provider_error' });
    }
    sendJson(res, 400, { error: err.message });
  }
}

/** POST /partners/:id/payouts/dashboard — one-time link to the store's Stripe Express dashboard. */
async function handlePayoutDashboardLink(req, res, partnerId) {
  if (!(await authorizePartnerRequest(req, res, partnerId))) return;
  if (payoutsUnavailable(res)) return;
  try {
    const account = await db.getPayoutAccountPg(pool, partnerId);
    if (!account || !account.detailsSubmitted) return sendJson(res, 409, { error: 'payout_account_not_ready' });
    const link = await stripeClient.createLoginLink(account.stripeAccountId);
    sendJson(res, 200, { url: link.url });
  } catch (err) {
    if (err instanceof stripeLib.StripeError) return sendJson(res, 502, { error: 'payment_provider_error' });
    sendJson(res, 400, { error: err.message });
  }
}

/** GET /admin/payouts — every store's tickets and accounts. */
async function handleAdminListPayouts(req, res) {
  if (!(await authorizeAdminRequest(req, res))) return;
  if (payoutsUnavailable(res)) return;
  try {
    const lines = payoutsService.withExpectedDates(await db.listPayoutLinesPg(pool, null));
    const accounts = await db.listPayoutAccountsPg(pool);
    const names = await db.getStoreNamesPg(pool, [...new Set(lines.map((l) => l.partnerId).concat(accounts.map((a) => a.partnerId)))]);
    sendJson(res, 200, {
      lines: lines.map((l) => ({ ...l, storeName: names[l.partnerId] || null })),
      accounts: accounts.map((a) => ({ partnerId: a.partnerId, storeName: names[a.partnerId] || null, ...accountView(a) })),
      totals: payoutsService.summarize(lines),
    });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
}

async function runPayoutsAndRespond(res) {
  try {
    const result = await payoutsService.runPayouts({ pool, db, stripe: stripeClient });
    sendJson(res, 200, { result });
  } catch (err) {
    console.error('payouts run failed', err.message);
    sendJson(res, 500, { error: 'payouts_run_failed' });
  }
}

/** POST /admin/payouts/run — an admin starts the payout run by hand. */
async function handleAdminRunPayouts(req, res) {
  if (!(await authorizeAdminRequest(req, res))) return;
  if (payoutsUnavailable(res)) return;
  return runPayoutsAndRespond(res);
}

/** POST /internal/payouts/run — the weekly scheduler (Bearer FASHION_CRON_SECRET, 32+ characters). */
async function handleCronRunPayouts(req, res) {
  const secret = (process.env.FASHION_CRON_SECRET || '').trim();
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given); const b = Buffer.from(secret);
  if (secret.length < 32 || a.length !== b.length || !require('crypto').timingSafeEqual(a, b)) {
    return sendJson(res, 401, { error: 'unauthorized' });
  }
  if (payoutsUnavailable(res)) return;
  return runPayoutsAndRespond(res);
}

/**
 * GET /catalog/listing — the whole public storefront in one response:
 * every priced product of active stores (names, descriptions, brand,
 * size/format, price, stock label, photos, store, site sections) and
 * the stores' Corners. Newest first. The site filters and sorts
 * client-side. Never exposes stock quantities, only the label.
 */
async function handleGetCatalogListing(req, res) {
  try {
    let rows;
    if (usingPostgres) {
      rows = await db.listCatalogPg(pool);
    } else {
      const activeIds = await activePartnerIdSet();
      rows = [...memory.products.values()].reverse()
        .filter((p) => activeIds.has(p.partnerId))
        .map((p) => ({
          product: p,
          brandName: p.brandId && memory.brands.get(p.brandId) ? memory.brands.get(p.brandId).name : null,
          priceMinorUnits: priceHistory.currentPrice(memory.priceHistoryByProductId.get(p.id) || priceHistory.emptyHistory()),
          stock: memory.stockByProductId.get(p.id) || initStock(p.id),
        }))
        .filter((r) => r.priceMinorUnits !== null && r.priceMinorUnits !== undefined);
    }
    const ids = rows.map((r) => r.product.id);
    const images = await imagesByProductId(ids);
    const partnerIds = [...new Set(rows.map((r) => r.product.partnerId))];
    const configs = usingPostgres ? await db.listCornerConfigs(pool) : [...memory.cornerConfigs.values()];
    const activeIds = await activePartnerIdSet();
    const described = await describeLines([], [...new Set(partnerIds.concat(configs.map((c) => c.partnerId)))].filter((id) => activeIds.has(id)));

    const products = rows.map(({ product, brandName, priceMinorUnits, stock }) => ({
      id: product.id,
      partnerId: product.partnerId,
      storeName: described.storeNames[product.partnerId] || null,
      brandName,
      names: product.names,
      descriptions: product.descriptions || {},
      categories: product.categories,
      gender: product.gender,
      ageSegments: product.ageSegments,
      size: product.size || null,
      format: product.format || null,
      styleId: product.styleId || null,
      sections: storefrontSections(product),
      priceMinorUnits,
      availability: { label: stockAvailabilityLabel(stock), sellable: stockAvailabilityLabel(stock) !== 'out_of_stock' },
      images: (images[product.id] || []).map((i) => i.url),
      createdAt: product.createdAt || null,
    }));
    const counts = {};
    for (const p of products) counts[p.partnerId] = (counts[p.partnerId] || 0) + 1;
    const stores = configs.filter((c) => activeIds.has(c.partnerId)).map((c) => ({
      partnerId: c.partnerId, name: c.displayName, byline: c.byline || null, accentColor: c.accentColor || null,
      logoUrl: c.logoUrl || null, productCount: counts[c.partnerId] || 0,
    }));
    res.setHeader('Cache-Control', 'public, max-age=60');
    sendJson(res, 200, { products, stores, total: products.length });
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
    if (req.method === 'POST' && parts[0] === 'stripe' && parts[1] === 'webhook' && parts.length === 2) {
      return await handleStripeWebhook(req, res);
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
    if (req.method === 'GET' && parts[0] === 'admin' && parts[1] === 'partner-applications' && parts.length === 2) {
      return await handleAdminListApplications(req, res, url.searchParams);
    }
    if (req.method === 'GET' && parts[0] === 'admin' && parts[1] === 'partner-applications' && parts.length === 3) {
      return await handleAdminGetApplication(req, res, parts[2]);
    }
    if (req.method === 'POST' && parts[0] === 'admin' && parts[1] === 'partner-applications' && parts[3] === 'decision' && parts.length === 4) {
      return await handleAdminDecideApplication(req, res, parts[2]);
    }
    if (req.method === 'GET' && parts[0] === 'partners' && parts[2] === 'application' && parts.length === 3) {
      return await handleGetOwnApplication(req, res, parts[1]);
    }
    if (req.method === 'GET' && parts[0] === 'partners' && parts[2] === 'brands' && parts.length === 3) {
      return await handleListBrands(req, res, parts[1]);
    }
    if (req.method === 'GET' && parts[0] === 'partners' && parts[2] === 'inventory' && parts.length === 3) {
      return await handleGetInventory(req, res, parts[1]);
    }
    if (req.method === 'POST' && parts[0] === 'partners' && parts[2] === 'products' && parts[4] === 'images' && parts.length === 5) {
      return await handleUploadProductImage(req, res, parts[1], parts[3]);
    }
    if (req.method === 'POST' && parts[0] === 'partners' && parts[2] === 'products' && parts[4] === 'images' && parts[5] === 'order' && parts.length === 6) {
      return await handleReorderProductImages(req, res, parts[1], parts[3]);
    }
    if (req.method === 'DELETE' && parts[0] === 'partners' && parts[2] === 'products' && parts[4] === 'images' && parts.length === 6) {
      return await handleDeleteProductImage(req, res, parts[1], parts[3], parts[5]);
    }
    if (req.method === 'POST' && parts[0] === 'partners' && parts[2] === 'logo' && parts.length === 3) {
      return await handleUploadLogo(req, res, parts[1]);
    }
    if (req.method === 'GET' && parts[0] === 'media' && parts.length > 1 && !usingPostgres) {
      return handleMemoryMedia(req, res, parts.slice(1).join('/'));
    }
    if (req.method === 'POST' && parts[0] === 'partners' && parts[2] === 'products' && parts[4] === 'price' && parts.length === 5) {
      return await handleSetPrice(req, res, parts[1], parts[3]);
    }
    if (req.method === 'GET' && parts[0] === 'partners' && parts[2] === 'corner-config' && parts.length === 3) {
      return await handleGetOwnCornerConfig(req, res, parts[1]);
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
    if (req.method === 'GET' && parts[0] === 'catalog' && parts[1] === 'listing' && parts.length === 2) {
      return await handleGetCatalogListing(req, res);
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
    if (parts[0] === 'clients' && parts[2] === 'cart') {
      if (req.method === 'GET' && parts.length === 3) return await handleGetCart(req, res, parts[1]);
      if (req.method === 'PUT' && parts[3] === 'items' && parts.length === 5) return await handleSetCartItem(req, res, parts[1], parts[4]);
      if (req.method === 'DELETE' && parts[3] === 'items' && parts.length === 5) return await handleSetCartItem(req, res, parts[1], parts[4], 0);
    }
    if (req.method === 'POST' && parts[0] === 'clients' && parts[2] === 'checkout' && parts.length === 3) {
      return await handleCheckout(req, res, parts[1]);
    }
    if (parts[0] === 'clients' && parts[2] === 'orders') {
      if (req.method === 'GET' && parts.length === 3) return await handleListClientOrders(req, res, parts[1]);
      if (req.method === 'GET' && parts.length === 4) return await handleGetClientOrder(req, res, parts[1], parts[3]);
      if (req.method === 'POST' && parts.length === 5 && parts[4] === 'cancel') return await handleCancelClientOrder(req, res, parts[1], parts[3]);
      if (req.method === 'POST' && parts.length === 5 && parts[4] === 'payment') return await handleStartPayment(req, res, parts[1], parts[3]);
    }
    if (req.method === 'GET' && parts[0] === 'partners' && parts[2] === 'orders' && parts.length === 3) {
      return await handleListPartnerOrders(req, res, parts[1]);
    }
    if (parts[0] === 'partners' && parts[2] === 'payouts') {
      if (req.method === 'GET' && parts.length === 3) return await handleGetPartnerPayouts(req, res, parts[1]);
      if (req.method === 'POST' && parts.length === 4 && parts[3] === 'onboarding') return await handlePayoutOnboarding(req, res, parts[1]);
      if (req.method === 'POST' && parts.length === 4 && parts[3] === 'dashboard') return await handlePayoutDashboardLink(req, res, parts[1]);
    }
    if (parts[0] === 'admin' && parts[1] === 'payouts') {
      if (req.method === 'GET' && parts.length === 2) return await handleAdminListPayouts(req, res);
      if (req.method === 'POST' && parts.length === 3 && parts[2] === 'run') return await handleAdminRunPayouts(req, res);
    }
    if (req.method === 'POST' && parts[0] === 'internal' && parts[1] === 'payouts' && parts[2] === 'run' && parts.length === 3) {
      return await handleCronRunPayouts(req, res);
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
  if (usingPostgres && !mediaStorage) {
    console.warn('fashion-partner API: SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) not set — photo and logo uploads are refused (503).');
  }
  if (!stripeConfig.payments || !stripeConfig.webhookSecret) {
    console.warn('fashion-partner API: Stripe not configured (STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET) — payments are refused (503).');
  }
  if (usingPostgres && !authRequired) {
    console.warn('fashion-partner API: FASHION_ALLOW_UNAUTHENTICATED=1 — authentication is OFF. Never use this in production.');
  }
  server.listen(PORT, () => {
    console.log(`fashion-partner API listening on :${PORT} (usingPostgres=${usingPostgres})`);
  });
}

module.exports = { server };
