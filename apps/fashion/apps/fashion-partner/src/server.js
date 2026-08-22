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
const db = require('./db');

const usingPostgres = !!process.env.DATABASE_URL;
const pool = usingPostgres ? db.createPool() : null;

// In-memory fallback store — only reachable when usingPostgres is false.
const memory = {
  partners: new Map(), applications: new Map(), stockByProductId: new Map(),
  brands: new Map(), products: new Map(), shipments: new Map(), returns: new Map(),
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
  try {
    if (usingPostgres) {
      const updated = await db.applyStockUpdatePg(pool, productId, body.quantityAvailable, body.observedAt);
      return sendJson(res, 200, { stock: updated, sellable: sellableQuantity(updated) });
    }

    const current = memory.stockByProductId.get(productId) || initStock(productId);
    const updated = applyStockUpdate(current, body);
    memory.stockByProductId.set(productId, updated);
    sendJson(res, 200, { stock: updated, sellable: sellableQuantity(updated) });
  } catch (err) {
    sendJson(res, 422, { error: err.message });
  }
}

async function handleGetStock(req, res, productId) {
  try {
    if (usingPostgres) {
      const stock = await db.getStockPg(pool, productId);
      return sendJson(res, 200, { stock, sellable: sellableQuantity(stock) });
    }

    const stock = memory.stockByProductId.get(productId) || initStock(productId);
    sendJson(res, 200, { stock, sellable: sellableQuantity(stock) });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
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
        const updated = await db.applyStockUpdatePg(pool, update.productId, update.quantityAvailable, update.observedAt);
        results.push({ productId: update.productId, ok: true, stock: updated, sellable: sellableQuantity(updated) });
      } catch (err) {
        results.push({ productId: update.productId, ok: false, error: err.message });
      }
    }
  } else {
    results = body.updates.map((update) => {
      try {
        const current = memory.stockByProductId.get(update.productId) || initStock(update.productId);
        const updated = applyStockUpdate(current, update);
        memory.stockByProductId.set(update.productId, updated);
        return { productId: update.productId, ok: true, stock: updated, sellable: sellableQuantity(updated) };
      } catch (err) {
        // A stale/invalid item never aborts the batch — per-item failure,
        // exactly matching STOCK-FEED-CONTRACT.md's "rejected, not
        // silently overwritten" rule applied one item at a time.
        return { productId: update.productId, ok: false, error: err.message };
      }
    });
  }

  const okCount = results.filter((r) => r.ok).length;
  sendJson(res, 200, { results, summary: { total: results.length, ok: okCount, failed: results.length - okCount } });
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


async function handleCreateShipment(req, res) {
  const body = await readBody(req);
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
    if (req.method === 'POST' && parts[0] === 'partners' && parts[2] === 'stock' && parts[3] === 'bulk') {
      return await handleBulkStockUpdate(req, res, parts[1]);
    }
    if (req.method === 'POST' && parts[0] === 'stock' && parts.length === 2) {
      return await handleStockUpdate(req, res, parts[1]);
    }
    if (req.method === 'GET' && parts[0] === 'stock' && parts.length === 2) {
      return await handleGetStock(req, res, parts[1]);
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
  server.listen(PORT, () => {
    console.log(`fashion-partner API listening on :${PORT} (usingPostgres=${usingPostgres})`);
  });
}

module.exports = { server };
