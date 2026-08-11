'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(
  path.join(__dirname, '../../apps/zfind-web/src/services/observation.js'),
  'utf8'
);

function loadObservationService({
  queryResult = { data: null, error: null }
} = {}) {
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
    order(column, options) {
      calls.push(['order', column, options]);
      return Promise.resolve(queryResult);
    },
    insert(row) {
      calls.push(['insert', row]);
      return this;
    },
    update(patch) {
      calls.push(['update', patch]);
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
    filename: 'observation.js'
  });

  return {
    observation: context.window.ZFindServices.observation,
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

  console.log('\n=== Z FIND — OBSERVATION SERVICE TESTS ===');

  await test('maps supported Observation entity types to their local UUID columns', async () => {
    const expected = {
      organisation: 'organisation_id',
      partner: 'partner_id',
      property: 'property_id',
      development: 'development_id',
      listing: 'listing_id'
    };

    const { observation } = loadObservationService();

    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(observation.OBSERVATION_TARGET_COLUMNS)),
      expected
    );
  });

  await test('lists observations by entity and optional metric', async () => {
    const rows = [
      {
        id: 'obs-1',
        entity_type: 'property',
        property_id: 'property-123',
        metric_code: 'real_estate.area_sqm',
        value_jsonb: 92
      }
    ];

    const { observation, calls } = loadObservationService({
      queryResult: {
        data: rows,
        error: null
      }
    });

    const result = await observation.listObservations(
      'property',
      'property-123',
      'real_estate.area_sqm'
    );

    assert.strictEqual(result.error, null);
    assert.strictEqual(result.data.length, 1);

    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(calls.filter(call => call[0] === 'eq'))),
      [
        ['eq', 'entity_type', 'property'],
        ['eq', 'property_id', 'property-123'],
        ['eq', 'metric_code', 'real_estate.area_sqm']
      ]
    );
  });

  await test('creates an observation with explicit value to value_jsonb mapping', async () => {
    const created = {
      id: 'obs-new',
      entity_type: 'development',
      development_id: 'development-77',
      metric_code: 'real_estate.gross_private_area_sqm',
      value_jsonb: 436,
      status: 'recorded'
    };

    const { observation, calls } = loadObservationService({
      queryResult: {
        data: created,
        error: null
      }
    });

    const result = await observation.createObservation({
      entityType: 'development',
      entityId: 'development-77',
      metricCode: 'real_estate.gross_private_area_sqm',
      value: 436,
      unit: 'sqm',
      sourceId: 'source-22',
      confidence: 0.95,
      provenance: {
        method: 'official_document'
      }
    });

    assert.strictEqual(result.error, null);
    assert.strictEqual(result.data.id, 'obs-new');

    const insertCall = calls.find(call => call[0] === 'insert');
    assert(insertCall, 'Expected an INSERT into data_observations');

    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(insertCall[1])),
      {
        entity_type: 'development',
        metric_code: 'real_estate.gross_private_area_sqm',
        value_jsonb: 436,
        unit: 'sqm',
        currency_iso: null,
        locale: null,
        source_id: 'source-22',
        status: 'recorded',
        confidence: 0.95,
        valid_from: null,
        valid_to: null,
        provenance: {
          method: 'official_document'
        },
        development_id: 'development-77'
      }
    );

    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(insertCall[1], 'value'),
      false,
      'Domain value must be persisted explicitly as value_jsonb'
    );
  });

  await test('rejects invalid Observation input before querying Supabase', async () => {
    const { observation, calls } = loadObservationService();

    const invalidTarget = await observation.createObservation({
      entityType: 'zone',
      entityId: 'zone-1',
      metricCode: 'real_estate.area_sqm',
      value: 50
    });

    assert.strictEqual(invalidTarget.data, null);
    assert.strictEqual(invalidTarget.error.type, 'validation_error');

    const invalidCurrency = await observation.createObservation({
      entityType: 'property',
      entityId: 'property-1',
      metricCode: 'marketplace.asking_price',
      value: 500000,
      currencyIso: 'eur'
    });

    assert.strictEqual(invalidCurrency.data, null);
    assert.strictEqual(invalidCurrency.error.type, 'validation_error');

    const missingValue = await observation.createObservation({
      entityType: 'property',
      entityId: 'property-1',
      metricCode: 'real_estate.area_sqm'
    });

    assert.strictEqual(missingValue.data, null);
    assert.strictEqual(missingValue.error.type, 'validation_error');

    assert.strictEqual(
      calls.some(call => call[0] === 'from'),
      false,
      'Invalid Observation input must not reach Supabase'
    );
  });

  await test('lifecycle update can modify only status and valid_to', async () => {
    const updated = {
      id: 'obs-123',
      status: 'superseded',
      valid_to: '2026-08-11T20:00:00Z'
    };

    const { observation, calls } = loadObservationService({
      queryResult: {
        data: updated,
        error: null
      }
    });

    const result = await observation.updateObservationLifecycle(
      'obs-123',
      {
        status: 'superseded',
        validTo: '2026-08-11T20:00:00Z',
        value: 999999,
        sourceId: 'other-source',
        provenance: {
          rewritten: true
        }
      }
    );

    assert.strictEqual(result.error, null);

    const updateCall = calls.find(call => call[0] === 'update');
    assert(updateCall, 'Expected lifecycle UPDATE');

    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(updateCall[1])),
      {
        status: 'superseded',
        valid_to: '2026-08-11T20:00:00Z'
      }
    );

    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(updateCall[1], 'value_jsonb'),
      false
    );

    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(updateCall[1], 'source_id'),
      false
    );

    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(updateCall[1], 'provenance'),
      false
    );
  });

  await test('rejects invalid or empty lifecycle mutations without database access', async () => {
    const { observation, calls } = loadObservationService();

    const invalidStatus = await observation.updateObservationLifecycle(
      'obs-123',
      {
        status: 'deleted'
      }
    );

    assert.strictEqual(invalidStatus.data, null);
    assert.strictEqual(invalidStatus.error.type, 'validation_error');

    const emptyPatch = await observation.updateObservationLifecycle(
      'obs-123',
      {}
    );

    assert.strictEqual(emptyPatch.data, null);
    assert.strictEqual(emptyPatch.error.type, 'validation_error');

    assert.strictEqual(
      calls.some(call => call[0] === 'from'),
      false,
      'Invalid lifecycle mutations must not reach Supabase'
    );
  });

  await test('lists Observation evidence newest first', async () => {
    const evidence = [
      {
        id: 'evidence-2',
        observation_id: 'obs-77',
        evidence_type: 'url',
        created_at: '2026-08-11T20:00:00Z'
      },
      {
        id: 'evidence-1',
        observation_id: 'obs-77',
        evidence_type: 'document',
        created_at: '2026-08-10T20:00:00Z'
      }
    ];

    const { observation, calls } = loadObservationService({
      queryResult: {
        data: evidence,
        error: null
      }
    });

    const result = await observation.listObservationEvidence('obs-77');

    assert.strictEqual(result.error, null);
    assert.strictEqual(result.data.length, 2);

    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(calls)),
      [
        ['safeQuery', 'observation.listObservationEvidence'],
        ['from', 'observation_evidence'],
        [
          'select',
          'id, observation_id, evidence_type, source_url, storage_path, content_hash, metadata, created_at'
        ],
        ['eq', 'observation_id', 'obs-77'],
        ['order', 'created_at', { ascending: false }]
      ]
    );
  });

  await test('appends Observation evidence as a new evidence row', async () => {
    const created = {
      id: 'evidence-1',
      observation_id: 'obs-77',
      evidence_type: 'document'
    };

    const { observation, calls } = loadObservationService({
      queryResult: {
        data: created,
        error: null
      }
    });

    const result = await observation.addObservationEvidence({
      observationId: 'obs-77',
      evidenceType: 'document',
      storagePath: 'observations/obs-77/document.pdf',
      contentHash: 'sha256:abc123',
      metadata: {
        page: 4
      }
    });

    assert.strictEqual(result.error, null);

    const insertCall = calls.find(call => call[0] === 'insert');
    assert(insertCall, 'Expected an INSERT into observation_evidence');

    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(insertCall[1])),
      {
        observation_id: 'obs-77',
        evidence_type: 'document',
        source_url: null,
        storage_path: 'observations/obs-77/document.pdf',
        content_hash: 'sha256:abc123',
        metadata: {
          page: 4
        }
      }
    );
  });

  await test('service never deletes observations or rewrites existing evidence', async () => {
    const executable = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    assert(
      !/\.delete\s*\(/i.test(executable),
      'Observation service must never DELETE observations or evidence'
    );

    assert(
      !/from\(['"]observation_evidence['"]\)[\s\S]{0,200}\.update\s*\(/i.test(executable),
      'Observation service must never UPDATE existing evidence rows'
    );

    assert(
      /function\s+updateObservationLifecycle[\s\S]*patch\.status[\s\S]*patch\.valid_to/i.test(source),
      'Observation lifecycle adapter must explicitly limit mutable lifecycle fields'
    );
  });

  console.log(`\nRESULT: ${passed} passed, 0 failed\n`);
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
