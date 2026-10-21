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

// ============================================================================
// LUXEMBURGO — motor à parte: o líquido luxemburguês depende de tetos de
// cotisação, de uma contribuição dependência com abatimento, da
// majoração para o fundo de emprego e de créditos de imposto
// reembolsáveis (CIS, CI-CO2) — nada disto cabe no modelo genérico.
//
// Âmbito: residente, classe 1 (pessoa sozinha, sem filhos), um único
// emprego assalariado, só os forfaits mínimos (FO 540 €, DS 480 €).
//
// Fontes oficiais (verificadas a 2026-10-22):
// - Tarifa (art. 118 LIR) "à partir de l'année d'imposition 2025", sem
//   adaptação em 2026: impotsdirects.public.lu/fr/az/t/tarif_pers.html
//   (o projeto de lei 8676, classe única, só se aplica a partir de 2028).
// - Fundo para o emprego: 7 %, 9 % acima de 150 000 € (classe 1):
//   impotsdirects.public.lu/fr/az/f/fond_empl.html
// - CIS e CI-CO2 a partir de 2026 (lei orçamental de 19.12.2025):
//   impotsdirects.public.lu/fr/az/c/credit-impot-salaries/cis2026.html
// - Forfaits FO 540 € e DS 480 €: impotsdirects.public.lu/fr/az/d/
//   deter_salar.html e depens_spe.html
// - Taxas salariais 2026 (pensão 8,50 %, saúde 2,80 % + 0,25 %,
//   dependência 1,40 %), teto 5 × SSM e abatimento de 1/4 do SSM: aviso
//   CCSS de 16.01.2026; valores à índice 992,24 (1.6.2026): SSM
//   2 771,33 €, teto 13 856,63 €/mês, abatimento 692,83 €/mês.
// - A contribuição dependência não é dedutível (guichet.public.lu,
//   "Déduire les cotisations … de sécurité sociale").
// ============================================================================

export const LU_TAX_BRACKETS_2026: TaxBracket[] = [
  [0, 13230, 0], [13230, 15435, 0.08], [15435, 17640, 0.09], [17640, 19845, 0.10],
  [19845, 22050, 0.11], [22050, 24255, 0.12], [24255, 26550, 0.14], [26550, 28845, 0.16],
  [28845, 31140, 0.18], [31140, 33435, 0.20], [33435, 35730, 0.22], [35730, 38025, 0.24],
  [38025, 40320, 0.26], [40320, 42615, 0.28], [42615, 44910, 0.30], [44910, 47205, 0.32],
  [47205, 49500, 0.34], [49500, 51795, 0.36], [51795, 54090, 0.38], [54090, 117450, 0.39],
  [117450, 176160, 0.40], [176160, 234870, 0.41], [234870, null, 0.42],
].map(([from, to, rate], i) => ({ bracketOrder: i + 1, incomeFrom: from as number, incomeTo: to, marginalRate: rate as number }));

const LU_MONTHLY_CEILING_2026 = 13856.63; // 5 × SSM, índice 992,24
const LU_MONTHLY_DEPENDENCY_ALLOWANCE_2026 = 692.83; // 1/4 SSM
const LU_FO_MINIMUM = 540;
const LU_DS_MINIMUM = 480;

/** Crédit d'impôt salarié a partir de 2026 (anual, sobre o salário bruto). */
export function luxembourgCIS2026(grossAnnual: number): number {
  if (grossAnnual < 936 || grossAnnual >= 80000) return 0;
  if (grossAnnual <= 11265) return 300 + (grossAnnual - 936) * 0.029;
  if (grossAnnual <= 40000) return 600;
  return 600 - (grossAnnual - 40000) * 0.015;
}

/** CI-CO2 salarié a partir de 2026. */
export function luxembourgCICO2_2026(grossAnnual: number): number {
  if (grossAnnual < 936 || grossAnnual >= 80000) return 0;
  if (grossAnnual <= 40000) return 216;
  return 216 - (grossAnnual - 40000) * 0.0054;
}

export interface LuxembourgNetSalaryResult {
  grossAnnual: number;
  socialContributions: number; // pensão + saúde + dependência
  taxableIncome: number;
  incomeTaxBeforeCredits: number; // inclui a majoração do fundo para o emprego
  taxCredits: number; // CIS + CI-CO2, reembolsáveis
  incomeTax: number; // incomeTaxBeforeCredits - taxCredits (pode ser negativo)
  netAnnual: number;
  netMonthly: number;
  simplifiedEstimateOnly: true;
}

export function calculateLuxembourgNetSalary(grossAnnual: number): LuxembourgNetSalaryResult {
  const gross = Math.max(0, grossAnnual);
  const capped = Math.min(gross, 12 * LU_MONTHLY_CEILING_2026);
  const pensionAndHealth = capped * (0.085 + 0.028 + 0.0025);
  const dependency = 0.014 * Math.max(0, gross - 12 * LU_MONTHLY_DEPENDENCY_ALLOWANCE_2026);
  const socialContributions = pensionAndHealth + dependency;

  const taxableIncome = Math.max(0, gross - pensionAndHealth - LU_FO_MINIMUM - LU_DS_MINIMUM);
  const baseTax = computeProgressiveTax(taxableIncome, LU_TAX_BRACKETS_2026);
  const incomeTaxBeforeCredits = baseTax * (taxableIncome > 150000 ? 1.09 : 1.07);
  const taxCredits = luxembourgCIS2026(gross) + luxembourgCICO2_2026(gross);
  const incomeTax = incomeTaxBeforeCredits - taxCredits;
  const netAnnual = gross - socialContributions - incomeTax;

  return {
    grossAnnual: gross,
    socialContributions,
    taxableIncome,
    incomeTaxBeforeCredits,
    taxCredits,
    incomeTax,
    netAnnual,
    netMonthly: netAnnual / 12,
    simplifiedEstimateOnly: true,
  };
}

export const LU_TAX_PROFILE_2026 = {
  countryCode: 'LU',
  currency: 'EUR',
  applicableTaxYear: 2026,
  taxBracketSource: "Art. 118 LIR — tarif de base à partir de l'année d'imposition 2025 (inchangé en 2026); CIS et CI-CO2 2026; fonds pour l'emploi",
  taxBracketSourceUrl: 'https://impotsdirects.public.lu/fr/az/t/tarif_pers.html',
  socialContributionSource: 'CCSS — taux de cotisation 2026 (pension 8,50 %, maladie 3,05 %, dépendance 1,40 %), plafond 5 × SSM',
  socialContributionSourceUrl: 'https://ccss.public.lu',
  scopeNotes:
    'Estimation simplifiée : résident, classe 1, un seul emploi salarié, minima forfaitaires (FO 540 €, DS 480 €), ' +
    'sans frais de déplacement. Ne remplace pas le calcul de l’Administration des contributions directes.',
  brackets: LU_TAX_BRACKETS_2026,
};
