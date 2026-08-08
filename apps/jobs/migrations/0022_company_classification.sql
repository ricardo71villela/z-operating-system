-- 0022_company_classification.sql
-- Z Jobs — classificação oficial e filtrável de empresas.
--
-- Até aqui, `sector` e `size_range` em company_profiles eram texto livre
-- sem nenhuma classificação oficial por trás — não davam para filtrar de
-- forma fiável (duas empresas do mesmo setor podiam escrever "tech" e
-- "Tecnologia" e nunca corresponderem numa pesquisa). Mesmo princípio já
-- aplicado a profissões (migration 0021):
--
-- 1. `nace_codes` — setor de atividade económica segundo a NACE Rev. 2
--    (Nomenclatura Estatística das Atividades Económicas na Comunidade
--    Europeia), norma oficial do Eurostat, base legal no Regulamento
--    (CE) n.º 1893/2006. Fonte: https://ec.europa.eu/eurostat/web/nace
--
-- 2. `employee_count` — número exato de funcionários (substitui a
--    dependência exclusiva de size_range em texto livre). A partir
--    deste número, packages/domain/src/rules/companyClassification.ts
--    calcula a categoria PME segundo a Recomendação 2003/361/CE da
--    Comissão Europeia — mas só com o critério de pessoal, nunca com
--    volume de negócios/balanço (que esta plataforma não recolhe), por
--    isso é sempre tratado como estimativa parcial, nunca como
--    classificação oficial completa — ver comentário no módulo de
--    domínio para a explicação completa.

begin;

create table if not exists nace_codes (
  code           text primary key,   -- ex: '56.10' (nível Classe, 4 dígitos + ponto)
  level          text not null,       -- 'section' | 'division' | 'group' | 'class'
  section_letter text,                -- ex: 'I' (Alojamento, restauração e similares)
  label_pt       text not null,
  label_en       text not null,
  source         text not null default 'NACE Rev. 2 (Eurostat)',
  source_url     text
);

comment on table nace_codes is
  'Classificação oficial de atividade económica (NACE Rev. 2, Eurostat,
   Regulamento (CE) n.º 1893/2006). Subconjunto curado e verificado, não a
   lista completa (21 secções, 88 divisões, 272 grupos, 615 classes) — ver
   https://ec.europa.eu/eurostat/web/nace para a lista completa.';

alter table company_profiles add column if not exists employee_count integer;
alter table company_profiles add column if not exists employee_count_updated_at timestamptz;
alter table company_profiles add column if not exists nace_code text references nace_codes(code);

comment on column company_profiles.employee_count is
  'Número exato de funcionários, auto-declarado pela organização (nunca
   verificado externamente nesta versão — daí employee_count_updated_at
   para se poder avaliar a idade da informação). Substitui a dependência
   exclusiva de size_range (texto livre) como campo filtrável.';

alter table company_profiles add constraint chk_employee_count_non_negative
  check (employee_count is null or employee_count >= 0);

-- ---------- RLS: dados de referência oficiais, leitura pública, escrita só staff ----------
alter table nace_codes enable row level security;
create policy nace_codes_select_public on nace_codes for select using (true);
create policy nace_codes_manage_staff on nace_codes for all using (is_platform_staff()) with check (is_platform_staff());

commit;
