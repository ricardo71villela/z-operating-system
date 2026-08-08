#!/usr/bin/env node
/* ============================================================
   Z FIND — CONNECTIVITY TEST (run this locally, not in any sandbox)
   ============================================================
   Usage:
     SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/test-connectivity.js

   Or, with a .env file present (see .env.example):
     node -r dotenv/config scripts/test-connectivity.js

   What it does:
   - Connects using ONLY the Project URL and publishable key.
   - Performs a single, safe, READ-ONLY query against `zones_lite`
     (public reference data, granted to anon by migration 0001 —
     the least sensitive possible table to probe with).
   - Never writes, never uses service_role, never touches production
     data (this is the staging project only, per the CTO's rules).
   - Exits 0 on success, non-zero on any failure — safe to use as a
     pass/fail gate in a script or CI step later.
   ============================================================ */

const { getSupabaseClient, safeQuery } = require('../apps/zfind-web/src/services/supabaseClient');

async function main() {
  console.log('Z Find — Supabase connectivity test');
  console.log('Target:', process.env.SUPABASE_URL || '(not set)');
  console.log('');

  let client;
  try {
    client = getSupabaseClient();
  } catch (e) {
    console.error('FAILED: could not construct Supabase client.');
    console.error(e.message);
    process.exit(1);
  }

  const result = await safeQuery(
    () => client.from('zones_lite').select('id, name, city, country_iso').limit(5),
    'connectivity-test'
  );

  if (result.error) {
    console.error('FAILED:', result.error.type);
    console.error(result.error.message);
    if (result.error.type === 'malformed_response') {
      console.error('');
      console.error('This usually means migration 0001 has not been applied yet —');
      console.error('the "zones_lite" table may not exist. Run the migration in the');
      console.error('Supabase SQL Editor first (see the execution guide).');
    }
    process.exit(1);
  }

  console.log('SUCCESS — connected and read from zones_lite.');
  console.log(`Rows returned: ${result.data.length} (0 is fine — table can be empty).`);
  console.log(JSON.stringify(result.data, null, 2));
  process.exit(0);
}

main();
