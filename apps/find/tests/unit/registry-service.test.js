'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SERVICE_PATH = path.join(
  __dirname,
  '../../apps/zfind-web/src/services/registry.js'
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

  const defaultResponder = (
    name,
    args
  ) => ({
    data: {
      binding_id:
        'binding-1',
      entity_type:
        args.p_entity_type,
      local_id:
        args.p_local_id,
      canonical_entity_type:
        null,
      canonical_entity_id:
        null,
      binding_status:
        'local_only',
      linked_at: null
    },
    error: null
  });

  const responder =
    rpcResponder ||
    defaultResponder;

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
    registry:
      window.ZFindServices.registry,
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
    '\n=== Z FIND — REGISTRY SERVICE / CANONICAL RPC ==='
  );

  await test(
    'supports every approved Registry entity type through the same deliberate RPC port',
    async () => {
      const {
        registry,
        rpcCalls,
        safeCalls
      } = loadService();

      const types = [
        'organisation',
        'partner',
        'property',
        'development'
      ];

      assert.deepStrictEqual(
        plain(
          registry.REGISTRY_ENTITY_TYPES
        ),
        types
      );

      for (
        let index = 0;
        index < types.length;
        index += 1
      ) {
        const entityType =
          types[index];

        const localId =
          `${index + 1}1111111-1111-1111-1111-111111111111`
            .slice(0, 36);

        const result =
          await registry.getRegistryBinding(
            entityType,
            localId
          );

        assert.strictEqual(
          result.error,
          null
        );

        assert.strictEqual(
          result.data.entity_type,
          entityType
        );

        assert.strictEqual(
          result.data.local_id,
          localId
        );

        const call =
          rpcCalls[index];

        assert.strictEqual(
          call.name,
          'zfind_get_registry_binding'
        );

        assert.deepStrictEqual(
          plain(call.args),
          {
            p_entity_type:
              entityType,
            p_local_id:
              localId
          }
        );

        assert.strictEqual(
          safeCalls[index]
            .options
            .allowNullData,
          true
        );
      }
    }
  );

  await test(
    'accepts absence of a shared Registry binding as a valid optional state',
    async () => {
      const {
        registry
      } = loadService({
        rpcResponder: () => ({
          data: null,
          error: null
        })
      });

      const result =
        await registry.getRegistryBinding(
          'property',
          '11111111-1111-1111-1111-111111111111'
        );

      assert.deepStrictEqual(
        plain(result),
        {
          data: null,
          error: null
        }
      );
    }
  );

  await test(
    'preserves local-only Registry state without inventing a canonical id',
    async () => {
      const localId =
        '11111111-1111-1111-1111-111111111111';

      const {
        registry
      } = loadService({
        rpcResponder: (
          name,
          args
        ) => ({
          data: {
            binding_id:
              'binding-local',
            entity_type:
              args.p_entity_type,
            local_id:
              args.p_local_id,
            canonical_entity_type:
              null,
            canonical_entity_id:
              null,
            binding_status:
              'local_only',
            linked_at: null
          },
          error: null
        })
      });

      const result =
        await registry.getRegistryBinding(
          'property',
          localId
        );

      assert.strictEqual(
        result.data.local_id,
        localId
      );

      assert.strictEqual(
        result.data
          .canonical_entity_id,
        null
      );

      assert.strictEqual(
        result.data
          .binding_status,
        'local_only'
      );
    }
  );

  await test(
    'passes through an explicitly linked canonical authority without deriving it',
    async () => {
      const localId =
        '11111111-1111-1111-1111-111111111111';

      const canonicalId =
        'canonical-property-77';

      const {
        registry
      } = loadService({
        rpcResponder: () => ({
          data: {
            binding_id:
              'binding-linked',
            entity_type:
              'property',
            local_id:
              localId,
            canonical_entity_type:
              'property',
            canonical_entity_id:
              canonicalId,
            binding_status:
              'linked',
            linked_at:
              '2026-08-12T12:00:00Z'
          },
          error: null
        })
      });

      const result =
        await registry.getRegistryBinding(
          'property',
          localId
        );

      assert.strictEqual(
        result.data
          .canonical_entity_id,
        canonicalId
      );

      assert.notStrictEqual(
        result.data
          .canonical_entity_id,
        result.data.local_id
      );
    }
  );

  await test(
    'rejects unsupported entities before any RPC call',
    async () => {
      const {
        registry,
        rpcCalls
      } = loadService();

      const result =
        await registry.getRegistryBinding(
          'listing',
          '11111111-1111-1111-1111-111111111111'
        );

      assert.strictEqual(
        result.data,
        null
      );

      assert.strictEqual(
        result.error.type,
        'validation_error'
      );

      assert.strictEqual(
        rpcCalls.length,
        0
      );
    }
  );

  await test(
    'rejects a missing local UUID before any RPC call',
    async () => {
      const {
        registry,
        rpcCalls
      } = loadService();

      const result =
        await registry.getRegistryBinding(
          'development',
          ''
        );

      assert.strictEqual(
        result.error.type,
        'validation_error'
      );

      assert.strictEqual(
        rpcCalls.length,
        0
      );
    }
  );

  await test(
    'Registry adapter remains strictly read-only',
    async () => {
      const executable =
        executableSource(source);

      assert(
        !/\.from\s*\(/.test(
          executable
        )
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
