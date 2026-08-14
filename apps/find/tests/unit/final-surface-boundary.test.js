'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function check(condition, label) {
  if (condition) {
    passed++;
    console.log('✅ PASS:', label);
  } else {
    failed++;
    console.log('❌ FAIL:', label);
  }
}

const root = path.resolve(__dirname, '../../../..');

const adminPath = path.join(
  root,
  'apps/find/apps/zfind-web/src/services/admin.js'
);

const partnerPath = path.join(
  root,
  'apps/find/apps/zfind-partner/src/app.js'
);

const adminAppPath = path.join(
  root,
  'apps/find/apps/zfind-admin/src/app.js'
);

const migrationsDir = path.join(
  root,
  'infrastructure/supabase/migrations'
);

const admin = fs.readFileSync(adminPath, 'utf8');
const partner = fs.readFileSync(partnerPath, 'utf8');
const adminApp = fs.readFileSync(adminAppPath, 'utf8');

const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter(name => name.endsWith('.sql'))
  .sort();

const migrations = migrationFiles
  .map(name =>
    fs.readFileSync(
      path.join(migrationsDir, name),
      'utf8'
    )
  )
  .join('\n');


function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '');
}

const executableMigrationText =
  stripSqlComments(migrations);


function walk(dir) {
  const out = [];

  for (const entry of fs.readdirSync(dir, {
    withFileTypes: true
  })) {
    const p = path.join(dir, entry.name);

    if (
      entry.name === 'dist' ||
      entry.name === 'node_modules' ||
      entry.name === 'vendor-supabase.js'
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      out.push(...walk(p));
    } else if (
      entry.isFile() &&
      /\.(js|html|css)$/.test(entry.name)
    ) {
      out.push(p);
    }
  }

  return out;
}


const browserSources = [
  path.join(root, 'apps/find/apps/zfind-web/src'),
  path.join(root, 'apps/find/apps/zfind-admin/src'),
  path.join(root, 'apps/find/apps/zfind-partner/src')
]
  .flatMap(dir => walk(dir))
  .map(file => fs.readFileSync(file, 'utf8'))
  .join('\n');


console.log(
  '\n=== Z FIND — FINAL PRODUCTION SURFACE AUDIT ==='
);


/* --------------------------------------------------------- */
/* Secrets / browser authority                               */
/* --------------------------------------------------------- */

check(
  !/\bSUPABASE_SERVICE_ROLE(?:_KEY)?\b/i.test(
    browserSources
  ),
  'No Supabase service-role secret identifier in browser source'
);


/* --------------------------------------------------------- */
/* Partner client boundary                                   */
/* --------------------------------------------------------- */

check(
  !/\.from\(['"][^'"]+['"]\)\.(insert|update|delete|upsert)\(/i
    .test(partner),
  'Partner UI performs no direct table mutations'
);

check(
  !partner.includes('setListingStatus('),
  'Partner UI cannot directly drive Listing lifecycle'
);

check(
  !partner.includes('setRepresentationStatus('),
  'Partner UI cannot directly drive Representation lifecycle'
);

check(
  partner.includes('removeAssetForPartner'),
  'Partner removal uses safe server-owned workflow'
);

check(
  partner.includes('savePartnerListingContent'),
  'Partner content uses server-owned command'
);

check(
  partner.includes('uploadPartnerListingMedia') &&
  partner.includes('uploadPartnerDevelopmentMedia'),
  'Partner media upload uses ownership-scoped service'
);

check(
  partner.includes('reorderPartnerListingMedia') &&
  partner.includes('reorderPartnerDevelopmentMedia'),
  'Partner media reorder uses dedicated commands'
);

check(
  partner.includes('setPartnerListingMediaCover') &&
  partner.includes('setPartnerDevelopmentMediaCover'),
  'Partner cover mutation uses dedicated commands'
);

check(
  partner.includes('deletePartnerListingMedia') &&
  partner.includes('deletePartnerDevelopmentMedia'),
  'Partner media deletion uses dedicated commands'
);


/* --------------------------------------------------------- */
/* Partner server commands                                   */
/* --------------------------------------------------------- */

[
  'zfind_partner_create_property',
  'zfind_partner_create_development',
  'zfind_create_property',
  'zfind_update_asset',
  'zfind_replace_features',
  'zfind_partner_remove_asset',
  'zfind_partner_ensure_draft_listing',
  'zfind_partner_upsert_listing_content',
  'zfind_partner_reorder_media',
  'zfind_partner_set_media_cover',
  'zfind_partner_unlink_media'
].forEach(name => {
  check(
    admin.includes(`'${name}'`) ||
    migrations.includes(name),
    `Partner command present: ${name}`
  );
});


/* --------------------------------------------------------- */
/* Admin compound/lifecycle boundary                         */
/* --------------------------------------------------------- */

[
  'zfind_admin_create_initial_listing',
  'zfind_admin_delete_asset',
  'zfind_admin_duplicate_asset',
  'zfind_admin_transition_listing',
  'zfind_admin_transition_representation'
].forEach(name => {
  check(
    admin.includes(`'${name}'`),
    `Admin service uses server command: ${name}`
  );
});

check(
  admin.includes("'zfind_replace_features'"),
  'Feature replacement is atomic/server-owned'
);

check(
  admin.includes("'zfind_admin_set_media_cover'"),
  'Admin cover selection is atomic/server-owned'
);

check(
  admin.includes("'zfind_admin_reorder_media'"),
  'Admin media reorder is atomic/server-owned'
);


/* --------------------------------------------------------- */
/* Lifecycle UI                                              */
/* --------------------------------------------------------- */

check(
  adminApp.includes('setListingStatus') ||
  adminApp.includes('transition'),
  'Admin UI retains Listing lifecycle controls'
);

check(
  adminApp.includes('setRepresentationStatus') ||
  adminApp.includes('transition'),
  'Admin UI retains Representation lifecycle controls'
);


/* --------------------------------------------------------- */
/* Public publication hardening                              */
/* --------------------------------------------------------- */

check(
  migrations.includes(
    'create policy "public read published listings"'
  ),
  'Public Listing RLS policy is explicitly defined'
);

check(
  /public read published listings[\s\S]*r\.status\s*=\s*'active'/i
    .test(migrations),
  'Public Listing requires active Representation'
);

check(
  /public read published listings[\s\S]*removed_at\s+is\s+null/i
    .test(migrations),
  'Removed target cannot remain publicly visible'
);


/* --------------------------------------------------------- */
/* Audit-history contract                                    */
/* --------------------------------------------------------- */

check(
  !/delete\s+from\s+find\.listing_state_history/i
    .test(migrations),
  'No migration deletes Listing lifecycle audit history'
);

check(
  !/delete\s+from\s+find\.representation_state_history/i
    .test(migrations),
  'No migration deletes Representation lifecycle audit history'
);

check(
  !/delete\s+from\s+find\.verification_assessments/i
    .test(migrations),
  'No mutation command deletes Verification truth'
);


/* --------------------------------------------------------- */
/* Cross-vertical safety                                     */
/* --------------------------------------------------------- */

const recentFindBoundaryMigrations = migrationFiles
  .filter(name =>
    name.includes('z_find_partner_')
  )
  .map(name =>
    fs.readFileSync(
      path.join(migrationsDir, name),
      'utf8'
    )
  )
  .join('\n');

// Cross-vertical safety must inspect executable SQL, not comments.
// A migration may explicitly document that vehicle-images is untouched;
// that sentence itself must not create a false positive.
const recentFindBoundaryExecutableSql =
  recentFindBoundaryMigrations
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '');

