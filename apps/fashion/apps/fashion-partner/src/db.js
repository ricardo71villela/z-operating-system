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

/** Resolves which fashion.partners this authenticated Supabase user
 *  may manage, via the shared ZOS model: auth user -> zos.persons ->
 *  zos.memberships (active) -> zos.organisations -> zos.registry_bindings
 *  (domain_code='fashion', local_entity_type='partner') -> partner id.
 *  Wraps platform_internal.fashion_partner_ids_for_auth_user()
 *  (infrastructure/supabase/migrations/
 *  20260920120000_zos_fashion_partner_identity_bridge_v1.sql).
 *
 *  This is not optional application-level polish — this server's
 *  DATABASE_URL connection is privileged and goes straight to
 *  Postgres, bypassing PostgREST, so the RLS policy on
 *  fashion.partners never runs for it. Authorization for every
 *  partner-scoped endpoint depends on this function actually being
 *  called, not on any policy alone. */
async function resolveFashionPartnerIdsForAuthUser(pool, authUserId) {
  const result = await pool.query(
    `select partner_id from platform_internal.fashion_partner_ids_for_auth_user($1)`,
    [authUserId]
  );
  return result.rows.map((r) => r.partner_id);
}

/** node-postgres has no parser for custom enum array types
 *  (fashion.category[], fashion.age_segment[]) and returns them as the
 *  raw literal '{a,b}'. Enum labels never contain commas, quotes or
 *  braces, so a plain split is exact. */
function parsePgEnumArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return value;
  const inner = value.replace(/^\{|\}$/g, '');
  return inner === '' ? [] : inner.split(',');
}

