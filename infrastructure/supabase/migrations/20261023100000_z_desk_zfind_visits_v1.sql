-- ============================================================
-- Z DESK × Z FIND — Demandes de visite (Z Desk Lite) v1
--
-- Un acheteur ou un locataire demande une visite depuis une annonce
-- Z Find, sans compte : nom, e-mail, téléphone et 1 à 3 créneaux.
-- L'agence confirme un créneau (ou refuse) dans Z Desk ; la visite
-- confirmée devient un événement de son calendrier Z Desk.
--
-- 1. Pont agence Z Find → ZOS → Z Desk :
--    partners.zos_organisation_id + zdesk_link_zfind_partner(). Un
--    utilisateur d'agence Z Find qui se connecte à Z Desk avec le même
--    compte obtient l'espace de son agence (Z Desk Lite, inclus dans
--    l'abonnement Z Find). Le premier utilisateur est owner.
-- 2. public.zfind_visit_requests : aucune politique RLS ; lecture et
--    écriture seulement par fonctions SECURITY DEFINER.
-- 3. zfind_visit_slots() / zfind_request_visit() : publiques (anon).
--    Créneaux d'une heure, lundi-samedi 9 h-19 h (Europe/Paris, même
--    fuseau en FR, BE et LU), à partir du lendemain, 14 jours. Les
--    créneaux déjà confirmés pour la même annonce sont retirés ; pour
--    le reste, l'agence tranche en confirmant.
--    Chaque demande crée aussi une ligne public.leads
--    (contact_type 'visit') : l'avis e-mail existant à l'agence et les
--    statistiques de demandes la prennent en compte sans autre code.
-- 4. zdesk_visit_requests() / zdesk_decide_visit() : service_role,
--    appelées par le backend Z Desk qui impose l'espace de l'appelant.
-- ============================================================

-- ------------------------------------------------------------ schema
alter table public.partners
  add column if not exists zos_organisation_id uuid references zos.organisations(id) on delete set null;
create unique index if not exists partners_zos_organisation_id_key
  on public.partners (zos_organisation_id) where zos_organisation_id is not null;

alter table public.leads drop constraint if exists leads_contact_type_check;
alter table public.leads add constraint leads_contact_type_check
  check (contact_type = any (array['direct','qualified','assisted','visit']));

alter table desk.events drop constraint if exists events_event_type_check;
alter table desk.events add constraint events_event_type_check
  check (event_type = any (array['meeting','follow_up_block','visit']));

create table if not exists public.zfind_visit_requests (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.leads(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  partner_id uuid not null references public.partners(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  email text not null check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' and char_length(email) <= 254),
  phone text not null check (char_length(regexp_replace(phone, '\D', '', 'g')) between 7 and 15),
  language text not null default 'fr' check (language in ('fr','en')),
  message text check (message is null or char_length(message) <= 2000),
  proposed_slots timestamptz[] not null check (cardinality(proposed_slots) between 1 and 3),
  status text not null default 'requested' check (status in ('requested','confirmed','declined','cancelled')),
  confirmed_start timestamptz,
  confirmed_end timestamptz,
  desk_event_id uuid,
  decided_by_member_id uuid references desk.workspace_members(id) on delete set null,
  decided_at timestamptz,
  decline_reason text check (decline_reason is null or char_length(decline_reason) <= 500),
  buyer_notified_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'confirmed') = (confirmed_start is not null and confirmed_end is not null)),
  check (status = 'requested' or decided_at is not null)
);
create index if not exists zfind_visit_requests_partner_idx on public.zfind_visit_requests (partner_id, status, created_at desc);
create index if not exists zfind_visit_requests_listing_confirmed_idx on public.zfind_visit_requests (listing_id, confirmed_start) where status = 'confirmed';

alter table public.zfind_visit_requests enable row level security;
revoke all on table public.zfind_visit_requests from public, anon, authenticated;

