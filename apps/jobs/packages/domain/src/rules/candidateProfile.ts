// packages/domain/src/rules/candidateProfile.ts
//
// Completude do perfil de candidato. Não bloqueia nada (o candidato nunca
// é impedido de usar a plataforma por perfil incompleto — secção 3.1),
// mas alimenta indicadores de "perfil forte" e ordenação em Talent Discovery.

export interface CandidateProfileCompletenessInput {
  hasProfessionalTitle: boolean;
  hasSummary: boolean;
  experienceCount: number;
  educationCount: number;
  skillCount: number;
  languageCount: number;
  hasResumeDocument: boolean;
  hasVisibilitySet: boolean;
}

export interface CompletenessResult {
  score: number; // 0-100
  missing: string[];
}

const WEIGHTS: Record<string, number> = {
  professionalTitle: 10,
  summary: 15,
  experience: 25,
  education: 15,
  skills: 15,
  languages: 10,
  resume: 10,
};

export function computeProfileCompleteness(
  input: CandidateProfileCompletenessInput,
): CompletenessResult {
  let score = 0;
  const missing: string[] = [];

  if (input.hasProfessionalTitle) score += WEIGHTS.professionalTitle;
  else missing.push('professional_title');

  if (input.hasSummary) score += WEIGHTS.summary;
  else missing.push('summary');

  if (input.experienceCount > 0) score += WEIGHTS.experience;
  else missing.push('experience');

  if (input.educationCount > 0) score += WEIGHTS.education;
  else missing.push('education');

  if (input.skillCount > 0) score += WEIGHTS.skills;
  else missing.push('skills');

  if (input.languageCount > 0) score += WEIGHTS.languages;
  else missing.push('languages');

  if (input.hasResumeDocument) score += WEIGHTS.resume;
  else missing.push('resume');

  return { score, missing };
}

/**
 * Nunca usar esta pontuação para restringir funcionalidades gratuitas do
 * candidato (secção 3.1). Serve apenas para orientação do próprio
 * candidato ("o teu perfil está X% completo") e, com consentimento,
 * ordenação em Talent Discovery.
 */
