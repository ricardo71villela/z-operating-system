-- ============================================================
-- Z FIND — Fila « À vérifier » : décisions en lot, motif de refus envoyé
-- à l'agence, historique des décisions
--
-- 1. zfind_listing_review_log : une ligne par décision (approuvée /
--    refusée), avec le motif, l'auteur et l'état d'envoi de l'avis à
--    l'agence. Aucune politique RLS : accès uniquement par les fonctions
--    ci-dessous.
-- 2. zfind_admin_review_listings() : l'Admin approuve (→ « prête à
--    publier ») ou refuse (→ « incomplète », motif obligatoire) un lot
--    d'annonces EN VÉRIFICATION, par la même transition que à la main
--    (zfind_admin_transition_listing). Une annonce qui n'est plus en
--    vérification, ou dont la transition échoue, est signalée sans
--    bloquer les autres. Jamais de publication ici.
-- 3. zfind_admin_review_history() : historique lisible par l'Admin.
-- 4. zfind_pending_review_notices() / zfind_mark_review_notices() :
--    réservées au serveur ; l'e-mail à l'agence part par /api/review-notify.
-- ============================================================

create table if not exists public.zfind_listing_review_log (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  decision text not null check (decision in ('approve', 'reject')),
  from_status text,
  to_status text not null,
  reason text,
  decided_by uuid,
  decided_at timestamptz not null default now(),
  notified_at timestamptz,
  notify_attempts smallint not null default 0,
  constraint zfind_listing_review_log_reason_chk check (decision <> 'reject' or length(btrim(coalesce(reason, ''))) > 0)
);
create index if not exists zfind_listing_review_log_listing_idx on public.zfind_listing_review_log (listing_id, decided_at desc);
create index if not exists zfind_listing_review_log_pending_idx on public.zfind_listing_review_log (decided_at) where notified_at is null;
alter table public.zfind_listing_review_log enable row level security;
revoke all on public.zfind_listing_review_log from public, anon, authenticated;

-- ------------------------------------------------------------ decide (admin)
create or replace function public.zfind_admin_review_listings(p_listing_ids uuid[], p_decision text, p_reason text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_ids uuid[];
  v_status text;
  v_to text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_out jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admin role required' using errcode = '42501';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'Invalid decision: %', p_decision using errcode = '22023';
  end if;
  if p_decision = 'reject' and v_reason is null then
    raise exception 'A reason is required to refuse a listing' using errcode = '22023';
  end if;
  if coalesce(array_length(p_listing_ids, 1), 0) = 0 or array_length(p_listing_ids, 1) > 200 then
    raise exception 'Between 1 and 200 listings are required' using errcode = '22023';
  end if;
  v_to := case p_decision when 'approve' then 'ready' else 'incomplete' end;
  v_reason := left(v_reason, 2000);

  v_ids := array(select distinct x from unnest(p_listing_ids) x);
  foreach v_id in array v_ids loop
    select l.status into v_status from public.listings l where l.id = v_id;
    if not found then
      v_out := v_out || jsonb_build_object('listing_id', v_id, 'ok', false, 'error', 'not_found');
    elsif v_status <> 'pending_review' then
      v_out := v_out || jsonb_build_object('listing_id', v_id, 'ok', false, 'error', 'not_pending_review', 'status', v_status);
    else
      begin
        perform public.zfind_admin_transition_listing(v_id, v_to);
        insert into public.zfind_listing_review_log (listing_id, decision, from_status, to_status, reason, decided_by)
          values (v_id, p_decision, v_status, v_to, v_reason, auth.uid());
        v_out := v_out || jsonb_build_object('listing_id', v_id, 'ok', true, 'status', v_to);
      exception when others then
        v_out := v_out || jsonb_build_object('listing_id', v_id, 'ok', false, 'error', sqlerrm);
      end;
    end if;
  end loop;
  return v_out;
end;
$$;

revoke all on function public.zfind_admin_review_listings(uuid[], text, text) from public, anon, authenticated;
grant execute on function public.zfind_admin_review_listings(uuid[], text, text) to authenticated;

-- ------------------------------------------------------------ history (admin)
create or replace function public.zfind_admin_review_history(p_limit integer default 100, p_partner uuid default null)
returns table (
  id uuid,
  decided_at timestamptz,
  decision text,
  reason text,
  listing_id uuid,
  listing_title text,
  partner_id uuid,
  partner_name text,
  notified_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin role required' using errcode = '42501';
  end if;
  return query
  select g.id, g.decided_at, g.decision, g.reason, g.listing_id,
         (select lc.title from public.listing_content lc
           where lc.listing_id = g.listing_id and coalesce(btrim(lc.title), '') <> ''
           order by (lc.locale = 'fr') desc, lc.locale limit 1),
         pa.id, pa.name, g.notified_at
    from public.zfind_listing_review_log g
    join public.listings li on li.id = g.listing_id
    join public.representations r on r.id = li.representation_id
    left join public.partners pa on pa.id = r.partner_id
   where p_partner is null or pa.id = p_partner
   order by g.decided_at desc
   limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

revoke all on function public.zfind_admin_review_history(integer, uuid) from public, anon, authenticated;
grant execute on function public.zfind_admin_review_history(integer, uuid) to authenticated;

-- ------------------------------------------------------------ notices (server only)
create or replace function public.zfind_pending_review_notices(p_limit integer default 20)
returns table (
  notice_id uuid,
  decision text,
  reason text,
  decided_at timestamptz,
  listing_id uuid,
  listing_title text,
  partner_name text,
  recipients text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.decision, g.reason, g.decided_at, g.listing_id,
         (select lc.title from public.listing_content lc
           where lc.listing_id = g.listing_id and coalesce(btrim(lc.title), '') <> ''
           order by (lc.locale = 'fr') desc, lc.locale limit 1),
         pa.name,
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
    from public.zfind_listing_review_log g
    join public.listings li on li.id = g.listing_id
    join public.representations r on r.id = li.representation_id
    left join public.partners pa on pa.id = r.partner_id
   where g.notified_at is null
     and g.notify_attempts < 5
     and g.decided_at > now() - interval '7 days'
   order by g.decided_at
   limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

revoke all on function public.zfind_pending_review_notices(integer) from public, anon, authenticated;
grant execute on function public.zfind_pending_review_notices(integer) to service_role;

create or replace function public.zfind_mark_review_notices(p_ids uuid[], p_delivered boolean)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.zfind_listing_review_log
     set notified_at = case when p_delivered then now() else notified_at end,
         notify_attempts = notify_attempts + case when p_delivered then 0 else 1 end
   where id = any (coalesce(p_ids, '{}'::uuid[])) and notified_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.zfind_mark_review_notices(uuid[], boolean) from public, anon, authenticated;
grant execute on function public.zfind_mark_review_notices(uuid[], boolean) to service_role;
