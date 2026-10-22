// packages/domain/src/rules/responseDeadline.test.ts
// Corre com: npx tsx packages/domain/src/rules/responseDeadline.test.ts

import assert from 'node:assert/strict';
import { applicationResponseDeadline, RESPONSE_DEADLINE_DAYS } from './responseDeadline';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; } catch (err) { console.error(`  ✗ ${name}`); console.error(err); failed++; }
}

const created = '2026-10-01T09:00:00.000Z';
const submitted = { from: null, to: 'submitted' as const, at: created };
const at = (days: number, hours = 0) => new Date(Date.parse(created) + days * 86400000 + hours * 3600000);
const iso = (days: number) => at(days).toISOString();

console.log('response deadline rules');

test(`deadline is ${RESPONSE_DEADLINE_DAYS} days after submission`, () => {
  const r = applicationResponseDeadline({ createdAt: created, status: 'submitted', history: [submitted] }, at(1));
  assert.equal(r.dueAt, iso(RESPONSE_DEADLINE_DAYS));
  assert.equal(r.state, 'waiting');
  assert.equal(r.daysLeft, 13);
});

test('received only is still waiting (not an answer)', () => {
  const r = applicationResponseDeadline({ createdAt: created, status: 'received', history: [submitted, { from: 'submitted', to: 'received', at: iso(1) }] }, at(5));
  assert.equal(r.state, 'waiting');
});

test('due soon in the last days', () => {
  const r = applicationResponseDeadline({ createdAt: created, status: 'submitted', history: [submitted] }, at(12, 1));
  assert.equal(r.state, 'due_soon');
  assert.equal(r.daysLeft, 1);
});

test('last day counts 0 days left, still not overdue', () => {
  const r = applicationResponseDeadline({ createdAt: created, status: 'submitted', history: [submitted] }, at(13, 23));
  assert.equal(r.state, 'due_soon');
  assert.equal(r.daysLeft, 0);
});

test('overdue after the deadline without an answer', () => {
  const r = applicationResponseDeadline({ createdAt: created, status: 'received', history: [submitted] }, at(16));
  assert.equal(r.state, 'overdue');
  assert.ok(r.daysLeft < 0);
});

test('screening in time is an answer', () => {
  const r = applicationResponseDeadline({
    createdAt: created, status: 'interview',
    history: [submitted, { from: 'submitted', to: 'received', at: iso(1) }, { from: 'received', to: 'screening', at: iso(3) }, { from: 'screening', to: 'shortlisted', at: iso(20) }],
  }, at(30));
  assert.equal(r.state, 'answered');
  assert.equal(r.answeredAt, iso(3));
});

test('a rejection is an answer', () => {
  const r = applicationResponseDeadline({ createdAt: created, status: 'rejected', history: [submitted, { from: 'received', to: 'rejected', at: iso(2) }] }, at(30));
  assert.equal(r.state, 'answered');
});

test('an answer after the deadline is recorded as late', () => {
  const r = applicationResponseDeadline({ createdAt: created, status: 'screening', history: [submitted, { from: 'received', to: 'screening', at: iso(20) }] }, at(30));
  assert.equal(r.state, 'answered_late');
});

test('withdrawn before an answer stops the clock', () => {
  const r = applicationResponseDeadline({ createdAt: created, status: 'withdrawn', history: [submitted, { from: 'submitted', to: 'withdrawn', at: iso(2) }] }, at(30));
  assert.equal(r.state, 'withdrawn');
});

test('history order does not matter', () => {
  const r = applicationResponseDeadline({ createdAt: created, status: 'rejected', history: [{ from: 'screening', to: 'rejected', at: iso(9) }, { from: 'received', to: 'screening', at: iso(4) }, submitted] }, at(30));
  assert.equal(r.answeredAt, iso(4));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