function toDomainShape(row) {
  return {
    id: row.id,
    legalName: row.legal_name,
    countryIso: row.country_iso,
    locales: row.locales,
    categories: parsePgEnumArray(row.categories),
    ageSegments: parsePgEnumArray(row.age_segments),
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
        gender, age_segments, safety_certifications, size, format, corner_exclusive, style_id, partner_sku)
     values ($1, $2, $3::jsonb, $4::jsonb, $5::fashion.category[], $6,
             $7::fashion.gender, $8::fashion.age_segment[], $9, $10::jsonb, $11::jsonb, $12, $13, $14)
     returning id, partner_id, brand_id, names, descriptions, categories, technical_purpose,
               gender, age_segments, safety_certifications, size, format, corner_exclusive, style_id, partner_sku`,
    [
      product.partnerId,
      product.brandId,
      JSON.stringify(product.names),
      JSON.stringify(product.descriptions || {}),
      product.categories,
      !!product.technicalPurpose,
      product.gender,
      product.ageSegments && product.ageSegments.length ? product.ageSegments : ['adults'],
      product.safetyCertifications || [],
      product.size ? JSON.stringify(product.size) : null,
      product.format ? JSON.stringify(product.format) : null,
      product.cornerExclusive || false,
      product.styleId || null,
      product.sku || null,
    ]
  ).catch((err) => {
    if (err.code === '23505' && /partner_sku/.test(err.constraint || err.message || '')) {
      const taken = new Error(`sku_taken: reference "${product.sku}" is already used by another product of this store`);
      taken.code = 'sku_taken';
      throw taken;
    }
    throw err;
  });
  return toProductDomainShape(result.rows[0]);
}

/** Lists every Product belonging to one Partner — the Partner-facing
 *  catalog view (never scoped by Market/All Sale rules, which are a
 *  Client-facing concern owned by market.js/corner.js, not this
 *  Partner-owned listing). */
async function listProductsForPartner(pool, partnerId) {
  const result = await pool.query(
    `select id, partner_id, brand_id, names, descriptions, categories, technical_purpose,
            gender, age_segments, safety_certifications, size, format, corner_exclusive, style_id, partner_sku
     from fashion.products where partner_id = $1
     order by created_at desc`,
    [partnerId]
  );
  return result.rows.map(toProductDomainShape);
}

async function getProduct(pool, productId) {
  const result = await pool.query(
    `select id, partner_id, brand_id, names, descriptions, categories, technical_purpose,
            gender, age_segments, safety_certifications, size, format, corner_exclusive, style_id, partner_sku
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
    categories: parsePgEnumArray(row.categories),
    technicalPurpose: row.technical_purpose,
    gender: row.gender,
    ageSegments: parsePgEnumArray(row.age_segments),
    safetyCertifications: row.safety_certifications,
    size: row.size,
    format: row.format,
    cornerExclusive: row.corner_exclusive,
    styleId: row.style_id,
    sku: row.partner_sku || null,
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
            gender, age_segments, safety_certifications, size, format, corner_exclusive, style_id, partner_sku
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

/** Inserts or updates a Corner config for a Partner — one row per
 *  Partner (fashion.corner_configs.partner_id is the primary key),
 *  mirrors createCornerConfig() in corner-config.js exactly (the
 *  entire customizable surface, by that module's own design — no
 *  layout/markup column exists to add). */
async function upsertCornerConfig(pool, config) {
  const result = await pool.query(
    `insert into fashion.corner_configs (partner_id, display_name, byline, accent_color, logo_url)
     values ($1, $2, $3, $4, $5)
     on conflict (partner_id) do update
       set display_name = excluded.display_name,
           byline = excluded.byline,
           accent_color = excluded.accent_color,
           logo_url = excluded.logo_url,
           updated_at = now()
     returning partner_id, display_name, byline, accent_color, logo_url`,
    [config.partnerId, config.displayName, config.byline || null, config.accentColor || null, config.logoUrl]
  );
  return toCornerConfigDomainShape(result.rows[0]);
}

async function getCornerConfig(pool, partnerId) {
  const result = await pool.query(
    `select partner_id, display_name, byline, accent_color, logo_url from fashion.corner_configs where partner_id = $1`,
    [partnerId]
  );
  return result.rows[0] ? toCornerConfigDomainShape(result.rows[0]) : null;
}

/** Lists Corner configs for every Partner that has one — the public
 *  Corners directory's data source. A Partner without a configured
 *  Corner yet simply doesn't appear here (never fabricated from
 *  legalName as a fallback — see the /catalog/corners handler's own
 *  comment for why). */
async function listCornerConfigs(pool) {
  const result = await pool.query(
    `select partner_id, display_name, byline, accent_color, logo_url from fashion.corner_configs order by created_at desc`
  );
  return result.rows.map(toCornerConfigDomainShape);
}

function toCornerConfigDomainShape(row) {
  return {
    partnerId: row.partner_id,
    displayName: row.display_name,
    byline: row.byline,
    accentColor: row.accent_color,
    logoUrl: row.logo_url,
  };
}

/** Idempotent-add mirrors account.js's addWishlistItem() — the primary
 *  key on (client_user_id, product_id) makes a second insert of the
 *  same pair a structural no-op, not an error. */
async function addWishlistItemPg(pool, clientUserId, productId) {
  await pool.query(
    `insert into fashion.wishlist_items (client_user_id, product_id) values ($1, $2) on conflict do nothing`,
    [clientUserId, productId]
  );
}

async function removeWishlistItemPg(pool, clientUserId, productId) {
  await pool.query(`delete from fashion.wishlist_items where client_user_id = $1 and product_id = $2`, [clientUserId, productId]);
}

async function listWishlistForClientPg(pool, clientUserId) {
  const result = await pool.query(
    `select product_id, added_at from fashion.wishlist_items where client_user_id = $1 order by added_at desc`,
    [clientUserId]
  );
  return result.rows.map((r) => ({ productId: r.product_id, addedAt: r.added_at }));
}

async function followCornerPg(pool, clientUserId, partnerId) {
  await pool.query(
    `insert into fashion.corner_follows (client_user_id, partner_id) values ($1, $2) on conflict do nothing`,
    [clientUserId, partnerId]
  );
}

async function unfollowCornerPg(pool, clientUserId, partnerId) {
  await pool.query(`delete from fashion.corner_follows where client_user_id = $1 and partner_id = $2`, [clientUserId, partnerId]);
}

async function listFollowsForClientPg(pool, clientUserId) {
  const result = await pool.query(
    `select partner_id, followed_at from fashion.corner_follows where client_user_id = $1 order by followed_at desc`,
    [clientUserId]
  );
  return result.rows.map((r) => ({ partnerId: r.partner_id, followedAt: r.followed_at }));
}

/** Mirrors createAddress() in address.js — the DB's own CHECK
 *  constraints (non-empty line1/postalCode/city) and the
 *  fashion_client_addresses_single_default trigger are the second,
 *  independent enforcement, same discipline as everywhere else. */
async function insertClientAddressPg(pool, address) {
  const result = await pool.query(
    `insert into fashion.client_addresses (client_user_id, type, recipient_name, line1, line2, postal_code, city, country_iso, is_default)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning id, client_user_id, type, recipient_name, line1, line2, postal_code, city, country_iso, is_default`,
    [address.clientUserId, address.type, address.recipientName || null, address.line1, address.line2 || null, address.postalCode, address.city, address.countryIso, !!address.isDefault]
  );
  return toAddressDomainShape(result.rows[0]);
}

async function listClientAddressesPg(pool, clientUserId) {
  const result = await pool.query(
    `select id, client_user_id, type, recipient_name, line1, line2, postal_code, city, country_iso, is_default
     from fashion.client_addresses where client_user_id = $1 order by created_at desc`,
    [clientUserId]
  );
  return result.rows.map(toAddressDomainShape);
}

/** Mirrors setDefaultAddress() in address.js — the
 *  fashion_client_addresses_single_default trigger unsets every other
 *  Address of the same Client/type in the same statement, this
 *  function does not re-implement that exclusivity itself. */
async function setDefaultClientAddressPg(pool, clientUserId, addressId) {
  const result = await pool.query(
    `update fashion.client_addresses set is_default = true
     where id = $1 and client_user_id = $2
     returning id, client_user_id, type, recipient_name, line1, line2, postal_code, city, country_iso, is_default`,
    [addressId, clientUserId]
  );
  if (result.rows.length === 0) {
    throw new Error(`setDefaultClientAddressPg: no address ${addressId} for client ${clientUserId}`);
  }
  return toAddressDomainShape(result.rows[0]);
}

function toAddressDomainShape(row) {
  return {
    id: row.id,
    clientUserId: row.client_user_id,
    type: row.type,
    recipientName: row.recipient_name,
    line1: row.line1,
    line2: row.line2,
    postalCode: row.postal_code,
    city: row.city,
    countryIso: row.country_iso,
    isDefault: row.is_default,
  };
}

/** partner_id of a shipment, or null — used to authorize a shipment
 *  status change against the Partner that owns it. */
async function getShipmentPartnerId(pool, shipmentId) {
  const result = await pool.query(`select partner_id from fashion.shipments where id = $1`, [shipmentId]);
  return result.rows[0] ? result.rows[0].partner_id : null;
}

/** partner_id of a return, or null — same purpose as getShipmentPartnerId(). */
async function getReturnPartnerId(pool, returnId) {
  const result = await pool.query(`select partner_id from fashion.returns where id = $1`, [returnId]);
  return result.rows[0] ? result.rows[0].partner_id : null;
}

/** Verified e-mail of a Supabase auth user (privileged read). */
async function getAuthUserEmail(pool, authUserId) {
  const result = await pool.query(`select email from auth.users where id = $1`, [authUserId]);
  return result.rows[0] ? result.rows[0].email : null;
}

/** The Partner price list as configured in the database — the single
 *  source shown on the adhesion page and snapshotted with each
 *  application (migration 20261015000000_z_fashion_pricing_v2.sql). */
async function getPartnerOfferPg(pool) {
  const [subs, tickets] = await Promise.all([
    pool.query(`select min_category_count, monthly_fee_minor_units from fashion.subscription_fee_tiers order by min_category_count`),
    pool.query(`select max_ticket_minor_units, rate_percent from fashion.ticket_commission_tiers order by max_ticket_minor_units asc nulls last`),
  ]);
  return {
    subscriptionTiers: subs.rows.map((r) => ({ minCategories: r.min_category_count, monthlyFeeMinorUnits: r.monthly_fee_minor_units })),
    ticketCommissionTiers: tickets.rows.map((r) => ({
      maxTicketMinorUnits: r.max_ticket_minor_units === null ? null : Number(r.max_ticket_minor_units),
      ratePercent: r.rate_percent,
    })),
  };
}

/** Atomic store application — see migration
 *  20261014230000_z_fashion_partner_onboarding_v1.sql. Refusals raised
 *  by the function are rethrown with .code = 'fashion_application_pending'
 *  or 'fashion_application_duplicate'. */
async function submitPartnerApplicationPg(pool, authUserId, application, offerSnapshot) {
  try {
    const result = await pool.query(
      `select partner_id, organisation_id, application_id
       from platform_internal.fashion_submit_partner_application($1, $2::jsonb, $3::jsonb)`,
      [authUserId, JSON.stringify(application), JSON.stringify(offerSnapshot)]
    );
    const row = result.rows[0];
    return { partnerId: row.partner_id, organisationId: row.organisation_id, applicationId: row.application_id };
  } catch (err) {
    const match = /fashion_application_(pending|duplicate)/.exec(err.message || '');
    if (match) {
      const refusal = new Error(match[0]);
      refusal.code = match[0];
      throw refusal;
    }
    throw err;
  }
}

/** Partners shown in the public catalogue: onboarding_status 'active' only. */
async function listActivePartnerIds(pool) {
  const result = await pool.query(`select id from fashion.partners where onboarding_status = 'active'`);
  return result.rows.map((r) => r.id);
}

const APPLICATION_COLUMNS = `
  a.partner_id, a.trade_name, a.legal_name, a.country_iso, a.registration_number, a.vat_number,
  a.address_line1, a.postal_code, a.city, a.contact_email, a.contact_phone, a.website,
  a.terms_version, a.terms_accepted_at, a.offer_snapshot, a.review_note, a.reviewed_at, a.created_at,
  p.onboarding_status, p.categories, p.age_segments, p.minor_safe_data_acknowledged, p.feed_reliability_tier`;

function toApplicationShape(row) {
  return {
    partnerId: row.partner_id,
    tradeName: row.trade_name,
    legalName: row.legal_name,
    countryIso: row.country_iso,
    registrationNumber: row.registration_number,
    vatNumber: row.vat_number,
    addressLine1: row.address_line1,
    postalCode: row.postal_code,
    city: row.city,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    website: row.website,
    termsVersion: row.terms_version,
    termsAcceptedAt: row.terms_accepted_at,
    offerSnapshot: row.offer_snapshot,
    decisionNote: row.review_note,
    decidedAt: row.reviewed_at,
    createdAt: row.created_at,
    onboardingStatus: row.onboarding_status,
    categories: parsePgEnumArray(row.categories),
    ageSegments: parsePgEnumArray(row.age_segments),
    minorSafeDataAcknowledged: row.minor_safe_data_acknowledged,
    feedReliabilityTier: row.feed_reliability_tier,
  };
}

/** Back-office list: newest first, optionally one status; plus counts per status. */
async function listPartnerApplicationsPg(pool, { status = null, limit = 200 } = {}) {
  const [rows, counts] = await Promise.all([
    pool.query(
      `select ${APPLICATION_COLUMNS}
       from fashion.partner_applications a join fashion.partners p on p.id = a.partner_id
       where ($1::text is null or p.onboarding_status::text = $1)
       order by a.created_at desc
       limit $2`,
      [status, limit]
    ),
    pool.query(
      `select p.onboarding_status::text as status, count(*)::int as n
       from fashion.partner_applications a join fashion.partners p on p.id = a.partner_id
       group by 1`
    ),
  ]);
  return {
    applications: rows.rows.map(toApplicationShape),
    countsByStatus: Object.fromEntries(counts.rows.map((r) => [r.status, r.n])),
  };
}

async function getPartnerApplicationPg(pool, partnerId) {
  const result = await pool.query(
    `select ${APPLICATION_COLUMNS}
     from fashion.partner_applications a join fashion.partners p on p.id = a.partner_id
     where a.partner_id = $1`,
    [partnerId]
  );
  return result.rows[0] ? toApplicationShape(result.rows[0]) : null;
}

/** One back-office decision, one transaction: the store's status (the
 *  trigger enforces the transition graph and activation gates) and the
 *  decision note / time / reviewer on its application. */
async function decidePartnerApplicationPg(pool, partnerId, { toStatus, feedReliabilityTier, note, reviewerUserId }) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const updated = await client.query(
      `update fashion.partners
       set onboarding_status = $2,
           feed_reliability_tier = coalesce($3, feed_reliability_tier),
           updated_at = now()
       where id = $1
       returning id`,
      [partnerId, toStatus, feedReliabilityTier || null]
    );
    if (updated.rows.length === 0) {
      const err = new Error(`no partner with id ${partnerId}`);
      err.statusCode = 404;
      throw err;
    }
    await client.query(
      `update fashion.partner_applications
       set review_note = coalesce(nullif($2, ''), review_note),
           reviewed_at = now(),
           reviewed_by = $3
       where partner_id = $1`,
      [partnerId, (note || '').trim(), reviewerUserId || null]
    );
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
  return getPartnerApplicationPg(pool, partnerId);
}

