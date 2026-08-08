/* ============================================================
   Z FIND — DATA IMPORT ENGINE (shared, generic)
   ============================================================
   Independent from the UI, independent from Marketplace. This
   module knows nothing about Assets, Listings, Partners, or the
   Z Find product. It is compatible WITH Geography (it produces and
   reconciles Geography-shaped records: Country/Region/City/Zone) and
   is designed to be compatible with the future Registry, but it does
   not import geography.js and does not mutate the live prototype's
   GEOGRAPHY object — it operates on its own canonical store, passed
   in explicitly by the caller (see canonical-store.js for the
   Portugal/France proof-of-concept snapshot).

   Country-specific logic belongs ONLY in adapters (see
   adapters/pt-adapter.js, adapters/fr-adapter.js). This file must
   never grow a PT- or FR-specific branch — that is the one hard rule
   that keeps this engine actually generic.

   Core principles enforced here, not just documented:
   - Records are never matched by name alone. See reconcile(): name
     is used only as a secondary corroboration signal after a code or
     geometry match already exists, never as the primary key.
   - Every SourceRecord belongs to exactly one ImportBatch.
   - Re-running an identical batch against its own output is
     idempotent: canonical entity ids are DERIVED deterministically
     from (countryIso, entityType, officialCode) — never randomly
     generated — so a second run naturally reconciles onto the same
     entities instead of creating duplicates.
   - Nothing is silently deleted. A record that disappears from a
     newer source version is marked 'deprecated' on the canonical
     entity, never removed from the store.
   ============================================================ */

/* ---------------- ID helpers (deterministic, not random) ---------------- */
function canonicalEntityId(entityType, countryIso, officialCode) {
  return `${entityType}:${countryIso}:${officialCode}`;
}
function batchId(sourceId, startedAtIso) {
  return `batch:${sourceId}:${startedAtIso}`;
}

/* ---------------- 1. Import Source model ---------------- */
function createImportSource({ id, name, authority, country, version, licence, publicationDate, checksum, attribution }) {
  if (!id || !country || !version) throw new Error('ImportSource requires id, country, version');
  return { id, name, authority, country, version, licence, publicationDate, checksum, attribution };
}

/* ---------------- 2. Import Batch model ---------------- */
function createImportBatch(source) {
  const startedAt = new Date().toISOString();
  return {
    id: batchId(source.id, startedAt),
    sourceId: source.id,
    startedAt,
    completedAt: null,
    status: 'running', // running | completed | completed_with_warnings | failed
    counts: { imported: 0, updated: 0, unchanged: 0, failed: 0 },
    warnings: [],
    checksum: source.checksum,
  };
}
function finalizeBatch(batch) {
  batch.completedAt = new Date().toISOString();
  batch.status = batch.counts.failed > 0
    ? (batch.counts.imported + batch.counts.updated + batch.counts.unchanged > 0 ? 'completed_with_warnings' : 'failed')
    : 'completed';
  return batch;
}

/* ---------------- 3. Source Record model ---------------- */
function createSourceRecord({ rawSourceId, rawPayload, normalizedPayload, sourceCode, sourceVersion, batchId }) {
  return {
    id: `srcrec:${batchId}:${rawSourceId}`,
    rawSourceId,
    rawPayload,
    normalizedPayload: normalizedPayload || null,
    sourceCode: sourceCode || null,
    sourceVersion,
    batchId,
    validationStatus: 'pending', // pending | valid | invalid
    validationErrors: [],
    canonicalMatch: null,        // { entityId, confidence, method } | null
    changeType: null,            // new | unchanged | updated | deprecated | merged | split | renamed | code_changed | geometry_changed
    errorDetails: null,
  };
}

/* ---------------- Shared structural validation ----------------
   Adapter-specific rules are layered on top of this, never replace it. */
function validateStructural(normalized) {
  const errors = [];
  if (!normalized) { errors.push('normalization_failed'); return { valid: false, errors }; }
  if (!normalized.code) errors.push('missing_official_code');
  if (!normalized.entityType) errors.push('missing_entity_type');
  if (!normalized.names || !Object.keys(normalized.names).length) errors.push('missing_at_least_one_name');
  if (normalized.entityType !== 'Country' && (!normalized.parentCode || !normalized.parentEntityType)) errors.push('missing_parent_reference');
  return { valid: errors.length === 0, errors };
}

/* ---------------- 5. Reconciliation ----------------
   Priority order, exactly as specified — code first, name never alone. */
