/* ============================================================
   Z FIND — services/observation.js
   ============================================================
   Admin application adapter for Data Observations.

   Data Observations complement operational Property / Development /
   Listing projections with source, time, validity and provenance.

   Factual payload is immutable after creation.
   Only lifecycle fields may evolve:
   - status
   - valid_to

   Observation evidence is append-only.

   This service must never:
   - delete an observation;
   - rewrite factual observation payload;
   - update or delete existing evidence.

   Access remains subject to Migration 0010 RLS.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./supabaseClient'));
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.observation = factory(
      root.ZFindServices.supabaseClient
    );
  }
})(typeof window !== 'undefined' ? window : this, function (supabaseClientModule) {

const { getSupabaseClient, safeQuery } = supabaseClientModule;

const OBSERVATION_TARGET_COLUMNS = Object.freeze({
  organisation: 'organisation_id',
  partner: 'partner_id',
  property: 'property_id',
  development: 'development_id',
  listing: 'listing_id'
});

const OBSERVATION_STATUSES = Object.freeze([
  'recorded',
  'validated',
  'superseded',
  'archived'
]);

const EVIDENCE_TYPES = Object.freeze([
  'document',
  'url',
  'feed_record',
  'manual_declaration',
  'image',
  'other'
]);

const OBSERVATION_SELECT =
  'id, entity_type, organisation_id, partner_id, property_id, development_id, listing_id, ' +
  'metric_code, value_jsonb, unit, currency_iso, locale, source_id, status, confidence, ' +
  'observed_at, valid_from, valid_to, provenance, created_at';

const EVIDENCE_SELECT =
  'id, observation_id, evidence_type, source_url, storage_path, content_hash, metadata, created_at';


function validationError(context, message) {
  return {
    data: null,
    error: {
      type: 'validation_error',
      context,
      message
    }
  };
}


function validateTarget(entityType, entityId, context) {
  const targetColumn = OBSERVATION_TARGET_COLUMNS[entityType];

  if (!targetColumn) {
    return {
      targetColumn: null,
      result: validationError(
        context,
        `Unsupported observation entity type: ${entityType}`
      )
    };
  }

  if (!entityId || typeof entityId !== 'string') {
    return {
      targetColumn: null,
      result: validationError(
        context,
        'Observation requires a non-empty entity id.'
      )
    };
  }

  return { targetColumn, result: null };
}


async function listObservations(entityType, entityId, metricCode = null) {
  const context = 'observation.listObservations';
  const validation = validateTarget(entityType, entityId, context);

  if (validation.result) return validation.result;

  const client = getSupabaseClient();

  let query = client
    .from('data_observations')
    .select(OBSERVATION_SELECT)
    .eq('entity_type', entityType)
    .eq(validation.targetColumn, entityId);

  if (metricCode) {
    query = query.eq('metric_code', metricCode);
  }

  return safeQuery(
    () => query.order('observed_at', { ascending: false }),
    context
  );
}


async function createObservation({
  entityType,
  entityId,
  metricCode,
  value,
  unit = null,
  currencyIso = null,
  locale = null,
  sourceId = null,
  status = 'recorded',
  confidence = null,
  observedAt = null,
  validFrom = null,
  validTo = null,
  provenance = {}
}) {
  const context = 'observation.createObservation';
  const validation = validateTarget(entityType, entityId, context);

  if (validation.result) return validation.result;

  if (!metricCode || typeof metricCode !== 'string') {
    return validationError(
      context,
      'Observation requires metricCode.'
    );
  }

  if (!OBSERVATION_STATUSES.includes(status)) {
    return validationError(
      context,
      `Invalid observation status: ${status}`
    );
  }

  if (
    confidence !== null &&
    (
      typeof confidence !== 'number' ||
      confidence < 0 ||
      confidence > 1
    )
  ) {
    return validationError(
      context,
      'Observation confidence must be between 0 and 1.'
    );
  }

  if (
    currencyIso !== null &&
    (
      typeof currencyIso !== 'string' ||
      !/^[A-Z]{3}$/.test(currencyIso)
    )
  ) {
    return validationError(
      context,
      'currencyIso must be ISO-4217 format.'
    );
  }

  if (value === undefined) {
    return validationError(
      context,
      'Observation requires a value.'
    );
  }

  const row = {
    entity_type: entityType,
    metric_code: metricCode,

    // Explicit domain -> persistence boundary mapping.
    value_jsonb: value,

    unit,
    currency_iso: currencyIso,
    locale,
    source_id: sourceId,
    status,
    confidence,
    valid_from: validFrom,
    valid_to: validTo,
    provenance: provenance || {}
  };

  if (observedAt !== null) {
    row.observed_at = observedAt;
  }

  row[validation.targetColumn] = entityId;

  const client = getSupabaseClient();

  return safeQuery(
    () => client
      .from('data_observations')
      .insert(row)
      .select(OBSERVATION_SELECT)
      .single(),
    context
  );
}


async function updateObservationLifecycle(
  observationId,
  { status, validTo } = {}
) {
  const context = 'observation.updateObservationLifecycle';

  if (!observationId || typeof observationId !== 'string') {
    return validationError(
      context,
      'Observation lifecycle update requires an observation id.'
    );
  }

  const patch = {};

  if (status !== undefined) {
    if (!OBSERVATION_STATUSES.includes(status)) {
      return validationError(
        context,
        `Invalid observation status: ${status}`
      );
    }

    patch.status = status;
  }

  if (validTo !== undefined) {
    patch.valid_to = validTo;
  }

  if (!Object.keys(patch).length) {
    return validationError(
      context,
      'Observation lifecycle update requires status and/or validTo.'
    );
  }

  const client = getSupabaseClient();

  return safeQuery(
    () => client
      .from('data_observations')
      .update(patch)
      .eq('id', observationId)
      .select(OBSERVATION_SELECT)
      .single(),
    context
  );
}


async function listObservationEvidence(observationId) {
  const context = 'observation.listObservationEvidence';

  if (!observationId || typeof observationId !== 'string') {
    return validationError(
      context,
      'Observation evidence requires an observation id.'
    );
  }

  const client = getSupabaseClient();

  return safeQuery(
    () => client
      .from('observation_evidence')
      .select(EVIDENCE_SELECT)
      .eq('observation_id', observationId)
      .order('created_at', { ascending: false }),
    context
  );
}


async function addObservationEvidence({
  observationId,
  evidenceType,
  sourceUrl = null,
  storagePath = null,
  contentHash = null,
  metadata = {}
}) {
  const context = 'observation.addObservationEvidence';

  if (!observationId || typeof observationId !== 'string') {
    return validationError(
      context,
      'Observation evidence requires an observation id.'
    );
  }

  if (!EVIDENCE_TYPES.includes(evidenceType)) {
    return validationError(
      context,
      `Invalid observation evidence type: ${evidenceType}`
    );
  }

  const client = getSupabaseClient();

  return safeQuery(
    () => client
      .from('observation_evidence')
      .insert({
        observation_id: observationId,
        evidence_type: evidenceType,
        source_url: sourceUrl,
        storage_path: storagePath,
        content_hash: contentHash,
        metadata: metadata || {}
      })
      .select(EVIDENCE_SELECT)
      .single(),
    context
  );
}


return {
  OBSERVATION_TARGET_COLUMNS,
  OBSERVATION_STATUSES,
  EVIDENCE_TYPES,
  listObservations,
  createObservation,
  updateObservationLifecycle,
  listObservationEvidence,
  addObservationEvidence
};

});
