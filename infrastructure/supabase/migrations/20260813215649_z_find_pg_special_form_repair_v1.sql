-- ============================================================
-- Z FIND — PostgreSQL special-form live function repair v1
--
-- Forward-only repair.
--
-- Historical migrations are immutable and remain untouched.
--
-- Some previously applied PL/pgSQL function bodies contain:
--
--   pg_catalog.coalesce(...)
--
-- COALESCE is PostgreSQL special syntax and cannot be
-- schema-qualified as though it were an ordinary function.
--
-- CREATE FUNCTION can allow such statements to survive until
-- the affected PL/pgSQL branch is prepared/executed.
--
-- This migration repairs only currently-installed public.zfind_*
-- functions whose live pg_get_functiondef() still contains the
-- invalid spelling.
-- ============================================================

do $repair$
declare
  v_function record;
  v_definition text;
  v_repaired text;
  v_repaired_count integer := 0;
begin

  for v_function in
    select
      p.oid,
      p.proname,
      pg_catalog.pg_get_function_identity_arguments(
        p.oid
      ) as arguments
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and left(p.proname, 6) = 'zfind_'
      and (
        position(
          'pg_catalog.coalesce('
          in pg_catalog.pg_get_functiondef(p.oid)
        ) > 0
        or
        position(
          'pg_catalog.nullif('
          in pg_catalog.pg_get_functiondef(p.oid)
        ) > 0
      )
    order by
      p.proname,
      pg_catalog.pg_get_function_identity_arguments(
        p.oid
      )
  loop

    v_definition :=
      pg_catalog.pg_get_functiondef(
        v_function.oid
      );

    v_repaired := replace(
      v_definition,
      'pg_catalog.coalesce(',
      'coalesce('
    );

    v_repaired := replace(
      v_repaired,
      'pg_catalog.nullif(',
      'nullif('
    );

    if v_repaired <> v_definition then
      execute v_repaired;

      v_repaired_count :=
        v_repaired_count + 1;

      raise notice
        'Repaired %.%(%)',
        'public',
        v_function.proname,
        v_function.arguments;
    end if;

  end loop;


  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and left(p.proname, 6) = 'zfind_'
      and (
        position(
          'pg_catalog.coalesce('
          in pg_catalog.pg_get_functiondef(p.oid)
        ) > 0
        or
        position(
          'pg_catalog.nullif('
          in pg_catalog.pg_get_functiondef(p.oid)
        ) > 0
      )
  ) then
    raise exception
      'Z Find special-form repair incomplete';
  end if;


  raise notice
    'Z Find live function repair complete: % function(s) corrected',
    v_repaired_count;

end;
$repair$;


comment on schema public is
'Public application schema. Z Find live PL/pgSQL special-form convergence applied forward-only; historical migrations remain immutable.';
