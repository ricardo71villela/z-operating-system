-- ============================================================
-- Z Find Database Convergence v1
-- Shared ZOS database lineage
-- ============================================================
--
-- Vertical schema: find
--
-- Compatibility decision:
--   Existing Z Find operational marketplace tables currently live
--   in public and remain there in this convergence phase so that the
--   existing Web/Admin/Partner runtime is not broken by a schema move.
--
-- New domain-owned audit truth is placed in find.
--
-- Canonical cross-vertical capabilities remain owned elsewhere:
--
--   Identity      -> zos.persons / zos.registry_bindings
--   Registry      -> zos.registry_bindings
--   Geography     -> zos.geography_*
--   Observations  -> zos.observations / zos.observation_evidence
--   Outbox        -> platform_internal.integration_outbox
--
-- This migration MUST NOT create parallel public copies of those
-- canonical capabilities.
--
-- Verification remains a Z Find domain concern in v1 because no
-- general canonical ZOS Verification primitive has been approved.
--
-- No Trust Score is created or derived.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Preconditions
-- ------------------------------------------------------------

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'Z Find convergence requires public.profiles';
  end if;

  if to_regclass('public.partners') is null then
    raise exception 'Z Find convergence requires public.partners';
  end if;

  if to_regclass('public.properties') is null then
    raise exception 'Z Find convergence requires public.properties';
  end if;

  if to_regclass('public.developments') is null then
    raise exception 'Z Find convergence requires public.developments';
  end if;

  if to_regclass('public.representations') is null then
    raise exception 'Z Find convergence requires public.representations';
  end if;

  if to_regclass('public.listings') is null then
    raise exception 'Z Find convergence requires public.listings';
  end if;

  if to_regclass('public.zones_lite') is null then
    raise exception 'Z Find convergence requires public.zones_lite';
  end if;

  if to_regclass('zos.registry_bindings') is null then
    raise exception 'Z Find convergence requires canonical zos.registry_bindings';
  end if;

  if to_regclass('zos.geography_locations') is null then
    raise exception 'Z Find convergence requires canonical zos.geography_locations';
  end if;

  if to_regclass('zos.observations') is null then
    raise exception 'Z Find convergence requires canonical zos.observations';
  end if;

  if to_regclass('zos.observation_evidence') is null then
    raise exception 'Z Find convergence requires canonical zos.observation_evidence';
  end if;

  if to_regclass('platform_internal.integration_outbox') is null then
    raise exception 'Z Find convergence requires canonical platform_internal.integration_outbox';
  end if;

  if to_regprocedure(
    'platform_internal.register_local_person_identity(text,uuid)'
  ) is null then
    raise exception
      'Z Find convergence requires platform_internal.register_local_person_identity(text,uuid)';
  end if;
end
$$;


-- ------------------------------------------------------------
-- 2. Z Find vertical schema
-- ------------------------------------------------------------

create schema if not exists find;

revoke all on schema find from public;
revoke all on schema find from anon;
revoke all on schema find from authenticated;

comment on schema find is
  'Z Find domain-owned database schema. Canonical ZOS Identity, Registry, Geography, Observations and transport remain in their authoritative Core schemas.';


-- ------------------------------------------------------------
-- 3. Listing lifecycle history
-- ------------------------------------------------------------

create table find.listing_state_history (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null
    references public.listings(id)
    on delete restrict,
  from_status text,
  to_status text not null,
  actor_profile_id uuid
    references public.profiles(id)
    on delete restrict,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now()
);

alter table find.listing_state_history
  enable row level security;

revoke all
on table find.listing_state_history
from public, anon, authenticated;


create function find.capture_listing_state_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    insert into find.listing_state_history (
      listing_id,
      from_status,
      to_status,
      actor_profile_id
    )
    values (
      new.id,
      null,
      new.status,
      auth.uid()
    );

  elsif old.status is distinct from new.status then
    insert into find.listing_state_history (
      listing_id,
      from_status,
      to_status,
      actor_profile_id
    )
    values (
      new.id,
      old.status,
      new.status,
      auth.uid()
    );
  end if;

  return new;
end;
$$;

revoke all
on function find.capture_listing_state_history()
from public, anon, authenticated;


insert into find.listing_state_history (
  listing_id,
  from_status,
  to_status,
  reason,
  metadata
)
select
  l.id,
  null,
  l.status,
  'database_convergence_baseline',
  jsonb_build_object(
    'migration',
    'z_find_database_convergence_v1'
  )
