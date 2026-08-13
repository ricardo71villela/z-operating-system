-- ============================================================
-- Z FIND — ADMIN ATOMIC INITIAL LISTING v1
-- ============================================================
-- Makes the initial Representation + Listing bootstrap one
-- PostgreSQL transaction.
--
-- Important:
-- - this is an Admin command, so partner_id is deliberately selected
--   by the Admin;
-- - this command does NOT redefine Listing versioning semantics;
-- - existing state-history triggers remain authoritative and fire
--   normally for both INSERTs;
-- - an existing single Representation without a Listing is reused,
--   allowing recovery from a previously interrupted two-step bootstrap.
-- ============================================================

create or replace function public.zfind_admin_create_initial_listing(
  p_kind text,
  p_owner_id uuid,
  p_partner_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_rep public.representations%rowtype;
  v_listing public.listings%rowtype;
  v_rep_count integer;
  v_listing_count integer;
begin
  -- ----------------------------------------------------------
  -- Authentication / authorization belongs at the command
  -- boundary. Never trust the browser merely because this RPC
  -- is called from the Admin UI.
  -- ----------------------------------------------------------
  if auth.uid() is null or not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  ) then
    raise exception 'Admin authentication required'
      using errcode = '42501';
  end if;

  -- ----------------------------------------------------------
  -- Validate command arguments.
  -- ----------------------------------------------------------
  if p_kind is null or p_kind not in ('property', 'development') then
    raise exception 'kind must be property or development'
      using errcode = '22023';
  end if;

  if p_owner_id is null then
    raise exception 'owner_id is required'
      using errcode = '22023';
  end if;

  if p_partner_id is null then
    raise exception 'partner_id is required'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.partners p
    where p.id = p_partner_id
  ) then
    raise exception 'Partner not found'
      using errcode = '22023';
  end if;

  -- ----------------------------------------------------------
  -- Lock the represented target.
  --
  -- This serializes competing bootstrap commands for the same
  -- Property/Development. A second transaction cannot observe
  -- "nothing exists" concurrently and create a duplicate graph.
  -- ----------------------------------------------------------
  if p_kind = 'property' then
    perform 1
    from public.properties p
    where p.id = p_owner_id
    for update;

    if not found then
      raise exception 'Property not found'
        using errcode = '22023';
    end if;
  else
    perform 1
    from public.developments d
    where d.id = p_owner_id
    for update;

    if not found then
      raise exception 'Development not found'
        using errcode = '22023';
    end if;
  end if;

  -- ----------------------------------------------------------
  -- This command is ONLY the initial bootstrap.
  --
  -- The schema intentionally permits multiple non-published
  -- Listings for future versioning workflows. We therefore do
  -- not add a database uniqueness constraint here.
  -- ----------------------------------------------------------
  select count(*)
  into v_listing_count
  from public.listings l
  join public.representations r
    on r.id = l.representation_id
  where
    (
      p_kind = 'property'
      and r.target_type = 'property'
      and r.property_id = p_owner_id
    )
    or
    (
      p_kind = 'development'
      and r.target_type = 'development'
      and r.development_id = p_owner_id
    );

  if v_listing_count > 0 then
    raise exception 'Initial listing already exists for this target'
      using errcode = '55000';
  end if;

  -- ----------------------------------------------------------
  -- Recover safely from a previous interrupted bootstrap:
  -- if exactly one Representation exists and no Listing exists,
  -- reuse it instead of manufacturing a second Representation.
  -- ----------------------------------------------------------
  select count(*)
  into v_rep_count
  from public.representations r
  where
    (
      p_kind = 'property'
      and r.target_type = 'property'
      and r.property_id = p_owner_id
    )
    or
    (
      p_kind = 'development'
      and r.target_type = 'development'
      and r.development_id = p_owner_id
    );

  if v_rep_count > 1 then
    raise exception 'Multiple representations exist without a listing; manual resolution required'
      using errcode = '55000';
  end if;

  if v_rep_count = 1 then
    select r.*
    into v_rep
    from public.representations r
    where
      (
        p_kind = 'property'
        and r.target_type = 'property'
        and r.property_id = p_owner_id
      )
      or
      (
        p_kind = 'development'
        and r.target_type = 'development'
        and r.development_id = p_owner_id
      )
    for update;

    if v_rep.partner_id <> p_partner_id then
      raise exception 'Existing representation belongs to a different partner'
        using errcode = '55000';
    end if;

    if v_rep.status not in ('proposed', 'active') then
      raise exception 'Existing representation is not eligible for initial listing bootstrap'
        using errcode = '55000';
    end if;
  else
    if p_kind = 'property' then
      insert into public.representations (
        target_type,
        property_id,
        partner_id,
        status
      )
      values (
        'property',
        p_owner_id,
        p_partner_id,
        'proposed'
      )
      returning *
      into v_rep;
    else
      insert into public.representations (
        target_type,
        development_id,
        partner_id,
        status
      )
      values (
        'development',
        p_owner_id,
        p_partner_id,
        'proposed'
      )
      returning *
      into v_rep;
    end if;
  end if;

  -- ----------------------------------------------------------
  -- The INSERT fires trg_zfind_listing_state_history.
  -- A newly-created Representation likewise fires its own
  -- lifecycle-history trigger.
  -- ----------------------------------------------------------
  insert into public.listings (
    representation_id,
    channel,
    price_current,
    currency_iso,
    status
  )
  values (
    v_rep.id,
    'standard',
    0,
    'EUR',
    'draft'
  )
  returning *
  into v_listing;

  return to_jsonb(v_listing);
end;
$$;

comment on function public.zfind_admin_create_initial_listing(
  text,
  uuid,
  uuid
) is
  'Admin-only atomic bootstrap of an initial Z Find Listing. Reuses one eligible orphan Representation when present; otherwise creates Representation proposed + Listing draft in one transaction.';

revoke all
on function public.zfind_admin_create_initial_listing(
  text,
  uuid,
  uuid
)
from public, anon, authenticated, service_role;

grant execute
on function public.zfind_admin_create_initial_listing(
  text,
  uuid,
  uuid
)
to authenticated;
