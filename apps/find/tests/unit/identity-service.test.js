'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(
  path.join(__dirname, '../../apps/zfind-web/src/services/identity.js'),
  'utf8'
);

function loadIdentityService({ profileResult, queryResult }) {
  const calls = [];

  const query = {
    select(columns) {
      calls.push(['select', columns]);
      return this;
    },
    eq(column, value) {
      calls.push(['eq', column, value]);
      return this;
    },
    single() {
      calls.push(['single']);
      return Promise.resolve(queryResult);
    }
  };

  const client = {
    from(table) {
      calls.push(['from', table]);
      return query;
    }
  };

  const safeQuery = async (queryFn, context) => {
    calls.push(['safeQuery', context]);
    return queryFn();
  };

  const context = {
    window: {
      ZFindServices: {
        supabaseClient: {
          getSupabaseClient: () => client,
          safeQuery
        },
        auth: {
          getCurrentProfile: async () => profileResult
        }
      }
    },
    console
  };

  context.window.window = context.window;

  vm.runInNewContext(source, context, {
    filename: 'identity.js'
  });

  return {
    identity: context.window.ZFindServices.identity,
    calls
  };
}

async function run() {
  let passed = 0;

  async function test(name, fn) {
    await fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  }

  console.log('\n=== Z FIND — IDENTITY SERVICE TESTS ===');

  await test('reads the Identity Bridge for the authenticated local profile', async () => {
    const expected = {
      profile_id: 'profile-123',
      zos_person_id: 'person-456',
      binding_status: 'linked',
      linked_at: '2026-08-11T18:00:00Z'
    };

    const { identity, calls } = loadIdentityService({
      profileResult: {
        data: {
          id: 'profile-123',
          partner_id: null,
          role: 'admin'
        },
        error: null
      },
      queryResult: {
        data: expected,
        error: null
      }
    });

    const result = await identity.getCurrentIdentityBinding();

    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(result)),
      { data: expected, error: null }
    );

    assert.deepStrictEqual(calls, [
      ['safeQuery', 'identity.getCurrentIdentityBinding'],
      ['from', 'identity_bindings'],
      ['select', 'profile_id, zos_person_id, binding_status, linked_at'],
      ['eq', 'profile_id', 'profile-123'],
      ['single']
    ]);
  });

  await test('allows a local-only profile with no ZOS Person yet', async () => {
    const { identity } = loadIdentityService({
      profileResult: {
        data: {
          id: 'profile-local',
          partner_id: 'partner-1',
          role: 'partner'
        },
        error: null
      },
      queryResult: {
        data: {
          profile_id: 'profile-local',
          zos_person_id: null,
          binding_status: 'local_only',
          linked_at: null
        },
        error: null
      }
    });

    const result = await identity.getCurrentIdentityBinding();

    assert.strictEqual(result.error, null);
    assert.strictEqual(result.data.profile_id, 'profile-local');
    assert.strictEqual(result.data.zos_person_id, null);
    assert.strictEqual(result.data.binding_status, 'local_only');
  });

  await test('propagates authentication/profile errors without querying Identity', async () => {
    const profileError = {
      type: 'authorization_failure',
      context: 'auth.getCurrentProfile',
      message: 'No active session.'
    };

    const { identity, calls } = loadIdentityService({
      profileResult: {
        data: null,
        error: profileError
      },
      queryResult: {
        data: null,
        error: null
      }
    });

    const result = await identity.getCurrentIdentityBinding();

    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(result)),
      { data: null, error: profileError }
    );

    assert.strictEqual(
      calls.some(call => call[0] === 'from'),
      false,
      'Identity table must not be queried when authentication/profile resolution failed'
    );
  });

  await test('never derives or invents a ZOS Person id from profiles.id', async () => {
    const { identity } = loadIdentityService({
      profileResult: {
        data: {
          id: 'profile-789',
          partner_id: null,
          role: 'admin'
        },
        error: null
      },
      queryResult: {
        data: {
          profile_id: 'profile-789',
          zos_person_id: null,
          binding_status: 'local_only',
          linked_at: null
        },
        error: null
      }
    });

    const result = await identity.getCurrentIdentityBinding();

    assert.strictEqual(result.data.profile_id, 'profile-789');
    assert.strictEqual(result.data.zos_person_id, null);
  });

  console.log(`\nRESULT: ${passed} passed, 0 failed\n`);
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