from public.listings l;


create trigger trg_zfind_listing_state_history
after insert or update of status
on public.listings
for each row
execute function find.capture_listing_state_history();


comment on table find.listing_state_history is
  'Append-style Z Find Listing lifecycle history. Listing lifecycle remains distinct from Representation and Verification lifecycle.';


-- ------------------------------------------------------------
-- 4. Representation lifecycle history
-- ------------------------------------------------------------

create table find.representation_state_history (
  id uuid primary key default gen_random_uuid(),
  representation_id uuid not null
    references public.representations(id)
    on delete restrict,
  from_status text,
  to_status text not null,
  actor_profile_id uuid
    references public.profiles(id)
    on delete restrict,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now()
);

alter table find.representation_state_history
  enable row level security;

revoke all
on table find.representation_state_history
from public, anon, authenticated;


create function find.capture_representation_state_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    insert into find.representation_state_history (
      representation_id,
      from_status,
      to_status,
      actor_profile_id
    )
    values (
      new.id,
      null,
      new.status,
      auth.uid()
    );

  elsif old.status is distinct from new.status then
    insert into find.representation_state_history (
      representation_id,
      from_status,
      to_status,
      actor_profile_id
    )
    values (
      new.id,
      old.status,
      new.status,
      auth.uid()
    );
  end if;

  return new;
end;
$$;

revoke all
on function find.capture_representation_state_history()
from public, anon, authenticated;


insert into find.representation_state_history (
  representation_id,
  from_status,
  to_status,
  reason,
  metadata
)
select
  r.id,
  null,
  r.status,
  'database_convergence_baseline',
  jsonb_build_object(
    'migration',
    'z_find_database_convergence_v1'
  )
from public.representations r;


create trigger trg_zfind_representation_state_history
after insert or update of status
on public.representations
for each row
execute function find.capture_representation_state_history();


comment on table find.representation_state_history is
  'Append-style Z Find Representation lifecycle history. Representation lifecycle remains distinct from Listing and Verification lifecycle.';


-- ------------------------------------------------------------
-- 5. Verification audit truth — Z Find owned
-- ------------------------------------------------------------

create table find.verification_assessments (
  id uuid primary key default gen_random_uuid(),

  subject_type text not null
    check (
      subject_type in (
        'partner',
        'representation',
        'property',
        'development'
      )
    ),

  partner_id uuid
    references public.partners(id)
    on delete restrict,

  representation_id uuid
    references public.representations(id)
    on delete restrict,

  property_id uuid
    references public.properties(id)
    on delete restrict,

  development_id uuid
    references public.developments(id)
    on delete restrict,

  verification_kind text not null,

  outcome text not null
    check (
      outcome in (
        'pending',
        'verified',
        'partially_verified',
        'failed',
        'expired'
      )
    ),

  confidence numeric
    check (
      confidence is null
      or (
        confidence >= 0
        and confidence <= 1
      )
    ),

  source_reference text,

  evidence jsonb not null default '{}'::jsonb,

  assessor_profile_id uuid
    references public.profiles(id)
    on delete restrict,

  assessed_at timestamptz not null default now(),

  expires_at timestamptz,

  constraint zfind_verification_assessment_subject_shape
  check (
    (
      subject_type = 'partner'
      and partner_id is not null
      and representation_id is null
      and property_id is null
      and development_id is null
    )
    or
    (
      subject_type = 'representation'
      and representation_id is not null
      and partner_id is null
      and property_id is null
      and development_id is null
    )
    or
    (
      subject_type = 'property'
      and property_id is not null
      and partner_id is null
      and representation_id is null
      and development_id is null
    )
    or
    (
      subject_type = 'development'
      and development_id is not null
      and partner_id is null
      and representation_id is null
      and property_id is null
    )
  )
);

alter table find.verification_assessments
  enable row level security;

revoke all
on table find.verification_assessments
from public, anon, authenticated;


create index zfind_verification_assessments_subject_idx
on find.verification_assessments (
  subject_type,
  assessed_at desc
);


create index zfind_verification_assessments_property_public_lookup_idx
on find.verification_assessments (
  property_id,
  verification_kind,
  assessed_at desc
)
where subject_type = 'property';


comment on table find.verification_assessments is
  'Append-only Z Find Verification audit truth. Verification is not Trust and does not create a Trust Score.';