/** Brands a store can pick when creating a product: the ones it created
 *  and any already used by its products. */
async function listBrandsForPartnerPg(pool, partnerId) {
  const result = await pool.query(
    `select distinct b.id, b.name, b.house_label_of_partner_id
     from fashion.brands b
     where b.house_label_of_partner_id = $1
        or b.id in (select brand_id from fashion.products where partner_id = $1)
     order by b.name`,
    [partnerId]
  );
  return result.rows.map((r) => ({ id: r.id, name: r.name, houseLabelOfPartnerId: r.house_label_of_partner_id }));
}

/** Current price for many products at once (latest observation each). */
async function getCurrentPricesPg(pool, productIds) {
  if (productIds.length === 0) return {};
  const result = await pool.query(
    `select distinct on (product_id) product_id, price_minor_units
     from fashion.price_history
     where product_id = any($1::uuid[])
     order by product_id, observed_at desc`,
    [productIds]
  );
  return Object.fromEntries(result.rows.map((r) => [r.product_id, Number(r.price_minor_units)]));
}

/* ---------- product photos (migration 20261015150000) ---------- */

function toImageShape(row) {
  return { id: row.id, productId: row.product_id, partnerId: row.partner_id, storagePath: row.storage_path,
    contentType: row.content_type, byteSize: row.byte_size, position: row.position, createdAt: row.created_at };
}

