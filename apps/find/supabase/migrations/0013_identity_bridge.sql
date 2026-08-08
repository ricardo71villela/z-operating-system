-- ============================================================
-- Z FIND — MIGRATION 0013 — Identity Bridge
-- ============================================================
-- profiles remains the Supabase Auth/application profile. This bridge lets a
-- future shared ZOS Person identity bind to it without replacing auth.user IDs.
-- ============================================================

create table identity_bindings (
  profile_id uuid primary key references profiles(id),
  zos_person_id uuid unique,
  binding_status text not null default 'local_only' check (binding_status in ('local_only','linked','merged','retired')),
  linked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table identity_bindings enable row level security;

insert into identity_bindings(profile_id)
select id from profiles on conflict (profile_id) do nothing;

create policy "profiles: self read identity binding" on identity_bindings
  for select to authenticated using (profile_id = auth.uid() or is_admin());
create policy "admin: manage identity bindings" on identity_bindings
  for all to authenticated using (is_admin()) with check (is_admin());

grant select, insert, update, delete on identity_bindings to authenticated;
