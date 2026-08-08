

create table zos.data_sources (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(trim(code)) > 0),
  source_type text not null check (char_length(trim(source_type)) > 0),
  name text not null check (char_length(trim(name)) > 0),
  publisher text,
  source_uri text,
  publisher_organisation_id uuid references zos.organisations(id) on delete restrict,
  country_iso text check (
    country_iso is null
    or country_iso ~ '^[A-Z]{2}$'
  ),
  locale text check (
    locale is null
    or char_length(trim(locale)) > 0
  ),
  source_domain_code text check (
    source_domain_code is null
    or char_length(trim(source_domain_code)) > 0
  ),
  source_local_entity_type text check (
    source_local_entity_type is null
    or char_length(trim(source_local_entity_type)) > 0
  ),
  source_local_entity_id text check (
    source_local_entity_id is null
    or char_length(trim(source_local_entity_id)) > 0
  ),
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint zos_data_sources_local_reference_shape check (
    (
      source_domain_code is null
      and source_local_entity_type is null
      and source_local_entity_id is null
    )
    or
    (
      source_domain_code is not null
      and source_local_entity_type is not null
      and source_local_entity_id is not null
    )
  )
);

comment on table zos.data_sources is
  'Shared ZOS provenance sources. Domain-specific source models may remain local and can be referenced without merging their domain semantics into Core.';

alter table zos.data_sources enable row level security;

create unique index uq_zos_data_sources_local_reference
  on zos.data_sources(
    source_domain_code,
    source_local_entity_type,
    source_local_entity_id
  )
  where source_local_entity_id is not null;

create index idx_zos_data_sources_publisher_organisation
  on zos.data_sources(publisher_organisation_id)
  where publisher_organisation_id is not null;


create table zos.metric_definitions (
  code text primary key check (
    char_length(trim(code)) > 2
    and position('.' in code) > 1
  ),
  domain_code text not null check (char_length(trim(domain_code)) > 0),
  value_kind text not null check (
    value_kind in ('number','text','boolean','date','datetime','json')
  ),
  default_unit text,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table zos.metric_definitions is
  'Namespaced metric contracts for ZOS Data Observations. Metric semantics remain owned by the relevant domain.';

alter table zos.metric_definitions enable row level security;

create index idx_zos_metric_definitions_domain
  on zos.metric_definitions(domain_code, active);


create table zos.observations (
  id uuid primary key default gen_random_uuid(),
  subject_domain_code text not null check (
    char_length(trim(subject_domain_code)) > 0
  ),
  subject_entity_type text not null check (
    char_length(trim(subject_entity_type)) > 0
  ),
  subject_entity_id text not null check (
    char_length(trim(subject_entity_id)) > 0
  ),
  registry_binding_id uuid references zos.registry_bindings(id) on delete restrict,
  metric_code text not null references zos.metric_definitions(code) on delete restrict,
  value_jsonb jsonb not null,
  unit text,
  currency_iso text check (
    currency_iso is null
    or currency_iso ~ '^[A-Z]{3}$'
  ),
  locale text check (
    locale is null
    or char_length(trim(locale)) > 0
  ),
  source_id uuid not null references zos.data_sources(id) on delete restrict,
  status text not null default 'recorded' check (
    status in ('recorded','validated','superseded','archived')
  ),
  confidence numeric(5,4) check (
    confidence is null
    or (confidence >= 0 and confidence <= 1)
  ),
  provenance_method text not null check (
    char_length(trim(provenance_method)) > 0
  ),
  provenance jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  valid_from timestamptz,
  valid_to timestamptz,
  supersedes_id uuid references zos.observations(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint zos_observations_validity_order check (
    valid_from is null
    or valid_to is null
    or valid_to >= valid_from
  ),
  constraint zos_observations_no_self_supersede check (
    supersedes_id is null
    or supersedes_id <> id
  )
);

comment on table zos.observations is
  'ZOS Data primitive: a sourced observation about a domain or Core subject at a point in time. It is neither Registry identity nor a Trust assessment.';

comment on column zos.observations.registry_binding_id is
  'Optional Registry binding when the observed local subject participates in canonical cross-vertical identity. Operational subjects do not require Registry membership.';

comment on column zos.observations.provenance_method is
  'Method by which the observation was produced, such as manual, api, import, document or ai_assisted. Method does not imply truth or Trust validation.';

alter table zos.observations enable row level security;

create index idx_zos_observations_subject_metric
  on zos.observations(
    subject_domain_code,
    subject_entity_type,
    subject_entity_id,
    metric_code,
    observed_at desc
  );

create index idx_zos_observations_registry_binding
  on zos.observations(registry_binding_id, metric_code, observed_at desc)
  where registry_binding_id is not null;

create index idx_zos_observations_source
  on zos.observations(source_id, observed_at desc);

create index idx_zos_observations_metric
  on zos.observations(metric_code, observed_at desc);

create index idx_zos_observations_supersedes
  on zos.observations(supersedes_id)
  where supersedes_id is not null;


create table zos.observation_evidence (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references zos.observations(id) on delete restrict,
  evidence_type text not null check (
    char_length(trim(evidence_type)) > 0
  ),
  evidence_domain_code text check (
    evidence_domain_code is null
    or char_length(trim(evidence_domain_code)) > 0
  ),
  evidence_entity_type text check (
    evidence_entity_type is null
    or char_length(trim(evidence_entity_type)) > 0
  ),
  evidence_entity_id text check (
    evidence_entity_id is null
    or char_length(trim(evidence_entity_id)) > 0
  ),
  source_uri text,
  storage_path text,
  content_hash text,
  metadata jsonb not null default '{}'::jsonb,
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  constraint zos_observation_evidence_local_reference_shape check (
    (
      evidence_domain_code is null
      and evidence_entity_type is null
      and evidence_entity_id is null
    )
    or
    (
      evidence_domain_code is not null
      and evidence_entity_type is not null
      and evidence_entity_id is not null
    )
  )
);

comment on table zos.observation_evidence is
  'Evidence supporting a ZOS Data Observation. Evidence may reference documents, URLs, feeds, images, declarations or domain-owned records without creating a universal document model.';

alter table zos.observation_evidence enable row level security;

create index idx_zos_observation_evidence_observation
  on zos.observation_evidence(observation_id);

create index idx_zos_observation_evidence_local_reference
  on zos.observation_evidence(
    evidence_domain_code,
    evidence_entity_type,
    evidence_entity_id
  )
  where evidence_entity_id is not null;

create index idx_zos_observation_evidence_content_hash
  on zos.observation_evidence(content_hash)
  where content_hash is not null;
