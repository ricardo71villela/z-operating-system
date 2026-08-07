// packages/domain/src/rules/terminationTerms.ts
//
// Aviso prévio e período experimental — dados verificados país a país,
// nunca um número único forçado onde a realidade não é assim.
//
// PRINCÍPIO DE DESENHO: um número nacional único só é apresentado onde
// a lei realmente o define como tal. Onde a lei remete para convenção
// coletiva (França, Itália, em grande parte), ou onde depende de
// múltiplas variáveis (tipo de contrato, categoria, dimensão da
// empresa — Portugal, Espanha), a estrutura representa isso
// explicitamente, com `ruleType` a dizer qual dos dois casos é, em vez
// de esconder a diferença atrás de um número que parece preciso mas
// não é. Fingir um número fixo aqui seria exatamente o tipo de falsa
// precisão que esta sessão tem vindo a corrigir noutros sítios.

export type NoticeRuleType =
  | 'statutory_tenure_scaled' // a lei define uma escala clara por antiguidade
  | 'statutory_fixed_minimum' // a lei define um mínimo único, CCT pode estender
  | 'varies_by_contract_category' // varia por tipo/categoria/condições; não há número único
  | 'cba_dependent'; // a lei remete para convenção coletiva; não há número nacional único

export interface NoticeTenureBand {
  minTenureYears: number;
  noticePeriod: string; // texto, não só número — as unidades diferem (semanas/dias/meses) e a exatidão do texto importa mais do que um número solto
}

export interface CountryTerminationTerms {
  countryCode: string;
  probation: {
    maxDuration: string;
    ruleType: 'statutory_fixed_maximum' | 'varies_by_contract_category';
    notes: string;
    source: string;
    sourceUrl: string;
  };
  employerNotice: {
    ruleType: NoticeRuleType;
    tenureBands?: NoticeTenureBand[]; // só presente quando ruleType = statutory_tenure_scaled
    fixedMinimum?: string; // só presente quando ruleType = statutory_fixed_minimum
    notes: string;
    source: string;
    sourceUrl: string;
  };
  employeeNotice: {
    ruleType: NoticeRuleType;
    fixedMinimum?: string;
    notes: string;
  };
}

/**
 * Alemanha — o caso mais limpo dos cinco: escala de antiguidade real,
 * definida por lei, sem ambiguidade. §622 BGB.
 */
const GERMANY: CountryTerminationTerms = {
  countryCode: 'DE',
  probation: {
    maxDuration: '6 meses',
    ruleType: 'statutory_fixed_maximum',
    notes: 'Máximo absoluto por lei — não pode ser estendido nem com o acordo do trabalhador (§622(3) BGB).',
    source: '§622(3) BGB (Bürgerliches Gesetzbuch)',
    sourceUrl: 'https://dejure.org/gesetze/BGB/622.html',
  },
  employerNotice: {
    ruleType: 'statutory_tenure_scaled',
    tenureBands: [
      { minTenureYears: 0, noticePeriod: '2 semanas (durante o período experimental)' },
      { minTenureYears: 0.5, noticePeriod: '4 semanas, ao dia 15 ou fim de mês' },
      { minTenureYears: 2, noticePeriod: '1 mês, a fim de mês' },
      { minTenureYears: 5, noticePeriod: '2 meses' },
      { minTenureYears: 8, noticePeriod: '3 meses' },
      { minTenureYears: 10, noticePeriod: '4 meses' },
      { minTenureYears: 12, noticePeriod: '5 meses' },
      { minTenureYears: 15, noticePeriod: '6 meses' },
      { minTenureYears: 20, noticePeriod: '7 meses' },
    ],
    notes: 'Escala assimétrica — só o aviso do EMPREGADOR cresce com a antiguidade. O do trabalhador não (ver employeeNotice).',
    source: '§622(2) BGB',
    sourceUrl: 'https://dejure.org/gesetze/BGB/622.html',
  },
  employeeNotice: {
    ruleType: 'statutory_fixed_minimum',
    fixedMinimum: '4 semanas, ao dia 15 ou fim de mês',
    notes: 'Sempre 4 semanas, independentemente da antiguidade — mesmo com 30 anos de casa (§622(1) BGB). Só o aviso do empregador escala.',
  },
};

