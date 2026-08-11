/* ============================================================
   Z FIND — services/registry.js
   ============================================================
   Application/infrastructure adapter for the shared ZOS Registry bridge.

   Z Find entity UUIDs remain authoritative local identities.
   registry_bindings only exposes the optional relationship to a shared
   ZOS Registry identity.

   This service is read-only:
   - never creates a ZOS Registry entity;
   - never assigns zos_registry_id;
   - never rewrites a local entity UUID;
   - never performs automatic merge/link behaviour.

   Reads remain subject to registry_bindings RLS policies.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./supabaseClient')
    );
  } else {
    root.ZFindServices = root.ZFindServices || {};
    root.ZFindServices.registry = factory(
      root.ZFindServices.supabaseClient
    );
  }
})(typeof window !== 'undefined' ? window : this, function (supabaseClientModule) {

const { getSupabaseClient, safeQuery } = supabaseClientModule;

const REGISTRY_TARGET_COLUMNS = Object.freeze({
  organisation: 'organisation_id',
  partner: 'partner_id',
  property: 'property_id',
  development: 'development_id'
});


/**
 * Returns the Registry Bridge row for one existing Z Find entity.
 *
 * entityType must use the ZOS/Z Find Registry vocabulary:
 * organisation | partner | property | development
 *
 * localId remains the existing Z Find UUID.
 */
async function getRegistryBinding(entityType, localId) {
  const targetColumn = REGISTRY_TARGET_COLUMNS[entityType];

  if (!targetColumn) {
    return {
      data: null,
      error: {
        type: 'validation_error',
        context: 'registry.getRegistryBinding',
        message: `Unsupported registry entity type: ${entityType}`
      }
    };
  }

  if (!localId || typeof localId !== 'string') {
    return {
      data: null,
      error: {
        type: 'validation_error',
        context: 'registry.getRegistryBinding',
        message: 'Registry binding lookup requires a non-empty local entity id.'
      }
    };
  }

  const client = getSupabaseClient();

  return safeQuery(
    () => client
      .from('registry_bindings')
      .select(
        'id, entity_type, organisation_id, partner_id, property_id, development_id, ' +
        'zos_registry_id, binding_status, external_references, linked_at'
      )
      .eq('entity_type', entityType)
      .eq(targetColumn, localId)
      .single(),
    'registry.getRegistryBinding'
  );
}


return {
  REGISTRY_TARGET_COLUMNS,
  getRegistryBinding
};

});
