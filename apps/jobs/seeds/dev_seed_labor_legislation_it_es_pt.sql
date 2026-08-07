-- dev_seed_labor_legislation_it_es_pt.sql
-- APENAS para ambiente de desenvolvimento.
--
-- Fecha uma lacuna real, encontrada ao ligar a montra de marketing ao
-- domínio: a montra já calculava salário líquido para cinco países
-- (França, Alemanha, Itália, Espanha, Portugal), mas o domínio só tinha
-- dados semeados para a França — Itália, Espanha e Portugal existiam
-- só como cópia manual em JavaScript na montra, nunca verificados aqui.
--
-- A Alemanha fica de fora deste ficheiro, de propósito: usa uma fórmula
-- fiscal contínua (§32a EStG), não escalões discretos — o motor genérico
-- do domínio (country_income_tax_brackets, taxa marginal por escalão)
-- não a consegue representar sem ser primeiro estendido. Ver nota no
-- fim deste ficheiro.

-- ---------- Itália: Legge di Bilancio 2026 (L. 199/2025), confirmada pelo MEF ----------
insert into country_tax_profiles (
  country_code, employee_social_contribution_rate, currency,
  tax_bracket_source, tax_bracket_source_url,
  social_contribution_source, social_contribution_source_url,
  applicable_tax_year, scope_notes
) values (
  'IT', 0.0919, 'EUR',
  'Legge di Bilancio 2026 (L. 199/2025), art. 1 comma 3', 'https://www.mef.gov.it/focus/Principali-misure-della-legge-di-bilancio-2026/',
  'INPS — aliquota contributiva media lavoratore dipendente 2026', 'https://www.inps.it',
  2026,
  'Estimativa simplificada: pessoa solteira, INPS a taxa fixa de 9,19% ' ||
  'sem teto de contribuição modelado. Sem adicional regional/municipal ' ||
  '(varia por residência, 0,70–3,33% regional + até 0,9% municipal) nem ' ||
  'detrazioni. NÃO substitui o simulador oficial nem aconselhamento fiscal.'
)
on conflict (country_code) do nothing;

insert into country_income_tax_brackets (country_code, bracket_order, income_from, income_to, marginal_rate) values
  ('IT', 1,     0.00, 28000.00, 0.23),
  ('IT', 2, 28000.01, 50000.00, 0.33),
  ('IT', 3, 50000.01,     null, 0.43)
on conflict (country_code, bracket_order) do nothing;

-- ---------- Espanha: escala estatal + autonómica supletória (inalterada desde 2021) ----------
insert into country_tax_profiles (
  country_code, employee_social_contribution_rate, currency,
  tax_bracket_source, tax_bracket_source_url,
  social_contribution_source, social_contribution_source_url,
  applicable_tax_year, scope_notes
) values (
  'ES', 0.0648, 'EUR',
  'Ley 35/2006 del IRPF, escala estatal + autonómica supletoria', 'https://www.boe.es',
  'Cotizaciones sociales — contingencias comunes 4,70% + desempleo 1,55% + formación 0,10% + MEI 0,13%', 'https://www.seg-social.es',
  2026,
  'Estimativa simplificada: pessoa solteira, sem dependentes. Os escalões ' ||
  'abaixo já incorporam o mínimo pessoal geral de 5.550€ (deslocados ' ||
  'nesse valor face à escala oficial bruta) — matematicamente equivalente ' ||
  'a subtraí-lo à base antes de aplicar a escala, verificado por cálculo. ' ||
  'Escala autonómica supletória — cada comunidade autónoma pode ter a ' ||
  'sua própria escala real, que aqui não é modelada. NÃO substitui o ' ||
  'simulador oficial nem aconselhamento fiscal.'
)
on conflict (country_code) do nothing;

insert into country_income_tax_brackets (country_code, bracket_order, income_from, income_to, marginal_rate) values
  ('ES', 1,      0.00,   5550.00, 0.00),
  ('ES', 2,   5550.01,  18000.00, 0.19),
  ('ES', 3,  18000.01,  25750.00, 0.24),
  ('ES', 4,  25750.01,  40750.00, 0.30),
  ('ES', 5,  40750.01,  65550.00, 0.37),
  ('ES', 6,  65550.01, 305550.00, 0.45),
  ('ES', 7, 305550.01,      null, 0.47)
