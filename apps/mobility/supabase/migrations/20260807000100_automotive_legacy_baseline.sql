-- Z Mobility — reproducible legacy schema baseline.
-- Safe for fresh databases. Existing installations are completed with ADD COLUMN IF NOT EXISTS.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, entity_type, external_id)
);

create table if not exists public.automotive_reconciliation_queue (
  id uuid primary key default gen_random_uuid(),
  staging_record_id uuid not null references public.automotive_staging_records(id) on delete cascade,
  candidate_entity_type text,
  candidate_entity_id uuid,
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

-- Complete existing installations without dropping data.
alter table public.automotive_staging_records add column if not exists import_run_id uuid references public.automotive_import_runs(id);
alter table public.automotive_staging_records add column if not exists validation_errors jsonb not null default '[]'::jsonb;
alter table public.automotive_staging_records add column if not exists validation_warnings jsonb not null default '[]'::jsonb;
alter table public.automotive_staging_records add column if not exists reviewed_at timestamptz;
alter table public.automotive_staging_records add column if not exists updated_at timestamptz not null default now();
alter table public.automotive_reconciliation_queue add column if not exists updated_at timestamptz not null default now();

create index if not exists automotive_models_brand_idx on public.automotive_models(brand_id);
create index if not exists automotive_generations_model_idx on public.automotive_generations(model_id);
create index if not exists automotive_variants_generation_market_idx on public.automotive_variants(generation_id, market_code);
create index if not exists automotive_staging_status_idx on public.automotive_staging_records(status, entity_type);
create index if not exists vehicles_status_idx on public.vehicles(status, featured, created_at desc);
create index if not exists vehicle_images_vehicle_idx on public.vehicle_images(vehicle_id, is_primary desc, position);

-- Updated-at triggers.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'automotive_data_sources','automotive_manufacturers','automotive_brands',
    'automotive_body_styles','automotive_models','automotive_generations',
    'automotive_variants','automotive_staging_records','automotive_reconciliation_queue',
    'automotive_golden_records','automotive_golden_sources','vehicles'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name
    );
  end loop;
end $$;

-- Public marketplace read surface only. Internal automotive tables stay service-role only.
alter table public.vehicles enable row level security;
alter table public.vehicle_images enable row level security;
drop policy if exists vehicles_public_read_published on public.vehicles;
create policy vehicles_public_read_published on public.vehicles
  for select using (status = 'published');
drop policy if exists vehicle_images_public_read_published on public.vehicle_images;
create policy vehicle_images_public_read_published on public.vehicle_images
  for select using (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_images.vehicle_id and v.status = 'published'
    )
  );
