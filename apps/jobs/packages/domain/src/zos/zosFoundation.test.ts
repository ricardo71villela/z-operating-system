import assert from 'node:assert/strict';
import { integrationMessage } from './integration';
import { observation } from './observation';
import { registryReference } from './registry';
import { transitionRecord } from './stateHistory';

const org = registryReference('zos_org_123', 'organization');
assert.deepEqual(org, { registryId: 'zos_org_123', entityType: 'organization' });

const salary = observation({
  id: 'obs_1',
  subject: org,
  metric: 'employment.salary_reference.monthly_min',
  value: 2200,
  unit: 'EUR',
  marketCode: 'PT',
  observedAt: '2026-08-07T12:00:00Z',
  status: 'recorded',
  source: { sourceId: 'source_bte', sourceType: 'official_document' },
  provenance: { method: 'document', confidence: 0.98 },
});
assert.equal(salary.value, 2200);
assert.throws(() => observation({ ...salary, provenance: { method: 'document', confidence: 1.1 } }));

const transition = transitionRecord({
  entityType: 'job_offer',
  entityId: 'offer_1',
  from: 'draft',
  to: 'pending_review',
  occurredAt: '2026-08-07T12:01:00Z',
  correlationId: 'corr_1',
});
assert.equal(transition.to, 'pending_review');

const message = integrationMessage({
  messageId: 'msg_1',
  messageType: 'jobs.job_offer.published.v1',
  producer: 'z-jobs',
  schemaVersion: 1,
  occurredAt: '2026-08-07T12:02:00Z',
  correlationId: 'corr_1',
  subjectId: 'offer_1',
  subjectType: 'job_offer',
  payload: { organizationRegistryId: org.registryId },
});
assert.equal(message.payload.organizationRegistryId, 'zos_org_123');

console.log('✓ ZOS v1.1 compatibility primitives');
