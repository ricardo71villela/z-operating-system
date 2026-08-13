-- ============================================================
-- Z FIND — Partner Content + Media Boundary v1
--
-- Partner may:
--   * create/reuse a Draft Listing for an owned asset
--   * edit title + description in configured languages
--   * upload media under its own Listing/Development path
--   * reorder its own media
--   * select its own cover
--   * remove its own media
--
-- Partner may NOT:
--   * choose/reassign partner_id / representation_id / listing_id
--   * mutate Listing lifecycle status
--   * mutate translation_status/content_source
--   * attach another Partner's media
--   * mutate another Partner's storage path
--   * expose a Listing publicly without an active Representation
--
-- Existing Admin workflows remain independent.
-- ============================================================


-- ------------------------------------------------------------
-- 0. Historical Partner content/media policy convergence
--
-- Earlier operational migrations gave Partner FOR ALL policies
-- on listing_content/listing_media/development_media.
-- Those would bypass the server-owned commands introduced here.
--
-- Forward-only convergence:
-- remove Partner policies on these Z Find content/media tables;
-- narrow policies are recreated below.
--
-- Storage is shared by the wider ZOS database, so only Partner
-- policies demonstrably belonging to the listing-media bucket
-- are removed.
-- ------------------------------------------------------------

do $$
declare
  v_policy record;
begin
  for v_policy in
    select
      p.schemaname,
      p.tablename,
      p.policyname
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename in (
        'listing_content',
        'listing_media',
        'development_media',
        'media_assets',
        'media_variants',
        'media_asset_content'
      )
      and p.policyname like 'partner:%'
  loop
    execute pg_catalog.format(
      'drop policy if exists %I on %I.%I',
      v_policy.policyname,
      v_policy.schemaname,
      v_policy.tablename
    );
  end loop;


  for v_policy in
    select
      p.schemaname,
      p.tablename,
      p.policyname
    from pg_catalog.pg_policies p
    where p.schemaname = 'storage'
      and p.tablename = 'objects'
      and p.policyname like 'partner:%'
      and (
        p.policyname like '%listing-media%'
        or coalesce(p.qual, '') like '%listing-media%'
        or coalesce(p.with_check, '') like '%listing-media%'
      )
  loop
    execute pg_catalog.format(
      'drop policy if exists %I on %I.%I',
      v_policy.policyname,
      v_policy.schemaname,
      v_policy.tablename
    );
  end loop;
end;
$$;


-- ------------------------------------------------------------
-- 1. Canonical Partner Listing ownership
-- ------------------------------------------------------------

create or replace function public.zfind_partner_controls_listing(
  p_listing_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.profiles p
    join public.listings l
      on l.id = p_listing_id
    join public.representations r
      on r.id = l.representation_id
    where p.id = auth.uid()
      and p.role = 'partner_user'
      and p.partner_id is not null
      and r.partner_id = p.partner_id
      and r.status <> 'ended'
      and l.status <> 'archived'
      and (
        (
          r.target_type = 'property'
          and exists (
            select 1
            from public.properties pr
            where pr.id = r.property_id
              and pr.removed_at is null
          )
        )
        or
        (
          r.target_type = 'development'
          and exists (
            select 1
            from public.developments d
            where d.id = r.development_id
              and d.removed_at is null
          )
        )
      )
  );
$$;

