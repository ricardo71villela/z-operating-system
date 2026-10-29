-- ============================================================
-- Z Find — mises en avant « À la une » et « Agence à la une » v1
--
-- Offre publique (src/services/pro-offer.js) :
--   * mise en avant d'une annonce : 7 jours (9 € HT), 30 jours (29 € HT),
--     pack de 5 mises en avant de 30 jours (119 € HT) ; Pro : 1 par mois
--     incluse, Premium : 3 par mois incluses ;
--   * Agence à la une : 99 € HT par commune et par mois.
--
-- Règles :
--   * une mise en avant appartient à la commune de l'annonce
--     (scope_key 'FR:74010', ou 'zone:<id>' sans code commune) ;
--     6 emplacements par commune (la page de la commune en montre 6) ;
--     la page marché du pays et la colonne de la recherche montrent, en
--     rotation, les mises en avant actives du pays ;
--   * Agence à la une : 1 agence par commune et par mois (communes
--     françaises : pages « Immobilier à » et « Agences immobilières à ») ;
--   * complet → la première date (ou le premier mois) libre est proposée ;
--   * pendant le paiement Stripe, l'emplacement est réservé 35 minutes
--     (« held ») ; payé → « scheduled » ; abandon → « canceled » ;
--     prélèvement SEPA en cours → réservation prolongée de 10 jours ;
--   * jamais mélangées aux résultats de recherche, toujours signalées.
-- Idempotent, sans suppression.
-- ============================================================

-- ------------------------------------------------------------ tables
create table if not exists public.zfind_highlights (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  scope_key text not null check (char_length(scope_key) between 3 and 60),
  country_iso text,
  starts_on date not null,
  ends_on date not null,
  source text not null check (source in ('order', 'pack', 'included')),
  order_id uuid references public.zfind_billing_orders(id) on delete set null,
  included_month date,
  status text not null default 'held' check (status in ('held', 'scheduled', 'canceled')),
  hold_expires_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_on > starts_on and ends_on <= starts_on + 31)
);
create index if not exists zfind_highlights_scope_idx on public.zfind_highlights (scope_key, starts_on, ends_on) where status <> 'canceled';
create index if not exists zfind_highlights_partner_idx on public.zfind_highlights (partner_id, starts_on desc);
create index if not exists zfind_highlights_order_idx on public.zfind_highlights (order_id);

