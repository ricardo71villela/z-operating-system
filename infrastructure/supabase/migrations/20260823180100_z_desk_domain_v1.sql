create table desk.contacts (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references desk.workspaces(id) on delete cascade,
  display_name text, email text, whatsapp_number text, thread_count integer not null default 0 check(thread_count>=0),
  last_interaction_at timestamptz, relationship_tier text not null default 'new' check(relationship_tier in('new','recurring','priority')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index uq_desk_contacts_workspace_email on desk.contacts(workspace_id,email) where email is not null;
create unique index uq_desk_contacts_workspace_whatsapp on desk.contacts(workspace_id,whatsapp_number) where whatsapp_number is not null;

create table desk.threads (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references desk.workspaces(id) on delete cascade,
  contact_id uuid references desk.contacts(id) on delete set null, email_thread_id text, whatsapp_chat_id text, subject text,
  last_message_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index uq_desk_threads_workspace_email on desk.threads(workspace_id,email_thread_id) where email_thread_id is not null;
create unique index uq_desk_threads_workspace_whatsapp on desk.threads(workspace_id,whatsapp_chat_id) where whatsapp_chat_id is not null;

create table desk.messages (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references desk.workspaces(id) on delete cascade,
  thread_id uuid not null references desk.threads(id) on delete cascade,
  channel text not null check(channel in('email','whatsapp')), direction text not null check(direction in('inbound','outbound')),
  body text, ai_summary text, ai_priority text check(ai_priority in('low','normal','high')),
  state text not null default 'pending_decision' check(state in('pending_decision','awaiting_reply','action_pending','resolved')),
  received_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index idx_desk_messages_workspace_state on desk.messages(workspace_id,state);

create table desk.events (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references desk.workspaces(id) on delete cascade,
  thread_id uuid references desk.threads(id) on delete set null, title text not null, starts_at timestamptz not null, ends_at timestamptz not null,
  source text not null default 'manual' check(source in('manual','ai_suggested','external_sync')),
  status text not null default 'confirmed' check(status in('draft','confirmed','cancelled')),
  event_type text not null default 'meeting' check(event_type in('meeting','follow_up_block')),
  confidence_score numeric(4,3) check(confidence_score between 0 and 1),
  external_calendar_provider text check(external_calendar_provider in('google_calendar','microsoft_calendar')),
  external_calendar_event_id text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(ends_at>starts_at)
);
create unique index uq_desk_events_external on desk.events(workspace_id,external_calendar_provider,external_calendar_event_id) where external_calendar_event_id is not null;
create index idx_desk_events_workspace_start on desk.events(workspace_id,starts_at);

create table desk.notes (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references desk.workspaces(id) on delete cascade,
  thread_id uuid references desk.threads(id) on delete set null, event_id uuid references desk.events(id) on delete set null,
  contact_id uuid references desk.contacts(id) on delete set null, body text not null check(char_length(trim(body))>0),
  source text not null default 'manual' check(source in('manual','voice_transcription','ai_summary')),
  created_by uuid, created_at timestamptz not null default now(), check(num_nonnulls(thread_id,event_id,contact_id)>=1),
  foreign key(workspace_id,created_by) references desk.workspace_members(workspace_id,id) on delete set null
);

create table desk.tasks (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references desk.workspaces(id) on delete cascade,
  title text not null check(char_length(trim(title))>0), description text, created_by uuid not null, assigned_to uuid not null,
  task_type text not null check(task_type in('personal','mission')), status text not null default 'todo' check(status in('todo','in_progress','done')),
  due_date timestamptz, thread_id uuid references desk.threads(id) on delete set null,
  source text not null default 'manual' check(source in('manual','ai_suggested')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(workspace_id,created_by) references desk.workspace_members(workspace_id,id) on delete restrict,
  foreign key(workspace_id,assigned_to) references desk.workspace_members(workspace_id,id) on delete restrict
);
create index idx_desk_tasks_workspace_status on desk.tasks(workspace_id,status);
create index idx_desk_tasks_assigned on desk.tasks(workspace_id,assigned_to);

create table desk.work_schedules (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references desk.workspaces(id) on delete cascade,
  member_id uuid not null, day_of_week smallint not null check(day_of_week between 0 and 6), start_time time not null, end_time time not null,
  created_at timestamptz not null default now(), check(end_time>start_time),
  foreign key(workspace_id,member_id) references desk.workspace_members(workspace_id,id) on delete cascade
);
create table desk.absences (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references desk.workspaces(id) on delete cascade,
  member_id uuid not null, type text not null check(type in('vacation','sick','other','falta_justificada','falta_injustificada')),
  status text not null default 'requested' check(status in('requested','approved')), start_date date not null, end_date date not null, note text,
  created_at timestamptz not null default now(), check(end_date>=start_date),
  foreign key(workspace_id,member_id) references desk.workspace_members(workspace_id,id) on delete cascade
);
create table desk.schedule_overrides (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references desk.workspaces(id) on delete cascade,
  member_id uuid not null, date date not null, start_time time, end_time time, note text, created_at timestamptz not null default now(),
  unique(workspace_id,member_id,date), check((start_time is null)=(end_time is null)), check(start_time is null or end_time>start_time),
  foreign key(workspace_id,member_id) references desk.workspace_members(workspace_id,id) on delete cascade
);
create table desk.schedule_validations (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references desk.workspaces(id) on delete cascade,
  member_id uuid not null, week_start_date date not null, status text not null default 'pending' check(status in('pending','validated')),
  validated_at timestamptz, validated_by uuid, created_at timestamptz not null default now(), unique(workspace_id,member_id,week_start_date),
  foreign key(workspace_id,member_id) references desk.workspace_members(workspace_id,id) on delete cascade,
  foreign key(workspace_id,validated_by) references desk.workspace_members(workspace_id,id) on delete set null
);
create table desk.overtime_entries (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references desk.workspaces(id) on delete cascade,
  member_id uuid not null, date date not null, hours numeric(4,2) not null check(hours>0 and hours<=24), note text,
  status text not null default 'pending' check(status in('pending','approved')), approved_by uuid, approved_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(workspace_id,member_id) references desk.workspace_members(workspace_id,id) on delete cascade,
  foreign key(workspace_id,approved_by) references desk.workspace_members(workspace_id,id) on delete set null
);

alter table desk.contacts enable row level security; alter table desk.threads enable row level security;
alter table desk.messages enable row level security; alter table desk.events enable row level security;
alter table desk.notes enable row level security; alter table desk.tasks enable row level security;
alter table desk.work_schedules enable row level security; alter table desk.absences enable row level security;
alter table desk.schedule_overrides enable row level security; alter table desk.schedule_validations enable row level security;
alter table desk.overtime_entries enable row level security;

create policy desk_contacts_read_member on desk.contacts for select using(desk.is_workspace_member(workspace_id));
create policy desk_threads_read_member on desk.threads for select using(desk.is_workspace_member(workspace_id));
create policy desk_messages_read_member on desk.messages for select using(desk.is_workspace_member(workspace_id));
create policy desk_events_read_member on desk.events for select using(desk.is_workspace_member(workspace_id));
create policy desk_notes_read_member on desk.notes for select using(desk.is_workspace_member(workspace_id));
create policy desk_tasks_read_member on desk.tasks for select using(desk.is_workspace_member(workspace_id));
create policy desk_work_schedules_read_member on desk.work_schedules for select using(desk.is_workspace_member(workspace_id));
create policy desk_absences_read_member on desk.absences for select using(desk.is_workspace_member(workspace_id));
create policy desk_schedule_overrides_read_member on desk.schedule_overrides for select using(desk.is_workspace_member(workspace_id));
create policy desk_schedule_validations_read_member on desk.schedule_validations for select using(desk.is_workspace_member(workspace_id));
create policy desk_overtime_read_member on desk.overtime_entries for select using(desk.is_workspace_member(workspace_id));

grant select on desk.contacts,desk.threads,desk.messages,desk.events,desk.notes,desk.tasks,desk.work_schedules,
  desk.absences,desk.schedule_overrides,desk.schedule_validations,desk.overtime_entries to authenticated;
grant all on desk.contacts,desk.threads,desk.messages,desk.events,desk.notes,desk.tasks,desk.work_schedules,
  desk.absences,desk.schedule_overrides,desk.schedule_validations,desk.overtime_entries to service_role;

create trigger set_updated_at before update on desk.contacts for each row execute function platform_internal.set_updated_at();
create trigger set_updated_at before update on desk.threads for each row execute function platform_internal.set_updated_at();
create trigger set_updated_at before update on desk.messages for each row execute function platform_internal.set_updated_at();
create trigger set_updated_at before update on desk.events for each row execute function platform_internal.set_updated_at();
create trigger set_updated_at before update on desk.tasks for each row execute function platform_internal.set_updated_at();
