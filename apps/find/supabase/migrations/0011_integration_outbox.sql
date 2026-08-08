-- ============================================================
-- Z FIND — MIGRATION 0011 — Integration Outbox
-- ============================================================
-- Technical messaging only. This table is not a universal semantic Event
-- model; domains own message meaning while Platform Engineering may later own
-- transport/retry/dispatch.
-- ============================================================

create table integration_outbox (
  id uuid primary key default gen_random_uuid(),
  message_type text not null,
  producer text not null default 'zfind' check (producer = 'zfind'),
  subject_type text,
  subject_id uuid,
  schema_version int not null default 1 check (schema_version > 0),
  correlation_id uuid,
  causation_id uuid,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts int not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now()
);
alter table integration_outbox enable row level security;
create index idx_integration_outbox_pending on integration_outbox(available_at, occurred_at) where processed_at is null;

create policy "admin: full access to integration_outbox" on integration_outbox
  for all to authenticated using (is_admin()) with check (is_admin());
grant select, insert, update, delete on integration_outbox to authenticated;
