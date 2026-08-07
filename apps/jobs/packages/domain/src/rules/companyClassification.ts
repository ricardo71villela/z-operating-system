// packages/domain/src/rules/companyClassification.ts
//
// Classificação de dimensão de empresa segundo a Recomendação da
// Comissão Europeia 2003/361/CE (micro, pequena, média, grande empresa).
//
// AVISO IMPORTANTE, para nunca ser mal interpretado: a Recomendação
// 2003/361/CE define PME por DOIS critérios em simultâneo — número de
// funcionários E (volume de negócios OU balanço total). Esta plataforma
// só recolhe número de funcionários (nunca dados financeiros), por isso
// esta função devolve sempre uma ESTIMATIVA PARCIAL baseada só num dos
// dois critérios oficiais — nunca uma classificação PME oficial e
// completa. O nome da função e o tipo de retorno deixam isto explícito
// para que ninguém a use como se fosse a classificação legal completa.

export type SmeCategoryEstimate = 'micro' | 'small' | 'medium' | 'large' | 'unknown';

export interface SmeClassificationResult {
  category: SmeCategoryEstimate;
  /** Sempre true nesta versão — nunca omitir este aviso ao mostrar o resultado. */
  partialEstimateOnly: true;
  criterionUsed: 'employee_count_only';
  missingCriteria: ['turnover_or_balance_sheet'];
}

/**
 * Limiares exatos da Recomendação 2003/361/CE, Anexo, Artigo 2.º:
 * - Micro: < 10 funcionários
 * - Pequena: < 50 funcionários
 * - Média: < 250 funcionários
 * - Grande: >= 250 funcionários (fora do âmbito da definição de PME)
 * A Recomendação também exige volume de negócios ≤ 50M€ (ou balanço ≤
 * 43M€) para médias, ≤10M€ para pequenas, ≤2M€ para micro — não
 * verificável aqui, daí o aviso obrigatório no resultado.
 */
export function estimateSmeCategoryByEmployeeCount(employeeCount: number | null | undefined): SmeClassificationResult {
  const base = {
    partialEstimateOnly: true as const,
    criterionUsed: 'employee_count_only' as const,
    missingCriteria: ['turnover_or_balance_sheet'] as ['turnover_or_balance_sheet'],
  };

  if (employeeCount === null || employeeCount === undefined || employeeCount < 0) {
    return { ...base, category: 'unknown' };
  }
  if (employeeCount < 10) return { ...base, category: 'micro' };
  if (employeeCount < 50) return { ...base, category: 'small' };
  if (employeeCount < 250) return { ...base, category: 'medium' };
  return { ...base, category: 'large' };
}
