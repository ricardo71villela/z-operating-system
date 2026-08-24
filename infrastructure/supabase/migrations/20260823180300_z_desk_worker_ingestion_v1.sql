-- Z Desk — background worker ingestion authority v1
-- Adds provider message idempotency and deterministic provider-scoped upsert keys.

alter table desk.messages
  add column external_message_id text;

create unique index uq_desk_messages_external
  on desk.messages(workspace_id, channel, external_message_id)
  where external_message_id is not null;

comment on column desk.messages.external_message_id is
  'Provider-owned immutable message identifier used to make webhook/polling ingestion idempotent within one Desk workspace and channel.';

-- Replace partial uniqueness with ordinary PostgreSQL unique indexes so
-- PostgREST/Supabase on_conflict inference is deterministic. PostgreSQL
-- unique indexes still permit multiple NULL values, preserving the intended
-- optional-address semantics.
drop index if exists desk.uq_desk_contacts_workspace_email;
drop index if exists desk.uq_desk_contacts_workspace_whatsapp;
drop index if exists desk.uq_desk_threads_workspace_email;
drop index if exists desk.uq_desk_threads_workspace_whatsapp;

create unique index uq_desk_contacts_workspace_email
  on desk.contacts(workspace_id, email);
create unique index uq_desk_contacts_workspace_whatsapp
  on desk.contacts(workspace_id, whatsapp_number);
create unique index uq_desk_threads_workspace_email
  on desk.threads(workspace_id, email_thread_id);
create unique index uq_desk_threads_workspace_whatsapp
  on desk.threads(workspace_id, whatsapp_chat_id);

create index idx_desk_integrations_worker_scan
  on desk.integrations(provider, status, workspace_id)
  where status = 'active';
