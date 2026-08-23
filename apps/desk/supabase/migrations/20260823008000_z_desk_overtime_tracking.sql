-- Z Desk — overtime tracking (ADR-0006)

create table if not exists desk_overtime_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references desk_tenants(id) on delete cascade,
  user_id uuid not null references desk_users(id) on delete cascade,
  date date not null,
  hours numeric(4,2) not null check (hours > 0 and hours <= 24),
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  approved_by uuid references desk_users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_desk_overtime_tenant on desk_overtime_entries(tenant_id);
create index if not exists idx_desk_overtime_user_date on desk_overtime_entries(tenant_id, user_id, date);

alter table desk_overtime_entries enable row level security;

drop policy if exists desk_overtime_entries_tenant_all on desk_overtime_entries;
create policy desk_overtime_entries_tenant_all on desk_overtime_entries
  for all
  using (tenant_id = desk_current_user_tenant_id())
  with check (tenant_id = desk_current_user_tenant_id());
