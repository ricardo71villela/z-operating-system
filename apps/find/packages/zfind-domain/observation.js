'use strict';

const OBSERVATION_ENTITY_TYPES = Object.freeze(['property', 'development', 'listing', 'partner', 'organisation']);
const OBSERVATION_STATUSES = Object.freeze(['recorded', 'validated', 'superseded', 'archived']);

/**
 * Builds a domain observation. Existing property/listing columns remain the
 * operational projection; observations preserve source, time and provenance.
 */
function createObservation({
  entityType,
  entityId,
  metricCode,
  value,
  unit = null,
  currencyIso = null,
  locale = null,
  sourceId = null,
  observedAt = new Date().toISOString(),
  validFrom = null,
  validTo = null,
  confidence = null,
  status = 'recorded',
  provenance = {},
}) {
  if (!OBSERVATION_ENTITY_TYPES.includes(entityType)) throw new Error(`Unsupported observation entity type: ${entityType}`);
  if (!entityId) throw new Error('Observation requires entityId');
  if (!metricCode || typeof metricCode !== 'string') throw new Error('Observation requires metricCode');
  if (!OBSERVATION_STATUSES.includes(status)) throw new Error(`Invalid observation status: ${status}`);
  if (confidence !== null && (confidence < 0 || confidence > 1)) throw new Error('Observation confidence must be between 0 and 1');
  if (currencyIso !== null && !/^[A-Z]{3}$/.test(currencyIso)) throw new Error('currencyIso must be ISO-4217 format');

  return {
    entityType,
    entityId,
    metricCode,
    value,
    unit,
    currencyIso,
    locale,
    sourceId,
    observedAt,
    validFrom,
    validTo,
    confidence,
    status,
    provenance: provenance || {},
  };
}

module.exports = { OBSERVATION_ENTITY_TYPES, OBSERVATION_STATUSES, createObservation };