-- ------------------------------------------------------------
-- 6. Verification append-only invariant
-- ------------------------------------------------------------

create function find.reject_verification_assessment_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception
    'verification assessments are append-only; create a new assessment instead of updating or deleting an existing assessment'
    using errcode = '55000';

  return old;
end;
$$;


create trigger zfind_verification_assessments_append_only
before update or delete
on find.verification_assessments
for each row
execute function find.reject_verification_assessment_mutation();


revoke all
on function find.reject_verification_assessment_mutation()
from public, anon, authenticated;


-- ------------------------------------------------------------
-- 7. Explicit public Verification publication policy
-- ------------------------------------------------------------

create table find.verification_publication_rules (
  verification_kind text primary key,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

alter table find.verification_publication_rules
  enable row level security;

revoke all
on table find.verification_publication_rules
from public, anon, authenticated;


comment on table find.verification_publication_rules is
  'Z Find marketplace publication gate for Verification kinds. Empty/private by default.';


-- IMPORTANT:
-- No publication rule is seeded here.
-- Unknown verification kinds therefore remain private.


-- ------------------------------------------------------------
-- 8. Safe public Property Verification projection
-- ------------------------------------------------------------

create or replace function public.zfind_public_property_verification(
  p_property_id uuid
)
returns table (
  verification_kind text,
  outcome text,
  assessed_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with latest as (
    select
      va.verification_kind,
      va.outcome,
      va.assessed_at,
      va.expires_at,
      row_number() over (
        partition by va.verification_kind
        order by
          va.assessed_at desc,
          va.id desc
      ) as rn

    from find.verification_assessments va

    join find.verification_publication_rules vpr
      on vpr.verification_kind = va.verification_kind
     and vpr.is_public = true

    where va.subject_type = 'property'
      and va.property_id = p_property_id

      and exists (
        select 1
        from public.representations r
        join public.listings l
          on l.representation_id = r.id

        where r.target_type = 'property'
          and r.property_id = p_property_id
          and r.status = 'active'
          and l.status = 'published'
      )
  )

  select
    latest.verification_kind,
    latest.outcome,
    latest.assessed_at,
    latest.expires_at

  from latest

  where latest.rn = 1

    and latest.outcome in (
      'verified',
      'partially_verified'
    )

    and (
      latest.expires_at is null
      or latest.expires_at > now()
    )

  order by
    latest.assessed_at desc,
    latest.verification_kind;
$$;


revoke all
on function public.zfind_public_property_verification(uuid)
from public;

grant execute
on function public.zfind_public_property_verification(uuid)
to anon, authenticated;


comment on function public.zfind_public_property_verification(uuid) is
  'Safe public Z Find Property Verification projection. Returns only explicitly publishable, latest, positive, non-expired assessments for currently represented and published Properties. Does not expose audit evidence and does not derive Trust.';


-- ------------------------------------------------------------
-- 9. Canonical Identity registration
-- ------------------------------------------------------------
--
-- profiles.id remains the local Supabase Auth/application identity.
--
-- The canonical Identity Bridge already provides the trusted
-- platform_internal.register_local_person_identity() command.
--
-- Registration creates/maintains only the canonical registry
-- relationship for the existing local identity. It does not invent
-- a ZOS Person ID.
-- ------------------------------------------------------------

create function find.register_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform platform_internal.register_local_person_identity(
    'find',
    new.id
  );

  return new;
end;
$$;


revoke all
on function find.register_profile_identity()
from public, anon, authenticated;


create trigger zfind_profiles_register_local_identity
after insert
on public.profiles
for each row
execute function find.register_profile_identity();


do $$
declare
  v_profile record;
begin
  for v_profile in
    select p.id
    from public.profiles p
  loop
    perform platform_internal.register_local_person_identity(
      'find',
      v_profile.id
    );
  end loop;
end
$$;


comment on function find.register_profile_identity() is
  'Registers an existing Z Find profile as a local Find identity in the canonical ZOS Registry without replacing the profile UUID or inventing a canonical Person ID.';


-- ------------------------------------------------------------
-- 10. Geography bridge
-- ------------------------------------------------------------
--
-- zones_lite remains only a marketplace/search projection.
-- It may optionally point at canonical Geography.
-- ------------------------------------------------------------

alter table public.zones_lite
  add column if not exists geography_entity_id uuid
  references zos.geography_locations(id)
  on delete restrict;


alter table public.zones_lite
  add column if not exists geography_binding_status text
  not null
  default 'unbound'
  check (
    geography_binding_status in (
      'unbound',
      'linked',
      'superseded'
    )
  );


create unique index if not exists
  uq_zfind_zones_lite_geography_entity_id
on public.zones_lite(geography_entity_id)
where geography_entity_id is not null;


comment on column public.zones_lite.geography_entity_id is
  'Optional reference to canonical zos.geography_locations identity. zones_lite remains a Z Find marketplace/search projection.';


-- ------------------------------------------------------------
-- 11. Explicit non-duplication boundary
-- ------------------------------------------------------------
--
-- Deliberately NOT created:
--
--   public.registry_bindings
--   public.identity_bindings
--   public.data_sources
--   public.data_metric_definitions
--   public.data_observations
--   public.observation_evidence
--   public.integration_outbox
--
-- Their cross-vertical responsibilities belong to canonical ZOS
-- Registry / Identity / Data / Platform infrastructure.
--
-- Adapter convergence onto those canonical boundaries is handled
-- separately from persistence duplication.
-- ------------------------------------------------------------


-- ============================================================
-- Z Find Runtime API Convergence v1
-- ============================================================
--
-- The Data API exposes public / graphql_public / zos_api.
-- The find and zos persistence schemas remain deliberately private.
--
-- Z Find runtime therefore reaches private Find and canonical ZOS
-- persistence only through explicit RPC boundaries.
--
-- No parallel Registry, Identity, Observation or Outbox tables are
-- created here.
-- ============================================================


-- ------------------------------------------------------------
-- 12. Runtime API preconditions
-- ------------------------------------------------------------

do $$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception
      'Z Find runtime convergence requires public.is_admin()';
  end if;
end
$$;


-- ------------------------------------------------------------
-- 13. Current Find Identity projection
-- ------------------------------------------------------------
--
-- Read-only.
--
-- Unlike zos_api.current_identity_bindings(), this projection also
-- represents the legitimate local_only state. It never creates a
-- canonical Person and never links one automatically.
-- ------------------------------------------------------------

create or replace function public.zfind_current_identity_binding()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid;
  v_result jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'authentication required'
      using errcode = '28000';
  end if;

  select jsonb_build_object(
    'profile_id', v_user_id,
    'zos_person_id', p.id,
    'binding_status', rb.binding_status,
    'linked_at', rb.linked_at
  )
  into v_result

  from zos.registry_bindings rb

  left join zos.persons p
    on rb.canonical_entity_type = 'person'
   and p.id::text = rb.canonical_entity_id

  where rb.domain_code = 'find'
    and rb.local_entity_type = 'profile'
    and rb.local_entity_id = v_user_id::text
    and rb.retired_at is null

  order by rb.created_at desc
  limit 1;

  return v_result;
end;
$$;

revoke all
on function public.zfind_current_identity_binding()
from public, anon, authenticated;

grant execute
on function public.zfind_current_identity_binding()
to authenticated;

comment on function public.zfind_current_identity_binding() is
  'Read-only Z Find self Identity projection. Returns local_only or linked state without creating or assigning a canonical ZOS Person.';


-- ------------------------------------------------------------
-- 14. Z Find Registry read port
-- ------------------------------------------------------------
--
-- Shared Registry membership remains optional.
-- Absence of a binding is a valid result.
--
-- This function does NOT create a Registry binding and does NOT
-- assign a canonical authority.
-- ------------------------------------------------------------

create or replace function public.zfind_get_registry_binding(
  p_entity_type text,
  p_local_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Z Find admin access required'
      using errcode = '42501';
  end if;

  if p_entity_type not in (
    'organisation',
    'partner',
    'property',
    'development'
  ) then
    raise exception
      'unsupported Z Find Registry entity type: %',
      p_entity_type
      using errcode = '22023';
  end if;

  if p_local_id is null then
    raise exception 'local entity id is required'
      using errcode = '22004';
  end if;

  select jsonb_build_object(
    'binding_id', rb.id,
    'entity_type', rb.local_entity_type,
    'local_id', p_local_id,
    'canonical_entity_type', rb.canonical_entity_type,
    'canonical_entity_id', rb.canonical_entity_id,
    'binding_status', rb.binding_status,
    'linked_at', rb.linked_at
  )
  into v_result

  from zos.registry_bindings rb

  where rb.domain_code = 'find'
    and rb.local_entity_type = p_entity_type
    and rb.local_entity_id = p_local_id::text
    and rb.retired_at is null

  order by rb.created_at desc
  limit 1;

  return v_result;
end;
$$;

revoke all
on function public.zfind_get_registry_binding(text, uuid)
from public, anon, authenticated;

grant execute
on function public.zfind_get_registry_binding(text, uuid)
to authenticated;

comment on function public.zfind_get_registry_binding(text, uuid) is
  'Admin read port for an optional canonical ZOS Registry binding of an existing Z Find entity. Never creates or assigns Registry identity.';


-- ------------------------------------------------------------
-- 15. Canonical Observation read port
-- ------------------------------------------------------------

create or replace function public.zfind_list_observations(
  p_entity_type text,
  p_entity_id uuid,
  p_metric_code text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Z Find admin access required'
      using errcode = '42501';
  end if;

  if p_entity_type not in (
    'organisation',
    'partner',
    'property',
    'development',
    'listing'
  ) then
    raise exception
      'unsupported Z Find Observation entity type: %',
      p_entity_type
      using errcode = '22023';
  end if;

  if p_entity_id is null then
    raise exception 'Observation entity id is required'
      using errcode = '22004';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', o.id,
        'entity_type', o.subject_entity_type,

        'organisation_id',
          case
            when p_entity_type = 'organisation'
            then p_entity_id
            else null
          end,

        'partner_id',
          case
            when p_entity_type = 'partner'
            then p_entity_id
            else null
          end,

        'property_id',
          case
            when p_entity_type = 'property'
            then p_entity_id
            else null
          end,

        'development_id',
          case
            when p_entity_type = 'development'
            then p_entity_id
            else null
          end,

        'listing_id',
          case
            when p_entity_type = 'listing'
            then p_entity_id
            else null
          end,

        'metric_code', o.metric_code,
        'value_jsonb', o.value_jsonb,
        'unit', o.unit,
        'currency_iso', o.currency_iso,
        'locale', o.locale,
        'source_id', o.source_id,
        'status', o.status,
        'confidence', o.confidence,
        'provenance_method', o.provenance_method,
        'observed_at', o.observed_at,
        'valid_from', o.valid_from,
        'valid_to', o.valid_to,
        'provenance', o.provenance,
        'created_at', o.created_at
      )
      order by o.observed_at desc, o.id desc
    ),
    '[]'::jsonb
  )
  into v_result

  from zos.observations o

  where o.subject_domain_code = 'find'
    and o.subject_entity_type = p_entity_type
    and o.subject_entity_id = p_entity_id::text
    and (
      p_metric_code is null
      or o.metric_code = p_metric_code
    );

  return v_result;
end;
$$;

revoke all
on function public.zfind_list_observations(text, uuid, text)
from public, anon, authenticated;

grant execute
on function public.zfind_list_observations(text, uuid, text)
to authenticated;


-- ------------------------------------------------------------
-- 16. Canonical Observation create command
-- ------------------------------------------------------------
--
-- source_id, provenance_method and observed_at are deliberately
-- required. They are canonical provenance facts and MUST NOT be
-- guessed by the adapter or database.
-- ------------------------------------------------------------

create or replace function public.zfind_create_observation(
  p_entity_type text,
  p_entity_id uuid,
  p_metric_code text,
  p_value_jsonb jsonb,
  p_source_id uuid,
  p_provenance_method text,
  p_observed_at timestamptz,

  p_unit text default null,
  p_currency_iso text default null,
  p_locale text default null,
  p_status text default 'recorded',
  p_confidence numeric default null,
  p_valid_from timestamptz default null,
  p_valid_to timestamptz default null,
  p_provenance jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_registry_binding_id uuid;
  v_row zos.observations%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Z Find admin access required'
      using errcode = '42501';
  end if;

  if p_entity_type not in (
    'organisation',
    'partner',
    'property',
    'development',
    'listing'
  ) then
    raise exception
      'unsupported Z Find Observation entity type: %',
      p_entity_type
      using errcode = '22023';
  end if;

  if p_entity_id is null then
    raise exception 'Observation entity id is required'
      using errcode = '22004';
  end if;

  if p_source_id is null then
    raise exception 'Observation source id is required'
      using errcode = '22004';
  end if;

  if char_length(trim(coalesce(p_provenance_method, ''))) = 0 then
    raise exception 'Observation provenance method is required'
      using errcode = '22023';
  end if;

  if p_observed_at is null then
    raise exception 'Observation observed_at is required'
      using errcode = '22004';
  end if;

  select rb.id
    into v_registry_binding_id

  from zos.registry_bindings rb

  where rb.domain_code = 'find'
    and rb.local_entity_type = p_entity_type
    and rb.local_entity_id = p_entity_id::text
    and rb.retired_at is null

  order by rb.created_at desc
  limit 1;

  insert into zos.observations (
    subject_domain_code,
    subject_entity_type,
    subject_entity_id,
    registry_binding_id,
    metric_code,
    value_jsonb,
    unit,
    currency_iso,
    locale,
    source_id,
    status,
    confidence,
    provenance_method,
    provenance,
    observed_at,
    valid_from,
    valid_to
  )
  values (
    'find',
    p_entity_type,
    p_entity_id::text,
    v_registry_binding_id,
    p_metric_code,
    p_value_jsonb,
    p_unit,
    p_currency_iso,
    p_locale,
    p_source_id,
    p_status,
    p_confidence,
    p_provenance_method,
    coalesce(p_provenance, '{}'::jsonb),
    p_observed_at,
    p_valid_from,
    p_valid_to
  )
  returning *
    into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'entity_type', v_row.subject_entity_type,

    'organisation_id',
      case
        when p_entity_type = 'organisation'
        then p_entity_id
        else null
      end,

    'partner_id',
      case
        when p_entity_type = 'partner'
        then p_entity_id
        else null
      end,

    'property_id',
      case
        when p_entity_type = 'property'
        then p_entity_id
        else null
      end,

    'development_id',
      case
        when p_entity_type = 'development'
        then p_entity_id
        else null
      end,

    'listing_id',
      case
        when p_entity_type = 'listing'
        then p_entity_id
        else null
      end,

    'metric_code', v_row.metric_code,
    'value_jsonb', v_row.value_jsonb,
    'unit', v_row.unit,
    'currency_iso', v_row.currency_iso,
    'locale', v_row.locale,
    'source_id', v_row.source_id,
    'status', v_row.status,
    'confidence', v_row.confidence,
    'provenance_method', v_row.provenance_method,
    'observed_at', v_row.observed_at,
    'valid_from', v_row.valid_from,
    'valid_to', v_row.valid_to,
    'provenance', v_row.provenance,
    'created_at', v_row.created_at
  );
end;
$$;

revoke all
on function public.zfind_create_observation(
  text,
  uuid,
  text,
  jsonb,
  uuid,
  text,
  timestamptz,
  text,
  text,
  text,
  text,
  numeric,
  timestamptz,
  timestamptz,
  jsonb
)
from public, anon, authenticated;

grant execute
on function public.zfind_create_observation(
  text,
  uuid,
  text,
  jsonb,
  uuid,
  text,
  timestamptz,
  text,
  text,
  text,
  text,
  numeric,
  timestamptz,
  timestamptz,
  jsonb
)
to authenticated;


-- ------------------------------------------------------------
-- 17. Canonical Observation lifecycle command
-- ------------------------------------------------------------

create or replace function public.zfind_update_observation_lifecycle(
  p_observation_id uuid,
  p_status text default null,
  p_set_valid_to boolean default false,
  p_valid_to timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_row zos.observations%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Z Find admin access required'
      using errcode = '42501';
  end if;

  if p_observation_id is null then
    raise exception 'Observation id is required'
      using errcode = '22004';
  end if;

  if p_status is null and not p_set_valid_to then
    raise exception
      'Observation lifecycle command requires status and/or valid_to'
      using errcode = '22023';
  end if;

  update zos.observations o
  set
    status = coalesce(p_status, o.status),
    valid_to = case
      when p_set_valid_to then p_valid_to
      else o.valid_to
    end

  where o.id = p_observation_id
    and o.subject_domain_code = 'find'

  returning o.*
    into v_row;

  if v_row.id is null then
    raise exception 'Z Find Observation not found'
      using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'entity_type', v_row.subject_entity_type,
    'metric_code', v_row.metric_code,
    'value_jsonb', v_row.value_jsonb,
    'unit', v_row.unit,
    'currency_iso', v_row.currency_iso,
    'locale', v_row.locale,
    'source_id', v_row.source_id,
    'status', v_row.status,
    'confidence', v_row.confidence,
    'provenance_method', v_row.provenance_method,
    'observed_at', v_row.observed_at,
    'valid_from', v_row.valid_from,
    'valid_to', v_row.valid_to,
    'provenance', v_row.provenance,
    'created_at', v_row.created_at
  );
end;
$$;

revoke all
on function public.zfind_update_observation_lifecycle(
  uuid,
  text,
  boolean,
  timestamptz
)
from public, anon, authenticated;

grant execute
on function public.zfind_update_observation_lifecycle(
  uuid,
  text,
  boolean,
  timestamptz
)
to authenticated;


-- ------------------------------------------------------------
-- 18. Canonical Observation Evidence read port
-- ------------------------------------------------------------

create or replace function public.zfind_list_observation_evidence(
  p_observation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Z Find admin access required'
      using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'observation_id', e.observation_id,
        'evidence_type', e.evidence_type,
        'source_url', e.source_uri,
        'storage_path', e.storage_path,
        'content_hash', e.content_hash,
        'metadata', e.metadata,
        'captured_at', e.captured_at,
        'created_at', e.created_at
      )
      order by e.created_at desc, e.id desc
    ),
    '[]'::jsonb
  )
  into v_result

  from zos.observation_evidence e

  join zos.observations o
    on o.id = e.observation_id

  where e.observation_id = p_observation_id
    and o.subject_domain_code = 'find';

  return v_result;
