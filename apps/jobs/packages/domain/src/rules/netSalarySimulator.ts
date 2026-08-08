// packages/domain/src/rules/netSalarySimulator.ts
//
// Simulador de salário bruto -> líquido: contribuições sociais +
// imposto sobre o rendimento por escalões progressivos.
//
// AVISO OBRIGATÓRIO, para nunca ser mal interpretado: isto é uma
// ESTIMATIVA DE ORIENTAÇÃO, nunca um cálculo fiscal definitivo. Sistemas
// fiscais reais têm quociente familiar, deduções específicas, situação
// pessoal (filhos, estado civil, seguros), tetos de contribuição, e
// mudam todos os anos. Cada país tem o seu próprio simulador oficial
// (ex: impots.gouv.fr em França) — este módulo nunca o substitui, só dá
// uma primeira orientação a quem nunca teve acesso a nenhuma fonte
// fiável. Claude/Z Jobs não são consultores fiscais.

export interface TaxBracket {
  bracketOrder: number;
  incomeFrom: number;
  incomeTo: number | null; // null = sem limite superior
  marginalRate: number; // ex: 0.11 = 11%
}

export interface NetSalaryInput {
  grossAnnual: number;
  employeeSocialContributionRate: number; // taxa agregada simplificada, ex: 0.22
  brackets: TaxBracket[];
}

export interface NetSalaryResult {
  grossAnnual: number;
  socialContributions: number;
  taxableIncome: number; // grossAnnual - socialContributions (simplificação: sem abatimentos específicos)
  incomeTax: number;
  netAnnual: number;
  netMonthly: number;
  effectiveTaxRate: number; // incomeTax / taxableIncome
  /** Sempre true nesta versão — nunca omitir ao mostrar o resultado. */
  simplifiedEstimateOnly: true;
}

/**
 * Imposto progressivo por escalões: cada fração do rendimento é tributada
 * só à taxa do seu próprio escalão (nunca a taxa mais alta aplicada ao
 * total — erro comum e enganador que este cálculo evita deliberadamente).
 */
function computeProgressiveTax(taxableIncome: number, brackets: TaxBracket[]): number {
  const sorted = [...brackets].sort((a, b) => a.bracketOrder - b.bracketOrder);
  let tax = 0;
  for (const bracket of sorted) {
    if (taxableIncome <= bracket.incomeFrom) break;
    const upperBound = bracket.incomeTo === null ? taxableIncome : Math.min(taxableIncome, bracket.incomeTo);
    const amountInBracket = Math.max(0, upperBound - bracket.incomeFrom);
    tax += amountInBracket * bracket.marginalRate;
  }
  return tax;
}

export function calculateNetSalary(input: NetSalaryInput): NetSalaryResult {
  const socialContributions = input.grossAnnual * input.employeeSocialContributionRate;
  const taxableIncome = Math.max(0, input.grossAnnual - socialContributions);
  const incomeTax = computeProgressiveTax(taxableIncome, input.brackets);
  const netAnnual = input.grossAnnual - socialContributions - incomeTax;

  return {
    grossAnnual: input.grossAnnual,
    socialContributions,
    taxableIncome,
    incomeTax,
    netAnnual,
    netMonthly: netAnnual / 12,
    effectiveTaxRate: taxableIncome > 0 ? incomeTax / taxableIncome : 0,
    simplifiedEstimateOnly: true,
  };
}

// ============================================================================
// ALEMANHA — motor à parte, deliberadamente, não forçado ao modelo
// genérico de escalões acima.
//
// O §32a EStG (imposto sobre o rendimento alemão) usa uma fórmula
// matemática contínua por zona — não escalões com taxa marginal
// constante. Tentar representá-la como "escalões" introduziria erro
// sistemático (é exatamente o risco que se evitou deliberadamente ao
// não implementar a Alemanha na primeira versão deste simulador).
//
// Coeficientes confirmados diretamente no texto da lei — dejure.org,
// §32a EStG, redação dada pelo Steuerfortentwicklungsgesetz (Lei de
// 23 de dezembro de 2024), em vigor desde 1 de janeiro de 2026.
// Verificados por continuidade matemática nas fronteiras de zona antes
// de serem usados (ver netSalarySimulator.test.ts) — uma fórmula fiscal
// real tem de produzir um salto de poucos cêntimos entre zonas
// adjacentes, nunca um salto grande; um salto grande denunciaria
// coeficientes errados.
// ============================================================================

export interface GermanTaxResult {
  incomeTax: number;
  socialContributions: number;
  netAnnual: number;
  netMonthly: number;
  simplifiedEstimateOnly: true;
}

/** zvE = "zu versteuerndes Einkommen" (rendimento tributável), arredondado ao euro completo, por exigência da própria lei. */
export function calculateGermanIncomeTax2026(zve: number): number {
  const x = Math.floor(zve);
  if (x <= 12348) return 0;
  if (x <= 17799) {
    const y = (x - 12348) / 10000;
    return (914.51 * y + 1400) * y;
  }
  if (x <= 69878) {
    const z = (x - 17799) / 10000;
    return (173.1 * z + 2397) * z + 1034.87;
  }
  if (x <= 277825) {
    return 0.42 * x - 11135.63;
  }
  return 0.45 * x - 19470.38;
}

/**
 * Segurança social alemã 2026 — cada ramo com o seu próprio teto de
 * contribuição (Beitragsbemessungsgrenze), aplicado individualmente,
 * não um teto único agregado. Pessoa solteira, sem filhos (por isso o
 * suplemento de 0,6% do Pflegeversicherung para quem não tem filhos
 * está incluído — ver scope_notes no perfil fiscal semeado).
 *
 * Fontes: Deutsche Rentenversicherung (RV: 18,6% total, teto
 * 101.400€/ano 2026); médias setoriais de fundos de saúde (KV: ~17,5%
 * total); lei do Pflegeversicherung (PV: 3,6% + 0,6% sem filhos);
 * Bundesagentur für Arbeit (AV: 2,6% total). Todos partilhados a meio
 * entre trabalhador e empregador, exceto o suplemento sem filhos do PV
 * (100% trabalhador).
 */
export function calculateGermanSocialContributions(grossAnnual: number): number {
  const pensionCap = 101400;
  const healthCareCap = 69750;
  const rv = 0.093 * Math.min(grossAnnual, pensionCap);
  const av = 0.013 * Math.min(grossAnnual, pensionCap);
  const kv = 0.0875 * Math.min(grossAnnual, healthCareCap);
  const pv = 0.024 * Math.min(grossAnnual, healthCareCap); // 1,8% base + 0,6% sem filhos
  return rv + av + kv + pv;
}

export function calculateGermanNetSalary(grossAnnual: number): GermanTaxResult {
  const socialContributions = calculateGermanSocialContributions(grossAnnual);
  const zve = Math.max(0, grossAnnual - socialContributions);
  const incomeTax = calculateGermanIncomeTax2026(zve);
  const netAnnual = grossAnnual - socialContributions - incomeTax;
  return {
    incomeTax,
    socialContributions,
    netAnnual,
    netMonthly: netAnnual / 12,
    simplifiedEstimateOnly: true,
  };
}
