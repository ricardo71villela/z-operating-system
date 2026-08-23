// packages/domain/src/rules/matching.ts
//
// Motor de relevância candidato <-> oferta. A pontuação é sempre
// explicável por fatores observáveis. Não é machine learning nem
// correspondência semântica: é correspondência de atributos declarados.

import { renderMessage } from '../i18n/messages';
import type { MessageLocale, MessageParams } from '../i18n/messages';
import { classifyMatchFactor } from './matchIntelligence';
import type { MatchFactorRole } from './matchIntelligence';

export type MatchLevel = 'match' | 'partial' | 'mismatch' | 'unknown';

export interface MatchFactor {
  code:
    | 'skills'
    | 'contract_type'
    | 'work_regime'
    | 'salary_fit'
    | 'life_stage'
    | 'location';
  level: MatchLevel;
  weight: number;
  messageKey: string;
  messageParams?: MessageParams;
}

export interface MatchResult {
  score: number;
  factors: MatchFactor[];
}

export interface ExplainedMatchFactor extends MatchFactor {
  explanation: string;
  intelligenceRole: MatchFactorRole;
}

export interface CandidateMatchingProfile {
  skills: string[];
  desiredContractTypes: string[];
  desiredWorkRegime: 'on_site' | 'hybrid' | 'remote' | null;
  desiredSalaryMin: number | null;
  desiredSalaryMax: number | null;
  desiredSalaryCurrency: string | null;
  interestedInFirstJob: boolean;
  interestedInSeniorRoles: boolean;
  interestedInInterim: boolean;
  locationId: string | null;
  isInternationallyMobile: boolean;
}

export interface OfferMatchingProfile {
  title: string;
  description: string;
  contractType: string;
  workRegime: 'on_site' | 'hybrid' | 'remote';
  salaryMin: number;
  salaryMax: number | null;
  salaryCurrency: string;
  pillar: 'first_jobs' | 'professional_careers' | 'senior_careers';
  locationId: string | null;
}

const WEIGHTS: Record<MatchFactor['code'], number> = {
  skills: 0.35,
  contract_type: 0.15,
  work_regime: 0.15,
  salary_fit: 0.15,
  life_stage: 0.1,
  location: 0.1,
};

const STOPWORDS_PT = new Set(['para', 'com', 'uma', 'que', 'dos', 'das', 'nos', 'nas', 'por', 'sem', 'ser']);

function extractOfferKeywords(offer: OfferMatchingProfile): string[] {
  const text = `${offer.title} ${offer.description}`.toLowerCase();
  const words = text
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 4 && !STOPWORDS_PT.has(word));
  return [...new Set(words)];
}

function scoreSkills(candidate: CandidateMatchingProfile, offer: OfferMatchingProfile): MatchFactor {
  if (candidate.skills.length === 0) {
    return { code: 'skills', level: 'unknown', weight: WEIGHTS.skills, messageKey: 'matching.skills.unknown' };
  }
  const offerKeywords = extractOfferKeywords(offer);
  const candidateSkillsLower = candidate.skills.map((skill) => skill.toLowerCase());
  const matched = offerKeywords.filter((keyword) =>
    candidateSkillsLower.some((skill) => keyword.includes(skill) || skill.includes(keyword)),
  );
  const rate = offerKeywords.length === 0 ? 0 : matched.length / offerKeywords.length;

  if (rate >= 0.15) {
    return {
      code: 'skills',
      level: 'match',
      weight: WEIGHTS.skills,
      messageKey: 'matching.skills.match',
      messageParams: { count: matched.length },
    };
  }
  if (matched.length > 0) {
    return {
      code: 'skills',
      level: 'partial',
      weight: WEIGHTS.skills,
      messageKey: 'matching.skills.partial',
      messageParams: { count: matched.length },
    };
  }
  return { code: 'skills', level: 'mismatch', weight: WEIGHTS.skills, messageKey: 'matching.skills.mismatch' };
}

function scoreContractType(candidate: CandidateMatchingProfile, offer: OfferMatchingProfile): MatchFactor {
  if (candidate.desiredContractTypes.length === 0) {
    return { code: 'contract_type', level: 'unknown', weight: WEIGHTS.contract_type, messageKey: 'matching.contract_type.unknown' };
  }
  const level: MatchLevel = candidate.desiredContractTypes.includes(offer.contractType) ? 'match' : 'mismatch';
  return {
    code: 'contract_type',
    level,
    weight: WEIGHTS.contract_type,
    messageKey: level === 'match' ? 'matching.contract_type.match' : 'matching.contract_type.mismatch',
  };
}

