-- 0020_temp_agency_transparency.sql
-- Z Jobs — trabalho temporário/interim tratado a sério (Diretiva
-- 2008/104/CE, Artigos 5.º e 6.º). Até aqui, 'temporary_agency' e
-- 'interim' existiam como valores válidos de contract_type mas sem
-- nenhum campo a distinguir a ETT/agência (organization_id, sempre o
-- empregador legal) da empresa utilizadora (onde o trabalho é
-- efetivamente prestado) — exatamente a informação que a Diretiva exige
-- tornar transparente. Ver packages/domain/src/rules/jobOffer.ts para a
-- validação correspondente, que corre sempre ANTES desta camada.

begin;

alter table job_offers
  add column if not exists user_company_name text,
  add column if not exists user_company_location_id uuid references locations(id),
  add column if not exists assignment_end_date date,
  add column if not exists equal_treatment_confirmed boolean not null default false,
  add column if not exists collective_agreement_derogation_reference text,
  add column if not exists informed_of_permanent_vacancies boolean not null default false;

comment on column job_offers.user_company_name is
  'Empresa onde o trabalho é efetivamente prestado (trabalho temporário/
   interim). NUNCA a mesma entidade que organization_id — validado em
   jobOffer.ts e reforçado pela check constraint abaixo.';

comment on column job_offers.equal_treatment_confirmed is
  'Atestação de que a remuneração corresponde à de um trabalhador
   equivalente contratado diretamente pela empresa utilizadora (Art. 5.º,
   n.º 1). Pode ser falso apenas se collective_agreement_derogation_reference
   estiver preenchido (Art. 5.º, n.º 3).';

-- Defesa em profundidade: a mesma regra que já corre no domain layer,
-- repetida aqui para que nenhum caminho de escrita (incluindo scripts
-- futuros que não passem por packages/domain) consiga contornar o
-- requisito mínimo de identificar a empresa utilizadora.
alter table job_offers add constraint chk_temp_agency_user_company_identified
  check (
    contract_type not in ('temporary_agency', 'interim')
    or (user_company_name is not null and length(trim(user_company_name)) >= 2)
  );

commit;
