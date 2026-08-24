-- Z Desk — background worker ingestion authority v1
-- Adds provider message idempotency without changing canonical workspace identity.

alter table desk.messages
  add column external_message_id text;

create unique index uq_desk_messages_external
  on desk.messages(workspace_id, channel, external_message_id)
  where external_message_id is not null;

comment on column desk.messages.external_message_id is
  'Provider-owned immutable message identifier used to make webhook/polling ingestion idempotent within one Desk workspace and channel.';

create index idx_desk_integrations_worker_scan
  on desk.integrations(provider, status, workspace_id)
  where status = 'active';
