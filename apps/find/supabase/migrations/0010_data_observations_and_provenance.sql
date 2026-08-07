-- ============================================================
-- Z FIND — MIGRATION 0010 — Data Observations + Provenance
-- ============================================================
-- Existing Property/Development/Listing columns remain operational read
-- projections. Observations preserve source, time, validity and provenance
-- when facts are imported, measured, declared or verified.
-- ============================================================

create table data_sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('partner','promoter','official_registry','document','feed','manual','system','other')),
  name text not null,
  source_url text,
  organisation_id uuid references organisations(id),
  country_iso text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table data_sources enable row level security;

create table data_metric_definitions (
  code text primary key,
  domain text not null default 'real_estate',
  value_kind text not null check (value_kind in ('number','text','boolean','date','datetime','json')),
  default_unit text,
  description text,
  created_at timestamptz not null default now()
);
alter table data_metric_definitions enable row level security;

insert into data_metric_definitions(code, value_kind, default_unit, description) values
  ('real_estate.area_sqm', 'number', 'sqm', 'General property area'),
  ('real_estate.gross_private_area_sqm', 'number', 'sqm', 'Gross private area / ABP'),
  ('real_estate.dependent_area_sqm', 'number', 'sqm', 'Dependent area / ABD'),
  ('real_estate.plot_area_sqm', 'number', 'sqm', 'Plot area'),
  ('real_estate.energy_rating', 'text', null, 'Energy performance rating'),
  ('marketplace.asking_price', 'number', null, 'Listing asking price')
on conflict (code) do nothing;

create table data_observations (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('organisation','partner','property','development','listing')),
  organisation_id uuid references organisations(id),
  partner_id uuid references partners(id),
  property_id uuid references properties(id),
  development_id uuid references developments(id),
  listing_id uuid references listings(id),
  metric_code text not null references data_metric_definitions(code),
  value_jsonb jsonb not null,
  unit text,
  currency_iso text,
  locale text references system_languages(code),
  source_id uuid references data_sources(id),
  status text not null default 'recorded' check (status in ('recorded','validated','superseded','archived')),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  observed_at timestamptz not null default now(),
  valid_from timestamptz,
  valid_to timestamptz,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint data_observations_currency_iso_format check (currency_iso is null or currency_iso ~ '^[A-Z]{3}$'),
  constraint data_observations_entity_shape check (
    (entity_type = 'organisation' and organisation_id is not null and partner_id is null and property_id is null and development_id is null and listing_id is null)
    or (entity_type = 'partner' and partner_id is not null and organisation_id is null and property_id is null and development_id is null and listing_id is null)
    or (entity_type = 'property' and property_id is not null and organisation_id is null and partner_id is null and development_id is null and listing_id is null)
    or (entity_type = 'development' and development_id is not null and organisation_id is null and partner_id is null and property_id is null and listing_id is null)
    or (entity_type = 'listing' and listing_id is not null and organisation_id is null and partner_id is null and property_id is null and development_id is null)
  )
);
alter table data_observations enable row level security;

create index idx_data_observations_property_metric on data_observations(property_id, metric_code, observed_at desc) where property_id is not null;
create index idx_data_observations_development_metric on data_observations(development_id, metric_code, observed_at desc) where development_id is not null;
create index idx_data_observations_listing_metric on data_observations(listing_id, metric_code, observed_at desc) where listing_id is not null;

create table observation_evidence (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references data_observations(id),
  evidence_type text not null check (evidence_type in ('document','url','feed_record','manual_declaration','image','other')),
  source_url text,
  storage_path text,
  content_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table observation_evidence enable row level security;

create policy "admin: full access to data_sources" on data_sources
  for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin: full access to data_metric_definitions" on data_metric_definitions
  for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin: full access to data_observations" on data_observations
  for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin: full access to observation_evidence" on observation_evidence
  for all to authenticated using (is_admin()) with check (is_admin());

grant select, insert, update, delete on data_sources, data_metric_definitions, data_observations, observation_evidence to authenticated;
