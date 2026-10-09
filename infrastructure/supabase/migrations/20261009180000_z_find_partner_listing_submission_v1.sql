-- ============================================================
-- Z FIND — Partner « Soumettre à validation » + Admin return to draft v1
--
-- Until now only the Admin could move a Listing out of « Brouillon »
-- (zfind_admin_transition_listing, migration 20260813193750). This
-- migration lets the agency hand its draft to Z Find, and lets Z Find
-- send it back with a reason that reaches the agency:
--
--   * zfind_partner_submit_listing(uuid)
--       Partner only. draft | incomplete -> pending_review, nothing else
--       (never ready / published). Same Partner authorization as every
--       partner listing command: public.zfind_partner_controls_listing
--       (migration 20260813213456; also the Partner half of
--       zfind_can_manage_listing_compliance used by
--       zfind_save_listing_compliance). Minimal readiness is checked here,
--       with a French message listing what is missing.
--   * zfind_partner_withdraw_listing_submission(uuid)
--       Partner only. pending_review -> draft (« Retirer de la validation »).
--   * zfind_list_listing_submission_status(uuid[])
--       Admin or controlling Partner (zfind_can_manage_listing_compliance):
--       per Listing, status, readiness codes and the last Z Find
--       return / refusal reason. Unmanageable ids are silently skipped.
--   * zfind_admin_return_listing_to_draft(uuid, text)
--       Admin only. pending_review | ready | incomplete -> draft with a
--       mandatory reason, through the legal transitions of
--       zfind_admin_transition_listing (ready -> pending_review ->
--       incomplete -> draft).
--   * public.zfind_listing_review_notices + trigger on
--     zfind_listing_compliance: every return to draft and every
--     compliance refusal is queued for the agency e-mail sent by the
--     site's /api/lead-notify (Resend), same pattern as the lead
--     notifications of migration 20261004160000:
--     zfind_pending_listing_review_notices / zfind_mark_listing_review_notices
--     are server-only (service_role).
--
-- Who / when: every status change still goes through an UPDATE of
-- public.listings.status, so the existing trigger
-- trg_zfind_listing_state_history (migration 20260812135037) records
-- from/to status, auth.uid() and the time — exactly as for the Admin
-- transitions. Return reasons are kept in zfind_listing_review_notices.
--
-- Readiness codes (same order in services/listing-submission.js):
--   commune, title_fr, description_fr, price, photo,
--   France only: compliance_unsupported | compliance_facts | compliance_rejected
-- (« mentions obligatoires » saved and complete; Z Find approval is NOT
-- required to submit — it is required to publish, by the existing gate).
--
-- Additive and idempotent: create table if not exists, create or replace,
-- drop trigger if exists. No existing function, table or policy changes.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Notices to the agency (return to draft, compliance refusal)
-- ------------------------------------------------------------

create table if not exists public.zfind_listing_review_notices (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  kind text not null,
  reason text not null,
  from_status text,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  notify_attempts smallint not null default 0,
  constraint zfind_listing_review_notices_kind_chk check (kind in ('returned_to_draft', 'compliance_rejected')),
  constraint zfind_listing_review_notices_reason_chk check (char_length(btrim(reason)) between 1 and 1000)
);

create index if not exists zfind_listing_review_notices_listing_idx
  on public.zfind_listing_review_notices (listing_id, created_at desc);
create index if not exists zfind_listing_review_notices_pending_idx
  on public.zfind_listing_review_notices (created_at) where notified_at is null;

alter table public.zfind_listing_review_notices enable row level security;
revoke all on table public.zfind_listing_review_notices from public, anon, authenticated;

comment on table public.zfind_listing_review_notices is
  'Z Find decisions the agency must hear about (listing returned to draft, mentions obligatoires refused), with the reason. Written by SECURITY DEFINER commands / trigger only; e-mailed by /api/lead-notify.';


-- ------------------------------------------------------------
-- 2. Readiness (internal helpers)
-- ------------------------------------------------------------