/**
 * França — a Diretiva (UE) 2019/1152 já limita o período experimental
 * a 6 meses em toda a UE (transposta em França a 9 mar. 2023). O aviso
 * prévio tem um mínimo legal claro por antiguidade (Art. L1234-1 Code
 * du travail), mas convenções coletivas setoriais estendem-no com
 * frequência — por isso ruleType mistura os dois no aviso do
 * empregador.
 */
const FRANCE: CountryTerminationTerms = {
  countryCode: 'FR',
  probation: {
    maxDuration: '2 a 4 meses (varia por categoria), teto de 6 meses por diretiva europeia',
    ruleType: 'varies_by_contract_category',
    notes: 'Operários/empregados: 2 meses (renovável 1x). Técnicos/supervisores: 3 meses. Quadros/gestão: 4 meses. O teto de 6 meses vem da Diretiva (UE) 2019/1152, transposta a 9 mar. 2023.',
    source: 'Code du travail, Art. L1221-19 a L1221-21',
    sourceUrl: 'https://entreprendre.service-public.gouv.fr/actualites/A16709?lang=en',
  },
  employerNotice: {
    ruleType: 'statutory_tenure_scaled',
    tenureBands: [
      { minTenureYears: 0, noticePeriod: 'conforme convenção coletiva ou uso do setor' },
      { minTenureYears: 0.5, noticePeriod: '1 mês' },
      { minTenureYears: 2, noticePeriod: '2 meses' },
    ],
    notes: 'Mínimo legal — a convenção coletiva aplicável (obrigatória verificar por setor) estende-o com frequência, sobretudo para quadros.',
    source: 'Code du travail, Art. L1234-1',
    sourceUrl: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006901174',
  },
  employeeNotice: {
    ruleType: 'cba_dependent',
    notes: 'Sem mínimo legal geral para demissão do trabalhador — regido quase sempre pela convenção coletiva setorial ou pelo contrato.',
  },
};

/**
 * Itália — o caso genuinamente sem número nacional único. Nem período
 * experimental nem aviso prévio têm um valor estatutário geral; ambos
 * remetem para o CCNL (Contratto Collettivo Nazionale di Lavoro) do
 * setor.
 */
const ITALY: CountryTerminationTerms = {
  countryCode: 'IT',
  probation: {
    maxDuration: 'definido pelo CCNL do setor — tipicamente 3 a 6 meses',
    ruleType: 'varies_by_contract_category',
    notes: 'O Código Civil (Art. 2096) só exige forma escrita — a duração é remetida quase sempre ao CCNL aplicável. Sem convenção, o máximo é 6 meses para quadros, 3 meses para os restantes (Lei n.º 604/1966).',
    source: 'Codice Civile, Art. 2096; Legge n. 604/1966',
    sourceUrl: 'https://www.gazzettaufficiale.it',
  },
  employerNotice: {
    ruleType: 'cba_dependent',
    notes: 'Sem escala nacional estatutária — inteiramente remetido ao CCNL do setor, que varia por categoria (operário/empregado/quadro) e antiguidade dentro desse CCNL específico.',
    source: 'Codice Civile, Art. 2118; CCNL aplicável ao setor',
    sourceUrl: 'https://www.gazzettaufficiale.it',
  },
  employeeNotice: {
    ruleType: 'cba_dependent',
    notes: 'Mesmo mecanismo do aviso do empregador — remetido ao CCNL, tipicamente mais curto para o trabalhador do que para o empregador dentro do mesmo CCNL.',
  },
};

