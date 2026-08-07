'use strict';
const fs = require('fs');
const path = require('path');

const required = [
  'packages/zfind-domain/registry.js',
  'packages/zfind-domain/states.js',
  'packages/zfind-domain/observation.js',
  'packages/zfind-domain/trust.js',
  'packages/zfind-domain/marketplace.js',
  'packages/zfind-domain/integration.js',
  'supabase/migrations/0008_zos_registry_bridge.sql',
  'supabase/migrations/0009_state_and_trust_history.sql',
  'supabase/migrations/0010_data_observations_and_provenance.sql',
  'supabase/migrations/0011_integration_outbox.sql',
  'supabase/migrations/0012_geography_registry_bridge.sql',
  'supabase/migrations/0013_identity_bridge.sql',
];
for (const rel of required) {
  if (!fs.existsSync(path.join(__dirname, '..', rel))) throw new Error(`Missing ZOS alignment artifact: ${rel}`);
}
console.log(`✅ ZOS v1.1 alignment artifacts present: ${required.length}`);
