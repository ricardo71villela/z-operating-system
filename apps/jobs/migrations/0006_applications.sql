-- 0006_applications.sql
-- Z Jobs — candidaturas e pipeline básico (secção 11).

begin;

do $$ begin
  create type application_status as enum (
    'submitted',
    'received',
    'screening',
    'shortlisted',
    'interview',
    'assessment',
    'offer',
    'hired',
    'rejected',
    'withdrawn',
    'closed'
  );
exception when duplicate_object then null; end $$;

create table if not exists applications (
  id              uuid primary key default gen_random_uuid(),
  job_offer_id    uuid not null references job_offers(id),
  candidate_id    uuid not null references auth.users(id),
  status          application_status not null default 'submitted',
  cover_note      text,
  resume_document_id uuid references candidate_documents(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (job_offer_id, candidate_id)
);

create index if not exists idx_applications_offer on applications(job_offer_id);
create index if not exists idx_applications_candidate on applications(candidate_id);
create index if not exists idx_applications_status on applications(status);

create table if not exists application_status_history (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references applications(id) on delete cascade,
  from_status     application_status,
  to_status       application_status not null,
  changed_by      uuid references auth.users(id),
  note            text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_status_history_app on application_status_history(application_id);

create table if not exists application_notes (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references applications(id) on delete cascade,
  author_id       uuid not null references auth.users(id),
  note            text not null,
  created_at      timestamptz not null default now()
);

create table if not exists saved_job_offers (
  user_id       uuid not null references auth.users(id) on delete cascade,
  job_offer_id  uuid not null references job_offers(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, job_offer_id)
);

create table if not exists job_alerts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  query_params    jsonb not null,   -- filtros: pillar, location, contract_type, keywords...
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

commit;