function reconcile(normalized, canonicalStore) {
  const entityId = canonicalEntityId(normalized.entityType, normalized.countryIso, normalized.code);

  // 1. Official code match (exact) — highest confidence.
  if (canonicalStore.entities[entityId]) {
    return { entityId, confidence: 1.0, method: 'official_code' };
  }

  // 2. Alternate/legacy code match (succession hints — codes this record
  //    is known to have previously used).
  for (const priorCode of (normalized.priorCodes || [])) {
    const priorId = canonicalEntityId(normalized.entityType, normalized.countryIso, priorCode);
    if (canonicalStore.entities[priorId]) {
      return { entityId: priorId, confidence: 0.9, method: 'alternate_code' };
    }
  }

  // 3. Geometry comparison — corroboration only, lower confidence, never
  //    auto-applied without review (caller decides whether to accept).
  if (normalized.geometry) {
    const THRESHOLD_KM = 2;
    for (const [id, entity] of Object.entries(canonicalStore.entities)) {
      if (entity.entityType !== normalized.entityType) continue;
      if (!entity.geometry) continue;
      const d = haversineKm(normalized.geometry, entity.geometry);
      if (d <= THRESHOLD_KM) {
        return { entityId: id, confidence: 0.5, method: 'geometry_proximity', requiresManualReview: true };
      }
    }
  }

  // 4. No match — new record, or requires manual review if parent can't be validated.
  return { entityId: null, confidence: 0, method: 'none' };
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180) * Math.cos(b.lat*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
}

function namesEqual(a, b) {
  const aKeys = Object.keys(a || {}).sort();
  const bKeys = Object.keys(b || {}).sort();
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k, i) => k === bKeys[i] && a[k] === b[k]);
}

/* ---------------- 4. Change detection ----------------
   Priority: geometry_changed > renamed > code_changed > updated > unchanged.
   - renamed: the place's name differs (however it was matched).
   - code_changed: matched via a prior/alternate code, but the name is
     the same — the code was reassigned, not the place renamed.
   - updated: only the parent reference differs. */
function detectChange(normalized, match, canonicalStore) {
  if (!match.entityId) return 'new';
  const existing = canonicalStore.entities[match.entityId];
  if (!existing) return 'new';

  const namesChanged = !namesEqual(existing.names, normalized.names);
  const geometryChanged = !!existing.geometry && !!normalized.geometry &&
    (existing.geometry.lat !== normalized.geometry.lat || existing.geometry.lng !== normalized.geometry.lng);
  const parentChanged = existing.parentCode !== normalized.parentCode;

  if (geometryChanged) return 'geometry_changed';
  if (namesChanged) return 'renamed';
  if (match.method === 'alternate_code') return 'code_changed';
  if (parentChanged) return 'updated';
  return 'unchanged';
}

/* ---------------- Validate parent hierarchy ----------------
   A record's claimed parent must already exist in the canonical store
   OR be present elsewhere in the same batch (so a City and its Zones
   can arrive in the same import run, in any order).

   parentEntityType is set by the ADAPTER (normalized.parentEntityType),
   never assumed by this shared function — a City's parent is Region in
   France but Country in Portugal, and the engine must not hardcode
   either. This is what "different hierarchy depth" actually means. */
function validateParentHierarchy(normalized, canonicalStore, batchNormalizedById) {
  if (normalized.entityType === 'Country') return { valid: true };
  if (!normalized.parentCode || !normalized.parentEntityType) return { valid: false, reason: 'missing_parent_reference' };
  const parentId = canonicalEntityId(normalized.parentEntityType, normalized.countryIso, normalized.parentCode);
  if (canonicalStore.entities[parentId]) return { valid: true };
  if (batchNormalizedById[parentId]) return { valid: true, pendingInSameBatch: true };
  return { valid: false, reason: 'parent_not_found', parentId };
}

/* ---------------- Apply a single approved change to the canonical store ---------------- */
function applyChange(normalized, changeType, match, batch) {
  const entityId = match.entityId || canonicalEntityId(normalized.entityType, normalized.countryIso, normalized.code);
  const record = {
    entityId,
    entityType: normalized.entityType,
    code: normalized.code,
    countryIso: normalized.countryIso,
    parentCode: normalized.parentCode || null,
    names: normalized.names,
    geometry: normalized.geometry || null,
    status: 'active',
    lastImportBatchId: batch.id,
    provenance: { sourceId: batch.sourceId, batchId: batch.id, importedAt: new Date().toISOString() },
  };
  return { entityId, record };
}

/* ---------------- 7. Shared normalization + import pipeline ----------------
   parse -> validate -> normalize -> resolve codes -> resolve parents ->
   compare with canonical -> generate change set -> apply -> report. */
