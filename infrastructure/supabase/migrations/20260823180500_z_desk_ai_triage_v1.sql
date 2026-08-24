-- Z Desk — AI triage consent + audit foundation v1
-- AI is opt-in per workspace and remains suggestion-only / human-in-loop.

alter table desk.workspaces
  add column ai_triage_enabled boolean not null default false;

alter table desk.workspaces
  add column ai_triage_enabled_at timestamptz;

alter table desk.workspaces
  add column ai_triage_enabled_by_member_id uuid references desk.workspace_members(id) on delete set null;

alter table desk.workspaces
  add constraint desk_ai_triage_activation_shape check (
    (ai_triage_enabled = false and ai_triage_enabled_at is null and ai_triage_enabled_by_member_id is null)
    or
    (ai_triage_enabled = true and ai_triage_enabled_at is not null and ai_triage_enabled_by_member_id is not null)
  );

alter table desk.messages
  add column ai_triaged_at timestamptz;

alter table desk.messages
  add column ai_model text;

create table desk.ai_triage_audit (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references desk.workspaces(id) on delete cascade,
  message_id uuid not null references desk.messages(id) on delete cascade,
  model text not null check (char_length(trim(model)) > 0),
  outcome text not null check (outcome in ('completed','failed','skipped')),
  reason text,
  input_chars integer not null default 0 check (input_chars >= 0),
  output_chars integer not null default 0 check (output_chars >= 0),
  created_at timestamptz not null default now()
);

alter table desk.ai_triage_audit enable row level security;
revoke all on desk.ai_triage_audit from authenticated;
grant all on desk.ai_triage_audit to service_role;

create index idx_desk_ai_triage_audit_workspace_created
  on desk.ai_triage_audit(workspace_id, created_at desc);

comment on column desk.workspaces.ai_triage_enabled is
  'Explicit workspace opt-in for server-side AI triage. Defaults off; enabling does not permit autonomous actions.';
comment on table desk.ai_triage_audit is
  'Server-only minimal audit of Desk AI triage execution. Raw message content and provider credentials are not duplicated here.';