/** Photos of many products, each list ordered (cover first). */
async function listImagesForProductsPg(pool, productIds) {
  if (productIds.length === 0) return {};
  const result = await pool.query(
    `select * from fashion.product_images where product_id = any($1::uuid[]) order by product_id, position, created_at`,
    [productIds]
  );
  const byProduct = {};
  for (const row of result.rows) (byProduct[row.product_id] = byProduct[row.product_id] || []).push(toImageShape(row));
  return byProduct;
}

/** Appends a photo at the end. The trigger refuses a 9th photo
 *  (code 'image_limit') and a product of another store. */
async function insertProductImagePg(pool, { id, productId, partnerId, storagePath, contentType, byteSize }) {
  try {
    const result = await pool.query(
      `insert into fashion.product_images (id, product_id, partner_id, storage_path, content_type, byte_size, position)
       values ($1, $2, $3, $4, $5, $6,
               coalesce((select max(position) + 1 from fashion.product_images where product_id = $2), 0))
       returning *`,
      [id, productId, partnerId, storagePath, contentType, byteSize]
    );
    return toImageShape(result.rows[0]);
  } catch (err) {
    if (/product_image_limit/.test(err.message || '')) { const e = new Error('image_limit'); e.code = 'image_limit'; throw e; }
    throw err;
  }
}