create or replace function public.zfind_listing_status_fr(p_status text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case p_status
    when 'draft' then 'Brouillon'
    when 'incomplete' then 'À compléter'
    when 'pending_review' then 'En attente de validation'
    when 'ready' then 'Prête à publier'
    when 'published' then 'Publiée'
    when 'suspended' then 'Suspendue'
    when 'archived' then 'Archivée'
    else coalesce(p_status, '—')
  end;
$$;

create or replace function public.zfind_listing_submission_missing(p_listing_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_listing public.listings%rowtype;
  v_rep public.representations%rowtype;
  v_missing text[] := array[]::text[];
  v_jurisdiction text;
  v_review_status text;
begin
  select l.* into v_listing from public.listings l where l.id = p_listing_id;
  if not found then
    return array['listing_not_found']::text[];
  end if;
  select r.* into v_rep from public.representations r where r.id = v_listing.representation_id;

  v_jurisdiction := public.zfind_listing_jurisdiction(p_listing_id);
  if v_jurisdiction is null then
    v_missing := array_append(v_missing, 'commune');
  end if;

  if not exists (
    select 1 from public.listing_content lc
    where lc.listing_id = p_listing_id and lc.locale = 'fr'
      and nullif(pg_catalog.btrim(lc.title), '') is not null
  ) then
    v_missing := array_append(v_missing, 'title_fr');
  end if;

  if not exists (
    select 1 from public.listing_content lc
    where lc.listing_id = p_listing_id and lc.locale = 'fr'
      and nullif(pg_catalog.btrim(lc.description), '') is not null
  ) then
    v_missing := array_append(v_missing, 'description_fr');
  end if;

  if coalesce(v_listing.price_current, 0) <= 0 then
    v_missing := array_append(v_missing, 'price');
  end if;

  -- Photos: a Property Listing owns its photos (listing_media); a
  -- Development's photos belong to the Development (development_media).
  if v_rep.target_type = 'development' then
    if not exists (select 1 from public.development_media dm where dm.development_id = v_rep.development_id) then
      v_missing := array_append(v_missing, 'photo');
    end if;
  elsif not exists (select 1 from public.listing_media lm where lm.listing_id = p_listing_id) then
    v_missing := array_append(v_missing, 'photo');
  end if;

  -- France: the mandatory information must be saved and complete
  -- (approval by Z Find comes after submission).
  if v_jurisdiction = 'FR' then
    if public.zfind_listing_compliance_profile(p_listing_id) is null then
      v_missing := array_append(v_missing, 'compliance_unsupported');
    else
      select c.review_status into v_review_status
      from public.zfind_listing_compliance c where c.listing_id = p_listing_id;
      if not found
         or not coalesce((public.zfind_validate_listing_compliance_facts(p_listing_id) ->> 'facts_valid')::boolean, false) then
        v_missing := array_append(v_missing, 'compliance_facts');
      elsif v_review_status = 'rejected' then
        v_missing := array_append(v_missing, 'compliance_rejected');
      end if;
    end if;
  end if;

  return v_missing;
end;
$$;

create or replace function public.zfind_listing_submission_missing_text(p_missing text[])
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(string_agg(
    case m.code
      when 'commune' then 'la commune du bien'
      when 'title_fr' then 'un titre en français'
      when 'description_fr' then 'une description en français'
      when 'price' then 'un prix supérieur à 0'
      when 'photo' then 'au moins une photo'
      when 'compliance_facts' then 'les mentions obligatoires (France) complètes et enregistrées'
      when 'compliance_rejected' then 'les mentions obligatoires corrigées (refusées par Z Find)'
      when 'compliance_unsupported' then 'un type de bien couvert en France (logement en vente ou en location)'
      else m.code
    end, ', ' order by m.ord), '')
  from unnest(coalesce(p_missing, array[]::text[])) with ordinality as m(code, ord);
$$;


-- ------------------------------------------------------------
-- 3. Partner: submit / withdraw
-- ------------------------------------------------------------

create or replace function public.zfind_partner_submit_listing(p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_listing public.listings%rowtype;
  v_missing text[];
begin
  if p_listing_id is null then
    raise exception 'Annonce non précisée.' using errcode = '22023';
  end if;

  -- Same check as every Partner listing command (content, media, compliance).
  if not public.zfind_partner_controls_listing(p_listing_id) then
    raise exception 'Accès refusé : cette annonce n’est pas gérée par votre agence.' using errcode = '42501';
  end if;

  select l.* into v_listing from public.listings l where l.id = p_listing_id for update;
  if not found then
    raise exception 'Annonce introuvable.' using errcode = 'P0002';
  end if;

  -- Idempotent: already waiting for Z Find.
  if v_listing.status = 'pending_review' then
    return to_jsonb(v_listing);
  end if;

  if v_listing.status not in ('draft', 'incomplete') then
    raise exception 'Soumission impossible : l’annonce est « % ». Seul un brouillon peut être soumis à validation.',
      public.zfind_listing_status_fr(v_listing.status)
      using errcode = '55000';
  end if;

  v_missing := public.zfind_listing_submission_missing(p_listing_id);
  if cardinality(v_missing) > 0 then
    raise exception 'Soumission impossible. Il manque : %.', public.zfind_listing_submission_missing_text(v_missing)
      using errcode = '55000', detail = to_jsonb(v_missing)::text;
  end if;

  -- trg_zfind_listing_state_history records draft -> pending_review with auth.uid().
  update public.listings l set status = 'pending_review' where l.id = v_listing.id
  returning * into v_listing;

  return to_jsonb(v_listing);
end;
$$;

comment on function public.zfind_partner_submit_listing(uuid) is
  'Partner « Soumettre à validation »: draft | incomplete -> pending_review only, for a Listing the caller''s agency controls (zfind_partner_controls_listing), once commune, French title and description, price, a photo and (France) complete mentions obligatoires are present.';

create or replace function public.zfind_partner_withdraw_listing_submission(p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_listing public.listings%rowtype;
begin
  if p_listing_id is null then
    raise exception 'Annonce non précisée.' using errcode = '22023';
  end if;
  if not public.zfind_partner_controls_listing(p_listing_id) then
    raise exception 'Accès refusé : cette annonce n’est pas gérée par votre agence.' using errcode = '42501';
  end if;

  select l.* into v_listing from public.listings l where l.id = p_listing_id for update;
  if not found then
    raise exception 'Annonce introuvable.' using errcode = 'P0002';
  end if;

  if v_listing.status in ('draft', 'incomplete') then
    return to_jsonb(v_listing);
  end if;
  if v_listing.status <> 'pending_review' then
    raise exception 'Retrait impossible : l’annonce est « % » et n’est plus en attente de validation.',
      public.zfind_listing_status_fr(v_listing.status)
      using errcode = '55000';
  end if;

  update public.listings l set status = 'draft' where l.id = v_listing.id
  returning * into v_listing;
  return to_jsonb(v_listing);
end;
$$;

comment on function public.zfind_partner_withdraw_listing_submission(uuid) is
  'Partner « Retirer de la validation »: pending_review -> draft only, for a Listing the caller''s agency controls.';


-- ------------------------------------------------------------
-- 4. Status + readiness for the Partner portfolio and the Admin
-- ------------------------------------------------------------

create or replace function public.zfind_list_listing_submission_status(p_listing_ids uuid[])
returns table (
  listing_id uuid,
  status text,
  ready boolean,
  missing jsonb,
  jurisdiction_iso text,
  last_notice_kind text,
  last_notice_reason text,
  last_notice_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_listing_ids is null or cardinality(p_listing_ids) = 0 then
    return;
  end if;
  if cardinality(p_listing_ids) > 1000 then
    raise exception 'At most 1000 listings per call' using errcode = '22023';
  end if;

  return query
  select
    l.id,
    l.status::text,
    l.status in ('draft', 'incomplete') and cardinality(m.missing) = 0,
    to_jsonb(m.missing),
    public.zfind_listing_jurisdiction(l.id),
    n.kind,
    n.reason,
    n.created_at
  from (select distinct x.id from unnest(p_listing_ids) as x(id)) ids
  join public.listings l on l.id = ids.id
  cross join lateral (select public.zfind_listing_submission_missing(l.id) as missing) m
  left join lateral (
    select rn.kind, rn.reason, rn.created_at
    from public.zfind_listing_review_notices rn
    where rn.listing_id = l.id
    order by rn.created_at desc, rn.id desc
    limit 1
  ) n on true
  where public.zfind_can_manage_listing_compliance(l.id);
end;
$$;

comment on function public.zfind_list_listing_submission_status(uuid[]) is
  'Listing status, submission readiness codes and the last Z Find return / refusal reason, for the Listings the caller may manage (Admin or controlling Partner). Read-only.';


-- ------------------------------------------------------------
-- 5. Admin: « Renvoyer en brouillon » with a reason
-- ------------------------------------------------------------

create or replace function public.zfind_admin_return_listing_to_draft(p_listing_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_from text;
  v_step text;
  v_listing public.listings%rowtype;
begin
  if v_actor is null
     or not exists (select 1 from public.profiles p where p.id = v_actor and p.role = 'admin')
  then
    raise exception 'Admin role required' using errcode = '42501';
  end if;
  if p_listing_id is null then
    raise exception 'Annonce non précisée.' using errcode = '22023';
  end if;
  if v_reason is null then
    raise exception 'Motif obligatoire : indiquez à l’agence ce qu’elle doit corriger.' using errcode = '22023';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception 'Motif trop long (1000 caractères au plus).' using errcode = '22023';
  end if;

  select l.status into v_from from public.listings l where l.id = p_listing_id for update;
  if not found then
    raise exception 'Annonce introuvable.' using errcode = 'P0002';
  end if;
  if v_from = 'draft' then
    raise exception 'Renvoi impossible : l’annonce est déjà en brouillon.' using errcode = '55000';
  end if;
  if v_from not in ('pending_review', 'ready', 'incomplete') then
    raise exception 'Renvoi impossible : l’annonce est « % ». Seules les annonces à vérifier ou prêtes à publier peuvent être renvoyées en brouillon.',
      public.zfind_listing_status_fr(v_from)
      using errcode = '55000';
  end if;

  -- Only legal transitions of the Admin state machine, each one recorded
  -- by trg_zfind_listing_state_history with the Admin as actor.
  v_step := v_from;
  if v_step = 'ready' then
    perform public.zfind_admin_transition_listing(p_listing_id, 'pending_review');
    v_step := 'pending_review';
  end if;
  if v_step = 'pending_review' then
    perform public.zfind_admin_transition_listing(p_listing_id, 'incomplete');
  end if;
  perform public.zfind_admin_transition_listing(p_listing_id, 'draft');

  insert into public.zfind_listing_review_notices (listing_id, kind, reason, from_status, actor_profile_id)
  values (p_listing_id, 'returned_to_draft', v_reason, v_from, v_actor);

  select l.* into v_listing from public.listings l where l.id = p_listing_id;
  return to_jsonb(v_listing);
end;
$$;

comment on function public.zfind_admin_return_listing_to_draft(uuid, text) is
  'Admin « Renvoyer en brouillon »: pending_review | ready | incomplete -> draft through zfind_admin_transition_listing, with a mandatory reason queued for the agency (zfind_listing_review_notices).';


-- ------------------------------------------------------------
-- 6. Compliance refusal -> notice to the agency
-- ------------------------------------------------------------

create or replace function public.zfind_listing_compliance_rejection_notice()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.review_status = 'rejected' and old.review_status is distinct from 'rejected' then
    insert into public.zfind_listing_review_notices (listing_id, kind, reason, actor_profile_id)
    values (new.listing_id, 'compliance_rejected', coalesce(nullif(pg_catalog.btrim(new.review_note), ''), 'Motif non précisé'), new.reviewed_by);
  end if;
  return null;
end;
$$;

drop trigger if exists zfind_listing_compliance_rejection_notice on public.zfind_listing_compliance;
create trigger zfind_listing_compliance_rejection_notice
after update of review_status on public.zfind_listing_compliance
for each row execute function public.zfind_listing_compliance_rejection_notice();


-- ------------------------------------------------------------
-- 7. E-mail queue (server only, like zfind_pending_lead_notifications)
-- ------------------------------------------------------------

create or replace function public.zfind_pending_listing_review_notices(p_limit integer default 20)
returns table (
  notice_id uuid,
  created_at timestamptz,
  kind text,
  reason text,
  listing_id uuid,
  listing_status text,
  listing_title text,
  agency_reference text,
  transaction_type text,
  price numeric,
  currency text,
  partner_id uuid,
  partner_name text,
  partner_active boolean,
  recipients text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select n.id, n.created_at, n.kind, n.reason,
         li.id, li.status,
         (select lc.title from public.listing_content lc
           where lc.listing_id = li.id and coalesce(btrim(lc.title), '') <> ''
           order by (lc.locale = 'fr') desc, lc.locale limit 1),
         (select pr.agency_reference from public.properties pr where pr.id = r.property_id),
         li.transaction_type, li.price_current, li.currency_iso,
         pa.id, pa.name, coalesce(pa.status = 'active', false),
         array(
           select distinct lower(x.e) from (
             select u.email::text as e
               from public.profiles pf join auth.users u on u.id = pf.id
              where pf.partner_id = pa.id and pf.role = 'partner_user'
             union
             select s.email from public.zfind_partner_signups s
              where s.partner_id = pa.id and s.status <> 'rejected'
           ) x
           where x.e is not null and x.e <> ''
         )
    from public.zfind_listing_review_notices n
    join public.listings li on li.id = n.listing_id
    join public.representations r on r.id = li.representation_id
    left join public.partners pa on pa.id = r.partner_id
   where n.notified_at is null
     and n.notify_attempts < 5
     and n.created_at > now() - interval '7 days'
   order by n.created_at
   limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

create or replace function public.zfind_mark_listing_review_notices(p_ids uuid[], p_delivered boolean)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.zfind_listing_review_notices
     set notified_at = case when p_delivered then now() else notified_at end,
         notify_attempts = notify_attempts + case when p_delivered then 0 else 1 end
   where id = any (coalesce(p_ids, '{}'::uuid[])) and notified_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


-- ------------------------------------------------------------
-- 8. Grants
-- ------------------------------------------------------------

revoke all on function public.zfind_listing_status_fr(text) from public, anon, authenticated;
revoke all on function public.zfind_listing_submission_missing(uuid) from public, anon, authenticated;
revoke all on function public.zfind_listing_submission_missing_text(text[]) from public, anon, authenticated;
revoke all on function public.zfind_listing_compliance_rejection_notice() from public, anon, authenticated;
revoke all on function public.zfind_partner_submit_listing(uuid) from public, anon, authenticated;
revoke all on function public.zfind_partner_withdraw_listing_submission(uuid) from public, anon, authenticated;
revoke all on function public.zfind_list_listing_submission_status(uuid[]) from public, anon, authenticated;
revoke all on function public.zfind_admin_return_listing_to_draft(uuid, text) from public, anon, authenticated;
revoke all on function public.zfind_pending_listing_review_notices(integer) from public, anon, authenticated;
revoke all on function public.zfind_mark_listing_review_notices(uuid[], boolean) from public, anon, authenticated;

grant execute on function public.zfind_partner_submit_listing(uuid) to authenticated;
grant execute on function public.zfind_partner_withdraw_listing_submission(uuid) to authenticated;
grant execute on function public.zfind_list_listing_submission_status(uuid[]) to authenticated;
grant execute on function public.zfind_admin_return_listing_to_draft(uuid, text) to authenticated;
grant execute on function public.zfind_pending_listing_review_notices(integer) to service_role;
grant execute on function public.zfind_mark_listing_review_notices(uuid[], boolean) to service_role;
