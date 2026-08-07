/* ============================================================
   Z FIND — DATA IMPORT ENGINE v2 (hardened orchestrator)
   ============================================================
   Country-specific logic still lives ONLY in adapters — this file
   remains free of any PT/FR-shaped branch, same discipline as v1.

   Flow:
     created -> parsing -> validating -> ready_for_review
       -> [external approveBatch()] -> approved -> applying
       -> completed | partially_completed | failed

   Reconciliation routing (the actual hardening):
     official_code match, changeType in {new, unchanged,
       geometry_changed, updated}  -> flows into the approved change
       set automatically once the BATCH is approved.
     official_code match, changeType 'renamed'                 -> ChangeProposal (requires its own approval)
     alternate_code match (any)                                -> ReviewItem (never auto-applied)
     geometry_proximity match (any)                             -> ReviewItem (never auto-applied)
     merge / split detected via priorCodes                      -> ChangeProposal, pulled out of normal flow entirely
   ============================================================ */

const { createBatchState, transition } = require('./batch-lifecycle');
const { createReviewItem, createChangeProposal, detectMergeSplit } = require('./review-workflow');
const { resolvePolicy, thresholdFor } = require('./matching-policy');
const { recordChange, getCurrent } = require('./canonical-store-v2');
const { createGeographyPort, createCommand, makeIdempotencyKey } = require('./geography-port');
const persistence = require('./persistence');

// Small pure helpers, self-contained (v2 must not depend on the v1 POC
// module at all, to keep the hardened engine independent of it).
function canonicalEntityId(entityType, countryIso, officialCode) {
  return `${entityType}:${countryIso}:${officialCode}`;
}
function validateStructural(normalized) {
  const errors = [];
  if (!normalized) { errors.push('normalization_failed'); return { valid: false, errors }; }
  if (!normalized.code) errors.push('missing_official_code');
  if (!normalized.entityType) errors.push('missing_entity_type');
  if (!normalized.names || !Object.keys(normalized.names).length) errors.push('missing_at_least_one_name');
  if (normalized.entityType !== 'Country' && (!normalized.parentCode || !normalized.parentEntityType)) errors.push('missing_parent_reference');
  return { valid: errors.length === 0, errors };
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

/* ---------------- Reconciliation, policy-driven ---------------- */
function reconcile(normalized, store, sourceId) {
  const entityId = canonicalEntityId(normalized.entityType, normalized.countryIso, normalized.code);
  if (getCurrent(store, entityId)) return { entityId, confidence: 1.0, method: 'official_code' };

  for (const priorCode of (normalized.priorCodes || [])) {
    const priorId = canonicalEntityId(normalized.entityType, normalized.countryIso, priorCode);
    if (getCurrent(store, priorId)) return { entityId: priorId, confidence: 0.9, method: 'alternate_code' };
  }

  if (normalized.geometry) {
    const policy = resolvePolicy(normalized.countryIso, normalized.entityType, sourceId);
    const thresholdKm = thresholdFor(policy, normalized.entityType);
    for (const [id, entity] of Object.entries(store.current)) {
      if (entity.entityType !== normalized.entityType || !entity.geometry || entity.status !== 'active') continue;
      const d = haversineKm(normalized.geometry, entity.geometry);
      if (d <= thresholdKm) return { entityId: id, confidence: 0.5, method: 'geometry_proximity', requiresManualReview: true };
    }
  }

  return { entityId: null, confidence: 0, method: 'none' };
}

function detectChange(normalized, match, store) {
  if (!match.entityId) return 'new';
  const existing = getCurrent(store, match.entityId);
  if (!existing) return 'new';
  const namesChanged = !namesEqual(existing.names, normalized.names);
  const geometryChanged = !!existing.geometry && !!normalized.geometry &&
    (existing.geometry.lat !== normalized.geometry.lat || existing.geometry.lng !== normalized.geometry.lng);
  const parentChanged = existing.parentCode !== normalized.parentCode;
  if (geometryChanged) return 'geometry_changed';
  if (namesChanged) return 'renamed';
  if (parentChanged) return 'updated';
  return 'unchanged';
}

/* ---------------- Stage 1: parse + normalize + validate ---------------- */
function parseAndValidate({ source, rawInput, adapter }) {
  const seenRawIds = new Set();
  const sourceRecords = [];
  const batchNormalizedById = {};
  const rawRecords = adapter.sourceParser(rawInput);
  const duplicateWarnings = [];

  for (const raw of rawRecords) {
    const rawSourceId = adapter.rawId(raw);
    if (seenRawIds.has(rawSourceId)) {
      duplicateWarnings.push(`Duplicate source record within batch, collapsed: ${rawSourceId}`);
      continue;
    }
    seenRawIds.add(rawSourceId);

    let normalized = null, normError = null;
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
    } catch (e) { normError = e.message; }

    const structural = validateStructural(normalized);
    const adapterErrors = normalized ? (adapter.validationRules || []).flatMap(rule => rule(raw, normalized) || []) : [];
    const allErrors = [...(normError ? [normError] : []), ...structural.errors, ...adapterErrors];

    const record = {
      rawSourceId, rawPayload: raw, normalizedPayload: normalized,
      sourceCode: normalized ? normalized.code : null,
      sourceVersion: source.version,
      validationStatus: allErrors.length ? 'invalid' : 'valid',
      validationErrors: allErrors,
    };
    sourceRecords.push(record);

    if (!allErrors.length && normalized.entityType !== 'Country') {
      batchNormalizedById[canonicalEntityId(normalized.entityType, normalized.countryIso, normalized.code)] = normalized;
    }
  }

  return { sourceRecords, batchNormalizedById, duplicateWarnings };
}

