import assert from 'node:assert/strict';
import { buildEmployerIntelligence } from './employerIntelligence';
import type { EmployerMetrics } from './employerResponsibility';

const strongMetrics: EmployerMetrics = {
  verificationStatus: 'verified',
  publishedOffersCount: 4,
  offersWithFixedSalaryCount: 4,
  offersWithCompleteFieldsCount: 4,
  responseRate: 0.9,
  candidatesInformedRate: 0.85,
  confirmedComplaintsCount: 0,
  offerVsRealityDivergenceCount: 0,
  firstJobHiresCount: 1,
  seniorHiresCount: 1,
};

const strong = buildEmployerIntelligence(strongMetrics);
assert.equal(strong.evidenceLevel, 'established');
assert.equal(strong.paidPlacementAffectsResult, false);
assert.ok(strong.strengths.includes('verification'));
assert.ok(strong.strengths.includes('salary_transparency'));
assert.ok(strong.strengths.includes('integrity'));
assert.equal(strong.attentionAreas.length, 0);
assert.ok(strong.badges.includes('verified_employer'));
assert.ok(strong.badges.includes('responsible_recruiter'));

const noHistory = buildEmployerIntelligence({
  ...strongMetrics,
  verificationStatus: 'unverified',
  publishedOffersCount: 0,
  offersWithFixedSalaryCount: 0,
  offersWithCompleteFieldsCount: 0,
  responseRate: 0,
  candidatesInformedRate: 0,
  firstJobHiresCount: 0,
  seniorHiresCount: 0,
});
assert.equal(noHistory.evidenceLevel, 'insufficient');
assert.ok(noHistory.limitations.includes('no_published_offer_history'));
assert.equal(noHistory.signals.find((signal) => signal.code === 'salary_transparency')?.level, 'unknown');
assert.equal(noHistory.signals.find((signal) => signal.code === 'response')?.level, 'unknown');

const weakBehavior = buildEmployerIntelligence({
  ...strongMetrics,
  publishedOffersCount: 2,
  offersWithFixedSalaryCount: 1,
  offersWithCompleteFieldsCount: 2,
  responseRate: 0.2,
  candidatesInformedRate: 0.3,
  confirmedComplaintsCount: 2,
});
assert.equal(weakBehavior.evidenceLevel, 'developing');
assert.ok(weakBehavior.limitations.includes('limited_offer_history'));
assert.ok(weakBehavior.attentionAreas.includes('salary_transparency'));
assert.ok(weakBehavior.attentionAreas.includes('response'));
assert.ok(weakBehavior.attentionAreas.includes('integrity'));

console.log('EMPLOYER INTELLIGENCE: PASS');
