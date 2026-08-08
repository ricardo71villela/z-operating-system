-- dev_seed_labor_legislation_de.sql
-- APENAS para ambiente de desenvolvimento.
--
-- Alemanha — só metadados de citação; NUNCA escalões (não os tem, usa
-- uma fórmula contínua). O motor real está em
-- packages/domain/src/rules/netSalarySimulator.ts
-- (calculateGermanNetSalary), chamado diretamente por server.ts para
-- este país, ver o caso especial na rota /tax-simulator/:countryCode.

insert into country_tax_profiles (
  country_code, employee_social_contribution_rate, currency,
  tax_bracket_source, tax_bracket_source_url,
  social_contribution_source, social_contribution_source_url,
  applicable_tax_year, scope_notes
) values (
  'DE', 0.2175, 'EUR',
  '§32a EStG (Einkommensteuergesetz), redação do Steuerfortentwicklungsgesetz de 23 de dezembro de 2024, em vigor desde 1 de janeiro de 2026',
  'https://dejure.org/gesetze/EStG/32a.html',
  'Rentenversicherung (Deutsche Rentenversicherung), Krankenversicherung (médias setoriais), Pflegeversicherung, Arbeitslosenversicherung (Bundesagentur für Arbeit) — 2026',
  'https://www.deutsche-rentenversicherung.de',
  2026,
  'Estimativa simplificada: pessoa solteira, sem filhos (inclui o suplemento de 0,6% do Pflegeversicherung para quem não tem filhos). ' ||
  'Fórmula fiscal CONTÍNUA (não escalões) — taxa 0,2175 acima é só uma média informativa, não é usada no cálculo real, que aplica cada ' ||
  'ramo da segurança social com o seu próprio teto de contribuição (Beitragsbemessungsgrenze) individualmente. Sem o Arbeitnehmer-Pauschbetrag ' ||
  'nem outras deduções. NÃO substitui o simulador oficial nem aconselhamento fiscal.'
)
on conflict (country_code) do nothing;
