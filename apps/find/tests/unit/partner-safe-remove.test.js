'use strict';

const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;

function check(condition, label) {
  if (condition) {
    pass++;
    console.log('✅ PASS:', label);
  } else {
    fail++;
    console.log('❌ FAIL:', label);
  }
}

const root = path.resolve(__dirname, '../../../..');

const migDir = path.join(
  root,
  'infrastructure',
  'supabase',
  'migrations'
);

const migrationName = fs
  .readdirSync(migDir)
  .filter(name =>
    name.endsWith('_z_find_partner_safe_remove_v1.sql')
  )
  .sort()
  .at(-1);

if (!migrationName) {
  throw new Error('Partner safe-remove migration not found');
}

const sql = fs.readFileSync(
  path.join(migDir, migrationName),
  'utf8'
);

const admin = fs.readFileSync(
  path.join(
    root,
    'apps/find/apps/zfind-web/src/services/admin.js'
  ),
  'utf8'
);

const partner = fs.readFileSync(
  path.join(
    root,
    'apps/find/apps/zfind-partner/src/app.js'
  ),
  'utf8'
);

console.log(
  '\n=== Z FIND — PARTNER SAFE REMOVE / DELETE ==='
);

check(
  /add column if not exists removed_at timestamptz/i.test(sql),
  'Property/Development have explicit operational removal marker'
);

check(
  /zfind_partner_remove_asset[\s\S]*security definer[\s\S]*set search_path = pg_catalog/i.test(sql),
  'Partner remove command is hardened SECURITY DEFINER'
);

check(
  sql.includes(
    'Partner does not control this Property'
  ) &&
  sql.includes(
    'Partner does not control this Development'
  ),
  'Server validates real Partner ownership'
);

check(
  sql.includes(
    'non-ended Representation belonging to another Partner'
  ),
  'Another Partner active representation blocks unilateral removal'
);

check(
  sql.includes('protected_by_leads') &&
  sql.includes('protected_by_verification'),
  'Protected history drives retirement rather than destruction'
);

check(
  /delete from public\.leads/i.test(sql) === false,
  'Partner removal never deletes Leads'
);

check(
  /delete from find\.verification_assessments/i.test(sql) === false,
  'Partner removal never deletes Verification truth'
);

check(
  /delete from find\.listing_state_history/i.test(sql) === false &&
  /delete from find\.representation_state_history/i.test(sql) === false,
  'Partner removal never deletes lifecycle audit history'
);

check(
  sql.includes("set status = 'archived'"),
  'Protected Listings are archived'
);

check(
  sql.includes("r.status in ('active', 'disputed')"),
  'Only legal active/disputed Representations are ended'
);

check(
  sql.includes("'mode', 'hard_deleted'") &&
  sql.includes("'mode', 'retired'"),
  'Workflow supports hard delete and protected retirement'
);

check(
  sql.includes(
    'delete from public.properties'
  ) &&
  sql.includes(
    'delete from public.developments'
  ),
  'Clean assets can be physically deleted'
);

check(
  sql.includes(
    'update public.properties'
  ) &&
  sql.includes(
    'update public.developments'
  ) &&
  sql.includes('removed_at = v_now'),
  'Protected assets are removed operationally'
);

check(
  admin.includes(
    "client.rpc('zfind_partner_remove_asset'"
  ),
  'Shared service routes Partner removal only through RPC'
);

check(
  admin.includes('removeAssetForPartner'),
  'Partner removal service is exported'
);

check(
  partner.includes('removePartnerAsset(kind, id)') &&
  partner.includes('ensurePartnerRemoveButton(kind, id)'),
  'Partner UI exposes explicit remove workflow'
);

check(
  partner.includes(
    'Protected leads, verification and audit history'
  ),
  'Partner UI explains protected-history behavior'
);

check(
  partner.includes(
    'window.ZFindServices.admin.removeAssetForPartner'
  ),
  'Partner UI does not delete database rows directly'
);

console.log(
  `\nPARTNER SAFE REMOVE TEST: ${pass}/${pass + fail} PASSED`
);

if (fail) process.exit(1);
