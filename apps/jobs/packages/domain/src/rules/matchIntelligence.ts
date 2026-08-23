import type { MatchFactor, MatchResult } from './matching';

export type MatchFitBand =
  | 'strong'
  | 'good'
  | 'possible'
  | 'weak'
  | 'insufficient_evidence';

export interface MatchIntelligence {
  score: number;
  confidence: number;
  fitBand: MatchFitBand;
  strengths: MatchFactor[];
  tradeoffs: MatchFactor[];
  conflicts: MatchFactor[];
  unknowns: MatchFactor[];
  advisoryOnly: true;
}

const PREFERENCE_CODES = new Set<MatchFactor['code']>([
  'contract_type',
  'work_regime',
  'salary_fit',
  'location',
]);

function byWeight(a: MatchFactor, b: MatchFactor) {
  return b.weight - a.weight || a.code.localeCompare(b.code);
}

export function computeMatchConfidence(factors: MatchFactor[]): number {
  const totalWeight = factors.reduce((sum, factor) => sum + factor.weight, 0);
  if (totalWeight <= 0) return 0;

  const knownWeight = factors
    .filter((factor) => factor.level !== 'unknown')
    .reduce((sum, factor) => sum + factor.weight, 0);

  return Math.round((knownWeight / totalWeight) * 1000) / 10;
}

export function classifyMatchFit(score: number, confidence: number): MatchFitBand {
  if (confidence < 40) return 'insufficient_evidence';
  if (score >= 80 && confidence >= 70) return 'strong';
  if (score >= 65) return 'good';
  if (score >= 45) return 'possible';
  return 'weak';
}

export function buildMatchIntelligence(result: MatchResult): MatchIntelligence {
  const confidence = computeMatchConfidence(result.factors);

  return {
    score: result.score,
    confidence,
    fitBand: classifyMatchFit(result.score, confidence),
    strengths: result.factors.filter((factor) => factor.level === 'match').sort(byWeight),
    tradeoffs: result.factors.filter((factor) => factor.level === 'partial').sort(byWeight),
    conflicts: result.factors
      .filter((factor) => factor.level === 'mismatch' && PREFERENCE_CODES.has(factor.code))
      .sort(byWeight),
    unknowns: result.factors.filter((factor) => factor.level === 'unknown').sort(byWeight),
    advisoryOnly: true,
  };
}