end;
$$;

revoke all
on function public.zfind_list_observation_evidence(uuid)
from public, anon, authenticated;

grant execute
on function public.zfind_list_observation_evidence(uuid)
to authenticated;


-- ------------------------------------------------------------
-- 19. Canonical Observation Evidence append command
-- ------------------------------------------------------------

create or replace function public.zfind_add_observation_evidence(
  p_observation_id uuid,
  p_evidence_type text,
  p_source_url text default null,
  p_storage_path text default null,
  p_content_hash text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_row zos.observation_evidence%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Z Find admin access required'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from zos.observations o
    where o.id = p_observation_id
      and o.subject_domain_code = 'find'
  ) then
    raise exception 'Z Find Observation not found'
      using errcode = 'P0002';
  end if;

  insert into zos.observation_evidence (
    observation_id,
    evidence_type,
    source_uri,
    storage_path,
    content_hash,
    metadata
  )
  values (
    p_observation_id,
    p_evidence_type,
    p_source_url,
    p_storage_path,
    p_content_hash,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning *
    into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'observation_id', v_row.observation_id,
    'evidence_type', v_row.evidence_type,
    'source_url', v_row.source_uri,
    'storage_path', v_row.storage_path,
    'content_hash', v_row.content_hash,
    'metadata', v_row.metadata,
    'captured_at', v_row.captured_at,
    'created_at', v_row.created_at
  );
