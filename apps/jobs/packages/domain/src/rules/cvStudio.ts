// packages/domain/src/rules/cvStudio.ts
//
// Estúdio de CV e Carta de Motivação. Regras puras de qualidade de
// conteúdo — nunca bloqueiam o candidato (o candidato nunca é impedido
// de submeter por qualidade insuficiente), apenas orientam. Mesmo
// princípio de candidateProfile.ts: pontuação serve o candidato, não
// restringe funcionalidades gratuitas.
//
// Este módulo complementa candidateProfile.ts (completude estrutural)
// com sinais de QUALIDADE de conteúdo: conquistas quantificadas, verbos
// de ação, correspondência com a oferta-alvo, e deteção de cartas de
// motivação genéricas.

export type SupportedLocale = 'pt' | 'it' | 'es' | 'fr' | 'de' | 'en';

/* ---------------- CV: qualidade de conteúdo ---------------- */

export interface ExperienceEntry {
  title: string;
  description: string;
}

export interface CVContentInput {
  locale: SupportedLocale;
  experiences: ExperienceEntry[];
  skills: string[];
  certifications: string[];
  hasPortfolioLink: boolean;
}

export interface CVQualitySignal {
  code:
    | 'NO_QUANTIFIED_ACHIEVEMENTS'
    | 'WEAK_ACTION_VERBS'
    | 'EXPERIENCE_TOO_SHORT'
    | 'NO_CERTIFICATIONS'
    | 'NO_PORTFOLIO';
  message: string;
}

export interface CVQualityResult {
  score: number; // 0-100, sinal de "força" do CV, não de completude estrutural
  signals: CVQualitySignal[];
}

// Deteção simples de números/percentagens nas descrições — sinal de
// conquista quantificada em vez de descrição vaga de responsabilidades.
const QUANTIFICATION_PATTERN = /\d+([.,]\d+)?\s*%?/;

const ACTION_VERBS: Record<SupportedLocale, string[]> = {
  pt: ['liderei', 'aumentei', 'reduzi', 'implementei', 'criei', 'geri', 'lancei', 'otimizei'],
  it: ['ho guidato', 'ho aumentato', 'ho ridotto', 'ho implementato', 'ho creato', 'ho gestito', 'ho lanciato'],
  es: ['lideré', 'aumenté', 'reduje', 'implementé', 'creé', 'gestioné', 'lancé', 'optimicé'],
  fr: ['j\'ai dirigé', 'j\'ai augmenté', 'j\'ai réduit', 'j\'ai mis en œuvre', 'j\'ai créé', 'j\'ai géré', 'j\'ai lancé'],
  de: ['leitete', 'steigerte', 'reduzierte', 'implementierte', 'erstellte', 'verwaltete', 'startete'],
  en: ['led', 'increased', 'reduced', 'implemented', 'created', 'managed', 'launched', 'optimized'],
};

export function computeCVQuality(input: CVContentInput): CVQualityResult {
  const signals: CVQualitySignal[] = [];
  let score = 100;

  const allDescriptions = input.experiences.map((e) => e.description.toLowerCase()).join(' ');

  const hasQuantification = input.experiences.some((e) =>
    QUANTIFICATION_PATTERN.test(e.description),
  );
  if (!hasQuantification && input.experiences.length > 0) {
    signals.push({
      code: 'NO_QUANTIFIED_ACHIEVEMENTS',
      message:
        'Nenhuma experiência tem um número ou percentagem associado. Descrições com ' +
        'impacto quantificado (ex.: "reduzi custos em 18%") destacam-se mais do que ' +
        'listas de responsabilidades.',
    });
    score -= 25;
  }

  const verbs = ACTION_VERBS[input.locale] ?? ACTION_VERBS.en;
  const hasActionVerb = verbs.some((v) => allDescriptions.includes(v));
  if (!hasActionVerb && input.experiences.length > 0) {
    signals.push({
      code: 'WEAK_ACTION_VERBS',
      message: 'As descrições não usam verbos de ação fortes no início das frases.',
    });
    score -= 15;
  }

  const hasShortEntry = input.experiences.some((e) => e.description.trim().length < 30);
  if (hasShortEntry) {
    signals.push({
      code: 'EXPERIENCE_TOO_SHORT',
      message: 'Pelo menos uma experiência tem uma descrição demasiado curta para ser avaliável.',
    });
    score -= 15;
  }

  if (input.certifications.length === 0) {
    signals.push({
      code: 'NO_CERTIFICATIONS',
      message: 'Nenhuma certificação associada ao perfil.',
    });
    score -= 10;
  }

  if (!input.hasPortfolioLink) {
    signals.push({
      code: 'NO_PORTFOLIO',
      message: 'Sem portefólio ou link externo associado.',
    });
    score -= 10;
  }

  return { score: Math.max(0, score), signals };
}

