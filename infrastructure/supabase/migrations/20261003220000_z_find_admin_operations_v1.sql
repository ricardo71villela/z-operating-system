-- ============================================================
-- Z FIND — Admin : opérations et base de prospection
--
-- 1. Les administrateurs (profiles.role = 'admin', fonction is_admin())
--    lisent la base zfind_agencias depuis l'app Admin et peuvent :
--    marquer « ne pas contacter », corriger e-mail / téléphone / site.
--    Aucun autre rôle n'y a accès (RLS).
-- 2. zfind_admin_operations_overview() : tous les compteurs du tableau de
--    bord Admin en un appel (agences, avis, alertes, demandes), réservé
--    aux administrateurs.
-- ============================================================

grant select on table public.zfind_agencias to authenticated;
grant update (do_not_contact, do_not_contact_at, email, email_source, phone, phone_source, website, website_source, updated_at)
  on table public.zfind_agencias to authenticated;

drop policy if exists "admin read agencias" on public.zfind_agencias;
create policy "admin read agencias" on public.zfind_agencias
  for select to authenticated using (public.is_admin());

drop policy if exists "admin update agencias" on public.zfind_agencias;
create policy "admin update agencias" on public.zfind_agencias
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

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
    )
  ) into result;
  return result;
end;
$$;

revoke all on function public.zfind_admin_operations_overview() from public, anon;
grant execute on function public.zfind_admin_operations_overview() to authenticated;
