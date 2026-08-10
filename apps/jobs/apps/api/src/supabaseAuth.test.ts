// apps/api/src/supabaseAuth.test.ts
// Corre com: npx tsx apps/api/src/supabaseAuth.test.ts
//
// Só testa verifySupabaseJWT() — a única função deste módulo que não
// depende de rede real ao Supabase. signupWithSupabase/loginWithSupabase
// nunca foram testadas contra um projeto real, e dizê-lo aqui em vez de
// fingir uma cobertura que não existe.

import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { verifySupabaseJWT } from './supabaseAuth';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${(err as Error).message}`);
    failed++;
  }
}

const FAKE_SECRET = 'segredo-de-teste-nunca-usar-em-producao';
const config = { projectUrl: 'https://exemplo.supabase.co', publicKey: 'x', jwtSecret: FAKE_SECRET };

console.log('verifySupabaseJWT');

test('token assinado com o segredo certo -> devolve o sub corretamente', () => {
  const token = jwt.sign({ sub: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', role: 'authenticated' }, FAKE_SECRET);
  const userId = verifySupabaseJWT(config, token);
  assert.equal(userId, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
});

test('token assinado com segredo ERRADO -> devolve null, nunca um id inventado', () => {
  const token = jwt.sign({ sub: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }, 'segredo-errado');
  const userId = verifySupabaseJWT(config, token);
  assert.equal(userId, null);
});

test('token expirado -> devolve null', () => {
  const token = jwt.sign({ sub: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }, FAKE_SECRET, { expiresIn: -10 });
  const userId = verifySupabaseJWT(config, token);
  assert.equal(userId, null);
});

test('texto que não é sequer um JWT -> devolve null, não rebenta', () => {
  const userId = verifySupabaseJWT(config, 'isto-nao-e-um-jwt-nenhum');
  assert.equal(userId, null);
});

test('token válido mas sem claim "sub" -> devolve null', () => {
  const token = jwt.sign({ role: 'authenticated' }, FAKE_SECRET);
  const userId = verifySupabaseJWT(config, token);
  assert.equal(userId, null);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
