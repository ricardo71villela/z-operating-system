'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(
  path.join(__dirname, '../../apps/zfind-web/src/services/registry.js'),
  'utf8'
);

function loadRegistryService({ queryResult }) {
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
        }
      }
    },
    console
  };

  context.window.window = context.window;

  vm.runInNewContext(source, context, {
    filename: 'registry.js'
  });

  return {
    registry: context.window.ZFindServices.registry,
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

  console.log('\n=== Z FIND — REGISTRY SERVICE TESTS ===');

  await test('maps every supported Registry entity type to its local UUID column', async () => {
    const cases = [
      ['organisation', 'organisation_id'],
      ['partner', 'partner_id'],
      ['property', 'property_id'],
      ['development', 'development_id']
    ];

    for (const [entityType, targetColumn] of cases) {
      const localId = `${entityType}-123`;

      const { registry, calls } = loadRegistryService({
        queryResult: {
          data: {
            id: 'binding-1',
            entity_type: entityType,
            [targetColumn]: localId,
            zos_registry_id: null,
            binding_status: 'local_only',
            external_references: {},
            linked_at: null
          },
          error: null
        }
      });

      const result = await registry.getRegistryBinding(entityType, localId);

      assert.strictEqual(result.error, null);
      assert.strictEqual(result.data.entity_type, entityType);
      assert.strictEqual(result.data[targetColumn], localId);

      assert.deepStrictEqual(calls, [
        ['safeQuery', 'registry.getRegistryBinding'],
        ['from', 'registry_bindings'],
        [
          'select',
          'id, entity_type, organisation_id, partner_id, property_id, development_id, ' +
          'zos_registry_id, binding_status, external_references, linked_at'
        ],
        ['eq', 'entity_type', entityType],
        ['eq', targetColumn, localId],
        ['single']
      ]);
    }
  });

  await test('allows a local-only entity with no shared ZOS Registry id yet', async () => {
    const { registry } = loadRegistryService({
      queryResult: {
        data: {
          id: 'binding-local',
          entity_type: 'property',
          organisation_id: null,
          partner_id: null,
          property_id: 'property-local',
          development_id: null,
          zos_registry_id: null,
          binding_status: 'local_only',
          external_references: {},
          linked_at: null
        },
        error: null
      }
    });

    const result = await registry.getRegistryBinding(
      'property',
      'property-local'
    );

    assert.strictEqual(result.error, null);
    assert.strictEqual(result.data.property_id, 'property-local');
    assert.strictEqual(result.data.zos_registry_id, null);
    assert.strictEqual(result.data.binding_status, 'local_only');
  });

  await test('rejects unsupported entity types without querying Registry', async () => {
    const { registry, calls } = loadRegistryService({
      queryResult: { data: null, error: null }
    });

    const result = await registry.getRegistryBinding(
      'listing',
      'listing-123'
    );

    assert.strictEqual(result.data, null);
    assert.strictEqual(result.error.type, 'validation_error');

    assert.strictEqual(
      calls.some(call => call[0] === 'from'),
      false,
      'Registry table must not be queried for unsupported entity types'
    );
  });

  await test('rejects missing local ids without querying Registry', async () => {
    const { registry, calls } = loadRegistryService({
      queryResult: { data: null, error: null }
    });

    const result = await registry.getRegistryBinding(
      'development',
      ''
    );

    assert.strictEqual(result.data, null);
    assert.strictEqual(result.error.type, 'validation_error');

    assert.strictEqual(
      calls.some(call => call[0] === 'from'),
      false,
      'Registry table must not be queried without a local entity id'
    );
  });

  await test('never derives or invents a ZOS Registry id from the local UUID', async () => {
    const { registry } = loadRegistryService({
      queryResult: {
        data: {
          id: 'binding-789',
          entity_type: 'organisation',
          organisation_id: 'organisation-789',
          partner_id: null,
          property_id: null,
          development_id: null,
          zos_registry_id: null,
          binding_status: 'local_only',
          external_references: {},
          linked_at: null
        },
        error: null
      }
    });

    const result = await registry.getRegistryBinding(
      'organisation',
      'organisation-789'
    );

    assert.strictEqual(
      result.data.organisation_id,
      'organisation-789'
    );

    assert.strictEqual(
      result.data.zos_registry_id,
      null
    );
  });

  console.log(`\nRESULT: ${passed} passed, 0 failed\n`);
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
