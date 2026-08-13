'use strict';

const assert = require('assert');
const path = require('path');

const SERVICE_PATH = path.join(__dirname, '../../apps/zfind-web/src/services/partner-dashboard.js');
const CLIENT_PATH = path.join(__dirname, '../../apps/zfind-web/src/services/supabaseClient.js');

async function withService(fn) {
  const clientModule = require(CLIENT_PATH);
  const originalGet = clientModule.getSupabaseClient;
  const originalSafe = clientModule.safeQuery;
  const calls = [];

  const query = {
    select(fields) { calls[0].select = fields; return this; },
    eq(column, value) { calls[0].eq = { column, value }; return this; },
    single() { calls[0].single = true; return Promise.resolve({ data: { id: 'partner-1', name: 'Partner One' }, error: null }); }
  };

  clientModule.getSupabaseClient = () => ({
    from(table) { calls.push({ table }); return query; }
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

async function run() {
  let passed = 0;
  async function test(name, fn) {
    await fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  }

  console.log('\n=== Z FIND — PARTNER DASHBOARD SERVICE ===');

  await test('reads only id and name for the authenticated Partner', async () => {
    await withService(async (service, calls) => {
      const result = await service.getOwnPartnerSummary('partner-1');
      assert.deepStrictEqual(result, { data: { id: 'partner-1', name: 'Partner One' }, error: null });
      assert.deepStrictEqual(calls[0], { table: 'partners', select: 'id, name', eq: { column: 'id', value: 'partner-1' }, single: true });
      assert.deepStrictEqual(calls[1], { safeContext: 'partnerDashboard.getOwnPartnerSummary' });
    });
  });

  await test('rejects a missing partnerId before persistence', async () => {
    await withService(async (service, calls) => {
      const result = await service.getOwnPartnerSummary();
      assert.strictEqual(result.data, null);
      assert.strictEqual(result.error.type, 'malformed_response');
      assert.strictEqual(calls.length, 0);
    });
  });

  console.log(`\nRESULT: ${passed} passed, 0 failed\n`);
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
