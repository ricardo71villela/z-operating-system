begin;

-- ============================================================
-- Z FIND — PROPERTY CLASSIFICATION FOUNDATION V1
--
-- Phase 4R target:
--
--   property_class:
--     residential | commercial | land
--
--   subtype:
--     class-scoped, extensible vocabulary
--
-- Commercial is a Property class, NOT subtype='commercial'.
-- Development remains a first-class entity, NOT a Property subtype.
--
-- Compatibility strategy:
--
--   Existing callers continue supplying subtype.
--   The database derives property_class from the authoritative
--   property_subtypes taxonomy through a BEFORE trigger.
--
-- Therefore existing create/update/duplicate RPC signatures remain
-- valid while the new classification axis becomes authoritative.
--
-- Historical migrations remain immutable.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Top-level Property classes
-- ------------------------------------------------------------

create table public.property_classes (
  code text primary key,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),

  constraint property_classes_code_shape
    check (
      code = pg_catalog.btrim(code)
      and code <> ''
    ),

  constraint property_classes_phase4r_code_check
    check (
      code in (
        'residential',
        'commercial',
        'land'
      )
    )
);

alter table public.property_classes
  enable row level security;

revoke all
on table public.property_classes
from public, anon, authenticated;


insert into public.property_classes (
  code,
  enabled,
  sort_order
)
values
  ('residential', true, 1),
  ('commercial',  true, 2),
  ('land',        true, 3);


comment on table public.property_classes is
  'Z Find authoritative top-level Property classification. Locked Phase 4R classes: residential, commercial, land. Presentation labels belong to six-language i18n, not this table.';


-- ------------------------------------------------------------
-- 2. Extensible class-scoped Property subtype vocabulary
--
-- No translated labels are stored here.
-- Public labels belong to the six-language presentation layer.
--
-- Commercial intentionally has no subtype seeded by this migration:
-- the exact commercial subtype vocabulary is a later explicit
-- product decision. Crucially, adding one later is a taxonomy data
-- change and does not require expanding properties.subtype schema.
--
-- R2.1 deliberately keeps subtype code globally unique because the
-- existing canonical RPC contract supplies subtype alone. This lets
-- the database derive exactly one Property class without changing
-- current create/update/duplicate command signatures.
--
-- "Class-scoped" therefore means that every subtype belongs to one
-- authoritative Property class. Reusing the same subtype code under
-- multiple classes would require a future explicit RPC contract
-- evolution carrying both class and subtype.
-- ------------------------------------------------------------

create table public.property_subtypes (
  code text primary key,

  property_class text not null
    references public.property_classes(code)
    on update cascade
    on delete restrict,

  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),

  constraint property_subtypes_code_shape
    check (
      code = pg_catalog.btrim(code)
      and code <> ''
    ),

  constraint property_subtypes_class_code_unique
    unique (property_class, code)
);

alter table public.property_subtypes
  enable row level security;

revoke all
on table public.property_subtypes
from public, anon, authenticated;


insert into public.property_subtypes (
  code,
  property_class,
  enabled,
  sort_order
)
values
  ('apartment', 'residential', true, 1),
  ('villa',     'residential', true, 2),
  ('land',      'land',        true, 1);


comment on table public.property_subtypes is
  'Z Find authoritative class-scoped Property subtype vocabulary. New subtypes are taxonomy data, not hardcoded properties CHECK values.';


-- ------------------------------------------------------------
-- 3. Expand Properties with property_class
-- ------------------------------------------------------------

alter table public.properties
  add column property_class text;


-- Existing live vocabulary is known to be:
--   apartment | villa | land
--
-- Backfill through the authoritative taxonomy rather than duplicate
-- the mapping in application code.

update public.properties p
set property_class = ps.property_class
from public.property_subtypes ps
where ps.code = p.subtype;


do $block$
declare
  v_unclassified bigint;
begin
  select count(*)
  into v_unclassified
  from public.properties p
  where p.property_class is null;

  if v_unclassified <> 0 then
    raise exception
      'Property classification backfill incomplete: % Property row(s) have no class',
      v_unclassified;
  end if;
