// packages/domain/src/rules/institution.test.ts
// Corre com: npx tsx packages/domain/src/rules/institution.test.ts

import assert from 'node:assert/strict';
import { canReserveOfferForInstitution, isInstitutionType } from './institution';

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

console.log('institution rules');

test('university é um tipo de instituição válido', () => {
  assert.equal(isInstitutionType('university'), true);
});

test('employer NÃO é um tipo de instituição', () => {
  assert.equal(isInstitutionType('employer'), false);
});

test('reserva elegível: oferta publicada, empregador verificado, instituição válida', () => {
  const result = canReserveOfferForInstitution({
    offerStatus: 'published',
    offerOrganizationVerified: true,
    institutionOrgType: 'polytechnic',
  });
  assert.equal(result.eligible, true);
  assert.deepEqual(result.reasons, []);
});

test('reserva rejeitada: oferta ainda em draft', () => {
  const result = canReserveOfferForInstitution({
    offerStatus: 'draft',
    offerOrganizationVerified: true,
    institutionOrgType: 'university',
  });
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.some((r) => r.includes('aprovada ou publicada')));
});

test('reserva rejeitada: empregador não verificado', () => {
  const result = canReserveOfferForInstitution({
    offerStatus: 'published',
    offerOrganizationVerified: false,
    institutionOrgType: 'university',
  });
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.some((r) => r.includes('verificado')));
});

test('reserva rejeitada: destinatário não é uma instituição (é uma empresa comum)', () => {
  const result = canReserveOfferForInstitution({
    offerStatus: 'published',
    offerOrganizationVerified: true,
    institutionOrgType: 'employer',
  });
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.some((r) => r.includes('instituição de ensino')));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
