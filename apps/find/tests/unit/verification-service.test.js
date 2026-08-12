'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SERVICE_PATH = path.join(
  __dirname,
  '../../apps/zfind-web/src/services/verification.js'
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
      name ===
      'zfind_list_verification_assessments'
        ? []
        : {
            id:
              'assessment-created',
            assessor_profile_id:
              'database-derived'
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
    verification:
      window.ZFindServices.verification,
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
    '\n=== Z FIND — VERIFICATION SERVICE / CANONICAL RPC ==='
  );

  await test(
    'lists every approved Verification subject through the Find-owned RPC',
    async () => {
      const {
        verification,
        rpcCalls,
        safeCalls
      } = loadService();

      const subjects = [
        'partner',
        'representation',
        'property',
        'development'
      ];

      assert.deepStrictEqual(
        plain(
          verification
            .VERIFICATION_SUBJECTS
        ),
        subjects
      );

      for (
        let index = 0;
        index < subjects.length;
        index += 1
      ) {
        const subjectType =
          subjects[index];

        const subjectId =
          '11111111-1111-1111-1111-111111111111';

        const result =
          await verification
            .listVerificationAssessments(
              subjectType,
              subjectId
            );

        assert.strictEqual(
          result.error,
          null
        );

        assert.strictEqual(
          rpcCalls[index].name,
          'zfind_list_verification_assessments'
        );

        assert.deepStrictEqual(
          plain(
            rpcCalls[index].args
          ),
          {
            p_subject_type:
              subjectType,
            p_subject_id:
              subjectId
          }
        );

        assert.strictEqual(
          safeCalls[index].context,
          'verification.listVerificationAssessments'
        );
      }
    }
  );

  await test(
    'appends a complete assessment without accepting browser-supplied assessor identity',
    async () => {
      const {
        verification,
        rpcCalls,
        safeCalls
      } = loadService();

      const subjectId =
        '11111111-1111-1111-1111-111111111111';

      const result =
        await verification
          .createVerificationAssessment({
            subjectType:
              'property',
            subjectId,
            verificationKind:
              'documentation',
            outcome:
              'verified',
            confidence:
              0.95,
            sourceReference:
              'document:123',
            evidence: {
              documentType:
                'registry_extract'
            },
            expiresAt:
              '2027-08-12T12:00:00Z'
          });

      assert.strictEqual(
        result.error,
        null
      );

      assert.strictEqual(
        rpcCalls.length,
        1
      );

      assert.strictEqual(
        rpcCalls[0].name,
        'zfind_create_verification_assessment'
      );

      assert.deepStrictEqual(
        plain(
          rpcCalls[0].args
        ),
        {
          p_subject_type:
            'property',
          p_subject_id:
            subjectId,
          p_verification_kind:
            'documentation',
          p_outcome:
            'verified',
          p_confidence:
            0.95,
          p_source_reference:
            'document:123',
          p_evidence: {
            documentType:
              'registry_extract'
          },
          p_expires_at:
            '2027-08-12T12:00:00Z'
        }
      );

      assert.strictEqual(
        Object.prototype
          .hasOwnProperty.call(
            rpcCalls[0].args,
            'assessor_profile_id'
          ),
        false
      );

      assert.strictEqual(
        Object.prototype
          .hasOwnProperty.call(
            rpcCalls[0].args,
            'p_assessor_profile_id'
          ),
        false
      );

      assert.strictEqual(
        safeCalls[0].context,
        'verification.createVerificationAssessment'
      );
    }
  );

  await test(
    'rejects unsupported subjects before reaching Supabase',
    async () => {
      const {
        verification,
        rpcCalls
      } = loadService();

      const result =
        await verification
          .listVerificationAssessments(
            'listing',
            '11111111-1111-1111-1111-111111111111'
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
    'rejects missing subject id before reaching Supabase',
    async () => {
      const {
        verification,
        rpcCalls
      } = loadService();

      const result =
        await verification
          .createVerificationAssessment({
            subjectType:
              'property',
            subjectId: '',
            verificationKind:
              'documentation'
          });

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
    'rejects missing kind, invalid outcome and invalid confidence before RPC',
    async () => {
      const {
        verification,
        rpcCalls
      } = loadService();

      const subjectId =
        '11111111-1111-1111-1111-111111111111';

      const missingKind =
        await verification
          .createVerificationAssessment({
            subjectType:
              'property',
            subjectId
          });

      const invalidOutcome =
        await verification
          .createVerificationAssessment({
            subjectType:
              'property',
            subjectId,
            verificationKind:
              'documentation',
            outcome:
              'trusted'
          });

      const invalidLow =
        await verification
          .createVerificationAssessment({
            subjectType:
              'property',
            subjectId,
            verificationKind:
              'documentation',
            confidence:
              -0.01
          });

      const invalidHigh =
        await verification
          .createVerificationAssessment({
            subjectType:
              'property',
            subjectId,
            verificationKind:
              'documentation',
            confidence:
              1.01
          });

      for (const result of [
        missingKind,
        invalidOutcome,
        invalidLow,
        invalidHigh
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
    'Verification adapter remains append-only and separate from Trust',
    async () => {
      const executable =
        executableSource(source);

      assert(
        !/\.from\s*\(/.test(
          executable
        ),
        'Verification must use the deliberate RPC boundary'
      );

      assert(
        !/\.update\s*\(/.test(
          executable
        ),
        'Verification adapter must never UPDATE an assessment'
      );

      assert(
        !/\.delete\s*\(/.test(
          executable
        ),
        'Verification adapter must never DELETE an assessment'
      );

      assert(
        !/trust_level/i.test(
          executable
        ),
        'Verification executable code must never access partners.trust_level'
      );

      assert(
        !/trust\s*score/i.test(
          executable
        ),
        'Verification executable code must never calculate Trust Score'
      );

      assert(
        !/assessor_profile_id/i.test(
          executable
        ),
        'Browser executable code must not supply assessor_profile_id'
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