revoke all
on function public.zfind_partner_controls_listing(uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.zfind_partner_controls_listing(uuid)
to authenticated;


-- ------------------------------------------------------------
-- 1B. Narrow Partner direct reads
--
-- No Partner UPDATE/DELETE policy is restored here.
-- Content writes and media structural mutations are commands.
-- ------------------------------------------------------------

drop policy if exists "partner: view own listing_content"
  on public.listing_content;

create policy "partner: view own listing_content"
on public.listing_content
for select
to authenticated
using (
  public.zfind_partner_controls_listing(listing_id)
);


drop policy if exists "partner: view own listing_media"
  on public.listing_media;

create policy "partner: view own listing_media"
on public.listing_media
for select
to authenticated
using (
  public.zfind_partner_controls_listing(listing_id)
);


drop policy if exists "partner: view own development_media"
  on public.development_media;

create policy "partner: view own development_media"
on public.development_media
for select
to authenticated
using (
  public.zfind_partner_owns_development(development_id)
);


-- ------------------------------------------------------------
-- 2. Resolve current Partner Listing for an asset
-- ------------------------------------------------------------

create or replace function public.zfind_partner_get_listing_for_asset(
  p_kind text,
  p_asset_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_partner_id uuid;
  v_listing public.listings%rowtype;
begin
  select p.partner_id
    into v_partner_id
  from public.profiles p
  where p.id = auth.uid()
    and p.role = 'partner_user';

  if v_partner_id is null then
    raise exception 'Z Find Partner access required'
      using errcode = '42501';
  end if;

  if p_kind not in ('property', 'development') then
    raise exception 'kind must be property or development'
      using errcode = '22023';
  end if;

  if p_kind = 'property' then
    if not public.zfind_partner_owns_property(p_asset_id) then
      raise exception 'Partner does not control this Property'
        using errcode = '42501';
    end if;

    select l.*
      into v_listing
    from public.representations r
    join public.listings l
      on l.representation_id = r.id
    where r.property_id = p_asset_id
      and r.partner_id = v_partner_id
      and r.status <> 'ended'
      and l.status <> 'archived'
    order by l.created_at desc, l.id desc
    limit 1;

  else
    if not public.zfind_partner_owns_development(p_asset_id) then
      raise exception 'Partner does not control this Development'
        using errcode = '42501';
    end if;

    select l.*
      into v_listing
    from public.representations r
    join public.listings l
      on l.representation_id = r.id
    where r.development_id = p_asset_id
      and r.partner_id = v_partner_id
      and r.status <> 'ended'
      and l.status <> 'archived'
    order by l.created_at desc, l.id desc
    limit 1;
  end if;

  if not found then
    return null;
  end if;

  return pg_catalog.to_jsonb(v_listing);
end;
$$;

revoke all
on function public.zfind_partner_get_listing_for_asset(text, uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.zfind_partner_get_listing_for_asset(text, uuid)
to authenticated;


-- ------------------------------------------------------------
-- 3. Partner can establish its own Draft Listing
--
-- Representation ownership remains server-derived.
-- Existing non-archived Listing is reused.
-- ------------------------------------------------------------

create or replace function public.zfind_partner_ensure_draft_listing(
  p_kind text,
  p_asset_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_partner_id uuid;
  v_rep public.representations%rowtype;
  v_listing public.listings%rowtype;
begin
  select p.partner_id
    into v_partner_id
  from public.profiles p
  where p.id = auth.uid()
    and p.role = 'partner_user';

  if v_partner_id is null then
    raise exception 'Z Find Partner access required'
      using errcode = '42501';
  end if;

  if p_kind not in ('property', 'development') then
    raise exception 'kind must be property or development'
      using errcode = '22023';
  end if;


  if p_kind = 'property' then

    perform 1
    from public.properties pr
    where pr.id = p_asset_id
      and pr.removed_at is null
    for update;

    if not found then
      raise exception 'Property not found'
        using errcode = 'P0002';
    end if;

    if not public.zfind_partner_owns_property(p_asset_id) then
      raise exception 'Partner does not control this Property'
        using errcode = '42501';
    end if;

    if exists (
      select 1
      from public.representations r
      where r.property_id = p_asset_id
        and r.partner_id <> v_partner_id
        and r.status <> 'ended'
    ) then
      raise exception
        'Another Partner has a non-ended Representation for this Property'
        using errcode = '42501';
    end if;

    select r.*
      into v_rep
    from public.representations r
    where r.property_id = p_asset_id
      and r.partner_id = v_partner_id
      and r.status <> 'ended'
    order by r.created_at desc, r.id desc
    limit 1
    for update;

    if not found then
      insert into public.representations (
        target_type,
        property_id,
        partner_id,
        status
      )
      values (
        'property',
        p_asset_id,
        v_partner_id,
        'proposed'
      )
      returning *
        into v_rep;
    end if;


  else

    perform 1
    from public.developments d
    where d.id = p_asset_id
      and d.removed_at is null
    for update;

    if not found then
      raise exception 'Development not found'
        using errcode = 'P0002';
    end if;

    if not public.zfind_partner_owns_development(p_asset_id) then
      raise exception 'Partner does not control this Development'
        using errcode = '42501';
    end if;

    if exists (
      select 1
      from public.representations r
      where r.development_id = p_asset_id
        and r.partner_id <> v_partner_id
        and r.status <> 'ended'
    ) then
      raise exception
        'Another Partner has a non-ended Representation for this Development'
        using errcode = '42501';
    end if;

    select r.*
      into v_rep
    from public.representations r
    where r.development_id = p_asset_id
      and r.partner_id = v_partner_id
      and r.status <> 'ended'
    order by r.created_at desc, r.id desc
    limit 1
    for update;

    if not found then
      insert into public.representations (
        target_type,
        development_id,
        partner_id,
        status
      )
      values (
        'development',
        p_asset_id,
        v_partner_id,
        'proposed'
      )
      returning *
        into v_rep;
    end if;

  end if;


  select l.*
    into v_listing
  from public.listings l
  where l.representation_id = v_rep.id
    and l.status <> 'archived'
  order by l.created_at desc, l.id desc
  limit 1
  for update;

  if found then
    return pg_catalog.to_jsonb(v_listing);
  end if;


  insert into public.listings (
    representation_id,
    channel,
    price_current,
    currency_iso,
    price_is_from,
    status
  )
  values (
    v_rep.id,
    'standard',
    0,
    'EUR',
    false,
    'draft'
  )
  returning *
    into v_listing;

  return pg_catalog.to_jsonb(v_listing);
end;
$$;

revoke all
on function public.zfind_partner_ensure_draft_listing(text, uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.zfind_partner_ensure_draft_listing(text, uuid)
to authenticated;


-- ------------------------------------------------------------
-- 4. Configured languages
-- ------------------------------------------------------------

create or replace function public.zfind_partner_enabled_languages()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'code', sl.code,
        'display_name', sl.display_name,
        'native_name', sl.native_name,
        'sort_order', sl.sort_order
      )
      order by sl.sort_order, sl.code
    ),
    '[]'::jsonb
  )
  from public.system_languages sl
  where sl.enabled = true
$$;

revoke all
on function public.zfind_partner_enabled_languages()
from public, anon, authenticated, service_role;

grant execute
on function public.zfind_partner_enabled_languages()
to authenticated;


-- ------------------------------------------------------------
-- 5. Content mutation command
--
-- Partner controls title + description only.
-- listing_id, locale relationship, translation lifecycle and
-- provenance stay server-owned.
-- ------------------------------------------------------------

create or replace function public.zfind_partner_upsert_listing_content(
  p_listing_id uuid,
  p_locale text,
  p_title text,
  p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_content public.listing_content%rowtype;
begin
  if not public.zfind_partner_controls_listing(p_listing_id) then
    raise exception 'Partner does not control this Listing'
      using errcode = '42501';
  end if;

  if pg_catalog.btrim(
    coalesce(p_locale, '')
  ) = '' then
    raise exception 'locale is required'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.system_languages sl
    where sl.code = p_locale
      and sl.enabled = true
  ) then
    raise exception 'Locale is not enabled in Z Find'
      using errcode = '22023';
  end if;

  perform 1
  from public.listings l
  where l.id = p_listing_id
  for update;

  insert into public.listing_content (
    listing_id,
    locale,
    title,
    description
  )
  values (
    p_listing_id,
    p_locale,
    coalesce(p_title, ''),
    p_description
  )
  on conflict (listing_id, locale)
  do update
    set title = excluded.title,
        description = excluded.description
  returning *
    into v_content;

  return pg_catalog.to_jsonb(v_content);
end;
$$;

revoke all
on function public.zfind_partner_upsert_listing_content(
  uuid, text, text, text
)
from public, anon, authenticated, service_role;

grant execute
on function public.zfind_partner_upsert_listing_content(
  uuid, text, text, text
)
to authenticated;


-- ------------------------------------------------------------
-- 6. Media path ownership
--
-- Browser bytes still go through Supabase Storage.
-- The path itself proves which controlled owner it belongs to:
--
--   listings/<listing UUID>/...
--   developments/<development UUID>/...
-- ------------------------------------------------------------

create or replace function public.zfind_partner_can_manage_media_path(
  p_name text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    exists (
      select 1
      from public.listings l
      where p_name like (
        'listings/' || l.id::text || '/%'
      )
        and public.zfind_partner_controls_listing(l.id)
    )
    or
    exists (
      select 1
      from public.developments d
      where p_name like (
        'developments/' || d.id::text || '/%'
      )
        and public.zfind_partner_owns_development(d.id)
    )
$$;

revoke all
on function public.zfind_partner_can_manage_media_path(text)
from public, anon, authenticated, service_role;

grant execute
on function public.zfind_partner_can_manage_media_path(text)
to authenticated;


create or replace function public.zfind_partner_media_asset_matches_owner(
  p_kind text,
  p_owner_id uuid,
  p_media_asset_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.media_assets ma
    where ma.id = p_media_asset_id
      and (
        (
          p_kind = 'listing'
          and ma.original_storage_path like (
            'listings/' || p_owner_id::text || '/%'
          )
          and public.zfind_partner_controls_listing(
            p_owner_id
          )
        )
        or
        (
          p_kind = 'development'
          and ma.original_storage_path like (
            'developments/' || p_owner_id::text || '/%'
          )
          and public.zfind_partner_owns_development(
            p_owner_id
          )
        )
      )
  )
$$;

revoke all
on function public.zfind_partner_media_asset_matches_owner(
  text, uuid, uuid
)
from public, anon, authenticated, service_role;

grant execute
on function public.zfind_partner_media_asset_matches_owner(
  text, uuid, uuid
)
to authenticated;


-- ------------------------------------------------------------
-- 7. Partner may read media metadata reachable from own assets
-- ------------------------------------------------------------

drop policy if exists "partner: view own media assets"
  on public.media_assets;

create policy "partner: view own media assets"
on public.media_assets
for select
to authenticated
using (
  exists (
    select 1
    from public.listing_media lm
    where lm.media_asset_id = media_assets.id
      and public.zfind_partner_controls_listing(
        lm.listing_id
      )
  )
  or
  exists (
    select 1
    from public.development_media dm
    where dm.media_asset_id = media_assets.id
      and public.zfind_partner_owns_development(
        dm.development_id
      )
  )
);


-- ------------------------------------------------------------
-- 8. Upload registration INSERT policies
--
-- No Partner UPDATE/DELETE policies are added to media tables.
-- Those operations stay behind server-owned RPCs below.
-- ------------------------------------------------------------

drop policy if exists "partner: insert own media assets"
  on public.media_assets;

create policy "partner: insert own media assets"
on public.media_assets
for insert
to authenticated
with check (
  media_type = 'image'
  and visibility = 'public'
  and public.zfind_partner_can_manage_media_path(
    original_storage_path
  )
);


drop policy if exists "partner: link own listing media"
  on public.listing_media;

create policy "partner: link own listing media"
on public.listing_media
for insert
to authenticated
with check (
  public.zfind_partner_controls_listing(listing_id)
  and public.zfind_partner_media_asset_matches_owner(
    'listing',
    listing_id,
    media_asset_id
  )
);


drop policy if exists "partner: link own development media"
  on public.development_media;

create policy "partner: link own development media"
on public.development_media
for insert
to authenticated
with check (
  public.zfind_partner_owns_development(development_id)
  and public.zfind_partner_media_asset_matches_owner(
    'development',
    development_id,
    media_asset_id
  )
);


-- ------------------------------------------------------------
-- 9. Atomic Partner media reorder
-- ------------------------------------------------------------

create or replace function public.zfind_partner_reorder_media(
  p_kind text,
  p_owner_id uuid,
  p_media_asset_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_ids uuid[] :=
    coalesce(
      p_media_asset_ids,
      array[]::uuid[]
    );
  v_requested integer;
  v_distinct integer;
  v_existing integer;
begin
  if p_kind not in ('listing', 'development') then
    raise exception 'kind must be listing or development'
      using errcode = '22023';
  end if;

  if p_kind = 'listing' then
    if not public.zfind_partner_controls_listing(
      p_owner_id
    ) then
      raise exception 'Partner does not control this Listing'
        using errcode = '42501';
    end if;

    perform 1
    from public.listings l
    where l.id = p_owner_id
    for update;

  else
    if not public.zfind_partner_owns_development(
      p_owner_id
    ) then
      raise exception 'Partner does not control this Development'
        using errcode = '42501';
    end if;

    perform 1
    from public.developments d
    where d.id = p_owner_id
    for update;
  end if;


  select pg_catalog.count(*)
    into v_requested
  from pg_catalog.unnest(v_ids) u(id);

  select pg_catalog.count(distinct u.id)
    into v_distinct
  from pg_catalog.unnest(v_ids) u(id);

  if v_requested <> v_distinct then
    raise exception 'Media order contains duplicates or null IDs'
      using errcode = '22023';
  end if;


  if p_kind = 'listing' then

    select pg_catalog.count(*)
      into v_existing
    from public.listing_media lm
    where lm.listing_id = p_owner_id;

    if v_existing <> v_requested
       or exists (
         select 1
         from public.listing_media lm
         where lm.listing_id = p_owner_id
           and not (
             lm.media_asset_id = any(v_ids)
           )
       ) then
      raise exception
        'Media order must contain the complete Listing gallery exactly once'
        using errcode = '22023';
    end if;

    update public.listing_media lm
       set position = ordered.ordinality - 1
      from pg_catalog.unnest(v_ids)
        with ordinality
        as ordered(media_asset_id, ordinality)
     where lm.listing_id = p_owner_id
       and lm.media_asset_id = ordered.media_asset_id;


  else

    select pg_catalog.count(*)
      into v_existing
    from public.development_media dm
    where dm.development_id = p_owner_id;

    if v_existing <> v_requested
       or exists (
         select 1
         from public.development_media dm
         where dm.development_id = p_owner_id
           and not (
             dm.media_asset_id = any(v_ids)
           )
       ) then
      raise exception
        'Media order must contain the complete Development gallery exactly once'
        using errcode = '22023';
    end if;

    update public.development_media dm
       set position = ordered.ordinality - 1
      from pg_catalog.unnest(v_ids)
        with ordinality
        as ordered(media_asset_id, ordinality)
     where dm.development_id = p_owner_id
       and dm.media_asset_id = ordered.media_asset_id;

  end if;

  return pg_catalog.jsonb_build_object(
    'kind', p_kind,
    'owner_id', p_owner_id,
    'media_asset_ids', pg_catalog.to_jsonb(v_ids)
  );
end;
$$;

revoke all
on function public.zfind_partner_reorder_media(
  text, uuid, uuid[]
)
from public, anon, authenticated, service_role;

grant execute
on function public.zfind_partner_reorder_media(
  text, uuid, uuid[]
)
to authenticated;


-- ------------------------------------------------------------
-- 10. Atomic Partner cover selection
-- ------------------------------------------------------------

create or replace function public.zfind_partner_set_media_cover(
  p_kind text,
  p_owner_id uuid,
  p_media_asset_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_kind not in ('listing', 'development') then
    raise exception 'kind must be listing or development'
      using errcode = '22023';
  end if;


  if p_kind = 'listing' then

    if not public.zfind_partner_controls_listing(
      p_owner_id
    ) then
      raise exception 'Partner does not control this Listing'
        using errcode = '42501';
    end if;

    perform 1
    from public.listings l
    where l.id = p_owner_id
    for update;

    if not exists (
      select 1
      from public.listing_media lm
      where lm.listing_id = p_owner_id
        and lm.media_asset_id = p_media_asset_id
        and public.zfind_partner_media_asset_matches_owner(
          'listing',
          p_owner_id,
          p_media_asset_id
        )
    ) then
      raise exception 'Media does not belong to this Listing'
        using errcode = '42501';
    end if;

    update public.listing_media
       set is_cover = false
     where listing_id = p_owner_id;

    update public.listing_media
       set is_cover = true
     where listing_id = p_owner_id
       and media_asset_id = p_media_asset_id;


  else

    if not public.zfind_partner_owns_development(
      p_owner_id
    ) then
      raise exception 'Partner does not control this Development'
        using errcode = '42501';
    end if;

    perform 1
    from public.developments d
    where d.id = p_owner_id
    for update;

    if not exists (
      select 1
      from public.development_media dm
      where dm.development_id = p_owner_id
        and dm.media_asset_id = p_media_asset_id
        and public.zfind_partner_media_asset_matches_owner(
          'development',
          p_owner_id,
          p_media_asset_id
        )
    ) then
      raise exception
        'Media does not belong to this Development'
        using errcode = '42501';
    end if;

    update public.development_media
       set is_cover = false
     where development_id = p_owner_id;

    update public.development_media
       set is_cover = true
     where development_id = p_owner_id
       and media_asset_id = p_media_asset_id;

  end if;

  return pg_catalog.jsonb_build_object(
    'kind', p_kind,
    'owner_id', p_owner_id,
    'media_asset_id', p_media_asset_id
  );
end;
$$;

revoke all
on function public.zfind_partner_set_media_cover(
  text, uuid, uuid
)
from public, anon, authenticated, service_role;

grant execute
on function public.zfind_partner_set_media_cover(
  text, uuid, uuid
)
to authenticated;


-- ------------------------------------------------------------
-- 11. Partner media unlink/removal
--
-- The client does NOT supply the storage path.
-- The server returns the authoritative path after ownership checks.
-- ------------------------------------------------------------

create or replace function public.zfind_partner_unlink_media(
  p_kind text,
  p_owner_id uuid,
  p_media_asset_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_storage_path text;
  v_was_cover boolean := false;
  v_remaining_links boolean := false;
begin
  if p_kind not in ('listing', 'development') then
    raise exception 'kind must be listing or development'
      using errcode = '22023';
  end if;


  if p_kind = 'listing' then

    if not public.zfind_partner_controls_listing(
      p_owner_id
    ) then
      raise exception 'Partner does not control this Listing'
        using errcode = '42501';
    end if;

    perform 1
    from public.listings l
    where l.id = p_owner_id
    for update;

    select
      ma.original_storage_path,
      lm.is_cover
      into
      v_storage_path,
      v_was_cover
    from public.listing_media lm
    join public.media_assets ma
      on ma.id = lm.media_asset_id
    where lm.listing_id = p_owner_id
      and lm.media_asset_id = p_media_asset_id
      and ma.original_storage_path like (
        'listings/' || p_owner_id::text || '/%'
      )
    for update of lm;

    if not found then
      raise exception 'Media does not belong to this Listing'
        using errcode = '42501';
    end if;

    delete from public.listing_media
    where listing_id = p_owner_id
      and media_asset_id = p_media_asset_id;

    if v_was_cover then
      update public.listing_media lm
         set is_cover = true
       where lm.listing_id = p_owner_id
         and lm.media_asset_id = (
           select lm2.media_asset_id
           from public.listing_media lm2
           where lm2.listing_id = p_owner_id
           order by lm2.position, lm2.media_asset_id
           limit 1
         );
    end if;


  else

    if not public.zfind_partner_owns_development(
      p_owner_id
    ) then
      raise exception 'Partner does not control this Development'
        using errcode = '42501';
    end if;

    perform 1
    from public.developments d
    where d.id = p_owner_id
    for update;

    select
      ma.original_storage_path,
      dm.is_cover
      into
      v_storage_path,
      v_was_cover
    from public.development_media dm
    join public.media_assets ma
      on ma.id = dm.media_asset_id
    where dm.development_id = p_owner_id
      and dm.media_asset_id = p_media_asset_id
      and ma.original_storage_path like (
        'developments/' || p_owner_id::text || '/%'
      )
    for update of dm;

    if not found then
      raise exception 'Media does not belong to this Development'
        using errcode = '42501';
    end if;

    delete from public.development_media
    where development_id = p_owner_id
      and media_asset_id = p_media_asset_id;

    if v_was_cover then
      update public.development_media dm
         set is_cover = true
       where dm.development_id = p_owner_id
         and dm.media_asset_id = (
           select dm2.media_asset_id
           from public.development_media dm2
           where dm2.development_id = p_owner_id
           order by dm2.position, dm2.media_asset_id
           limit 1
         );
    end if;

  end if;


  select
    exists (
      select 1
      from public.listing_media lm
      where lm.media_asset_id = p_media_asset_id
    )
    or
    exists (
      select 1
      from public.development_media dm
      where dm.media_asset_id = p_media_asset_id
    )
    into v_remaining_links;


  if not v_remaining_links then
    delete from public.media_asset_content
    where media_asset_id = p_media_asset_id;

    delete from public.media_variants
    where media_asset_id = p_media_asset_id;

    delete from public.media_assets
    where id = p_media_asset_id;
  end if;


  return pg_catalog.jsonb_build_object(
    'kind', p_kind,
    'owner_id', p_owner_id,
    'media_asset_id', p_media_asset_id,
    'storage_path', v_storage_path,
    'delete_storage', not v_remaining_links
  );
end;
$$;

revoke all
on function public.zfind_partner_unlink_media(
  text, uuid, uuid
)
from public, anon, authenticated, service_role;

grant execute
on function public.zfind_partner_unlink_media(
  text, uuid, uuid
)
to authenticated;


-- ------------------------------------------------------------
-- 12. Partner Storage boundary
--
-- Existing Admin Storage policies are intentionally untouched.
-- ------------------------------------------------------------

drop policy if exists "partner: read own listing-media files"
  on storage.objects;

create policy "partner: read own listing-media files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'listing-media'
  and public.zfind_partner_can_manage_media_path(name)
);


drop policy if exists "partner: upload own listing-media files"
  on storage.objects;

create policy "partner: upload own listing-media files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'listing-media'
  and public.zfind_partner_can_manage_media_path(name)
);


drop policy if exists "partner: update own listing-media files"
  on storage.objects;

create policy "partner: update own listing-media files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'listing-media'
  and public.zfind_partner_can_manage_media_path(name)
)
with check (
  bucket_id = 'listing-media'
  and public.zfind_partner_can_manage_media_path(name)
);


drop policy if exists "partner: delete own listing-media files"
  on storage.objects;

create policy "partner: delete own listing-media files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'listing-media'
  and public.zfind_partner_can_manage_media_path(name)
);


-- ------------------------------------------------------------
-- 13. Public publication defence-in-depth
--
-- A published Listing is visible to anon only while its
-- Representation is ACTIVE and its target is not operationally removed.
-- ------------------------------------------------------------

drop policy if exists "public read published listings"
  on public.listings;

create policy "public read published listings"
on public.listings
for select
to anon
using (
  status = 'published'
  and exists (
    select 1
    from public.representations r
    where r.id = listings.representation_id
      and r.status = 'active'
      and (
        (
          r.target_type = 'property'
          and exists (
            select 1
            from public.properties pr
            where pr.id = r.property_id
              and pr.removed_at is null
          )
        )
        or
        (
          r.target_type = 'development'
          and exists (
            select 1
            from public.developments d
            where d.id = r.development_id
              and d.removed_at is null
          )
        )
      )
  )
);


comment on function public.zfind_partner_ensure_draft_listing(
  text, uuid
) is
'Allows the authenticated Partner to establish/reuse its own non-archived Listing as a draft authoring workspace without granting lifecycle publication authority.';

comment on function public.zfind_partner_upsert_listing_content(
  uuid, text, text, text
) is
'Partner-owned content command. Only title and description are accepted; translation lifecycle/provenance and Listing ownership stay server-owned.';

comment on function public.zfind_partner_unlink_media(
  text, uuid, uuid
) is
'Partner-owned media unlink command. Storage path is resolved server-side so the browser cannot request arbitrary object deletion.';
