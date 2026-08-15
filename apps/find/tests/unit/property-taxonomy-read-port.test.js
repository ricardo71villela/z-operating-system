'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../..');

const migrationPath = path.join(
  ROOT,
  'infrastructure',
  'supabase',
  'migrations',
  '20260815011000_z_find_property_taxonomy_read_port_v1.sql'
);

const servicePath = path.join(
  ROOT,
  'apps',
  'find',
  'apps',
  'zfind-web',
  'src',
  'services',
  'property-taxonomy.js'
);

const contractPath = path.join(
  ROOT,
  'apps',
  'find',
  'config',
  'phase4r-architecture-contract.json'
);

assert.ok(
  fs.existsSync(migrationPath),
  'R2.3A taxonomy read-port migration must exist'
);

assert.ok(
  fs.existsSync(servicePath),
  'Shared Property taxonomy service must exist'
);

const sql = fs.readFileSync(migrationPath, 'utf8');
const serviceSource = fs.readFileSync(servicePath, 'utf8');
const contract = JSON.parse(
  fs.readFileSync(contractPath, 'utf8')
);

function has(source, re, message) {
  assert.ok(re.test(source), message);
}

function lacks(source, re, message) {
  assert.ok(!re.test(source), message);
}


assert.deepStrictEqual(
  contract.propertyClasses,
  ['residential', 'commercial', 'land'],
  'R2.3A must consume the locked R1 Property classes'
);


has(
  sql,
  /create or replace function public\.zfind_authoring_property_taxonomy\(\)/i,
  'Canonical taxonomy read RPC must exist'
);

has(
  sql,
  /returns jsonb[\s\S]*?security definer[\s\S]*?set search_path = pg_catalog/i,
  'Taxonomy read RPC must be hardened SECURITY DEFINER'
);

has(
  sql,
  /from public\.property_classes pc/i,
  'Read port must consume Property class authority'
);

has(
  sql,
  /from public\.property_subtypes ps/i,
  'Read port must consume Property subtype authority'
);

has(
  sql,
  /'enabled', pc\.enabled/i,
  'Class enabled state must be projected'
);

has(
  sql,
  /'enabled', ps\.enabled/i,
  'Subtype enabled state must be projected'
);

has(
  sql,
  /p\.role in \('admin', 'partner_user'\)/i,
  'Read port must be limited to Admin/Partner profiles'
);

has(
  sql,
  /revoke all[\s\S]*?zfind_authoring_property_taxonomy\(\)[\s\S]*?from public, anon, authenticated, service_role/i,
  'RPC permissions must start from explicit revoke'
);

has(
  sql,
  /grant execute[\s\S]*?zfind_authoring_property_taxonomy\(\)[\s\S]*?to authenticated/i,
  'Only authenticated browser role receives execute'
);

lacks(
  sql,
  /grant\s+(select|insert|update|delete|all)[\s\S]*?property_(classes|subtypes)/i,
  'R2.3A must not expose taxonomy tables directly'
);

lacks(
  sql,
  /grant execute[\s\S]*?to anon/i,
  'Anonymous browser role must not receive taxonomy authoring RPC'
);


has(
  serviceSource,
  /client\.rpc\(\s*['"]zfind_authoring_property_taxonomy['"]/i,
  'Shared service must consume taxonomy through the RPC'
);

lacks(
  serviceSource,
  /\.from\(\s*['"]property_classes['"]\s*\)/i,
  'Shared service must not query Property classes directly'
);

lacks(
  serviceSource,
  /\.from\(\s*['"]property_subtypes['"]\s*\)/i,
  'Shared service must not query Property subtypes directly'
);

lacks(
  serviceSource,
  /service_role/i,
  'Browser taxonomy service must contain no service-role authority'
);


const taxonomy = require(servicePath);

const normalized = taxonomy.normalizeTaxonomy({
  classes: [
    { code: 'commercial', enabled: false, sort_order: 2 },
    { code: 'residential', enabled: true, sort_order: 1 },
    { code: 'land', enabled: true, sort_order: 3 }
  ],
  subtypes: [
    {
      code: 'villa',
      property_class: 'residential',
      enabled: true,
      sort_order: 2
    },
    {
      code: 'apartment',
      property_class: 'residential',
      enabled: true,
      sort_order: 1
    },
    {
      code: 'disabled_home',
      property_class: 'residential',
      enabled: false,
      sort_order: 0
    },
    {
      code: 'office',
      property_class: 'commercial',
      enabled: true,
      sort_order: 1
    }
  ]
});

assert.deepStrictEqual(
  normalized.classes.map(item => item.code),
  ['residential', 'commercial', 'land'],
  'Classes must normalize into canonical sort order'
);

assert.deepStrictEqual(
  taxonomy
    .listEnabledSubtypes(normalized, 'residential')
    .map(item => item.code),
  ['apartment', 'villa'],
  'Enabled Residential authoring choices must respect taxonomy order'
);

assert.deepStrictEqual(
  taxonomy.listEnabledSubtypes(
    normalized,
    'commercial'
  ),
  [],
  'Subtypes of a disabled class cannot become authoring choices'
);

assert.strictEqual(
  taxonomy.getDefaultSubtype(
    normalized,
    'residential'
  ),
  'apartment',
  'Default subtype must come from authoritative taxonomy sort order'
);

assert.strictEqual(
  taxonomy.humanizeCode('office_space'),
  'Office Space',
  'Internal authoring label fallback must remain presentation-only'
);


console.log(
  'PASS: Phase 4R R2.3A Property taxonomy read port — secured RPC + shared read-only service'
);
