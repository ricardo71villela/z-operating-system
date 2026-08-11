'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(
  path.join(__dirname, '../../apps/zfind-web/src/services/verification.js'),
  'utf8'
);

function loadVerificationService({
  profileResult = {
    data: { id: 'admin-profile-1', role: 'admin' },
    error: null
  },
  queryResult = {
    data: null,
    error: null
  }
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
    filename: 'verification.js'
  });

  return {
    verification: context.window.ZFindServices.verification,
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

  console.log('\n=== Z FIND — VERIFICATION SERVICE TESTS ===');

  await test('lists assessments for a supported verification subject', async () => {
    const assessments = [
      {
        id: 'assessment-2',
        subject_type: 'property',
        property_id: 'property-123',
        verification_kind: 'documentation',
        outcome: 'verified',
        confidence: 0.95
      },
      {
        id: 'assessment-1',
        subject_type: 'property',
        property_id: 'property-123',
        verification_kind: 'documentation',
        outcome: 'pending',
        confidence: null
      }
    ];

    const { verification, calls } = loadVerificationService({
      queryResult: {
        data: assessments,
        error: null
      }
    });

    const result = await verification.listVerificationAssessments(
      'property',
      'property-123'
    );

    assert.strictEqual(result.error, null);
    assert.strictEqual(result.data.length, 2);

    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(calls)),
      [
        ['safeQuery', 'verification.listVerificationAssessments'],
        ['from', 'verification_assessments'],
        [
          'select',
          'id, subject_type, partner_id, representation_id, property_id, development_id, ' +
          'verification_kind, outcome, confidence, source_reference, evidence, ' +
          'assessor_profile_id, assessed_at, expires_at'
        ],
        ['eq', 'subject_type', 'property'],
        ['eq', 'property_id', 'property-123'],
        ['order', 'assessed_at', { ascending: false }]
      ]
    );
  });

  await test('appends a new assessment using the authenticated admin profile as assessor', async () => {
    const created = {
      id: 'assessment-new',
      subject_type: 'partner',
      partner_id: 'partner-123',
      representation_id: null,
      property_id: null,
      development_id: null,
      verification_kind: 'identity',
      outcome: 'verified',
      confidence: 1,
      source_reference: 'document-check-123',
      evidence: { documentType: 'registry_extract' },
      assessor_profile_id: 'admin-profile-77',
      assessed_at: '2026-08-11T20:00:00Z',
      expires_at: null
    };

    const { verification, calls } = loadVerificationService({
      profileResult: {
        data: {
          id: 'admin-profile-77',
          role: 'admin'
        },
        error: null
      },
      queryResult: {
        data: created,
        error: null
      }
    });

    const result = await verification.createVerificationAssessment({
      subjectType: 'partner',
      subjectId: 'partner-123',
      verificationKind: 'identity',
      outcome: 'verified',
      confidence: 1,
      sourceReference: 'document-check-123',
      evidence: {
        documentType: 'registry_extract'
      }
    });

    assert.strictEqual(result.error, null);
    assert.strictEqual(result.data.id, 'assessment-new');

    const insertCall = calls.find(call => call[0] === 'insert');

    assert(insertCall, 'Expected an INSERT into verification_assessments');

    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(insertCall[1])),
      {
        subject_type: 'partner',
        verification_kind: 'identity',
        outcome: 'verified',
        confidence: 1,
        source_reference: 'document-check-123',
        evidence: {
          documentType: 'registry_extract'
        },
        assessor_profile_id: 'admin-profile-77',
        expires_at: null,
        partner_id: 'partner-123'
      }
    );

    assert.strictEqual(
      calls.some(call => call[0] === 'update'),
      false,
      'Creating a new verification outcome must never UPDATE an old assessment'
    );

    assert.strictEqual(
      calls.some(call => call[0] === 'delete'),
      false,
      'Creating a new verification outcome must never DELETE an old assessment'
    );
  });

  await test('rejects unsupported verification subjects without querying Supabase', async () => {
    const { verification, calls } = loadVerificationService();

    const result = await verification.listVerificationAssessments(
      'listing',
      'listing-123'
    );

    assert.strictEqual(result.data, null);
    assert.strictEqual(result.error.type, 'validation_error');

    assert.strictEqual(
      calls.some(call => call[0] === 'from'),
      false,
      'Unsupported subjects must not query verification_assessments'
    );
  });

  await test('rejects invalid confidence before authentication or database access', async () => {
    const { verification, calls } = loadVerificationService();

    const result = await verification.createVerificationAssessment({
      subjectType: 'development',
      subjectId: 'development-123',
      verificationKind: 'documentation',
      outcome: 'verified',
      confidence: 1.5
    });

    assert.strictEqual(result.data, null);
    assert.strictEqual(result.error.type, 'validation_error');

    assert.strictEqual(
      calls.some(call => call[0] === 'from'),
      false,
      'Invalid confidence must not reach Supabase'
    );
  });

  await test('propagates authentication/profile errors without inserting an assessment', async () => {
    const authError = {
      type: 'authorization_failure',
      context: 'auth.getCurrentProfile',
      message: 'No active session.'
    };

    const { verification, calls } = loadVerificationService({
      profileResult: {
        data: null,
        error: authError
      }
    });

    const result = await verification.createVerificationAssessment({
      subjectType: 'property',
      subjectId: 'property-456',
      verificationKind: 'ownership',
      outcome: 'pending'
    });

    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(result)),
      {
        data: null,
        error: authError
      }
    );

    assert.strictEqual(
      calls.some(call => call[0] === 'from'),
      false,
      'No assessment must be inserted when the authenticated profile cannot be resolved'
    );
  });

  await test('service remains append-only and separate from Trust projection', async () => {
    assert(
      !/\.update\s*\(/i.test(source),
      'Verification service must never UPDATE verification assessments'
    );

    assert(
      !/\.delete\s*\(/i.test(source),
      'Verification service must never DELETE verification assessments'
    );

    assert(
      !/trust_level/i.test(
        source
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/.*$/gm, '')
      ),
      'Verification service executable code must never write or derive partners.trust_level'
    );

    assert(
      !/trust\s*score/i.test(
        source
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/.*$/gm, '')
      ),
      'Verification service executable code must not calculate a Trust Score'
    );
  });

  console.log(`\nRESULT: ${passed} passed, 0 failed\n`);
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
