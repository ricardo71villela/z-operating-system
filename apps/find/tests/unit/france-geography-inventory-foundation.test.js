#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const FIND_ROOT = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(FIND_ROOT, '../..');

const readFind = rel =>
  fs.readFileSync(path.join(FIND_ROOT, rel), 'utf8');

const readRepo = rel =>
  fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const geography = readRepo(
  'infrastructure/supabase/migrations/20260828120754_zos_geography_france_launch_v1.sql'
);
const repair = readRepo(
  'infrastructure/supabase/migrations/20260828120908_z_find_pg_special_form_repair_v2.sql'
);
const inventory = readRepo(
  'infrastructure/supabase/migrations/20260828120951_z_find_france_inventory_qa_v1.sql'
);
const marketRegistry = require(path.join(
  FIND_ROOT,
  'apps/zfind-web/src/services/market-registry.js'
));
const marketSearchScope = require(path.join(
  FIND_ROOT,
  'apps/zfind-web/src/services/market-search-scope.js'
));
const viewmodels = readFind(
  'apps/zfind-web/src/viewmodels.js'
);

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`PASS ${passed}: ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL ${failed}: ${label}`);
  }
}

const frMarket = marketRegistry.getMarket('FR');
const frScope = marketSearchScope.resolveMarketScope(frMarket);

check(
  'France remains a sovereign country_iso marketplace scope',
  Boolean(frMarket) &&
    frMarket.key === 'FR' &&
    frMarket.geography.kind === 'country' &&
    frMarket.geography.code === 'FR' &&
    frScope.supported === true &&
    frScope.kind === 'country_iso' &&
    frScope.countryIso === 'FR'
);

check(
  'France Geography source declares INSEE COG 2026 authority',
  geography.includes('INSEE Code officiel géographique (COG) 2026') &&
    geography.includes("'INSEE_COG'") &&
    geography.includes("'2026-01-01'")
);

check(
  'France Geography creates one canonical FR country root',
  geography.includes("select 'country', 'FR', 'FR'") &&
    geography.includes('country root')
);

check(
  'France Geography requires exactly 18 regions',
  geography.includes('expected 18 regions') &&
    geography.includes('region_count <> 18')
);

check(
  'France Geography requires exactly 101 departments',
  geography.includes('expected 101 departments') &&
    geography.includes('department_count <> 101')
);

check(
  'France Geography launch baseline requires exactly 24 communes',
  geography.includes('expected 24 launch communes') &&
    geography.includes('commune_count <> 24')
);

check(
  'France launch communes include representative national and overseas markets',
  [
    'FR-COM-75056',
    'FR-COM-69123',
    'FR-COM-13055',
    'FR-COM-06088',
    'FR-COM-2A004',
    'FR-COM-97101',
    'FR-COM-97411',
    'FR-COM-97611'
  ].every(code => geography.includes(code))
);

check(
  'France Geography source records official region, department and commune code systems',
  geography.includes("'INSEE_COG_REGION'") &&
    geography.includes("'INSEE_COG_DEPARTMENT'") &&
    geography.includes("'INSEE_COG_COMMUNE'")
);

check(
  'France Geography source records provenance and append-only confirmation history',
  geography.includes('insert into zos.geography_provenance') &&
    geography.includes('insert into zos.geography_location_history') &&
    geography.includes("'confirmed'") &&
    geography.includes("'zfind-france-geography-inventory-v1'")
);

check(
  'canonical Geography migration never writes Z Find marketplace tables',
  !/\b(insert\s+into|update|delete\s+from)\s+(public\.)?zones_lite\b/i.test(geography) &&
    !/\b(insert\s+into|update|delete\s+from)\s+(public\.)?properties\b/i.test(geography) &&
    !/\b(insert\s+into|update|delete\s+from)\s+(public\.)?developments\b/i.test(geography) &&
    !/\b(insert\s+into|update|delete\s+from)\s+(public\.)?listings\b/i.test(geography)
);

check(
  'canonical Geography migration contains no destructive DDL/DML',
  !/\b(drop|truncate)\b/i.test(geography) &&
    !/\bdelete\s+from\b/i.test(geography)
);

check(
  'special-form repair v2 repairs both invalid PostgreSQL spellings',
  repair.includes("'pg_catalog.coalesce('") &&
    repair.includes("'coalesce('") &&
    repair.includes("'pg_catalog.nullif('") &&
    repair.includes("'nullif('")
);

check(
  'special-form repair v2 is bounded to public.zfind functions and fail-closes',
  repair.includes("n.nspname = 'public'") &&
    repair.includes("left(p.proname, 6) = 'zfind_'") &&
    repair.includes('special-form repair v2 incomplete')
);

check(
  'France inventory explicitly binds canonical communes to FR zones_lite',
  inventory.includes('insert into public.zones_lite') &&
    inventory.includes("'FR'") &&
    inventory.includes("'linked'") &&
    inventory.includes('geography_entity_id')
);

check(
  'France inventory requires exactly 24 linked launch zones',
  inventory.includes('expected 24 linked launch zones') &&
    inventory.includes('france_zone_count <> 24')
);

check(
  'synthetic QA partner is explicitly inactive and non-public',
  inventory.includes('Z Find France QA — NON PUBLIC') &&
    /'agency'[\s\S]*?'inactive'/i.test(inventory)
);

check(
  'synthetic France QA contains one Property and one Development path',
  inventory.includes('insert into public.properties') &&
    inventory.includes("'fr-property-v1'") &&
    inventory.includes('insert into public.developments') &&
    inventory.includes('QA France — Development seed — NON PUBLIC')
);

check(
  'synthetic Representations are constrained to proposed state',
  inventory.includes("'proposed'") &&
    inventory.includes('QA Representation escaped proposed state')
);

check(
  'synthetic Listings are constrained to draft EUR zero-price state',
  inventory.includes("'draft'") &&
    inventory.includes("'EUR'") &&
    /select[\s\S]*?'standard'[\s\S]*?0[\s\S]*?'EUR'[\s\S]*?false[\s\S]*?'draft'/i.test(inventory) &&
    inventory.includes('QA Listing escaped draft state')
);

check(
  'synthetic QA content covers the six persisted public locales',
  ['fr','en','pt-PT','es','de','it']
    .every(locale => inventory.includes(`('${locale}'`))
);

check(
  'inventory migration contains no destructive SQL',
  !/\b(drop|truncate)\b/i.test(inventory) &&
    !/\bdelete\s+from\b/i.test(inventory)
);

check(
  'runtime explicitly fail-closes an authoritative empty country market scope',
  viewmodels.includes(
    'An authoritative empty market scope means zero marketplace'
  ) &&
    viewmodels.includes(
      'Never omit the zone filter for [] because that would'
    ) &&
    /Array\.isArray\(marketScope\.zoneLiteIds\)[\s\S]*?marketScope\.zoneLiteIds\.length === 0[\s\S]*?cards:\s*\[\]/.test(viewmodels)
);

check(
  'France inventory source cannot silently bind a FR zone to another country',
  inventory.includes('cross-country Geography binding') &&
    inventory.includes("z.country_iso = 'FR'") &&
    inventory.includes("gl.country_iso <> 'FR'")
);

console.log('');
console.log(`FRANCE_GEOGRAPHY_INVENTORY_FOUNDATION_TOTAL=${passed + failed}`);
console.log(`FRANCE_GEOGRAPHY_INVENTORY_FOUNDATION_PASSED=${passed}`);
console.log(`FRANCE_GEOGRAPHY_INVENTORY_FOUNDATION_FAILED=${failed}`);

if (failed) process.exit(1);