/**
 * Espanha — tem um mínimo estatutário real (15 dias, Art. 53 ET), ao
 * contrário de França/Itália — mas o período experimental já varia por
 * categoria profissional na própria lei, não só por convenção.
 */
const SPAIN: CountryTerminationTerms = {
  countryCode: 'ES',
  probation: {
    maxDuration: '2 a 6 meses, conforme categoria',
    ruleType: 'varies_by_contract_category',
    notes: 'Técnicos titulados: até 6 meses. Restantes trabalhadores: até 2 meses (3 meses em empresas com menos de 25 trabalhadores). Convénio coletivo pode ajustar.',
    source: 'Estatuto de los Trabajadores, Art. 14',
    sourceUrl: 'https://www.boe.es/buscar/act.php?id=BOE-A-2015-11430',
  },
  employerNotice: {
    ruleType: 'statutory_fixed_minimum',
    fixedMinimum: '15 dias (despedimento objetivo)',
    notes: 'Mínimo legal claro, ao contrário de França/Itália — mas convénios coletivos setoriais estendem-no com frequência; 15 dias raramente é a resposta final sem verificar o convénio aplicável.',
    source: 'Estatuto de los Trabajadores, Art. 53.1.c',
    sourceUrl: 'https://www.boe.es/buscar/act.php?id=BOE-A-2015-11430',
  },
  employeeNotice: {
    ruleType: 'statutory_fixed_minimum',
    fixedMinimum: '15 dias, salvo se o convénio aplicável definir outro valor',
    notes: 'Convénios coletivos estendem frequentemente para 1 mês (administrativos) ou 2 meses (técnicos).',
  },
};

/**
 * Portugal — provavelmente o mais complexo dos cinco: o período
 * experimental depende de DUAS variáveis em simultâneo (tipo de
 * contrato e responsabilidade do cargo), e o próprio aviso durante o
 * período experimental já escala com os dias decorridos, antes sequer
 * de se chegar ao aviso "normal" pós-experimental.
 */
const PORTUGAL: CountryTerminationTerms = {
  countryCode: 'PT',
  probation: {
    maxDuration: '90 a 240 dias, conforme responsabilidade do cargo',
    ruleType: 'varies_by_contract_category',
    notes: 'Trabalhador comum, contrato sem termo: 90 dias. Cargo de complexidade técnica ou fiduciária: 180 dias. Cargo de direção/quadro superior: 240 dias. Primeiro emprego/desemprego de longa duração: 180 dias (proposta "Trabalho XXI", de julho de 2025, ainda não aprovada em abril de 2026 — regras atuais mantêm-se).',
    source: 'Código do Trabalho, Art. 112',
    sourceUrl: 'https://www.pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=1047&tabela=leis',
  },
  employerNotice: {
    ruleType: 'varies_by_contract_category',
    notes: 'Durante o período experimental: 7 dias de aviso nos primeiros 60 dias, 15 dias depois disso. Após o período experimental, o aviso normal de despedimento escala com a antiguidade e o motivo — não modelado aqui com o mesmo detalhe por não ter sido possível verificar a tabela completa com a mesma confiança que os restantes quatro países.',
    source: 'Código do Trabalho, Art. 114',
    sourceUrl: 'https://www.pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=1047&tabela=leis',
  },
  employeeNotice: {
    ruleType: 'varies_by_contract_category',
    notes: 'Durante o período experimental: 3 dias, independentemente de quanto tempo já passou. Após o período experimental, escala com a antiguidade (Art. 400 CT) — não modelado aqui com a mesma confiança que os restantes quatro países.',
  },
};

export const TERMINATION_TERMS_BY_COUNTRY: Record<string, CountryTerminationTerms> = {
  DE: GERMANY,
  FR: FRANCE,
  IT: ITALY,
  ES: SPAIN,
  PT: PORTUGAL,
};

export function getTerminationTerms(countryCode: string): CountryTerminationTerms | null {
  return TERMINATION_TERMS_BY_COUNTRY[countryCode.toUpperCase()] ?? null;
}
