'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SERVICE_PATH = path.join(
  __dirname,
  '../../apps/zfind-web/src/services/admin.js'
);

const CLIENT_PATH = path.join(
  __dirname,
  '../../apps/zfind-web/src/services/supabaseClient.js'
);

const MIGRATION_PATH = path.join(
  __dirname,
  '../../../../infrastructure/supabase/migrations/20260813020001_z_find_partner_atomic_create_v1.sql'
);

async function withService(fn) {
  const clientModule = require(CLIENT_PATH);

  const originalGet = clientModule.getSupabaseClient;
  const originalSafe = clientModule.safeQuery;

  const calls = [];

  clientModule.getSupabaseClient = () => ({
    rpc(name, args) {
      calls.push({ rpc: name, args });
      return Promise.resolve({
        data: { id: 'created-1' },
        error: null
      });
    }
  });

  clientModule.safeQuery = (run, context) => {
    const result = run();
    calls.push({ safeContext: context });
    return result;
  };

  delete require.cache[require.resolve(SERVICE_PATH)];
  const service = require(SERVICE_PATH);

  try {
    await fn(service, calls);
  } finally {
    clientModule.getSupabaseClient = originalGet;
    clientModule.safeQuery = originalSafe;
    delete require.cache[require.resolve(SERVICE_PATH)];
  }
}

function readMigration() {
  return fs.readFileSync(MIGRATION_PATH, 'utf8');
}

function normaliseSql(sql) {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getFunctionSignature(sql, functionName) {
  const pattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\s*\\(([\\s\\S]*?)\\)\\s*returns\\s+jsonb`,
    'i'
  );

  const match = sql.match(pattern);

  assert(
    match,
    `Could not find signature for ${functionName}`
  );

  return match[1];
}

function getFunctionDefinition(sql, functionName) {
  const pattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\s*\\([\\s\\S]*?\\)\\s*returns\\s+jsonb([\\s\\S]*?)\\$\\$;`,
    'i'
  );

  const match = sql.match(pattern);

  assert(
    match,
    `Could not find definition for ${functionName}`
  );

  return match[1];
}

async function run() {
  let passed = 0;

  async function test(name, fn) {
    await fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  }

  console.log('\n=== Z FIND — PARTNER ATOMIC CREATE SERVICE ===');

  await test(
    'creates Property only through the atomic Partner RPC',
    async () => {
      await withService(async (service, calls) => {
        const result = await service.createPropertyForPartner({
          subtype: 'apartment',
          typology: null,
          areaSqm: null,
          floor: null,
          zoneLiteId: null
        });

        assert.deepStrictEqual(result, {
          data: { id: 'created-1' },
          error: null
        });

        assert.deepStrictEqual(calls[0], {
          rpc: 'zfind_partner_create_property',
          args: {
            p_subtype: 'apartment',
            p_typology: null,
            p_area_sqm: null,
            p_floor: null,
            p_zone_lite_id: null
          }
        });

        assert.deepStrictEqual(calls[1], {
          safeContext: 'admin.createPropertyForPartner'
        });
      });
    }
  );

  await test(
    'creates Development only through the atomic Partner RPC',
    async () => {
      await withService(async (service, calls) => {
        const result = await service.createDevelopmentForPartner({
          name: 'Development One',
          zoneLiteId: null
        });

        assert.deepStrictEqual(result, {
          data: { id: 'created-1' },
          error: null
        });

        assert.deepStrictEqual(calls[0], {
          rpc: 'zfind_partner_create_development',
          args: {
            p_name: 'Development One',
            p_zone_lite_id: null
          }
        });

        assert.deepStrictEqual(calls[1], {
          safeContext: 'admin.createDevelopmentForPartner'
        });
      });
    }
  );

  console.log('\n=== Z FIND — PARTNER ATOMIC CREATE SECURITY BOUNDARY ===');

  const migration = readMigration();
  const sql = normaliseSql(migration);

  await test(
    'removes direct Partner INSERT bootstrap policies',
    async () => {
      assert(
        sql.includes(
          'drop policy if exists "partner: create properties" on public.properties;'
        )
      );

      assert(
        sql.includes(
          'drop policy if exists "partner: create developments" on public.developments;'
        )
      );
    }
  );

  await test(
    'removes direct Partner mutation of Representations',
    async () => {
      assert(
        sql.includes(
          'drop policy if exists "partner: manage own representations" on public.representations;'
        )
      );

      assert(
        sql.includes(
          'create policy "partner: view own representations" on public.representations for select to authenticated'
        )
      );
    }
  );

  await test(
    'atomic create commands are SECURITY DEFINER with hardened search_path',
    async () => {
      for (const functionName of [
        'zfind_partner_create_property',
        'zfind_partner_create_development'
      ]) {
        const definition = normaliseSql(
          getFunctionDefinition(migration, functionName)
        );

        assert(
          definition.includes('security definer'),
          `${functionName} must remain SECURITY DEFINER`
        );

        assert(
          definition.includes('set search_path = pg_catalog'),
          `${functionName} must keep search_path = pg_catalog`
        );
      }
    }
  );

  await test(
    'Partner ownership is never accepted as an RPC argument',
    async () => {
      for (const functionName of [
        'zfind_partner_create_property',
        'zfind_partner_create_development'
      ]) {
        const signature = getFunctionSignature(
          migration,
          functionName
        );

        assert(
          !/\bpartner_id\b/i.test(signature),
          `${functionName} must never accept partner_id from the caller`
        );
      }
    }
  );

  await test(
    'Development command rejects blank names',
    async () => {
      const definition = normaliseSql(
        getFunctionDefinition(
          migration,
          'zfind_partner_create_development'
        )
      );

      assert(
        definition.includes(
          "if p_name is null or btrim(p_name) = '' then"
        )
      );

      assert(
        definition.includes(
          "raise exception 'development name is required'"
        )
      );
    }
  );

  await test(
    'new Representations always start as proposed',
    async () => {
      const propertyDefinition = normaliseSql(
        getFunctionDefinition(
          migration,
          'zfind_partner_create_property'
        )
      );

      const developmentDefinition = normaliseSql(
        getFunctionDefinition(
          migration,
          'zfind_partner_create_development'
        )
      );

      assert(
        propertyDefinition.includes("'proposed'")
      );

      assert(
        developmentDefinition.includes("'proposed'")
      );
    }
  );

  await test(
    'RPC execution is granted to authenticated and not anon',
    async () => {
      assert(
        sql.includes(
          'grant execute on function public.zfind_partner_create_property( text, text, numeric, integer, uuid ) to authenticated;'
        )
      );

      assert(
        sql.includes(
          'grant execute on function public.zfind_partner_create_development( text, uuid ) to authenticated;'
        )
      );

      assert(
        !sql.includes(
          'grant execute on function public.zfind_partner_create_property( text, text, numeric, integer, uuid ) to anon;'
        )
      );

      assert(
        !sql.includes(
          'grant execute on function public.zfind_partner_create_development( text, uuid ) to anon;'
        )
      );
    }
  );

  console.log(`\nRESULT: ${passed} passed, 0 failed\n`);
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