end;
$$;

revoke all
on function public.zfind_add_observation_evidence(
  uuid,
  text,
  text,
  text,
  text,
  jsonb
)
from public, anon, authenticated;

grant execute
on function public.zfind_add_observation_evidence(
  uuid,
  text,
  text,
  text,
  text,
  jsonb
)
to authenticated;


-- ------------------------------------------------------------
-- 20. Find Verification audit read port
-- ------------------------------------------------------------

create or replace function public.zfind_list_verification_assessments(
  p_subject_type text,
  p_subject_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Z Find admin access required'
      using errcode = '42501';
  end if;

  if p_subject_type not in (
    'partner',
    'representation',
    'property',
    'development'
  ) then
    raise exception
      'unsupported Z Find Verification subject: %',
      p_subject_type
      using errcode = '22023';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', va.id,
        'subject_type', va.subject_type,

        'partner_id',
          case
            when p_subject_type = 'partner'
            then p_subject_id
            else null
          end,

        'representation_id',
          case
            when p_subject_type = 'representation'
            then p_subject_id
            else null
          end,

        'property_id',
          case
            when p_subject_type = 'property'
            then p_subject_id
            else null
          end,

        'development_id',
          case
            when p_subject_type = 'development'
            then p_subject_id
            else null
          end,

        'verification_kind', va.verification_kind,
        'outcome', va.outcome,
        'confidence', va.confidence,
        'source_reference', va.source_reference,
        'evidence', va.evidence,
        'assessor_profile_id', va.assessor_profile_id,
        'assessed_at', va.assessed_at,
        'expires_at', va.expires_at
      )
      order by va.assessed_at desc, va.id desc
    ),
    '[]'::jsonb
  )
  into v_result

  from find.verification_assessments va

  where va.subject_type = p_subject_type
    and (
      (p_subject_type = 'partner'
        and va.partner_id = p_subject_id)

      or

      (p_subject_type = 'representation'
        and va.representation_id = p_subject_id)

      or

      (p_subject_type = 'property'
        and va.property_id = p_subject_id)

      or

      (p_subject_type = 'development'
        and va.development_id = p_subject_id)
    );

  return v_result;