function validateParents(sourceRecords, store, batchNormalizedById) {
  for (const record of sourceRecords) {
    if (record.validationStatus === 'invalid') continue;
    const n = record.normalizedPayload;
    if (n.entityType === 'Country') continue;
    const parentId = canonicalEntityId(n.parentEntityType, n.countryIso, n.parentCode);
    const parentExists = !!getCurrent(store, parentId) || !!batchNormalizedById[parentId];
    if (!parentExists) {
      record.validationStatus = 'invalid';
      record.validationErrors.push('parent_not_found');
    }
  }
}

/* ---------------- Full pipeline (single call, POC-friendly) ---------------- */
function runPipeline({ source, rawInput, adapter, store, persistDir }) {
  const batchState = createBatchState(`batch:${source.id}:${new Date().toISOString()}:${Math.random().toString(36).slice(2,8)}`);
  const port = createGeographyPort(store);

  transition(batchState, 'parsing');
  const { sourceRecords, batchNormalizedById, duplicateWarnings } = parseAndValidate({ source, rawInput, adapter });

  transition(batchState, 'validating');
  validateParents(sourceRecords, store, batchNormalizedById);

  const validRecords = sourceRecords.filter(r => r.validationStatus === 'valid');
  const invalidRecords = sourceRecords.filter(r => r.validationStatus === 'invalid');

  const normalizedValid = validRecords.map(r => r.normalizedPayload);
  const { proposals: mergeSplitProposals, consumedCodes } = detectMergeSplit(normalizedValid, batchState.batchId, source.id);

  const reviewItems = [];
  const changeProposals = [...mergeSplitProposals];
  const approvedChangeSet = [];

  for (const record of validRecords) {
    const n = record.normalizedPayload;
    if (consumedCodes.has(n.code)) { record.changeType = 'pending_merge_split_proposal'; continue; }

    const match = reconcile(n, store, source.id);
    record.canonicalMatch = match;

    if (match.method === 'geometry_proximity') {
      reviewItems.push(createReviewItem({
        sourceRecord: record, reason: 'geometry_only_match_requires_review',
        candidateMatches: [match], confidence: match.confidence,
        canonicalCandidates: [getCurrent(store, match.entityId)],
        recommendedAction: 'confirm_or_reject_match',
      }));
      record.changeType = 'pending_review';
      continue;
    }
    if (match.method === 'alternate_code') {
      reviewItems.push(createReviewItem({
        sourceRecord: record, reason: 'alternate_code_match_requires_review',
        candidateMatches: [match], confidence: match.confidence,
        canonicalCandidates: [getCurrent(store, match.entityId)],
        recommendedAction: 'confirm_code_reassignment',
      }));
      record.changeType = 'pending_review';
      continue;
    }

    const changeType = detectChange(n, match, store);
    record.changeType = changeType;

    if (changeType === 'renamed') {
      changeProposals.push(createChangeProposal({
        type: 'renamed', predecessors: [n.code], successors: [n.code],
        batchId: batchState.batchId, provenance: { sourceId: source.id, batchId: batchState.batchId },
        detail: { entityId: match.entityId, before: getCurrent(store, match.entityId).names, after: n.names },
      }));
      continue;
    }

    const entityId = match.entityId || canonicalEntityId(n.entityType, n.countryIso, n.code);
    const cmdPayload = { entityId, entityType:n.entityType, code:n.code, countryIso:n.countryIso, parentCode:n.parentCode, parentEntityType:n.parentEntityType, names:n.names, geometry:n.geometry, batchId:batchState.batchId, provenance:{ sourceId: source.id, batchId: batchState.batchId } };

    let cmdType = null;
    if (changeType === 'new') cmdType = 'create_location';
    else if (changeType === 'geometry_changed') cmdType = 'update_coordinates';
    else if (changeType === 'updated') cmdType = 'change_parent';
    else if (changeType === 'unchanged') cmdType = 'confirm_unchanged_seen';

    if (cmdType) {
      approvedChangeSet.push(createCommand(cmdType, cmdPayload, makeIdempotencyKey(batchState.batchId, entityId, cmdType)));
    }
  }

  transition(batchState, 'ready_for_review');

  persistence.saveBatchCheckpoint(persistDir, batchState.batchId, {
    batchState, sourceRecords, reviewItems, changeProposals, approvedChangeSet,
    duplicateWarnings, sourceId: source.id,
  });

  return { batchState, sourceRecords, invalidRecords, reviewItems, changeProposals, approvedChangeSet, port, duplicateWarnings };
}

