-- 0005_job_offers.sql
-- Z Jobs — ofertas de emprego (secção 10). Entidade central, rica e auditável.

begin;

do $$ begin
  create type job_offer_status as enum (
    'draft',
    'pending_review',
    'needs_changes',
    'approved',
    'scheduled',
    'published',
    'paused',
    'filled',
    'expired',
    'rejected',
    'suspended',
    'archived'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type salary_period as enum ('hourly', 'daily', 'monthly', 'yearly');
exception when duplicate_object then null; end $$;

do $$ begin
  create type job_pillar as enum ('first_jobs', 'professional_careers', 'senior_careers');
exception when duplicate_object then null; end $$;

create table if not exists job_offers (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references organizations(id),
  created_by              uuid not null references auth.users(id),
  reviewed_by             uuid references auth.users(id),

  title                   text not null,
  description             text not null,
  responsibilities        text,
  required_qualifications text,
  preferred_qualifications text,

  contract_type           contract_type not null,
  contract_duration_notes text,               -- ex: "6 meses, renovável"
  trial_period_notes      text,

  -- Salário estrutural — nunca apenas texto livre (secção 3.4 e 4).
  salary_min              numeric(12,2) not null,
  salary_max              numeric(12,2),
  salary_currency         char(3) not null references currencies(code),
  salary_period            salary_period not null default 'monthly',
  has_fixed_salary        boolean not null default true,
  variable_compensation_notes text,           -- comissões/prémios, nunca substituindo o fixo

  work_regime             work_regime not null,
  location_id             uuid references locations(id),   -- pode ser nulo se 100% remoto
  weekly_hours            numeric(5,2),

  benefits                text,
  expected_start_date     date,
  application_process_notes text,
  application_deadline    timestamptz,

  accessibility_notes     text,
  language_requirements   text[] not null default '{}',
  work_authorization_required text,

  pillar                  job_pillar not null default 'professional_careers',

  status                  job_offer_status not null default 'draft',
  rejection_reason        text,
  published_at            timestamptz,
  expires_at              timestamptz,
  filled_at               timestamptz,

  version                 integer not null default 1,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists idx_job_offers_org on job_offers(organization_id);
create index if not exists idx_job_offers_status on job_offers(status);
create index if not exists idx_job_offers_pillar on job_offers(pillar);
create index if not exists idx_job_offers_location on job_offers(location_id);

comment on table job_offers is
  'has_fixed_salary deve ser sempre true para publicação — validado em
   packages/domain/src/rules/jobOffer.ts ANTES de qualquer INSERT/UPDATE
   de status para approved/published (secção 3.2 e 3.3).';

-- Histórico de versões (imutável) para auditoria.
create table if not exists job_offer_revisions (
  id              uuid primary key default gen_random_uuid(),
  job_offer_id    uuid not null references job_offers(id) on delete cascade,
  version         integer not null,
  snapshot        jsonb not null,       -- estado completo da oferta nesta versão
  changed_by      uuid not null references auth.users(id),
  change_reason   text,
  created_at      timestamptz not null default now(),
  unique (job_offer_id, version)
);

create table if not exists job_offer_reports (
  id              uuid primary key default gen_random_uuid(),
  job_offer_id    uuid not null references job_offers(id) on delete cascade,
  reported_by     uuid references auth.users(id),
  reason          text not null,
  status          text not null default 'open',  -- 'open' | 'reviewing' | 'resolved' | 'dismissed'
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  resolution_notes text
);

create index if not exists idx_reports_offer on job_offer_reports(job_offer_id);

commit;
