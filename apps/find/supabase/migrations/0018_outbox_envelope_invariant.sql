-- ============================================================
-- Z FIND — MIGRATION 0018 — Outbox Envelope Invariant
-- ============================================================
-- integration_outbox is technical transport infrastructure.
--
-- It is NOT a universal semantic Event model.
-- Domains remain responsible for message meaning.
--
-- Once an outbox message exists, its envelope is immutable:
--
--   id
--   message_type
--   producer
--   subject_type
--   subject_id
--   schema_version
--   correlation_id
--   causation_id
--   payload
--   occurred_at
--   created_at
--
-- Transport state may evolve independently:
--
--   available_at
--   processed_at
--   attempts
--   last_error
--
-- No retention / cleanup policy is imposed here.
-- ============================================================


create function public.zfind_guard_integration_outbox_envelope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if
    new.id is distinct from old.id
    or new.message_type is distinct from old.message_type
    or new.producer is distinct from old.producer
    or new.subject_type is distinct from old.subject_type
    or new.subject_id is distinct from old.subject_id
    or new.schema_version is distinct from old.schema_version
    or new.correlation_id is distinct from old.correlation_id
    or new.causation_id is distinct from old.causation_id
    or new.payload is distinct from old.payload
    or new.occurred_at is distinct from old.occurred_at
    or new.created_at is distinct from old.created_at
  then
    raise exception
      'integration_outbox message envelope is immutable; only transport state may be updated'
      using errcode = '55000';
  end if;

  -- Transport-managed fields intentionally remain mutable:
  -- available_at, processed_at, attempts, last_error.
  return new;
end;
$$;


create trigger integration_outbox_envelope_guard
before update on integration_outbox
for each row
execute function public.zfind_guard_integration_outbox_envelope();


revoke all
on function public.zfind_guard_integration_outbox_envelope()
from public;


comment on table integration_outbox
is 'Technical Z Find integration outbox. Message envelope is immutable after insert; available_at, processed_at, attempts and last_error are mutable transport state. Not a universal semantic Event model.';

comment on function public.zfind_guard_integration_outbox_envelope()
is 'Prevents rewriting an integration message envelope while allowing transport retry and processing state to evolve.';
