-- 0030_integration_outbox.sql
-- Technical integration mechanism for ZOS-compatible communication.
-- Deliberately NOT named an Event model: domain meaning remains owned by Jobs.

begin;

do $$ begin
  create type integration_message_status as enum ('pending','processing','published','failed');
exception when duplicate_object then null; end $$;

create table if not exists integration_outbox (
  id              uuid primary key default gen_random_uuid(),
  message_type    text not null,
  producer        text not null default 'z-jobs',
  schema_version  integer not null default 1 check (schema_version > 0),
  subject_id      text,
  subject_type    text,
  correlation_id  text not null,
  causation_id    text,
  payload         jsonb not null,
  status          integration_message_status not null default 'pending',
  occurred_at     timestamptz not null default now(),
  published_at    timestamptz,
  attempts        integer not null default 0 check (attempts >= 0),
  last_error      text
);

create index if not exists idx_integration_outbox_pending
  on integration_outbox(status, occurred_at)
  where status in ('pending','failed');
create index if not exists idx_integration_outbox_correlation
  on integration_outbox(correlation_id);

alter table integration_outbox enable row level security;
create policy integration_outbox_staff_read on integration_outbox
  for select using (is_platform_staff());

-- Server-side code may call this controlled RPC instead of receiving direct
-- INSERT rights on the table.
create or replace function enqueue_integration_message(
  p_message_type text,
  p_schema_version integer,
  p_subject_id text,
  p_subject_type text,
  p_correlation_id text,
  p_causation_id text,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authenticated actor required';
  end if;
  insert into integration_outbox(
    message_type, schema_version, subject_id, subject_type,
    correlation_id, causation_id, payload
  ) values (
    p_message_type, p_schema_version, p_subject_id, p_subject_type,
    p_correlation_id, p_causation_id, p_payload
  ) returning id into v_id;
  return v_id;
end;
$$;

commit;
