import {
  computeEligibleBadges,
  computeResponsibilityComponents,
} from './employerResponsibility';
import type {
  BadgeCode,
  EmployerMetrics,
  ResponsibilityComponents,
} from './employerResponsibility';

export type EmployerEvidenceLevel = 'insufficient' | 'developing' | 'established';
export type EmployerSignalCode =
  | 'verification'
  | 'salary_transparency'
  | 'offer_completeness'
  | 'response'
  | 'integrity'
  | 'candidate_communication';

export interface EmployerSignal {
  code: EmployerSignalCode;
  value: number | boolean;
  level: 'strong' | 'neutral' | 'attention' | 'unknown';
}

export interface EmployerIntelligence {
  evidenceLevel: EmployerEvidenceLevel;
  components: ResponsibilityComponents;
  badges: BadgeCode[];
  signals: EmployerSignal[];
  strengths: EmployerSignalCode[];
  attentionAreas: EmployerSignalCode[];
  limitations: string[];
  paidPlacementAffectsResult: false;
}

function levelForScore(score: number, hasEvidence: boolean): EmployerSignal['level'] {
  if (!hasEvidence) return 'unknown';
  if (score >= 80) return 'strong';
  if (score < 60) return 'attention';
  return 'neutral';
}

export function buildEmployerIntelligence(metrics: EmployerMetrics): EmployerIntelligence {
  const components = computeResponsibilityComponents(metrics);
  const badges = computeEligibleBadges(metrics);
  const evidenceLevel: EmployerEvidenceLevel =
    metrics.publishedOffersCount >= 3
      ? 'established'
      : metrics.publishedOffersCount > 0
        ? 'developing'
        : 'insufficient';

  const hasOfferEvidence = metrics.publishedOffersCount > 0;
  const hasBehaviorEvidence = hasOfferEvidence;
  const verified = metrics.verificationStatus === 'verified'
    || metrics.verificationStatus === 'enhanced_verified';

  const signals: EmployerSignal[] = [
    {
      code: 'verification',
      value: verified,
      level: verified ? 'strong' : 'neutral',
    },
    {
      code: 'salary_transparency',
      value: components.salaryTransparencyScore,
      level: levelForScore(components.salaryTransparencyScore, hasOfferEvidence),
    },
    {
      code: 'offer_completeness',
      value: components.offerCompletenessScore,
      level: levelForScore(components.offerCompletenessScore, hasOfferEvidence),
    },
    {
      code: 'response',
      value: components.responseScore,
      level: levelForScore(components.responseScore, hasBehaviorEvidence),
    },
    {
      code: 'integrity',
      value: components.integrityScore,
      level: hasOfferEvidence || metrics.confirmedComplaintsCount > 0 || metrics.offerVsRealityDivergenceCount > 0
        ? levelForScore(components.integrityScore, true)
        : 'unknown',
    },
    {
      code: 'candidate_communication',
      value: Math.round(metrics.candidatesInformedRate * 100),
      level: levelForScore(Math.round(metrics.candidatesInformedRate * 100), hasBehaviorEvidence),
    },
  ];

  const limitations: string[] = [];
  if (!hasOfferEvidence) limitations.push('no_published_offer_history');
  if (metrics.publishedOffersCount > 0 && metrics.publishedOffersCount < 3) {
    limitations.push('limited_offer_history');
  }

  return {
    evidenceLevel,
    components,
    badges,
    signals,
    strengths: signals.filter((signal) => signal.level === 'strong').map((signal) => signal.code),
    attentionAreas: signals.filter((signal) => signal.level === 'attention').map((signal) => signal.code),
    limitations,
    paidPlacementAffectsResult: false,
  };
}
