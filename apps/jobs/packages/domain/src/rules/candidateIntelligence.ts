import type { CompletenessResult } from './candidateProfile';
import type { CandidateMatchingProfile } from './matching';

export type CandidateReadiness = 'strong' | 'developing' | 'early';

export interface CandidateIntelligence {
  profileCompleteness: number;
  preferenceCoverage: number;
  readiness: CandidateReadiness;
  missingProfileAreas: string[];
  missingPreferenceAreas: string[];
  nextActions: string[];
  candidateOnly: true;
}

function preferenceEvidence(profile: CandidateMatchingProfile) {
  return [
    ['skills', profile.skills.length > 0],
    ['contract_preferences', profile.desiredContractTypes.length > 0],
    ['work_regime', profile.desiredWorkRegime !== null],
    ['salary_expectation', profile.desiredSalaryMin !== null && !!profile.desiredSalaryCurrency],
    ['location_or_mobility', profile.locationId !== null || profile.isInternationallyMobile],
    [
      'career_interests',
      profile.interestedInFirstJob || profile.interestedInSeniorRoles || profile.interestedInInterim,
    ],
  ] as const;
}

export function computePreferenceCoverage(profile: CandidateMatchingProfile): {
  score: number;
  missing: string[];
} {
  const evidence = preferenceEvidence(profile);
  const known = evidence.filter(([, present]) => present).length;
  const score = Math.round((known / evidence.length) * 1000) / 10;
  return {
    score,
    missing: evidence.filter(([, present]) => !present).map(([code]) => code),
  };
}

export function buildCandidateIntelligence(
  completeness: CompletenessResult,
  matchingProfile: CandidateMatchingProfile,
): CandidateIntelligence {
  const preferences = computePreferenceCoverage(matchingProfile);

  const readiness: CandidateReadiness =
    completeness.score >= 80 && preferences.score >= 70
      ? 'strong'
      : completeness.score >= 50 && preferences.score >= 40
        ? 'developing'
        : 'early';

  const nextActions = [
    ...completeness.missing.map((code) => `profile:${code}`),
    ...preferences.missing.map((code) => `preference:${code}`),
  ];

  return {
    profileCompleteness: completeness.score,
    preferenceCoverage: preferences.score,
    readiness,
    missingProfileAreas: [...completeness.missing],
    missingPreferenceAreas: preferences.missing,
    nextActions,
    candidateOnly: true,
  };
}
