// packages/domain/src/rules/jobOffer.ts
//
// Motor de validação de ofertas de emprego. Implementa as regras
// não-negociáveis das secções 3.2 e 3.3 do documento de princípios.
//
// IMPORTANTE: esta validação corre no domain layer (server-side), não só
// na UI. RLS impede publicação por empregadores não verificados; esta
// função impede publicação de ofertas materialmente inválidas mesmo por
// empregadores verificados.

import type {
  JobOfferDraft,
  EmployerContext,
  ValidationResult,
  ValidationIssue,
} from '../types/jobOffer';

const COMMISSION_ONLY_KEYWORDS = [
  'apenas comissão',
  'apenas à comissão',
  'sem ordenado fixo',
  'ganhos ilimitados',
  'sem limite de ganhos',
  'trabalhador independente obrigatório',
  'recibos verdes obrigatórios',
];

const PYRAMID_MLM_KEYWORDS = [
  'marketing multinível',
  'plano de compensação',
  'construa a sua equipa',
  'invista para começar',
  'taxa de inscrição',
];

/**
 * 'temporary_agency' e 'interim' são, para efeitos da Diretiva
 * 2008/104/CE, a mesma relação jurídica tripartida (agência, trabalhador,
 * empresa utilizadora) — tratados de forma idêntica nas regras abaixo.
 * Mantidos como valores separados no enum porque no mercado português
 * "interim" é usado coloquialmente mesmo quando a ETT não está
 * formalmente licenciada como tal — a distinção interessa para relatórios,
 * não para as obrigações de transparência.
 */
export const TEMP_AGENCY_CONTRACT_TYPES: string[] = ['temporary_agency', 'interim'];

