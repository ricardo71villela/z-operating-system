// packages/domain/src/rules/candidateScore.ts
//
// Pontuação de candidato para o empregador — a peça em falta do lado
// oposto de matching.ts (que ordena ofertas para o candidato). Aqui é
// o inverso: ajudar o empregador a perceber, entre os candidatos que se
// candidataram, quais estão mais alinhados com o que a oferta pede.
//
// ============================================================================
// AVISO OBRIGATÓRIO — LER ANTES DE ALTERAR ESTE FICHEIRO
// ============================================================================
// Um sistema que "avalia candidatos" está expressamente classificado como
// ALTO RISCO pelo Artigo 6.º(2) e Anexo III, ponto 4, do AI Act da UE —
// com aplicação obrigatória desde 2 de agosto de 2026. Isto não é uma
// nota de rodapé legal, é uma restrição de arquitetura:
//
// 1. NUNCA decide sozinho. Este módulo só pode ser usado para ORDENAR e
//    INFORMAR — nunca para avançar, rejeitar, ou filtrar automaticamente
//    uma candidatura. Essas ações continuam a exigir uma chamada
//    explícita e humana às rotas de transição de estado já existentes
//    (application.ts) — nenhuma rota nova de "auto-decisão" deve alguma
//    vez ser construída a usar isto.
//
// 2. NUNCA usa características protegidas. Idade, género, nacionalidade,
//    religião, deficiência, estado civil, fotografia — nenhum destes
//    campos entra nesta função, mesmo que estivessem disponíveis (não
//    estão: vivem em candidate_private_data, uma tabela à parte, nunca
//    lida por este módulo).
//
// 3. SEMPRE explicável. Mesmo princípio do ERI (employerResponsibility.ts)
//    e do matching.ts: nunca uma pontuação sem fatores visíveis.
//
// 4. SEMPRE registado. Quem chama este módulo a partir da API tem de
//    escrever um audit log (ver server.ts) — o Artigo 12.º exige
//    retenção de registos de utilização de pelo menos 6 meses.
//
// 5. O candidato tem direito a saber, na SUA própria língua. Isto não
//    deve ser um sistema escondido nem preso a um único idioma — ver
//    nota de i18n abaixo.
// ============================================================================
//
// i18n: tal como matching.ts, este módulo devolve messageKey + params,
// nunca frases já traduzidas — ver packages/domain/src/i18n/messages.ts.

import { renderMessage } from '../i18n/messages';
import type { MessageLocale, MessageParams } from '../i18n/messages';

export type ScoreLevel = 'strong' | 'moderate' | 'weak' | 'unknown';

export interface CandidateScoreFactor {
  code: 'skills_relevance' | 'experience_depth' | 'language_fit' | 'profile_completeness' | 'availability_fit';
  level: ScoreLevel;
  weight: number; // soma de todos os pesos = 1
  messageKey: string;
  messageParams?: MessageParams;
}

export interface CandidateScoreResult {
  score: number; // 0-100
  factors: CandidateScoreFactor[];
  /** Nunca omitir ao mostrar isto a um empregador — ver aviso no topo do ficheiro. */
  advisoryOnly: true;
  disclaimerKey: string;
}

export interface CandidateScoringInput {
  skills: string[];
  languages: string[]; // códigos de idioma, ex: ['pt', 'en']
  experienceCount: number;
  experienceDescriptionsWithQuantifiedAchievements: number; // ver cvStudio.ts
  profileCompletenessScore: number; // 0-100, ver candidateProfile.ts
  availability: 'immediate' | 'in_30_days' | 'in_90_days' | 'not_looking' | null;
}

export interface OfferScoringInput {
  title: string;
  description: string;
  languageHints: string[]; // idiomas mencionados no texto da oferta, se algum
}

const WEIGHTS: Record<CandidateScoreFactor['code'], number> = {
  skills_relevance: 0.35,
  experience_depth: 0.25,
  language_fit: 0.15,
  profile_completeness: 0.15,
  availability_fit: 0.1,
};

const STOPWORDS = new Set(['para', 'com', 'uma', 'que', 'dos', 'das', 'nos', 'nas', 'por', 'sem', 'ser', 'the', 'and', 'for', 'with']);

function extractKeywords(text: string): string[] {
  return [...new Set(
    text.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 4 && !STOPWORDS.has(w)),
  )];
}

function scoreSkillsRelevance(candidate: CandidateScoringInput, offer: OfferScoringInput): CandidateScoreFactor {
  if (candidate.skills.length === 0) {
    return { code: 'skills_relevance', level: 'unknown', weight: WEIGHTS.skills_relevance, messageKey: 'score.skills.unknown' };
  }
  const offerKeywords = extractKeywords(`${offer.title} ${offer.description}`);
  const candidateSkillsLower = candidate.skills.map((s) => s.toLowerCase());
  const matched = offerKeywords.filter((kw) => candidateSkillsLower.some((s) => kw.includes(s) || s.includes(kw)));
  const rate = offerKeywords.length === 0 ? 0 : matched.length / offerKeywords.length;

  if (rate >= 0.2) return { code: 'skills_relevance', level: 'strong', weight: WEIGHTS.skills_relevance, messageKey: 'score.skills.strong', messageParams: { count: matched.length } };
  if (matched.length > 0) return { code: 'skills_relevance', level: 'moderate', weight: WEIGHTS.skills_relevance, messageKey: 'score.skills.moderate', messageParams: { count: matched.length } };
  return { code: 'skills_relevance', level: 'weak', weight: WEIGHTS.skills_relevance, messageKey: 'score.skills.weak' };
}