check(
  !recentFindBoundaryExecutableSql.includes('vehicle-images'),
  'Z Find Partner hardening does not touch Z Mobility vehicle-images'
);


/* --------------------------------------------------------- */
/* PostgreSQL syntax/security hygiene                        */
/* --------------------------------------------------------- */

const specialFormRepairName = migrationFiles
  .filter(name =>
    name.endsWith(
      '_z_find_pg_special_form_repair_v1.sql'
    )
  )
  .sort()
  .at(-1);

const specialFormRepair = specialFormRepairName
  ? fs.readFileSync(
      path.join(
        migrationsDir,
        specialFormRepairName
      ),
      'utf8'
    )
  : '';

check(
  Boolean(specialFormRepairName),
  'Forward-only PostgreSQL special-form repair migration exists'
);

check(
  specialFormRepair.includes(
    "'pg_catalog.coalesce('"
  ) &&
  specialFormRepair.includes(
    "'coalesce('"
  ) &&
  specialFormRepair.includes(
    'pg_catalog.pg_get_functiondef'
  ),
  'COALESCE defect is converged through live function definitions'
);

check(
  specialFormRepair.includes(
    "'pg_catalog.nullif('"
  ) &&
  specialFormRepair.includes(
    "'nullif('"
  ) &&
  specialFormRepair.includes(
    'pg_catalog.pg_get_functiondef'
  ),
  'NULLIF defect class is covered by forward-only live-function convergence'
);


/* --------------------------------------------------------- */
/* Historical Partner broad-policy convergence               */
/* --------------------------------------------------------- */

check(
  migrations.includes(
    'Historical Partner content/media policy convergence'
  ),
  'Historical Partner content/media bypass convergence is retained'
);


/* --------------------------------------------------------- */
/* Result                                                    */
/* --------------------------------------------------------- */


const finalSqlAudit = fs.readFileSync(
  path.join(
    root,
    'apps/find/tests/sql/final-surface-boundary.sql'
  ),
  'utf8'
);

check(
  finalSqlAudit.includes('cp.column_name::text'),
  'Final SQL audit normalizes information_schema identifiers before array comparison'
);


check(
  finalSqlAudit.includes(
    'Effective Z FIND anon write surface.'
  ) &&
  finalSqlAudit.includes(
    "'anon' = any(p.roles)"
  ) &&
  finalSqlAudit.includes(
    "'public' = any(p.roles)"
  ),
  'Final SQL audit evaluates domain-scoped effective anon RLS write authority'
);

check(
  !finalSqlAudit.includes(
    'unexpected anon public-table write privilege'
  ),
  'Final SQL audit does not confuse raw Supabase grants with effective RLS authority'
);

check(
  finalSqlAudit.includes(
    'anonymous Z Find intake path is not append-only'
  ),
  'Public Z Find intake surfaces remain append-only'
);


check(
  finalSqlAudit.includes("'seller_leads'"),
  'Final SQL audit includes seller_leads as deliberate Z Find public intake'
);

check(
  finalSqlAudit.includes(
    'expected Z Find anonymous intake INSERT policies are incomplete'
  ),
  'Final SQL audit requires all three Z Find public intake INSERT policies'
);

check(
  !finalSqlAudit.includes("'mobility_leads'"),
  'Z Find final audit does not absorb Z Mobility write surfaces'
);

console.log(
  `\nFINAL SURFACE STATIC AUDIT: ` +
  `${passed}/${passed + failed} PASSED`
);

if (failed) process.exit(1);
