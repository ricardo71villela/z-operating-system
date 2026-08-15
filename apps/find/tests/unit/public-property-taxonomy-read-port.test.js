'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../..');

const migrationPath = path.join(
  ROOT,
  'infrastructure/supabase/migrations/',
  '20260815033000_z_find_public_property_taxonomy_read_port_v1.sql'
);

const architecturePath = path.join(
  ROOT,
  'apps/find/config/phase4r-architecture-contract.json'
);

const commercialPath = path.join(
  ROOT,
  'apps/find/config/commercial-property-taxonomy-v1.json'
);

const sql = fs.readFileSync(
  migrationPath,
  'utf8'
);

const architecture = JSON.parse(
  fs.readFileSync(
    architecturePath,
    'utf8'
  )
);

const commercial = JSON.parse(
  fs.readFileSync(
    commercialPath,
    'utf8'
  )
);

assert.deepStrictEqual(
  architecture.propertyClasses,
  ['residential', 'commercial', 'land']
);

assert.strictEqual(
  architecture.commercialIsPropertyClass,
  true
);

assert.strictEqual(
  architecture.commercialIsPropertySubtype,
  false
);

assert.strictEqual(
  architecture.developmentIsFirstClassEntity,
  true
);

assert.strictEqual(
  architecture.offMarketIsProductCapability,
  false
);

assert.deepStrictEqual(
  commercial.canonicalSubtypes.map(x => x.code),
  [
    'office',
    'retail',
    'industrial_logistics',
    'hospitality'
  ]
);

assert.match(
  sql,
  /create function public\.zfind_public_property_taxonomy\(\)/
);

assert.match(
  sql,
  /returns jsonb/
);

assert.match(
  sql,
  /language sql/
);

assert.match(
  sql,
  /stable/
);

assert.match(
  sql,
  /security definer/
);

assert.match(
  sql,
  /set search_path = pg_catalog/
);

assert.match(
  sql,
  /from public\.property_classes/
);

assert.match(
  sql,
  /from public\.property_subtypes/
);

assert.match(
  sql,
  /where pc\.enabled = true/
);

assert.match(
  sql,
  /where ps\.enabled = true/
);

assert.match(
  sql,
  /grant execute[\s\S]*to anon, authenticated/
);

assert.match(
  sql,
  /revoke all[\s\S]*from public, anon, authenticated, service_role/
);

assert.match(
  sql,
  /has_table_privilege\([\s\S]*'anon'[\s\S]*'public\.property_classes'[\s\S]*'SELECT'/
);

assert.match(
  sql,
  /has_table_privilege\([\s\S]*'anon'[\s\S]*'public\.property_subtypes'[\s\S]*'SELECT'/
);

assert.match(
  sql,
  /zfind_authoring_property_taxonomy\(\)/
);

assert.match(
  sql,
  /Anon must not expose the authoring taxonomy RPC|must not expose the authoring taxonomy RPC to anon/i
);

assert.doesNotMatch(
  sql,
  /grant\s+select\s+on\s+(?:table\s+)?public\.property_(?:classes|subtypes)/i
);

assert.doesNotMatch(
  sql,
  /insert\s+into\s+public\.property_(?:classes|subtypes)/i
);

assert.doesNotMatch(
  sql,
  /update\s+public\.property_(?:classes|subtypes)/i
);

assert.doesNotMatch(
  sql,
  /delete\s+from\s+public\.property_(?:classes|subtypes)/i
);

assert.doesNotMatch(
  sql,
  /create table/i
);

assert.doesNotMatch(
  sql,
  /alter table/i
);

for (const forbidden of [
  "'commercial', 'commercial'",
  "'development', 'commercial'",
  "'btr', 'commercial'",
  "'pbsa', 'commercial'",
  "'senior_living', 'commercial'"
]) {
  assert.ok(
    !sql.includes(forbidden),
    `Forbidden public taxonomy subtype mapping: ${forbidden}`
  );
}

console.log(
  'PASS: Phase 4R R2.5A public Property taxonomy read port — enabled-only anon-safe projection'
);
