'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const adminPath = path.join(
  root,
  'apps/zfind-web/src/services/admin.js'
);

const migrationsDir = path.resolve(
  root,
  '../../infrastructure/supabase/migrations'
);

const migrationName = fs.readdirSync(migrationsDir)
  .filter(name => name.endsWith('_z_find_admin_compound_atomic_v1.sql'))
  .sort()
  .at(-1);

if (!migrationName) {
  throw new Error('Admin compound atomic migration not found');
}

const migrationPath = path.join(migrationsDir, migrationName);

const admin = fs.readFileSync(adminPath, 'utf8');
const migration = fs.readFileSync(migrationPath, 'utf8');

let passed = 0;

function check(condition, label) {
  if (!condition) {
    console.error('❌ FAIL:', label);
    process.exitCode = 1;
    return;
  }

  passed += 1;
  console.log('✅ PASS:', label);
}

check(
  admin.includes("client.rpc('zfind_admin_delete_asset'"),
  'Property/Development delete routed through atomic RPC'
);

check(
  admin.includes("client.rpc('zfind_admin_duplicate_asset'"),
  'Property/Development duplicate routed through atomic RPC'
);

check(
  admin.includes("client.rpc('zfind_replace_features'"),
  'Feature replacement routed through atomic RPC'
);

check(
  admin.includes("client.rpc('zfind_admin_set_media_cover'"),
  'Cover selection routed through atomic RPC'
);

check(
  admin.includes("client.rpc('zfind_admin_reorder_media'"),
  'Media reorder routed through atomic RPC'
);

check(
  migration.includes('security definer') &&
  migration.includes('set search_path = pg_catalog'),
  'SECURITY DEFINER RPCs use hardened search_path'
);

check(
  migration.includes("p.role = 'admin'") &&
  migration.includes('auth.uid()'),
  'Commands authorize real authenticated Admin server-side'
);

check(
  migration.includes('for update'),
  'Compound commands lock authoritative rows'
);

check(
  migration.includes('find.verification_assessments') &&
  migration.includes("errcode = '55000'"),
  'Verification truth blocks destructive hard delete'
);

check(
  migration.includes('from public.leads') &&
  migration.includes('unpublish instead'),
  'Real Leads block destructive hard delete'
);

check(
  migration.includes('from public.properties p') &&
  migration.includes('p.development_id = p_asset_id') &&
  migration.includes('child Propert'),
  'Development delete refuses while child Properties exist'
);

check(
  migration.includes('delete from public.price_history'),
  'Listing price history dependency handled transactionally'
);

check(
  !migration.includes('delete from find.listing_state_history') &&
  !migration.includes('delete from find.representation_state_history'),
  'Lifecycle audit history is preserved'
);

check(
  migration.includes(
    'revoke all\non function public.zfind_admin_delete_asset'
  ) &&
  migration.includes(
    'grant execute\non function public.zfind_admin_delete_asset'
  ),
  'RPC permissions explicitly restricted'
);

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(`\nADMIN COMPOUND ATOMIC TEST: ${passed}/14 PASSED`);
