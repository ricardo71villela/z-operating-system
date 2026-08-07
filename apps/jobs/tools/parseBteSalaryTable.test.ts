// tools/parseBteSalaryTable.test.ts
// Corre com: npx tsx tools/parseBteSalaryTable.test.ts
//
// Testa contra o texto REAL do documento oficial (BTE n.º 2, 15 de
// janeiro de 2025 — ver tools/fixtures/ahresp-bte2-2025.txt), não texto
// inventado. Compara o resultado com os valores que semeei manualmente
// em seeds/dev_seed_occupations_and_salaries.sql — se este teste passar,
// prova que o parser reproduz de forma automática o que antes foi feito
// à mão.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseBteCollectiveAgreementText } from './parseBteSalaryTable';

const __dirname = dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    failed++;
  }
}

const fixtureText = readFileSync(join(__dirname, 'fixtures/ahresp-bte2-2025.txt'), 'utf-8');
const result = parseBteCollectiveAgreementText(fixtureText);

console.log('parseBteCollectiveAgreementText (contra o documento real AHRESP/SITESE)');

test('extrai exatamente 11 níveis salariais', () => {
  assert.equal(result.levels.length, 11);
});

test('valores extraídos coincidem exatamente com o documento oficial', () => {
  const byCode = Object.fromEntries(result.levels.map((l) => [l.levelCode, l.monthlyMinimum]));
  assert.equal(byCode['XI'], 1381.0);
  assert.equal(byCode['X'], 1314.0);
  assert.equal(byCode['IX'], 1086.0);
  assert.equal(byCode['VIII'], 978.0);
  assert.equal(byCode['VII'], 924.0);
  assert.equal(byCode['VI'], 902.0);
  assert.equal(byCode['V'], 886.0);
  assert.equal(byCode['IV'], 881.0);
  assert.equal(byCode['III'], 876.0);
  assert.equal(byCode['II'], 873.0);
  assert.equal(byCode['I'], 870.0);
});

test('níveis ficam ordenados por levelRank crescente', () => {
  for (let i = 1; i < result.levels.length; i++) {
    assert.ok(result.levels[i].levelRank > result.levels[i - 1].levelRank);
  }
  assert.equal(result.levels[0].levelCode, 'I');
  assert.equal(result.levels[result.levels.length - 1].levelCode, 'XI');
});

test('numeração romana convertida corretamente (VIII=8, XI=11)', () => {
  const byCode = Object.fromEntries(result.levels.map((l) => [l.levelCode, l.levelRank]));
  assert.equal(byCode['VIII'], 8);
  assert.equal(byCode['XI'], 11);
  assert.equal(byCode['IX'], 9);
});

test('extrai categorias profissionais reais do Anexo II', () => {
  assert.ok(result.categories.length > 50, `esperava mais de 50 categorias, obteve ${result.categories.length}`);
});

test('categorias conhecidas mapeadas para o nível correto', () => {
  const chefeDeSala = result.categories.find((c) => c.categoryName === 'Chefe de sala');
  assert.ok(chefeDeSala, 'esperava encontrar "Chefe de sala"');
  assert.equal(chefeDeSala?.levelCode, 'VIII');

  const gerente = result.categories.find((c) => c.categoryName === 'Gerente');
  assert.equal(gerente?.levelCode, 'VIII');

  const chefeDeCozinha = result.categories.find((c) => c.categoryName === 'Chefe de cozinha');
  assert.equal(chefeDeCozinha?.levelCode, 'X');

  const diretorRestauracao = result.categories.find((c) => c.categoryName === 'Diretor de restauração e bebidas');
  assert.equal(diretorRestauracao?.levelCode, 'XI');
});

test('todas as categorias apontam para um nível que existe na tabela (nenhuma órfã)', () => {
  const validCodes = new Set(result.levels.map((l) => l.levelCode));
  for (const cat of result.categories) {
    assert.ok(validCodes.has(cat.levelCode), `categoria "${cat.categoryName}" aponta para nível inexistente "${cat.levelCode}"`);
  }
});

test('sem avisos quando o documento segue a estrutura esperada', () => {
  assert.deepEqual(result.warnings, [], `avisos inesperados: ${JSON.stringify(result.warnings)}`);
});

// --- Caso negativo: documento sem a estrutura esperada ---
test('documento sem "ANEXO I" -> devolve vazio com aviso, nunca inventa dados', () => {
  const r = parseBteCollectiveAgreementText('Um texto qualquer sem estrutura de convenção coletiva nenhuma.');
  assert.equal(r.levels.length, 0);
  assert.equal(r.categories.length, 0);
  assert.ok(r.warnings.length > 0);
});

test('nível mencionado no Anexo II mas ausente do Anexo I gera aviso, não é ignorado silenciosamente', () => {
  const brokenText = `
ANEXO I
Níveis Retribuição mínima
I 900,00 €
ANEXO II
Nível I
Categoria A;
Nível II
Categoria B;
ANEXO III
`;
  const r = parseBteCollectiveAgreementText(brokenText);
  assert.ok(r.warnings.some((w) => w.includes('II')));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
