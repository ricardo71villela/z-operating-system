create table zos.consent_grants (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references zos.persons(id) on delete restrict,
  purpose_code text not null check (char_length(trim(purpose_code)) > 0),
  source_domain_code text check (source_domain_code is null or char_length(trim(source_domain_code)) > 0),
  target_domain_code text check (target_domain_code is null or char_length(trim(target_domain_code)) > 0),
  notice_version text not null check (char_length(trim(notice_version)) > 0),
  capture_source text not null check (char_length(trim(capture_source)) > 0),
  evidence jsonb not null default '{}'::jsonb,
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  withdrawal_source text check (withdrawal_source is null or char_length(trim(withdrawal_source)) > 0),
  withdrawal_evidence jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint zos_consent_grants_scope_shape check (
    (source_domain_code is null and target_domain_code is null)
    or
    (source_domain_code is not null and target_domain_code is not null and source_domain_code <> target_domain_code)
  ),
  constraint zos_consent_grants_withdrawal_time check (
    withdrawn_at is null or withdrawn_at >= granted_at
  ),
  constraint zos_consent_grants_withdrawal_shape check (
    (withdrawn_at is null and withdrawal_source is null and withdrawal_evidence is null)
    or
    (withdrawn_at is not null and withdrawal_source is not null)
  )
);

comment on table zos.consent_grants is 'Explicit ecosystem or cross-vertical consent grants bound to a canonical ZOS person. Domain-specific consent remains owned by each vertical. Absence of an active grant never implies permission.';

alter table zos.consent_grants enable row level security;

create unique index uq_zos_consent_grants_active_scope
  on zos.consent_grants(
    person_id,
    purpose_code,
    coalesce(source_domain_code, ''),
    coalesce(target_domain_code, '')
  )
  where withdrawn_at is null;

create index idx_zos_consent_grants_person
  on zos.consent_grants(person_id, granted_at desc);

create index idx_zos_consent_grants_cross_vertical
  on zos.consent_grants(source_domain_code, target_domain_code, purpose_code)
  where withdrawn_at is null;


create table zos.communication_preferences (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references zos.persons(id) on delete restrict,
  domain_code text check (domain_code is null or char_length(trim(domain_code)) > 0),
  channel_code text not null check (char_length(trim(channel_code)) > 0),
  preference_state text not null default 'neutral' check (preference_state in ('preferred','neutral','suppressed')),
  preferred_locale text check (preferred_locale is null or char_length(trim(preferred_locale)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table zos.communication_preferences is 'Operational communication preferences for a canonical ZOS person. A preferred channel is never evidence of legal or cross-vertical consent; suppression should prevent communication even when a separate consent grant exists.';

alter table zos.communication_preferences enable row level security;

create unique index uq_zos_communication_preferences_scope
  on zos.communication_preferences(
    person_id,
    coalesce(domain_code, ''),
    channel_code
  );

create index idx_zos_communication_preferences_person
  on zos.communication_preferences(person_id);
