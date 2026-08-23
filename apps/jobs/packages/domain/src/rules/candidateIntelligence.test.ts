import assert from 'node:assert/strict';
import { buildCandidateIntelligence, computePreferenceCoverage } from './candidateIntelligence';
import type { CandidateMatchingProfile } from './matching';

const complete: CandidateMatchingProfile = {
  skills: ['TypeScript', 'PostgreSQL'],
  desiredContractTypes: ['permanent'],
  desiredWorkRegime: 'hybrid',
  desiredSalaryMin: 45000,
  desiredSalaryMax: 55000,
  desiredSalaryCurrency: 'EUR',
  interestedInFirstJob: false,
  interestedInSeniorRoles: true,
  interestedInInterim: false,
  locationId: 'porto',
  isInternationallyMobile: false,
};

assert.equal(computePreferenceCoverage(complete).score, 100);

const strong = buildCandidateIntelligence(
  { score: 90, missing: ['resume'] },
  complete,
);
assert.equal(strong.readiness, 'strong');
assert.equal(strong.preferenceCoverage, 100);
assert.deepEqual(strong.nextActions, ['profile:resume']);
assert.equal(strong.candidateOnly, true);

const sparse: CandidateMatchingProfile = {
  skills: [],
  desiredContractTypes: [],
  desiredWorkRegime: null,
  desiredSalaryMin: null,
  desiredSalaryMax: null,
  desiredSalaryCurrency: null,
  interestedInFirstJob: false,
  interestedInSeniorRoles: false,
  interestedInInterim: false,
  locationId: null,
  isInternationallyMobile: false,
};

const early = buildCandidateIntelligence(
  { score: 35, missing: ['summary', 'experience', 'skills'] },
  sparse,
);
assert.equal(early.readiness, 'early');
assert.equal(early.preferenceCoverage, 0);
assert.deepEqual(early.missingPreferenceAreas, [
  'skills',
  'contract_preferences',
  'work_regime',
  'salary_expectation',
  'location_or_mobility',
  'career_interests',
]);
assert.ok(early.nextActions.includes('profile:summary'));
assert.ok(early.nextActions.includes('preference:salary_expectation'));

console.log('CANDIDATE INTELLIGENCE: PASS');
