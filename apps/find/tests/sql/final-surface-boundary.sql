-- ============================================================
-- Z FIND — FINAL PRODUCTION SURFACE AUDIT v1
--
-- READ ONLY except for assertion exceptions.
-- No data or schema mutation.
-- ============================================================

do $audit$
declare
  v_expected_functions integer := 27;
  v_found_functions integer;
begin

  -- ----------------------------------------------------------
  -- 0. Installed Z Find functions must contain no invalid
  -- PostgreSQL special-form schema qualification.
  --
  -- Historical migration text is immutable; live function
  -- definitions are the production source of truth.
  -- ----------------------------------------------------------

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
      'FINAL AUDIT FAIL: live Z Find function contains invalid PostgreSQL special-form qualification';
  end if;


  -- ----------------------------------------------------------
  -- A. RLS must exist on every sensitive marketplace table.
  -- ----------------------------------------------------------

  if exists (
    select 1
    from (
      values
        ('public', 'partners'),
        ('public', 'profiles'),
        ('public', 'properties'),
        ('public', 'developments'),
        ('public', 'representations'),
        ('public', 'listings'),
        ('public', 'listing_content'),
        ('public', 'listing_media'),
        ('public', 'development_media'),
        ('public', 'media_assets'),
        ('public', 'media_variants'),
        ('public', 'media_asset_content'),
        ('public', 'property_features'),
        ('public', 'development_features'),
        ('public', 'leads')
    ) as expected(schema_name, table_name)
    left join pg_catalog.pg_namespace n
      on n.nspname = expected.schema_name
    left join pg_catalog.pg_class c
      on c.relnamespace = n.oid
     and c.relname = expected.table_name
    where c.oid is null
       or not c.relrowsecurity
  ) then
    raise exception
      'FINAL AUDIT FAIL: sensitive table missing RLS';
  end if;


  -- ----------------------------------------------------------
  -- B. No Partner FOR ALL bypass on protected domain tables.
  -- ----------------------------------------------------------

  if exists (
    select 1
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.policyname like 'partner:%'
      and p.tablename in (
        'properties',
        'developments',
        'representations',
        'listings',
        'listing_content',
        'listing_media',
        'development_media',
        'media_assets',
        'property_features',
        'development_features'
      )
      and p.cmd = 'ALL'
  ) then
    raise exception
      'FINAL AUDIT FAIL: Partner FOR ALL policy remains';
  end if;


  -- ----------------------------------------------------------
  -- C. Representation structural writes are server-owned.
  -- ----------------------------------------------------------

  if exists (
    select 1
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'representations'
      and p.policyname like 'partner:%'
      and p.cmd <> 'SELECT'
  ) then
    raise exception
      'FINAL AUDIT FAIL: Partner can mutate Representations directly';
  end if;


  -- ----------------------------------------------------------
  -- D. Properties / Developments direct Partner mutation closed.
  -- ----------------------------------------------------------

  if exists (
    select 1
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename in (
        'properties',
        'developments'
      )
      and p.policyname like 'partner:%'
      and p.cmd <> 'SELECT'
  ) then
    raise exception
      'FINAL AUDIT FAIL: Partner direct asset mutation policy remains';
  end if;


  -- ----------------------------------------------------------
  -- E. Content direct write bypass closed.
  -- ----------------------------------------------------------

  if exists (
    select 1
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'listing_content'
      and p.policyname like 'partner:%'
      and p.cmd <> 'SELECT'
  ) then
    raise exception
      'FINAL AUDIT FAIL: Partner direct listing_content mutation remains';
  end if;


  -- ----------------------------------------------------------
  -- F. Media tables:
  -- Partner may SELECT and ownership-validated INSERT only.
  -- UPDATE/DELETE structural mutations are RPC-owned.
  -- ----------------------------------------------------------

  if exists (
    select 1
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename in (
        'listing_media',
        'development_media',
        'media_assets'
      )
      and p.policyname like 'partner:%'
      and p.cmd not in ('SELECT', 'INSERT')
  ) then
    raise exception
      'FINAL AUDIT FAIL: Partner direct media UPDATE/DELETE remains';
  end if;


  -- ----------------------------------------------------------
  -- G. Listing UPDATE columns exposed to authenticated role
  -- must be exactly the approved commercial set.
  -- ----------------------------------------------------------

  if (
    select coalesce(
      array_agg(
        cp.column_name::text
        order by cp.column_name::text
      ),
      array[]::text[]
    )
    from information_schema.column_privileges cp
    where cp.table_schema = 'public'
      and cp.table_name = 'listings'
      and cp.grantee = 'authenticated'
      and cp.privilege_type = 'UPDATE'
  ) <> array[
    'channel',
    'currency_iso',
    'price_current',
    'price_is_from',
    'rental_period',
    'tier'
  ]::text[] then
    raise exception
      'FINAL AUDIT FAIL: Listing authenticated UPDATE columns drifted';
  end if;


  -- ----------------------------------------------------------
  -- H. Public Listing policy must require:
  -- published + active Representation + non-removed target.
  -- ----------------------------------------------------------

  if not exists (
    select 1
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'listings'
      and p.policyname =
        'public read published listings'
      and p.cmd = 'SELECT'
      and 'anon' = any(p.roles)
      and p.qual like '%status = ''published''%'
      and p.qual like '%r.status = ''active''%'
      and p.qual like '%removed_at IS NULL%'
  ) then
    raise exception
      'FINAL AUDIT FAIL: public Listing visibility invariant missing';
  end if;


  -- ----------------------------------------------------------
  -- I. Server-owned RPC inventory.
  -- Every mutation/authority command below must:
  --   SECURITY DEFINER
  --   search_path=pg_catalog
  --   authenticated execute = true
  --   anon execute = false
  -- ----------------------------------------------------------

  with expected(name) as (
    values
      ('zfind_admin_create_initial_listing'),
      ('zfind_admin_delete_asset'),
      ('zfind_admin_duplicate_asset'),
      ('zfind_admin_reorder_media'),
      ('zfind_admin_replace_features'),
      ('zfind_admin_set_media_cover'),
      ('zfind_admin_transition_listing'),
      ('zfind_admin_transition_representation'),

      ('zfind_partner_create_property'),
      ('zfind_partner_create_development'),
      ('zfind_create_property'),
      ('zfind_update_asset'),
      ('zfind_replace_features'),

      ('zfind_partner_controls_representation'),
      ('zfind_partner_owns_development'),
      ('zfind_partner_owns_property'),
      ('zfind_partner_remove_asset'),

      ('zfind_partner_controls_listing'),
      ('zfind_partner_get_listing_for_asset'),
      ('zfind_partner_ensure_draft_listing'),
      ('zfind_partner_enabled_languages'),
      ('zfind_partner_upsert_listing_content'),
      ('zfind_partner_can_manage_media_path'),
      ('zfind_partner_media_asset_matches_owner'),
      ('zfind_partner_reorder_media'),
      ('zfind_partner_set_media_cover'),
      ('zfind_partner_unlink_media')
  )
  select count(distinct p.proname)
    into v_found_functions
  from expected e
  join pg_catalog.pg_proc p
    on p.proname = e.name
  join pg_catalog.pg_namespace n
    on n.oid = p.pronamespace
   and n.nspname = 'public'
  where p.prosecdef
    and 'search_path=pg_catalog' =
      any(coalesce(p.proconfig, array[]::text[]))
    and has_function_privilege(
      'authenticated',
      p.oid,
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon',
      p.oid,
      'EXECUTE'
    );

  -- Inventory currently contains 27 canonical commands/helpers.
  if v_found_functions <> v_expected_functions then
    raise exception
      'FINAL AUDIT FAIL: hardened RPC inventory mismatch: found % expected %',
      v_found_functions,
      v_expected_functions;
  end if;


  -- ----------------------------------------------------------
  -- J. Partner profiles must always be linked to a Partner.
  -- ----------------------------------------------------------

  if exists (
    select 1
    from public.profiles p
    where p.role = 'partner_user'
      and p.partner_id is null
  ) then
    raise exception
      'FINAL AUDIT FAIL: partner_user profile without partner_id';
  end if;


  -- ----------------------------------------------------------
  -- K. Marketplace lifecycle data invariants.
  -- ----------------------------------------------------------

  if exists (
    select 1
    from public.listings l
    join public.representations r
      on r.id = l.representation_id
    where l.status = 'published'
      and r.status <> 'active'
  ) then
    raise exception
      'FINAL AUDIT FAIL: published Listing with non-active Representation';
  end if;


  if exists (
    select 1
    from public.listings l
    where l.status = 'published'
      and l.price_current <= 0
  ) then
    raise exception
      'FINAL AUDIT FAIL: published Listing with non-positive price';
  end if;


  if exists (
    select 1
    from public.listings l
    where l.status = 'published'
      and not exists (
        select 1
        from public.listing_content lc
        where lc.listing_id = l.id
          and btrim(coalesce(lc.title, '')) <> ''
          and btrim(coalesce(lc.description, '')) <> ''
      )
  ) then
    raise exception
      'FINAL AUDIT FAIL: published Listing missing required content';
  end if;


  if exists (
    select 1
    from public.listings l
    join public.representations r
      on r.id = l.representation_id
    left join public.properties pr
      on r.target_type = 'property'
     and pr.id = r.property_id
    left join public.developments d
      on r.target_type = 'development'
     and d.id = r.development_id
    where l.status = 'published'
      and (
        (
          r.target_type = 'property'
          and pr.removed_at is not null
        )
        or
        (
          r.target_type = 'development'
          and d.removed_at is not null
        )
      )
  ) then
    raise exception
      'FINAL AUDIT FAIL: removed asset still has published Listing';
  end if;


  if exists (
    select 1
    from public.listings l
    where l.status = 'published'
    group by l.representation_id
    having count(*) > 1
  ) then
    raise exception
      'FINAL AUDIT FAIL: multiple published Listings for one Representation';
  end if;


  -- ----------------------------------------------------------
  -- L. Active Representation uniqueness.
  -- ----------------------------------------------------------

  if exists (
    select 1
    from public.representations r
    where r.status = 'active'
      and r.property_id is not null
    group by r.property_id
    having count(*) > 1
  ) then
    raise exception
      'FINAL AUDIT FAIL: multiple active Representations for Property';
  end if;


  if exists (
    select 1
    from public.representations r
    where r.status = 'active'
      and r.development_id is not null
    group by r.development_id
    having count(*) > 1
  ) then
    raise exception
      'FINAL AUDIT FAIL: multiple active Representations for Development';
  end if;


  -- ----------------------------------------------------------
  -- M. Removed assets cannot retain active Representation.
  -- ----------------------------------------------------------

  if exists (
    select 1
    from public.representations r
    join public.properties pr
      on pr.id = r.property_id
    where pr.removed_at is not null
      and r.status = 'active'
  ) then
    raise exception
      'FINAL AUDIT FAIL: removed Property has active Representation';
  end if;


  if exists (
    select 1
    from public.representations r
    join public.developments d
      on d.id = r.development_id
    where d.removed_at is not null
      and r.status = 'active'
  ) then
    raise exception
      'FINAL AUDIT FAIL: removed Development has active Representation';
  end if;


  -- ----------------------------------------------------------
  -- N. Media ownership/path integrity.
  -- ----------------------------------------------------------

  if exists (
    select 1
    from public.listing_media lm
    join public.media_assets ma
      on ma.id = lm.media_asset_id
    where ma.original_storage_path not like (
      'listings/' || lm.listing_id::text || '/%'
    )
  ) then
    raise exception
      'FINAL AUDIT FAIL: Listing media path/owner mismatch';
  end if;


  if exists (
    select 1
    from public.development_media dm
    join public.media_assets ma
      on ma.id = dm.media_asset_id
    where ma.original_storage_path not like (
      'developments/' ||
      dm.development_id::text ||
      '/%'
    )
  ) then
    raise exception
      'FINAL AUDIT FAIL: Development media path/owner mismatch';
  end if;


  -- ----------------------------------------------------------
  -- O. Gallery cover invariant.
  -- ----------------------------------------------------------

  if exists (
    select 1
    from public.listing_media lm
    where lm.is_cover
    group by lm.listing_id
    having count(*) > 1
  ) then
    raise exception
      'FINAL AUDIT FAIL: Listing has multiple covers';
  end if;


  if exists (
    select 1
    from public.development_media dm
    where dm.is_cover
    group by dm.development_id
    having count(*) > 1
  ) then
    raise exception
      'FINAL AUDIT FAIL: Development has multiple covers';
  end if;


  -- ----------------------------------------------------------
  -- P. Gallery position integrity.
  -- ----------------------------------------------------------

  if exists (
    select 1
    from public.listing_media lm
    group by lm.listing_id, lm.position
    having count(*) > 1
  ) then
    raise exception
      'FINAL AUDIT FAIL: duplicate Listing media positions';
  end if;


  if exists (
    select 1
    from public.development_media dm
    group by dm.development_id, dm.position
    having count(*) > 1
  ) then
    raise exception
      'FINAL AUDIT FAIL: duplicate Development media positions';
  end if;


  -- ----------------------------------------------------------
  -- Q. Effective Z FIND anon write surface.
  --
  -- IMPORTANT ARCHITECTURE:
  -- the Supabase database is shared across ZOS verticals.
  -- public schema therefore contains tables that do NOT belong
  -- to Z Find.
  --
  -- This audit must prove the Z Find boundary only; it must not
  -- reject legitimate RLS policies owned by Z Mobility, Z Jobs,
  -- or another vertical.
  --
  -- Z Find deliberately has THREE anonymous append-only intake
  -- surfaces:
  --
  --   leads
  --   searches
  --   seller_leads
  --
  -- No other Z Find public table may expose effective anonymous
  -- INSERT / UPDATE / DELETE / ALL authority.
  -- ----------------------------------------------------------

  if exists (
    select 1
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'

      and p.tablename in (
        'system_languages',
        'organisations',
        'partners',
        'zones_lite',
        'developments',
        'properties',
        'representations',
        'listings',
        'listing_content',
        'media_assets',
        'media_variants',
        'listing_media',
        'development_media',
        'media_asset_content',
        'leads',
        'searches',
        'profiles',
        'features',
        'property_features',
        'seller_leads',
        'development_features',
        'price_history',
        'partner_types',
        'registry_bindings',
        'listing_state_history',
        'representation_state_history',
        'verification_assessments',
        'data_sources',
        'data_metric_definitions',
        'data_observations',
        'observation_evidence',
        'integration_outbox',
        'identity_bindings',
        'verification_publication_rules'
      )

      and p.cmd in (
        'ALL',
        'INSERT',
        'UPDATE',
        'DELETE'
      )

      and (
        'anon' = any(p.roles)
        or
        'public' = any(p.roles)
      )

      and p.tablename not in (
        'leads',
        'searches',
        'seller_leads'
      )
  ) then
    raise exception
      'FINAL AUDIT FAIL: unexpected effective anonymous Z Find write policy';
  end if;


  -- All three intended anonymous Z Find entry points are
  -- append-only. UPDATE / DELETE / ALL is forbidden.
  if exists (
    select 1
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'

      and p.tablename in (
        'leads',
        'searches',
        'seller_leads'
      )

      and p.cmd in (
        'ALL',
        'UPDATE',
        'DELETE'
      )

      and (
        'anon' = any(p.roles)
        or
        'public' = any(p.roles)
      )
  ) then
    raise exception
      'FINAL AUDIT FAIL: anonymous Z Find intake path is not append-only';
  end if;


  -- Each deliberate intake surface must still have an INSERT
  -- policy applicable to anon/public. This catches accidental
  -- removal as well as accidental privilege expansion.
  if (
    select count(distinct p.tablename)
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'

      and p.tablename in (
        'leads',
        'searches',
        'seller_leads'
      )

      and p.cmd = 'INSERT'

      and (
        'anon' = any(p.roles)
        or
        'public' = any(p.roles)
      )
  ) <> 3 then
    raise exception
      'FINAL AUDIT FAIL: expected Z Find anonymous intake INSERT policies are incomplete';
  end if;


