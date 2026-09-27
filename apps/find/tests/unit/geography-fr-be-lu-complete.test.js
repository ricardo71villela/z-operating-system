/* Contract: complete ZOS Geography for the Z Find launch markets (FR/BE/LU). */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const REPO = path.join(__dirname, '..', '..', '..', '..');
const MIGRATION = path.join(REPO, 'infrastructure', 'supabase', 'migrations',
  '20260927230000_zos_geography_fr_be_lu_complete_v1.sql');
const FRANCE_LAUNCH = path.join(REPO, 'infrastructure', 'supabase', 'migrations',
  '20260828120754_zos_geography_france_launch_v1.sql');

let passed = 0;
function check(label, value) {
  assert(value, label);
  passed += 1;
  console.log('PASS:', label);
}

console.log('\n=== ZOS GEOGRAPHY — FR/BE/LU COMPLETE ===');

check('migration exists after the France launch bootstrap',
  fs.existsSync(MIGRATION) && path.basename(MIGRATION) > path.basename(FRANCE_LAUNCH));

const sql = fs.readFileSync(MIGRATION, 'utf8');

check('requires the canonical Geography tables and the 101 French departments',
  sql.includes("to_regclass('zos.geography_locations') is null") &&
  sql.includes("location_type='department' and status='active') <> 101"));

for (const [country, type, count] of [
  ['FR', 'commune', 34875], ['FR', 'municipal_district', 45],
  ['BE', 'region', 3], ['BE', 'province', 10], ['BE', 'arrondissement', 43], ['BE', 'commune', 565],
  ['LU', 'canton', 12], ['LU', 'commune', 100]
]) {
  check(`postcondition locks ${count} ${country} ${type}`,
    sql.includes(`if n <> ${count} then raise exception 'FR/BE/LU Geography postcondition failed: expected ${count} ${country} ${type}`));
}

check('keeps the France launch canonical code conventions',
  sql.includes("'FR-COM-74119'") && sql.includes("'FR-DEP-74'") && sql.includes("'INSEE_COG_COMMUNE'"));
check('Belgium uses REFNIS 2025 identities and ISO 3166-2 codes',
  sql.includes("'BE-COM-21009'") && sql.includes("'STATBEL_REFNIS'") && sql.includes("'BE-WAL'"));
check('Belgian 2025 fusions are applied (Tessenderlo-Ham, no Bertogne commune)',
  sql.includes("'BE-COM-71071'") && sql.includes("'Tessenderlo-Ham'") && !sql.includes("'BE-COM-82005'"));
check('Luxembourg has its 2023 communes and ISO cantons',
  sql.includes("'Groussbus-Wal'") && sql.includes("'Bous-Waldbredimus'") && sql.includes("'LU-CA'") && sql.includes("'Colmar-Berg'"));
check('postal codes live in a dedicated many-to-many table with RLS',
  sql.includes('create table if not exists zos.geography_postal_codes') &&
  sql.includes('alter table zos.geography_postal_codes enable row level security'));
check('replay-safe inserts and no destructive SQL on canonical tables',
  (sql.match(/not exists \(/g) || []).length >= 7 &&
  !/\b(delete from|truncate|drop table)\s+zos\./i.test(sql) &&
  !/\bupdate\s+zos\./i.test(sql));
check('provenance and confirmed history are recorded per batch',
  sql.includes("'zfind-geography-fr-be-lu-full-v1'") && sql.includes("'confirmed'"));
check('generator and reference builder are versioned beside Z Find',
  fs.existsSync(path.join(__dirname, '..', '..', 'scripts', 'geography', 'build_geography_migration.py')) &&
  fs.existsSync(path.join(__dirname, '..', '..', 'scripts', 'geography', 'build_geo_reference.py')));

console.log(`\nZOS GEOGRAPHY FR/BE/LU: ${passed}/${passed} PASSED`);
