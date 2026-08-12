/* ============================================================
   Z FIND — services/registry.js
   ============================================================
   Read-only Z Find port over the canonical ZOS Registry.

   Z Find UUIDs remain authoritative local identities.
   Shared Registry binding is optional.

   This adapter never:
   - creates a Registry binding;
   - assigns a canonical authority;
   - rewrites a local UUID;
   - performs automatic merge/link behaviour.
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

const REGISTRY_ENTITY_TYPES = Object.freeze([
  'organisation',
  'partner',
  'property',
  'development'
]);

function validationError(message) {
  return {
    data: null,
    error: {
      type: 'validation_error',
      context: 'registry.getRegistryBinding',
      message
    }
  };
}

async function getRegistryBinding(entityType, localId) {
  if (!REGISTRY_ENTITY_TYPES.includes(entityType)) {
    return validationError(
      `Unsupported registry entity type: ${entityType}`
    );
  }

  if (!localId || typeof localId !== 'string') {
    return validationError(
      'Registry binding lookup requires a non-empty local entity id.'
    );
  }

  const client = getSupabaseClient();

  return safeQuery(
    () => client.rpc(
      'zfind_get_registry_binding',
      {
        p_entity_type: entityType,
        p_local_id: localId
      }
    ),
    'registry.getRegistryBinding',
    { allowNullData: true }
  );
}

return {
  REGISTRY_ENTITY_TYPES,
  getRegistryBinding
};

});
