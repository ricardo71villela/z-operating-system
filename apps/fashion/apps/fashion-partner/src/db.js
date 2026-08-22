/* ============================================================
   Z FASHION PARTNER — Postgres-backed repository
   ============================================================
   Real persistence against the `fashion` schema
   (infrastructure/supabase/migrations/
   20260821090000_z_fashion_database_foundation_v1.sql). Reads
   DATABASE_URL from the environment — this file was validated
   against a local Postgres mirror of that exact schema, never
   against the live shared Supabase project (this environment has
   no network route to Supabase; see ZOS-ALIGNMENT.md's Database
   validation note). Point DATABASE_URL at the real project and this
   code path is what actually runs against it — nothing here is
   Supabase-specific beyond standard Postgres, so no rewrite is
   needed to go from "validated locally" to "running for real."
   ============================================================ */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

/**
 * Production TLS, mirroring apps/jobs/apps/api/src/pgStore.ts exactly:
 * - local/CI Postgres is unaffected when FASHION_DB_SSL_MODE is unset
 * - hosted Supabase uses its published root CA with full certificate
 *   verification when FASHION_DB_SSL_MODE=verify-full
 * - DATABASE_URL must not itself contain sslmode when this is enabled,
 *   since node-postgres's connection-string SSL parsing can override `ssl`
 */
function resolveSsl() {
  const mode = (process.env.FASHION_DB_SSL_MODE || '').trim();
  if (!mode) return undefined;
  if (mode !== 'verify-full') {
    throw new Error(`invalid FASHION_DB_SSL_MODE: ${mode}`);
  }
  return {
    ca: fs.readFileSync(path.join(__dirname, '..', 'certs', 'supabase-root-2021-ca.crt'), 'utf8'),
    rejectUnauthorized: true,
  };
}

function resolveSchemaOptions() {
  const schema = (process.env.FASHION_DB_SCHEMA || '').trim();
  if (!schema) return {};
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) {
    throw new Error(`invalid FASHION_DB_SCHEMA: ${schema}`);
  }
  return { options: `-c search_path=${schema}` };
}

function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error('createPool: DATABASE_URL is required — no silent local fallback');
  }
  const ssl = resolveSsl();
  return new Pool({
    connectionString,
    ...resolveSchemaOptions(),
    ...(ssl ? { ssl } : {}),
  });
}

/** Inserts a Partner row. Assumes the caller already ran createPartner()
 *  (partner.js) validation — this function trusts its input shape. */
async function insertPartner(pool, partner) {
  const result = await pool.query(
    `insert into fashion.partners
       (legal_name, country_iso, locales, categories, age_segments, minor_safe_data_acknowledged)
     values ($1, $2, $3, $4::fashion.category[], $5::fashion.age_segment[], $6)
     returning id, legal_name, country_iso, locales, categories, age_segments,
               minor_safe_data_acknowledged, onboarding_status, feed_reliability_tier`,
    [
      partner.legalName,
      partner.countryIso,
      partner.locales,
      partner.categories,
      partner.ageSegments,
      partner.minorSafeDataAcknowledged,
    ]
  );
  return toDomainShape(result.rows[0]);
}

/** Applies an onboarding transition directly as a database update — the
 *  CHECK constraints (fashion_partners_minor_safe_gate,
 *  fashion_partners_active_requires_feed_tier) are the actual enforcement,
 *  not application code re-checking the same rule a second time. */
async function updatePartnerStatus(pool, partnerId, { onboardingStatus, feedReliabilityTier }) {
  const result = await pool.query(
    `update fashion.partners
     set onboarding_status = $2,
         feed_reliability_tier = coalesce($3, feed_reliability_tier),
         updated_at = now()
     where id = $1
     returning id, legal_name, country_iso, locales, categories, age_segments,
               minor_safe_data_acknowledged, onboarding_status, feed_reliability_tier`,
    [partnerId, onboardingStatus, feedReliabilityTier || null]
  );
  if (result.rows.length === 0) {
    throw new Error(`updatePartnerStatus: no partner with id ${partnerId}`);
  }
  return toDomainShape(result.rows[0]);
}

async function getPartner(pool, partnerId) {
  const result = await pool.query(
    `select id, legal_name, country_iso, locales, categories, age_segments,
            minor_safe_data_acknowledged, onboarding_status, feed_reliability_tier
     from fashion.partners where id = $1`,
    [partnerId]
  );
  return result.rows[0] ? toDomainShape(result.rows[0]) : null;
}

