// packages/domain/src/types/jobOffer.ts
// Tipos de domínio para Job Offer. Espelham as migrations 0005/0007.

export type JobOfferStatus =
  | 'draft'
  | 'pending_review'
  | 'needs_changes'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'paused'
  | 'filled'
  | 'expired'
  | 'rejected'
  | 'suspended'
  | 'archived';

export type ContractType =
  | 'permanent'
  | 'fixed_term'
  | 'temporary_agency'
  | 'interim'
  | 'project_based'
  | 'seasonal'
  | 'paid_internship'
  | 'trainee_program'
  | 'replacement_contract'
  | 'other';

export type SalaryPeriod = 'hourly' | 'daily' | 'monthly' | 'yearly';
export type WorkRegime = 'on_site' | 'hybrid' | 'remote';
export type JobPillar = 'first_jobs' | 'professional_careers' | 'senior_careers';
export type VerificationStatus =
  | 'unverified'
  | 'pending'
  | 'verified'
  | 'enhanced_verified'
  | 'restricted'
  | 'suspended'
  | 'rejected';

export interface JobOfferDraft {
  id?: string;
  organizationId: string;
  title: string;
  description: string;
  contractType: ContractType;
  salaryMin: number;
  salaryMax?: number | null;
  salaryCurrency: string;
  salaryPeriod: SalaryPeriod;
  hasFixedSalary: boolean;
  variableCompensationNotes?: string | null;
  workRegime: WorkRegime;
  locationId?: string | null;
  employerIdentified: boolean; // organização claramente identificada (não anónima)
  applicationDeadline?: string | null;
  pillar: JobPillar;
  status: JobOfferStatus;

  /**
   * Campos exclusivos de trabalho temporário/interim (contractType em
   * TEMP_AGENCY_CONTRACT_TYPES — ver jobOffer.ts). A relação é
   * tripartida: organizationId é sempre a ETT/agência que publica a
   * oferta (o empregador legal, reconhecido como tal pela Diretiva
   * 2008/104/CE); userCompanyName é a empresa onde o trabalho é
   * efetivamente prestado. Nunca a mesma entidade — ver validação.
   */
  userCompanyName?: string | null;
  userCompanyLocationId?: string | null;
  assignmentEndDate?: string | null;
  /**
   * Atestação de que a remuneração e condições de base oferecidas
   * correspondem, pelo menos, às de um trabalhador equivalente contratado
   * diretamente pela empresa utilizadora para a mesma função — o
   * "princípio da igualdade de tratamento" do Artigo 5.º, n.º 1 da
   * Diretiva. Nunca assumido como verdadeiro por omissão.
   */
  equalTreatmentConfirmed?: boolean;
  /**
   * Referência a uma convenção coletiva que institua uma derrogação ao
   * princípio de igualdade de tratamento (Artigo 5.º, n.º 3) — comum e
   * legal em vários Estados-Membros, incluindo Portugal. Preenchido,
   * `equalTreatmentConfirmed` pode ser falso sem bloquear a publicação,
   * mas a derrogação tem de ser identificável, nunca silenciosa.
   */
  collectiveAgreementDerogationReference?: string | null;
  /**
   * Artigo 6.º, n.º 1: trabalhadores temporários devem ser informados de
   * vagas permanentes na empresa utilizadora, para poderem candidatar-se
   * em pé de igualdade com trabalhadores diretos.
   */
  informedOfPermanentVacancies?: boolean;
}

export interface EmployerContext {
  organizationId: string;
  verificationStatus: VerificationStatus;
  /**
   * Necessário para validar que a empresa utilizadora (trabalho
   * temporário/interim) não é a própria ETT/agência sob outro nome.
   */
  legalName?: string;
}

export interface ValidationIssue {
  field: string;
  code: string;
  message: string;
  /**
   * 'warning' sinaliza sem bloquear publicação (obrigação continuada,
   * não pré-requisito). Omitido = bloqueia sempre, como até aqui.
   */
  severity?: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}
