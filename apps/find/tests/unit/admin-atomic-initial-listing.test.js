'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;

async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ✅ ${name}`);
}

const supabaseModulePath = require.resolve(
  '../../apps/zfind-web/src/services/supabaseClient'
);
const imageOptimizePath = require.resolve(
  '../../apps/zfind-web/src/services/image-optimize'
);
const adminModulePath = require.resolve(
  '../../apps/zfind-web/src/services/admin'
);

const rpcCalls = [];
const directTableCalls = [];

const fakeClient = {
  rpc(name, payload) {
    rpcCalls.push({ name, payload });
    return Promise.resolve({
      data: {
        id: 'listing-test-1',
        representation_id: 'representation-test-1',
        status: 'draft'
      },
      error: null
    });
  },

  from(table) {
    directTableCalls.push(table);
    throw new Error(
      `Unexpected direct table access during createInitialListing: ${table}`
    );
  }
};

const fakeSupabaseModule = {
  getSupabaseClient() {
    return fakeClient;
  },

  async safeQuery(queryFn) {
    try {
      const result = await queryFn();

      if (result && result.error) {
        return { data: null, error: result.error };
      }

      return {
        data: result ? result.data : null,
        error: null
      };
    } catch (error) {
      return {
        data: null,
        error: {
          message: error.message
        }
      };
    }
  },

  async resolveMediaUrl(value) {
    return value;
  }
};

require.cache[supabaseModulePath] = {
  id: supabaseModulePath,
  filename: supabaseModulePath,
  loaded: true,
  exports: fakeSupabaseModule
};

require.cache[imageOptimizePath] = {
  id: imageOptimizePath,
  filename: imageOptimizePath,
  loaded: true,
  exports: {}
};

delete require.cache[adminModulePath];
const admin = require(adminModulePath);

const adminSource = fs.readFileSync(adminModulePath, 'utf8');

const migrationPath = path.resolve(
  __dirname,
  '../../../../infrastructure/supabase/migrations/20260813143000_z_find_admin_atomic_initial_listing_v1.sql'
);

const migration = fs.readFileSync(migrationPath, 'utf8');
const normalizedSql = migration
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

(async () => {
  console.log(
    '\n=== Z FIND — ADMIN ATOMIC INITIAL LISTING SERVICE ==='
  );

  await test(
    'creates Property initial Listing only through the atomic Admin RPC',
    async () => {
      rpcCalls.length = 0;
      directTableCalls.length = 0;

      const result = await admin.createInitialListing(
        'property',
        'property-1',
        'partner-1'
      );

      assert.strictEqual(result.error, null);
      assert.strictEqual(rpcCalls.length, 1);
      assert.strictEqual(
        rpcCalls[0].name,
        'zfind_admin_create_initial_listing'
      );
      assert.deepStrictEqual(rpcCalls[0].payload, {
        p_kind: 'property',
        p_owner_id: 'property-1',
        p_partner_id: 'partner-1'
      });
      assert.deepStrictEqual(directTableCalls, []);
    }
  );

  await test(
    'creates Development initial Listing through the same atomic Admin RPC',
    async () => {
      rpcCalls.length = 0;
      directTableCalls.length = 0;

      const result = await admin.createInitialListing(
        'development',
        'development-1',
        'partner-2'
      );

      assert.strictEqual(result.error, null);
      assert.strictEqual(rpcCalls.length, 1);
      assert.strictEqual(
        rpcCalls[0].name,
        'zfind_admin_create_initial_listing'
      );
      assert.deepStrictEqual(rpcCalls[0].payload, {
        p_kind: 'development',
        p_owner_id: 'development-1',
        p_partner_id: 'partner-2'
      });
      assert.deepStrictEqual(directTableCalls, []);
    }
  );

  await test(
    'rejects invalid kind before reaching Supabase',
    async () => {
      rpcCalls.length = 0;
      directTableCalls.length = 0;

      const result = await admin.createInitialListing(
        'invalid-kind',
        'owner-1',
        'partner-1'
      );

      assert(result.error);
      assert.strictEqual(rpcCalls.length, 0);
      assert.deepStrictEqual(directTableCalls, []);
    }
  );

  await test(
    'rejects missing owner or partner before reaching Supabase',
    async () => {
      rpcCalls.length = 0;

      const missingOwner = await admin.createInitialListing(
        'property',
        null,
        'partner-1'
      );

      const missingPartner = await admin.createInitialListing(
        'property',
        'property-1',
        null
      );

      assert(missingOwner.error);
      assert(missingPartner.error);
      assert.strictEqual(rpcCalls.length, 0);
    }
  );

  console.log(
    '\n=== Z FIND — ADMIN ATOMIC INITIAL LISTING SECURITY BOUNDARY ==='
  );

  await test(
    'service contains no direct Representation or Listing bootstrap writes',
    async () => {
      const start = adminSource.indexOf(
        'async function createInitialListing('
      );
      const end = adminSource.indexOf(
        '/* ---------------- Leads',
        start
      );

      assert(start >= 0, 'createInitialListing() not found');
      assert(end > start, 'createInitialListing() boundary not found');

      const source = adminSource.slice(start, end);

      assert(
        source.includes(
          "client.rpc('zfind_admin_create_initial_listing'"
        )
      );

      assert(
        !source.includes(".from('representations')")
      );

      assert(
        !source.includes(".from('listings')")
      );
    }
  );

  await test(
    'RPC is Admin-only and hardened as SECURITY DEFINER',
    async () => {
      assert(
        normalizedSql.includes('security definer')
      );
      assert(
        normalizedSql.includes(
          'set search_path = pg_catalog'
        )
      );
      assert(
        normalizedSql.includes(
          "from public.profiles p where p.id = auth.uid() and p.role = 'admin'"
        )
      );
      assert(
        normalizedSql.includes(
          "raise exception 'admin authentication required'"
        )
      );
    }
  );

  await test(
    'bootstrap serializes on the represented target and refuses duplicate initial Listing',
    async () => {
      assert(
        normalizedSql.includes(
          'from public.properties p where p.id = p_owner_id for update'
        )
      );

      assert(
        normalizedSql.includes(
          'from public.developments d where d.id = p_owner_id for update'
        )
      );

      assert(
        normalizedSql.includes(
          "raise exception 'initial listing already exists for this target'"
        )
      );
    }
  );

  await test(
    'RPC safely reuses one eligible orphan Representation and rejects ambiguous ownership',
    async () => {
      assert(
        normalizedSql.includes(
          'if v_rep_count > 1 then'
        )
      );

      assert(
        normalizedSql.includes(
          'if v_rep_count = 1 then'
        )
      );

      assert(
        normalizedSql.includes(
          'select r.* into v_rep'
        )
      );

      assert(
        normalizedSql.includes(
          'if v_rep.partner_id <> p_partner_id then'
        )
      );

      assert(
        normalizedSql.includes(
          "if v_rep.status not in ('proposed', 'active') then"
        )
      );
    }
  );

  await test(
    'new graph starts as proposed Representation plus draft EUR Listing',
    async () => {
      assert(
        normalizedSql.includes(
          'insert into public.representations'
        )
      );

      assert(
        normalizedSql.includes(
          'insert into public.listings'
        )
      );

      assert(
        normalizedSql.includes(
          "'proposed'"
        )
      );

      assert(
        normalizedSql.includes(
          "'standard', 0, 'eur', 'draft'"
        )
      );
    }
  );

  await test(
    'RPC execution is exposed to authenticated but not anon',
    async () => {
      assert(
        normalizedSql.includes(
          'from public, anon, authenticated, service_role'
        )
      );

      assert(
        normalizedSql.includes(
          'grant execute on function public.zfind_admin_create_initial_listing'
        )
      );

      assert(
        normalizedSql.includes(
          'to authenticated'
        )
      );
    }
  );

  console.log(
    `\nRESULT: ${passed} passed, 0 failed`
  );
})().catch(error => {
  console.error('\n❌ TEST FAILED');
  console.error(error);
  process.exit(1);
});