function toDomainShape(row) {
  return {
    id: row.id,
    legalName: row.legal_name,
    countryIso: row.country_iso,
    locales: row.locales,
    categories: row.categories,
    ageSegments: row.age_segments,
    minorSafeDataAcknowledged: row.minor_safe_data_acknowledged,
    onboardingStatus: row.onboarding_status,
    feedReliabilityTier: row.feed_reliability_tier,
  };
}

/** Inserts a Brand row — typically a Partner's own house label
 *  (houseLabelOfPartnerId set), but Brand is never a Partner itself
 *  (brand.js's own distinction) — a Product always references a
 *  Brand, and a Brand references a Partner only optionally. */
async function insertBrand(pool, brand) {
  const result = await pool.query(
    `insert into fashion.brands (name, house_label_of_partner_id)
     values ($1, $2)
     returning id, name, house_label_of_partner_id`,
    [brand.name, brand.houseLabelOfPartnerId || null]
  );
  const row = result.rows[0];
  return { id: row.id, name: row.name, houseLabelOfPartnerId: row.house_label_of_partner_id };
}

/** Inserts a Product row. Assumes the caller already ran createProduct()
 *  (product.js) validation — this function trusts its input shape, the
 *  same discipline insertPartner() already follows for Partner. gender
 *  and style_id were added by later migrations (20260821190000,
 *  20260821220000) — both included here since this function is written
 *  against the schema as it stands today, not the original foundation
 *  migration alone. */
async function insertProduct(pool, product) {
  const result = await pool.query(
    `insert into fashion.products
       (partner_id, brand_id, names, descriptions, categories, technical_purpose,
        gender, age_segments, safety_certifications, size, format, corner_exclusive, style_id)
     values ($1, $2, $3::jsonb, $4::jsonb, $5::fashion.category[], $6,
             $7::fashion.gender, $8::fashion.age_segment[], $9, $10::jsonb, $11::jsonb, $12, $13)
     returning id, partner_id, brand_id, names, descriptions, categories, technical_purpose,
               gender, age_segments, safety_certifications, size, format, corner_exclusive, style_id`,
    [
      product.partnerId,
      product.brandId,
      JSON.stringify(product.names),
      JSON.stringify(product.descriptions || {}),
      product.categories,
      product.technicalPurpose,
      product.gender,
      product.ageSegments,
      product.safetyCertifications || [],
      product.size ? JSON.stringify(product.size) : null,
      product.format ? JSON.stringify(product.format) : null,
      product.cornerExclusive || false,
      product.styleId || null,
    ]
  );
  return toProductDomainShape(result.rows[0]);
}

/** Lists every Product belonging to one Partner — the Partner-facing
 *  catalog view (never scoped by Market/All Sale rules, which are a
 *  Client-facing concern owned by market.js/corner.js, not this
 *  Partner-owned listing). */
async function listProductsForPartner(pool, partnerId) {
  const result = await pool.query(
    `select id, partner_id, brand_id, names, descriptions, categories, technical_purpose,
            gender, age_segments, safety_certifications, size, format, corner_exclusive, style_id
     from fashion.products where partner_id = $1
     order by created_at desc`,
    [partnerId]
  );
  return result.rows.map(toProductDomainShape);
}

async function getProduct(pool, productId) {
  const result = await pool.query(
    `select id, partner_id, brand_id, names, descriptions, categories, technical_purpose,
            gender, age_segments, safety_certifications, size, format, corner_exclusive, style_id
     from fashion.products where id = $1`,
    [productId]
  );
  return result.rows[0] ? toProductDomainShape(result.rows[0]) : null;
}

function toProductDomainShape(row) {
  return {
    id: row.id,
    partnerId: row.partner_id,
    brandId: row.brand_id,
    names: row.names,
    descriptions: row.descriptions,
    categories: row.categories,
    technicalPurpose: row.technical_purpose,
    gender: row.gender,
    ageSegments: row.age_segments,
    safetyCertifications: row.safety_certifications,
    size: row.size,
    format: row.format,
    cornerExclusive: row.corner_exclusive,
    styleId: row.style_id,
  };
}

/** Creates a Shipment with its line items in one transaction. In real
 *  deployment a Shipment is created by the checkout process (one per
 *  Partner in a multi-Partner Order, mirroring partnerSplits() in
 *  cart.js) — exposed here directly since no checkout API exists yet
 *  (a separate, larger piece of work; see ZOS-ALIGNMENT.md), not
 *  because a Partner is meant to create their own Shipments in
 *  production. */
