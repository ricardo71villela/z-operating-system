/* ============================================================
   Z FIND — services/observation.js
   ============================================================
   Admin adapter over canonical ZOS Data Observations.

   Z Find operational columns remain runtime projections.
   Canonical Observations preserve source, time and provenance.

   Factual payload is never rewritten after creation.
   Only lifecycle status / valid_to may evolve.

   Canonical provenance requirements are explicit:
   - sourceId;
   - provenanceMethod;
   - observedAt.

   The adapter never invents any of them.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./supabaseClient')
    );
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.observation = factory(
      root.ZFindServices.supabaseClient
    );
  }
})(typeof window !== 'undefined' ? window : this, function (supabaseClientModule) {

const { getSupabaseClient, safeQuery } = supabaseClientModule;

const OBSERVATION_ENTITY_TYPES = Object.freeze([
  'organisation',
  'partner',
  'property',
  'development',
  'listing'
]);

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
  if (!OBSERVATION_ENTITY_TYPES.includes(entityType)) {
    return validationError(
      context,
      `Unsupported observation entity type: ${entityType}`
    );
  }

  if (!entityId || typeof entityId !== 'string') {
    return validationError(
      context,
      'Observation requires a non-empty entity id.'
    );
  }

  return null;
}

async function listObservations(
  entityType,
  entityId,
  metricCode = null
) {
  const context = 'observation.listObservations';

  const targetError =
    validateTarget(entityType, entityId, context);

  if (targetError) return targetError;

  const client = getSupabaseClient();

  return safeQuery(
    () => client.rpc(
      'zfind_list_observations',
      {
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_metric_code: metricCode
      }
    ),
    context
  );
}

async function createObservation({
  entityType,
  entityId,
  metricCode,
  value,

  sourceId,
  provenanceMethod,
  observedAt,

  unit = null,
  currencyIso = null,
  locale = null,
  status = 'recorded',
  confidence = null,
  validFrom = null,
  validTo = null,
  provenance = {}
}) {
  const context = 'observation.createObservation';

  const targetError =
    validateTarget(entityType, entityId, context);

  if (targetError) return targetError;

  if (!metricCode || typeof metricCode !== 'string') {
    return validationError(
      context,
      'Observation requires metricCode.'
    );
  }

  if (value === undefined) {
    return validationError(
      context,
      'Observation requires a value.'
    );
  }

  if (!sourceId || typeof sourceId !== 'string') {
    return validationError(
      context,
      'Canonical Observation requires sourceId.'
    );
  }

  if (
    !provenanceMethod ||
    typeof provenanceMethod !== 'string'
  ) {
    return validationError(
      context,
      'Canonical Observation requires provenanceMethod.'
    );
  }

  if (!observedAt || typeof observedAt !== 'string') {
    return validationError(
      context,
      'Canonical Observation requires observedAt.'
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

  const client = getSupabaseClient();

  return safeQuery(
    () => client.rpc(
      'zfind_create_observation',
      {
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_metric_code: metricCode,
        p_value_jsonb: value,
        p_source_id: sourceId,
        p_provenance_method: provenanceMethod,
        p_observed_at: observedAt,
        p_unit: unit,
        p_currency_iso: currencyIso,
        p_locale: locale,
        p_status: status,
        p_confidence: confidence,
        p_valid_from: validFrom,
        p_valid_to: validTo,
        p_provenance: provenance || {}
      }
    ),
    context
  );
}

async function updateObservationLifecycle(
  observationId,
  { status, validTo } = {}
) {
  const context =
    'observation.updateObservationLifecycle';

  if (!observationId || typeof observationId !== 'string') {
    return validationError(
      context,
      'Observation lifecycle update requires an observation id.'
    );
  }

  if (
    status !== undefined &&
    !OBSERVATION_STATUSES.includes(status)
  ) {
    return validationError(
      context,
      `Invalid observation status: ${status}`
    );
  }

  const hasValidTo = validTo !== undefined;

  if (status === undefined && !hasValidTo) {
    return validationError(
      context,
      'Observation lifecycle update requires status and/or validTo.'
    );
  }

  const client = getSupabaseClient();

  return safeQuery(
    () => client.rpc(
      'zfind_update_observation_lifecycle',
      {
        p_observation_id: observationId,
        p_status:
          status === undefined
            ? null
            : status,
        p_set_valid_to: hasValidTo,
        p_valid_to:
          hasValidTo
            ? validTo
            : null
      }
    ),
    context
  );
}

async function listObservationEvidence(observationId) {
  const context =
    'observation.listObservationEvidence';

  if (!observationId || typeof observationId !== 'string') {
    return validationError(
      context,
      'Observation evidence requires an observation id.'
    );
  }

  const client = getSupabaseClient();

  return safeQuery(
    () => client.rpc(
      'zfind_list_observation_evidence',
      {
        p_observation_id: observationId
      }
    ),
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
  const context =
    'observation.addObservationEvidence';

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
    () => client.rpc(
      'zfind_add_observation_evidence',
      {
        p_observation_id: observationId,
        p_evidence_type: evidenceType,
        p_source_url: sourceUrl,
        p_storage_path: storagePath,
        p_content_hash: contentHash,
        p_metadata: metadata || {}
      }
    ),
    context
  );
}

return {
  OBSERVATION_ENTITY_TYPES,
  OBSERVATION_STATUSES,
  EVIDENCE_TYPES,
  listObservations,
  createObservation,
  updateObservationLifecycle,
  listObservationEvidence,
  addObservationEvidence
};

});