function scoreExperienceDepth(candidate: CandidateScoringInput): CandidateScoreFactor {
  if (candidate.experienceCount === 0) {
    return { code: 'experience_depth', level: 'unknown', weight: WEIGHTS.experience_depth, messageKey: 'score.experience.unknown' };
  }
  if (candidate.experienceDescriptionsWithQuantifiedAchievements > 0) {
    return { code: 'experience_depth', level: 'strong', weight: WEIGHTS.experience_depth, messageKey: 'score.experience.strong' };
  }
  if (candidate.experienceCount >= 2) {
    return { code: 'experience_depth', level: 'moderate', weight: WEIGHTS.experience_depth, messageKey: 'score.experience.moderate', messageParams: { count: candidate.experienceCount } };
  }
  return { code: 'experience_depth', level: 'weak', weight: WEIGHTS.experience_depth, messageKey: 'score.experience.weak' };
}

function scoreLanguageFit(candidate: CandidateScoringInput, offer: OfferScoringInput): CandidateScoreFactor {
  if (offer.languageHints.length === 0) {
    return { code: 'language_fit', level: 'unknown', weight: WEIGHTS.language_fit, messageKey: 'score.language.unknown' };
  }
  const candidateLangs = new Set(candidate.languages.map((l) => l.toLowerCase()));
  const matched = offer.languageHints.filter((l) => candidateLangs.has(l.toLowerCase()));
  if (matched.length === offer.languageHints.length) {
    return { code: 'language_fit', level: 'strong', weight: WEIGHTS.language_fit, messageKey: 'score.language.strong' };
  }
  if (matched.length > 0) {
    return { code: 'language_fit', level: 'moderate', weight: WEIGHTS.language_fit, messageKey: 'score.language.moderate' };
  }
  return { code: 'language_fit', level: 'weak', weight: WEIGHTS.language_fit, messageKey: 'score.language.weak' };
}

function scoreProfileCompleteness(candidate: CandidateScoringInput): CandidateScoreFactor {
  if (candidate.profileCompletenessScore >= 80) {
    return { code: 'profile_completeness', level: 'strong', weight: WEIGHTS.profile_completeness, messageKey: 'score.completeness.strong' };
  }
  if (candidate.profileCompletenessScore >= 40) {
    return { code: 'profile_completeness', level: 'moderate', weight: WEIGHTS.profile_completeness, messageKey: 'score.completeness.moderate' };
  }
  return { code: 'profile_completeness', level: 'weak', weight: WEIGHTS.profile_completeness, messageKey: 'score.completeness.weak' };
}

function scoreAvailabilityFit(candidate: CandidateScoringInput): CandidateScoreFactor {
  if (!candidate.availability || candidate.availability === 'not_looking') {
    return { code: 'availability_fit', level: 'unknown', weight: WEIGHTS.availability_fit, messageKey: 'score.availability.unknown' };
  }
  if (candidate.availability === 'immediate') {
    return { code: 'availability_fit', level: 'strong', weight: WEIGHTS.availability_fit, messageKey: 'score.availability.strong' };
  }
  return { code: 'availability_fit', level: 'moderate', weight: WEIGHTS.availability_fit, messageKey: 'score.availability.moderate', messageParams: { availability: candidate.availability } };
}

const LEVEL_SCORE: Record<ScoreLevel, number> = { strong: 1, moderate: 0.5, unknown: 0.5, weak: 0 };

export function computeCandidateScore(candidate: CandidateScoringInput, offer: OfferScoringInput): CandidateScoreResult {
  const factors = [
    scoreSkillsRelevance(candidate, offer),
    scoreExperienceDepth(candidate),
    scoreLanguageFit(candidate, offer),
    scoreProfileCompleteness(candidate),
    scoreAvailabilityFit(candidate),
  ];
  const score = factors.reduce((sum, f) => sum + f.weight * LEVEL_SCORE[f.level], 0) * 100;
  return { score: Math.round(score * 10) / 10, factors, advisoryOnly: true, disclaimerKey: 'score.disclaimer' };
}

/** Renderiza a pontuação num idioma concreto — só a camada da API deve chamar isto. */
export function explainCandidateScore(result: CandidateScoreResult, locale: MessageLocale) {
  return {
    ...result,
    disclaimer: renderMessage(result.disclaimerKey, locale),
    factors: result.factors.map((f) => ({ ...f, explanation: renderMessage(f.messageKey, locale, f.messageParams) })),
  };
}
