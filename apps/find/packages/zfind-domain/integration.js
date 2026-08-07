'use strict';

/**
 * Technical integration message envelope. This is transport metadata, not a
 * universal semantic ZOS Event model.
 */
function createIntegrationMessage({ messageType, subjectType = null, subjectId = null, payload = {}, schemaVersion = 1, correlationId = null, causationId = null, occurredAt = new Date().toISOString() }) {
  if (!messageType || typeof messageType !== 'string') throw new Error('Integration message requires messageType');
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) throw new Error('schemaVersion must be a positive integer');
  return {
    messageType,
    producer: 'zfind',
    subjectType,
    subjectId,
    payload: payload || {},
    schemaVersion,
    correlationId,
    causationId,
    occurredAt,
  };
}

module.exports = { createIntegrationMessage };
