// apps/api/src/supabaseAuth.test.ts
//
// Testes do contrato de integração com Supabase Auth.
// A criptografia/JWKS é responsabilidade do SDK oficial
// @supabase/supabase-js; estes testes verificam o comportamento
// fail-closed da nossa camada e a extração segura do claim sub.

import assert from 'node:assert/strict';
import { verifySupabaseJWT } from './supabaseAuth';

let passed = 0;
let failed = 0;

async function test(
  name: string,
  fn: () => void | Promise<void>,
) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${(err as Error).message}`);
    failed++;
  }
}

const config = {
  projectUrl: 'https://example.supabase.co',
  publicKey: 'test-publishable-key',
};

console.log('verifySupabaseJWT');

await test(
  'claims válidos -> devolve o sub corretamente',
  async () => {
    let receivedToken: string | null = null;

    const userId = await verifySupabaseJWT(
      config,
      'user-access-token',
      async (token) => {
        receivedToken = token;

        return {
          claims: {
            sub: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          },
          error: null,
        };
      },
    );

    assert.equal(receivedToken, 'user-access-token');
    assert.equal(
      userId,
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    );
  },
);

await test(
  'erro de validação -> devolve null',
  async () => {
    const userId = await verifySupabaseJWT(
      config,
      'invalid-token',
      async () => ({
        claims: null,
        error: new Error('invalid JWT'),
      }),
    );

    assert.equal(userId, null);
  },
);

await test(
  'verifier lança exceção -> devolve null',
  async () => {
    const userId = await verifySupabaseJWT(
      config,
      'invalid-token',
      async () => {
        throw new Error('JWKS unavailable');
      },
    );

    assert.equal(userId, null);
  },
);

await test(
  'claims sem sub -> devolve null',
  async () => {
    const userId = await verifySupabaseJWT(
      config,
      'token-without-sub',
      async () => ({
        claims: {},
        error: null,
      }),
    );

    assert.equal(userId, null);
  },
);

async function testIdentityAdapter() {
  console.log('\nensureJobsIdentityBinding');

  const {
    ensureJobsIdentityBinding,
  } = await import('./supabaseAuth');

  const requests: {
    url: string;
    authorization: string | null;
    apikey: string | null;
    profile: string | null;
    body: unknown;
  }[] = [];

  const fakeFetch: typeof fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const request = new Request(input, init);

    requests.push({
      url: request.url,
      authorization: request.headers.get('authorization'),
      apikey: request.headers.get('apikey'),
      profile:
        request.headers.get('content-profile') ??
        request.headers.get('accept-profile'),
      body: await request.clone().json(),
    });

    return new Response(
      JSON.stringify([
        {
          binding_id:
            '11111111-1111-4111-8111-111111111111',
          domain_code: 'jobs',
          local_entity_type: 'person',
          local_entity_id:
            '22222222-2222-4222-8222-222222222222',
          canonical_person_id:
            '33333333-3333-4333-8333-333333333333',
          binding_status: 'linked',
          linked_at: '2026-08-10T12:00:00Z',
        },
      ]),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
  };

  try {
    const binding = await ensureJobsIdentityBinding(
      config,
      'user-access-token',
      fakeFetch,
    );

    assert.equal(binding.domain_code, 'jobs');
    assert.equal(binding.local_entity_type, 'person');
    assert.equal(binding.binding_status, 'linked');

    assert.equal(requests.length, 1);

    const request = requests[0];

    assert.match(
      request.url,
      /\/rest\/v1\/rpc\/ensure_current_identity_binding$/,
    );

    assert.equal(
      request.authorization,
      'Bearer user-access-token',
    );

    assert.equal(request.apikey, config.publicKey);
    assert.equal(request.profile, 'zos_api');

    assert.deepEqual(
      request.body,
      { p_domain_code: 'jobs' },
    );

    console.log(
      '  ✓ RPC usa zos_api + Bearer do próprio utilizador',
    );
    passed++;
  } catch (err) {
    console.log(
      '  ✗ RPC usa zos_api + Bearer do próprio utilizador',
    );
    console.log(`    ${(err as Error).message}`);
    failed++;
  }

  try {
    await assert.rejects(
      () =>
        ensureJobsIdentityBinding(
          config,
          '   ',
          fakeFetch,
        ),
      /requires an authenticated Supabase access token/,
    );

    assert.equal(
      requests.length,
      1,
      'token vazio não deve sequer fazer pedido de rede',
    );

    console.log(
      '  ✓ token ausente falha fechado sem fallback',
    );
    passed++;
  } catch (err) {
    console.log(
      '  ✗ token ausente falha fechado sem fallback',
    );
    console.log(`    ${(err as Error).message}`);
    failed++;
  }
}

await testIdentityAdapter();

console.log(`\nFINAL: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