/* ---------------- Approval + apply stages ---------------- */
function approveBatch(batchState, reviewer) {
  transition(batchState, 'approved', { reviewer });
  return batchState;
}

function applyBatch(batchState, approvedChangeSet, port, persistDir) {
  transition(batchState, 'applying');
  const { accepted, rejected } = port.submitBatch(approvedChangeSet);
  const finalState = rejected.length === 0 ? 'completed' : (accepted.length > 0 ? 'partially_completed' : 'failed');
  transition(batchState, finalState);

  persistence.saveBatchCheckpoint(persistDir, batchState.batchId, { batchState, accepted, rejected, finalState });

  return { batchState, accepted, rejected };
}

/* ---------------- Missing record detection ----------------
   Compares the codes seen in THIS batch against the codes the store
   currently has as 'active' for the same source. A code that was
   active before and is absent from this batch is flagged as a
   candidate for deprecation — never auto-deprecated, since a source
   simply omitting a row is not proof the place stopped existing. */
function detectMissingRecords(store, sourceId, entityType, countryIso, currentBatchCodes) {
  const missing = [];
  for (const [entityId, entity] of Object.entries(store.current)) {
    if (entity.entityType !== entityType || entity.countryIso !== countryIso) continue;
    if (entity.status !== 'active') continue;
    if (entity.provenance && entity.provenance.sourceId && entity.provenance.sourceId !== sourceId) continue;
    if (!currentBatchCodes.has(entity.code)) missing.push({ entityId, code: entity.code });
  }
  return missing;
}

module.exports = {
  parseAndValidate, validateParents, reconcile, detectChange, namesEqual,
  runPipeline, approveBatch, applyBatch, canonicalEntityId,
  detectMissingRecords,
};
