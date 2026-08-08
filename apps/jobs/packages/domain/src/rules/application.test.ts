// packages/domain/src/rules/application.test.ts
// Corre com: npx tsx packages/domain/src/rules/application.test.ts

import assert from 'node:assert/strict';
import {
  canTransitionApplication,
  isCandidateAllowedTransition,
} from './application';

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

console.log('application rules');

test('submitted -> received permitido', () => {
  assert.equal(canTransitionApplication('submitted', 'received'), true);
});

test('submitted -> hired NÃO permitido (salta pipeline)', () => {
  assert.equal(canTransitionApplication('submitted', 'hired'), false);
});

test('closed é terminal', () => {
  assert.equal(canTransitionApplication('closed', 'submitted'), false);
});

test('candidato só pode acionar withdrawn', () => {
  assert.equal(isCandidateAllowedTransition('withdrawn'), true);
  assert.equal(isCandidateAllowedTransition('hired'), false);
  assert.equal(isCandidateAllowedTransition('rejected'), false);
});

test('hired -> closed permitido', () => {
  assert.equal(canTransitionApplication('hired', 'closed'), true);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
