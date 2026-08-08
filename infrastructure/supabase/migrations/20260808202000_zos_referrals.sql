create table zos.referrals (
  id uuid primary key default gen_random_uuid(),
  subject_person_id uuid references zos.persons(id) on delete restrict,
  subject_organisation_id uuid references zos.organisations(id) on delete restrict,
  source_domain_code text not null check (char_length(trim(source_domain_code)) > 0),
  target_domain_code text not null check (char_length(trim(target_domain_code)) > 0),
  reason_code text not null check (char_length(trim(reason_code)) > 0),
  consent_grant_id uuid not null references zos.consent_grants(id) on delete restrict,
  source_local_entity_type text check (source_local_entity_type is null or char_length(trim(source_local_entity_type)) > 0),
  source_local_entity_id text check (source_local_entity_id is null or char_length(trim(source_local_entity_id)) > 0),
  target_local_entity_type text check (target_local_entity_type is null or char_length(trim(target_local_entity_type)) > 0),
  target_local_entity_id text check (target_local_entity_id is null or char_length(trim(target_local_entity_id)) > 0),
  referral_status text not null default 'pending' check (referral_status in ('pending','activated','declined','cancelled')),
  referred_at timestamptz not null default now(),
  activated_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint zos_referrals_subject_shape check (
    (subject_person_id is not null and subject_organisation_id is null)
    or
    (subject_person_id is null and subject_organisation_id is not null)
  ),
  constraint zos_referrals_domain_direction check (
    source_domain_code <> target_domain_code
  ),
  constraint zos_referrals_source_reference_shape check (
    (source_local_entity_type is null and source_local_entity_id is null)
    or
    (source_local_entity_type is not null and source_local_entity_id is not null)
  ),
  constraint zos_referrals_target_reference_shape check (
    (target_local_entity_type is null and target_local_entity_id is null)
    or
    (target_local_entity_type is not null and target_local_entity_id is not null)
  ),
  constraint zos_referrals_status_shape check (
    (
      referral_status = 'pending'
      and activated_at is null
      and closed_at is null
      and target_local_entity_id is null
    )
    or
    (
      referral_status = 'activated'
      and activated_at is not null
      and closed_at is not null
      and target_local_entity_id is not null
    )
    or
    (
      referral_status in ('declined','cancelled')
      and activated_at is null
      and closed_at is not null
      and target_local_entity_id is null
    )
  ),
  constraint zos_referrals_activation_time check (
    activated_at is null or activated_at >= referred_at
  ),
  constraint zos_referrals_close_time check (
    closed_at is null or closed_at >= referred_at
  ),
  constraint zos_referrals_terminal_time_order check (
    closed_at is null or activated_at is null or closed_at >= activated_at
  )
);

comment on table zos.referrals is 'Consent-backed cross-vertical handoffs between ZOS domains. A referral is not a lead, opportunity or business outcome; the target domain owns any local entity created after activation.';

alter table zos.referrals enable row level security;

create index idx_zos_referrals_person
  on zos.referrals(subject_person_id, referred_at desc)
  where subject_person_id is not null;

create index idx_zos_referrals_organisation
  on zos.referrals(subject_organisation_id, referred_at desc)
  where subject_organisation_id is not null;

create index idx_zos_referrals_route
  on zos.referrals(source_domain_code, target_domain_code, referral_status, referred_at desc);

create index idx_zos_referrals_consent_grant
  on zos.referrals(consent_grant_id);
