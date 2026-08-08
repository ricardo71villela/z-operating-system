create table zos.currencies (
  id uuid primary key default gen_random_uuid(),
  iso_code text not null unique check (iso_code ~ '^[A-Z]{3}$'),
  symbol text,
  decimal_places integer not null default 2 check (decimal_places between 0 and 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table zos.currencies is 'Canonical currencies referenced by ZOS Geography. Currency conversion is outside Geography.';

alter table zos.currencies enable row level security;


create table zos.geography_locations (
  id uuid primary key default gen_random_uuid(),
  location_type text not null check (char_length(trim(location_type)) > 0),
  canonical_code text not null check (char_length(trim(canonical_code)) > 0),
  country_iso text not null check (country_iso ~ '^[A-Z]{2}$'),
  parent_id uuid,
  default_currency_id uuid references zos.currencies(id) on delete restrict,
  geometry jsonb,
  status text not null default 'active' check (status in ('active','inactive','retired')),
  valid_from timestamptz,
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_zos_geography_locations_id_country unique (id, country_iso),
  constraint fk_zos_geography_locations_parent_country foreign key (parent_id, country_iso) references zos.geography_locations(id, country_iso) on delete restrict,
  constraint zos_geography_locations_not_self_parent check (parent_id is null or parent_id <> id),
  constraint zos_geography_locations_root_shape check ((location_type = 'country' and parent_id is null) or (location_type <> 'country' and parent_id is not null)),
  constraint zos_geography_locations_currency_scope check (default_currency_id is null or location_type = 'country'),
  constraint zos_geography_locations_validity check (valid_to is null or valid_from is null or valid_to > valid_from)
);

comment on table zos.geography_locations is 'Canonical geographic identity and extensible administrative hierarchy. Administrative structures are not limited to Country, Region, City and Zone.';

alter table zos.geography_locations enable row level security;

create unique index uq_zos_geography_locations_active_code
  on zos.geography_locations(country_iso, location_type, canonical_code)
  where status = 'active';

create index idx_zos_geography_locations_parent
  on zos.geography_locations(parent_id)
  where parent_id is not null;

create index idx_zos_geography_locations_country
  on zos.geography_locations(country_iso, location_type);


create table zos.geography_names (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references zos.geography_locations(id) on delete restrict,
  language_code text not null check (char_length(trim(language_code)) > 0),
  name text not null check (char_length(trim(name)) > 0),
  name_type text not null default 'canonical' check (name_type in ('canonical','alias')),
  valid_from timestamptz,
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  constraint zos_geography_names_validity check (valid_to is null or valid_from is null or valid_to > valid_from)
);

comment on table zos.geography_names is 'Multilingual canonical names and aliases for geographic locations.';

alter table zos.geography_names enable row level security;

create unique index uq_zos_geography_names_current_canonical
  on zos.geography_names(location_id, language_code)
  where name_type = 'canonical' and valid_to is null;

create index idx_zos_geography_names_lookup
  on zos.geography_names(language_code, name);


create table zos.geography_external_codes (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  code_system text not null check (char_length(trim(code_system)) > 0),
  country_iso text not null check (country_iso ~ '^[A-Z]{2}$'),
  code text not null check (char_length(trim(code)) > 0),
  valid_from timestamptz,
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  constraint fk_zos_geography_external_codes_location_country foreign key (location_id, country_iso) references zos.geography_locations(id, country_iso) on delete restrict,
  constraint zos_geography_external_codes_validity check (valid_to is null or valid_from is null or valid_to > valid_from)
);

comment on table zos.geography_external_codes is 'Official and external identifiers for canonical geographic locations.';

alter table zos.geography_external_codes enable row level security;

create unique index uq_zos_geography_external_codes_current
  on zos.geography_external_codes(code_system, country_iso, code)
  where valid_to is null;

create index idx_zos_geography_external_codes_location
  on zos.geography_external_codes(location_id);


create table zos.geography_provenance (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references zos.geography_locations(id) on delete restrict,
  source_code text not null check (char_length(trim(source_code)) > 0),
  source_record_id text not null check (char_length(trim(source_record_id)) > 0),
  source_version text,
  batch_id text,
  observed_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

comment on table zos.geography_provenance is 'Source provenance for canonical Geography observations and imports.';

alter table zos.geography_provenance enable row level security;

create index idx_zos_geography_provenance_location
  on zos.geography_provenance(location_id);

create index idx_zos_geography_provenance_source
  on zos.geography_provenance(source_code, source_record_id);


create table zos.geography_location_history (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references zos.geography_locations(id) on delete restrict,
  change_type text not null check (change_type in ('new','renamed','geometry_changed','code_changed','parent_changed','updated','deprecated','confirmed','restored')),
  before_state jsonb,
  after_state jsonb,
  provenance_id uuid references zos.geography_provenance(id) on delete restrict,
  batch_id text,
  changed_by text,
  changed_at timestamptz not null default now()
);

comment on table zos.geography_location_history is 'Append-only history of canonical Geography changes. Prior state is preserved rather than overwritten or deleted.';

alter table zos.geography_location_history enable row level security;

create index idx_zos_geography_location_history_location
  on zos.geography_location_history(location_id, changed_at desc);


create table zos.geography_relationships (
  id uuid primary key default gen_random_uuid(),
  from_location_id uuid not null references zos.geography_locations(id) on delete restrict,
  to_location_id uuid not null references zos.geography_locations(id) on delete restrict,
  relationship_type text not null check (relationship_type in ('successor','equivalent')),
  valid_from timestamptz,
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  constraint zos_geography_relationships_not_self check (from_location_id <> to_location_id),
  constraint zos_geography_relationships_validity check (valid_to is null or valid_from is null or valid_to > valid_from)
);

comment on table zos.geography_relationships is 'Approved persistent relationships between canonical geographic identities. Workflow proposals remain outside canonical Geography.';

alter table zos.geography_relationships enable row level security;

create unique index uq_zos_geography_relationships_current
  on zos.geography_relationships(from_location_id, to_location_id, relationship_type)
  where valid_to is null;
