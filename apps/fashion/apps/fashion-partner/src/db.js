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

function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error('createPool: DATABASE_URL is required — no silent local fallback');
  }
  return new Pool({ connectionString });
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

module.exports = { createPool, insertPartner, updatePartnerStatus, getPartner };
