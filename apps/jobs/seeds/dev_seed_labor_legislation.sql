-- dev_seed_labor_legislation.sql
-- APENAS para ambiente de desenvolvimento.
-- Salários mínimos: Eurostat, dataset earn_mw_cur, valores em vigor a 1
-- de janeiro de 2026 (https://ec.europa.eu/eurostat/web/nace... ver
-- source_url em cada linha). Tempo de trabalho e férias: Diretiva
-- 2003/88/CE (mínimos comuns à UE, os mesmos para os cinco países).
--
-- Nota sobre a Itália: é um dos 5 países da UE SEM salário mínimo
-- nacional estatutário (os outros são Dinamarca, Áustria, Finlândia e
-- Suécia) — a remuneração mínima é definida por convenção coletiva
-- setorial, à semelhança do padrão já usado no simulador de tabelas
-- salariais (migration 0021).

insert into country_labor_profiles (
  country_code, has_statutory_minimum_wage, minimum_wage_monthly, minimum_wage_currency,
  minimum_wage_source, minimum_wage_source_url, minimum_wage_effective_date,
  max_weekly_hours, min_annual_leave_days, notes
) values
  ('PT', true, 1073.00, 'EUR',
   'Eurostat, Minimum wage statistics (dataset earn_mw_cur)', 'https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Minimum_wage_statistics',
   '2026-01-01', 48, 20, null),
  ('ES', true, 1381.00, 'EUR',
   'Eurostat, Minimum wage statistics (dataset earn_mw_cur)', 'https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Minimum_wage_statistics',
   '2026-01-01', 48, 20, null),
  ('FR', true, 1823.00, 'EUR',
   'Eurostat, Minimum wage statistics (dataset earn_mw_cur)', 'https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Minimum_wage_statistics',
   '2026-01-01', 48, 20, null),
  ('DE', true, 2343.00, 'EUR',
   'Eurostat, Minimum wage statistics (dataset earn_mw_cur)', 'https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Minimum_wage_statistics',
   '2026-01-01', 48, 20, null),
  ('IT', false, null, null,
   'Eurostat, Minimum wage statistics — Itália listada entre os 5 países da UE sem salário mínimo nacional estatutário', 'https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Minimum_wage_statistics',
   '2026-01-01', 48, 20,
   'Remuneração mínima definida por convenção coletiva setorial (Contratto Collettivo Nazionale di Lavoro), não por lei nacional — ver o mesmo padrão de tabelas salariais por convenção usado na migration 0021.')
on conflict (country_code) do nothing;

-- ---------- Simulador bruto->líquido: França, 2026, pessoa solteira ----------
-- Escalões oficiais do "barème progressif de l'impôt sur le revenu"
-- 2026 (aplicável aos rendimentos de 2025), por parte fiscal — Loi de
-- finances pour 2026, promulgada em 19 de fevereiro de 2026.
insert into country_tax_profiles (
  country_code, employee_social_contribution_rate, currency,
  tax_bracket_source, tax_bracket_source_url,
  social_contribution_source, social_contribution_source_url,
  applicable_tax_year, scope_notes
) values (
  'FR', 0.22, 'EUR',
  'Loi de finances pour 2026 — barème progressif de l''impôt sur le revenu', 'https://www.legifrance.gouv.fr',
  'URSSAF — taux de cotisations salariales 2026', 'https://www.urssaf.fr',
  2026,
  'Estimativa simplificada: pessoa solteira, 1 parte fiscal, sem filhos, ' ||
  'sem quociente familiar, taxa de contribuições sociais agregada para ' ||
  'não-quadro (~22% do bruto, inclui CSG/CRDS). Não aplica o abatimento ' ||
  'forfetário de 10% para despesas profissionais nem qualquer dedução ' ||
  'específica. NÃO substitui o simulador oficial em impots.gouv.fr.'
)
on conflict (country_code) do nothing;

insert into country_income_tax_brackets (country_code, bracket_order, income_from, income_to, marginal_rate) values
  ('FR', 1,      0.00,  11600.00, 0.00),
  ('FR', 2,  11600.01,  29579.00, 0.11),
  ('FR', 3,  29579.01,  84580.00, 0.30),
  ('FR', 4,  84580.01, 181916.00, 0.41),
  ('FR', 5, 181916.01,      null, 0.45)
on conflict (country_code, bracket_order) do nothing;
