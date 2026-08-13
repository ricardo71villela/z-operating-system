'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const findRoot = path.resolve(__dirname, '../..');
const repoRoot = path.resolve(findRoot, '../..');

const statesPath = path.join(
  findRoot,
  'packages/zfind-domain/states.js'
);

const adminPath = path.join(
  findRoot,
  'apps/zfind-web/src/services/admin.js'
);

const uiPath = path.join(
  findRoot,
  'apps/zfind-admin/src/app.js'
);

const migrationsDir = path.join(
  repoRoot,
  'infrastructure/supabase/migrations'
);

const migrationName = fs
  .readdirSync(migrationsDir)
  .filter(name =>
    name.endsWith(
      '_z_find_marketplace_lifecycle_hardening_v1.sql'
    )
  )
  .sort()
  .at(-1);

assert(
  migrationName,
  'Marketplace lifecycle migration not found'
);

const migration = fs.readFileSync(
  path.join(migrationsDir, migrationName),
  'utf8'
);

const admin = fs.readFileSync(adminPath, 'utf8');
const ui = fs.readFileSync(uiPath, 'utf8');

const {
  STATE_TRANSITIONS,
  canTransition,
  assertTransition
} = require(statesPath);


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
  canTransition(
    'representation',
    'proposed',
    'active'
  ),
  'Representation proposed → active allowed'
);

check(
  !canTransition(
    'representation',
    'ended',
    'active'
  ),
  'Representation ended is terminal'
);

check(
  canTransition(
    'listing',
    'ready',
    'published'
  ),
  'Listing ready → published allowed'
);

check(
  !canTransition(
    'listing',
    'draft',
    'published'
  ),
  'Listing draft → published forbidden'
);

check(
  !canTransition(
    'listing',
    'suspended',
    'published'
  ),
  'Suspended Listing must return through ready'
);

check(
  STATE_TRANSITIONS.listing.archived.length === 0,
  'Archived Listing is terminal'
);

let transitionRejected = false;

try {
  assertTransition(
    'listing',
    'published',
    'draft'
  );
} catch (_) {
  transitionRejected = true;
}

check(
  transitionRejected,
  'Legacy published → draft transition rejected'
);

check(
  admin.includes(
    "client.rpc('zfind_admin_transition_listing'"
  ) &&
  !admin.includes(
    ".from('listings').update({ status"
  ),
  'Admin Listing status uses RPC only'
);

check(
  admin.includes(
    "client.rpc('zfind_admin_transition_representation'"
  ),
  'Admin Representation status uses RPC only'
);

check(
  !ui.includes('togglePublish(') &&
  ui.includes('transitionListing(') &&
  ui.includes('transitionRepresentation('),
  'Admin UI exposes explicit lifecycle actions'
);

check(
  migration.includes(
    'drop policy if exists\n  "partner: manage own listings"'
  ),
  'Partner Listing FOR ALL policy removed'
);

check(
  migration.includes(
    '"partner: view own listings"'
  ) &&
  migration.includes(
    '"partner: update own listing commercial fields"'
  ),
  'Partner Listing access split into SELECT + commercial UPDATE'
);

check(
  migration.includes(
    'revoke insert, delete, update'
  ) &&
  migration.includes(
    'grant update ('
  ),
  'Broad authenticated Listing writes removed'
);

check(
  migration.includes(
    'revoke insert, update, delete\non public.representations'
  ),
  'Direct authenticated Representation writes removed'
);

check(
  migration.includes(
    'security definer'
  ) &&
  migration.includes(
    'set search_path = pg_catalog'
  ),
  'Lifecycle commands use hardened SECURITY DEFINER'
);

check(
  migration.includes(
    "p.role = 'admin'"
  ) &&
  migration.includes(
    'auth.uid()'
  ),
  'Lifecycle commands authorize Admin server-side'
);

check(
  migration.includes(
    "v_listing.status = 'ready'"
  ) &&
  migration.includes(
    "'published'"
  ),
  'Publishing is represented as ready → published'
);

check(
  migration.includes(
    "v_rep.status <> 'active'"
  ) &&
  migration.includes(
    'activate the Representation first'
  ),
  'Publishing requires active Representation'
);

check(
  migration.includes(
    'positive price'
  ) &&
  migration.includes(
    'public.listing_content'
  ),
  'Ready/published requires objective minimum content'
);

check(
  migration.includes(
    'while % published Listing(s) exist'
  ),
  'Active Representation cannot end/dispute beneath live Listing'
);

check(
  !migration.includes(
    'delete from find.listing_state_history'
  ) &&
  !migration.includes(
    'delete from find.representation_state_history'
  ),
  'Lifecycle audit history remains authoritative'
);

check(
  migration.includes(
    'grant execute\non function public.zfind_admin_transition_listing'
  ) &&
  migration.includes(
    'grant execute\non function public.zfind_admin_transition_representation'
  ),
  'Lifecycle RPC execution exposed only through authenticated entrypoint'
);


if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(
  `\nMARKETPLACE LIFECYCLE HARDENING: ${passed}/22 PASSED`
);
