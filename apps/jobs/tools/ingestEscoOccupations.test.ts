// tools/ingestEscoOccupations.test.ts
// Corre com: npx tsx tools/ingestEscoOccupations.test.ts
//
// Fixture fiel à estrutura JSON HAL documentada oficialmente
// (https://ec.europa.eu/esco/api/doc/esco-api-doc.pdf) — NÃO uma
// resposta capturada ao vivo (ver aviso em escoClient.ts sobre a
// limitação de rede deste ambiente). O URI de exemplo
// (528f90ed-e250-48bd-aacc-ffb7b1de5654, "Textile specialised seller")
// é o próprio exemplo usado na documentação oficial da ESCO.

import assert from 'node:assert/strict';
import { transformEscoOccupations } from './ingestEscoOccupations';
import type { EscoOccupationResource } from './escoClient';

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

function makeResource(overrides: Partial<EscoOccupationResource> & { title: string; uri: string }): EscoOccupationResource {
  return {
    code: undefined,
    _links: { self: { uri: overrides.uri, href: overrides.uri, title: overrides.title } },
    ...overrides,
  };
}

console.log('transformEscoOccupations');

test('profissão com código ISCO-08 válido, PT e EN -> linha completa', () => {
  const uri = 'http://data.europa.eu/esco/occupation/528f90ed-e250-48bd-aacc-ffb7b1de5654';
  const map = new Map([
    [uri, {
      pt: makeResource({ title: 'vendedor especializado de têxteis', uri, code: '5223' }),
      en: makeResource({ title: 'textile specialised seller', uri, code: '5223' }),
    }],
  ]);
  const result = transformEscoOccupations(map);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].isco08Code, '5223');
  assert.equal(result.rows[0].majorGroupCode, '5');
  assert.equal(result.rows[0].preferredLabelPt, 'vendedor especializado de têxteis');
  assert.equal(result.rows[0].preferredLabelEn, 'textile specialised seller');
  assert.equal(result.rows[0].source, 'ESCO');
  assert.equal(result.warnings.length, 0);
});

test('sem código ISCO-08 (conceito intermédio) -> ignorado com aviso, nunca inventado', () => {
  const uri = 'http://data.europa.eu/esco/occupation/sem-codigo';
  const map = new Map([[uri, { en: makeResource({ title: 'algo sem código', uri }) }]]);
  const result = transformEscoOccupations(map);
  assert.equal(result.rows.length, 0);
  assert.ok(result.warnings.some((w) => w.uri === uri && w.reason.includes('ISCO-08')));
});

test('código não numérico ou mal formado -> ignorado, não passa por "válido"', () => {
  const uri = 'http://data.europa.eu/esco/occupation/codigo-mau';
  const map = new Map([[uri, { en: makeResource({ title: 'x', uri, code: 'ABCD' }) }]]);
  const result = transformEscoOccupations(map);
  assert.equal(result.rows.length, 0);
});

test('só recurso em EN (sem PT) -> usa o EN também como rótulo PT, com aviso', () => {
  const uri = 'http://data.europa.eu/esco/occupation/so-ingles';
  const map = new Map([[uri, { en: makeResource({ title: 'only in english', uri, code: '2512' }) }]]);
  const result = transformEscoOccupations(map);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].preferredLabelPt, 'only in english');
  assert.ok(result.warnings.some((w) => w.reason.includes('português')));
});

test('grande grupo desconhecido (código não começa por 0-9 válido) -> ignorado', () => {
  // Situação sintética para provar que a função nunca aceita cegamente
  // — na prática todos os códigos ISCO-08 reais começam por 0-9.
  const uri = 'http://data.europa.eu/esco/occupation/grupo-impossivel';
  const map = new Map([[uri, { en: makeResource({ title: 'x', uri, code: 'X512' }) }]]);
  const result = transformEscoOccupations(map);
  assert.equal(result.rows.length, 0); // código não é \d{4}, já cai no filtro anterior
});

test('vários URIs processados de uma vez, cada um independente', () => {
  const uriA = 'http://data.europa.eu/esco/occupation/a';
  const uriB = 'http://data.europa.eu/esco/occupation/b';
  const map = new Map([
    [uriA, { pt: makeResource({ title: 'a', uri: uriA, code: '2512' }), en: makeResource({ title: 'a-en', uri: uriA, code: '2512' }) }],
    [uriB, { pt: makeResource({ title: 'b', uri: uriB, code: '1412' }), en: makeResource({ title: 'b-en', uri: uriB, code: '1412' }) }],
  ]);
  const result = transformEscoOccupations(map);
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.rows.map((r) => r.isco08Code).sort(), ['1412', '2512']);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
