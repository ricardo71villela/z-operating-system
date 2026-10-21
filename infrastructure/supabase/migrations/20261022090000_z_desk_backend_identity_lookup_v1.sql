-- Z Desk — backend identity lookups v1
--
-- ZOS Core keeps schema zos closed to every Data API role, service_role
-- included (20260809190000_zos_core_access_v1: "zos is NOT exposed").
-- The Z Desk backend read zos.persons / zos.memberships directly through
-- the service-role client, which that boundary refuses ("permission
-- denied for schema zos"), so no Z Desk request could ever resolve its
-- caller.
--
-- These two read-only functions give the backend exactly what it needs,
-- in the same shape as the other zdesk_* RPCs: SECURITY DEFINER, empty
-- search_path, executable by service_role only. Schema zos stays closed.

-- The caller's canonical Person and active memberships (optionally for
-- one organisation). No row: no Person. One row with null
-- membership_id: a Person without an active membership.
create or replace function public.zdesk_identity_for_auth_user(p_auth_user_id uuid, p_organisation_id uuid default null)
returns table (person_id uuid, membership_id uuid, organisation_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, m.id, m.organisation_id
  from zos.persons p
  left join zos.memberships m
    on m.person_id = p.id
   and m.status = 'active'
   and (p_organisation_id is null or m.organisation_id = p_organisation_id)
  where p.auth_user_id = p_auth_user_id;
$$;

-- Display names for a set of memberships (team and personnel views; the
-- backend only passes memberships of the caller's own workspace).
create or replace function public.zdesk_member_names(p_membership_ids uuid[])
returns table (membership_id uuid, person_id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, p.id, p.display_name
  from zos.memberships m
  join zos.persons p on p.id = m.person_id
  where m.id = any(p_membership_ids);
$$;

revoke all on function public.zdesk_identity_for_auth_user(uuid, uuid) from public, anon, authenticated;
revoke all on function public.zdesk_member_names(uuid[]) from public, anon, authenticated;
grant execute on function public.zdesk_identity_for_auth_user(uuid, uuid) to service_role;
grant execute on function public.zdesk_member_names(uuid[]) to service_role;
