// apps/api/src/errorMessages.test.ts — corre com: npx tsx src/errorMessages.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ERROR_CATALOG, translateError } from './errorMessages';

let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); console.log(`  ✓ ${name}`); } catch (err) { failed++; console.error(`  ✗ ${name}`); console.error(err); }
}

const server = readFileSync(new URL('./server.ts', import.meta.url), 'utf-8');
const literals = [...server.matchAll(/error: '([^']+)'/g)].map((m) => m[1]);

test('todas as mensagens literais de server.ts estão traduzidas', () => {
  const missing = literals.filter((msg) => translateError(msg, 'fr').code === 'unknown_error');
  assert.deepEqual(missing, []);
});

test('mensagens com valores (templates) são reconhecidas', () => {
  assert.equal(translateError('transição draft -> published não permitida', 'fr').error, 'Changement de statut non autorisé (draft → published).');
  assert.equal(translateError('transição draft -> published não permitida', 'en').code, 'transition_not_allowed');
  assert.equal(translateError('produto de billing desconhecido: PRO', 'en').error, 'Unknown billing product: PRO.');
  assert.equal(translateError('ficheiro com 9000000 bytes excede o limite de 5242880 bytes', 'fr').code, 'file_too_large');
  assert.equal(translateError('job offer 123 not found', 'en').error, 'Not found.');
});

test('nenhuma tradução fica em português nem vazia', () => {
  for (const e of ERROR_CATALOG) {
    for (const t of [e.fr, e.en]) {
      assert.ok(t.length > 0);
      assert.ok(!/ não |ção\b|ões\b/.test(t), `parece português: ${t}`);
    }
  }
});

test('mensagem desconhecida passa intacta', () => {
  assert.deepEqual(translateError('xyz', 'fr'), { code: 'unknown_error', error: 'xyz' });
});

console.log(failed ? `\n${failed} falharam` : '\ntodos passaram');
if (failed) process.exitCode = 1;
