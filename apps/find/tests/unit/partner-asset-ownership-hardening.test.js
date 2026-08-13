const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function check(condition, label) {
  if (condition) {
    passed++;
    console.log('  ✅', label);
  } else {
    failed++;
    console.log('  ❌', label);
  }
}

const repoRoot = path.resolve(__dirname, '../../../..');
const migrationDir = path.join(
  repoRoot,
  'infrastructure',
  'supabase',
  'migrations'
);

const migrationName = fs
  .readdirSync(migrationDir)
  .filter(name =>
    name.endsWith(
      '_z_find_partner_asset_ownership_hardening_v1.sql'
    )
  )
  .sort()
  .at(-1);

if (!migrationName) {
  throw new Error(
    'Partner asset ownership hardening migration not found'
  );
}

const sql = fs.readFileSync(
  path.join(migrationDir, migrationName),
  'utf8'
);

const adminPath = path.join(
  repoRoot,
  'apps/find/apps/zfind-web/src/services/admin.js'
);

const admin = fs.readFileSync(adminPath, 'utf8');

console.log('\n=== Z FIND — PARTNER ASSET OWNERSHIP HARDENING ===');

check(
  /zfind_partner_create_property[\s\S]*?security definer[\s\S]*?set search_path = pg_catalog/i.test(sql),
  'Partner Property creation is SECURITY DEFINER'
);

check(
  /zfind_partner_create_development[\s\S]*?security definer[\s\S]*?set search_path = pg_catalog/i.test(sql),
  'Partner Development creation is SECURITY DEFINER'
);

check(
  /zfind_create_property[\s\S]*?security definer[\s\S]*?set search_path = pg_catalog/i.test(sql),
  'Generic Property creation is server-owned'
);

check(
  /zfind_update_asset[\s\S]*?security definer[\s\S]*?set search_path = pg_catalog/i.test(sql),
  'Asset editing is server-owned'
);

check(
  /zfind_replace_features[\s\S]*?security definer[\s\S]*?set search_path = pg_catalog/i.test(sql),
  'Feature replacement is server-owned and atomic'
);

check(
  sql.includes(
    'drop policy if exists "partner: create properties"'
  ),
  'Direct Partner Property INSERT policy is removed'
);

check(
  sql.includes(
    'drop policy if exists "partner: create developments"'
  ),
  'Direct Partner Development INSERT policy is removed'
);

check(
  sql.includes(
    'drop policy if exists "partner: update own properties"'
  ),
  'Direct Partner Property UPDATE policy is removed'
);

check(
  sql.includes(
    'drop policy if exists "partner: update own developments"'
  ),
  'Direct Partner Development UPDATE policy is removed'
);

check(
  sql.includes(
    'drop policy if exists "partner: delete own properties"'
  ) &&
  sql.includes(
    'drop policy if exists "partner: delete own developments"'
  ),
  'Unsafe direct Partner asset DELETE policies are removed'
);

check(
  sql.includes(
    'drop policy if exists "partner: manage own listing_content"'
  ),
  'Listing content FOR ALL policy is removed'
);

check(
  sql.includes(
    'drop policy if exists "partner: manage own listing_media"'
  ) &&
  sql.includes(
    'drop policy if exists "partner: manage own development_media"'
  ),
  'Media-association FOR ALL policies are removed'
);

check(
  sql.includes(
    'drop policy if exists "partner: manage own property_features"'
  ) &&
  sql.includes(
    'drop policy if exists "partner: manage own development_features"'
  ),
  'Feature-junction FOR ALL policies are removed'
);

check(
  sql.includes('promoter_partner_id') &&
  sql.includes('v_partner_id'),
  'Partner-created Development records promoter ownership server-side'
);

check(
  sql.includes(
    "Cannot create a unit inside another Partner''s Development"
  ),
  'Cross-Partner Development unit creation is forbidden'
);

check(
  sql.includes(
    "Partner cannot change Property development ownership directly"
  ),
  'Partner cannot re-parent Property structurally'
);

check(
  sql.includes(
    'Partner cannot change Development promoter ownership'
  ),
  'Partner cannot change promoter ownership'
);

check(
  admin.includes("client.rpc('zfind_create_property'"),
  'createProperty uses the server-owned creation command'
);

check(
  admin.includes("client.rpc('zfind_update_asset'") &&
  admin.match(/client\.rpc\('zfind_update_asset'/g).length === 2,
  'Property and Development edits use server-owned command'
);

check(
  admin.match(/client\.rpc\('zfind_replace_features'/g)?.length === 2,
  'Property and Development feature saves use shared secured RPC'
);

check(
  !admin.includes(
    "client.from('properties').update(patch)"
  ),
  'No direct Property update remains in admin service'
);

check(
  !admin.includes(
    "client.from('developments').update(patch)"
  ),
  'No direct Development update remains in admin service'
);

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);

if (failed) process.exit(1);