create table if not exists public.zfind_agency_features (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  commune_code text not null check (commune_code ~ '^(2A|2B|\d{2})\d{3}$|^97[1-6]\d{2}$'),
  month date not null check (extract(day from month) = 1),
  order_id uuid references public.zfind_billing_orders(id) on delete set null,
  status text not null default 'held' check (status in ('held', 'scheduled', 'canceled')),
  hold_expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists zfind_agency_features_slot_idx on public.zfind_agency_features (commune_code, month) where status <> 'canceled';
create index if not exists zfind_agency_features_order_idx on public.zfind_agency_features (order_id);

alter table public.zfind_highlights enable row level security;
alter table public.zfind_agency_features enable row level security;
revoke all on public.zfind_highlights, public.zfind_agency_features from public, anon, authenticated;
grant select, insert, update on public.zfind_highlights, public.zfind_agency_features to service_role;

-- Une commande peut rester « en traitement » (prélèvement SEPA) : statut ajouté.
alter table public.zfind_billing_orders drop constraint if exists zfind_billing_orders_status_check;
alter table public.zfind_billing_orders add constraint zfind_billing_orders_status_check
  check (status in ('pending', 'processing', 'paid', 'failed', 'canceled', 'refunded'));

-- ------------------------------------------------------------ règles
create or replace function public.zfind_highlight_capacity() returns integer language sql immutable as $$ select 6 $$;
create or replace function public.zfind_agency_feature_capacity() returns integer language sql immutable as $$ select 1 $$;
create or replace function public.zfind_paris_today() returns date language sql stable as $$ select (now() at time zone 'Europe/Paris')::date $$;

-- Annonce → agence, commune, statut, titre.
create or replace function public.zfind_listing_scope(p_listing_id uuid)
returns table (listing_id uuid, partner_id uuid, scope_key text, country_iso text, commune_code text, commune_name text, status text, title text, property_id uuid, development_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select li.id, r.partner_id,
         case when z.commune_code is not null and z.country_iso is not null then z.country_iso || ':' || z.commune_code
              when z.id is not null then 'zone:' || z.id::text end,
         z.country_iso, z.commune_code, coalesce(z.city, z.name), li.status,
         coalesce(
           (select c.title from public.listing_content c where c.listing_id = li.id and c.locale = 'fr' and nullif(btrim(c.title), '') is not null limit 1),
           (select c.title from public.listing_content c where c.listing_id = li.id and nullif(btrim(c.title), '') is not null order by c.locale limit 1),
           (select d2.name from public.developments d2 where d2.id = r.development_id),
           nullif(p.agency_reference, ''),
           'Annonce'
         ),
         r.property_id, r.development_id
    from public.listings li
    join public.representations r on r.id = li.representation_id
    left join public.properties p on p.id = r.property_id
    left join public.developments d on d.id = coalesce(r.development_id, p.development_id)
    left join public.zones_lite z on z.id = coalesce(p.zone_lite_id, d.zone_lite_id)
   where li.id = p_listing_id;
$$;
revoke all on function public.zfind_listing_scope(uuid) from public, anon, authenticated;

-- Une réservation compte tant qu'elle est payée ou en cours de paiement.
create or replace function public.zfind_highlight_window_free(p_scope text, p_listing uuid, p_start date, p_days integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
      select 1 from public.zfind_highlights h
       where h.listing_id = p_listing and h.starts_on < p_start + p_days and h.ends_on > p_start
         and (h.status = 'scheduled' or (h.status = 'held' and h.hold_expires_at > now())))
     and not exists (
      select 1 from generate_series(p_start, p_start + p_days - 1, interval '1 day') d
       where (select count(*) from public.zfind_highlights h
               where h.scope_key = p_scope and h.starts_on <= d::date and h.ends_on > d::date
                 and (h.status = 'scheduled' or (h.status = 'held' and h.hold_expires_at > now())))
             >= public.zfind_highlight_capacity());
$$;
revoke all on function public.zfind_highlight_window_free(text, uuid, date, integer) from public, anon, authenticated;

-- Première date libre à partir de p_from (null si rien dans l'année).
create or replace function public.zfind_highlight_next_start(p_scope text, p_listing uuid, p_from date, p_days integer)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d date;
begin
  for i in 0..365 loop
    d := p_from + i;
    if public.zfind_highlight_window_free(p_scope, p_listing, d, p_days) then return d; end if;
  end loop;
  return null;
end;
$$;
revoke all on function public.zfind_highlight_next_start(text, uuid, date, integer) from public, anon, authenticated;

create or replace function public.zfind_agency_feature_free(p_commune text, p_month date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*) from public.zfind_agency_features f
           where f.commune_code = p_commune and f.month = p_month
             and (f.status = 'scheduled' or (f.status = 'held' and f.hold_expires_at > now())))
         < public.zfind_agency_feature_capacity();
$$;
revoke all on function public.zfind_agency_feature_free(text, date) from public, anon, authenticated;

create or replace function public.zfind_agency_feature_next_month(p_commune text, p_from date)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m date := date_trunc('month', p_from)::date;
begin
  for i in 0..24 loop
    if public.zfind_agency_feature_free(p_commune, (m + make_interval(months => i))::date) then
      return (m + make_interval(months => i))::date;
    end if;
  end loop;
  return null;
end;
$$;
revoke all on function public.zfind_agency_feature_next_month(text, date) from public, anon, authenticated;

-- Crédits : inclus (Pro 1 / Premium 3 par mois civil, abonnement actif ou en essai) et packs payés.
create or replace function public.zfind_partner_highlight_credits(p_partner uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with month as (select date_trunc('month', public.zfind_paris_today())::date as m),
  sub as (
    select case when s.status in ('active', 'trialing') then case s.tier when 'pro' then 1 when 'premium' then 3 else 0 end else 0 end as n, s.tier, s.status
      from public.zfind_billing_subscriptions s where s.partner_id = p_partner
  )
  select jsonb_build_object(
    'month', (select m from month),
    'included_per_month', coalesce((select n from sub), 0),
    'included_used', (select count(*) from public.zfind_highlights h where h.partner_id = p_partner and h.source = 'included'
                        and h.included_month = (select m from month) and h.status <> 'canceled'),
    'pack_total', coalesce((select sum(o.quantity * 5) from public.zfind_billing_orders o
                             where o.partner_id = p_partner and o.kind = 'highlight_pack' and o.status = 'paid'), 0),
    'pack_used', (select count(*) from public.zfind_highlights h where h.partner_id = p_partner and h.source = 'pack' and h.status <> 'canceled'),
    'tier', (select tier from sub), 'subscription_status', (select status from sub)
  );
$$;
revoke all on function public.zfind_partner_highlight_credits(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------ réservation (interne)
-- p_hold : réservation de paiement (35 min) ; sinon directement « scheduled » (crédit).
create or replace function public.zfind_book_highlight(
  p_partner uuid, p_listing uuid, p_start date, p_days integer, p_source text,
  p_order uuid default null, p_included_month date default null, p_hold boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v record;
  v_today date := public.zfind_paris_today();
  v_next date;
  v_id uuid;
begin
  if p_days not in (7, 30) then raise exception 'highlight_duration' using errcode = '22023'; end if;
  select * into v from public.zfind_listing_scope(p_listing);
  if v.listing_id is null or v.partner_id is distinct from p_partner then
    raise exception 'highlight_listing' using errcode = '42501';
  end if;
  if v.status <> 'published' then raise exception 'highlight_not_published' using errcode = '22023'; end if;
  if v.scope_key is null then raise exception 'highlight_no_commune' using errcode = '22023'; end if;
  if p_start is null or p_start < v_today or p_start > v_today + 365 then
    raise exception 'highlight_start' using errcode = '22023';
  end if;
  -- Une seule réservation à la fois par commune (pas de double vente du dernier emplacement).
  perform pg_advisory_xact_lock(hashtext('zfind_highlight:' || v.scope_key));
  if not public.zfind_highlight_window_free(v.scope_key, p_listing, p_start, p_days) then
    v_next := public.zfind_highlight_next_start(v.scope_key, p_listing, p_start, p_days);
    return jsonb_build_object('ok', false, 'error', 'full', 'next_start', v_next,
                              'next_end', case when v_next is null then null else v_next + p_days end);
  end if;
  insert into public.zfind_highlights (partner_id, listing_id, scope_key, country_iso, starts_on, ends_on, source, order_id, included_month, status, hold_expires_at)
  values (p_partner, p_listing, v.scope_key, v.country_iso, p_start, p_start + p_days, p_source, p_order, p_included_month,
          case when p_hold then 'held' else 'scheduled' end, case when p_hold then now() + interval '35 minutes' else null end)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'starts_on', p_start, 'ends_on', p_start + p_days, 'commune', v.commune_name, 'title', v.title);
end;
$$;
revoke all on function public.zfind_book_highlight(uuid, uuid, date, integer, text, uuid, date, boolean) from public, anon, authenticated;

create or replace function public.zfind_partner_me()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select partner_id from public.profiles where id = auth.uid() and role = 'partner_user' and partner_id is not null;
$$;
revoke all on function public.zfind_partner_me() from public, anon, authenticated;

-- ------------------------------------------------------------ espace Partner
create or replace function public.zfind_partner_highlights_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_partner uuid := public.zfind_partner_me();
  v_today date := public.zfind_paris_today();
begin
  if v_partner is null then raise exception 'Accès réservé aux comptes agence.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'today', v_today,
    'capacity', public.zfind_highlight_capacity(),
    'credits', public.zfind_partner_highlight_credits(v_partner),
    'partner_status', (select status from public.partners where id = v_partner),
    'listings', coalesce((
      select jsonb_agg(jsonb_build_object('listing_id', s.listing_id, 'title', s.title, 'commune', s.commune_name,
                                          'commune_code', s.commune_code, 'country', s.country_iso, 'has_scope', s.scope_key is not null)
                       order by s.commune_name, s.title)
        from public.listings li
        join public.representations r on r.id = li.representation_id
        cross join lateral public.zfind_listing_scope(li.id) s
       where r.partner_id = v_partner and li.status = 'published'), '[]'::jsonb),
    'communes', coalesce((
      select jsonb_agg(distinct jsonb_build_object('commune_code', s.commune_code, 'name', s.commune_name))
        from public.listings li
        join public.representations r on r.id = li.representation_id
        cross join lateral public.zfind_listing_scope(li.id) s
       where r.partner_id = v_partner and li.status in ('published', 'ready', 'pending_review')
         and s.country_iso = 'FR' and s.commune_code is not null), '[]'::jsonb),
    'highlights', coalesce((
      select jsonb_agg(jsonb_build_object('id', h.id, 'listing_id', h.listing_id, 'title', s.title, 'commune', s.commune_name,
                                          'starts_on', h.starts_on, 'ends_on', h.ends_on, 'source', h.source,
                                          'state', case when h.status = 'held' then 'payment'
                                                        when h.starts_on > v_today then 'upcoming'
                                                        when h.ends_on > v_today then 'live' else 'ended' end,
                                          'can_cancel', h.source in ('pack', 'included') and h.starts_on > v_today)
                       order by h.starts_on desc)
        from public.zfind_highlights h
        cross join lateral public.zfind_listing_scope(h.listing_id) s
       where h.partner_id = v_partner and h.ends_on > v_today - 90
         and (h.status = 'scheduled' or (h.status = 'held' and h.hold_expires_at > now()))), '[]'::jsonb),
    'agency_features', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'commune_code', f.commune_code, 'month', f.month,
                                          'state', case when f.status = 'held' then 'payment'
                                                        when f.month > date_trunc('month', v_today)::date then 'upcoming'
                                                        when f.month = date_trunc('month', v_today)::date then 'live' else 'ended' end)
                       order by f.month desc)
        from public.zfind_agency_features f
       where f.partner_id = v_partner and f.month >= (date_trunc('month', v_today) - interval '3 months')::date
         and (f.status = 'scheduled' or (f.status = 'held' and f.hold_expires_at > now()))), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.zfind_partner_highlights_overview() from public, anon;
grant execute on function public.zfind_partner_highlights_overview() to authenticated;

-- Disponibilité d'une mise en avant (lecture seule).
create or replace function public.zfind_partner_highlight_quote(p_listing uuid, p_days integer, p_start date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_partner uuid := public.zfind_partner_me();
  v record;
  v_next date;
begin
  if v_partner is null then raise exception 'Accès réservé aux comptes agence.' using errcode = '42501'; end if;
  if p_days not in (7, 30) then raise exception 'highlight_duration' using errcode = '22023'; end if;
  select * into v from public.zfind_listing_scope(p_listing);
  if v.listing_id is null or v.partner_id is distinct from v_partner then raise exception 'highlight_listing' using errcode = '42501'; end if;
  if v.status <> 'published' then return jsonb_build_object('ok', false, 'error', 'not_published'); end if;
  if v.scope_key is null then return jsonb_build_object('ok', false, 'error', 'no_commune'); end if;
  if p_start is null or p_start < public.zfind_paris_today() or p_start > public.zfind_paris_today() + 365 then
    return jsonb_build_object('ok', false, 'error', 'start');
  end if;
  if public.zfind_highlight_window_free(v.scope_key, p_listing, p_start, p_days) then
    return jsonb_build_object('ok', true, 'starts_on', p_start, 'ends_on', p_start + p_days, 'commune', v.commune_name);
  end if;
  v_next := public.zfind_highlight_next_start(v.scope_key, p_listing, p_start, p_days);
  return jsonb_build_object('ok', false, 'error', 'full', 'commune', v.commune_name, 'next_start', v_next,
                            'next_end', case when v_next is null then null else v_next + p_days end);
end;
$$;
revoke all on function public.zfind_partner_highlight_quote(uuid, integer, date) from public, anon;
grant execute on function public.zfind_partner_highlight_quote(uuid, integer, date) to authenticated;

-- Utiliser un crédit (inclus ou pack) : mise en avant de 30 jours, sans paiement.
create or replace function public.zfind_partner_use_highlight_credit(p_listing uuid, p_start date, p_source text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_partner uuid := public.zfind_partner_me();
  c jsonb;
begin
  if v_partner is null then raise exception 'Accès réservé aux comptes agence.' using errcode = '42501'; end if;
  if p_source not in ('included', 'pack') then raise exception 'highlight_source' using errcode = '22023'; end if;
  if (select status from public.partners where id = v_partner) <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'partner_not_active');
  end if;
  -- Crédits relus sous verrou : deux clics simultanés ne consomment pas le même crédit.
  perform pg_advisory_xact_lock(hashtext('zfind_highlight_credit:' || v_partner::text));
  c := public.zfind_partner_highlight_credits(v_partner);
  if p_source = 'included' and (c->>'included_used')::int >= (c->>'included_per_month')::int then
    return jsonb_build_object('ok', false, 'error', 'no_credit');
  end if;
  if p_source = 'pack' and (c->>'pack_used')::int >= (c->>'pack_total')::int then
    return jsonb_build_object('ok', false, 'error', 'no_credit');
  end if;
  return public.zfind_book_highlight(v_partner, p_listing, p_start, 30, p_source, null,
                                     case when p_source = 'included' then (c->>'month')::date else null end, false);
end;
$$;
revoke all on function public.zfind_partner_use_highlight_credit(uuid, date, text) from public, anon;
grant execute on function public.zfind_partner_use_highlight_credit(uuid, date, text) to authenticated;

-- Annuler une mise en avant par crédit pas encore commencée : le crédit revient.
create or replace function public.zfind_partner_cancel_highlight(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_partner uuid := public.zfind_partner_me();
begin
  if v_partner is null then raise exception 'Accès réservé aux comptes agence.' using errcode = '42501'; end if;
  update public.zfind_highlights set status = 'canceled'
   where id = p_id and partner_id = v_partner and source in ('pack', 'included')
     and status = 'scheduled' and starts_on > public.zfind_paris_today();
  if not found then raise exception 'highlight_not_cancelable' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.zfind_partner_cancel_highlight(uuid) from public, anon;
grant execute on function public.zfind_partner_cancel_highlight(uuid) to authenticated;

create or replace function public.zfind_partner_agency_feature_quote(p_commune text, p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_partner uuid := public.zfind_partner_me();
  v_month date := date_trunc('month', p_month)::date;
  v_next date;
begin
  if v_partner is null then raise exception 'Accès réservé aux comptes agence.' using errcode = '42501'; end if;
  if p_commune !~ '^(2A|2B|\d{2})\d{3}$|^97[1-6]\d{2}$' then return jsonb_build_object('ok', false, 'error', 'commune'); end if;
  if v_month < date_trunc('month', public.zfind_paris_today())::date or v_month > (date_trunc('month', public.zfind_paris_today()) + interval '12 months')::date then
    return jsonb_build_object('ok', false, 'error', 'month');
  end if;
  if exists (select 1 from public.zfind_agency_features f where f.partner_id = v_partner and f.commune_code = p_commune and f.month = v_month
               and (f.status = 'scheduled' or (f.status = 'held' and f.hold_expires_at > now()))) then
    return jsonb_build_object('ok', false, 'error', 'already_yours');
  end if;
  if public.zfind_agency_feature_free(p_commune, v_month) then return jsonb_build_object('ok', true, 'month', v_month); end if;
  v_next := public.zfind_agency_feature_next_month(p_commune, v_month);
  return jsonb_build_object('ok', false, 'error', 'full', 'next_month', v_next);
end;
$$;
revoke all on function public.zfind_partner_agency_feature_quote(text, date) from public, anon;
grant execute on function public.zfind_partner_agency_feature_quote(text, date) to authenticated;

-- ------------------------------------------------------------ serveur (api/billing.js)
-- Commande + réservation en une transaction. p_kind : highlight_7d | highlight_30d.
create or replace function public.zfind_order_highlight(p_partner uuid, p_listing uuid, p_start date, p_kind text, p_amount_ht_cents integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_order uuid;
  v_days int := case p_kind when 'highlight_7d' then 7 when 'highlight_30d' then 30 end;
  r jsonb;
begin
  if v_days is null then raise exception 'highlight_kind' using errcode = '22023'; end if;
  if (select status from public.partners where id = p_partner) <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'partner_not_active');
  end if;
  insert into public.zfind_billing_orders (partner_id, kind, quantity, amount_ht_cents, status, details)
  values (p_partner, p_kind, 1, p_amount_ht_cents, 'pending', jsonb_build_object('listing_id', p_listing, 'starts_on', p_start, 'days', v_days))
  returning id into v_order;
  r := public.zfind_book_highlight(p_partner, p_listing, p_start, v_days, 'order', v_order, null, true);
  if not (r->>'ok')::boolean then
    update public.zfind_billing_orders set status = 'canceled' where id = v_order;
    return r;
  end if;
  update public.zfind_billing_orders set details = details || jsonb_build_object('title', r->>'title', 'commune', r->>'commune') where id = v_order;
  return r || jsonb_build_object('order_id', v_order);
end;
$$;
revoke all on function public.zfind_order_highlight(uuid, uuid, date, text, integer) from public, anon, authenticated;
grant execute on function public.zfind_order_highlight(uuid, uuid, date, text, integer) to service_role;

create or replace function public.zfind_order_agency_feature(p_partner uuid, p_commune text, p_month date, p_amount_ht_cents integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_order uuid;
  v_month date := date_trunc('month', p_month)::date;
  v_next date;
  v_id uuid;
begin
  if (select status from public.partners where id = p_partner) <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'partner_not_active');
  end if;
  if p_commune !~ '^(2A|2B|\d{2})\d{3}$|^97[1-6]\d{2}$' then raise exception 'agency_feature_commune' using errcode = '22023'; end if;
  if v_month < date_trunc('month', public.zfind_paris_today())::date or v_month > (date_trunc('month', public.zfind_paris_today()) + interval '12 months')::date then
    raise exception 'agency_feature_month' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('zfind_agency_feature:' || p_commune));
  if exists (select 1 from public.zfind_agency_features f where f.partner_id = p_partner and f.commune_code = p_commune and f.month = v_month
               and (f.status = 'scheduled' or (f.status = 'held' and f.hold_expires_at > now()))) then
    return jsonb_build_object('ok', false, 'error', 'already_yours');
  end if;
  if not public.zfind_agency_feature_free(p_commune, v_month) then
    v_next := public.zfind_agency_feature_next_month(p_commune, v_month);
    return jsonb_build_object('ok', false, 'error', 'full', 'next_month', v_next);
  end if;
  insert into public.zfind_billing_orders (partner_id, kind, quantity, amount_ht_cents, status, details)
  values (p_partner, 'agency_featured_month', 1, p_amount_ht_cents, 'pending', jsonb_build_object('commune_code', p_commune, 'month', v_month))
  returning id into v_order;
  insert into public.zfind_agency_features (partner_id, commune_code, month, order_id, status, hold_expires_at)
  values (p_partner, p_commune, v_month, v_order, 'held', now() + interval '35 minutes')
  returning id into v_id;
  return jsonb_build_object('ok', true, 'order_id', v_order, 'id', v_id, 'month', v_month);
end;
$$;
revoke all on function public.zfind_order_agency_feature(uuid, text, date, integer) from public, anon, authenticated;
grant execute on function public.zfind_order_agency_feature(uuid, text, date, integer) to service_role;

create or replace function public.zfind_order_highlight_pack(p_partner uuid, p_amount_ht_cents integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_order uuid;
begin
  if (select status from public.partners where id = p_partner) <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'partner_not_active');
  end if;
  insert into public.zfind_billing_orders (partner_id, kind, quantity, amount_ht_cents, status, details)
  values (p_partner, 'highlight_pack', 1, p_amount_ht_cents, 'pending', jsonb_build_object('credits', 5, 'days', 30))
  returning id into v_order;
  return jsonb_build_object('ok', true, 'order_id', v_order);
end;
$$;
revoke all on function public.zfind_order_highlight_pack(uuid, integer) from public, anon, authenticated;
grant execute on function public.zfind_order_highlight_pack(uuid, integer) to service_role;

create or replace function public.zfind_order_attach_session(p_order uuid, p_session text)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.zfind_billing_orders set stripe_checkout_session_id = p_session where id = p_order and stripe_checkout_session_id is null;
$$;
revoke all on function public.zfind_order_attach_session(uuid, text) from public, anon, authenticated;
grant execute on function public.zfind_order_attach_session(uuid, text) to service_role;

-- Paiement reçu : commande payée, réservations confirmées. Idempotent.
create or replace function public.zfind_order_paid(p_order uuid, p_payment_intent text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  o public.zfind_billing_orders%rowtype;
begin
  select * into o from public.zfind_billing_orders where id = p_order for update;
  if o.id is null then return jsonb_build_object('ok', false, 'error', 'unknown_order'); end if;
  if o.status = 'paid' then return jsonb_build_object('ok', true, 'duplicate', true, 'kind', o.kind); end if;
  update public.zfind_billing_orders set status = 'paid', paid_at = now(), stripe_payment_intent_id = coalesce(p_payment_intent, stripe_payment_intent_id) where id = p_order;
  -- Payé, même si la réservation de 35 min avait expiré : l'emplacement est dû.
  update public.zfind_highlights set status = 'scheduled', hold_expires_at = null where order_id = p_order and status <> 'scheduled';
  update public.zfind_agency_features set status = 'scheduled', hold_expires_at = null where order_id = p_order and status <> 'scheduled';
  return jsonb_build_object('ok', true, 'kind', o.kind, 'partner_id', o.partner_id);
end;
$$;
revoke all on function public.zfind_order_paid(uuid, text) from public, anon, authenticated;
grant execute on function public.zfind_order_paid(uuid, text) to service_role;

-- Prélèvement SEPA en cours : la réservation tient 10 jours.
create or replace function public.zfind_order_processing(p_order uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.zfind_billing_orders set status = 'processing' where id = p_order and status = 'pending';
  update public.zfind_highlights set hold_expires_at = now() + interval '10 days' where order_id = p_order and status = 'held';
  update public.zfind_agency_features set hold_expires_at = now() + interval '10 days' where order_id = p_order and status = 'held';
$$;
revoke all on function public.zfind_order_processing(uuid) from public, anon, authenticated;
grant execute on function public.zfind_order_processing(uuid) to service_role;

-- Paiement abandonné ou refusé : réservation libérée (jamais après paiement).
create or replace function public.zfind_order_released(p_order uuid, p_status text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if p_status not in ('canceled', 'failed') then raise exception 'order_status' using errcode = '22023'; end if;
  update public.zfind_billing_orders set status = p_status where id = p_order and status in ('pending', 'processing');
  if found then
    update public.zfind_highlights set status = 'canceled' where order_id = p_order and status = 'held';
    update public.zfind_agency_features set status = 'canceled' where order_id = p_order and status = 'held';
  end if;
end;
$$;
revoke all on function public.zfind_order_released(uuid, text) from public, anon, authenticated;
grant execute on function public.zfind_order_released(uuid, text) to service_role;

-- ------------------------------------------------------------ site public (sans connexion)
-- Mises en avant actives aujourd'hui (annonce publiée, agence active), dans un ordre tournant.
create or replace function public.zfind_public_highlights(p_country text default null, p_scope text default null, p_limit integer default 60)
returns table (listing_id uuid, property_id uuid, development_id uuid, scope_key text, country_iso text)
language sql
volatile
security definer
set search_path = public
as $$
  select s.listing_id, s.property_id, s.development_id, h.scope_key, h.country_iso
    from public.zfind_highlights h
    join public.partners pa on pa.id = h.partner_id and pa.status = 'active'
    cross join lateral public.zfind_listing_scope(h.listing_id) s
   where h.status = 'scheduled'
     and h.starts_on <= public.zfind_paris_today() and h.ends_on > public.zfind_paris_today()
     and s.status = 'published'
     and (p_country is null or h.country_iso = upper(p_country))
     and (p_scope is null or h.scope_key = p_scope)
   order by random()
   limit greatest(1, least(coalesce(p_limit, 60), 200));
$$;
revoke all on function public.zfind_public_highlights(text, text, integer) from public;
grant execute on function public.zfind_public_highlights(text, text, integer) to anon, authenticated, service_role;

-- Agence à la une de la commune ce mois-ci.
create or replace function public.zfind_public_agency_feature(p_commune text)
returns table (partner_id uuid, name text, slug text, city text, logo_storage_path text)
language sql
stable
security definer
set search_path = public
as $$
  select pa.id, pa.name, case when pr.public_page then pr.slug end, pr.city, pa.logo_storage_path
    from public.zfind_agency_features f
    join public.partners pa on pa.id = f.partner_id and pa.status = 'active'
    left join public.zfind_partner_profiles pr on pr.partner_id = pa.id
   where f.commune_code = upper(p_commune) and f.status = 'scheduled'
     and f.month = date_trunc('month', public.zfind_paris_today())::date
   order by f.created_at
   limit public.zfind_agency_feature_capacity();
$$;
revoke all on function public.zfind_public_agency_feature(text) from public;
grant execute on function public.zfind_public_agency_feature(text) to anon, authenticated, service_role;
