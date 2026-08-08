// packages/domain/src/rules/dataErasure.ts
//
// Direito ao esquecimento (RGPD, Artigo 17.º) — não um botão que apaga
// tudo sem pensar. O Artigo 17.º, n.º 3 lista exceções reais: obrigação
// legal (ex: faturas, retenção fiscal), exercício/defesa de direito em
// processo judicial, interesse público. Um "apaga tudo" ingénuo que
// ignorasse isto violaria a lei na direção oposta — apagaria registos
// que a própria lei obriga a manter.
//
// Este módulo decide o que pode ser apagado de imediato e o que tem de
// ser retido, com o motivo explícito — nunca um apagamento silencioso
// parcial sem dizer porquê.

export interface ErasureContext {
  candidateId: string;
  hasActiveBillingRecords: boolean; // faturas emitidas em nome da pessoa (raro para candidatos, comum para donos de organização)
  hasOpenLegalClaim: boolean; // processo de denúncia/moderação em curso envolvendo esta pessoa
  hasAuditLogEntriesUnderLegalRetention: boolean; // Artigo 12.º do AI Act exige retenção mínima de 6 meses para decisões de pontuação de candidato
}

export type ErasureAction =
  | { table: string; action: 'delete'; reason: string }
  | { table: string; action: 'anonymize'; reason: string }
  | { table: string; action: 'retain'; reason: string; legalBasis: string };

export interface ErasurePlan {
  candidateId: string;
  actions: ErasureAction[];
  fullyErased: boolean; // false sempre que pelo menos uma tabela tiver de ser retida
}

/**
 * Decide, tabela a tabela, o que acontece a pedido de apagamento de um
 * candidato. Cada decisão vem com o motivo — nunca "porque sim".
 */
export function planCandidateErasure(ctx: ErasureContext): ErasurePlan {
  const actions: ErasureAction[] = [];

  // Dados de perfil — sempre apagáveis de imediato, não há exceção
  // legal que justifique retê-los depois de um pedido de apagamento.
  for (const table of ['candidate_experiences', 'candidate_education', 'candidate_skills', 'candidate_languages', 'candidate_documents']) {
    actions.push({ table, action: 'delete', reason: 'Dados de perfil sem base legal para retenção — apagados de imediato.' });
  }

  // candidate_profiles — o registo principal. Anonimizado, não
  // apagado por completo, para não quebrar a integridade referencial
  // de candidaturas já submetidas (ver applications abaixo).
  actions.push({
    table: 'candidate_profiles',
    action: 'anonymize',
    reason: 'Nome, contacto e dados identificáveis substituídos por marcadores anónimos. O registo em si mantém-se para não quebrar candidaturas já existentes.',
  });

  // Candidaturas — o FACTO de a pessoa se ter candidatado pode ter de
  // ser retido para o empregador poder demonstrar processos de
  // contratação não-discriminatórios, mas sem identificar a pessoa.
  actions.push({
    table: 'applications',
    action: 'anonymize',
    reason: 'O histórico de candidatura mantém-se (útil ao empregador para auditoria de não-discriminação), mas sem qualquer campo que identifique a pessoa.',
  });

  // Faturação — obrigação legal real de retenção fiscal (ex: 10 anos
  // em Portugal, Art. 123.º do CIRC), Artigo 17.º n.º 3, alínea b) do
  // RGPD cobre isto explicitamente.
  if (ctx.hasActiveBillingRecords) {
    actions.push({
      table: 'billing_records',
      action: 'retain',
      reason: 'Registos de faturação com obrigação legal de retenção fiscal.',
      legalBasis: 'RGPD Art. 17.º(3)(b) — cumprimento de obrigação legal; Art. 123.º CIRC (Portugal) exige retenção de 10 anos.',
    });
  }

  // Processo de denúncia/moderação em curso — o direito de defesa da
  // outra parte (empregador denunciado, ou candidato que denunciou)
  // pode exigir manter os dados até ao processo estar resolvido.
  if (ctx.hasOpenLegalClaim) {
    actions.push({
      table: 'job_offer_reports',
      action: 'retain',
      reason: 'Processo de denúncia/moderação em curso envolvendo esta pessoa — apagar agora prejudicaria o direito de defesa da outra parte.',
      legalBasis: 'RGPD Art. 17.º(3)(e) — exercício ou defesa de um direito num processo judicial.',
    });
  }

  // Auditoria de pontuação de candidato — retenção mínima obrigatória
  // pelo AI Act, não uma escolha nossa.
  if (ctx.hasAuditLogEntriesUnderLegalRetention) {
    actions.push({
      table: 'audit_log',
      action: 'retain',
      reason: 'Registo de auditoria de pontuação de candidato ainda dentro do período mínimo de retenção obrigatório.',
      legalBasis: 'AI Act, Artigo 12.º — retenção mínima de 6 meses para sistemas de IA de alto risco.',
    });
  }

  return {
    candidateId: ctx.candidateId,
    actions,
    fullyErased: !actions.some((a) => a.action === 'retain'),
  };
}
