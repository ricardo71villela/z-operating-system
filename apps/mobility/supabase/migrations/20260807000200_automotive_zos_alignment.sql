-- Z Mobility alignment with ZOS Architectural Constitution v1.1.
-- Registry identity stays in the existing automotive_* hierarchy.
-- Legacy "variant" persists physically; canonical domain terminology is "version".

alter table public.automotive_staging_records
  add column if not exists canonical_entity_type text;

alter table public.automotive_reconciliation_queue
  add column if not exists canonical_entity_type text;

update public.automotive_staging_records
set canonical_entity_type = 'version'
where entity_type = 'variant' and canonical_entity_type is null;

update public.automotive_reconciliation_queue
set canonical_entity_type = 'version'
where candidate_entity_type = 'variant' and canonical_entity_type is null;

-- Semantic compatibility view. Identity remains the same row/UUID.
create or replace view public.automotive_versions as
select
  id,
  generation_id,
  body_style_id,
  name,
  slug,
  internal_code,
  market_code,
  model_year_start,
  model_year_end,
  doors,
  seats,
  automotive_dna,
  active,
  data_quality_score,
  source_id,
  created_at,
  updated_at
from public.automotive_variants;

-- Orthogonal state transition history. No universal lifecycle is imposed.
create table if not exists public.automotive_state_history (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null,
  subject_id uuid not null,
  state_machine text not null,
  previous_state text,
  next_state text not null,
  actor_type text not null default 'system',
  actor_id uuid,
  reason text,
  correlation_id text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists automotive_state_history_subject_idx
  on public.automotive_state_history(subject_type, subject_id, state_machine, occurred_at desc);

-- Data Observation primitive. Facts do not overwrite Registry identity.
create table if not exists public.automotive_observations (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null,
  entity_type text not null,
  metric_key text not null,
  value_json jsonb,
  unit text,
  status text not null default 'recorded',
  confidence_score numeric(5,2),
  source_id uuid references public.automotive_data_sources(id),
  source_code text,
  source_type text,
  document_type text,
  document_url text,
  document_sha256 text,
  language text,
  country_code text,
  market_code text,
  external_record_id text,
  staging_record_id uuid references public.automotive_staging_records(id),
  import_run_id uuid references public.automotive_import_runs(id),
  extraction_path text,
  raw_key text,
  raw_value_json jsonb,
  parser_version text,
  provenance_json jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  valid_from timestamptz,
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists automotive_observation_identity_idx
  on public.automotive_observations(
    entity_id,
    metric_key,
    source_id,
    external_record_id,
    extraction_path,
    observed_at
  );
create index if not exists automotive_observations_entity_metric_idx
  on public.automotive_observations(entity_id, metric_key, status, observed_at desc);
create index if not exists automotive_observations_source_idx
  on public.automotive_observations(source_id, external_record_id);

-- Resolved projection: derived view of observations, never a second canonical identity.
create table if not exists public.automotive_resolved_profiles (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null,
  entity_type text not null,
  resolved_payload jsonb not null default '{}'::jsonb,
  source_count integer not null default 0,
  observation_count integer not null default 0,
  conflict_count integer not null default 0,
  policy_version text not null,
  resolved_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(entity_id, entity_type)
);

-- Marketplace boundary: concrete Vehicle may reference the Registry Version and ZOS Organization.
alter table public.vehicles add column if not exists version_id uuid references public.automotive_variants(id);
alter table public.vehicles add column if not exists dealer_organization_id uuid;
create index if not exists vehicles_version_idx on public.vehicles(version_id);
create index if not exists vehicles_dealer_org_idx on public.vehicles(dealer_organization_id);

-- Legacy fields are intentionally retained:
--   vehicles.variant     -> display compatibility
--   vehicles.dealer_id   -> pre-ZOS dealer identity compatibility
--   vehicles.verified    -> UI projection only, not Trust source-of-truth
--   automotive_golden_*  -> compatibility during projection migration
