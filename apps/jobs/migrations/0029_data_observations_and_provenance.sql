-- 0029_data_observations_and_provenance.sql
-- Local Z Jobs implementation of the ZOS Data Observation + Provenance model.
-- These tables are intentionally generic enough to promote later, but do not
-- move employment semantics out of Z Jobs.

begin;

do $$ begin
  create type data_observation_status as enum ('recorded','validated','superseded','archived');
exception when duplicate_object then null; end $$;

create table if not exists data_sources (
  id            uuid primary key default gen_random_uuid(),
  source_type   text not null,
  name          text not null,
  publisher     text,
  source_uri    text,
  market_code   char(2) references countries(code),
  locale        text references locales(code),
  trust_hint    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists data_observations (
  id                  uuid primary key default gen_random_uuid(),
  -- Prefer the future ZOS id when available; local subject fields provide a
  -- compatibility bridge while Registry convergence is progressive.
  subject_registry_id text,
  subject_local_type  text,
  subject_local_id    text,
  metric              text not null,
  value                jsonb not null,
  unit                 text,
  market_code          char(2) references countries(code),
  locale               text references locales(code),
  source_id            uuid not null references data_sources(id),
  observed_at          timestamptz not null,
  valid_from           timestamptz,
  valid_to             timestamptz,
  status               data_observation_status not null default 'recorded',
  provenance_method    text not null,
  confidence           numeric(5,4),
  raw_reference        text,
  provenance_notes     text,
  supersedes_id        uuid references data_observations(id),
  created_at           timestamptz not null default now(),
  check (subject_registry_id is not null or (subject_local_type is not null and subject_local_id is not null)),
  check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create index if not exists idx_data_observations_registry_subject
  on data_observations(subject_registry_id, metric, observed_at desc)
  where subject_registry_id is not null;
create index if not exists idx_data_observations_local_subject
  on data_observations(subject_local_type, subject_local_id, metric, observed_at desc);
create index if not exists idx_data_observations_source on data_observations(source_id);

comment on table data_observations is
  'ZOS Data primitive: an observed value about an entity, with source/time/provenance. Not Registry identity and not a Trust assessment.';

alter table data_sources enable row level security;
alter table data_observations enable row level security;

create policy data_sources_staff_read on data_sources
  for select using (is_platform_staff());
create policy data_observations_staff_read on data_observations
  for select using (is_platform_staff());

commit;
