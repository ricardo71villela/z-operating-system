// packages/domain/src/rules/dataErasure.ts
//
// Candidate Erasure v1
//
// Este workflow remove exclusivamente a persona de candidato e os dados
// inequivocamente associados a essa persona.
//
// NÃO elimina:
// - a identidade Supabase Auth;
// - a identidade canónica ZOS;
// - jobs.persons;
// - atividade transversal da mesma pessoa noutros papéis do Z Jobs
//   (ex.: owner/recruiter/staff).
//
// Um eventual apagamento integral da conta/pessoa é um workflow separado.

export interface ErasureContext {
  candidateId: string;
}

export type CandidateErasureTable =
  | 'candidate_profiles'
  | 'candidate_private_data'
  | 'candidate_experiences'
  | 'candidate_education'
  | 'candidate_skills'
  | 'candidate_languages'
  | 'candidate_documents'
  | 'candidate_data_consents'
  | 'job_alerts'
  | 'saved_job_offers'
  | 'institution_affiliations'
  | 'applications'
  | 'application_status_history'
  | 'application_notes';

export type ErasureAction =
  | {
      table: CandidateErasureTable;
      action: 'delete';
      reason: string;
    }
  | {
      table: CandidateErasureTable;
      action: 'anonymize';
      reason: string;
    };

export interface ErasurePlan {
  candidateId: string;
  actions: ErasureAction[];

  // Refere-se apenas à persona de candidato.
  // A identidade/account transversal pode continuar a existir.
  fullyErased: boolean;
}

const CANDIDATE_ONLY_TABLES: CandidateErasureTable[] = [
  'candidate_profiles',
  'candidate_private_data',
  'candidate_experiences',
  'candidate_education',
  'candidate_skills',
  'candidate_languages',
  'candidate_documents',
  'candidate_data_consents',
  'job_alerts',
  'saved_job_offers',
  'institution_affiliations',
];

export function planCandidateErasure(ctx: ErasureContext): ErasurePlan {
  const actions: ErasureAction[] = [];

  for (const table of CANDIDATE_ONLY_TABLES) {
    actions.push({
      table,
      action: 'delete',
      reason: 'Dado inequivocamente pertencente à persona de candidato.',
    });
  }

  actions.push({
    table: 'application_notes',
    action: 'delete',
    reason:
      'Notas associadas às candidaturas podem conter informação pessoal livre sobre o candidato.',
  });

  actions.push({
    table: 'application_status_history',
    action: 'anonymize',
    reason:
      'Preserva o histórico de estados da candidatura sem manter dados livres ou a identidade do candidato enquanto ator.',
  });

  actions.push({
    table: 'applications',
    action: 'anonymize',
    reason:
      'Preserva o facto histórico da candidatura sem manter a ligação à pessoa, carta de apresentação ou CV.',
  });

  return {
    candidateId: ctx.candidateId,
    actions,
    fullyErased: true,
  };
}