/** Removes one photo of a product and closes the gap in positions.
 *  Returns the removed row (for deleting the file), or null. */
async function deleteProductImagePg(pool, productId, imageId) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const removed = await client.query(
      `delete from fashion.product_images where id = $1 and product_id = $2 returning *`, [imageId, productId]
    );
    if (removed.rows.length) {
      await client.query(
        `update fashion.product_images i set position = r.rn - 1
         from (select id, row_number() over (order by position, created_at) as rn from fashion.product_images where product_id = $1) r
         where i.id = r.id`,
        [productId]
      );
    }
    await client.query('commit');
    return removed.rows[0] ? toImageShape(removed.rows[0]) : null;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

/** Sets the order of a product's photos (ids already validated as a permutation). */
async function reorderProductImagesPg(pool, productId, orderedIds) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    for (let i = 0; i < orderedIds.length; i += 1) {
      await client.query(`update fashion.product_images set position = $3 where id = $1 and product_id = $2`, [orderedIds[i], productId, i]);
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

/* ---------- cart, checkout, orders (migration 20261016090000) ---------- */

const CHECKOUT_ERROR_KEYS = new Set([
  'insufficient_stock', 'product_unavailable', 'empty_cart', 'address_not_found',
  'shipping_country_not_served', 'payment_in_progress', 'invalid_quantity',
  'order_not_cancellable', 'order_not_found',
]);

/** Turns a keyed RAISE from the checkout functions into an Error with
 *  .code (the key), .productId (DETAIL when it is a product) and
 *  .sellable (HINT, for insufficient_stock). Other errors pass through. */
function checkoutError(err) {
  const key = err && typeof err.message === 'string' ? err.message.trim() : '';
  if (!CHECKOUT_ERROR_KEYS.has(key)) return err;
  const out = new Error(key);
  out.code = key;
  if (err.detail && /^[0-9a-f-]{36}$/i.test(err.detail)) out.productId = err.detail;
  else if (err.detail) out.detail = err.detail;
  if (key === 'insufficient_stock' && err.hint !== undefined) out.sellable = Number(err.hint);
  return out;
}

async function expirePendingOrdersPg(pool) {
  const result = await pool.query('select fashion.expire_pending_orders() as n');
  return Number(result.rows[0].n);
}

async function setCartItemPg(pool, clientUserId, productId, quantity) {
  try {
    await pool.query('select fashion.set_cart_item($1, $2, $3)', [clientUserId, productId, quantity]);
  } catch (err) {
    throw checkoutError(err);
  }
}

/** The Client's open Cart: lines and the unpaid Order of this Cart, if any. */
async function getOpenCartPg(pool, clientUserId) {
  const cart = await pool.query(
    `select id from fashion.carts where client_user_id = $1 and checked_out_at is null`,
    [clientUserId]
  );
  if (cart.rows.length === 0) return { cartId: null, items: [], pendingOrderId: null };
  const cartId = cart.rows[0].id;
  const items = await pool.query(
    `select product_id, partner_id, quantity from fashion.cart_items where cart_id = $1 order by created_at, id`,
    [cartId]
  );
  const pending = await pool.query(
    `select id from fashion.orders where cart_id = $1 and status = 'pending_payment' order by created_at desc limit 1`,
    [cartId]
  );
  return {
    cartId,
    items: items.rows.map((r) => ({ productId: r.product_id, partnerId: r.partner_id, quantity: r.quantity })),
    pendingOrderId: pending.rows[0] ? pending.rows[0].id : null,
  };
}

async function checkoutCartPg(pool, clientUserId, { addressId, allowedCountries, holdSeconds }) {
  try {
    const result = await pool.query(
      'select fashion.checkout_cart($1, $2, $3::text[], $4) as order_id',
      [clientUserId, addressId, allowedCountries, holdSeconds]
    );
    return result.rows[0].order_id;
  } catch (err) {
    if (err.code === '22P02') { // malformed uuid
      const e = new Error('address_not_found'); e.code = 'address_not_found'; throw e;
    }
    throw checkoutError(err);
  }
}

async function cancelUnpaidOrderPg(pool, orderId) {
  try {
    await pool.query('select fashion.cancel_unpaid_order($1)', [orderId]);
  } catch (err) {
    throw checkoutError(err);
  }
}

const ORDER_COLUMNS = `o.id, o.client_user_id, o.status, o.payment_status, o.currency, o.subtotal_minor_units,
  o.shipping_minor_units, o.total_minor_units, o.refunded_minor_units, o.shipping_address,
  o.payment_expires_at, o.created_at`;

function toOrderShape(row) {
  return {
    id: row.id,
    clientUserId: row.client_user_id,
    status: row.status,
    paymentStatus: row.payment_status,
    currency: row.currency,
    subtotalMinorUnits: row.subtotal_minor_units,
    shippingMinorUnits: row.shipping_minor_units,
    totalMinorUnits: row.total_minor_units,
    refundedMinorUnits: row.refunded_minor_units,
    shippingAddress: row.shipping_address,
    paymentExpiresAt: row.payment_expires_at ? new Date(row.payment_expires_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    items: [],
    tickets: [],
  };
}

/** Attaches items, tickets and shipments to orders (one query each). */
async function decorateOrdersPg(pool, orders, { partnerId = null } = {}) {
  if (orders.length === 0) return orders;
  const ids = orders.map((o) => o.id);
  const byId = new Map(orders.map((o) => [o.id, o]));
  const partnerFilter = partnerId ? 'and partner_id = $2' : '';
  const params = partnerId ? [ids, partnerId] : [ids];
  const items = await pool.query(
    `select order_id, product_id, partner_id, quantity, unit_price_minor_units, line_total_minor_units
     from fashion.order_items where order_id = any($1::uuid[]) ${partnerFilter} order by created_at, id`, params);
  for (const r of items.rows) byId.get(r.order_id).items.push({
    productId: r.product_id, partnerId: r.partner_id, quantity: r.quantity,
    unitPriceMinorUnits: r.unit_price_minor_units, lineTotalMinorUnits: r.line_total_minor_units,
  });
  const tickets = await pool.query(
    `select order_id, partner_id, subtotal_minor_units, item_count, commission_rate_percent, commission_minor_units
     from fashion.order_tickets where order_id = any($1::uuid[]) ${partnerFilter} order by partner_id`, params);
  for (const r of tickets.rows) byId.get(r.order_id).tickets.push({
    partnerId: r.partner_id, subtotalMinorUnits: r.subtotal_minor_units, itemCount: r.item_count,
    commissionRatePercent: r.commission_rate_percent, commissionMinorUnits: r.commission_minor_units,
  });
  const shipments = await pool.query(
    `select id, order_id, partner_id, status from fashion.shipments where order_id = any($1::uuid[]) ${partnerFilter}`, params);
  for (const o of orders) o.shipments = [];
  for (const r of shipments.rows) byId.get(r.order_id).shipments.push({ id: r.id, partnerId: r.partner_id, status: r.status });
  return orders;
}

async function getOrderPg(pool, orderId) {
  const result = await pool.query(`select ${ORDER_COLUMNS} from fashion.orders o where o.id = $1`, [orderId]);
  if (result.rows.length === 0) return null;
  const [order] = await decorateOrdersPg(pool, [toOrderShape(result.rows[0])]);
  return order;
}

async function listOrdersForClientPg(pool, clientUserId, { limit = 50 } = {}) {
  const result = await pool.query(
    `select ${ORDER_COLUMNS} from fashion.orders o where o.client_user_id = $1 order by o.created_at desc limit $2`,
    [clientUserId, limit]
  );
  return decorateOrdersPg(pool, result.rows.map(toOrderShape));
}

const SOLD_STATUSES = ['paid', 'fulfilling', 'fulfilled', 'partially_refunded', 'refunded'];

/** A store's sales: paid Orders that contain its products, with only
 *  its own lines, ticket and shipment. Unpaid Orders are not sales. */
async function listOrdersForPartnerPg(pool, partnerId, { limit = 100 } = {}) {
  const result = await pool.query(
    `select ${ORDER_COLUMNS} from fashion.orders o
     join fashion.order_tickets t on t.order_id = o.id and t.partner_id = $1
     where o.status = any($2::text[])
     order by o.created_at desc limit $3`,
    [partnerId, SOLD_STATUSES, limit]
  );
  return decorateOrdersPg(pool, result.rows.map(toOrderShape), { partnerId });
}

/** Sales and commission of one store since a date (paid Orders only). */
async function partnerSalesSincePg(pool, partnerId, since) {
  const result = await pool.query(
    `select coalesce(sum(t.subtotal_minor_units), 0)::bigint as gmv,
            coalesce(sum(t.commission_minor_units), 0)::bigint as commission,
            count(*)::int as tickets
     from fashion.order_tickets t join fashion.orders o on o.id = t.order_id
     where t.partner_id = $1 and o.status = any($2::text[]) and o.created_at >= $3`,
    [partnerId, SOLD_STATUSES, since]
  );
  const r = result.rows[0];
  return { gmvMinorUnits: Number(r.gmv), commissionMinorUnits: Number(r.commission), ticketCount: r.tickets };
}

async function getProductsByIdsPg(pool, productIds) {
  if (productIds.length === 0) return {};
  const result = await pool.query(
    `select id, partner_id, brand_id, names, descriptions, categories, technical_purpose,
            gender, age_segments, safety_certifications, size, format, corner_exclusive, style_id, partner_sku
     from fashion.products where id = any($1::uuid[])`,
    [productIds]
  );
  return Object.fromEntries(result.rows.map((r) => [r.id, toProductDomainShape(r)]));
}

async function getBrandsByIdsPg(pool, brandIds) {
  if (brandIds.length === 0) return {};
  const result = await pool.query(`select id, name from fashion.brands where id = any($1::uuid[])`, [brandIds]);
  return Object.fromEntries(result.rows.map((r) => [r.id, { id: r.id, name: r.name }]));
}

/** Display name per store: Corner name, else the trade name of the application, else the legal name. */
async function getStoreNamesPg(pool, partnerIds) {
  if (partnerIds.length === 0) return {};
  const result = await pool.query(
    `select p.id, coalesce(c.display_name, a.trade_name, p.legal_name) as name
     from fashion.partners p
     left join fashion.corner_configs c on c.partner_id = p.id
     left join fashion.partner_applications a on a.partner_id = p.id
     where p.id = any($1::uuid[])`,
    [partnerIds]
  );
  return Object.fromEntries(result.rows.map((r) => [r.id, r.name]));
}

module.exports = {
  createPool, insertPartner, updatePartnerStatus, getPartner,
  getAuthUserEmail, getPartnerOfferPg, submitPartnerApplicationPg,
  listBrandsForPartnerPg, getCurrentPricesPg,
  listImagesForProductsPg, insertProductImagePg, deleteProductImagePg, reorderProductImagesPg,
  listActivePartnerIds, listPartnerApplicationsPg, getPartnerApplicationPg, decidePartnerApplicationPg,
  resolveFashionPartnerIdsForAuthUser,
  insertBrand, getBrand, insertProduct, listProductsForPartner, listAllProducts, getProduct,
  insertShipment, listShipmentsForPartner, updateShipmentStatus, getShipmentPartnerId,
  insertReturn, listReturnsForPartner, updateReturnStatus, getReturnPartnerId,
  applyStockUpdatePg, getStockPg, getStockForProductsPg,
  recordPricePg, getCurrentPricePg,
  upsertCornerConfig, getCornerConfig, listCornerConfigs,
  addWishlistItemPg, removeWishlistItemPg, listWishlistForClientPg,
  followCornerPg, unfollowCornerPg, listFollowsForClientPg,
  insertClientAddressPg, listClientAddressesPg, setDefaultClientAddressPg,
  expirePendingOrdersPg, setCartItemPg, getOpenCartPg, checkoutCartPg, cancelUnpaidOrderPg,
  getOrderPg, listOrdersForClientPg, listOrdersForPartnerPg, partnerSalesSincePg, getStoreNamesPg,
  getProductsByIdsPg, getBrandsByIdsPg,
};
