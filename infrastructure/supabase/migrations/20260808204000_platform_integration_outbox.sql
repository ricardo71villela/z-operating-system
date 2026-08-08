create table platform_internal.integration_outbox (
  id uuid primary key default gen_random_uuid(),

  producer_domain_code text not null check (
    char_length(trim(producer_domain_code)) > 0
  ),

  message_type text not null check (
    char_length(trim(message_type)) > 0
  ),

  schema_version integer not null default 1 check (
    schema_version > 0
  ),

  subject_domain_code text check (
    subject_domain_code is null
    or char_length(trim(subject_domain_code)) > 0
  ),

  subject_entity_type text check (
    subject_entity_type is null
    or char_length(trim(subject_entity_type)) > 0
  ),

  subject_entity_id text check (
    subject_entity_id is null
    or char_length(trim(subject_entity_id)) > 0
  ),

  correlation_id text not null check (
    char_length(trim(correlation_id)) > 0
  ),

  causation_id text check (
    causation_id is null
    or char_length(trim(causation_id)) > 0
  ),

  idempotency_key text check (
    idempotency_key is null
    or char_length(trim(idempotency_key)) > 0
  ),

  payload jsonb not null default '{}'::jsonb,

  status text not null default 'pending' check (
    status in ('pending','processing','published','failed')
  ),

  occurred_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  published_at timestamptz,

  attempts integer not null default 0 check (
    attempts >= 0
  ),

  last_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint platform_integration_outbox_subject_shape check (
    (
      subject_domain_code is null
      and subject_entity_type is null
      and subject_entity_id is null
    )
    or
    (
      subject_domain_code is not null
      and subject_entity_type is not null
      and subject_entity_id is not null
    )
  ),

  constraint platform_integration_outbox_availability_time check (
    available_at >= occurred_at
  ),

  constraint platform_integration_outbox_publication_time check (
    published_at is null
    or published_at >= occurred_at
  ),

  constraint platform_integration_outbox_status_shape check (
    (
      status in ('pending','processing')
      and published_at is null
    )
    or
    (
      status = 'published'
      and published_at is not null
    )
    or
    (
      status = 'failed'
      and published_at is null
      and last_error is not null
      and char_length(trim(last_error)) > 0
    )
  )
);

comment on table platform_internal.integration_outbox is
  'Transactional integration message outbox for ZOS transport, retry and dispatch. Message semantics remain owned by the producing domain; this is not a universal Event model.';

comment on column platform_internal.integration_outbox.message_type is
  'Producer-owned semantic message type. Platform infrastructure transports the message but does not define its business meaning.';

comment on column platform_internal.integration_outbox.idempotency_key is
  'Optional producer-scoped key used to prevent duplicate logical messages during retries or repeated transactional writes.';

alter table platform_internal.integration_outbox enable row level security;

create unique index uq_platform_integration_outbox_idempotency
  on platform_internal.integration_outbox(
    producer_domain_code,
    idempotency_key
  )
  where idempotency_key is not null;

create index idx_platform_integration_outbox_dispatch
  on platform_internal.integration_outbox(
    status,
    available_at,
    occurred_at
  )
  where status in ('pending','failed');

create index idx_platform_integration_outbox_correlation
  on platform_internal.integration_outbox(correlation_id);

create index idx_platform_integration_outbox_subject
  on platform_internal.integration_outbox(
    subject_domain_code,
    subject_entity_type,
    subject_entity_id,
    occurred_at desc
  )
  where subject_entity_id is not null;
