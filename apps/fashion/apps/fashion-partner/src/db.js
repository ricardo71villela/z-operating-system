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

module.exports = {
  createPool, insertPartner, updatePartnerStatus, getPartner,
  insertBrand, insertProduct, listProductsForPartner, getProduct,
};
