-- dev_seed_occupations_and_salaries.sql
-- APENAS para ambiente de desenvolvimento.
--
-- Dados REAIS, não inventados:
-- - occupations: subconjunto curado da ISCO-08 (OIT), confirmado por
--   fonte antes de incluir (não é a lista completa de 436 grupos base —
--   ver https://webapps.ilo.org/ilostat-files/ISCO/newdocs-08-2021/ISCO-08/ISCO-08%20EN%20Vol%201.pdf
--   para a lista completa).
-- - collective_agreements + tabelas: convenção coletiva REAL
--   (AHRESP/SITESE, restauração e bebidas), publicada no Boletim do
--   Trabalho e Emprego n.º 2 de 15 de janeiro de 2025, consultada
--   diretamente em bte.gep.msess.gov.pt. Os 11 níveis salariais e os
--   valores em euros são os valores exatos da publicação oficial,
--   válidos de 1 de janeiro a 31 de dezembro de 2025. As categorias
--   profissionais mapeadas são um SUBCONJUNTO curado e representativo
--   (a convenção tem cerca de 80 categorias no total) — a lista
--   completa está na fonte oficial citada abaixo.

insert into occupations (isco08_code, major_group_code, major_group_label_pt, preferred_label_pt, preferred_label_en, source, source_url) values
  ('1412', '1', 'Representantes do poder legislativo e de órgãos executivos, dirigentes, diretores e gestores executivos', 'Diretores de hotéis, restaurantes e similares', 'Restaurant managers', 'ISCO-08', 'https://esco.ec.europa.eu'),
  ('3434', '3', 'Técnicos e profissões de nível intermédio', 'Chefes de cozinha', 'Chefs', 'ISCO-08', 'https://esco.ec.europa.eu'),
  ('5120', '5', 'Trabalhadores dos serviços pessoais, de proteção e segurança e vendedores', 'Cozinheiros', 'Cooks', 'ISCO-08', 'https://esco.ec.europa.eu'),
  ('5131', '5', 'Trabalhadores dos serviços pessoais, de proteção e segurança e vendedores', 'Empregados de mesa', 'Waiters', 'ISCO-08', 'https://esco.ec.europa.eu'),
  ('5132', '5', 'Trabalhadores dos serviços pessoais, de proteção e segurança e vendedores', 'Empregados de bar', 'Bartenders', 'ISCO-08', 'https://esco.ec.europa.eu')
on conflict (isco08_code) do nothing;

do $$
declare
  v_agreement_id uuid;
  v_level_xi uuid; v_level_x uuid; v_level_ix uuid; v_level_viii uuid;
  v_level_vii uuid; v_level_vi uuid; v_level_v uuid;
begin
  insert into collective_agreements (
    name, sector_description, country_code, party_employer, party_union,
    covers_workers_count, covers_companies_count,
    source_document_reference, source_url,
    salary_table_effective_from, salary_table_effective_to
  ) values (
    'CCT Restauração e Bebidas (AHRESP/SITESE)',
    'Restauração e bebidas, parques de campismo e campos de golfe',
    'PT', 'AHRESP - Associação da Hotelaria, Restauração e Similares de Portugal',
    'SITESE - Sindicato dos Trabalhadores do Setor de Serviços',
    50000, 24678,
    'Boletim do Trabalho e Emprego n.º 2, 15 de janeiro de 2025',
    'https://bte.gep.msess.gov.pt/documentos/2025/2/00510058.pdf',
    '2025-01-01', '2025-12-31'
  )
  returning id into v_agreement_id;

  insert into collective_agreement_salary_levels (agreement_id, level_code, level_rank, monthly_minimum, currency) values
    (v_agreement_id, 'XI',   11, 1381.00, 'EUR'),
    (v_agreement_id, 'X',    10, 1314.00, 'EUR'),
    (v_agreement_id, 'IX',    9, 1086.00, 'EUR'),
    (v_agreement_id, 'VIII',  8,  978.00, 'EUR'),
    (v_agreement_id, 'VII',   7,  924.00, 'EUR'),
    (v_agreement_id, 'VI',    6,  902.00, 'EUR'),
    (v_agreement_id, 'V',     5,  886.00, 'EUR'),
    (v_agreement_id, 'IV',    4,  881.00, 'EUR'),
    (v_agreement_id, 'III',   3,  876.00, 'EUR'),
    (v_agreement_id, 'II',    2,  873.00, 'EUR'),
    (v_agreement_id, 'I',     1,  870.00, 'EUR');

  select id into v_level_x    from collective_agreement_salary_levels where agreement_id = v_agreement_id and level_code = 'X';
  select id into v_level_viii from collective_agreement_salary_levels where agreement_id = v_agreement_id and level_code = 'VIII';
  select id into v_level_vii  from collective_agreement_salary_levels where agreement_id = v_agreement_id and level_code = 'VII';
  select id into v_level_vi   from collective_agreement_salary_levels where agreement_id = v_agreement_id and level_code = 'VI';
  select id into v_level_v    from collective_agreement_salary_levels where agreement_id = v_agreement_id and level_code = 'V';

  -- Subconjunto curado e representativo (não a lista completa) — nomes
  -- de categoria exatamente como na convenção (Anexo II).
  insert into collective_agreement_job_categories (agreement_id, level_id, category_name, occupation_isco_code) values
    (v_agreement_id, v_level_x,    'Chefe de cozinha',        '3434'),
    (v_agreement_id, v_level_viii, 'Gerente',                 '1412'),
    (v_agreement_id, v_level_viii, 'Chefe de sala',           '5131'),
    (v_agreement_id, v_level_vii,  'Assistente de sala de 1.ª', '5131'),
    (v_agreement_id, v_level_vii,  'Barman/barmaid de 1.ª',   '5132'),
    (v_agreement_id, v_level_vi,   'Assistente de sala de 2.ª', '5131'),
    (v_agreement_id, v_level_vi,   'Barman/barmaid de 2.ª',   '5132'),
    (v_agreement_id, v_level_vi,   'Cozinheiro de 2.ª',       '5120'),
    (v_agreement_id, v_level_v,    'Cozinheiro de 3.ª',       '5120');
end $$;