end
$block$;


alter table public.properties
  alter column property_class set not null;


-- ------------------------------------------------------------
-- 4. Replace hardcoded subtype enum constraint with relational
--    class/subtype integrity.
--
-- This is the key extensibility change:
-- new Property subtypes no longer require changing the Properties
-- table CHECK constraint.
-- ------------------------------------------------------------

alter table public.properties
  drop constraint properties_subtype_check;


alter table public.properties
  add constraint properties_property_class_subtype_fkey
  foreign key (property_class, subtype)
  references public.property_subtypes(property_class, code)
  on update cascade
  on delete restrict;


create index
  zfind_properties_property_class_idx
on public.properties(property_class);


-- ------------------------------------------------------------
-- 5. Central database derivation
--
-- Legacy/current RPCs supply subtype only.
--
-- The database derives property_class from subtype, which means:
--
--   createProperty       remains compatible
--   Partner create       remains compatible
--   update subtype       synchronises class automatically
--   Admin duplicate      preserves correct class automatically
--
-- Browser callers never become authoritative for the relationship
-- between subtype and Property class.
-- ------------------------------------------------------------

create function public.zfind_properties_derive_property_class()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_subtype text;
  v_property_class text;
begin
  v_subtype :=
    pg_catalog.btrim(
      pg_catalog.coalesce(new.subtype, '')
    );

  if v_subtype = '' then
    raise exception
      'Property subtype is required'
      using errcode = '22023';
  end if;

  select ps.property_class
  into v_property_class
  from public.property_subtypes ps
  join public.property_classes pc
    on pc.code = ps.property_class
  where ps.code = v_subtype
    and ps.enabled = true
    and pc.enabled = true;

  if v_property_class is null then
    raise exception
      'Unsupported or disabled Property subtype or class: %',
      v_subtype
      using errcode = '22023';
  end if;

  new.subtype := v_subtype;
  new.property_class := v_property_class;

  return new;
end;
$$;


revoke all
on function public.zfind_properties_derive_property_class()
from public, anon, authenticated, service_role;


create trigger zfind_properties_derive_property_class
before insert or update of subtype, property_class
on public.properties
for each row
execute function public.zfind_properties_derive_property_class();


comment on function public.zfind_properties_derive_property_class() is
  'Internal Z Find integrity trigger. Derives Property class from the authoritative subtype taxonomy so browser/RPC callers cannot create class/subtype contradictions.';


comment on column public.properties.property_class is
  'Top-level Z Find Property classification derived server-side from subtype. Phase 4R values are residential, commercial or land.';


-- ------------------------------------------------------------
-- 6. Migration-time integrity gates
-- ------------------------------------------------------------

do $block$
declare
  v_classes text[];
  v_bad_mapping bigint;
  v_commercial_literal bigint;
begin

  select
    pg_catalog.array_agg(pc.code order by pc.sort_order)
  into v_classes
  from public.property_classes pc
  where pc.enabled = true;

  if v_classes is distinct from
     array[
       'residential',
       'commercial',
       'land'
     ]::text[]
  then
    raise exception
      'Unexpected Property class authority: %',
      v_classes;
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
      'Property class/subtype relational integrity failed for % row(s)',
      v_bad_mapping;
  end if;


  select count(*)
  into v_commercial_literal
  from public.property_subtypes ps
  where ps.code = 'commercial';

  if v_commercial_literal <> 0 then
    raise exception
      'Commercial must remain a Property class, not subtype=commercial';
  end if;

end
$block$;


-- ------------------------------------------------------------
-- 7. Explicit scope boundary
--
-- Deliberately untouched:
--
--   listings / channel / Off-market
--   transaction_type / rental_period
--   Representation lifecycle
--   public visibility RLS
--   Partner/Admin ownership
--   media/storage
--   non-Find product storage surfaces
--
-- Those converge in their own controlled Phase 4R steps.
-- ------------------------------------------------------------

commit;
