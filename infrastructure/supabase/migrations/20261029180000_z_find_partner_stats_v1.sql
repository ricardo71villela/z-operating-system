-- Z Find — statistiques des agences : vues des annonces, demandes de contact,
-- demandes de visite, par mois et par annonce (espace Partner « Statistiques »)
-- et un bilan envoyé chaque mois par e-mail (api/cron-daily.js).
--
-- Les vues sont comptées par jour et par annonce, sans aucune donnée sur le
-- visiteur (ni adresse IP, ni cookie, ni identifiant) : le site appelle
-- zfind_record_listing_view une fois par annonce et par onglet. Seules les
-- annonces publiées sont comptées. Idempotent, sans suppression.

create table if not exists public.zfind_listing_view_days (
  listing_id uuid not null references public.listings(id) on delete cascade,
  day date not null,
  views integer not null default 0 check (views >= 0),
  primary key (listing_id, day)
);
alter table public.zfind_listing_view_days enable row level security;
revoke all on public.zfind_listing_view_days from public, anon, authenticated;
grant select on public.zfind_listing_view_days to service_role;

-- Bilans mensuels déjà envoyés (un par agence et par mois).
create table if not exists public.zfind_partner_stats_reports (
  partner_id uuid not null references public.partners(id) on delete cascade,
  month date not null,
  sent_at timestamptz not null default now(),
  primary key (partner_id, month)
);
alter table public.zfind_partner_stats_reports enable row level security;
revoke all on public.zfind_partner_stats_reports from public, anon, authenticated;
grant select, insert on public.zfind_partner_stats_reports to service_role;

-- Une vue d'annonce (appelée par le site, sans connexion).
create or replace function public.zfind_record_listing_view(p_listing_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if p_listing_id is null then return; end if;
  if not exists (select 1 from public.listings l where l.id = p_listing_id and l.status = 'published') then return; end if;
  insert into public.zfind_listing_view_days as v (listing_id, day, views)
  values (p_listing_id, (now() at time zone 'Europe/Paris')::date, 1)
  on conflict (listing_id, day) do update set views = least(v.views + 1, 1000000);
end;
$$;
revoke all on function public.zfind_record_listing_view(uuid) from public;
grant execute on function public.zfind_record_listing_view(uuid) to anon, authenticated;

-- Chiffres d'une agence pour un intervalle de mois (fin exclue).
create or replace function public.zfind_partner_stats_range(p_partner_id uuid, p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select li.id, li.status, li.created_at,
           coalesce(
             (select c.title from public.listing_content c where c.listing_id = li.id and c.locale = 'fr' and nullif(btrim(c.title), '') is not null limit 1),
             (select c.title from public.listing_content c where c.listing_id = li.id and nullif(btrim(c.title), '') is not null order by c.locale limit 1),
             (select d.name from public.developments d where d.id = r.development_id),
             (select nullif(p.agency_reference, '') from public.properties p where p.id = r.property_id),
             'Annonce'
           ) as title
      from public.listings li
      join public.representations r on r.id = li.representation_id
     where r.partner_id = p_partner_id
  ), months as (
    select generate_series(date_trunc('month', p_from::timestamp), date_trunc('month', (p_to - 1)::timestamp), interval '1 month')::date as month
  ), views as (
    select date_trunc('month', v.day::timestamp)::date as month, v.listing_id, sum(v.views)::int as n
      from public.zfind_listing_view_days v join mine m on m.id = v.listing_id
     where v.day >= p_from and v.day < p_to
     group by 1, 2
  ), contacts as (
    select date_trunc('month', (l.created_at at time zone 'Europe/Paris'))::date as month, l.listing_id, count(*)::int as n
      from public.leads l join mine m on m.id = l.listing_id
     where l.created_at >= p_from and l.created_at < p_to
       and not exists (select 1 from public.zfind_visit_requests vr where vr.lead_id = l.id)
     group by 1, 2
  ), visits as (
    select date_trunc('month', (vr.created_at at time zone 'Europe/Paris'))::date as month, vr.listing_id, count(*)::int as n
      from public.zfind_visit_requests vr join mine m on m.id = vr.listing_id
     where vr.created_at >= p_from and vr.created_at < p_to
     group by 1, 2
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'published', (select count(*) from mine where status = 'published'),
    'months', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', mo.month,
        'views', coalesce((select sum(n) from views v where v.month = mo.month), 0),
        'contacts', coalesce((select sum(n) from contacts c where c.month = mo.month), 0),
        'visits', coalesce((select sum(n) from visits x where x.month = mo.month), 0)
      ) order by mo.month) from months mo), '[]'::jsonb),
    'listings', coalesce((
      select jsonb_agg(item order by (item->>'views')::int desc, item->>'title')
        from (
          select jsonb_build_object(
            'listing_id', m.id, 'title', m.title, 'status', m.status,
            'views', coalesce((select sum(n) from views v where v.listing_id = m.id), 0),
            'contacts', coalesce((select sum(n) from contacts c where c.listing_id = m.id), 0),
            'visits', coalesce((select sum(n) from visits x where x.listing_id = m.id), 0)
          ) as item
            from mine m
           where m.status = 'published'
              or exists (select 1 from views v where v.listing_id = m.id)
              or exists (select 1 from contacts c where c.listing_id = m.id)
              or exists (select 1 from visits x where x.listing_id = m.id)
        ) t), '[]'::jsonb)
  );
$$;
revoke all on function public.zfind_partner_stats_range(uuid, date, date) from public, anon, authenticated;
grant execute on function public.zfind_partner_stats_range(uuid, date, date) to service_role;

-- Espace Partner : les p_months derniers mois (mois en cours compris) de l'agence connectée.
create or replace function public.zfind_partner_stats(p_months integer default 6)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_partner uuid;
  v_months int := greatest(1, least(coalesce(p_months, 6), 24));
  v_to date := (date_trunc('month', now() at time zone 'Europe/Paris') + interval '1 month')::date;
begin
  select partner_id into v_partner from public.profiles where id = auth.uid() and role = 'partner_user' and partner_id is not null;
  if v_partner is null then
    raise exception 'Accès réservé aux comptes agence.' using errcode = '42501';
  end if;
  return public.zfind_partner_stats_range(v_partner, (v_to - make_interval(months => v_months))::date, v_to);
end;
$$;
revoke all on function public.zfind_partner_stats(integer) from public, anon;
grant execute on function public.zfind_partner_stats(integer) to authenticated;

-- Bilan mensuel (serveur) : agences actives pas encore servies pour ce mois.
create or replace function public.zfind_pending_monthly_stats(p_month date)
returns table (partner_id uuid, partner_name text, stats jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select pa.id, pa.name,
         public.zfind_partner_stats_range(pa.id, date_trunc('month', p_month::timestamp)::date, (date_trunc('month', p_month::timestamp) + interval '1 month')::date)
    from public.partners pa
   where pa.status = 'active'
     and not exists (select 1 from public.zfind_partner_stats_reports s where s.partner_id = pa.id and s.month = date_trunc('month', p_month::timestamp)::date)
     and exists (select 1 from public.representations r join public.listings li on li.representation_id = r.id where r.partner_id = pa.id and li.status = 'published');
$$;
revoke all on function public.zfind_pending_monthly_stats(date) from public, anon, authenticated;
grant execute on function public.zfind_pending_monthly_stats(date) to service_role;
