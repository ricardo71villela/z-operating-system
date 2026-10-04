-- ============================================================
-- Z FIND — Demandes : avis immédiat à l'agence + comptage par agence
--
-- 1. leads.notified_at / notify_attempts : chaque demande d'acheteur ou
--    de locataire sur une annonce est envoyée par e-mail à l'agence qui la
--    représente (fonction /api/lead-notify du site, déclenchée juste après
--    l'envoi du formulaire, et rattrapage quotidien par /api/cron-daily).
-- 2. zfind_pending_lead_notifications() / zfind_mark_leads_notified() :
--    réservées au serveur (service_role) ; adresses des comptes de
--    l'agence lues dans auth.users, jamais exposées au navigateur.
-- 3. zfind_partner_lead_stats() : l'agence voit ses demandes reçues depuis
--    l'inscription et pendant sa période gratuite (règle Fondateur :
--    moins de 5 demandes en 3 mois → 3 mois offerts de plus).
-- 4. zfind_admin_signup_lead_counts() : les mêmes chiffres dans l'Admin.
-- La table leads est partagée avec Z Desk : seules les demandes liées à
-- une annonce Z Find (listings → representations) sont concernées.
-- ============================================================

alter table public.leads add column if not exists notified_at timestamptz;
alter table public.leads add column if not exists notify_attempts smallint not null default 0;
create index if not exists leads_pending_notify_idx on public.leads (created_at) where notified_at is null;

-- ------------------------------------------------------------ pending (server only)
create or replace function public.zfind_pending_lead_notifications(p_limit integer default 20)
returns table (
  lead_id uuid,
  created_at timestamptz,
  contact_type text,
  name text,
  email text,
  phone text,
  message text,
  listing_id uuid,
  listing_title text,
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
  select l.id, l.created_at, l.contact_type, l.name, l.email, l.phone, l.message,
         li.id,
         (select lc.title from public.listing_content lc
           where lc.listing_id = li.id and coalesce(btrim(lc.title), '') <> ''
           order by (lc.locale = 'fr') desc, lc.locale limit 1),
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
    from public.leads l
    join public.listings li on li.id = l.listing_id
    join public.representations r on r.id = li.representation_id
    left join public.partners pa on pa.id = r.partner_id
   where l.notified_at is null
     and l.notify_attempts < 5
     and l.created_at > now() - interval '7 days'
   order by l.created_at
   limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

revoke all on function public.zfind_pending_lead_notifications(integer) from public, anon, authenticated;
grant execute on function public.zfind_pending_lead_notifications(integer) to service_role;

create or replace function public.zfind_mark_leads_notified(p_ids uuid[], p_delivered boolean)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.leads
     set notified_at = case when p_delivered then now() else notified_at end,
         notify_attempts = notify_attempts + case when p_delivered then 0 else 1 end
   where id = any (coalesce(p_ids, '{}'::uuid[])) and notified_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.zfind_mark_leads_notified(uuid[], boolean) from public, anon, authenticated;
grant execute on function public.zfind_mark_leads_notified(uuid[], boolean) to service_role;

-- ------------------------------------------------------------ partner stats
create or replace function public.zfind_partner_lead_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_partner uuid;
  v_since timestamptz;
  v_result jsonb;
begin
  select partner_id into v_partner from public.profiles where id = auth.uid() and role = 'partner_user';
  if v_partner is null then
    return null;
  end if;
  select created_at into v_since from public.zfind_partner_signups where partner_id = v_partner order by created_at limit 1;

  select jsonb_build_object(
    'total', count(*),
    'last_30_days', count(*) filter (where l.created_at > now() - interval '30 days'),
    'since_signup', count(*) filter (where v_since is not null and l.created_at >= v_since),
    'free_period', count(*) filter (where v_since is not null and l.created_at >= v_since and l.created_at < v_since + interval '3 months'),
    'signup_at', v_since,
    'free_period_ends', v_since + interval '3 months'
  ) into v_result
    from public.leads l
    join public.listings li on li.id = l.listing_id
    join public.representations r on r.id = li.representation_id
   where r.partner_id = v_partner;
  return v_result;
end;
$$;

revoke all on function public.zfind_partner_lead_stats() from public, anon;
grant execute on function public.zfind_partner_lead_stats() to authenticated;

-- ------------------------------------------------------------ admin counts
create or replace function public.zfind_admin_signup_lead_counts()
returns table (signup_id uuid, leads_total bigint, leads_free_period bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select s.id,
         count(l.id),
         count(l.id) filter (where l.created_at >= s.created_at and l.created_at < s.created_at + interval '3 months')
    from public.zfind_partner_signups s
    left join public.representations r on r.partner_id = s.partner_id
    left join public.listings li on li.representation_id = r.id
    left join public.leads l on l.listing_id = li.id
   group by s.id;
end;
$$;

revoke all on function public.zfind_admin_signup_lead_counts() from public, anon;
grant execute on function public.zfind_admin_signup_lead_counts() to authenticated;