-- ------------------------------------------------------------ slots (public)
create or replace function public.zfind_visit_slots(p_listing_id uuid, p_days integer default 14)
returns table (slot_start timestamptz, slot_end timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with local_today as (
    select (now() at time zone 'Europe/Paris')::date as d
  ), days as (
    select (select d from local_today) + g as day
      from generate_series(1, greatest(1, least(coalesce(p_days, 14), 21))) g
  ), candidates as (
    select ((days.day + make_time(h, 0, 0)) at time zone 'Europe/Paris') as s
      from days, generate_series(9, 18) h
     where extract(isodow from days.day) <> 7
  )
  select c.s, c.s + interval '1 hour'
    from candidates c
   where public.zfind_public_listing_visible(p_listing_id)
     and exists (
       select 1
         from public.listings li
         join public.representations r on r.id = li.representation_id
         join public.partners pa on pa.id = r.partner_id
        where li.id = p_listing_id
          and pa.status = 'active'
          and coalesce(pa.enquiry_policy ->> 'visit', 'true') <> 'false'
     )
     and not exists (
       select 1 from public.zfind_visit_requests v
        where v.listing_id = p_listing_id
          and v.status = 'confirmed'
          and tstzrange(v.confirmed_start, v.confirmed_end) && tstzrange(c.s, c.s + interval '1 hour')
     )
   order by c.s;
$$;

revoke all on function public.zfind_visit_slots(uuid, integer) from public;
grant execute on function public.zfind_visit_slots(uuid, integer) to anon, authenticated, service_role;

-- ------------------------------------------------------------ request (public)
create or replace function public.zfind_request_visit(
  p_listing_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_slots timestamptz[],
  p_message text default null,
  p_language text default 'fr'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_partner uuid;
  v_slots timestamptz[];
  v_lang text := case when p_language = 'en' then 'en' else 'fr' end;
  v_name text := btrim(coalesce(p_name, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_slot_text text;
  v_lead uuid;
  v_request uuid;
begin
  select r.partner_id into v_partner
    from public.listings li
    join public.representations r on r.id = li.representation_id
   where li.id = p_listing_id;
  if v_partner is null or not public.zfind_public_listing_visible(p_listing_id) then
    return jsonb_build_object('ok', false, 'error', 'listing_unavailable');
  end if;

  if char_length(v_name) not between 1 and 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or char_length(v_email) > 254 then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;
  if v_phone !~ '^[\d+\s()-]+$' or char_length(regexp_replace(v_phone, '\D', '', 'g')) not between 7 and 15 then
    return jsonb_build_object('ok', false, 'error', 'invalid_phone');
  end if;
  if v_message is not null and char_length(v_message) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'message_too_long');
  end if;

  select array_agg(distinct s order by s) into v_slots from unnest(coalesce(p_slots, '{}')) s where s is not null;
  if coalesce(cardinality(v_slots), 0) not between 1 and 3 then
    return jsonb_build_object('ok', false, 'error', 'invalid_slots');
  end if;
  if exists (
    select 1 from unnest(v_slots) s
     where not exists (select 1 from public.zfind_visit_slots(p_listing_id, 21) f where f.slot_start = s)
  ) then
    return jsonb_build_object('ok', false, 'error', 'slot_unavailable');
  end if;

  -- Abuse guard: one open request per person and listing, at most
  -- 5 requests per e-mail address per day.
  if exists (
    select 1 from public.zfind_visit_requests v
     where v.listing_id = p_listing_id and v.email = v_email and v.status = 'requested'
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_requested');
  end if;
  if (select count(*) from public.zfind_visit_requests v
       where v.email = v_email and v.created_at > now() - interval '1 day') >= 5 then
    return jsonb_build_object('ok', false, 'error', 'too_many_requests');
  end if;

  select string_agg(to_char(s at time zone 'Europe/Paris', 'DD/MM/YYYY HH24:MI'), ' · ' order by s)
    into v_slot_text from unnest(v_slots) s;

  insert into public.leads (listing_id, contact_type, name, email, phone, message, status)
  values (
    p_listing_id, 'visit', v_name, v_email, v_phone,
    concat_ws(E'\n\n', v_message,
      case when v_lang = 'en' then '[Visit request — ' else '[Demande de visite — ' end || v_slot_text || ']'),
    'new'
  )
  returning id into v_lead;

  insert into public.zfind_visit_requests (lead_id, listing_id, partner_id, name, email, phone, language, message, proposed_slots)
  values (v_lead, p_listing_id, v_partner, v_name, v_email, v_phone, v_lang, v_message, v_slots)
  returning id into v_request;

  return jsonb_build_object('ok', true, 'id', v_request);
end;
$$;

revoke all on function public.zfind_request_visit(uuid, text, text, text, timestamptz[], text, text) from public;
grant execute on function public.zfind_request_visit(uuid, text, text, text, timestamptz[], text, text) to anon, authenticated, service_role;

-- ------------------------------------------------------------ partner → Z Desk (service)
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
  on conflict (person_id, organisation_id) do update set status = 'active'
  returning id into v_membership;

  insert into desk.workspaces (organisation_id) values (v_org)
  on conflict (organisation_id) do update set updated_at = desk.workspaces.updated_at
  returning id into v_workspace;

  select id, role into v_member, v_role from desk.workspace_members where membership_id = v_membership;
  if v_member is null then
    v_role := case when exists (select 1 from desk.workspace_members where workspace_id = v_workspace) then 'member' else 'owner' end;
    insert into desk.workspace_members (workspace_id, membership_id, role, status)
    values (v_workspace, v_membership, v_role, 'active')
    returning id into v_member;
  end if;

  return jsonb_build_object(
    'workspaceId', v_workspace, 'workspaceMemberId', v_member, 'organisationId', v_org,
    'membershipId', v_membership, 'role', v_role, 'partnerId', v_partner.id, 'partnerName', v_partner.name
  );
end;
$$;

revoke all on function public.zdesk_link_zfind_partner(uuid, text) from public, anon, authenticated;
grant execute on function public.zdesk_link_zfind_partner(uuid, text) to service_role;

-- ------------------------------------------------------------ list (service)
create or replace function public.zdesk_visit_requests(p_workspace_id uuid, p_status text default null)
returns table (
  id uuid, status text, created_at timestamptz, name text, email text, phone text, language text,
  message text, proposed_slots timestamptz[], confirmed_start timestamptz, confirmed_end timestamptz,
  decided_at timestamptz, decline_reason text, buyer_notified_at timestamptz,
  listing_id uuid, listing_title text, transaction_type text, price numeric, currency text
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.status, v.created_at, v.name, v.email, v.phone, v.language,
         v.message, v.proposed_slots, v.confirmed_start, v.confirmed_end,
         v.decided_at, v.decline_reason, v.buyer_notified_at,
         li.id,
         (select lc.title from public.listing_content lc
           where lc.listing_id = li.id and coalesce(btrim(lc.title), '') <> ''
           order by (lc.locale = 'fr') desc, lc.locale limit 1),
         li.transaction_type, li.price_current, li.currency_iso
    from public.zfind_visit_requests v
    join public.partners pa on pa.id = v.partner_id
    join desk.workspaces w on w.organisation_id = pa.zos_organisation_id
    join public.listings li on li.id = v.listing_id
   where w.id = p_workspace_id
     and (p_status is null or v.status = p_status)
   order by (v.status = 'requested') desc, coalesce(v.confirmed_start, v.created_at) desc
   limit 200;
$$;

revoke all on function public.zdesk_visit_requests(uuid, text) from public, anon, authenticated;
grant execute on function public.zdesk_visit_requests(uuid, text) to service_role;

-- ------------------------------------------------------------ decide (service)
create or replace function public.zdesk_decide_visit(
  p_workspace_id uuid,
  p_member_id uuid,
  p_request_id uuid,
  p_action text,
  p_slot_start timestamptz default null,
  p_reason text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_req public.zfind_visit_requests%rowtype;
  v_partner_name text;
  v_title text;
  v_event uuid;
begin
  if not exists (
    select 1 from desk.workspace_members
     where id = p_member_id and workspace_id = p_workspace_id and status = 'active'
  ) then
    raise exception 'Not an active member of this workspace' using errcode = '42501';
  end if;

  select v.* into v_req
    from public.zfind_visit_requests v
    join public.partners pa on pa.id = v.partner_id
    join desk.workspaces w on w.organisation_id = pa.zos_organisation_id
   where v.id = p_request_id and w.id = p_workspace_id
   for update of v;
  if v_req.id is null then
    raise exception 'Visit request not found' using errcode = 'P0002';
  end if;
  if v_req.status <> 'requested' then
    raise exception 'Visit request already decided' using errcode = '55000';
  end if;

  select pa.name into v_partner_name from public.partners pa where pa.id = v_req.partner_id;
  select lc.title into v_title from public.listing_content lc
   where lc.listing_id = v_req.listing_id and coalesce(btrim(lc.title), '') <> ''
   order by (lc.locale = v_req.language) desc, (lc.locale = 'fr') desc, lc.locale limit 1;

  if p_action = 'confirm' then
    if p_slot_start is null or not (p_slot_start = any (v_req.proposed_slots)) then
      raise exception 'Slot must be one of the proposed slots' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.zfind_visit_requests o
       where o.listing_id = v_req.listing_id and o.status = 'confirmed'
         and tstzrange(o.confirmed_start, o.confirmed_end) && tstzrange(p_slot_start, p_slot_start + interval '1 hour')
    ) then
      raise exception 'Another visit is already confirmed for this listing at that time' using errcode = '23P01';
    end if;

    insert into desk.events (workspace_id, title, starts_at, ends_at, source, status, event_type, created_by)
    values (
      p_workspace_id,
      left('Visite — ' || v_req.name || coalesce(' — ' || v_title, ''), 200),
      p_slot_start, p_slot_start + interval '1 hour', 'manual', 'confirmed', 'visit', p_member_id
    )
    returning id into v_event;

    update public.zfind_visit_requests
       set status = 'confirmed', confirmed_start = p_slot_start, confirmed_end = p_slot_start + interval '1 hour',
           desk_event_id = v_event, decided_by_member_id = p_member_id, decided_at = now()
     where id = v_req.id;
  elsif p_action = 'decline' then
    update public.zfind_visit_requests
       set status = 'declined', decline_reason = nullif(left(btrim(coalesce(p_reason, '')), 500), ''),
           decided_by_member_id = p_member_id, decided_at = now()
     where id = v_req.id;
  else
    raise exception 'Unknown action' using errcode = '22023';
  end if;

  update public.leads
     set status = case when status = 'new' then 'contacted' else status end,
         responded_at = coalesce(responded_at, now())
   where id = v_req.lead_id;

  return jsonb_build_object(
    'id', v_req.id, 'status', case when p_action = 'confirm' then 'confirmed' else 'declined' end,
    'eventId', v_event, 'slotStart', p_slot_start, 'slotEnd', p_slot_start + interval '1 hour',
    'buyerName', v_req.name, 'buyerEmail', v_req.email, 'language', v_req.language,
    'listingId', v_req.listing_id, 'listingTitle', v_title, 'agencyName', v_partner_name,
    'reason', nullif(btrim(coalesce(p_reason, '')), '')
  );
end;
$$;

revoke all on function public.zdesk_decide_visit(uuid, uuid, uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.zdesk_decide_visit(uuid, uuid, uuid, text, timestamptz, text) to service_role;

create or replace function public.zdesk_mark_visit_notified(p_workspace_id uuid, p_request_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.zfind_visit_requests v
     set buyer_notified_at = now()
    from public.partners pa, desk.workspaces w
   where v.id = p_request_id and pa.id = v.partner_id
     and w.organisation_id = pa.zos_organisation_id and w.id = p_workspace_id;
$$;

revoke all on function public.zdesk_mark_visit_notified(uuid, uuid) from public, anon, authenticated;
grant execute on function public.zdesk_mark_visit_notified(uuid, uuid) to service_role;
