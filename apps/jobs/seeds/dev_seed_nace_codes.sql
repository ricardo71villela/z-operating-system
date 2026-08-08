-- dev_seed_nace_codes.sql
-- APENAS para ambiente de desenvolvimento.
-- Subconjunto curado da NACE Rev. 2 (Eurostat) — códigos confirmados
-- antes de incluir, não a lista completa. Ver
-- https://ec.europa.eu/eurostat/web/nace para a lista completa (21
-- secções, 88 divisões, 272 grupos, 615 classes).

insert into nace_codes (code, level, section_letter, label_pt, label_en, source_url) values
  ('I',     'section',  'I', 'Alojamento, restauração e similares', 'Accommodation and food service activities', 'https://ec.europa.eu/eurostat/web/nace'),
  ('56.10', 'class',    'I', 'Restaurantes e outras atividades de serviço de refeições', 'Restaurants and mobile food service activities', 'https://ec.europa.eu/eurostat/web/nace'),
  ('J',     'section',  'J', 'Atividades de informação e de comunicação', 'Information and communication', 'https://ec.europa.eu/eurostat/web/nace'),
  ('62.01', 'class',    'J', 'Atividades de programação informática', 'Computer programming activities', 'https://ec.europa.eu/eurostat/web/nace'),
  ('62.02', 'class',    'J', 'Atividades de consultoria em informática', 'Computer consultancy activities', 'https://ec.europa.eu/eurostat/web/nace')
on conflict (code) do nothing;