/* ---------------- CV: correspondência com a oferta-alvo ---------------- */

export interface KeywordMatchResult {
  matchedKeywords: string[];
  missingKeywords: string[];
  matchRate: number; // 0-1
}

/**
 * Compara o texto do CV com as palavras-chave extraídas da descrição da
 * oferta. Não é NLP — é correspondência literal simples, suficiente para
 * sinalizar lacunas óbvias antes da submissão. `offerKeywords` é gerado
 * fora deste módulo (ex.: extração simples de substantivos/termos da
 * oferta), este módulo só faz a comparação.
 */
export function matchCVAgainstOffer(cvText: string, offerKeywords: string[]): KeywordMatchResult {
  const haystack = cvText.toLowerCase();
  const matched: string[] = [];
  const missing: string[] = [];

  for (const kw of offerKeywords) {
    if (haystack.includes(kw.toLowerCase())) {
      matched.push(kw);
    } else {
      missing.push(kw);
    }
  }

  const matchRate = offerKeywords.length === 0 ? 1 : matched.length / offerKeywords.length;
  return { matchedKeywords: matched, missingKeywords: missing, matchRate };
}

/* ---------------- Templates: recomendação segundo compatibilidade ATS ---------------- */

export type CVTemplateCode = 'ats_safe' | 'visual_standard' | 'visual_creative';

export interface TemplateRecommendationInput {
  targetIndustry: 'tech' | 'creative' | 'corporate' | 'public_sector' | 'other';
  usesLargeATSEmployers: boolean; // candidato indicou que a maioria das ofertas-alvo é de grandes empregadores
}

/**
 * Regra simples e explícita, não um modelo de recomendação opaco: grandes
 * empregadores tendem a usar ATS que falham a ler colunas/tabelas/imagens,
 * por isso a segurança de leitura automática pesa mais do que estética
 * nesses casos.
 */
export function recommendCVTemplate(input: TemplateRecommendationInput): CVTemplateCode {
  if (input.usesLargeATSEmployers) return 'ats_safe';
  if (input.targetIndustry === 'creative') return 'visual_creative';
  return 'visual_standard';
}

/* ---------------- Carta de motivação: deteção de genérico ---------------- */

export interface CoverLetterInput {
  bodyText: string;
  employerName: string;
  jobOfferTitle: string;
}

export interface CoverLetterCheck {
  code: 'MISSING_EMPLOYER_NAME' | 'MISSING_JOB_TITLE' | 'TOO_SHORT' | 'GENERIC_OPENING_PHRASE';
  message: string;
}

export interface CoverLetterValidationResult {
  personalized: boolean;
  checks: CoverLetterCheck[];
}

// Frases de abertura genéricas comuns em cartas não personalizadas —
// lista pequena e deliberadamente conservadora, só para orientar o
// candidato, nunca para bloquear a submissão.
const GENERIC_OPENING_PHRASES = [
  'venho por este meio candidatar-me a uma vaga',
  'to whom it may concern',
  'i am writing to apply for a position',
];

/**
 * Nunca bloqueia a submissão da carta — mesmo princípio de todo o
 * domínio de candidato: orientação, não restrição. Serve para o
 * candidato perceber, antes de enviar, se a carta parece copiada e
 * colada em vez de escrita para aquela oferta específica.
 */
export function validateCoverLetterPersonalization(
  input: CoverLetterInput,
): CoverLetterValidationResult {
  const checks: CoverLetterCheck[] = [];
  const lower = input.bodyText.toLowerCase();

  if (!lower.includes(input.employerName.toLowerCase())) {
    checks.push({
      code: 'MISSING_EMPLOYER_NAME',
      message: `A carta não menciona o nome do empregador (${input.employerName}).`,
    });
  }

  if (!lower.includes(input.jobOfferTitle.toLowerCase())) {
    checks.push({
      code: 'MISSING_JOB_TITLE',
      message: `A carta não menciona o título da vaga (${input.jobOfferTitle}).`,
    });
  }

  if (input.bodyText.trim().length < 200) {
    checks.push({
      code: 'TOO_SHORT',
      message: 'A carta é demasiado curta para transmitir contexto real sobre a candidatura.',
    });
  }

  if (GENERIC_OPENING_PHRASES.some((p) => lower.includes(p))) {
    checks.push({
      code: 'GENERIC_OPENING_PHRASE',
      message: 'A carta começa com uma fórmula genérica associada a cartas não personalizadas.',
    });
  }

  return { personalized: checks.length === 0, checks };
}
