// packages/domain/src/rules/institution.ts
//
// Regra mínima do domínio de instituições (secção 9). Deliberadamente
// pequena: a secção 9 pede só os modelos e limites fundamentais, não uma
// solução universitária completa.

export type InstitutionOrgType = 'university' | 'polytechnic' | 'vocational_school' | 'training_center';

const INSTITUTION_TYPES: InstitutionOrgType[] = ['university', 'polytechnic', 'vocational_school', 'training_center'];

export function isInstitutionType(orgType: string): orgType is InstitutionOrgType {
  return INSTITUTION_TYPES.includes(orgType as InstitutionOrgType);
}

export interface ReservationEligibilityInput {
  offerStatus: string;
  offerOrganizationVerified: boolean;
  institutionOrgType: string;
}

export interface ReservationEligibilityResult {
  eligible: boolean;
  reasons: string[];
}

/**
 * Uma oferta só pode ser reservada a uma instituição se:
 * - já estiver aprovada/publicada (não faz sentido reservar um rascunho);
 * - o empregador estiver verificado (mesma barreira de confiança de
 *   qualquer outra publicação — secção 7);
 * - o alvo da reserva for de facto um tipo de instituição de ensino/
 *   formação, não uma empresa comum ou agência.
 */
export function canReserveOfferForInstitution(input: ReservationEligibilityInput): ReservationEligibilityResult {
  const reasons: string[] = [];

  if (!['approved', 'published'].includes(input.offerStatus)) {
    reasons.push('A oferta tem de estar aprovada ou publicada antes de ser reservada.');
  }
  if (!input.offerOrganizationVerified) {
    reasons.push('O empregador tem de estar verificado.');
  }
  if (!isInstitutionType(input.institutionOrgType)) {
    reasons.push('O destinatário da reserva tem de ser uma instituição de ensino ou formação.');
  }

  return { eligible: reasons.length === 0, reasons };
}
