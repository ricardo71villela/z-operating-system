begin;

-- ============================================================
-- Z FIND — FRENCH DEFAULT LANGUAGE CONVERGENCE v1
--
-- Public languages:
--   fr · en · pt · es · de · it
--
-- Portuguese has ONE public version: /pt/.
-- Persisted Portuguese content remains pt-PT.
--
-- This migration changes DEFAULT LANGUAGE ONLY.
-- Public presentation order belongs to the frontend locale authority,
-- not to database sort_order.
-- ============================================================

do $block$
declare
  v_missing text;
begin
  select
    string_agg(
      expected.code,
      ', '
      order by expected.ordinality
    )
  into v_missing
  from unnest(
    array[
      'fr',
      'en',
      'pt-PT',
      'es',
      'de',
      'it'
    ]::text[]
  ) with ordinality
    as expected(code, ordinality)
  where not exists (
    select 1
    from public.system_languages sl
    where sl.code = expected.code
      and sl.enabled = true
  );

  if v_missing is not null then
    raise exception
      'Cannot set French as Z Find default. Missing/disabled locales: %',
      v_missing;
  end if;
end
$block$;

update public.system_languages
set is_default = false
where is_default = true
  and code <> 'fr';

update public.system_languages
set is_default = true
where code = 'fr'
  and enabled = true;

create unique index if not exists
  zfind_system_languages_one_default_idx
on public.system_languages ((is_default))
where is_default = true;

do $block$
declare
  v_default_count integer;
  v_default_code text;
begin
  select
    count(*),
    min(code)
  into
    v_default_count,
    v_default_code
  from public.system_languages
  where is_default = true;

  if v_default_count <> 1
     or v_default_code <> 'fr'
  then
    raise exception
      'French default convergence failed: count=%, code=%',
      v_default_count,
      v_default_code;
  end if;
end
$block$;

commit;
