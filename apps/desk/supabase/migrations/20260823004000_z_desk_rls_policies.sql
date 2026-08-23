-- Z Desk — Row Level Security policies (multi-tenant isolation)
--
-- Pattern: every policy scopes to the caller's tenant via
-- desk_current_user_tenant_id(), a SECURITY DEFINER function that reads
-- desk_users (bypassing that table's own RLS to avoid recursion — a
-- policy on desk_users that queries desk_users would deadlock the planner
-- conceptually, not literally, but SECURITY DEFINER is the standard fix).
--
-- Assumption: one Supabase auth user belongs to exactly one Z Desk tenant.
-- The schema (desk_users.auth_user_id unique per tenant, not globally)
-- technically allows one person in several tenants; this function returns
-- only the first match. Multi-tenant membership per person is out of
-- scope for v1 — revisit if it becomes a real need.
--
-- desk_integrations is deliberately left with NO client-facing policies:
-- it holds oauth_tokens (access/refresh tokens), which must never reach
-- the browser. All reads/writes to that table go through the backend
-- (service-role key, bypasses RLS) — see IntegrationsController, which
-- already excludes oauth_tokens from its response shape regardless.
--
-- desk_users has no client insert/update/delete policy yet — team
-- membership management (invites, role changes) is still a TODO and
-- goes through the backend once built, not direct client writes.

create or replace function desk_current_user_tenant_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select tenant_id from desk_users where auth_user_id = auth.uid() limit 1;
$$;

-- ─────────────────────────────────────────────────────────────────
-- desk_tenants — read your own tenant row only
-- ─────────────────────────────────────────────────────────────────

drop policy if exists desk_tenants_select_own on desk_tenants;
create policy desk_tenants_select_own on desk_tenants
  for select using (id = desk_current_user_tenant_id());

-- ─────────────────────────────────────────────────────────────────
-- desk_users — read teammates within your own tenant
-- ─────────────────────────────────────────────────────────────────

drop policy if exists desk_users_select_same_tenant on desk_users;
create policy desk_users_select_same_tenant on desk_users
  for select using (tenant_id = desk_current_user_tenant_id());

-- ─────────────────────────────────────────────────────────────────
-- desk_contacts, desk_threads, desk_messages, desk_events, desk_notes —
-- full CRUD scoped to own tenant. No role distinction (owner/admin/member)
-- yet within a tenant — everyone in a tenant can act on everything in it
-- for v1. Tightening by role is a TODO, not a v1 requirement.
-- ─────────────────────────────────────────────────────────────────

drop policy if exists desk_contacts_tenant_all on desk_contacts;
create policy desk_contacts_tenant_all on desk_contacts
  for all
  using (tenant_id = desk_current_user_tenant_id())
  with check (tenant_id = desk_current_user_tenant_id());

drop policy if exists desk_threads_tenant_all on desk_threads;
create policy desk_threads_tenant_all on desk_threads
  for all
  using (tenant_id = desk_current_user_tenant_id())
  with check (tenant_id = desk_current_user_tenant_id());

drop policy if exists desk_messages_tenant_all on desk_messages;
create policy desk_messages_tenant_all on desk_messages
  for all
  using (tenant_id = desk_current_user_tenant_id())
  with check (tenant_id = desk_current_user_tenant_id());

drop policy if exists desk_events_tenant_all on desk_events;
create policy desk_events_tenant_all on desk_events
  for all
  using (tenant_id = desk_current_user_tenant_id())
  with check (tenant_id = desk_current_user_tenant_id());

drop policy if exists desk_notes_tenant_all on desk_notes;
create policy desk_notes_tenant_all on desk_notes
  for all
  using (tenant_id = desk_current_user_tenant_id())
  with check (tenant_id = desk_current_user_tenant_id());
