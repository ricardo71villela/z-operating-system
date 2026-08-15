-- ============================================================
-- Z FIND — PHASE 4R R2.4B
-- Commercial Property Taxonomy v1
--
-- Materialises the already committed R2.4A semantic contract.
--
-- Canonical Commercial Property subtypes:
--   office
--   retail
--   industrial_logistics
--   hospitality
--
-- This migration changes taxonomy data only.
-- Property class remains database-derived from subtype.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Fail-fast baseline
-- ------------------------------------------------------------

do $r24b_pre$
declare
  v_commercial_class_count bigint;
  v_existing_commercial_subtypes bigint;
  v_target_code_conflicts bigint;
  v_forbidden_semantic_codes bigint;
begin
  select count(*)
    into v_commercial_class_count
  from public.property_classes pc
  where pc.code = 'commercial'
    and pc.enabled = true;

  if v_commercial_class_count <> 1 then
    raise exception
      'R2.4B requires exactly one enabled Commercial Property class';
  end if;

  select count(*)
    into v_existing_commercial_subtypes
  from public.property_subtypes ps
  where ps.property_class = 'commercial';

  if v_existing_commercial_subtypes <> 0 then
    raise exception
      'R2.4B expected zero pre-existing Commercial Property subtypes, found %',
      v_existing_commercial_subtypes;
  end if;

  select count(*)
    into v_target_code_conflicts
  from public.property_subtypes ps
  where ps.code in (
    'office',
    'retail',
    'industrial_logistics',
    'hospitality'
  );

  if v_target_code_conflicts <> 0 then
    raise exception
      'R2.4B target subtype code conflict count: %',
      v_target_code_conflicts;
  end if;

  select count(*)
    into v_forbidden_semantic_codes
  from public.property_subtypes ps
  where ps.code in (
    'commercial',
    'development',
    'building',
    'mixed_use',
    'btr',
    'pbsa',
    'senior_living'
  );

  if v_forbidden_semantic_codes <> 0 then
    raise exception
      'R2.4B found forbidden structural/operating-model subtype code(s): %',
      v_forbidden_semantic_codes;
  end if;
end
$r24b_pre$;

-- ------------------------------------------------------------
-- 2. Exact Commercial Property taxonomy v1
-- ------------------------------------------------------------

insert into public.property_subtypes (
  code,
  property_class,
  enabled,
  sort_order
)
values
  ('office',               'commercial', true, 1),
  ('retail',               'commercial', true, 2),
  ('industrial_logistics', 'commercial', true, 3),
  ('hospitality',          'commercial', true, 4);

-- ------------------------------------------------------------
-- 3. Post-condition gates
-- ------------------------------------------------------------

do $r24b_post$
declare
  v_commercial_count bigint;
  v_exact_rows bigint;
  v_legacy_rows bigint;
  v_forbidden_rows bigint;
  v_bad_mapping bigint;
begin
  select count(*)
    into v_commercial_count
  from public.property_subtypes ps
  where ps.property_class = 'commercial';

  if v_commercial_count <> 4 then
    raise exception
      'R2.4B expected exactly four Commercial Property subtypes, found %',
      v_commercial_count;
  end if;

  select count(*)
    into v_exact_rows
  from public.property_subtypes ps
  where
    (
      ps.code = 'office'
      and ps.property_class = 'commercial'
      and ps.enabled = true
      and ps.sort_order = 1
    )
    or
    (
      ps.code = 'retail'
      and ps.property_class = 'commercial'
      and ps.enabled = true
      and ps.sort_order = 2
    )
    or
    (
      ps.code = 'industrial_logistics'
      and ps.property_class = 'commercial'
      and ps.enabled = true
      and ps.sort_order = 3
    )
    or
    (
      ps.code = 'hospitality'
      and ps.property_class = 'commercial'
      and ps.enabled = true
      and ps.sort_order = 4
    );

  if v_exact_rows <> 4 then
    raise exception
      'R2.4B exact Commercial taxonomy validation failed: % matching row(s)',
      v_exact_rows;
  end if;

  select count(*)
    into v_legacy_rows
  from public.property_subtypes ps
  where
    (
      ps.code = 'apartment'
      and ps.property_class = 'residential'
    )
    or
    (
      ps.code = 'villa'
      and ps.property_class = 'residential'
    )
    or
    (
      ps.code = 'land'
      and ps.property_class = 'land'
    );

  if v_legacy_rows <> 3 then
    raise exception
      'R2.4B legacy Property subtype mappings changed unexpectedly';
  end if;

  select count(*)
    into v_forbidden_rows
  from public.property_subtypes ps
  where ps.code in (
    'commercial',
    'development',
    'building',
    'mixed_use',
    'btr',
    'pbsa',
    'senior_living'
  );

  if v_forbidden_rows <> 0 then
    raise exception
      'R2.4B semantic boundary violated by forbidden subtype code(s)';
  end if;

  select count(*)
    into v_bad_mapping
  from public.properties p
  left join public.property_subtypes ps
    on ps.code = p.subtype
   and ps.property_class = p.property_class
  where ps.code is null;

  if v_bad_mapping <> 0 then
    raise exception
      'R2.4B Property class/subtype integrity failed for % row(s)',
      v_bad_mapping;
  end if;
end
$r24b_post$;

commit;
