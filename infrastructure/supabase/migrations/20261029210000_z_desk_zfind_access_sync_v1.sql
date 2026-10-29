-- ============================================================
-- Z DESK × Z FIND — l'accès à Z Desk suit l'agence Z Find v1
--
-- Z Desk Lite est inclus pour les utilisateurs d'une agence Z Find
-- active (pont 20261023100000 : partners.zos_organisation_id ↔
-- desk.workspaces.organisation_id). Jusqu'ici l'accès, une fois
-- ouvert, ne se refermait jamais :
--   * un membre retiré de l'équipe (profiles.partner_id → null) voyait
--     encore les demandes et visites de l'agence dans Z Desk ;
--   * une agence passée « inactive » gardait son espace Z Desk actif.
--
-- Désormais :
--   1. zdesk_sync_zfind_member(user) : la personne est membre active de
--      l'organisation ZOS d'une agence Z Find seulement si son profil
--      est partner_user de cette agence et que l'agence est active ;
--      sinon zos.memberships et desk.workspace_members passent à
--      'revoked' (ended_at renseigné). Seules les organisations créées
--      pour une agence Z Find sont concernées.
--   2. Déclencheur sur public.profiles (partner_id, role, suppression).
--   3. Déclencheur sur public.partners (status) : espace Z Desk
--      'suspended' quand l'agence devient inactive, 'active' au retour ;
--      chaque membre est resynchronisé.
--   4. zdesk_link_zfind_partner : un membre qui revient (ou une agence
--      réactivée) retrouve son accès (statuts remis à 'active').
--   5. Rattrapage immédiat des accès existants.
-- Idempotent, sans suppression de données.
-- ============================================================

