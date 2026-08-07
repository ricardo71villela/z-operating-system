// packages/domain/src/rules/employerResponsibility.ts
//
// Employment Responsibility Index (secção 8). Componentes separados e
// auditáveis, não uma fórmula única arbitrária. Os selos resultam de
// critérios verificáveis e NUNCA podem ser comprados — esta função é a
// única fonte de verdade sobre quando um selo é atribuído.

export interface EmployerMetrics {
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'enhanced_verified' | 'restricted' | 'suspended' | 'rejected';
  publishedOffersCount: number;
  offersWithFixedSalaryCount: number;
  offersWithCompleteFieldsCount: number;
  responseRate: number; // 0-1
  candidatesInformedRate: number; // 0-1
  confirmedComplaintsCount: number;
  offerVsRealityDivergenceCount: number;
  firstJobHiresCount: number;
  seniorHiresCount: number;
}

export interface ResponsibilityComponents {
  salaryTransparencyScore: number; // 0-100
  offerCompletenessScore: number; // 0-100
  responseScore: number; // 0-100
  integrityScore: number; // 0-100, penalizado por reclamações/divergências
}

export type BadgeCode =
  | 'verified_employer'
  | 'salary_transparent_employer'
  | 'first_job_employer'
  | 'age_inclusive_employer'
  | 'responsible_recruiter';

export const BADGE_LABELS: Record<BadgeCode, string> = {
  verified_employer: 'Verified Employer',
  salary_transparent_employer: 'Salary Transparent Employer',
  first_job_employer: 'First Job Employer',
  age_inclusive_employer: 'Age Inclusive Employer',
  responsible_recruiter: 'Responsible Recruiter',
};

export function computeResponsibilityComponents(m: EmployerMetrics): ResponsibilityComponents {
  const salaryTransparencyScore = m.publishedOffersCount === 0
    ? 0
    : Math.round((m.offersWithFixedSalaryCount / m.publishedOffersCount) * 100);

  const offerCompletenessScore = m.publishedOffersCount === 0
    ? 0
    : Math.round((m.offersWithCompleteFieldsCount / m.publishedOffersCount) * 100);

  const responseScore = Math.round(((m.responseRate + m.candidatesInformedRate) / 2) * 100);

  const penalty = Math.min(100, m.confirmedComplaintsCount * 20 + m.offerVsRealityDivergenceCount * 15);
  const integrityScore = Math.max(0, 100 - penalty);

  return { salaryTransparencyScore, offerCompletenessScore, responseScore, integrityScore };
}

/**
 * Critérios verificáveis e explícitos por selo. Nenhum selo depende de
 * pagamento — apenas de dados observáveis da própria plataforma.
 */
export function computeEligibleBadges(m: EmployerMetrics): BadgeCode[] {
  const c = computeResponsibilityComponents(m);
  const badges: BadgeCode[] = [];

  if (m.verificationStatus === 'verified' || m.verificationStatus === 'enhanced_verified') {
    badges.push('verified_employer');
  }

  // Exige verificação + histórico real (não apenas 1 oferta isolada) para
  // evitar selo "barato" com dados insuficientes.
  if (
    (m.verificationStatus === 'verified' || m.verificationStatus === 'enhanced_verified') &&
    c.salaryTransparencyScore === 100 &&
    m.publishedOffersCount >= 3
  ) {
    badges.push('salary_transparent_employer');
  }

  if (
    (m.verificationStatus === 'verified' || m.verificationStatus === 'enhanced_verified') &&
    m.firstJobHiresCount >= 1
  ) {
    badges.push('first_job_employer');
  }

  if (
    (m.verificationStatus === 'verified' || m.verificationStatus === 'enhanced_verified') &&
    m.seniorHiresCount >= 1
  ) {
    badges.push('age_inclusive_employer');
  }

  if (
    (m.verificationStatus === 'verified' || m.verificationStatus === 'enhanced_verified') &&
    c.responseScore >= 80 &&
    c.integrityScore === 100
  ) {
    badges.push('responsible_recruiter');
  }

  return badges;
}