function scoreWorkRegime(candidate: CandidateMatchingProfile, offer: OfferMatchingProfile): MatchFactor {
  if (!candidate.desiredWorkRegime) {
    return { code: 'work_regime', level: 'unknown', weight: WEIGHTS.work_regime, messageKey: 'matching.work_regime.unknown' };
  }
  if (candidate.desiredWorkRegime === offer.workRegime) {
    return { code: 'work_regime', level: 'match', weight: WEIGHTS.work_regime, messageKey: 'matching.work_regime.match' };
  }
  const compatible =
    (candidate.desiredWorkRegime === 'remote' && offer.workRegime === 'hybrid')
    || (candidate.desiredWorkRegime === 'hybrid' && offer.workRegime === 'remote');
  return {
    code: 'work_regime',
    level: compatible ? 'partial' : 'mismatch',
    weight: WEIGHTS.work_regime,
    messageKey: compatible ? 'matching.work_regime.partial' : 'matching.work_regime.mismatch',
  };
}

function scoreSalaryFit(candidate: CandidateMatchingProfile, offer: OfferMatchingProfile): MatchFactor {
  if (candidate.desiredSalaryMin === null || candidate.desiredSalaryCurrency !== offer.salaryCurrency) {
    return { code: 'salary_fit', level: 'unknown', weight: WEIGHTS.salary_fit, messageKey: 'matching.salary_fit.unknown' };
  }
  const offerTop = offer.salaryMax ?? offer.salaryMin;
  if (offerTop >= candidate.desiredSalaryMin) {
    return { code: 'salary_fit', level: 'match', weight: WEIGHTS.salary_fit, messageKey: 'matching.salary_fit.match' };
  }
  const gap = candidate.desiredSalaryMin - offerTop;
  const level: MatchLevel = gap / candidate.desiredSalaryMin < 0.1 ? 'partial' : 'mismatch';
  return {
    code: 'salary_fit',
    level,
    weight: WEIGHTS.salary_fit,
    messageKey: 'matching.salary_fit.below',
    messageParams: { gap: gap.toFixed(0), currency: offer.salaryCurrency },
  };
}

function scoreLifeStage(candidate: CandidateMatchingProfile, offer: OfferMatchingProfile): MatchFactor {
  const wantsThisPillar =
    (offer.pillar === 'first_jobs' && candidate.interestedInFirstJob)
    || (offer.pillar === 'senior_careers' && candidate.interestedInSeniorRoles)
    || (offer.contractType === 'interim' && candidate.interestedInInterim)
    || offer.pillar === 'professional_careers';

  if (!candidate.interestedInFirstJob && !candidate.interestedInSeniorRoles && !candidate.interestedInInterim) {
    return { code: 'life_stage', level: 'unknown', weight: WEIGHTS.life_stage, messageKey: 'matching.life_stage.unknown' };
  }
  return {
    code: 'life_stage',
    level: wantsThisPillar ? 'match' : 'partial',
    weight: WEIGHTS.life_stage,
    messageKey: wantsThisPillar ? 'matching.life_stage.match' : 'matching.life_stage.partial',
  };
}

function scoreLocation(candidate: CandidateMatchingProfile, offer: OfferMatchingProfile): MatchFactor {
  if (offer.workRegime === 'remote') {
    return { code: 'location', level: 'match', weight: WEIGHTS.location, messageKey: 'matching.location.match_remote' };
  }
  if (!candidate.locationId || !offer.locationId) {
    return { code: 'location', level: 'unknown', weight: WEIGHTS.location, messageKey: 'matching.location.unknown' };
  }
  if (candidate.locationId === offer.locationId) {
    return { code: 'location', level: 'match', weight: WEIGHTS.location, messageKey: 'matching.location.match_same' };
  }
  if (candidate.isInternationallyMobile) {
    return { code: 'location', level: 'partial', weight: WEIGHTS.location, messageKey: 'matching.location.partial_mobile' };
  }
  return { code: 'location', level: 'mismatch', weight: WEIGHTS.location, messageKey: 'matching.location.mismatch' };
}

const LEVEL_SCORE: Record<MatchLevel, number> = {
  match: 1,
  partial: 0.5,
  unknown: 0.5,
  mismatch: 0,
};

export function computeMatchScore(candidate: CandidateMatchingProfile, offer: OfferMatchingProfile): MatchResult {
  const factors = [
    scoreSkills(candidate, offer),
    scoreContractType(candidate, offer),
    scoreWorkRegime(candidate, offer),
    scoreSalaryFit(candidate, offer),
    scoreLifeStage(candidate, offer),
    scoreLocation(candidate, offer),
  ];

  const score = factors.reduce((sum, factor) => sum + factor.weight * LEVEL_SCORE[factor.level], 0) * 100;
  return { score: Math.round(score * 10) / 10, factors };
}

// The existing matched-offers API already calls this function. Adding an
// intelligenceRole therefore enriches that API response without changing
// the route, score authority or translated explanation contract.
export function explainMatchFactors(
  factors: MatchFactor[],
  locale: MessageLocale,
): ExplainedMatchFactor[] {
  return factors.map((factor) => ({
    ...factor,
    intelligenceRole: classifyMatchFactor(factor),
    explanation: renderMessage(factor.messageKey, locale, factor.messageParams),
  }));
}
