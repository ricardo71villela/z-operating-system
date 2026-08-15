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
  '20260815003000_z_find_property_classification_foundation_v1.sql'
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
  'Operational Property classification migration must exist'
);

const sql = fs.readFileSync(migrationPath, 'utf8');
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

function has(re, message) {
  assert.ok(re.test(sql), message);
}

function lacks(re, message) {
  assert.ok(!re.test(sql), message);
}


assert.deepStrictEqual(
  contract.propertyClasses,
  ['residential', 'commercial', 'land'],
  'R2 must implement the locked R1 Property classes'
);

assert.strictEqual(
  contract.commercialIsPropertyClass,
  true,
  'Commercial must remain a Property class'
);

assert.strictEqual(
  contract.commercialIsPropertySubtype,
  false,
  'Commercial cannot become subtype=commercial'
);


has(
  /create table public\.property_classes\s*\(/i,
  'Migration must create Property class authority'
);

has(
  /create table public\.property_subtypes\s*\(/i,
  'Migration must create extensible Property subtype authority'
);

has(
  /\('residential',\s*true,\s*1\)/i,
  'Residential class must be seeded'
);

has(
  /\('commercial',\s*true,\s*2\)/i,
  'Commercial class must be seeded'
);

has(
  /\('land',\s*true,\s*3\)/i,
  'Land class must be seeded'
);


has(
  /\('apartment',\s*'residential'/i,
  'Apartment must map to residential'
);

has(
  /\('villa',\s*'residential'/i,
  'Villa must map to residential'
);

has(
  /\('land',\s*'land'/i,
  'Land subtype must map to land class'
);

lacks(
  /\('commercial',\s*'commercial'/i,
  'Commercial must not be introduced as its own literal subtype'
);


has(
  /alter table public\.properties\s+add column property_class text/i,
  'Properties must gain property_class'
);

has(
  /update public\.properties p\s+set property_class = ps\.property_class/i,
  'Existing Properties must be backfilled from taxonomy'
);

has(
  /alter column property_class set not null/i,
  'Property class must become mandatory after backfill'
);


has(
  /drop constraint properties_subtype_check/i,
  'Hardcoded apartment/villa/land subtype enum must be retired'
);

has(
  /foreign key \(property_class, subtype\)\s+references public\.property_subtypes\(property_class, code\)/i,
  'Property class/subtype relationship must be relationally enforced'
);


has(
  /create function public\.zfind_properties_derive_property_class\(\)/i,
  'Database must own class derivation'
);

has(
  /security definer\s+set search_path = pg_catalog/i,
  'Classification trigger function must use hardened SECURITY DEFINER'
);

has(
  /new\.property_class := v_property_class/i,
  'Database trigger must derive Property class from subtype'
);

has(
  /create trigger zfind_properties_derive_property_class/i,
  'Classification trigger must be installed'
);


has(
  /constraint property_classes_phase4r_code_check/i,
  'Phase 4R Property classes must remain structurally locked'
);

has(
  /join public\.property_classes pc\s+on pc\.code = ps\.property_class/i,
  'Subtype derivation must validate its owning Property class'
);

has(
  /and pc\.enabled = true/i,
  'Disabled Property classes must reject new Property classification'
);

has(
  /create table public\.property_subtypes[\s\S]*?code text primary key/i,
  'R2.1 keeps subtype codes globally unique for legacy subtype-only RPC compatibility'
);


has(
  /alter table public\.property_classes\s+enable row level security/i,
  'Property class taxonomy must have RLS enabled'
);

has(
  /alter table public\.property_subtypes\s+enable row level security/i,
  'Property subtype taxonomy must have RLS enabled'
);

has(
  /revoke all\s+on table public\.property_classes\s+from public, anon, authenticated/i,
  'Taxonomy must not accidentally expand public mutation/read authority'
);

has(
  /revoke all\s+on table public\.property_subtypes\s+from public, anon, authenticated/i,
  'Subtype taxonomy must not accidentally expand public mutation/read authority'
);


lacks(
  /alter table public\.listings/i,
  'R2 must not alter Listings'
);

lacks(
  /create table.*listing/i,
  'R2 must not recreate Listing structures'
);

lacks(
  /vehicle-images/i,
  'R2 must not touch Z Mobility storage'
);

lacks(
  /service_role.*grant/i,
  'R2 must not introduce a service_role grant'
);


console.log(
  'PASS: Phase 4R R2 Property classification foundation — relational class/subtype taxonomy, legacy RPC-compatible'
);
