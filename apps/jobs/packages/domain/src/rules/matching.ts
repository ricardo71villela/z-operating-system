// packages/domain/src/rules/matching.ts
//
// Motor de relevância candidato <-> oferta. Mesmo princípio do
// Employment Responsibility Index (employerResponsibility.ts): a
// pontuação é sempre explicável por fatores observáveis, nunca uma
// caixa-preta. Isto NÃO é machine learning nem correspondência
// semântica — é correspondência de atributos declarados, honesta sobre
// o que é (um filtro estruturado), não fingindo ser mais do que isso.
//
// Objetivo: resolver a lacuna identificada na auditoria — "toda a
// energia foi para 'esta oferta é verdadeira', zero para 'esta oferta é
// boa para ti'". Um candidato não devia ter de ler 200 ofertas para
// encontrar as 3 relevantes.
//
// i18n: as explicações são geradas como chave de mensagem + parâmetros
// (ver packages/domain/src/i18n/messages.ts), NUNCA como frase já
// traduzida — a plataforma já tinha um sistema de tradução real (para
// conteúdo de ofertas), e este módulo tinha ficado de fora dele,
// cozendo texto em português diretamente na função. Corrigido.

import { renderMessage } from '../i18n/messages';
import type { MessageLocale, MessageParams } from '../i18n/messages';

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
  weight: number; // 0-1, soma de todos os pesos = 1
  messageKey: string;
  messageParams?: MessageParams;
}

export interface MatchResult {
  score: number; // 0-100
  factors: MatchFactor[];
}

export interface CandidateMatchingProfile {
  skills: string[];
  desiredContractTypes: string[]; // vazio = sem preferência declarada, nunca penaliza
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

// Pesos explícitos e documentados — nunca escondidos, ajustáveis com
// intenção, não por acidente. Somam sempre 1.
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
    .filter((w) => w.length > 4 && !STOPWORDS_PT.has(w));
  return [...new Set(words)];
}

function scoreSkills(candidate: CandidateMatchingProfile, offer: OfferMatchingProfile): MatchFactor {
  if (candidate.skills.length === 0) {
    return { code: 'skills', level: 'unknown', weight: WEIGHTS.skills, messageKey: 'matching.skills.unknown' };
  }
  const offerKeywords = extractOfferKeywords(offer);
  const candidateSkillsLower = candidate.skills.map((s) => s.toLowerCase());
  const matched = offerKeywords.filter((kw) => candidateSkillsLower.some((s) => kw.includes(s) || s.includes(kw)));
  const rate = offerKeywords.length === 0 ? 0 : matched.length / offerKeywords.length;

  if (rate >= 0.15) return { code: 'skills', level: 'match', weight: WEIGHTS.skills, messageKey: 'matching.skills.match', messageParams: { count: matched.length } };
  if (matched.length > 0) return { code: 'skills', level: 'partial', weight: WEIGHTS.skills, messageKey: 'matching.skills.partial', messageParams: { count: matched.length } };
  return { code: 'skills', level: 'mismatch', weight: WEIGHTS.skills, messageKey: 'matching.skills.mismatch' };
}

function scoreContractType(candidate: CandidateMatchingProfile, offer: OfferMatchingProfile): MatchFactor {
  if (candidate.desiredContractTypes.length === 0) {
    return { code: 'contract_type', level: 'unknown', weight: WEIGHTS.contract_type, messageKey: 'matching.contract_type.unknown' };
  }
  const level: MatchLevel = candidate.desiredContractTypes.includes(offer.contractType) ? 'match' : 'mismatch';
  return {
    code: 'contract_type', level, weight: WEIGHTS.contract_type,
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
  // Remoto e híbrido são frequentemente aceitáveis um pelo outro — parcial, não incompatível.
  const compatible = (candidate.desiredWorkRegime === 'remote' && offer.workRegime === 'hybrid')
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
  return { code: 'salary_fit', level, weight: WEIGHTS.salary_fit, messageKey: 'matching.salary_fit.below', messageParams: { gap: gap.toFixed(0), currency: offer.salaryCurrency } };
}

function scoreLifeStage(candidate: CandidateMatchingProfile, offer: OfferMatchingProfile): MatchFactor {
  const wantsThisPillar =
    (offer.pillar === 'first_jobs' && candidate.interestedInFirstJob) ||
    (offer.pillar === 'senior_careers' && candidate.interestedInSeniorRoles) ||
    (offer.contractType === 'interim' && candidate.interestedInInterim) ||
    offer.pillar === 'professional_careers'; // pilar neutro, nunca desqualifica

  if (!candidate.interestedInFirstJob && !candidate.interestedInSeniorRoles && !candidate.interestedInInterim) {
    return { code: 'life_stage', level: 'unknown', weight: WEIGHTS.life_stage, messageKey: 'matching.life_stage.unknown' };
  }
  return {
    code: 'life_stage', level: wantsThisPillar ? 'match' : 'partial', weight: WEIGHTS.life_stage,
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

const LEVEL_SCORE: Record<MatchLevel, number> = { match: 1, partial: 0.5, unknown: 0.5, mismatch: 0 };

export function computeMatchScore(candidate: CandidateMatchingProfile, offer: OfferMatchingProfile): MatchResult {
  const factors = [
    scoreSkills(candidate, offer),
    scoreContractType(candidate, offer),
    scoreWorkRegime(candidate, offer),
    scoreSalaryFit(candidate, offer),
    scoreLifeStage(candidate, offer),
    scoreLocation(candidate, offer),
  ];

  const score = factors.reduce((sum, f) => sum + f.weight * LEVEL_SCORE[f.level], 0) * 100;
  return { score: Math.round(score * 10) / 10, factors };
}

/** Renderiza os fatores num idioma concreto — usado pela API, nunca pelos testes (que verificam messageKey/params, não texto). */
export function explainMatchFactors(factors: MatchFactor[], locale: MessageLocale): (MatchFactor & { explanation: string })[] {
  return factors.map((f) => ({ ...f, explanation: renderMessage(f.messageKey, locale, f.messageParams) }));
}
