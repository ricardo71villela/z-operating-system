-- 0003_companies.sql
-- Z Jobs — perfis de empregador e verificação (secção 7).

begin;

do $$ begin
  create type verification_status as enum (
    'unverified',
    'pending',
    'verified',
    'enhanced_verified',
    'restricted',
    'suspended',
    'rejected'
  );
exception when duplicate_object then null; end $$;

create table if not exists company_profiles (
  organization_id       uuid primary key references organizations(id) on delete cascade,
  sector                text,
  size_range             text,                 -- ex: '1-10', '11-50', '51-200', '201-1000', '1000+'
  headquarters_location_id uuid references locations(id),
  description            text,
  culture_notes          text,
  remote_policy_notes    text,
  inclusion_policy_notes text,
  logo_url               text,
  cover_video_url        text,
  authorized_email_domains text[] not null default '{}',
  verification_status    verification_status not null default 'unverified',
  verification_requested_at timestamptz,
  verified_at            timestamptz,
  verified_by            uuid references auth.users(id),
  rejection_reason       text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table company_profiles is
  'Extensão de organizations para type = employer | employer_group |
   recruitment_agency | temp_work_agency. Só organizações com
   verification_status IN (verified, enhanced_verified) podem publicar
   ofertas (regra aplicada em RLS + domínio, secção 7).';

create table if not exists company_locations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  location_id     uuid not null references locations(id),
  is_headquarters boolean not null default false
);

create index if not exists idx_company_locations_org on company_locations(organization_id);

-- Employment Responsibility Index — componentes auditáveis, não fórmula pública (secção 8).
create table if not exists employer_responsibility_metrics (
  organization_id             uuid primary key references organizations(id) on delete cascade,
  salary_transparency_score   numeric(5,2),
  offer_completeness_score    numeric(5,2),
  response_rate               numeric(5,2),
  avg_response_time_hours     numeric(10,2),
  candidates_informed_rate    numeric(5,2),
  confirmed_complaints_count  integer not null default 0,
  offer_vs_reality_divergence_count integer not null default 0,
  first_job_hires_count       integer not null default 0,
  senior_hires_count          integer not null default 0,
  updated_at                  timestamptz not null default now()
);

comment on table employer_responsibility_metrics is
  'Componentes calculados por jobs de background. Nenhum selo (Verified
   Employer, Salary Transparent Employer, ...) é atribuído manualmente ou
   comprado — ver secção 8.';

create table if not exists employer_badges (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  badge_code      text not null,   -- 'verified_employer' | 'salary_transparent' | 'first_job_employer' | ...
  awarded_at      timestamptz not null default now(),
  revoked_at      timestamptz,
  unique (organization_id, badge_code)
);

commit;
