-- 0021_occupations_and_salary_references.sql
-- Z Jobs — categorização de profissões e tabelas salariais oficiais.
--
-- Até aqui não existia NENHUMA taxonomia de profissão no domínio — só o
-- "pilar" (fase de vida). Este ficheiro introduz:
--
-- 1. `occupations` — taxonomia oficial de profissões, alinhada com a
--    ISCO-08 (Classificação Internacional Tipo de Profissões, OIT) e a
--    ESCO (classificação oficial da Comissão Europeia, API pública,
--    24 línguas da UE + outras — https://esco.ec.europa.eu). A CPP/2010
--    do INE (Portugal) é uma correspondência direta da ISCO-08, por
--    isso o código ISCO-08 serve de chave universal entre países.
--
-- 2. `collective_agreements` + tabelas relacionadas — tabelas salariais
--    REAIS, extraídas de convenções coletivas publicadas no Boletim do
--    Trabalho e Emprego (BTE), fonte oficial do governo português
--    (bte.gep.msess.gov.pt), nunca inventadas. Cada tabela tem
--    referência ao número/data do BTE e à validade exata da convenção —
--    uma tabela salarial sem isto não é verificável e não deve ser
--    tratada como oficial.
--
-- Princípio (mesmo de cvStudio.ts): isto é ORIENTAÇÃO, nunca bloqueio.
-- Uma oferta com salário abaixo da tabela oficial não é rejeitada — é
-- sinalizada, para que o candidato e o empregador vejam a mesma
-- referência verificável.

begin;

-- ---------- Taxonomia de profissões (ISCO-08 / ESCO / CPP) ----------
create table if not exists occupations (
  isco08_code       text primary key,   -- ex: '5131' (empregados de mesa/bar)
  major_group_code  text not null,      -- 1 dígito, ex: '5'
  major_group_label_pt text not null,   -- ex: 'Trabalhadores dos serviços pessoais, de proteção e segurança'
  preferred_label_pt text not null,
  preferred_label_en text not null,
  source            text not null default 'ISCO-08',   -- 'ISCO-08' | 'ESCO' | 'CPP-2010'
  source_url        text
);

comment on table occupations is
  'Taxonomia oficial de profissões (ISCO-08/ESCO/CPP-2010), nunca inventada
   pela aplicação. Ver https://esco.ec.europa.eu e
   https://www.ine.pt (Classificação Portuguesa das Profissões 2010).';

-- ---------- Convenções coletivas (fonte das tabelas salariais) ----------
create table if not exists collective_agreements (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null,             -- ex: 'CCT Restauração e Bebidas (AHRESP/SITESE)'
  sector_description        text not null,
  country_code              char(2) not null references countries(code),
  party_employer            text not null,             -- ex: 'AHRESP'
  party_union               text not null,             -- ex: 'SITESE'
  covers_workers_count      integer,
  covers_companies_count    integer,

  -- Referência exata à publicação oficial — sem isto, não é verificável.
  source_name               text not null default 'Boletim do Trabalho e Emprego (BTE)',
  source_document_reference text not null,              -- ex: 'BTE n.º 2, 15 de janeiro de 2025'
  source_url                text not null,

  salary_table_effective_from date not null,
  salary_table_effective_to   date not null,

  created_at                timestamptz not null default now()
);

comment on table collective_agreements is
  'Metadados da convenção coletiva. NUNCA inserir sem source_document_reference
   e source_url verificáveis — ver princípio no topo desta migration.';

create table if not exists collective_agreement_salary_levels (
  id             uuid primary key default gen_random_uuid(),
  agreement_id   uuid not null references collective_agreements(id) on delete cascade,
  level_code     text not null,        -- ex: 'XI', 'X', ..., 'I' (numeração própria da convenção)
  level_rank     integer not null,     -- ordinal para ordenação (maior = nível mais alto)
  monthly_minimum numeric(12,2) not null,
  currency       char(3) not null references currencies(code),
  unique (agreement_id, level_code)
);

create table if not exists collective_agreement_job_categories (
  id                  uuid primary key default gen_random_uuid(),
  agreement_id        uuid not null references collective_agreements(id) on delete cascade,
  level_id            uuid not null references collective_agreement_salary_levels(id) on delete cascade,
  category_name       text not null,    -- designação oficial exata da convenção, ex: 'Chefe de sala'
  occupation_isco_code text references occupations(isco08_code)  -- nullable: nem toda categoria de CCT tem correspondência 1:1 óbvia
);

create index if not exists idx_cct_categories_agreement on collective_agreement_job_categories(agreement_id);
create index if not exists idx_cct_categories_occupation on collective_agreement_job_categories(occupation_isco_code);

-- ---------- Ligação da oferta à taxonomia oficial ----------
alter table job_offers add column if not exists occupation_isco_code text references occupations(isco08_code);

comment on column job_offers.occupation_isco_code is
  'Categorização oficial da oferta (ISCO-08/ESCO), opcional — permite
   pesquisa por profissão e comparação com tabelas salariais oficiais
   (collective_agreement_salary_levels), nunca bloqueia publicação.';

-- ---------- RLS: dados de referência oficiais, leitura pública, escrita só staff ----------
alter table occupations enable row level security;
alter table collective_agreements enable row level security;
alter table collective_agreement_salary_levels enable row level security;
alter table collective_agreement_job_categories enable row level security;

create policy occupations_select_public on occupations for select using (true);
create policy occupations_manage_staff on occupations for all using (is_platform_staff()) with check (is_platform_staff());

create policy collective_agreements_select_public on collective_agreements for select using (true);
create policy collective_agreements_manage_staff on collective_agreements for all using (is_platform_staff()) with check (is_platform_staff());

create policy cct_salary_levels_select_public on collective_agreement_salary_levels for select using (true);
create policy cct_salary_levels_manage_staff on collective_agreement_salary_levels for all using (is_platform_staff()) with check (is_platform_staff());

create policy cct_job_categories_select_public on collective_agreement_job_categories for select using (true);
create policy cct_job_categories_manage_staff on collective_agreement_job_categories for all using (is_platform_staff()) with check (is_platform_staff());

commit;