async function insertShipment(pool, { orderId, partnerId, productIds }) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const shipRes = await client.query(
      `insert into fashion.shipments (order_id, partner_id) values ($1, $2)
       returning id, order_id, partner_id, status, delivered_at`,
      [orderId, partnerId]
    );
    const shipment = shipRes.rows[0];
    for (const productId of productIds) {
      await client.query(
        `insert into fashion.shipment_items (shipment_id, product_id) values ($1, $2)`,
        [shipment.id, productId]
      );
    }
    await client.query('commit');
    return toShipmentDomainShape(shipment, productIds);
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

/** Lists every Shipment for one Partner, each with its Product line
 *  items — the Partner-facing "what do I need to fulfill" view. */
async function listShipmentsForPartner(pool, partnerId) {
  const shipRes = await pool.query(
    `select id, order_id, partner_id, status, delivered_at, created_at
     from fashion.shipments where partner_id = $1 order by created_at desc`,
    [partnerId]
  );
  const shipments = shipRes.rows;
  if (shipments.length === 0) return [];

  const itemsRes = await pool.query(
    `select shipment_id, product_id from fashion.shipment_items where shipment_id = any($1::uuid[])`,
    [shipments.map((s) => s.id)]
  );
  const itemsByShipment = {};
  for (const row of itemsRes.rows) {
    (itemsByShipment[row.shipment_id] = itemsByShipment[row.shipment_id] || []).push(row.product_id);
  }
  return shipments.map((s) => toShipmentDomainShape(s, itemsByShipment[s.id] || []));
}

/** Updates a Shipment's status directly — fashion.shipments' own
 *  trg_fashion_shipments_transition trigger is what actually enforces
 *  the transition graph (and sets delivered_at automatically on
 *  'delivered'), the same "DB is the second, independent enforcement"
 *  discipline as everywhere else in this schema; this function does
 *  not re-validate the transition itself. */
async function updateShipmentStatus(pool, shipmentId, toStatus) {
  const result = await pool.query(
    `update fashion.shipments set status = $2 where id = $1
     returning id, order_id, partner_id, status, delivered_at`,
    [shipmentId, toStatus]
  );
  if (result.rows.length === 0) {
    throw new Error(`updateShipmentStatus: no shipment with id ${shipmentId}`);
  }
  const itemsRes = await pool.query(
    `select product_id from fashion.shipment_items where shipment_id = $1`,
    [shipmentId]
  );
  return toShipmentDomainShape(result.rows[0], itemsRes.rows.map((r) => r.product_id));
}

function toShipmentDomainShape(row, productIds) {
  return {
    id: row.id,
    orderId: row.order_id,
    partnerId: row.partner_id,
    productIds,
    status: row.status,
    deliveredAt: row.delivered_at,
  };
}

/** Creates a Return request. In real deployment this is Client-triggered
 *  (from an Order/Shipment detail view, not built yet) — exposed here
 *  directly for the same reason insertShipment() is: no Client-facing
 *  Order API exists yet. fashion.returns' own
 *  trg_fashion_returns_eligibility trigger enforces the 14-day window
 *  and the Cosmetics seal exception — this function does not
 *  re-validate either, same dual-enforcement discipline. */
async function insertReturn(pool, { orderId, partnerId, productId, reason, sealBroken }) {
  const result = await pool.query(
    `insert into fashion.returns (order_id, partner_id, product_id, reason, seal_broken)
     values ($1, $2, $3, $4, $5)
     returning id, order_id, partner_id, product_id, status, reason, seal_broken, created_at`,
    [orderId, partnerId, productId, reason || null, !!sealBroken]
  );
  return toReturnDomainShape(result.rows[0]);
}

/** Lists every Return request for one Partner — the "what do I need to
 *  review" view (pending 'requested' status shown first by the caller,
 *  not this query — sorting for UI purposes is a presentation
 *  decision, this just returns everything newest-first). */
async function listReturnsForPartner(pool, partnerId) {
  const result = await pool.query(
    `select id, order_id, partner_id, product_id, status, reason, seal_broken, created_at
     from fashion.returns where partner_id = $1 order by created_at desc`,
    [partnerId]
  );
  return result.rows.map(toReturnDomainShape);
}

/** Updates a Return's status — trg_fashion_returns_transition enforces
 *  the transition graph, same discipline as updateShipmentStatus(). */
async function updateReturnStatus(pool, returnId, toStatus) {
  const result = await pool.query(
    `update fashion.returns set status = $2 where id = $1
     returning id, order_id, partner_id, product_id, status, reason, seal_broken, created_at`,
    [returnId, toStatus]
  );
  if (result.rows.length === 0) {
    throw new Error(`updateReturnStatus: no return with id ${returnId}`);
  }
  return toReturnDomainShape(result.rows[0]);
}

