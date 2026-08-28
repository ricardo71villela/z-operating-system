-- ============================================================
-- Z FIND — PostgreSQL special-form live function repair v2
-- ============================================================
-- Forward-only repair for regressions introduced after v1.
-- Historical migrations remain immutable.
--
-- PostgreSQL COALESCE and NULLIF are special forms and cannot be
-- schema-qualified as ordinary pg_catalog functions. This migration
-- repairs only currently-installed public.zfind_* function bodies that
-- still contain the invalid spellings.
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
      pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments
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
      pg_catalog.pg_get_function_identity_arguments(p.oid)
  loop
    v_definition :=
      pg_catalog.pg_get_functiondef(v_function.oid);

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
      v_repaired_count := v_repaired_count + 1;

      raise notice
        'Repaired public.%(%)',
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
      'Z Find special-form repair v2 incomplete';
  end if;

  raise notice
    'Z Find special-form repair v2 complete: % function(s) corrected',
    v_repaired_count;
end;
$repair$;