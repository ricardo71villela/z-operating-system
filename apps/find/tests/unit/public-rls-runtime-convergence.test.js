'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../..');

const migration = fs.readFileSync(
  path.join(
    ROOT,
    'infrastructure',
    'supabase',
    'migrations',
    '20260813230000_z_find_public_rls_runtime_convergence_v1.sql'
  ),
  'utf8'
);

let pass = 0;
let fail = 0;

function check(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    pass += 1;
  } else {
    console.log(`❌ FAIL: ${message}`);
    fail += 1;
  }
}

const helpers = [
  'zfind_public_listing_visible',
  'zfind_public_representation_visible',
  'zfind_public_property_visible',
  'zfind_public_development_visible',
];

for (const helper of helpers) {
  check(
    migration.includes(
      `create or replace function public.${helper}(`
    ),
    `${helper} exists`
  );
}

check(
  (migration.match(/security definer/gi) || []).length >= 4,
  'All public visibility helpers are SECURITY DEFINER'
);

check(
  (migration.match(/set search_path = pg_catalog/gi) || []).length >= 4,
  'All public visibility helpers pin search_path to pg_catalog'
);

check(
  migration.includes(
    'public.zfind_public_property_visible(id)'
  ),
  'Property anon policy uses non-recursive visibility helper'
);

check(
  migration.includes(
    'public.zfind_public_development_visible(id)'
  ),
  'Development anon policy uses non-recursive visibility helper'
);

check(
  migration.includes(
    'public.zfind_public_representation_visible(id)'
  ),
  'Representation anon policy uses non-recursive visibility helper'
);

check(
  migration.includes(
    'public.zfind_public_listing_visible(id)'
  ),
  'Listing anon policy uses non-recursive visibility helper'
);

check(
  migration.includes(
    'public.zfind_public_listing_visible(listing_id)'
  ),
  'Listing content/media reuse Listing public truth'
);

check(
  migration.includes(
    'public.zfind_public_development_visible(development_id)'
  ),
  'Development media reuses Development public truth'
);

check(
  migration.includes("l.status = 'published'"),
  'Visibility helpers require published Listing'
);

check(
  migration.includes("r.status = 'active'"),
  'Visibility helpers require active Representation'
);

check(
  migration.includes('removed_at is null'),
  'Visibility helpers reject removed targets'
);

check(
  !migration.includes('disable row level security'),
  'Migration never disables RLS'
);

check(
  !migration.includes('vehicle-images') &&
  !migration.includes('vehicle_images'),
  'Migration does not touch Z Mobility storage'
);

check(
  !migration.includes('service_role'),
  'Migration introduces no service-role dependency'
);

console.log(
  `\nPUBLIC RLS RUNTIME CONVERGENCE: ` +
  `${pass}/${pass + fail} PASSED`
);

if (fail) process.exit(1);
