-- Z Desk — weekly validation cycle (ADR-0005): overrides + per-week validation

create table if not exists desk_schedule_overrides (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references desk_tenants(id) on delete cascade,
  user_id uuid not null references desk_users(id) on delete cascade,
  date date not null,
  start_time time, -- null start_time + null end_time = folga nesse dia (override "sem trabalho")
  end_time time,
  note text,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id, date),
  check ((start_time is null) = (end_time is null)),
  check (start_time is null or end_time > start_time)
);

create index if not exists idx_desk_schedule_overrides_tenant on desk_schedule_overrides(tenant_id);
create index if not exists idx_desk_schedule_overrides_user_date on desk_schedule_overrides(tenant_id, user_id, date);

create table if not exists desk_schedule_validations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references desk_tenants(id) on delete cascade,
  user_id uuid not null references desk_users(id) on delete cascade,
  week_start_date date not null, -- segunda-feira da semana em causa
  status text not null default 'pending' check (status in ('pending', 'validated')),
  validated_at timestamptz,
  validated_by uuid references desk_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id, week_start_date)
);

create index if not exists idx_desk_schedule_validations_tenant on desk_schedule_validations(tenant_id);
create index if not exists idx_desk_schedule_validations_week on desk_schedule_validations(tenant_id, week_start_date);
create index if not exists idx_desk_schedule_validations_status on desk_schedule_validations(tenant_id, status);

alter table desk_schedule_overrides enable row level security;
alter table desk_schedule_validations enable row level security;

drop policy if exists desk_schedule_overrides_tenant_all on desk_schedule_overrides;
create policy desk_schedule_overrides_tenant_all on desk_schedule_overrides
  for all
  using (tenant_id = desk_current_user_tenant_id())
  with check (tenant_id = desk_current_user_tenant_id());

drop policy if exists desk_schedule_validations_tenant_all on desk_schedule_validations;
create policy desk_schedule_validations_tenant_all on desk_schedule_validations
  for all
  using (tenant_id = desk_current_user_tenant_id())
  with check (tenant_id = desk_current_user_tenant_id());
