-- Z Desk — external calendar link authority v1
-- One Desk event may be published to multiple connected calendar integrations.

alter table desk.events
  add constraint uq_desk_events_workspace_id unique (workspace_id, id);

alter table desk.integrations
  add constraint uq_desk_integrations_workspace_id unique (workspace_id, id);

create table desk.event_external_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references desk.workspaces(id) on delete cascade,
  event_id uuid not null,
  integration_id uuid not null,
  external_event_id text not null check (char_length(trim(external_event_id)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, event_id)
    references desk.events(workspace_id, id) on delete cascade,
  foreign key (workspace_id, integration_id)
    references desk.integrations(workspace_id, id) on delete cascade,
  unique (event_id, integration_id),
  unique (integration_id, external_event_id)
);

alter table desk.event_external_links enable row level security;
revoke all on desk.event_external_links from authenticated;
grant all on desk.event_external_links to service_role;

create trigger set_updated_at
before update on desk.event_external_links
for each row execute function platform_internal.set_updated_at();

comment on table desk.event_external_links is
  'Server-only mapping from one canonical Desk event to one or more provider calendar events. Prevents multi-calendar publication from overwriting a single event-level provider id.';
