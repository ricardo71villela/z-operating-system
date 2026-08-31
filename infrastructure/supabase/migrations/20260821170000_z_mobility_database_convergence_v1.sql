-- ============================================================
-- Z Mobility Database Convergence v1
-- Shared ZOS database lineage
-- ============================================================
--
-- Vertical schema: mobility
--
-- Compatibility decision:
--   Existing Z Mobility operational and automotive registry tables
--   remain in public during this convergence phase so the current
--   ingestion, reconciliation and marketplace runtime is not broken
--   by a schema move.
--
--   Historical standalone migrations under
--   apps/mobility/supabase/migrations are development provenance,
--   not a second integrated deployment authority.
--
-- Canonical cross-product capabilities remain owned elsewhere:
--   Organisation identity -> zos.organisations
--   Registry bridge        -> zos.registry_bindings
--   Shared Geography       -> zos.geography_*
--   Shared Data primitive  -> zos.observations / zos.data_sources
--
-- Automotive semantics remain Mobility-owned. The local automotive
-- hierarchy participates in the ZOS Registry through local_only
-- bindings without inventing a second ZOS canonical entity record.
-- ============================================================

create schema if not exists mobility;
comment on schema mobility is
  'Z Mobility vertical-owned database boundary. Legacy operational automotive tables remain in public for runtime compatibility during convergence.';

-- ------------------------------------------------------------
-- 1. Preconditions
-- ------------------------------------------------------------

do $$
begin
  if to_regclass('zos.registry_bindings') is null then
    raise exception 'Z Mobility convergence requires canonical zos.registry_bindings';
  end if;
  if to_regclass('zos.organisations') is null then
    raise exception 'Z Mobility convergence requires canonical zos.organisations';
  end if;
  if to_regclass('zos.geography_locations') is null then
    raise exception 'Z Mobility convergence requires canonical zos.geography_locations';
  end if;
  if to_regclass('zos.observations') is null then
    raise exception 'Z Mobility convergence requires canonical zos.observations';
  end if;
end $$;

create extension if not exists pgcrypto;

-- Mobility-owned timestamp trigger. Do not replace a generic public
-- function owned by another vertical.
create or replace function mobility.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 2. Runtime-compatible automotive baseline
-- ------------------------------------------------------------

