-- Z Jobs — reference data for the launch countries (France, Belgium, Luxembourg), v1
--
-- Production had the countries and towns (20261022210000..210200) but no
-- labour law facts, no French tax profile and no NACE sectors, so:
--   GET /labor-legislation/FR|BE|LU answered 404,
--   GET /tax-simulator/FR answered 404 (BE and LU use engines in code),
--   the « Secteur d'activité » list of the company page was empty.
--
-- Facts only, each with its source; the API shows them as information,
-- never as legal advice.
--
-- Minimum wages (gross per month, full time, 18 and over):
--   FR  1 823,03 € from 2026-01-01 — SMIC 12,02 €/h × 151,67 h
--       (info.gouv.fr, « Le SMIC revalorisé au 1er janvier 2026 »).
--   BE  2 233,61 € from 2026-07-01 — RMMMG, CCT n° 43 of the Conseil
--       national du travail, after the April 2026 step (2 189,81 €) and the
--       July 2026 indexation (Securex, montants socio-juridiques, RMMG national).
--   LU  2 771,33 € from 2026-06-01 — salaire social minimum, unskilled,
--       index 992,24 (skilled: 3 325,59 €) (PwC Luxembourg, paramètres
--       sociaux au 1er juin 2026).
-- Working time: 48 h maximum average week (Directive 2003/88/EC, art. 6) in
-- the three countries; the national normal week is in the notes.
-- Paid leave (full-time, 5-day week): FR 25 days (Code du travail L3141-3:
-- 2,5 jours ouvrables par mois, 30 ouvrables = 5 semaines), BE 20 days,
-- LU 26 days (Code du travail L.233-4).
--
-- French income tax 2026 (income 2025), per fiscal share, Loi de finances
-- pour 2026 (JO of 2026-02-20): 0 % up to 11 600 €, 11 % to 29 579 €,
-- 30 % to 84 577 €, 41 % to 181 917 €, 45 % above.
--
-- NACE Rev. 2 sections (Regulation (EC) No 1893/2006): the 21 sections with
-- the Eurostat English names and the Portuguese names already used by the
-- table; the portal shows French names (INSEE NAF rév. 2) from its own list.
--
-- Idempotent: safe to run again (upserts).

begin;

insert into jobs.country_labor_profiles (
  country_code, has_statutory_minimum_wage, minimum_wage_monthly, minimum_wage_currency,
  minimum_wage_source, minimum_wage_source_url, minimum_wage_effective_date,
  max_weekly_hours, min_annual_leave_days, working_time_source, working_time_source_url, notes, updated_at
) values
  ('FR', true, 1823.03, 'EUR',
   'SMIC au 1er janvier 2026 : 12,02 € brut de l''heure, 1 823,03 € brut par mois (35 h)',
   'https://www.info.gouv.fr/actualite/le-smic-revalorise-au-1er-janvier-2026',
   '2026-01-01', 48, 25,
   'Directive 2003/88/CE (48 h) ; Code du travail, art. L3121-27 (35 h) et L3141-3 (congés)',
   'https://www.legifrance.gouv.fr',
   'Durée légale : 35 h par semaine. Congés payés : 2,5 jours ouvrables par mois, soit 30 jours ouvrables (5 semaines, 25 jours ouvrés).',
   now()),
  ('BE', true, 2233.61, 'EUR',
   'Revenu minimum mensuel moyen garanti (CCT n° 43, Conseil national du travail), 18 ans et plus, depuis le 1er juillet 2026',
   'https://www.securex.be/fr/lex4you/employeur/montants-actuels/montants-socio-juridiques/rmmg-national',
   '2026-07-01', 48, 20,
   'Directive 2003/88/CE (48 h) ; loi du 16 mars 1971 sur le travail (38 h) ; lois coordonnées sur les vacances annuelles',
   'https://emploi.belgique.be',
   'Durée normale : 38 h par semaine en moyenne. Vacances annuelles : 20 jours pour un régime de 5 jours par semaine. Les commissions paritaires fixent souvent un barème plus élevé que ce minimum.',
   now()),
  ('LU', true, 2771.33, 'EUR',
   'Salaire social minimum non qualifié (18 ans et plus) au 1er juin 2026, indice 992,24 ; qualifié : 3 325,59 €',
   'https://www.pwc.lu/en/newsletter/2026/parametres-sociaux-juin-2026.html',
   '2026-06-01', 48, 26,
   'Directive 2003/88/CE (48 h) ; Code du travail, art. L.211-5 (40 h) et L.233-4 (congés)',
   'https://legilux.public.lu',
   'Durée normale : 40 h par semaine. Congé annuel : 26 jours ouvrables. Salarié qualifié : salaire social minimum majoré de 20 % (3 325,59 €).',
   now())