on conflict (country_code, bracket_order) do nothing;

-- ---------- Portugal: artigo 68.º do CIRS, tabela 2026 (Continente) ----------
insert into country_tax_profiles (
  country_code, employee_social_contribution_rate, currency,
  tax_bracket_source, tax_bracket_source_url,
  social_contribution_source, social_contribution_source_url,
  applicable_tax_year, scope_notes
) values (
  'PT', 0.11, 'EUR',
  'Artigo 68.º do CIRS, redação dada pelo Orçamento do Estado para 2026 (Lei n.º 73-A/2025)', 'https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs68.aspx',
  'Segurança Social — Taxa Social Única, trabalhador por conta de outrem', 'https://www.seg-social.pt',
  2026,
  'Estimativa simplificada, Continente (Açores e Madeira têm tabelas ' ||
  'próprias, não modeladas aqui): pessoa solteira, sem dependentes, sem ' ||
  'dedução específica adicional nem proteção do mínimo de existência. ' ||
  'NOTA DE PRECISÃO: os limiares de escalão publicados (arredondados ao ' ||
  'euro) não reconciliam perfeitamente ao cêntimo com a "parcela a ' ||
  'abater" oficial — diferença medida de ~2€ num líquido de ~6.663€ ' ||
  '(~0,03%), inerente à tabela pública, não a um erro de transcrição ' ||
  '(verificado por cálculo direto). NÃO substitui o simulador oficial ' ||
  'nem aconselhamento fiscal.'
)
on conflict (country_code) do nothing;

-- Nota: o modelo genérico de escalões do domínio usa "taxa marginal por
-- escalão" — mas o método oficial português é "taxa × rendimento −
-- parcela a abater", matematicamente equivalente a escalões marginais
-- corretamente decompostos. Os valores abaixo são a decomposição em
-- escalões marginais que reproduz exatamente a tabela oficial (taxa,
-- parcela a abater) — verificado por cálculo, ver
-- packages/domain/src/rules/netSalarySimulator.test.ts.
insert into country_income_tax_brackets (country_code, bracket_order, income_from, income_to, marginal_rate) values
  ('PT', 1,     0.00,  8342.00, 0.125),
  ('PT', 2,  8342.01, 12587.00, 0.157),
  ('PT', 3, 12587.01, 17838.00, 0.212),
  ('PT', 4, 17838.01, 23089.00, 0.241),
  ('PT', 5, 23089.01, 29397.00, 0.311),
  ('PT', 6, 29397.01, 43090.00, 0.349),
  ('PT', 7, 43090.01, 46566.00, 0.431),
  ('PT', 8, 46566.01, 86634.00, 0.446),
  ('PT', 9, 86634.01,     null, 0.480)
on conflict (country_code, bracket_order) do nothing;

-- ============================================================================
-- ALEMANHA — deliberadamente ausente deste ficheiro.
--
-- O §32a EStG usa uma fórmula matemática contínua (quadrática nas duas
-- primeiras zonas de progressão), não escalões com taxa marginal fixa.
-- O motor genérico do domínio (country_income_tax_brackets) representa
-- "taxa marginal constante dentro de cada escalão" — aproximar a
-- Alemanha a escalões discretos introduziria erro sistemático, o mesmo
-- risco que já se evitou deliberadamente na primeira versão do
-- simulador desta sessão.
--
-- Para representar a Alemanha corretamente no domínio, é preciso
-- estender netSalarySimulator.ts com uma segunda estratégia de cálculo
-- (fórmula paramétrica por zona, não só escalões) — tarefa distinta,
-- ainda não feita. A montra de marketing já tem a fórmula alemã
-- correta em JavaScript (ver ferramentas.html), mas essa cópia nunca
-- foi verificada contra o domínio porque o domínio ainda não tem
-- equivalente para comparar.
-- ============================================================================
