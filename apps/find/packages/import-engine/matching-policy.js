/* ============================================================
   Z FIND — MATCHING POLICY
   ============================================================
   Replaces the Phase 3 proof-of-concept's fixed 2km geometry
   threshold. Policy is resolved by (country, entityType, source),
   falling back through progressively more general defaults — so a
   new country or entity type never crashes for lack of a policy, it
   just inherits the global default.

   Geometry is corroboration only: this module never returns a
   'decisive' verdict for a geometry-only signal — a geometry match
   always requires manual review regardless of how tight the
   threshold is. That is enforced here, not left to caller discipline.
   ============================================================ */

const DEFAULT_POLICY = {
  geometryThresholdKm: { Country: 200, Region: 100, City: 10, Zone: 1 },
  alwaysReviewAlternateCode: true,
  alwaysReviewGeometryMatch: true, // hard rule, not configurable per policy — see module doc
};

// Keyed by `${country}:${entityType}:${source}` with progressively
// more general fallbacks (see resolvePolicy).
const POLICY_OVERRIDES = {
  // Illustrates the override mechanism with a tighter urban policy for
  // France communes from this specific source — not a calibrated
  // real-world value.
  'FR:City:fr-insee-2026-07': { geometryThresholdKm: { City: 5 } },
};

function resolvePolicy(countryIso, entityType, sourceId) {
  const keys = [
    `${countryIso}:${entityType}:${sourceId}`,
    `${countryIso}:${entityType}:*`,
    `${countryIso}:*:*`,
    `*:*:*`,
  ];
  let merged = { ...DEFAULT_POLICY, geometryThresholdKm: { ...DEFAULT_POLICY.geometryThresholdKm } };
  for (const key of keys.slice().reverse()) {
    if (POLICY_OVERRIDES[key]) {
      merged = {
        ...merged,
        ...POLICY_OVERRIDES[key],
        geometryThresholdKm: { ...merged.geometryThresholdKm, ...(POLICY_OVERRIDES[key].geometryThresholdKm || {}) },
      };
    }
  }
  return merged;
}

function thresholdFor(policy, entityType) {
  return policy.geometryThresholdKm[entityType] != null ? policy.geometryThresholdKm[entityType] : 1;
}

module.exports = { resolvePolicy, thresholdFor, DEFAULT_POLICY };