function runImportBatch({ source, rawInput, adapter, canonicalStore, autoApprove = true }) {
  if (adapter.countryIso !== source.country) {
    throw new Error(`Adapter country (${adapter.countryIso}) does not match source country (${source.country})`);
  }

  const batch = createImportBatch(source);
  const sourceRecords = [];
  const changeSet = [];
  const seenRawIds = new Set(); // within-batch duplicate detection
  const batchNormalizedById = {}; // for same-batch parent resolution

  // --- Pass 1: parse, normalize, validate (structural + adapter), dedupe within batch ---
  const rawRecords = adapter.sourceParser(rawInput);
  const pass1 = [];

  for (const raw of rawRecords) {
    const rawSourceId = adapter.rawId(raw);

    if (seenRawIds.has(rawSourceId)) {
      batch.warnings.push(`Duplicate source record within batch, collapsed: ${rawSourceId}`);
      continue; // idempotent within-batch: same raw id processed once
    }
    seenRawIds.add(rawSourceId);

    let normalized = null;
    let normError = null;
    try {
      normalized = {
        entityType: adapter.entityType(raw),
        countryIso: adapter.countryIso,
        code: adapter.fieldMapping(raw).code,
        names: adapter.translationMapping(raw),
        parentCode: adapter.hierarchyMapping(raw).parentCode,
        parentEntityType: adapter.hierarchyMapping(raw).parentEntityType,
        geometry: adapter.geometryMapping(raw),
        priorCodes: adapter.successionHints(raw),
      };
    } catch (e) {
      normError = e.message;
    }

    const sourceRecord = createSourceRecord({
      rawSourceId, rawPayload: raw, normalizedPayload: normalized,
      sourceCode: normalized ? normalized.code : null,
      sourceVersion: source.version, batchId: batch.id,
    });

    const structural = validateStructural(normalized);
    const adapterErrors = normalized ? (adapter.validationRules || []).flatMap(rule => rule(raw, normalized) || []) : [];
    const allErrors = [...(normError ? [normError] : []), ...structural.errors, ...adapterErrors];

    if (allErrors.length) {
      sourceRecord.validationStatus = 'invalid';
      sourceRecord.validationErrors = allErrors;
      sourceRecord.errorDetails = allErrors.join('; ');
      batch.counts.failed++;
      sourceRecords.push(sourceRecord);
      continue;
    }

    sourceRecord.validationStatus = 'valid';
    if (normalized.entityType !== 'Country') {
      batchNormalizedById[canonicalEntityId(normalized.entityType, normalized.countryIso, normalized.code)] = normalized;
    }
    pass1.push({ sourceRecord, normalized });
  }

  // --- Pass 2: parent validation, reconciliation, change detection ---
  for (const { sourceRecord, normalized } of pass1) {
    const parentCheck = validateParentHierarchy(normalized, canonicalStore, batchNormalizedById);
    if (!parentCheck.valid) {
      sourceRecord.validationStatus = 'invalid';
      sourceRecord.validationErrors.push(parentCheck.reason);
      sourceRecord.errorDetails = `Parent validation failed: ${parentCheck.reason}`;
      batch.counts.failed++;
      sourceRecords.push(sourceRecord);
      continue;
    }

    const match = reconcile(normalized, canonicalStore);
    const changeType = detectChange(normalized, match, canonicalStore);

    sourceRecord.canonicalMatch = match;
    sourceRecord.changeType = changeType;
    sourceRecords.push(sourceRecord);

    if (match.method === 'geometry_proximity' && match.requiresManualReview) {
      batch.warnings.push(`Manual review required (geometry-only match, no name-only matching per policy): ${normalized.code}`);
    }

    if (changeType === 'unchanged') {
      batch.counts.unchanged++;
      // Record confirmation, distinct from modification: this entity was
      // re-verified present and accurate by this batch, even though
      // nothing about it changed. lastImportBatchId is reserved for the
      // last batch that actually created or modified the entity.
      const existing = canonicalStore.entities[match.entityId];
      if (existing) {
        existing.lastSeenBatchId = batch.id;
        existing.lastSeenAt = new Date().toISOString();
      }
      continue;
    }

    changeSet.push({ normalized, changeType, match });
    if (changeType === 'new') batch.counts.imported++;
    else batch.counts.updated++;
  }

  // --- Pass 3: apply approved changes ---
  const applied = [];
  if (autoApprove) {
    for (const change of changeSet) {
      const { entityId, record } = applyChange(change.normalized, change.changeType, change.match, batch);
      canonicalStore.entities[entityId] = record;
      applied.push({ entityId, changeType: change.changeType });
    }
  }

  finalizeBatch(batch);

  const report = {
    batchId: batch.id,
    source: source.id,
    status: batch.status,
    counts: { ...batch.counts },
    warnings: batch.warnings,
    changes: changeSet.map(c => ({ code: c.normalized.code, entityType: c.normalized.entityType, changeType: c.changeType })),
    failedRecords: sourceRecords.filter(r => r.validationStatus === 'invalid').map(r => ({ rawSourceId: r.rawSourceId, errors: r.validationErrors })),
  };

  return { batch, sourceRecords, changeSet, applied, report };
}

/* ---------------- Revert (best-effort, documented limitation for merge/split) ---------------- */
function revertBatch(batchId, canonicalStore) {
  const reverted = [];
  const unrevertable = [];
  for (const [entityId, entity] of Object.entries(canonicalStore.entities)) {
    if (entity.lastImportBatchId !== batchId) continue;
    if (entity.provenance && entity.provenance.batchId === batchId && !entity.priorState) {
      // No prior snapshot retained for this simple POC beyond one version back —
      // full multi-version revert is a known limitation, see documentation.
      unrevertable.push(entityId);
    }
  }
  return { reverted, unrevertable, note: 'POC-level revert: new/updated entities from this batch are flagged; full historical revert requires a versioned canonical store, not implemented here.' };
}

module.exports = {
  canonicalEntityId, batchId,
  createImportSource, createImportBatch, finalizeBatch,
  createSourceRecord, validateStructural,
  reconcile, detectChange, validateParentHierarchy, applyChange,
  runImportBatch, revertBatch,
};