end;
$audit$;


-- ============================================================
-- HUMAN-READABLE SNAPSHOT
-- ============================================================

select jsonb_build_object(

  'data_counts',
  jsonb_build_object(
    'partners',
      (select count(*) from public.partners),
    'properties',
      (select count(*) from public.properties),
    'developments',
      (select count(*) from public.developments),
    'representations',
      (select count(*) from public.representations),
    'listings',
      (select count(*) from public.listings),
    'published_listings',
      (
        select count(*)
        from public.listings
        where status = 'published'
      ),
    'leads',
      (select count(*) from public.leads),
    'listing_content',
      (select count(*) from public.listing_content),
    'media_assets',
      (select count(*) from public.media_assets),
    'listing_media',
      (select count(*) from public.listing_media),
    'development_media',
      (select count(*) from public.development_media),
    'verification_assessments',
      (
        select count(*)
        from find.verification_assessments
      ),
    'listing_state_history',
      (
        select count(*)
        from find.listing_state_history
      ),
    'representation_state_history',
      (
        select count(*)
        from find.representation_state_history
      )
  ),

  'partner_policies',
  (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'table', p.tablename,
          'policy', p.policyname,
          'cmd', p.cmd
        )
        order by p.tablename, p.policyname
      ),
      '[]'::jsonb
    )
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.policyname like 'partner:%'
  ),

  'anon_raw_write_privileges',
  (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'table', tp.table_name,
          'privilege', tp.privilege_type
        )
        order by tp.table_name, tp.privilege_type
      ),
      '[]'::jsonb
    )
    from information_schema.table_privileges tp
    where tp.table_schema = 'public'
      and tp.grantee = 'anon'
      and tp.privilege_type in (
        'INSERT',
        'UPDATE',
        'DELETE'
      )
  ),

  'zfind_anon_effective_write_policies',
  (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'table', p.tablename,
          'policy', p.policyname,
          'command', p.cmd,
          'roles', p.roles
        )
        order by p.tablename, p.policyname
      ),
      '[]'::jsonb
    )
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'

      and p.tablename in (
        'system_languages',
        'organisations',
        'partners',
        'zones_lite',
        'developments',
        'properties',
        'representations',
        'listings',
        'listing_content',
        'media_assets',
        'media_variants',
        'listing_media',
        'development_media',
        'media_asset_content',
        'leads',
        'searches',
        'profiles',
        'features',
        'property_features',
        'seller_leads',
        'development_features',
        'price_history',
        'partner_types',
        'registry_bindings',
        'listing_state_history',
        'representation_state_history',
        'verification_assessments',
        'data_sources',
        'data_metric_definitions',
        'data_observations',
        'observation_evidence',
        'integration_outbox',
        'identity_bindings',
        'verification_publication_rules'
      )

      and p.cmd in (
        'ALL',
        'INSERT',
        'UPDATE',
        'DELETE'
      )

      and (
        'anon' = any(p.roles)
        or
        'public' = any(p.roles)
      )
  ),

  'vehicle_images_storage_policies',
  (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'policy', p.policyname,
          'cmd', p.cmd
        )
        order by p.policyname
      ),
      '[]'::jsonb
    )
    from pg_catalog.pg_policies p
    where p.schemaname = 'storage'
      and p.tablename = 'objects'
      and (
        coalesce(p.qual, '') like '%vehicle-images%'
        or
        coalesce(p.with_check, '')
          like '%vehicle-images%'
      )
  )

) as final_surface_snapshot;
