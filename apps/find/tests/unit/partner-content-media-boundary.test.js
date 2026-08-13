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

const migrationDir = path.join(
  root,
  'infrastructure',
  'supabase',
  'migrations'
);

const migrationName = fs
  .readdirSync(migrationDir)
  .filter(name =>
    name.endsWith(
      '_z_find_partner_content_media_boundary_v1.sql'
    )
  )
  .sort()
  .at(-1);

if (!migrationName) {
  throw new Error(
    'Partner content/media migration not found'
  );
}

const sql = fs.readFileSync(
  path.join(migrationDir, migrationName),
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
  '\n=== Z FIND — PARTNER CONTENT + MEDIA COMPLETE BOUNDARY ==='
);

check(
  /zfind_partner_controls_listing[\s\S]*security definer[\s\S]*set search_path = pg_catalog/i.test(sql),
  'Listing ownership is server-derived'
);

check(
  /zfind_partner_ensure_draft_listing[\s\S]*security definer[\s\S]*set search_path = pg_catalog/i.test(sql),
  'Partner Draft Listing bootstrap is server-owned'
);

check(
  sql.includes("'draft'") &&
  sql.includes("'standard'") &&
  sql.includes("'EUR'"),
  'Partner authoring Listing starts as draft and cannot self-publish'
);

check(
  /zfind_partner_upsert_listing_content[\s\S]*security definer/i.test(sql),
  'Content mutation is server-owned'
);

check(
  !/zfind_partner_upsert_listing_content[\s\S]{0,2500}translation_status\s*=/i.test(sql),
  'Partner cannot set translation_status'
);

check(
  !/zfind_partner_upsert_listing_content[\s\S]{0,2500}content_source\s*=/i.test(sql),
  'Partner cannot set content_source'
);

check(
  sql.includes('Locale is not enabled in Z Find'),
  'Partner content uses configured enabled languages'
);

check(
  /zfind_partner_can_manage_media_path[\s\S]*security definer/i.test(sql),
  'Storage paths are ownership-checked server-side'
);

check(
  sql.includes("'listings/' || l.id::text || '/%'") &&
  sql.includes("'developments/' || d.id::text || '/%'"),
  'Storage ownership is scoped by Listing/Development UUID path'
);

check(
  sql.includes(
    'create policy "partner: upload own listing-media files"'
  ),
  'Partner Storage upload policy exists'
);

check(
  sql.includes(
    'create policy "partner: delete own listing-media files"'
  ),
  'Partner Storage deletion is ownership-scoped'
);

check(
  sql.includes(
    'create policy "partner: insert own media assets"'
  ),
  'Partner may register media only under an owned path'
);

check(
  sql.includes(
    'create policy "partner: link own listing media"'
  ) &&
  sql.includes(
    'create policy "partner: link own development media"'
  ),
  'Media association INSERT is cross-owner protected'
);

check(
  /zfind_partner_reorder_media[\s\S]*security definer/i.test(sql),
  'Media reorder is atomic/server-owned'
);

check(
  sql.includes(
    'complete Listing gallery exactly once'
  ) &&
  sql.includes(
    'complete Development gallery exactly once'
  ),
  'Reorder requires exact complete gallery'
);

check(
  /zfind_partner_set_media_cover[\s\S]*security definer/i.test(sql),
  'Cover selection is atomic/server-owned'
);

check(
  /zfind_partner_unlink_media[\s\S]*security definer/i.test(sql),
  'Media unlink is server-owned'
);

check(
  sql.includes(
    "'storage_path', v_storage_path"
  ),
  'Media deletion path is resolved by the server'
);

check(
  !/zfind_partner_unlink_media\s*\([^)]*p_storage_path/i.test(sql),
  'Browser cannot supply arbitrary storage path for deletion'
);

check(
  /create policy "public read published listings"[\s\S]*r\.status = 'active'/i.test(sql),
  'Anon published Listing also requires active Representation'
);

check(
  /create policy "public read published listings"[\s\S]*removed_at is null/i.test(sql),
  'Removed target cannot remain publicly visible'
);

check(
  admin.includes(
    "client.rpc('zfind_partner_ensure_draft_listing'"
  ),
  'Partner Draft Listing service uses RPC'
);

check(
  admin.includes(
    "client.rpc('zfind_partner_upsert_listing_content'"
  ),
  'Partner content service uses RPC'
);

check(
  admin.includes(
    "client.rpc('zfind_partner_reorder_media'"
  ),
  'Partner reorder service uses RPC'
);

check(
  admin.includes(
    "client.rpc('zfind_partner_set_media_cover'"
  ),
  'Partner cover service uses RPC'
);

check(
  admin.includes(
    "client.rpc('zfind_partner_unlink_media'"
  ),
  'Partner media delete uses RPC'
);

check(
  partner.includes(
    'loadPartnerListingWorkspace(kind, id)'
  ),
  'Partner detail loads Listing workspace'
);

check(
  partner.includes('Create draft listing'),
  'Partner UI can establish a Draft Listing'
);

check(
  partner.includes('Descriptions') &&
  partner.includes('Photos'),
  'Partner UI exposes content and media'
);

check(
  partner.includes(
    'Publication/lifecycle approval remains controlled by Z Find.'
  ),
  'Partner UI makes publication authority explicit'
);

check(
  partner.includes(
    'savePartnerListingContent'
  ),
  'Partner UI saves only through secured content service'
);

check(
  partner.includes(
    'uploadPartnerListingMedia'
  ) &&
  partner.includes(
    'uploadPartnerDevelopmentMedia'
  ),
  'Partner UI supports owned Listing/Development media upload'
);

check(
  !/zfind-partner\/src\/app\.js[\s\S]*\.from\([^)]*\)\.(insert|update|delete|upsert)/i.test(
    'zfind-partner/src/app.js\n' + partner
  ),
  'Partner UI has no direct table mutations'
);


check(
  !sql.includes('pg_catalog.coalesce('),
  'PostgreSQL special-form syntax remains valid'
);

check(
  sql.includes(
    'Historical Partner content/media policy convergence'
  ) &&
  sql.includes("'listing_content'") &&
  sql.includes("'listing_media'") &&
  sql.includes("'development_media'"),
  'Historical broad Partner content/media policies are converged forward-only'
);

check(
  sql.includes(
    'create policy "partner: view own listing_content"'
  ) &&
  sql.includes(
    'create policy "partner: view own listing_media"'
  ) &&
  sql.includes(
    'create policy "partner: view own development_media"'
  ),
  'Partner receives narrow content/media SELECT policies only'
);

console.log(
  `\nPARTNER CONTENT/MEDIA TEST: ${pass}/${pass + fail} PASSED`
);

if (fail) process.exit(1);