on conflict (country_code) do update set
  has_statutory_minimum_wage = excluded.has_statutory_minimum_wage,
  minimum_wage_monthly = excluded.minimum_wage_monthly,
  minimum_wage_currency = excluded.minimum_wage_currency,
  minimum_wage_source = excluded.minimum_wage_source,
  minimum_wage_source_url = excluded.minimum_wage_source_url,
  minimum_wage_effective_date = excluded.minimum_wage_effective_date,
  max_weekly_hours = excluded.max_weekly_hours,
  min_annual_leave_days = excluded.min_annual_leave_days,
  working_time_source = excluded.working_time_source,
  working_time_source_url = excluded.working_time_source_url,
  notes = excluded.notes,
  updated_at = now();

insert into jobs.country_tax_profiles (
  country_code, employee_social_contribution_rate, currency,
  tax_bracket_source, tax_bracket_source_url,
  social_contribution_source, social_contribution_source_url,
  applicable_tax_year, scope_notes
) values (
  'FR', 0.22, 'EUR',
  'Loi de finances pour 2026 (JO du 20 février 2026) — barème progressif de l''impôt sur le revenu, revenus 2025',
  'https://www.legifrance.gouv.fr',
  'URSSAF — cotisations salariales 2026 (taux global approché, non-cadre, CSG/CRDS comprises)',
  'https://www.urssaf.fr',
  2026,
  'Estimation simplifiée : personne seule, 1 part, sans enfant, taux global de cotisations salariales d''environ 22 % du brut. Sans abattement de 10 % pour frais professionnels ni autre déduction. Ne remplace pas le simulateur officiel d''impots.gouv.fr.'
)
on conflict (country_code) do update set
  employee_social_contribution_rate = excluded.employee_social_contribution_rate,
  tax_bracket_source = excluded.tax_bracket_source,
  tax_bracket_source_url = excluded.tax_bracket_source_url,
  social_contribution_source = excluded.social_contribution_source,
  social_contribution_source_url = excluded.social_contribution_source_url,
  applicable_tax_year = excluded.applicable_tax_year,
  scope_notes = excluded.scope_notes;

insert into jobs.country_income_tax_brackets (country_code, bracket_order, income_from, income_to, marginal_rate) values
  ('FR', 1,      0.00,  11600.00, 0.00),
  ('FR', 2,  11600.01,  29579.00, 0.11),
  ('FR', 3,  29579.01,  84577.00, 0.30),
  ('FR', 4,  84577.01, 181917.00, 0.41),
  ('FR', 5, 181917.01,      null, 0.45)
on conflict (country_code, bracket_order) do update set
  income_from = excluded.income_from, income_to = excluded.income_to, marginal_rate = excluded.marginal_rate;