end;
$$;

revoke all
on function public.zfind_list_verification_assessments(text, uuid)
from public, anon, authenticated;

grant execute
on function public.zfind_list_verification_assessments(text, uuid)
to authenticated;


-- ------------------------------------------------------------
-- 21. Find Verification append command
-- ------------------------------------------------------------

create or replace function public.zfind_create_verification_assessment(
  p_subject_type text,
  p_subject_id uuid,
  p_verification_kind text,

  p_outcome text default 'pending',
  p_confidence numeric default null,
  p_source_reference text default null,
  p_evidence jsonb default '{}'::jsonb,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_row find.verification_assessments%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Z Find admin access required'
      using errcode = '42501';
  end if;

  if p_subject_type not in (
    'partner',
    'representation',
    'property',
    'development'
  ) then
    raise exception
      'unsupported Z Find Verification subject: %',
      p_subject_type
      using errcode = '22023';
  end if;

  if char_length(trim(coalesce(p_verification_kind, ''))) = 0 then
    raise exception 'Verification kind is required'
      using errcode = '22023';
  end if;

  insert into find.verification_assessments (
    subject_type,
    partner_id,
    representation_id,
    property_id,
    development_id,
    verification_kind,
    outcome,
    confidence,
    source_reference,
    evidence,
    assessor_profile_id,
    expires_at
  )
  values (
    p_subject_type,

    case
      when p_subject_type = 'partner'
      then p_subject_id
      else null
    end,

    case
      when p_subject_type = 'representation'
      then p_subject_id
      else null
    end,

    case
      when p_subject_type = 'property'
      then p_subject_id
      else null
    end,

    case
      when p_subject_type = 'development'
      then p_subject_id
      else null
    end,

    p_verification_kind,
    p_outcome,
    p_confidence,
    p_source_reference,
    coalesce(p_evidence, '{}'::jsonb),
    auth.uid(),
    p_expires_at
  )
  returning *
    into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'subject_type', v_row.subject_type,
    'partner_id', v_row.partner_id,
    'representation_id', v_row.representation_id,
    'property_id', v_row.property_id,
    'development_id', v_row.development_id,
    'verification_kind', v_row.verification_kind,
    'outcome', v_row.outcome,
    'confidence', v_row.confidence,
    'source_reference', v_row.source_reference,
    'evidence', v_row.evidence,
    'assessor_profile_id', v_row.assessor_profile_id,
    'assessed_at', v_row.assessed_at,
    'expires_at', v_row.expires_at
  );
