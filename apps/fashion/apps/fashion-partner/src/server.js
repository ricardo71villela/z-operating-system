/* ============================================================
   Z FASHION PARTNER — API server
   ============================================================
   Minimal Node HTTP server (no framework) wiring real endpoints
   to fashion-domain. Deliberately plain: this proves the domain
   layer built across Phases 0-3 is actually reachable over HTTP,
   not a promise that this stays framework-free forever. In-memory
   store only — no database yet, this is a skeleton to prove wiring,
   not a production persistence layer.
   ============================================================ */

const http = require('http');
const { createPartner } = require('../../../packages/fashion-domain/src/partner');
const { createApplication, transition } = require('../../../packages/fashion-domain/src/onboarding');
const { initStock, applyStockUpdate, sellableQuantity } = require('../../../packages/fashion-domain/src/stock');

const partners = new Map();
const applications = new Map();
const stockByProductId = new Map();

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
    const partner = createPartner(body);
    partners.set(partner.id, partner);
    const application = createApplication(partner.id);
    applications.set(partner.id, application);
    sendJson(res, 201, { partner, application });
  } catch (err) {
    sendJson(res, 422, { error: err.message });
  }
}

async function handleTransition(req, res, partnerId) {
  const body = await readBody(req);
  const application = applications.get(partnerId);
  const partner = partners.get(partnerId);
  if (!application) return sendJson(res, 404, { error: `no application for partner ${partnerId}` });

  try {
    const updated = transition(application, body.toStatus, {
      partner,
      feedReliabilityTier: body.feedReliabilityTier,
    });
    applications.set(partnerId, updated);
    sendJson(res, 200, { application: updated });
  } catch (err) {
    sendJson(res, 422, { error: err.message });
  }
}

async function handleStockUpdate(req, res, productId) {
  const body = await readBody(req);
  const current = stockByProductId.get(productId) || initStock(productId);
  try {
    const updated = applyStockUpdate(current, body);
    stockByProductId.set(productId, updated);
    sendJson(res, 200, { stock: updated, sellable: sellableQuantity(updated) });
  } catch (err) {
    sendJson(res, 422, { error: err.message });
  }
}

function handleGetStock(req, res, productId) {
  const stock = stockByProductId.get(productId) || initStock(productId);
  sendJson(res, 200, { stock, sellable: sellableQuantity(stock) });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean);

  try {
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
    sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    sendJson(res, 400, { error: 'invalid request: ' + err.message });
  }
});

const PORT = process.env.PORT || 4001;

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`fashion-partner API listening on :${PORT}`);
  });
}

module.exports = { server };
