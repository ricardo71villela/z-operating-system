const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../..');

const migrationName =
  '20260814011800_z_find_partner_media_asset_bootstrap_select_convergence_v1.sql';

const operationalPath = path.join(
  ROOT,
  'infrastructure/supabase/migrations',
  migrationName
);

const appPath = path.join(
  ROOT,
  'apps/find/supabase/migrations',
  migrationName
);

const servicePath = path.join(
  ROOT,
  'apps/find/apps/zfind-web/src/services/admin.js'
);

const operational = fs.readFileSync(operationalPath, 'utf8');
const app = fs.readFileSync(appPath, 'utf8');
const service = fs.readFileSync(servicePath, 'utf8');

// Security assertions below inspect executable SQL rather than comments.
const executableSql = operational.replace(/--.*$/gm, '');

// Security assertions below inspect executable SQL rather than comments.


let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    console.log(`✅ ${message}`);
    passed += 1;
  } else {
    console.error(`❌ ${message}`);
    failed += 1;
  }
}

console.log(
  '\n=== Z FIND — PARTNER MEDIA ASSET BOOTSTRAP RLS CONVERGENCE ==='
);

check(
  operational === app,
  'Operational and Z Find migration copies are identical'
);

check(
  operational.includes(
    'drop policy if exists "partner: view own media assets"'
  ) &&
  operational.includes(
    'create policy "partner: view own media assets"'
  ),
  'Existing Partner media SELECT policy is replaced forward-only'
);

check(
  /for\s+select\s+to\s+authenticated/i.test(operational),
  'Policy remains authenticated SELECT only'
);

check(
  /zfind_partner_can_manage_media_path\s*\(\s*original_storage_path\s*\)/i
    .test(operational),
  'Pre-link visibility is constrained by controlled storage path'
);

check(
  /from\s+public\.listing_media[\s\S]*zfind_partner_controls_listing/i
    .test(operational),
  'Existing Listing-linked ownership visibility is preserved'
);

check(
  /from\s+public\.development_media[\s\S]*zfind_partner_owns_development/i
    .test(operational),
  'Existing Development-linked ownership visibility is preserved'
);

check(
  !/\bto\s+anon\b/i.test(operational),
  'No anonymous access is added'
);

check(
  !/\bfor\s+(insert|update|delete|all)\b/i.test(operational),
  'No INSERT/UPDATE/DELETE capability is added'
);

check(
  !/storage\.objects/i.test(operational),
  'Storage policies are untouched'
);

check(
  !/vehicle-images/i.test(executableSql),
  'Z Mobility vehicle-images is untouched'
);

check(
  /from\(['"]media_assets['"]\)\.insert\([\s\S]{0,700}\.select\(\)\.single\(\)/i
    .test(service),
  'Shared upload requires returned media_asset id'
);

check(
  /media_asset_id:\s*asset\.data\.id[\s\S]{0,800}from\(table\)\.insert\(link\)/i
    .test(service),
  'Association is created only after media_asset id exists'
);

console.log('');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exitCode = 1;
}
