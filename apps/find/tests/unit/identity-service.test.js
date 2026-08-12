'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SERVICE_PATH = path.join(
  __dirname,
  '../../apps/zfind-web/src/services/identity.js'
);

const source = fs.readFileSync(
  SERVICE_PATH,
  'utf8'
);

function executableSource(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

function plain(value) {
  return JSON.parse(
    JSON.stringify(value)
  );
}

function loadService({
  rpcResponder
} = {}) {
  const rpcCalls = [];
  const safeCalls = [];

  const defaultResponder = () => ({
    data: {
      profile_id: 'profile-local',
      zos_person_id: null,
      binding_status: 'local_only',
      linked_at: null
    },
    error: null
  });

  const responder =
    rpcResponder || defaultResponder;

  const client = {
    rpc(name, args) {
      rpcCalls.push({
        name,
        args
      });

      return Promise.resolve(
        responder(name, args)
      );
    }
  };

  const supabaseClient = {
    getSupabaseClient() {
      return client;
    },

    async safeQuery(
      fn,
      context,
      options
    ) {
      safeCalls.push({
        context,
        options
      });

      return fn();
    }
  };

  const window = {
    ZFindServices: {
      supabaseClient
    }
  };

  const context = vm.createContext({
    window,
    console
  });

  vm.runInContext(
    source,
    context
  );

  return {
    identity:
      window.ZFindServices.identity,
    rpcCalls,
    safeCalls
  };
}

async function run() {
  let passed = 0;

  async function test(name, fn) {
    await fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  }

  console.log(
    '\n=== Z FIND — IDENTITY SERVICE / CANONICAL RPC ==='
  );

  await test(
    'reads local-only Find Identity through the canonical RPC',
    async () => {
      const {
        identity,
        rpcCalls,
        safeCalls
      } = loadService();

      const result =
        await identity.getCurrentIdentityBinding();

      assert.deepStrictEqual(
        plain(result),
        {
          data: {
            profile_id:
              'profile-local',
            zos_person_id: null,
            binding_status:
              'local_only',
            linked_at: null
          },
          error: null
        }
      );

      assert.deepStrictEqual(
        plain(rpcCalls),
        [
          {
            name:
              'zfind_current_identity_binding'
          }
        ]
      );

      assert.strictEqual(
        safeCalls.length,
        1
      );

      assert.strictEqual(
        safeCalls[0].context,
        'identity.getCurrentIdentityBinding'
      );
    }
  );

  await test(
    'preserves a linked canonical Person distinct from the local profile UUID',
    async () => {
      const {
        identity
      } = loadService({
        rpcResponder: () => ({
          data: {
            profile_id:
              '11111111-1111-1111-1111-111111111111',
            zos_person_id:
              '22222222-2222-2222-2222-222222222222',
            binding_status:
              'linked',
            linked_at:
              '2026-08-12T12:00:00Z'
          },
          error: null
        })
      });

      const result =
        await identity.getCurrentIdentityBinding();

      assert.strictEqual(
        result.error,
        null
      );

      assert.strictEqual(
        result.data.profile_id,
        '11111111-1111-1111-1111-111111111111'
      );

      assert.strictEqual(
        result.data.zos_person_id,
        '22222222-2222-2222-2222-222222222222'
      );

      assert.notStrictEqual(
        result.data.profile_id,
        result.data.zos_person_id,
        'Local profile UUID must never become the canonical Person UUID by derivation'
      );

      assert.strictEqual(
        result.data.binding_status,
        'linked'
      );
    }
  );

  await test(
    'propagates canonical RPC errors instead of manufacturing Identity data',
    async () => {
      const expectedError = {
        code: '42501',
        message:
          'authentication required'
      };

      const {
        identity,
        rpcCalls
      } = loadService({
        rpcResponder: () => ({
          data: null,
          error: expectedError
        })
      });

      const result =
        await identity.getCurrentIdentityBinding();

      assert.deepStrictEqual(
        plain(result),
        {
          data: null,
          error: expectedError
        }
      );

      assert.strictEqual(
        rpcCalls.length,
        1
      );
    }
  );

  await test(
    'adapter remains read-only and cannot create/link a canonical identity',
    async () => {
      const executable =
        executableSource(source);

      assert(
        !/\.from\s*\(/.test(
          executable
        ),
        'Identity adapter must not directly access persistence tables'
      );

      assert(
        !/\.insert\s*\(/.test(
          executable
        )
      );

      assert(
        !/\.update\s*\(/.test(
          executable
        )
      );

      assert(
        !/\.delete\s*\(/.test(
          executable
        )
      );

      assert(
        !/ensure_current_identity_binding/i.test(
          executable
        ),
        'Read adapter must not automatically link Identity'
      );

      assert(
        !/require\s*\(\s*['"]\.\/auth['"]\s*\)/.test(
          executable
        ),
        'Identity ownership is enforced by the database RPC, not browser profile lookup'
      );
    }
  );

  console.log(
    `\nRESULT: ${passed} passed, 0 failed\n`
  );
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
