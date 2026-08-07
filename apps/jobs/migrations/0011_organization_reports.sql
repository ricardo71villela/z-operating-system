-- 0011_organization_reports.sql
-- Z Jobs — corrige uma lacuna real encontrada ao ligar a API a Postgres:
-- job_offer_reports (0005) só suporta denúncias contra ofertas, mas o
-- domínio e a API sempre suportaram denunciar organizações diretamente
-- (ReportRecordFull.targetType: 'job_offer' | 'organization'). Sem esta
-- tabela, uma denúncia contra uma organização não tinha onde viver.

begin;

create table if not exists organization_reports (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  reported_by       uuid references auth.users(id),
  reason            text not null,
  status            text not null default 'open',  -- 'open' | 'reviewing' | 'resolved' | 'dismissed'
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz,
  resolution_notes  text
);

create index if not exists idx_org_reports_org on organization_reports(organization_id);

comment on table organization_reports is
  'Espelha job_offer_reports (0005), mas para denúncias diretas contra uma
   organização em vez de uma oferta específica.';

alter table organization_reports enable row level security;

create policy organization_reports_select_staff on organization_reports
  for select using (is_platform_staff());

create policy organization_reports_insert_authenticated on organization_reports
  for insert with check (auth.uid() is not null);

create policy organization_reports_manage_staff on organization_reports
  for update using (is_platform_staff());

commit;
