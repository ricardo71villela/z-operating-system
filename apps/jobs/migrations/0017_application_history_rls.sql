-- 0017_application_history_rls.sql
-- Z Jobs — application_status_history também sem RLS. É a tabela que
-- application.ts/pgStore.ts já escrevem a cada transição de estado — sem
-- isto, o histórico completo de candidaturas (quem entrevistou quem, e
-- quando) ficava legível por qualquer sessão. Espelha exatamente as
-- políticas já existentes em applications (0007).

begin;

alter table application_status_history enable row level security;

create policy application_history_candidate_own on application_status_history
  for select using (
    exists (select 1 from applications a where a.id = application_status_history.application_id and a.candidate_id = auth.uid())
  );

create policy application_history_org_own_offers on application_status_history
  for select using (
    exists (
      select 1 from applications a
      join job_offers jo on jo.id = a.job_offer_id
      where a.id = application_status_history.application_id and is_org_member(jo.organization_id)
    )
  );

-- Inserts feitos exclusivamente pela camada de aplicação (PgStore), nunca
-- diretamente pelo cliente — sem policy de insert explícita para o
-- utilizador final, só o papel da aplicação (zjobs_app) escreve via
-- transitionApplication/createApplication.
create policy application_history_insert_participant on application_status_history
  for insert with check (
    exists (select 1 from applications a where a.id = application_status_history.application_id and a.candidate_id = auth.uid())
    or exists (
      select 1 from applications a
      join job_offers jo on jo.id = a.job_offer_id
      where a.id = application_status_history.application_id and is_org_member(jo.organization_id)
    )
  );

commit;
