import assert from 'node:assert/strict';
import { buildRecruiterIntelligence } from './recruiterIntelligence';
import type { ApplicationPipelineInput } from './recruiterIntelligence';

const applications: ApplicationPipelineInput[] = [
  {
    id: 'a1',
    status: 'hired',
    createdAt: '2026-08-01T08:00:00.000Z',
    history: [
      { from:null, to:'submitted', at:'2026-08-01T08:00:00.000Z' },
      { from:'submitted', to:'received', at:'2026-08-01T10:00:00.000Z' },
      { from:'received', to:'screening', at:'2026-08-02T08:00:00.000Z' },
      { from:'screening', to:'shortlisted', at:'2026-08-03T08:00:00.000Z' },
      { from:'shortlisted', to:'interview', at:'2026-08-04T08:00:00.000Z' },
      { from:'interview', to:'offer', at:'2026-08-06T08:00:00.000Z' },
      { from:'offer', to:'hired', at:'2026-08-08T08:00:00.000Z' },
    ],
  },
  {
    id: 'a2',
    status: 'rejected',
    createdAt: '2026-08-01T08:00:00.000Z',
    history: [
      { from:null, to:'submitted', at:'2026-08-01T08:00:00.000Z' },
      { from:'submitted', to:'received', at:'2026-08-01T14:00:00.000Z' },
      { from:'received', to:'screening', at:'2026-08-02T08:00:00.000Z' },
      { from:'screening', to:'rejected', at:'2026-08-03T08:00:00.000Z' },
    ],
  },
  {
    id: 'a3',
    status: 'submitted',
    createdAt: '2026-08-02T08:00:00.000Z',
    history: [
      { from:null, to:'submitted', at:'2026-08-02T08:00:00.000Z' },
    ],
  },
];

const result = buildRecruiterIntelligence(applications);
assert.equal(result.totalApplications, 3);
assert.equal(result.stageCounts.hired, 1);
assert.equal(result.stageCounts.rejected, 1);
assert.equal(result.stageCounts.submitted, 1);
assert.equal(result.activeApplications, 1);
assert.equal(result.unacknowledgedApplications, 1);
assert.equal(result.rates.acknowledged, 66.7);
assert.equal(result.rates.interview, 33.3);
assert.equal(result.rates.offer, 33.3);
assert.equal(result.rates.hire, 33.3);
assert.equal(result.medianHoursToFirstResponse, 4);
assert.equal(result.medianHoursToHire, 168);
assert.equal(result.historyCoverage, 100);
assert.deepEqual(result.limitations, []);
assert.equal(result.usesProtectedCandidateAttributes, false);

const empty = buildRecruiterIntelligence([]);
assert.equal(empty.totalApplications, 0);
assert.equal(empty.medianHoursToFirstResponse, null);
assert.equal(empty.medianHoursToHire, null);
assert.ok(empty.limitations.includes('no_applications'));

const incomplete = buildRecruiterIntelligence([
  {
    id:'a4',
    status:'screening',
    createdAt:'2026-08-01T08:00:00.000Z',
    history:[],
  },
]);
assert.equal(incomplete.historyCoverage, 0);
assert.ok(incomplete.limitations.includes('incomplete_status_history'));
assert.ok(incomplete.limitations.includes('no_first_response_timing_evidence'));

console.log('RECRUITER INTELLIGENCE: PASS');