export function validateJobOfferForPublication(
  offer: JobOfferDraft,
  employer: EmployerContext,
): ValidationResult {
  const issues: ValidationIssue[] = [];

  // --- 3.7: só empregador verificado pode publicar ---
  if (!['verified', 'enhanced_verified'].includes(employer.verificationStatus)) {
    issues.push({
      field: 'organizationId',
      code: 'EMPLOYER_NOT_VERIFIED',
      message: 'Apenas empregadores verificados podem publicar ofertas.',
    });
  }

  // --- 3.2/3.3: remuneração fixa garantida, obrigatória ---
  if (!offer.hasFixedSalary) {
    issues.push({
      field: 'hasFixedSalary',
      code: 'MISSING_FIXED_SALARY',
      message:
        'A oferta deve garantir remuneração base fixa. Ofertas exclusivamente ' +
        'à comissão não podem ser publicadas.',
    });
  }

  if (offer.salaryMin === undefined || offer.salaryMin === null || offer.salaryMin <= 0) {
    issues.push({
      field: 'salaryMin',
      code: 'INVALID_SALARY_MIN',
      message: 'O salário mínimo deve ser um valor positivo estruturado.',
    });
  }

  if (
    offer.salaryMax !== null &&
    offer.salaryMax !== undefined &&
    offer.salaryMax < offer.salaryMin
  ) {
    issues.push({
      field: 'salaryMax',
      code: 'SALARY_MAX_BELOW_MIN',
      message: 'O salário máximo não pode ser inferior ao salário mínimo.',
    });
  }

  if (!offer.salaryCurrency) {
    issues.push({
      field: 'salaryCurrency',
      code: 'MISSING_CURRENCY',
      message: 'A moeda do salário é obrigatória.',
    });
  }

  // --- 3.3: empregador identificável ---
  if (!offer.employerIdentified) {
    issues.push({
      field: 'employerIdentified',
      code: 'EMPLOYER_NOT_IDENTIFIABLE',
      message: 'A entidade empregadora deve ser claramente identificada.',
    });
  }

  // --- 3.3: linguagem sugerindo trabalho apenas à comissão / disfarçado ---
  const haystack = `${offer.title} ${offer.description} ${offer.variableCompensationNotes ?? ''}`
    .toLowerCase();

  if (COMMISSION_ONLY_KEYWORDS.some((kw) => haystack.includes(kw))) {
    issues.push({
      field: 'description',
      code: 'SUSPECTED_COMMISSION_ONLY_LANGUAGE',
      message:
        'A descrição contém linguagem associada a trabalho exclusivamente ' +
        'à comissão. Requer revisão humana antes de publicação.',
    });
  }

  if (PYRAMID_MLM_KEYWORDS.some((kw) => haystack.includes(kw))) {
    issues.push({
      field: 'description',
      code: 'SUSPECTED_MLM_OR_PAY_TO_APPLY',
      message:
        'A descrição contém linguagem associada a marketing multinível ou ' +
        'a pagamentos exigidos ao candidato. Isto é uma exclusão imperativa ' +
        '(secção 3.3) e bloqueia a publicação.',
      // Nota: este código bloqueia sempre, mesmo após revisão humana,
      // porque a secção 3.3 classifica isto como exclusão imperativa.
    });
  }

  // --- Coerência mínima título/descrição/contrato ---
  if (offer.title.trim().length < 3) {
    issues.push({
      field: 'title',
      code: 'TITLE_TOO_SHORT',
      message: 'O título da oferta é demasiado curto para ser significativo.',
    });
  }

  if (offer.description.trim().length < 40) {
    issues.push({
      field: 'description',
      code: 'DESCRIPTION_TOO_SHORT',
      message: 'A descrição deve conter informação suficiente sobre a função.',
    });
  }

  // --- Trabalho temporário / interim (Diretiva 2008/104/CE, Artigos 5.º e 6.º) ---
  //
  // A relação é tripartida: a organização que publica a oferta
  // (organizationId) é sempre a ETT/agência — reconhecida como
  // empregador legal pela Diretiva (Art. 1.º, n.º 2). A empresa onde o
  // trabalho é efetivamente prestado ("empresa utilizadora") é uma
  // entidade DIFERENTE, que tem de ser identificada separadamente. Sem
  // isto, a oferta esconde precisamente a informação que a Diretiva
  // exige tornar transparente.
  if (TEMP_AGENCY_CONTRACT_TYPES.includes(offer.contractType)) {
    if (!offer.userCompanyName || offer.userCompanyName.trim().length < 2) {
      issues.push({
        field: 'userCompanyName',
        code: 'MISSING_USER_COMPANY',
        message:
          'Ofertas de trabalho temporário/interim têm de identificar a empresa ' +
          'utilizadora (onde o trabalho é efetivamente prestado), separada da ' +
          'ETT/agência que publica a oferta.',
      });
    } else if (
      employer.legalName &&
      offer.userCompanyName.trim().toLowerCase() === employer.legalName.trim().toLowerCase()
    ) {
      issues.push({
        field: 'userCompanyName',
        code: 'USER_COMPANY_SAME_AS_AGENCY',
        message:
          'A empresa utilizadora não pode ser a mesma entidade que a ETT/agência ' +
          '— nesse caso o contrato não é trabalho temporário, é emprego direto ' +
          '(escolhe o tipo de contrato correto).',
      });
    }

    // Art. 5.º, n.º 1: princípio da igualdade de tratamento remuneratório.
    // Uma convenção coletiva pode legalmente derrogar isto (Art. 5.º,
    // n.º 3) — mas a derrogação tem de ser identificável, nunca
    // silenciosa. O que nunca é aceitável é nenhuma das duas coisas.
    if (!offer.equalTreatmentConfirmed && !offer.collectiveAgreementDerogationReference) {
      issues.push({
        field: 'equalTreatmentConfirmed',
        code: 'EQUAL_TREATMENT_NOT_CONFIRMED',
        message:
          'É obrigatório confirmar que a remuneração corresponde à de um ' +
          'trabalhador equivalente contratado diretamente pela empresa ' +
          'utilizadora (Art. 5.º da Diretiva 2008/104/CE), ou identificar a ' +
          'convenção coletiva que institui uma derrogação legal a este princípio.',
      });
    }

    // Art. 6.º, n.º 1: informação sobre vagas permanentes na empresa
    // utilizadora. Só sinalizado, não bloqueia publicação — é uma
    // obrigação continuada ao longo da colocação, não um pré-requisito
    // para publicar o anúncio inicial.
    if (offer.informedOfPermanentVacancies !== true) {
      issues.push({
        field: 'informedOfPermanentVacancies',
        code: 'PERMANENT_VACANCY_INFORMATION_PENDING',
        message:
          'Lembrete (não bloqueia publicação): a ETT deve manter o trabalhador ' +
          'informado de vagas permanentes na empresa utilizadora, para que possa ' +
          'candidatar-se em pé de igualdade com trabalhadores diretos (Art. 6.º).',
        severity: 'warning',
      });
    }
  }

  return { valid: issues.filter((i) => i.severity !== 'warning').length === 0, issues };
}

/** Transições de estado permitidas para job_offer_status (secção 10). */
export const JOB_OFFER_TRANSITIONS: Record<string, string[]> = {
  draft: ['pending_review', 'archived'],
  pending_review: ['approved', 'needs_changes', 'rejected'],
  needs_changes: ['pending_review', 'archived'],
  approved: ['scheduled', 'published'],
  scheduled: ['published', 'archived'],
  published: ['paused', 'filled', 'expired', 'suspended'],
  paused: ['published', 'archived', 'expired'],
  filled: ['archived'],
  expired: ['archived'],
  rejected: ['pending_review', 'archived'],
  suspended: ['archived'],
  archived: [],
};

export function canTransition(from: string, to: string): boolean {
  return JOB_OFFER_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Só permite transitar para 'approved' ou 'published' se a oferta passar
 * na validação de publicação. Esta função combina as duas verificações
 * porque, na prática, "aprovar" e "publicar" sem esta validação seria o
 * ponto exato onde o princípio "quem trabalha merece salário garantido"
 * poderia ser contornado.
 */
export function canApproveOrPublish(
  offer: JobOfferDraft,
  employer: EmployerContext,
): ValidationResult {
  return validateJobOfferForPublication(offer, employer);
}