end;
$$;

revoke all
on function public.zfind_create_verification_assessment(
  text,
  uuid,
  text,
  text,
  numeric,
  text,
  jsonb,
  timestamptz
)
from public, anon, authenticated;

grant execute
on function public.zfind_create_verification_assessment(
  text,
  uuid,
  text,
  text,
  numeric,
  text,
  jsonb,
  timestamptz
)
to authenticated;


-- ------------------------------------------------------------
-- 22. Boundary comments
-- ------------------------------------------------------------

comment on function public.zfind_list_observations(text, uuid, text) is
  'Admin Z Find read port over canonical zos.observations. Does not create a vertical Observations store.';

comment on function public.zfind_create_observation(
  text,
  uuid,
  text,
  jsonb,
  uuid,
  text,
  timestamptz,
  text,
  text,
  text,
  text,
  numeric,
  timestamptz,
  timestamptz,
  jsonb
) is
  'Admin Z Find command into canonical zos.observations. Source, provenance method and observed time must be explicitly supplied.';

comment on function public.zfind_list_verification_assessments(text, uuid) is
  'Admin read port over Z Find-owned Verification audit truth. Verification remains separate from Trust.';

comment on function public.zfind_create_verification_assessment(
  text,
  uuid,
  text,
  text,
  numeric,
  text,
  jsonb,
  timestamptz
) is
  'Admin append-only command for Z Find Verification assessments. Assessor is derived from auth.uid(); no Trust Score is calculated.';
