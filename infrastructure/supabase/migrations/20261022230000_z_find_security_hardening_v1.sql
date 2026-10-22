-- Z Find (and shared schemas) — security hardening from the Supabase advisors, v1
--
-- 1. Internal SECURITY DEFINER functions that a visitor who is not signed in
--    (role anon) could call through the API. None of them is meant for anon:
--      public.is_admin(), public.is_own_partner(uuid)
--          only used by policies written "to authenticated" → keep authenticated;
--      public.rls_auto_enable()                  event-trigger function;
--      desk.enforce_workspace_membership_organisation()  trigger function.
--    Trigger and event-trigger functions still fire: PostgreSQL checks EXECUTE
--    only when the trigger is created, not each time it runs.
--    The zfind_public_* functions, zfind_commune_search and
--    zfind_registry_lookup stay callable by anon on purpose (public site and
--    partner sign-up).
--
-- 2. Functions without a fixed search_path (advisor "function_search_path_mutable").
--    Each one is pinned to the path it already resolves names with today, so
--    behaviour does not change:
--      fashion.*   → fashion first (the Z Fashion API connects with search_path=fashion);
--      the others  → public, extensions (the database default).
--
-- Idempotent: safe to run again. Functions that do not exist are skipped.

begin;

-- 1. Execute rights -------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.is_admin()',
    'public.is_own_partner(uuid)',
    'public.rls_auto_enable()',
    'desk.enforce_workspace_membership_organisation()'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon', f);
    end if;
  end loop;

  -- Signed-in users keep the two helpers their policies call.
  foreach f in array array['public.is_admin()', 'public.is_own_partner(uuid)'] loop
    if to_regprocedure(f) is not null then
      execute format('grant execute on function %s to authenticated, service_role', f);
    end if;
  end loop;

  -- Trigger functions are not API calls for anyone.
  foreach f in array array['public.rls_auto_enable()', 'desk.enforce_workspace_membership_organisation()'] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from authenticated', f);
    end if;
  end loop;
end $$;

-- 2. Fixed search_path ------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn, n.nspname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.prokind = 'f'
      and (n.nspname = 'fashion'
        or (n.nspname, p.proname) in (
          ('mobility', 'set_updated_at'),
          ('platform_internal', 'set_updated_at'),
          ('public', 'automotive_validate_specification_value'),
          ('public', 'studio_brand_kits_set_updated_at')))
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    if r.nspname = 'fashion' then
      execute format('alter function %s set search_path = fashion, public, extensions, pg_temp', r.fn);
    else
      execute format('alter function %s set search_path = public, extensions, pg_temp', r.fn);
    end if;
  end loop;
end $$;

commit;

-- Checks (expected: no rows for the first two; the four functions above false for anon).
-- select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname in ('fashion','mobility','platform_internal','public') and p.prokind = 'f'
--    and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')
--    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');
-- select f, has_function_privilege('anon', f::regprocedure, 'execute') as anon,
--        has_function_privilege('authenticated', f::regprocedure, 'execute') as authenticated
--   from unnest(array['public.is_admin()','public.is_own_partner(uuid)','public.rls_auto_enable()',
--                     'desk.enforce_workspace_membership_organisation()']) f;
