'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SERVICE_PATH = path.join(
  __dirname,
  '../../apps/zfind-web/src/services/observation.js'
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
    name
  ) => ({
    data:
      name.startsWith(
        'zfind_list_'
      )
        ? []
        : {
            id:
              'result-1'
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
    observation:
      window.ZFindServices.observation,
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

  const entityId =
    '11111111-1111-1111-1111-111111111111';

  const sourceId =
    '22222222-2222-2222-2222-222222222222';

  const observationId =
    '33333333-3333-3333-3333-333333333333';

  console.log(
    '\n=== Z FIND — OBSERVATION SERVICE / CANONICAL RPC ==='
  );

  await test(
    'supports every approved Observation entity type',
    async () => {
      const {
        observation,
        rpcCalls
      } = loadService();

      const types = [
        'organisation',
        'partner',
        'property',
        'development',
        'listing'
      ];

      assert.deepStrictEqual(
        plain(
          observation
            .OBSERVATION_ENTITY_TYPES
        ),
        types
      );

      for (
        let index = 0;
        index < types.length;
        index += 1
      ) {
        await observation
          .listObservations(
            types[index],
            entityId,
            null
          );

        assert.strictEqual(
          rpcCalls[index].name,
          'zfind_list_observations'
        );

        assert.deepStrictEqual(
          plain(
            rpcCalls[index].args
          ),
          {
            p_entity_type:
              types[index],
            p_entity_id:
              entityId,
            p_metric_code:
              null
          }
        );
      }
    }
  );

  await test(
    'passes optional metric filter explicitly to the canonical read port',
    async () => {
      const {
        observation,
        rpcCalls,
        safeCalls
      } = loadService();

      await observation
        .listObservations(
          'property',
          entityId,
          'find.area'
        );

      assert.deepStrictEqual(
        plain(
          rpcCalls[0]
        ),
        {
          name:
            'zfind_list_observations',
          args: {
            p_entity_type:
              'property',
            p_entity_id:
              entityId,
            p_metric_code:
              'find.area'
          }
        }
      );

      assert.strictEqual(
        safeCalls[0].context,
        'observation.listObservations'
      );
    }
  );

  await test(
    'creates canonical Observation with explicit source, provenance method and observed time',
    async () => {
      const {
        observation,
        rpcCalls
      } = loadService();

      const result =
        await observation
          .createObservation({
            entityType:
              'development',
            entityId,
            metricCode:
              'find.area',
            value:
              436,
            sourceId,
            provenanceMethod:
              'official_document',
            observedAt:
              '2026-08-12T12:00:00Z',
            unit:
              'sqm',
            currencyIso:
              null,
            locale:
              'pt-PT',
            status:
              'recorded',
            confidence:
              0.95,
            validFrom:
              '2026-08-01T00:00:00Z',
            validTo:
              null,
            provenance: {
              document:
                'approved-plan'
            }
          });

      assert.strictEqual(
        result.error,
        null
      );

      assert.strictEqual(
        rpcCalls[0].name,
        'zfind_create_observation'
      );

      assert.deepStrictEqual(
        plain(
          rpcCalls[0].args
        ),
        {
          p_entity_type:
            'development',
          p_entity_id:
            entityId,
          p_metric_code:
            'find.area',
          p_value_jsonb:
            436,
          p_source_id:
            sourceId,
          p_provenance_method:
            'official_document',
          p_observed_at:
            '2026-08-12T12:00:00Z',
          p_unit:
            'sqm',
          p_currency_iso:
            null,
          p_locale:
            'pt-PT',
          p_status:
            'recorded',
          p_confidence:
            0.95,
          p_valid_from:
            '2026-08-01T00:00:00Z',
          p_valid_to:
            null,
          p_provenance: {
            document:
              'approved-plan'
          }
        }
      );
    }
  );

  await test(
    'rejects invalid creation inputs before any RPC call',
    async () => {
      const {
        observation,
        rpcCalls
      } = loadService();

      const validBase = {
        entityType:
          'property',
        entityId,
        metricCode:
          'find.area',
        value:
          100,
        sourceId,
        provenanceMethod:
          'official_document',
        observedAt:
          '2026-08-12T12:00:00Z'
      };

      const cases = [
        {
          ...validBase,
          entityType:
            'zone'
        },
        {
          ...validBase,
          entityId:
            ''
        },
        {
          ...validBase,
          metricCode:
            ''
        },
        (() => {
          const value = {
            ...validBase
          };
          delete value.value;
          return value;
        })(),
        (() => {
          const value = {
            ...validBase
          };
          delete value.sourceId;
          return value;
        })(),
        (() => {
          const value = {
            ...validBase
          };
          delete value.provenanceMethod;
          return value;
        })(),
        (() => {
          const value = {
            ...validBase
          };
          delete value.observedAt;
          return value;
        })(),
        {
          ...validBase,
          status:
            'deleted'
        },
        {
          ...validBase,
          confidence:
            -0.1
        },
        {
          ...validBase,
          confidence:
            1.1
        },
        {
          ...validBase,
          currencyIso:
            'eur'
        }
      ];

      for (const input of cases) {
        const result =
          await observation
            .createObservation(
              input
            );

        assert.strictEqual(
          result.data,
          null
        );

        assert.strictEqual(
          result.error.type,
          'validation_error'
        );
      }

      assert.strictEqual(
        rpcCalls.length,
        0,
        'Invalid Observation input must never reach the database RPC'
      );
    }
  );

  await test(
    'lifecycle command can change only status and valid_to',
    async () => {
      const {
        observation,
        rpcCalls
      } = loadService();

      const result =
        await observation
          .updateObservationLifecycle(
            observationId,
            {
              status:
                'superseded',
              validTo:
                '2026-08-12T14:00:00Z',

              value:
                999999,
              sourceId:
                'forbidden-source',
              provenance: {
                rewritten:
                  true
              }
            }
          );

      assert.strictEqual(
        result.error,
        null
      );

      assert.strictEqual(
        rpcCalls[0].name,
        'zfind_update_observation_lifecycle'
      );

      assert.deepStrictEqual(
        plain(
          rpcCalls[0].args
        ),
        {
          p_observation_id:
            observationId,
          p_status:
            'superseded',
          p_set_valid_to:
            true,
          p_valid_to:
            '2026-08-12T14:00:00Z'
        }
      );

      assert.strictEqual(
        Object.prototype
          .hasOwnProperty.call(
            rpcCalls[0].args,
            'p_value_jsonb'
          ),
        false
      );

      assert.strictEqual(
        Object.prototype
          .hasOwnProperty.call(
            rpcCalls[0].args,
            'p_source_id'
          ),
        false
      );

      assert.strictEqual(
        Object.prototype
          .hasOwnProperty.call(
            rpcCalls[0].args,
            'p_provenance'
          ),
        false
      );
    }
  );

  await test(
    'explicit null valid_to is distinguishable from not changing valid_to',
    async () => {
      const {
        observation,
        rpcCalls
      } = loadService();

      await observation
        .updateObservationLifecycle(
          observationId,
          {
            validTo:
              null
          }
        );

      assert.strictEqual(
        rpcCalls[0]
          .args
          .p_set_valid_to,
        true
      );

      assert.strictEqual(
        rpcCalls[0]
          .args
          .p_valid_to,
        null
      );
    }
  );

  await test(
    'rejects invalid or empty lifecycle mutations before RPC',
    async () => {
      const {
        observation,
        rpcCalls
      } = loadService();

      const invalidStatus =
        await observation
          .updateObservationLifecycle(
            observationId,
            {
              status:
                'deleted'
            }
          );

      const empty =
        await observation
          .updateObservationLifecycle(
            observationId,
            {}
          );

      const missingId =
        await observation
          .updateObservationLifecycle(
            '',
            {
              status:
                'validated'
            }
          );

      for (const result of [
        invalidStatus,
        empty,
        missingId
      ]) {
        assert.strictEqual(
          result.error.type,
          'validation_error'
        );
      }

      assert.strictEqual(
        rpcCalls.length,
        0
      );
    }
  );

  await test(
    'reads Observation evidence through the canonical evidence port',
    async () => {
      const {
        observation,
        rpcCalls,
        safeCalls
      } = loadService();

      await observation
        .listObservationEvidence(
          observationId
        );

      assert.deepStrictEqual(
        plain(
          rpcCalls[0]
        ),
        {
          name:
            'zfind_list_observation_evidence',
          args: {
            p_observation_id:
              observationId
          }
        }
      );

      assert.strictEqual(
        safeCalls[0].context,
        'observation.listObservationEvidence'
      );
    }
  );

  await test(
    'appends evidence with explicit payload and never rewrites existing evidence',
    async () => {
      const {
        observation,
        rpcCalls
      } = loadService();

      await observation
        .addObservationEvidence({
          observationId,
          evidenceType:
            'document',
          sourceUrl:
            'https://example.test/document',
          storagePath:
            'evidence/document.pdf',
          contentHash:
            'sha256:test',
          metadata: {
            page:
              2
          }
        });

      assert.deepStrictEqual(
        plain(
          rpcCalls[0]
        ),
        {
          name:
            'zfind_add_observation_evidence',
          args: {
            p_observation_id:
              observationId,
            p_evidence_type:
              'document',
            p_source_url:
              'https://example.test/document',
            p_storage_path:
              'evidence/document.pdf',
            p_content_hash:
              'sha256:test',
            p_metadata: {
              page:
                2
            }
          }
        }
      );
    }
  );

  await test(
    'rejects invalid evidence input before RPC',
    async () => {
      const {
        observation,
        rpcCalls
      } = loadService();

      const missingId =
        await observation
          .addObservationEvidence({
            observationId:
              '',
            evidenceType:
              'document'
          });

      const badType =
        await observation
          .addObservationEvidence({
            observationId,
            evidenceType:
              'executable'
          });

      assert.strictEqual(
        missingId.error.type,
        'validation_error'
      );

      assert.strictEqual(
        badType.error.type,
        'validation_error'
      );

      assert.strictEqual(
        rpcCalls.length,
        0
      );
    }
  );

  await test(
    'Observation adapter has no direct persistence mutation path',
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
