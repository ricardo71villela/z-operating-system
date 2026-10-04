-- ============================================================
-- Z FIND — Inscription autonome des agences et promoteurs
--
-- 1. zfind_registry_lookup(country, number) : l'agence tape son SIREN /
--    SIRET (FR) ou son numéro d'entreprise (BE) et retrouve ses
--    établissements dans la base zfind_agencias pour pré-remplir sa
--    fiche. Ne renvoie que des données de registre publiques (nom,
--    adresse) — jamais téléphone, e-mail ni site.
-- 2. L'inscription est portée par les métadonnées du compte
--    (auth.signUp … data.zfind_signup) ; zfind_partner_complete_signup()
--    la transforme, à la première connexion, en partenaire + profil
--    partner_user + demande d'inscription « à vérifier ».
-- 3. Les annonces ne sont jamais publiées sans l'Admin
--    (zfind_admin_transition_listing) : l'Admin vérifie la carte
--    professionnelle avec zfind_admin_review_signup().
-- 4. Places « Fondateur » : 50 premières agences par pays (1re vague),
--    puis 2e vague ; 10 promoteurs fondateurs.
-- ============================================================

create table if not exists public.zfind_partner_signups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  partner_id uuid references public.partners(id),
  agencia_id uuid references public.zfind_agencias(id) on delete set null,
  role text not null check (role in ('agency', 'promoter')),
  country text not null check (country in ('FR', 'BE', 'LU')),
  company_id text,
  establishment_id text,
  legal_name text not null,
  trade_name text,
  address text,
  postcode text,
  city text,
  phone text,
  email text not null,
  website text,
  card_number text not null,
  card_authority text,
  plan text not null check (plan in ('founder', 'founder_developer', 'standard')),
  founder_wave smallint check (founder_wave in (1, 2)),
  terms_accepted_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  review_note text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create unique index if not exists zfind_partner_signups_establishment_uq
  on public.zfind_partner_signups (country, establishment_id)
  where establishment_id is not null and status <> 'rejected';
create index if not exists zfind_partner_signups_status_idx on public.zfind_partner_signups (status, created_at desc);
create index if not exists zfind_agencias_company_idx on public.zfind_agencias (country, company_id);

alter table public.zfind_partner_signups enable row level security;
revoke all on table public.zfind_partner_signups from anon, authenticated;
grant select on table public.zfind_partner_signups to authenticated;
grant all on table public.zfind_partner_signups to service_role;

drop policy if exists "signup: own read" on public.zfind_partner_signups;
create policy "signup: own read" on public.zfind_partner_signups
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "signup: admin read" on public.zfind_partner_signups;
create policy "signup: admin read" on public.zfind_partner_signups
  for select to authenticated using (public.is_admin());

