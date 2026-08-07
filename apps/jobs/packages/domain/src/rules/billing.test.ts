// packages/domain/src/rules/billing.test.ts
// Corre com: npx tsx packages/domain/src/rules/billing.test.ts

import assert from 'node:assert/strict';
import { hasActiveFeature, productByCode, BILLING_PRODUCTS, requiresBillingToPublish, canPublishGivenBilling, FREE_FIRST_JOB_POSTS } from './billing';
import type { BillingEvent } from './billing';

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

console.log('billing rules');

test('organização sem eventos de billing não tem talent_search', () => {
  assert.equal(hasActiveFeature([], 'org1', 'talent_search'), false);
});

test('subscrição standard concede talent_search', () => {
  const events: BillingEvent[] = [{ organizationId: 'org1', productCode: 'subscription_standard', grantedAt: '2026-01-01' }];
  assert.equal(hasActiveFeature(events, 'org1', 'talent_search'), true);
  assert.equal(hasActiveFeature(events, 'org1', 'ats_integration'), false);
});

test('evento expirado não concede a funcionalidade', () => {
  const events: BillingEvent[] = [{
    organizationId: 'org1', productCode: 'talent_search_access', grantedAt: '2025-01-01', expiresAt: '2025-06-01',
  }];
  assert.equal(hasActiveFeature(events, 'org1', 'talent_search', new Date('2026-01-01')), false);
});

test('eventos de outra organização não vazam permissões', () => {
  const events: BillingEvent[] = [{ organizationId: 'org2', productCode: 'subscription_enterprise', grantedAt: '2026-01-01' }];
  assert.equal(hasActiveFeature(events, 'org1', 'market_analytics_report'), false);
});

test('todos os produtos de billing concedem pelo menos 1 funcionalidade', () => {
  for (const product of BILLING_PRODUCTS) {
    assert.ok(product.grantsFeatures.length > 0, `${product.code} sem funcionalidades`);
  }
});

test('productByCode devolve undefined para código inexistente', () => {
  // @ts-expect-error — código propositadamente inválido para testar o caminho de falha
  assert.equal(productByCode('nao_existe'), undefined);
});

console.log('\nbilling: primeira oferta gratuita');

test('primeira oferta (0 já publicadas) nunca exige billing', () => {
  assert.equal(requiresBillingToPublish(0), false);
});

test('a partir da FREE_FIRST_JOB_POSTS-ésima oferta já publicada, billing passa a ser exigido', () => {
  assert.equal(requiresBillingToPublish(FREE_FIRST_JOB_POSTS), true);
});

test('organização sem qualquer evento de billing consegue publicar a primeira oferta', () => {
  assert.equal(canPublishGivenBilling([], 'org1', 0), true);
});

test('organização sem billing NÃO consegue publicar a segunda oferta', () => {
  assert.equal(canPublishGivenBilling([], 'org1', 1), false);
});

test('organização com subscrição ativa consegue publicar a segunda oferta em diante', () => {
  const events: BillingEvent[] = [{ organizationId: 'org1', productCode: 'subscription_standard', grantedAt: '2026-01-01' }];
  assert.equal(canPublishGivenBilling(events, 'org1', 1), true);
  assert.equal(canPublishGivenBilling(events, 'org1', 20), true);
});

test('subscrição de OUTRA organização não isenta esta de pagar pela segunda oferta', () => {
  const events: BillingEvent[] = [{ organizationId: 'org2', productCode: 'subscription_enterprise', grantedAt: '2026-01-01' }];
  assert.equal(canPublishGivenBilling(events, 'org1', 1), false);
});

test('subscrição expirada não isenta de pagar pela segunda oferta', () => {
  const events: BillingEvent[] = [{
    organizationId: 'org1', productCode: 'subscription_standard', grantedAt: '2025-01-01', expiresAt: '2025-06-01',
  }];
  assert.equal(canPublishGivenBilling(events, 'org1', 1, new Date('2026-01-01')), false);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
