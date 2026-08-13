'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../..');

const migrationDir = path.join(
  ROOT,
  'infrastructure',
  'supabase',
  'migrations'
);

const migrationName =
  '20260813224000_z_find_rental_duplication_bootstrap_convergence_v1.sql';

const migrationPath = path.join(
  migrationDir,
  migrationName
);

const sql = fs.readFileSync(
  migrationPath,
  'utf8'
);

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed += 1;
  } else {
    console.log(`❌ FAIL: ${message}`);
    failed += 1;
  }
}

function occurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

function extractFunction(name) {
  const start = sql.indexOf(
    `create or replace function public.${name}(`
  );

  if (start < 0) {
    throw new Error(`${name} not found`);
  }

  const end = sql.indexOf(
    '\n$$;',
    start
  );

  if (end < 0) {
    throw new Error(`${name} terminator not found`);
  }

  return sql.slice(
    start,
    end + '\n$$;'.length
  );
}

const duplicate = extractFunction(
  'zfind_admin_duplicate_asset'
);

const initial = extractFunction(
  'zfind_admin_create_initial_listing'
);

const partnerDraft = extractFunction(
  'zfind_partner_ensure_draft_listing'
);


console.log(
  '\n=== Z FIND — RENTAL DUPLICATION + BOOTSTRAP ==='
);


check(
  fs.existsSync(migrationPath),
  'Forward-only Rental duplication convergence migration exists'
);

check(
  occurrences(
    duplicate,
    'v_source_listing.transaction_type'
  ) === 2,
  'Property + Development duplicate preserve transaction_type'
);

check(
  occurrences(
    duplicate,
    'v_source_listing.rental_period'
  ) === 2,
  'Property + Development duplicate preserve rental_period'
);

check(
  occurrences(
    duplicate,
    "'standard'"
  ) >= 2,
  'Duplicate intentionally resets distribution to standard'
);

check(
  occurrences(
    duplicate,
    "'draft'"
  ) >= 2,
  'Duplicate intentionally resets Listing lifecycle to draft'
);

check(
  duplicate.includes(
    "and p.role = 'admin'"
  ),
  'Duplicate command remains Admin-authorized server-side'
);

check(
  initial.includes(
    'transaction_type'
  ) &&
  initial.includes(
    'rental_period'
  ) &&
  initial.includes(
    "'sale'"
  ) &&
  initial.includes(
    'null'
  ),
  'Admin initial Listing explicitly bootstraps as sale/null'
);

check(
  partnerDraft.includes(
    'transaction_type'
  ) &&
  partnerDraft.includes(
    'rental_period'
  ) &&
  partnerDraft.includes(
    "'sale'"
  ) &&
  partnerDraft.includes(
    'null'
  ),
  'Partner Draft Listing explicitly bootstraps as sale/null'
);

check(
  partnerDraft.includes(
    "p.role = 'partner_user'"
  ),
  'Partner Draft bootstrap still derives authenticated Partner identity'
);

check(
  partnerDraft.includes(
    'zfind_partner_owns_property'
  ) &&
  partnerDraft.includes(
    'zfind_partner_owns_development'
  ),
  'Partner Draft bootstrap still validates server-derived ownership'
);

check(
  [
    duplicate,
    initial,
    partnerDraft
  ].every(fn =>
    /security definer/i.test(fn) &&
    /set search_path = pg_catalog/i.test(fn)
  ),
  'All converged commands retain hardened SECURITY DEFINER boundary'
);

check(
  sql.includes(
    'grant execute\non function public.zfind_admin_duplicate_asset'
  ) &&
  sql.includes(
    'to authenticated;'
  ),
  'Duplicate execute remains authenticated-only entrypoint'
);

check(
  sql.includes(
    'revoke all\non function public.zfind_admin_duplicate_asset'
  ) &&
  sql.includes(
    'from anon;'
  ),
  'Anon cannot execute duplicate command'
);

check(
  !duplicate.includes(
    'delete from public.listing_state_history'
  ) &&
  !duplicate.includes(
    'delete from public.representation_state_history'
  ),
  'Rental duplication convergence does not destroy lifecycle history'
);

check(
  !sql.includes(
    'vehicle-images'
  ) &&
  !sql.includes(
    'vehicle_images'
  ),
  'Rental convergence does not touch Z Mobility storage boundary'
);


console.log(
  `\nRENTAL DUPLICATION/BOOTSTRAP: ` +
  `${passed}/${passed + failed} PASSED`
);

if (failed) process.exit(1);