create table if not exists public.automotive_data_sources (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  website_url text,
  source_type text not null default 'other',
  priority integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automotive_manufacturers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  legal_name text,
  country_code text,
  headquarters_city text,
  founded_year integer,
  website_url text,
  active boolean not null default true,
  data_quality_score numeric(5,2),
  source_id uuid references public.automotive_data_sources(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automotive_brands (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid references public.automotive_manufacturers(id),
  name text not null,
  slug text not null unique,
  country_code text,
  market_segment text,
  is_electric_brand boolean not null default false,
  is_historic boolean not null default false,
  active boolean not null default true,
  data_quality_score numeric(5,2),
  source_id uuid references public.automotive_data_sources(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automotive_brand_aliases (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.automotive_brands(id) on delete cascade,
  alias text not null,
  normalized_alias text not null unique,
  source text,
  created_at timestamptz not null default now()
);

create table if not exists public.automotive_body_styles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automotive_models (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.automotive_brands(id),
  name text not null,
  slug text not null,
  internal_code text,
  production_start_year integer,
  production_end_year integer,
  active boolean not null default true,
  discontinued boolean not null default false,
  data_quality_score numeric(5,2),
  source_id uuid references public.automotive_data_sources(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, slug)
);

create table if not exists public.automotive_generations (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.automotive_models(id),
  name text not null,
  slug text not null,
  generation_code text,
  platform_code text,
  production_start date,
  production_end date,
  model_year_start integer,
  model_year_end integer,
  facelift boolean not null default false,
  active boolean not null default true,
  data_quality_score numeric(5,2),
  source_id uuid references public.automotive_data_sources(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (model_id, slug)
);

create table if not exists public.automotive_variants (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references public.automotive_generations(id),
  body_style_id uuid references public.automotive_body_styles(id),
  name text not null,
  slug text not null,
  internal_code text,
  market_code text not null default 'EU',
  model_year_start integer,
  model_year_end integer,
  doors integer,
  seats integer,
  automotive_dna text,
  active boolean not null default true,
  data_quality_score numeric(5,2),
  source_id uuid references public.automotive_data_sources(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (generation_id, slug, market_code)
);

create table if not exists public.automotive_import_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.automotive_data_sources(id),
  entity_type text not null,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  rows_received integer not null default 0,
  rows_inserted integer not null default 0,
  rows_updated integer not null default 0,
  rows_rejected integer not null default 0,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.automotive_staging_records (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.automotive_data_sources(id),
  import_run_id uuid references public.automotive_import_runs(id),
  entity_type text not null,
  external_id text not null,
  external_parent_id text,
  raw_name text,
  normalized_name text,
  raw_payload jsonb not null default '{}'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  source_country_code text,
  market_code text,
  status text not null default 'pending',
  confidence_score numeric(5,2),
  validation_errors jsonb not null default '[]'::jsonb,
  validation_warnings jsonb not null default '[]'::jsonb,
  matched_entity_type text,
  matched_entity_id uuid,
  review_notes text,
  reviewed_at timestamptz,
  canonical_entity_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, entity_type, external_id)
);

create table if not exists public.automotive_reconciliation_queue (
  id uuid primary key default gen_random_uuid(),
  staging_record_id uuid not null references public.automotive_staging_records(id) on delete cascade,
  candidate_entity_type text,
  candidate_entity_id uuid,
  canonical_entity_type text,
  match_method text,
  match_score numeric(5,2),
  decision text not null default 'pending',
  decision_notes text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staging_record_id)
);

create table if not exists public.automotive_golden_records (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  canonical_payload jsonb not null default '{}'::jsonb,
  quality_score numeric(5,2) not null default 0,
  completeness_score numeric(5,2) not null default 0,
  source_count integer not null default 0,
  last_reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_type, entity_id)
);

create table if not exists public.automotive_golden_sources (
  id uuid primary key default gen_random_uuid(),
  golden_record_id uuid not null references public.automotive_golden_records(id) on delete cascade,
  source_id uuid not null references public.automotive_data_sources(id),
  staging_record_id uuid not null references public.automotive_staging_records(id),
  payload jsonb not null default '{}'::jsonb,
  confidence_score numeric(5,2),
  is_primary boolean not null default false,
  active boolean not null default true,
  imported_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (golden_record_id, source_id, staging_record_id)
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid,
  slug text not null unique,
  brand text not null,
  model text not null,
  variant text,
  year integer not null,
  mileage integer not null default 0,
  power_hp integer,
  power_kw integer,
  fuel text not null default 'Other',
  transmission text not null default 'Automatic',
  country text not null,
  city text,
  price numeric(14,2) not null,
  currency text not null default 'EUR',
  verified boolean not null default false,
  featured boolean not null default false,
  status text not null default 'draft',
  main_image_url text,
  version_id uuid references public.automotive_variants(id),
  dealer_organization_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicle_images (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  storage_path text,
  image_url text not null,
  alt_text text,
  width integer,
  height integer,
  position integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

-- Complete an installation where an earlier Mobility-local baseline already exists.
alter table public.automotive_staging_records add column if not exists import_run_id uuid references public.automotive_import_runs(id);
alter table public.automotive_staging_records add column if not exists validation_errors jsonb not null default '[]'::jsonb;
alter table public.automotive_staging_records add column if not exists validation_warnings jsonb not null default '[]'::jsonb;
alter table public.automotive_staging_records add column if not exists reviewed_at timestamptz;
alter table public.automotive_staging_records add column if not exists canonical_entity_type text;
alter table public.automotive_staging_records add column if not exists updated_at timestamptz not null default now();
alter table public.automotive_reconciliation_queue add column if not exists canonical_entity_type text;
alter table public.automotive_reconciliation_queue add column if not exists updated_at timestamptz not null default now();
alter table public.vehicles add column if not exists version_id uuid references public.automotive_variants(id);
alter table public.vehicles add column if not exists dealer_organization_id uuid;

update public.automotive_staging_records
set canonical_entity_type = 'version'
where entity_type = 'variant' and canonical_entity_type is null;

update public.automotive_reconciliation_queue
set canonical_entity_type = 'version'
where candidate_entity_type = 'variant' and canonical_entity_type is null;

-- ------------------------------------------------------------
-- 3. Canonical automotive terminology + domain observations
-- ------------------------------------------------------------

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

comment on table public.automotive_observations is
  'Z Mobility-owned technical observation store. Cross-product Data authority remains zos.observations; this table retains automotive ingestion semantics and provenance without becoming Registry identity.';

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

comment on table public.automotive_resolved_profiles is
  'Derived Z Mobility read model from automotive observations. It is not a second canonical Registry identity.';

create index if not exists automotive_models_brand_idx on public.automotive_models(brand_id);
create index if not exists automotive_generations_model_idx on public.automotive_generations(model_id);
create index if not exists automotive_variants_generation_market_idx on public.automotive_variants(generation_id, market_code);
create index if not exists automotive_staging_status_idx on public.automotive_staging_records(status, entity_type);
create index if not exists automotive_state_history_subject_idx on public.automotive_state_history(subject_type, subject_id, state_machine, occurred_at desc);
create unique index if not exists automotive_observation_identity_idx
  on public.automotive_observations(entity_id, metric_key, source_id, external_record_id, extraction_path, observed_at);
create index if not exists automotive_observations_entity_metric_idx
  on public.automotive_observations(entity_id, metric_key, status, observed_at desc);
create index if not exists automotive_observations_source_idx
  on public.automotive_observations(source_id, external_record_id);
create index if not exists vehicles_status_idx on public.vehicles(status, featured, created_at desc);
create index if not exists vehicles_version_idx on public.vehicles(version_id);
create index if not exists vehicles_dealer_org_idx on public.vehicles(dealer_organization_id);
create index if not exists vehicle_images_vehicle_idx on public.vehicle_images(vehicle_id, is_primary desc, position);

-- Updated-at triggers use Mobility-owned function while retaining the
-- historical trigger name per table for compatibility.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'automotive_data_sources','automotive_manufacturers','automotive_brands',
    'automotive_body_styles','automotive_models','automotive_generations',
    'automotive_variants','automotive_staging_records','automotive_reconciliation_queue',
    'automotive_golden_records','automotive_golden_sources','automotive_observations',
    'automotive_resolved_profiles','vehicles'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function mobility.set_updated_at()',
      table_name
    );
  end loop;
end $$;

-- ------------------------------------------------------------
-- 4. ZOS Registry bridge for local automotive identities
-- ------------------------------------------------------------

create or replace function mobility.ensure_registry_binding()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  insert into zos.registry_bindings (
    domain_code,
    local_entity_type,
    local_entity_id,
    binding_status
  )
  values (
    'mobility',
    tg_argv[0],
    new.id::text,
    'local_only'
  )
  on conflict do nothing;
  return new;
end;
$$;

comment on function mobility.ensure_registry_binding() is
  'Creates a local_only ZOS Registry binding for a new Mobility-owned automotive identity without inventing a second canonical entity.';

-- Backfill pre-existing identities.
insert into zos.registry_bindings(domain_code, local_entity_type, local_entity_id, binding_status)
select 'mobility', 'manufacturer', id::text, 'local_only' from public.automotive_manufacturers
on conflict do nothing;
insert into zos.registry_bindings(domain_code, local_entity_type, local_entity_id, binding_status)
select 'mobility', 'brand', id::text, 'local_only' from public.automotive_brands
on conflict do nothing;
insert into zos.registry_bindings(domain_code, local_entity_type, local_entity_id, binding_status)
select 'mobility', 'model', id::text, 'local_only' from public.automotive_models
on conflict do nothing;
insert into zos.registry_bindings(domain_code, local_entity_type, local_entity_id, binding_status)
select 'mobility', 'generation', id::text, 'local_only' from public.automotive_generations
on conflict do nothing;
insert into zos.registry_bindings(domain_code, local_entity_type, local_entity_id, binding_status)
select 'mobility', 'version', id::text, 'local_only' from public.automotive_variants
on conflict do nothing;
insert into zos.registry_bindings(domain_code, local_entity_type, local_entity_id, binding_status)
select 'mobility', 'vehicle', id::text, 'local_only' from public.vehicles
on conflict do nothing;

do $$
begin
  drop trigger if exists zos_registry_binding on public.automotive_manufacturers;
  create trigger zos_registry_binding after insert on public.automotive_manufacturers
    for each row execute function mobility.ensure_registry_binding('manufacturer');

  drop trigger if exists zos_registry_binding on public.automotive_brands;
  create trigger zos_registry_binding after insert on public.automotive_brands
    for each row execute function mobility.ensure_registry_binding('brand');

  drop trigger if exists zos_registry_binding on public.automotive_models;
  create trigger zos_registry_binding after insert on public.automotive_models
    for each row execute function mobility.ensure_registry_binding('model');

  drop trigger if exists zos_registry_binding on public.automotive_generations;
  create trigger zos_registry_binding after insert on public.automotive_generations
    for each row execute function mobility.ensure_registry_binding('generation');

  drop trigger if exists zos_registry_binding on public.automotive_variants;
  create trigger zos_registry_binding after insert on public.automotive_variants
    for each row execute function mobility.ensure_registry_binding('version');

  drop trigger if exists zos_registry_binding on public.vehicles;
  create trigger zos_registry_binding after insert on public.vehicles
    for each row execute function mobility.ensure_registry_binding('vehicle');
end $$;

-- ------------------------------------------------------------
-- 5. Source reference data
-- ------------------------------------------------------------

insert into public.automotive_data_sources(code, name, website_url, source_type, priority, active)
values
  ('z_mobility_curated', 'Z Mobility Curated Registry', null, 'manual', 10, true),
  ('bmw_pressclub', 'BMW Official Sources', 'https://www.bmw.pt', 'manufacturer', 1, true),
  ('audi_media', 'Audi MediaCenter', 'https://www.audi-mediacenter.com', 'manufacturer', 1, true),
  ('mercedes_media', 'Mercedes-Benz Official Sources', 'https://media.mercedes-benz.com', 'manufacturer', 1, true),
  ('porsche_newsroom', 'Porsche Newsroom', 'https://newsroom.porsche.com', 'manufacturer', 1, true),
  ('nhtsa_vpic', 'NHTSA vPIC', 'https://vpic.nhtsa.dot.gov', 'public_api', 50, true),
  ('volkswagen_media', 'Volkswagen Newsroom', 'https://www.volkswagen-newsroom.com', 'manufacturer', 1, true),
  ('skoda_storyboard', 'Škoda Storyboard', 'https://www.skoda-storyboard.com', 'manufacturer', 1, true),
  ('seat_media_center', 'SEAT Media Center', 'https://www.seat-mediacenter.com', 'manufacturer', 1, true),
  ('cupra_media', 'CUPRA Media', 'https://www.cupraofficial.com', 'manufacturer', 1, true),
  ('bentley_media', 'Bentley Media', 'https://www.bentleymedia.com', 'manufacturer', 1, true),
  ('lamborghini_media', 'Lamborghini Media', 'https://media.lamborghini.com', 'manufacturer', 1, true)
on conflict (code) do update set
  name = excluded.name,
  website_url = excluded.website_url,
  source_type = excluded.source_type,
  priority = excluded.priority,
  active = excluded.active,
  updated_at = now();

-- ------------------------------------------------------------
-- 6. Existing public marketplace read contract
-- ------------------------------------------------------------

alter table public.vehicles enable row level security;
alter table public.vehicle_images enable row level security;

drop policy if exists vehicles_public_read_published on public.vehicles;
create policy vehicles_public_read_published on public.vehicles
  for select using (status = 'published');

drop policy if exists vehicle_images_public_read_published on public.vehicle_images;
create policy vehicle_images_public_read_published on public.vehicle_images
  for select using (
    exists (
      select 1
      from public.vehicles v
      where v.id = vehicle_images.vehicle_id
        and v.status = 'published'
    )
  );

comment on column public.vehicles.dealer_organization_id is
  'Compatibility bridge for a canonical ZOS organisation id. Enforcement is deferred until all existing Mobility writers resolve dealers through ZOS identity.';
comment on column public.vehicles.version_id is
  'References the Mobility-owned automotive Version identity stored physically in automotive_variants for legacy compatibility.';
