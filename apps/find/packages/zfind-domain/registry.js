'use strict';

/**
 * Z Find registry boundary helpers (ZOS Architectural Constitution v1.1).
 *
 * These helpers do not create a second registry. They create stable references
 * to existing Z Find identities so the vertical can later bind them to a shared
 * ZOS Registry without changing local UUIDs.
 */
const { localRegistryIdentity } = require('@zos/registry-contracts');

const REGISTRY_ENTITY_TYPES = Object.freeze([
  'organisation',
  'partner',
  'property',
  'development',
]);

function registryRef(entityType, id) {
  if (!REGISTRY_ENTITY_TYPES.includes(entityType)) {
    throw new Error(`Unsupported registry entity type: ${entityType}`);
  }
  if (!id || typeof id !== 'string') throw new Error('Registry reference requires a non-empty id');

  const identity = localRegistryIdentity(id, entityType);
  return Object.freeze({ entityType: identity.entityType, id: identity.id });
}

function isRegistryRef(value) {
  return !!value && REGISTRY_ENTITY_TYPES.includes(value.entityType) && typeof value.id === 'string' && value.id.length > 0;
}

module.exports = { REGISTRY_ENTITY_TYPES, registryRef, isRegistryRef };