function toReturnDomainShape(row) {
  return {
    id: row.id,
    orderId: row.order_id,
    partnerId: row.partner_id,
    productId: row.product_id,
    status: row.status,
    reason: row.reason,
    sealBroken: row.seal_broken,
  };
}

/** Applies a stock update via fashion.apply_stock_update() — the SQL
 *  function itself enforces the staleness rejection rule, mirroring
 *  applyStockUpdate() in stock.js; this wrapper does not re-validate
 *  it. */
async function applyStockUpdatePg(pool, productId, quantityAvailable, observedAt) {
  const result = await pool.query(
    `select * from fashion.apply_stock_update($1, $2, $3)`,
    [productId, quantityAvailable, observedAt]
  );
  return toStockDomainShape(result.rows[0]);
}

async function getStockPg(pool, productId) {
  const result = await pool.query(`select * from fashion.stock where product_id = $1`, [productId]);
  if (result.rows.length === 0) {
    return { productId, quantityAvailable: 0, quantityReserved: 0, lastUpdatedAt: null };
  }
  return toStockDomainShape(result.rows[0]);
}

function toStockDomainShape(row) {
  return {
    productId: row.product_id,
    quantityAvailable: row.quantity_available,
    quantityReserved: row.quantity_reserved,
    lastUpdatedAt: row.last_updated_at,
  };
}

/** Records a price entry — mirrors recordPrice() in price-history.js.
 *  Append-only, same as the JS module: never updates an existing row,
 *  the 30-day reference calculation needs the full history. */
async function recordPricePg(pool, productId, priceMinorUnits, observedAt) {
  await pool.query(
    `insert into fashion.price_history (product_id, price_minor_units, observed_at)
     values ($1, $2, $3)`,
    [productId, priceMinorUnits, observedAt]
  );
}

/** Mirrors currentPrice() in price-history.js via fashion.current_price(). */
async function getCurrentPricePg(pool, productId) {
  const result = await pool.query(`select fashion.current_price($1) as price`, [productId]);
  return result.rows[0] ? result.rows[0].price : null;
}

async function getBrand(pool, brandId) {
  const result = await pool.query(`select id, name, house_label_of_partner_id from fashion.brands where id = $1`, [brandId]);
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return { id: row.id, name: row.name, houseLabelOfPartnerId: row.house_label_of_partner_id };
}

/** Lists every Product across every Partner — closes the gap
 *  PAYMENT-STRIPE-STATUS.md-style-flagged as "not built" in the
 *  catalog endpoint's own comment (2026-08-21): All Sale is a
 *  cross-Partner view by definition (corner.js's allSale()), so a
 *  Partner-scoped query alone can never serve it. Never filters by
 *  Market or any other scoping here — that stays market.js's
 *  productsVisibleInMarket()'s job, composed by the caller, same
 *  separation corner.js's allSaleInMarket() already establishes. */
async function listAllProducts(pool) {
  const result = await pool.query(
    `select id, partner_id, brand_id, names, descriptions, categories, technical_purpose,
            gender, age_segments, safety_certifications, size, format, corner_exclusive, style_id
     from fashion.products`
  );
  return result.rows.map(toProductDomainShape);
}

/** Fetches Stock for many Products in one query — avoids an N+1 query
 *  pattern now that callers (the Catalog endpoint) may need stock for
 *  the full cross-Partner catalog, not just one Partner's handful of
 *  Products. Products with no Stock row yet are simply absent from the
 *  returned map — the caller (catalog-listing.js's buildListingCards())
 *  already treats a missing entry as out_of_stock, never as "in stock
 *  by default". */
async function getStockForProductsPg(pool, productIds) {
  if (productIds.length === 0) return {};
  const result = await pool.query(`select * from fashion.stock where product_id = any($1::uuid[])`, [productIds]);
  const byId = {};
  for (const row of result.rows) {
    byId[row.product_id] = toStockDomainShape(row);
  }
  return byId;
}

module.exports = {
  createPool, insertPartner, updatePartnerStatus, getPartner,
  insertBrand, getBrand, insertProduct, listProductsForPartner, listAllProducts, getProduct,
  insertShipment, listShipmentsForPartner, updateShipmentStatus,
  insertReturn, listReturnsForPartner, updateReturnStatus,
  applyStockUpdatePg, getStockPg, getStockForProductsPg,
  recordPricePg, getCurrentPricePg,
};
