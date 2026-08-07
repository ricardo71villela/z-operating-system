// packages/domain/src/rules/salaryReference.ts
//
// Comparação do salário de uma oferta com tabelas salariais oficiais
// (convenções coletivas, via Boletim do Trabalho e Emprego). Mesmo
// princípio de cvStudio.ts: ORIENTAÇÃO, nunca bloqueio — uma oferta
// abaixo da tabela oficial não é rejeitada, é sinalizada, para que
// candidato e empregador vejam a mesma referência verificável.
//
// Este módulo não decide QUAL referência usar — recebe já os níveis da
// convenção coletiva aplicável (normalmente obtidos via
// occupation_isco_code da oferta, ver migration 0021) e faz só a
// comparação numérica.

export interface SalaryLevel {
  levelCode: string;
  levelRank: number;
  monthlyMinimum: number;
  currency: string;
}

export type SalaryComparisonSignal = 'below_reference' | 'within_reference' | 'above_reference' | 'no_reference_available';

export interface SalaryComparisonResult {
  signal: SalaryComparisonSignal;
  /** Nível da convenção mais próximo do salário oferecido, quando aplicável. */
  closestLevel?: SalaryLevel;
  /** Nível mais baixo e mais alto da convenção, para dar contexto mesmo quando o sinal é claro. */
  referenceRange?: { min: number; max: number; currency: string };
}

/**
 * Compara o salário mínimo de uma oferta com os níveis de uma convenção
 * coletiva aplicável. `levels` deve já vir filtrada para a mesma moeda —
 * este módulo não faz conversão cambial.
 */
export function compareSalaryToReference(
  offerSalaryMin: number,
  offerCurrency: string,
  levels: SalaryLevel[],
): SalaryComparisonResult {
  const sameCurrencyLevels = levels.filter((l) => l.currency === offerCurrency);
  if (sameCurrencyLevels.length === 0) {
    return { signal: 'no_reference_available' };
  }

  const sorted = [...sameCurrencyLevels].sort((a, b) => a.monthlyMinimum - b.monthlyMinimum);
  const lowest = sorted[0];
  const highest = sorted[sorted.length - 1];
  const referenceRange = { min: lowest.monthlyMinimum, max: highest.monthlyMinimum, currency: offerCurrency };

  if (offerSalaryMin < lowest.monthlyMinimum) {
    return { signal: 'below_reference', closestLevel: lowest, referenceRange };
  }
  if (offerSalaryMin > highest.monthlyMinimum) {
    return { signal: 'above_reference', closestLevel: highest, referenceRange };
  }

  // Dentro do intervalo — encontra o nível cujo mínimo mais se aproxima
  // (sem ultrapassar) o salário oferecido, para dar uma correspondência
  // útil ("está ao nível de X"), não só "está dentro do intervalo".
  let closest = sorted[0];
  for (const level of sorted) {
    if (level.monthlyMinimum <= offerSalaryMin) closest = level;
  }
  return { signal: 'within_reference', closestLevel: closest, referenceRange };
}
