-- ============================================================
-- ZOS — Z Studio inclus dans les abonnements Z Find et Z Jobs v1
--
-- Décision du propriétaire (28/10/2026) : l'application Z Studio complète
-- est incluse pour les professionnels des marketplaces :
--   * Z Find : chaque utilisateur d'une agence active
--     (public.profiles role 'partner_user' → public.partners status 'active') ;
--   * Z Jobs : chaque owner / admin / recruiter / hiring_manager d'un
--     employeur ou d'une agence de recrutement dont la dernière vérification
--     est 'verified' ou 'enhanced_verified' (non expirée).
--
-- Mise en œuvre dans l'autorité commerciale existante de Z Studio, sans
-- nouvelle source de vérité : un abonnement studio.subscriptions
-- billing_source 'manual', plan 'monthly', référence
-- 'zos-marketplace:<person_id>', avec les droits studio_access et ai_access.
-- Les quotas IA sont ceux du plan mensuel (studio.ai_plan_limits). La
-- période suit le mois civil UTC, ce qui remet le quota à zéro chaque mois.
--
-- public.zos_sync_marketplace_studio_bundles() (service_role uniquement,
-- appelée chaque jour par le cron Z Find et exécutable à la main) :
--   1. crée la personne ZOS manquante ;
--   2. crée ou prolonge l'abonnement inclus de chaque personne éligible ;
--   3. fait expirer l'abonnement inclus et ses droits quand la personne
--      n'est plus éligible (agence suspendue, membre retiré…).
-- Un abonnement Z Studio payé par ailleurs n'est jamais modifié.
-- ============================================================

create or replace function public.zos_marketplace_studio_eligible()
returns table (auth_user_id uuid, email text, products text[])
language sql
stable
security definer
set search_path = ''
as $$
  with zfind as (
    select pf.id as uid, 'z_find'::text as product
      from public.profiles pf
      join public.partners pa on pa.id = pf.partner_id
     where pf.role = 'partner_user' and pa.status = 'active'
  ), latest_verification as (
    select distinct on (a.organization_id) a.organization_id, a.outcome::text as outcome, a.expires_at
      from jobs.organization_verification_assessments a
     order by a.organization_id, a.created_at desc
  ), zjobs as (
    select m.user_id as uid, 'z_jobs'::text as product
      from jobs.organization_memberships m
      join jobs.organizations o on o.id = m.organization_id
      join latest_verification v on v.organization_id = o.id
     where o.type::text in ('employer', 'employer_group', 'recruitment_agency', 'temp_work_agency')
       and m.role::text in ('owner', 'admin', 'recruiter', 'hiring_manager')
       and v.outcome in ('verified', 'enhanced_verified')
       and (v.expires_at is null or v.expires_at > now())
  ), all_rows as (
    select * from zfind union all select * from zjobs
  )
  select r.uid, u.email::text, array_agg(distinct r.product order by r.product)
    from all_rows r
    join auth.users u on u.id = r.uid
   group by r.uid, u.email;
$$;

revoke all on function public.zos_marketplace_studio_eligible() from public, anon, authenticated;
grant execute on function public.zos_marketplace_studio_eligible() to service_role;

create or replace function public.zos_sync_marketplace_studio_bundles()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_period_start timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  v_period_end timestamptz := (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';
  v_row record;
  v_person uuid;
  v_subscription uuid;
  v_granted integer := 0;
  v_expired integer := 0;
  v_eligible uuid[] := '{}';
begin
  for v_row in select * from public.zos_marketplace_studio_eligible() loop
    insert into zos.persons (auth_user_id, display_name)
    values (v_row.auth_user_id, nullif(btrim(coalesce(v_row.email, '')), ''))
    on conflict (auth_user_id) do update set updated_at = zos.persons.updated_at
    returning id into v_person;
    v_eligible := v_eligible || v_person;

    insert into studio.subscriptions (
      person_id, plan_code, status, billing_source, billing_environment,
      source_subscription_ref, source_product_ref,
      current_period_start, current_period_end, cancel_at_period_end
    ) values (
      v_person, 'monthly', 'active', 'manual', 'production',
      'zos-marketplace:' || v_person, 'zos_marketplace_bundle:' || array_to_string(v_row.products, '+'),
      v_period_start, v_period_end, false
    )
    on conflict (billing_source, billing_environment, source_subscription_ref) where source_subscription_ref is not null
    do update set
      status = 'active',
      source_product_ref = excluded.source_product_ref,
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      cancel_at_period_end = false,
      updated_at = now()
    returning id into v_subscription;

    insert into studio.entitlements (person_id, subscription_id, entitlement_code, status, source, starts_at)
    select v_person, v_subscription, code, 'active', 'subscription', least(now(), v_period_start)
      from unnest(array['studio_access', 'ai_access']) as code
    on conflict (subscription_id, entitlement_code) where subscription_id is not null
    do update set status = 'active', expires_at = null, updated_at = now();

    v_granted := v_granted + 1;
  end loop;

  -- No longer eligible: the included subscription and its rights expire.
  with gone as (
    update studio.subscriptions s
       set status = 'expired',
           current_period_end = greatest(now(), s.current_period_start + interval '1 second'),
           updated_at = now()
     where s.billing_source = 'manual'
       and s.source_subscription_ref like 'zos-marketplace:%'
       and s.status <> 'expired'
       and not (s.person_id = any (v_eligible))
    returning s.id
  ), rights as (
    update studio.entitlements e
       set status = 'expired', updated_at = now()
      from gone
     where e.subscription_id = gone.id and e.status <> 'expired'
    returning e.id
  )
  select count(*) into v_expired from gone;

  return jsonb_build_object('granted', v_granted, 'expired', v_expired, 'periodStart', v_period_start, 'periodEnd', v_period_end);
end;
$$;

revoke all on function public.zos_sync_marketplace_studio_bundles() from public, anon, authenticated;
grant execute on function public.zos_sync_marketplace_studio_bundles() to service_role;

-- Première synchronisation au moment de la migration.
select public.zos_sync_marketplace_studio_bundles();