insert into jobs.nace_codes (code, level, section_letter, label_pt, label_en, source_url) values
  ('A', 'section', 'A', 'Agricultura, produção animal, caça, floresta e pesca', 'Agriculture, forestry and fishing', 'https://ec.europa.eu/eurostat/web/nace'),
  ('B', 'section', 'B', 'Indústrias extrativas', 'Mining and quarrying', 'https://ec.europa.eu/eurostat/web/nace'),
  ('C', 'section', 'C', 'Indústrias transformadoras', 'Manufacturing', 'https://ec.europa.eu/eurostat/web/nace'),
  ('D', 'section', 'D', 'Eletricidade, gás, vapor, água quente e fria e ar frio', 'Electricity, gas, steam and air conditioning supply', 'https://ec.europa.eu/eurostat/web/nace'),
  ('E', 'section', 'E', 'Captação, tratamento e distribuição de água; saneamento, gestão de resíduos e despoluição', 'Water supply; sewerage, waste management and remediation activities', 'https://ec.europa.eu/eurostat/web/nace'),
  ('F', 'section', 'F', 'Construção', 'Construction', 'https://ec.europa.eu/eurostat/web/nace'),
  ('G', 'section', 'G', 'Comércio por grosso e a retalho; reparação de veículos automóveis e motociclos', 'Wholesale and retail trade; repair of motor vehicles and motorcycles', 'https://ec.europa.eu/eurostat/web/nace'),
  ('H', 'section', 'H', 'Transportes e armazenagem', 'Transportation and storage', 'https://ec.europa.eu/eurostat/web/nace'),
  ('I', 'section', 'I', 'Alojamento, restauração e similares', 'Accommodation and food service activities', 'https://ec.europa.eu/eurostat/web/nace'),
  ('J', 'section', 'J', 'Atividades de informação e de comunicação', 'Information and communication', 'https://ec.europa.eu/eurostat/web/nace'),
  ('K', 'section', 'K', 'Atividades financeiras e de seguros', 'Financial and insurance activities', 'https://ec.europa.eu/eurostat/web/nace'),
  ('L', 'section', 'L', 'Atividades imobiliárias', 'Real estate activities', 'https://ec.europa.eu/eurostat/web/nace'),
  ('M', 'section', 'M', 'Atividades de consultoria, científicas, técnicas e similares', 'Professional, scientific and technical activities', 'https://ec.europa.eu/eurostat/web/nace'),
  ('N', 'section', 'N', 'Atividades administrativas e dos serviços de apoio', 'Administrative and support service activities', 'https://ec.europa.eu/eurostat/web/nace'),
  ('O', 'section', 'O', 'Administração Pública e Defesa; Segurança Social Obrigatória', 'Public administration and defence; compulsory social security', 'https://ec.europa.eu/eurostat/web/nace'),
  ('P', 'section', 'P', 'Educação', 'Education', 'https://ec.europa.eu/eurostat/web/nace'),
  ('Q', 'section', 'Q', 'Atividades de saúde humana e apoio social', 'Human health and social work activities', 'https://ec.europa.eu/eurostat/web/nace'),
  ('R', 'section', 'R', 'Atividades artísticas, de espetáculos, desportivas e recreativas', 'Arts, entertainment and recreation', 'https://ec.europa.eu/eurostat/web/nace'),
  ('S', 'section', 'S', 'Outras atividades de serviços', 'Other service activities', 'https://ec.europa.eu/eurostat/web/nace'),
  ('T', 'section', 'T', 'Atividades das famílias empregadoras de pessoal doméstico e atividades de produção das famílias para uso próprio', 'Activities of households as employers; undifferentiated goods- and services-producing activities of households for own use', 'https://ec.europa.eu/eurostat/web/nace'),
  ('U', 'section', 'U', 'Atividades dos organismos internacionais e outras instituições extraterritoriais', 'Activities of extraterritorial organisations and bodies', 'https://ec.europa.eu/eurostat/web/nace')
on conflict (code) do update set
  level = excluded.level, section_letter = excluded.section_letter,
  label_pt = excluded.label_pt, label_en = excluded.label_en, source_url = excluded.source_url;

commit;

-- Check (expected: 3 labour profiles, 1 FR tax profile with 5 brackets, 21 sections):
-- select (select count(*) from jobs.country_labor_profiles where country_code in ('FR','BE','LU')) as labour,
--        (select count(*) from jobs.country_income_tax_brackets where country_code = 'FR') as fr_brackets,
--        (select count(*) from jobs.nace_codes where level = 'section') as nace_sections;