-- ------------------------------------------------------------ 1. resync d'une personne
create or replace function public.zdesk_sync_zfind_member(p_auth_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_person uuid;
  r record;
  v_eligible boolean;
begin
  if p_auth_user_id is null then return; end if;
  select id into v_person from zos.persons where auth_user_id = p_auth_user_id;
  if v_person is null then return; end if;

  for r in
    select m.id as membership_id, m.status, pa.id as partner_id, pa.status as partner_status
      from zos.memberships m
      join public.partners pa on pa.zos_organisation_id = m.organisation_id
     where m.person_id = v_person
  loop
    v_eligible := r.partner_status = 'active' and exists (
      select 1 from public.profiles pf
       where pf.id = p_auth_user_id and pf.partner_id = r.partner_id and pf.role = 'partner_user');

    if v_eligible then
      -- Ré-ouverture : seulement si l'accès avait été retiré par cette synchronisation.
      update zos.memberships set status = 'active', ended_at = null
       where id = r.membership_id and status = 'revoked';
      update desk.workspace_members set status = 'active'
       where membership_id = r.membership_id and status = 'revoked';
    else
      update zos.memberships set status = 'revoked', ended_at = coalesce(ended_at, greatest(now(), coalesce(joined_at, now())))
       where id = r.membership_id and status <> 'revoked';
      update desk.workspace_members set status = 'revoked'
       where membership_id = r.membership_id and status <> 'revoked';
    end if;
  end loop;
end;
$$;
revoke all on function public.zdesk_sync_zfind_member(uuid) from public, anon, authenticated;
grant execute on function public.zdesk_sync_zfind_member(uuid) to service_role;

-- ------------------------------------------------------------ 2. profils
create or replace function public.zdesk_profiles_access_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.zdesk_sync_zfind_member(old.id);
    return old;
  end if;
  if tg_op = 'INSERT'
     or new.partner_id is distinct from old.partner_id
     or new.role is distinct from old.role then
    perform public.zdesk_sync_zfind_member(new.id);
  end if;
  return new;
end;
$$;
revoke all on function public.zdesk_profiles_access_sync() from public, anon, authenticated;

drop trigger if exists zdesk_profiles_access_sync on public.profiles;
create trigger zdesk_profiles_access_sync
  after insert or update of partner_id, role or delete on public.profiles
  for each row execute function public.zdesk_profiles_access_sync();

-- ------------------------------------------------------------ 3. agences
create or replace function public.zdesk_partners_access_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if new.status is not distinct from old.status or new.zos_organisation_id is null then
    return new;
  end if;
  -- Espace Z Desk de l'agence : suspendu tant que l'agence est inactive.
  -- Un espace fermé ('closed') par ailleurs n'est jamais rouvert ici.
  if new.status = 'active' then
    update desk.workspaces set status = 'active'
     where organisation_id = new.zos_organisation_id and status = 'suspended';
  else
    update desk.workspaces set status = 'suspended'
     where organisation_id = new.zos_organisation_id and status = 'active';
  end if;
  for r in
    select distinct p.auth_user_id
      from zos.memberships m join zos.persons p on p.id = m.person_id
     where m.organisation_id = new.zos_organisation_id and p.auth_user_id is not null
  loop
    perform public.zdesk_sync_zfind_member(r.auth_user_id);
  end loop;
  return new;
end;
$$;
revoke all on function public.zdesk_partners_access_sync() from public, anon, authenticated;

drop trigger if exists zdesk_partners_access_sync on public.partners;
create trigger zdesk_partners_access_sync
  after update of status on public.partners
  for each row execute function public.zdesk_partners_access_sync();

-- ------------------------------------------------------------ 4. pont : retour d'un membre
create or replace function public.zdesk_link_zfind_partner(p_auth_user_id uuid, p_email text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_partner public.partners%rowtype;
  v_person uuid;
  v_org uuid;
  v_membership uuid;
  v_workspace uuid;
  v_member uuid;
  v_role text;
begin
  select pa.* into v_partner
    from public.profiles pf
    join public.partners pa on pa.id = pf.partner_id
   where pf.id = p_auth_user_id and pf.role = 'partner_user' and pa.status = 'active'
   limit 1;
  if v_partner.id is null then
    return null;
  end if;

  insert into zos.persons (auth_user_id, display_name)
  values (p_auth_user_id, nullif(btrim(coalesce(p_email, '')), ''))
  on conflict (auth_user_id) do update set updated_at = zos.persons.updated_at
  returning id into v_person;

  -- Serialise concurrent first logins of the same agency.
  perform 1 from public.partners where id = v_partner.id for update;
  select zos_organisation_id into v_org from public.partners where id = v_partner.id;
  if v_org is null then
    insert into zos.organisations (name) values (v_partner.name) returning id into v_org;
    update public.partners set zos_organisation_id = v_org where id = v_partner.id;
  end if;

  insert into zos.memberships (person_id, organisation_id, status, joined_at)
  values (v_person, v_org, 'active', now())
  on conflict (person_id, organisation_id) do update set status = 'active', ended_at = null
  returning id into v_membership;

  -- L'agence est active : son espace aussi (sauf fermeture explicite).
  insert into desk.workspaces (organisation_id) values (v_org)
  on conflict (organisation_id) do update
    set status = case when desk.workspaces.status = 'suspended' then 'active' else desk.workspaces.status end,
        updated_at = desk.workspaces.updated_at
  returning id into v_workspace;

  select id, role into v_member, v_role from desk.workspace_members where membership_id = v_membership;
  if v_member is null then
    v_role := case when exists (select 1 from desk.workspace_members where workspace_id = v_workspace and status = 'active') then 'member' else 'owner' end;
    insert into desk.workspace_members (workspace_id, membership_id, role, status)
    values (v_workspace, v_membership, v_role, 'active')
    returning id into v_member;
  else
    update desk.workspace_members set status = 'active' where id = v_member and status = 'revoked';
  end if;

  return jsonb_build_object(
    'workspaceId', v_workspace, 'workspaceMemberId', v_member, 'organisationId', v_org,
    'membershipId', v_membership, 'role', v_role, 'partnerId', v_partner.id, 'partnerName', v_partner.name
  );
end;
$$;
revoke all on function public.zdesk_link_zfind_partner(uuid, text) from public, anon, authenticated;
grant execute on function public.zdesk_link_zfind_partner(uuid, text) to service_role;

-- ------------------------------------------------------------ 5. rattrapage
update desk.workspaces w set status = 'suspended'
  from public.partners pa
 where pa.zos_organisation_id = w.organisation_id and pa.status <> 'active' and w.status = 'active';

do $$
declare r record;
begin
  for r in
    select distinct p.auth_user_id
      from zos.memberships m
      join zos.persons p on p.id = m.person_id
      join public.partners pa on pa.zos_organisation_id = m.organisation_id
     where p.auth_user_id is not null
  loop
    perform public.zdesk_sync_zfind_member(r.auth_user_id);
  end loop;
end;
$$;
