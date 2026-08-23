-- Z Desk — personnel management (ADR-0004): recurring work schedules + absences

create table if not exists desk_work_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references desk_tenants(id) on delete cascade,
  user_id uuid not null references desk_users(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0=domingo … 6=sábado
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index if not exists idx_desk_work_schedules_tenant on desk_work_schedules(tenant_id);
create index if not exists idx_desk_work_schedules_user on desk_work_schedules(tenant_id, user_id);

create table if not exists desk_absences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references desk_tenants(id) on delete cascade,
  user_id uuid not null references desk_users(id) on delete cascade,
  type text not null check (type in ('vacation', 'sick', 'other')),
  status text not null default 'requested' check (status in ('requested', 'approved')),
  start_date date not null,
  end_date date not null,
  note text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists idx_desk_absences_tenant on desk_absences(tenant_id);
create index if not exists idx_desk_absences_user on desk_absences(tenant_id, user_id);
create index if not exists idx_desk_absences_range on desk_absences(tenant_id, start_date, end_date);

alter table desk_work_schedules enable row level security;
alter table desk_absences enable row level security;

drop policy if exists desk_work_schedules_tenant_all on desk_work_schedules;
create policy desk_work_schedules_tenant_all on desk_work_schedules
  for all
  using (tenant_id = desk_current_user_tenant_id())
  with check (tenant_id = desk_current_user_tenant_id());

drop policy if exists desk_absences_tenant_all on desk_absences;
create policy desk_absences_tenant_all on desk_absences
  for all
  using (tenant_id = desk_current_user_tenant_id())
  with check (tenant_id = desk_current_user_tenant_id());
