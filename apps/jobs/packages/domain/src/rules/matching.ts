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
export type SkillsEvidenceSource = 'explicit_requirements' | 'description_fallback';

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
  // Only populated by the skills factor. This makes the evidence boundary
  // inspectable without inventing a second score or new translated prose.
  evidenceSource?: SkillsEvidenceSource;
  requiredMatchCount?: number;
  preferredMatchCount?: number;
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
  // These fields already exist in jobs.job_offers. When either explicit
  // qualification field is present it becomes the skills evidence authority;
  // responsibilities remain product copy/context, never silently promoted to
  // a hard qualification. Old offers without explicit fields keep the exact
  // historical title+description fallback.
  responsibilities?: string | null;
  requiredQualifications?: string | null;
  preferredQualifications?: string | null;
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

// Small cross-locale noise list only. This is still lexical matching, not NLP;
// removing obvious connector words prevents them from inflating denominators
// when qualification prose is written in any of the six public languages.
const STOPWORDS = new Set([
  'para', 'com', 'uma', 'que', 'dos', 'das', 'nos', 'nas', 'por', 'sem', 'ser',
  'with', 'from', 'that', 'this', 'your', 'have', 'will',
  'avec', 'pour', 'dans', 'vous', 'être',
  'para', 'desde', 'tener', 'como',
  'oder', 'eine', 'einer', 'haben', 'sind',
  'della', 'delle', 'dalla', 'avere', 'come',
]);

function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#.\s-]/gu, ' ')
    .split(/\s+/)
    .map((word) => word.replace(/^[.-]+|[.-]+$/g, ''))
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
  return [...new Set(words)];
}

function matchedKeywords(keywords: string[], candidateSkillsLower: string[]): string[] {
  return keywords.filter((keyword) =>
    candidateSkillsLower.some((skill) => keyword.includes(skill) || skill.includes(keyword)),
  );
}

function scoreSkills(candidate: CandidateMatchingProfile, offer: OfferMatchingProfile): MatchFactor {
  if (candidate.skills.length === 0) {
    return { code: 'skills', level: 'unknown', weight: WEIGHTS.skills, messageKey: 'matching.skills.unknown' };
  }

  const candidateSkillsLower = candidate.skills.map((skill) => skill.trim().toLowerCase()).filter(Boolean);
  const requiredText = offer.requiredQualifications?.trim() ?? '';
  const preferredText = offer.preferredQualifications?.trim() ?? '';
  const hasExplicitRequirements = requiredText.length > 0 || preferredText.length > 0;

  if (hasExplicitRequirements) {
    const requiredKeywords = requiredText ? extractKeywords(requiredText) : [];
    const preferredKeywords = preferredText ? extractKeywords(preferredText) : [];
    const requiredMatched = matchedKeywords(requiredKeywords, candidateSkillsLower);
    const preferredMatched = matchedKeywords(preferredKeywords, candidateSkillsLower);
    const totalMatched = new Set([...requiredMatched, ...preferredMatched]).size;

    let level: MatchLevel;
    if (requiredKeywords.length > 0) {
      const requiredRate = requiredMatched.length / requiredKeywords.length;
      if (requiredRate >= 0.15) level = 'match';
      else if (requiredMatched.length > 0 || preferredMatched.length > 0) level = 'partial';
      else level = 'mismatch';
    } else {
      // Preferred-only evidence can improve relevance, but must never be
      // presented as proof that a required qualification was satisfied.
      level = preferredMatched.length > 0 ? 'partial' : 'mismatch';
    }

    return {
      code: 'skills',
      level,
      weight: WEIGHTS.skills,
      messageKey:
        level === 'match'
          ? 'matching.skills.match'
          : level === 'partial'
            ? 'matching.skills.partial'
            : 'matching.skills.mismatch',
      ...(level === 'match' || level === 'partial' ? { messageParams: { count: totalMatched } } : {}),
      evidenceSource: 'explicit_requirements',
      requiredMatchCount: requiredMatched.length,
      preferredMatchCount: preferredMatched.length,
    };
  }

  // Backwards compatibility for offers created before the explicit
  // qualification fields were wired through the application layer.
  const offerKeywords = extractKeywords(`${offer.title} ${offer.description}`);
  const matched = matchedKeywords(offerKeywords, candidateSkillsLower);
  const rate = offerKeywords.length === 0 ? 0 : matched.length / offerKeywords.length;

  if (rate >= 0.15) {
    return {
      code: 'skills',
      level: 'match',
      weight: WEIGHTS.skills,
      messageKey: 'matching.skills.match',
      messageParams: { count: matched.length },
      evidenceSource: 'description_fallback',
    };
  }
  if (matched.length > 0) {
    return {
      code: 'skills',
      level: 'partial',
      weight: WEIGHTS.skills,
      messageKey: 'matching.skills.partial',
      messageParams: { count: matched.length },
      evidenceSource: 'description_fallback',
    };
  }
  return {
    code: 'skills',
    level: 'mismatch',
    weight: WEIGHTS.skills,
    messageKey: 'matching.skills.mismatch',
    evidenceSource: 'description_fallback',
  };
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
