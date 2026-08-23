-- Z Desk — task board (ADR-0003): personal tasks + missions assigned to teammates

create table if not exists desk_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references desk_tenants(id) on delete cascade,
  title text not null,
  description text,
  created_by uuid not null references desk_users(id) on delete cascade,
  assigned_to uuid not null references desk_users(id) on delete cascade,
  task_type text not null check (task_type in ('personal', 'mission')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  due_date timestamptz,
  thread_id uuid references desk_threads(id) on delete set null,
  source text not null default 'manual' check (source in ('manual', 'ai_suggested')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_desk_tasks_tenant on desk_tasks(tenant_id);
create index if not exists idx_desk_tasks_assigned_to on desk_tasks(tenant_id, assigned_to);
create index if not exists idx_desk_tasks_status on desk_tasks(tenant_id, status);
create index if not exists idx_desk_tasks_thread on desk_tasks(thread_id);

alter table desk_tasks enable row level security;

drop policy if exists desk_tasks_tenant_all on desk_tasks;
create policy desk_tasks_tenant_all on desk_tasks
  for all
  using (tenant_id = desk_current_user_tenant_id())
  with check (tenant_id = desk_current_user_tenant_id());
