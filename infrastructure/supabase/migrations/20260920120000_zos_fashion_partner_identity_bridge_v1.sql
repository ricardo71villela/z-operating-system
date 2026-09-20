-- ============================================================
-- Z Fashion — Partner Identity Bridge v1
-- ============================================================
--
-- Binds fashion.partners to the canonical ZOS organisation model so
-- fashion-partner's API can authorize "which Partners may this
-- authenticated person manage" — the gap server.js's own comments
-- already flag ("this server has no auth layer at all yet"; every
-- partner-scoped handler currently trusts the URL's partnerId with
-- no check on who is calling).
--
-- fashion-partner connects to Postgres directly via a privileged
-- DATABASE_URL connection (pg, not PostgREST) — Postgres RLS never
-- runs for that connection, so the fashion.partners "partners manage
-- their own record" JWT-claim policy (20260821090000) is not, and
-- cannot be, the real enforcement for this server. Authorization for
-- fashion-partner happens in application code instead: it verifies
-- the caller's JWT itself (Supabase's own auth.getClaims(), same as
-- apps/jobs/apps/api/src/supabaseAuth.ts), then calls
-- platform_internal.fashion_partner_ids_for_auth_user() below with
-- the verified auth_user_id to get the set of Partners that caller
-- may manage.
--
-- Nothing here creates any binding automatically. A Partner starts
-- with no linked organisation/membership, so
-- fashion_partner_ids_for_auth_user() returns an empty set for
-- everyone until the onboarding flow (separate, later work) calls
-- link_fashion_partner_organisation() once a Partner is approved.
-- That is deliberate fail-closed behaviour, not a bug to fix here.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Admin/onboarding-managed binding: Partner -> Organisation
-- ------------------------------------------------------------
--
-- Uses the same generic zos.registry_bindings table Find/Jobs already
-- use for human identity, here binding an organisation instead of a
-- person. A Partner never calls this about itself — it is meant to be
-- called by trusted onboarding/admin code once a Partner is approved
-- and its owning organisation is known.
-- ------------------------------------------------------------

create or replace function platform_internal.link_fashion_partner_organisation(
  p_partner_id uuid,
  p_organisation_id uuid
)
returns zos.registry_bindings
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_binding zos.registry_bindings%rowtype;
begin
  if p_partner_id is null or p_organisation_id is null then
    raise exception 'partner id and organisation id are both required'
      using errcode = '22004';
  end if;

  if not exists (select 1 from fashion.partners where id = p_partner_id) then
    raise exception 'no fashion partner with id %', p_partner_id
      using errcode = '23503';
  end if;

  if not exists (select 1 from zos.organisations where id = p_organisation_id) then
    raise exception 'no zos organisation with id %', p_organisation_id
      using errcode = '23503';
  end if;

  insert into zos.registry_bindings (
    domain_code, local_entity_type, local_entity_id,
    canonical_entity_type, canonical_entity_id,
    binding_status, linked_at
  )
  values (
    'fashion', 'partner', p_partner_id::text,
    'organisation', p_organisation_id::text,
    'linked', now()
  )
  on conflict (domain_code, local_entity_type, local_entity_id)
    where retired_at is null
    do update set
      canonical_entity_type = excluded.canonical_entity_type,
      canonical_entity_id = excluded.canonical_entity_id,
      binding_status = excluded.binding_status,
      linked_at = excluded.linked_at,
      updated_at = now()
  returning * into v_binding;

  return v_binding;
end;
$$;

revoke execute
on function platform_internal.link_fashion_partner_organisation(uuid, uuid)
from public, anon, authenticated, service_role;

comment on function platform_internal.link_fashion_partner_organisation(uuid, uuid) is
  'Links a fashion.partners row to its canonical zos.organisations row via zos.registry_bindings. Admin/onboarding-managed — a Partner never calls this about itself.';


-- ------------------------------------------------------------
-- 2. Resolve "which Partners may this authenticated person manage"
-- ------------------------------------------------------------
--
-- Input is a Supabase auth.users.id that the CALLER has already
-- verified (this function trusts it — it does not itself check a
-- JWT, the same division of responsibility supabaseAuth.ts already
-- draws in Jobs: crypto verification happens once, in application
-- code, never re-implemented in SQL).
-- ------------------------------------------------------------

create or replace function platform_internal.fashion_partner_ids_for_auth_user(
  p_auth_user_id uuid
)
returns table (partner_id uuid)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select rb.local_entity_id::uuid as partner_id
  from zos.persons p
  join zos.memberships m
    on m.person_id = p.id
   and m.status = 'active'
  join zos.registry_bindings rb
    on rb.canonical_entity_type = 'organisation'
   and rb.canonical_entity_id = m.organisation_id::text
   and rb.domain_code = 'fashion'
   and rb.local_entity_type = 'partner'
   and rb.binding_status = 'linked'
   and rb.retired_at is null
  where p.auth_user_id = p_auth_user_id;
$$;

revoke execute
on function platform_internal.fashion_partner_ids_for_auth_user(uuid)
from public, anon, authenticated, service_role;

comment on function platform_internal.fashion_partner_ids_for_auth_user(uuid) is
  'Given a verified Supabase auth.users.id, returns every fashion.partners.id that person may manage via an active zos.memberships row and the Partner<->Organisation binding above. Called by fashion-partner''s own privileged Postgres connection after IT verifies the caller''s JWT — never exposed to anon/authenticated/service_role.';
