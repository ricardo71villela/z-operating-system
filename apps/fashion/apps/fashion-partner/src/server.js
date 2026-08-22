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
const db = require('./db');

const usingPostgres = !!process.env.DATABASE_URL;
const pool = usingPostgres ? db.createPool() : null;

// In-memory fallback store — only reachable when usingPostgres is false.
const memory = {
  partners: new Map(), applications: new Map(), stockByProductId: new Map(),
  brands: new Map(), products: new Map(),
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

async function handleStockUpdate(req, res, productId) {
  const body = await readBody(req);
  // Stock does not yet have a Postgres-backed path (Phase 1's stock.js
  // reservation model isn't migrated to SQL yet) — stays in-memory in both
  // modes for now, tracked as a follow-up rather than silently pretended.
  const current = memory.stockByProductId.get(productId) || initStock(productId);
  try {
    const updated = applyStockUpdate(current, body);
    memory.stockByProductId.set(productId, updated);
    sendJson(res, 200, { stock: updated, sellable: sellableQuantity(updated) });
  } catch (err) {
    sendJson(res, 422, { error: err.message });
  }
}

function handleGetStock(req, res, productId) {
  const stock = memory.stockByProductId.get(productId) || initStock(productId);
  sendJson(res, 200, { stock, sellable: sellableQuantity(stock) });
}

async function handleCreateBrand(req, res, partnerId) {
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
      return sendJson(res, 201, { product: row });
    }

    const product = createProduct({ ...body, id: require('crypto').randomUUID(), partnerId });
    memory.products.set(product.id, product);
    sendJson(res, 201, { product });
  } catch (err) {
    sendJson(res, 422, { error: err.message });
  }
}

async function handleListProducts(req, res, partnerId) {
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


const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean);

  try {
    if (req.method === 'GET' && parts[0] === 'health') {
      return sendJson(res, 200, { ok: true, usingPostgres });
    }
    if (req.method === 'POST' && parts[0] === 'partners' && parts.length === 1) {
      return await handleApplyPartner(req, res);
    }
    if (req.method === 'POST' && parts[0] === 'partners' && parts[2] === 'transition') {
      return await handleTransition(req, res, parts[1]);
    }
    if (req.method === 'POST' && parts[0] === 'stock' && parts.length === 2) {
      return await handleStockUpdate(req, res, parts[1]);
    }
    if (req.method === 'GET' && parts[0] === 'stock' && parts.length === 2) {
      return handleGetStock(req, res, parts[1]);
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
    sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    sendJson(res, 400, { error: 'invalid request: ' + err.message });
  }
});

const PORT = process.env.PORT || 4001;

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`fashion-partner API listening on :${PORT} (usingPostgres=${usingPostgres})`);
  });
}

module.exports = { server };