-- ------------------------------------------------------------ registry lookup
create or replace function public.zfind_registry_lookup(p_country text, p_number text)
returns table (
  agencia_id uuid,
  establishment_id text,
  company_id text,
  name text,
  trade_name text,
  legal_form text,
  is_head_office boolean,
  is_natural_person boolean,
  address text,
  postcode text,
  city text,
  network text,
  already_registered boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_country text := upper(coalesce(p_country, ''));
  v_digits text := regexp_replace(coalesce(p_number, ''), '\D', '', 'g');
  v_company text;
  v_establishment text;
begin
  if v_country = 'FR' then
    if length(v_digits) = 14 then
      v_establishment := v_digits;
      v_company := left(v_digits, 9);
    elsif length(v_digits) = 9 then
      v_company := v_digits;
    else
      return;
    end if;
  elsif v_country = 'BE' then
    if length(v_digits) = 9 then v_digits := '0' || v_digits; end if;
    if length(v_digits) <> 10 then return; end if;
    v_company := v_digits;
  else
    return; -- LU : pas de registre chargé, saisie manuelle
  end if;

  return query
  select a.id,
         case when a.source = 'sirene' then a.source_id else null end,
         a.company_id,
         a.name,
         a.trade_name,
         a.legal_form,
         a.is_head_office,
         a.is_natural_person,
         a.address,
         a.postcode,
         a.city,
         a.network,
         exists (
           select 1 from public.zfind_partner_signups s
           where s.status <> 'rejected'
             and s.country = a.country
             and (s.agencia_id = a.id or (a.source = 'sirene' and s.establishment_id = a.source_id))
         )
  from public.zfind_agencias a
  where a.country = v_country
    and a.active
    and (a.company_id = v_company
         or (v_country = 'BE' and regexp_replace(a.company_id, '\D', '', 'g') = v_company))
    and (v_establishment is null or a.source_id = v_establishment)
  order by a.is_head_office desc nulls last, a.postcode, a.name
  limit 50;
end;
$$;

revoke all on function public.zfind_registry_lookup(text, text) from public;
grant execute on function public.zfind_registry_lookup(text, text) to anon, authenticated;

-- ------------------------------------------------------------ complete signup
create or replace function public.zfind_partner_complete_signup()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_user auth.users%rowtype;
  v_meta jsonb;
  v_profile public.profiles%rowtype;
  v_existing public.zfind_partner_signups%rowtype;
  v_role text;
  v_country text;
  v_legal text;
  v_trade text;
  v_card text;
  v_establishment text;
  v_company text;
  v_agencia uuid;
  v_plan text;
  v_wave smallint;
  v_taken int;
  v_partner uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_existing from public.zfind_partner_signups where user_id = v_uid;
  if found then
    return jsonb_build_object('status', 'existing', 'partner_id', v_existing.partner_id,
      'plan', v_existing.plan, 'founder_wave', v_existing.founder_wave, 'review', v_existing.status);
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if found and (v_profile.role = 'admin' or v_profile.partner_id is not null) then
    return jsonb_build_object('status', 'not_applicable');
  end if;

  select * into v_user from auth.users where id = v_uid;
  v_meta := coalesce(v_user.raw_user_meta_data -> 'zfind_signup', '{}'::jsonb);
  if v_meta = '{}'::jsonb then
    return jsonb_build_object('status', 'no_signup');
  end if;

  v_role := v_meta ->> 'role';
  v_country := upper(coalesce(v_meta ->> 'country', ''));
  v_legal := left(btrim(coalesce(v_meta ->> 'legal_name', '')), 200);
  v_trade := nullif(left(btrim(coalesce(v_meta ->> 'trade_name', '')), 200), '');
  v_card := left(btrim(coalesce(v_meta ->> 'card_number', '')), 60);
  v_establishment := nullif(regexp_replace(coalesce(v_meta ->> 'establishment_id', ''), '\D', '', 'g'), '');
  v_company := nullif(left(btrim(coalesce(v_meta ->> 'company_id', '')), 40), '');

  if v_role not in ('agency', 'promoter') or v_country not in ('FR', 'BE', 'LU')
     or v_legal = '' or v_card = '' or coalesce((v_meta ->> 'terms_accepted')::boolean, false) is not true then
    raise exception 'invalid_signup' using errcode = '22023';
  end if;
  if v_country = 'FR' and (v_establishment is null or length(v_establishment) <> 14) then
    raise exception 'invalid_siret' using errcode = '22023';
  end if;
  if v_establishment is not null and exists (
       select 1 from public.zfind_partner_signups
       where country = v_country and establishment_id = v_establishment and status <> 'rejected') then
    raise exception 'already_registered' using errcode = '23505';
  end if;

  if v_country = 'FR' then
    v_company := left(v_establishment, 9);
    select id into v_agencia from public.zfind_agencias
      where country = 'FR' and source = 'sirene' and source_id = v_establishment limit 1;
  elsif (v_meta ->> 'agencia_id') ~ '^[0-9a-f-]{36}$' then
    select id into v_agencia from public.zfind_agencias
      where id = (v_meta ->> 'agencia_id')::uuid and country = v_country limit 1;
  end if;

  -- Places Fondateur : verrou par pays pour un comptage exact.
  perform pg_advisory_xact_lock(hashtext('zfind_founder_seats_' || v_country || '_' || v_role));
  if v_role = 'agency' then
    select count(*) into v_taken from public.zfind_partner_signups
      where country = v_country and role = 'agency' and plan = 'founder' and founder_wave = 1 and status <> 'rejected';
    v_plan := 'founder';
    v_wave := case when v_taken < 50 then 1 else 2 end;
  else
    select count(*) into v_taken from public.zfind_partner_signups
      where role = 'promoter' and plan = 'founder_developer' and status <> 'rejected';
    v_plan := case when v_taken < 10 then 'founder_developer' else 'standard' end;
    v_wave := null;
  end if;

  insert into public.partners (name, role, status)
    values (coalesce(v_trade, v_legal), v_role, 'active')
    returning id into v_partner;

  if v_profile.id is not null then
    update public.profiles set partner_id = v_partner, role = 'partner_user' where id = v_uid;
  else
    insert into public.profiles (id, partner_id, role) values (v_uid, v_partner, 'partner_user');
  end if;

  insert into public.zfind_partner_signups (
    user_id, partner_id, agencia_id, role, country, company_id, establishment_id,
    legal_name, trade_name, address, postcode, city, phone, email, website,
    card_number, card_authority, plan, founder_wave, terms_accepted_at)
  values (
    v_uid, v_partner, v_agencia, v_role, v_country, v_company, v_establishment,
    v_legal, v_trade,
    nullif(left(btrim(coalesce(v_meta ->> 'address', '')), 300), ''),
    nullif(left(btrim(coalesce(v_meta ->> 'postcode', '')), 12), ''),
    nullif(left(btrim(coalesce(v_meta ->> 'city', '')), 120), ''),
    nullif(left(btrim(coalesce(v_meta ->> 'phone', '')), 40), ''),
    v_user.email,
    nullif(left(btrim(coalesce(v_meta ->> 'website', '')), 300), ''),
    v_card,
    nullif(left(btrim(coalesce(v_meta ->> 'card_authority', '')), 120), ''),
    v_plan, v_wave, now());

  return jsonb_build_object('status', 'created', 'partner_id', v_partner, 'plan', v_plan,
    'founder_wave', v_wave, 'review', 'pending');
end;
$$;

revoke all on function public.zfind_partner_complete_signup() from public, anon;
grant execute on function public.zfind_partner_complete_signup() to authenticated;

-- ------------------------------------------------------------ admin review
create or replace function public.zfind_admin_review_signup(p_signup_id uuid, p_decision text, p_note text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_signup public.zfind_partner_signups%rowtype;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_decision not in ('verified', 'rejected', 'pending') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;
  update public.zfind_partner_signups
     set status = p_decision,
         review_note = nullif(left(btrim(coalesce(p_note, '')), 500), ''),
         reviewed_at = now(),
         reviewed_by = auth.uid()
   where id = p_signup_id
   returning * into v_signup;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_signup.partner_id is not null then
    update public.partners set status = case when p_decision = 'rejected' then 'inactive' else 'active' end
     where id = v_signup.partner_id;
  end if;
  return jsonb_build_object('id', v_signup.id, 'status', v_signup.status);
end;
$$;

revoke all on function public.zfind_admin_review_signup(uuid, text, text) from public, anon;
grant execute on function public.zfind_admin_review_signup(uuid, text, text) to authenticated;

-- ------------------------------------------------------------ admin overview (+ inscriptions)
create or replace function public.zfind_admin_operations_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'agencias', (
      select jsonb_build_object(
        'total', count(*),
        'active', count(*) filter (where active),
        'with_email', count(*) filter (where active and email is not null),
        'outreach_allowed', count(*) filter (where email_outreach_allowed),
        'do_not_contact', count(*) filter (where do_not_contact),
        'last_ingest', max(last_seen_at)
      ) from public.zfind_agencias
    ),
    'agencias_by_country_type', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'country', country, 'type', type, 'n', n, 'with_email', with_email, 'outreach', outreach
      ) order by country, type), '[]'::jsonb)
      from (
        select country, type, count(*) n,
               count(*) filter (where email is not null) with_email,
               count(*) filter (where email_outreach_allowed) outreach
        from public.zfind_agencias where active group by country, type
      ) s
    ),
    'networks', (
      select coalesce(jsonb_agg(jsonb_build_object('network', network, 'n', n) order by n desc), '[]'::jsonb)
      from (
        select network, count(*) n from public.zfind_agencias
        where active and network is not null group by network order by count(*) desc limit 15
      ) s
    ),
    'reviews', (
      select jsonb_build_object(
        'pending', count(*) filter (where status = 'pending'),
        'published', count(*) filter (where status = 'published'),
        'invited', count(*) filter (where status = 'invited')
      ) from public.zfind_partner_reviews
    ),
    'alerts', (
      select jsonb_build_object(
        'active', count(*) filter (where status = 'active'),
        'pending', count(*) filter (where status = 'pending'),
        'search', count(*) filter (where kind = 'search' and status = 'active'),
        'value', count(*) filter (where kind = 'value' and status = 'active')
      ) from public.zfind_alert_subscriptions
    ),
    'leads', (
      select jsonb_build_object(
        'total', count(*),
        'last_7_days', count(*) filter (where created_at > now() - interval '7 days'),
        'new', count(*) filter (where status = 'new')
      ) from public.leads
    ),
    'signups', (
      select jsonb_build_object(
        'pending', count(*) filter (where status = 'pending'),
        'verified', count(*) filter (where status = 'verified'),
        'founder_seats', jsonb_build_object(
          'FR', count(*) filter (where role = 'agency' and country = 'FR' and founder_wave = 1 and status <> 'rejected'),
          'BE', count(*) filter (where role = 'agency' and country = 'BE' and founder_wave = 1 and status <> 'rejected'),
          'LU', count(*) filter (where role = 'agency' and country = 'LU' and founder_wave = 1 and status <> 'rejected'),
          'developers', count(*) filter (where plan = 'founder_developer' and status <> 'rejected'))
      ) from public.zfind_partner_signups
    )
  ) into result;
  return result;
end;
$$;

revoke all on function public.zfind_admin_operations_overview() from public, anon;
grant execute on function public.zfind_admin_operations_overview() to authenticated;
