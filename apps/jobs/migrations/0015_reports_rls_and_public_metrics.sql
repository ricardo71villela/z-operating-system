-- 0015_reports_rls_and_public_metrics.sql
-- Z Jobs — dois achados só visíveis depois de ativar RLS a sério (P0.3):
--
-- 1. job_offer_reports nunca teve row level security ativado em lado
--    nenhum das migrations anteriores (ao contrário de organization_reports,
--    que já nasceu com RLS em 0011). Com a API sempre ligada como
--    superutilizador até agora, isto nunca se notou na prática — mas é
--    uma tabela de denúncias completamente aberta a qualquer leitura ou
--    escrita. Corrigido aqui, espelhando organization_reports.
--
-- 2. O Employment Responsibility Index (ERI) é pensado para ser
--    informação pública de transparência (um candidato deve poder ver o
--    histórico de um empregador sem precisar de sessão própria), mas o
--    cálculo lê applications e denúncias — tabelas corretamente
--    restritas por RLS a quem é dono/membro/staff. Sem uma função
--    dedicada, o ERI ficaria sempre a zeros para quem não é membro da
--    organização. Esta função devolve SÓ agregados (contagens), nunca
--    linhas individuais de candidatura ou denúncia — o equivalente a uma
--    "view materializada de confiança", não uma fuga de dados privados.

begin;

alter table job_offer_reports enable row level security;

create policy job_offer_reports_select_staff on job_offer_reports
  for select using (is_platform_staff());

create policy job_offer_reports_select_own on job_offer_reports
  for select using (reported_by = auth.uid());

create policy job_offer_reports_insert_authenticated on job_offer_reports
  for insert with check (auth.uid() is not null);

create policy job_offer_reports_manage_staff on job_offer_reports
  for update using (is_platform_staff());

-- Mesmo problema existiria em organization_reports (0011): quem denuncia
-- não conseguia ver a denúncia que acabou de criar, porque INSERT ...
-- RETURNING respeita as políticas de SELECT.
create policy organization_reports_select_own on organization_reports
  for select using (reported_by = auth.uid());

create or replace function employer_public_metrics(p_org_id uuid)
returns jsonb
language sql
security definer
stable
as $$
  select jsonb_build_object(
    'totalApplications', coalesce((
      select count(*) from applications a
      join job_offers jo on jo.id = a.job_offer_id
      where jo.organization_id = p_org_id
    ), 0),
    'respondedApplications', coalesce((
      select count(*) from applications a
      join job_offers jo on jo.id = a.job_offer_id
      where jo.organization_id = p_org_id and a.status <> 'submitted'
    ), 0),
    'informedApplications', coalesce((
      select count(*) from applications a
      join job_offers jo on jo.id = a.job_offer_id
      where jo.organization_id = p_org_id and a.status in ('hired','rejected','withdrawn','closed')
    ), 0),
    'firstJobHiresCount', coalesce((
      select count(*) from applications a
      join job_offers jo on jo.id = a.job_offer_id
      where jo.organization_id = p_org_id and a.status = 'hired' and jo.pillar = 'first_jobs'
    ), 0),
    'seniorHiresCount', coalesce((
      select count(*) from applications a
      join job_offers jo on jo.id = a.job_offer_id
      where jo.organization_id = p_org_id and a.status = 'hired' and jo.pillar = 'senior_careers'
    ), 0),
    'confirmedComplaintsCount', coalesce((
      select
        (select count(*) from organization_reports where organization_id = p_org_id and status = 'resolved')
        +
        (select count(*) from job_offer_reports r join job_offers jo on jo.id = r.job_offer_id
         where jo.organization_id = p_org_id and r.status = 'resolved')
    ), 0)
  );
$$;

commit;
