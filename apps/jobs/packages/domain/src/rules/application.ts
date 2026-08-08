// packages/domain/src/rules/application.ts
//
// Transições de estado de candidaturas (secção 11). Toda a mudança
// relevante deve gerar histórico — ver application_status_history (0006).

export type ApplicationStatus =
  | 'submitted'
  | 'received'
  | 'screening'
  | 'shortlisted'
  | 'interview'
  | 'assessment'
  | 'offer'
  | 'hired'
  | 'rejected'
  | 'withdrawn'
  | 'closed';

export const APPLICATION_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  submitted: ['received', 'withdrawn'],
  received: ['screening', 'rejected', 'withdrawn'],
  screening: ['shortlisted', 'rejected', 'withdrawn'],
  shortlisted: ['interview', 'rejected', 'withdrawn'],
  interview: ['assessment', 'offer', 'rejected', 'withdrawn'],
  assessment: ['offer', 'rejected', 'withdrawn'],
  offer: ['hired', 'rejected', 'withdrawn'],
  hired: ['closed'],
  rejected: ['closed'],
  withdrawn: ['closed'],
  closed: [],
};

export function canTransitionApplication(
  from: ApplicationStatus,
  to: ApplicationStatus,
): boolean {
  return APPLICATION_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * O candidato só pode, por si próprio, retirar a candidatura (withdrawn)
 * ou submetê-la. Todas as outras transições são acionadas pela empresa
 * (secção 11: "As empresas devem poder: ... registar decisões").
 */
export function isCandidateAllowedTransition(to: ApplicationStatus): boolean {
  return to === 'withdrawn';
}
