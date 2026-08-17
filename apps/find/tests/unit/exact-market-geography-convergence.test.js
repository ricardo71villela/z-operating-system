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

const config = JSON.parse(
  readFind('config/exact-market-geography-convergence-v1.json')
);
const rpc = readFind(
  'supabase/migrations/0020_exact_market_geography_scope_read.sql'
);
const historicalBridge = readFind(
  'supabase/migrations/0012_geography_registry_bridge.sql'
);
const infrastructureConvergence = readRepo(
  'infrastructure/supabase/migrations/20260812135037_z_find_database_convergence_v1.sql'
);
const bootstrap = readRepo(
  'infrastructure/supabase/migrations/20260816220000_zos_geography_exact_market_bootstrap_v1.sql'
);
const registry = require(path.join(
  FIND_ROOT,
  'apps/zfind-web/src/services/market-registry.js'
));

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

const exactKeys = [
  'GB-ENG',
  'GB-SCT',
  'GB-WLS',
  'GB-NIR',
  'AE-DU'
];

const allBootstrapCodes = [
  'GB',
  'AE',
  ...exactKeys
];

check('convergence source is prepared but not live-applied',
  config.status === 'source_prepared_not_applied' &&
  config.bootstrap_migration_live_apply_authorized === false);

check('bootstrap apply mode requires explicit database authority',
  config.apply_mode ===
    'forward_only_infrastructure_migration_after_explicit_db_authority' &&
  config.canonical_bootstrap_delivery ===
    'forward_only_infrastructure_migration');

check('runtime direct DB writer is not invented for bootstrap',
  config.runtime_direct_db_writer === false);

check('automatic zone binding remains forbidden',
  config.auto_zone_binding === false &&
  config.binding_policy.binding_is_explicit === true);

check('exact five market keys remain declared once',
  config.desired_nodes.length === 5 &&
  config.desired_nodes.map(row => row.market_key).sort().join(',') ===
    exactKeys.slice().sort().join(','));

check('config and Market Registry agree on exact scopes',
  config.desired_nodes.every(row => {
    const market = registry.getMarket(row.market_key);
    return (
      market &&
      market.searchScope.kind === 'exact_market' &&
      market.searchScope.value === row.market_key &&
      market.geography.parentCountryIso === row.parent_country_iso
    );
  }));

check('historical 0012 bridge artifact remains unchanged as text',
  /geography_entity_id\s+text/i.test(historicalBridge));

check('current infrastructure bridge authority is UUID + canonical FK',
  /geography_entity_id\s+uuid[\s\S]*?references\s+zos\.geography_locations\s*\(\s*id\s*\)/i
    .test(infrastructureConvergence));

check('current infrastructure bridge remains optional and unbound by default',
  /geography_binding_status\s+text[\s\S]*?not\s+null[\s\S]*?default\s+'unbound'/i
    .test(infrastructureConvergence));

check('bootstrap source contains exactly the seven required canonical codes',
  allBootstrapCodes.every(code => bootstrap.includes(`'${code}'`)));

check('bootstrap creates GB and AE canonical country roots',
  bootstrap.includes("'country',\n    'GB',\n    'GB'") &&
  bootstrap.includes("'country',\n    'AE',\n    'AE'"));

check('bootstrap creates four GB constituent-country nodes',
  exactKeys
    .filter(key => key.startsWith('GB-'))
    .every(key =>
      bootstrap.includes("'constituent-country'") &&
      bootstrap.includes(`'${key}'`)
    ));

check('bootstrap creates Dubai as exact AE-DU emirate',
  bootstrap.includes("'emirate',\n    'AE-DU',\n    'AE'"));

check('bootstrap records five current ISO 3166-2 external codes',
  exactKeys.every(key => bootstrap.includes(`'${key}'`)) &&
  bootstrap.includes("'ISO_3166-2'") &&
  bootstrap.includes('expected 5 current ISO 3166-2 exact-market codes'));

check('bootstrap records seven canonical English names',
  [
    'United Kingdom',
    'United Arab Emirates',
    'England',
    'Scotland',
    'Wales',
    'Northern Ireland',
    'Dubai'
  ].every(name => bootstrap.includes(`'${name}'`)) &&
  bootstrap.includes('expected 7 canonical English names'));

check('bootstrap records provenance and append-only new history',
  bootstrap.includes('insert into zos.geography_provenance') &&
  bootstrap.includes('insert into zos.geography_location_history') &&
  bootstrap.includes("'new'") &&
  bootstrap.includes('before_state') &&
  bootstrap.includes('expected 7 provenance rows') &&
  bootstrap.includes('expected 7 append-only creation history rows'));

check('bootstrap is replay-safe and fail-closed on conflicts',
  bootstrap.includes('on conflict do nothing') &&
  bootstrap.includes('raise exception') &&
  bootstrap.includes('Strict postconditions'));

check('bootstrap never writes zones_lite or invents marketplace bindings',
  !/\b(insert\s+into|update|delete\s+from)\s+(public\.)?zones_lite\b/i
    .test(bootstrap));

check('bootstrap contains no destructive SQL',
  !/\b(drop|truncate)\b/i.test(bootstrap) &&
  !/\bdelete\s+from\b/i.test(bootstrap));

check('public exact-market RPC now uses native UUID bridge join',
  rpc.includes('on z.geography_entity_id = d.id') &&
  !rpc.includes('z.geography_entity_id = d.id::text'));

check('RPC accepts only the five approved exact-market keys',
  exactKeys.every(key => rpc.includes(`'${key}'`)) &&
  !rpc.includes("'GB'") &&
  !rpc.includes("'AE'"));

check('RPC resolves canonical node through current ISO 3166-2 code',
  rpc.includes('zos.geography_external_codes') &&
  rpc.includes("gec.code_system = 'ISO_3166-2'") &&
  rpc.includes('gec.code = r.market_key') &&
  rpc.includes('gec.valid_to is null'));

check('RPC traverses active canonical Geography descendants',
  rpc.includes('with recursive') &&
  rpc.includes('child.parent_id = parent.id') &&
  rpc.includes("child.status = 'active'"));

check('RPC fail-closes with resolved state instead of parent substitution',
  rpc.includes("'resolved'") &&
  rpc.includes("'zone_lite_ids'"));

check('RPC migration performs no canonical Geography data writes',
  !/\binsert\s+into\s+zos\./i.test(rpc) &&
  !/\bupdate\s+zos\./i.test(rpc) &&
  !/\bdelete\s+from\s+zos\./i.test(rpc));

check('RPC never writes or auto-binds zones_lite',
  !/\binsert\s+into\s+public\.zones_lite/i.test(rpc) &&
  !/\bupdate\s+public\.zones_lite/i.test(rpc) &&
  !/create\s+trigger[\s\S]*zones_lite/i.test(rpc));

check('live-audit contract still rejects heuristic zone bindings',
  config.live_audit_requirements.some(
    row => row.includes('Do not infer bindings from city names')
  ));

console.log('');
console.log(`EXACT_MARKET_GEOGRAPHY_CONVERGENCE_TOTAL=${passed + failed}`);
console.log(`EXACT_MARKET_GEOGRAPHY_CONVERGENCE_PASSED=${passed}`);
console.log(`EXACT_MARKET_GEOGRAPHY_CONVERGENCE_FAILED=${failed}`);

if (failed) process.exit(1);
