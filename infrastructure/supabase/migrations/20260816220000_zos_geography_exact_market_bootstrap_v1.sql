-- ============================================================
-- ZOS GEOGRAPHY — Exact Market Bootstrap v1
-- ============================================================
--
-- Purpose
--   Bootstrap the minimum canonical Geography required by Z Find's
--   five exact sub-country marketplace markets:
--
--     GB-ENG  England
--     GB-SCT  Scotland
--     GB-WLS  Wales
--     GB-NIR  Northern Ireland
--     AE-DU   Dubai
--
-- Canonical roots included because the live read-only A4.R2-R3 audit
-- proved that no active GB or AE country root currently exists:
--
--     GB      United Kingdom
--     AE      United Arab Emirates
--
-- Boundary
--   * canonical ZOS Geography only;
--   * no zones_lite rows are created or bound;
--   * no Z Find marketplace inventory is invented;
--   * no parent-country substitution;
--   * no city-name or UI-language inference;
--   * no destructive SQL;
--   * replay-safe through deterministic migration-owned UUIDs and
--     ON CONFLICT DO NOTHING, followed by strict postconditions.
--
-- Application authority
--   SOURCE ARTIFACT ONLY until an explicit database-apply gate is
--   granted. The current JS Geography command port is an in-memory
--   import boundary and is not the live PostgreSQL writer.
-- ============================================================

do $$
begin
  -- Fail closed if another active country root appeared after the
  -- read-only audit. A canonical root must never be silently replaced.
  if exists (
    select 1
    from zos.geography_locations gl
    where gl.country_iso = 'GB'
      and gl.location_type = 'country'
      and gl.status = 'active'
      and gl.id <> 'efa75b1d-835b-5d2a-8f3b-1dcaa2b9aca6'::uuid
  ) then
    raise exception
      'ZOS Geography bootstrap conflict: an unexpected active GB country root exists';
  end if;

  if exists (
    select 1
    from zos.geography_locations gl
    where gl.country_iso = 'AE'
      and gl.location_type = 'country'
      and gl.status = 'active'
      and gl.id <> '747d3cf8-962b-52e4-ac67-5b267a819bf6'::uuid
  ) then
    raise exception
      'ZOS Geography bootstrap conflict: an unexpected active AE country root exists';
  end if;

  -- Fail closed if any bootstrap canonical code already belongs to a
  -- different canonical identity, regardless of lifecycle status.
  if exists (
    select 1
    from zos.geography_locations gl
    join (
      values
        ('GB'::text, 'country'::text, 'GB'::text, 'efa75b1d-835b-5d2a-8f3b-1dcaa2b9aca6'::uuid),
        ('AE', 'country', 'AE', '747d3cf8-962b-52e4-ac67-5b267a819bf6'::uuid),
        ('GB', 'constituent-country', 'GB-ENG', '19381a30-fb3d-5473-830d-937199d46815'::uuid),
        ('GB', 'constituent-country', 'GB-SCT', '0a723fd2-5b84-5176-8f77-af44d800f7b8'::uuid),
        ('GB', 'constituent-country', 'GB-WLS', 'f594f812-4cde-5f8c-aaa4-eca025da675a'::uuid),
        ('GB', 'constituent-country', 'GB-NIR', '36337131-b8a4-5e6b-ab0b-0b7dbfee3970'::uuid),
        ('AE', 'emirate', 'AE-DU', 'ee913ba9-9e12-5874-af2b-732cf30e35e9'::uuid)
    ) as desired(country_iso, location_type, canonical_code, expected_id)
      on desired.country_iso = gl.country_iso
     and desired.location_type = gl.location_type
     and desired.canonical_code = gl.canonical_code
    where gl.id <> desired.expected_id
  ) then
    raise exception
      'ZOS Geography bootstrap conflict: a desired canonical code already belongs to another identity';
  end if;

  -- Current ISO 3166-2 exact-market codes must not point elsewhere.
  if exists (
    select 1
    from zos.geography_external_codes gec
    join (
      values
        ('GB'::text, 'GB-ENG'::text, '19381a30-fb3d-5473-830d-937199d46815'::uuid),
        ('GB', 'GB-SCT', '0a723fd2-5b84-5176-8f77-af44d800f7b8'::uuid),
        ('GB', 'GB-WLS', 'f594f812-4cde-5f8c-aaa4-eca025da675a'::uuid),
        ('GB', 'GB-NIR', '36337131-b8a4-5e6b-ab0b-0b7dbfee3970'::uuid),
        ('AE', 'AE-DU', 'ee913ba9-9e12-5874-af2b-732cf30e35e9'::uuid)
    ) as desired(country_iso, code, expected_location_id)
      on gec.code_system = 'ISO_3166-2'
     and gec.country_iso = desired.country_iso
     and gec.code = desired.code
     and gec.valid_to is null
    where gec.location_id <> desired.expected_location_id
  ) then
    raise exception
      'ZOS Geography bootstrap conflict: a current ISO 3166-2 code points to another identity';
  end if;
end
$$;

-- ------------------------------------------------------------
-- 1. Canonical country roots
-- ------------------------------------------------------------

insert into zos.geography_locations (
  id,
  location_type,
  canonical_code,
  country_iso,
  parent_id,
  status
)
values
  (
    'efa75b1d-835b-5d2a-8f3b-1dcaa2b9aca6'::uuid,
    'country',
    'GB',
    'GB',
    null,
    'active'
  ),
  (
    '747d3cf8-962b-52e4-ac67-5b267a819bf6'::uuid,
    'country',
    'AE',
    'AE',
    null,
    'active'
  )
on conflict do nothing;

-- ------------------------------------------------------------
-- 2. Exact sub-country market nodes
-- ------------------------------------------------------------

insert into zos.geography_locations (
  id,
  location_type,
  canonical_code,
  country_iso,
  parent_id,
  status
)
values
  (
    '19381a30-fb3d-5473-830d-937199d46815'::uuid,
    'constituent-country',
    'GB-ENG',
    'GB',
    'efa75b1d-835b-5d2a-8f3b-1dcaa2b9aca6'::uuid,
    'active'
  ),
  (
    '0a723fd2-5b84-5176-8f77-af44d800f7b8'::uuid,
    'constituent-country',
    'GB-SCT',
    'GB',
    'efa75b1d-835b-5d2a-8f3b-1dcaa2b9aca6'::uuid,
    'active'
  ),
  (
    'f594f812-4cde-5f8c-aaa4-eca025da675a'::uuid,
    'constituent-country',
    'GB-WLS',
    'GB',
    'efa75b1d-835b-5d2a-8f3b-1dcaa2b9aca6'::uuid,
    'active'
  ),
  (
    '36337131-b8a4-5e6b-ab0b-0b7dbfee3970'::uuid,
    'constituent-country',
    'GB-NIR',
    'GB',
    'efa75b1d-835b-5d2a-8f3b-1dcaa2b9aca6'::uuid,
    'active'
  ),
  (
    'ee913ba9-9e12-5874-af2b-732cf30e35e9'::uuid,
    'emirate',
    'AE-DU',
    'AE',
    '747d3cf8-962b-52e4-ac67-5b267a819bf6'::uuid,
    'active'
  )
on conflict do nothing;

-- ------------------------------------------------------------
-- 3. Canonical English names
-- ------------------------------------------------------------

insert into zos.geography_names (
  id,
  location_id,
  language_code,
  name,
  name_type
)
values
  (
    '5d8a50c7-4c7b-519d-b138-95c457264f54'::uuid,
    'efa75b1d-835b-5d2a-8f3b-1dcaa2b9aca6'::uuid,
    'en',
    'United Kingdom',
    'canonical'
  ),
  (
    'b3221ddf-d548-5f4d-b1b8-69716ef1a8fb'::uuid,
    '747d3cf8-962b-52e4-ac67-5b267a819bf6'::uuid,
    'en',
    'United Arab Emirates',
    'canonical'
  ),
  (
    '410a2563-8a19-5608-afc1-9da280868420'::uuid,
    '19381a30-fb3d-5473-830d-937199d46815'::uuid,
    'en',
    'England',
    'canonical'
  ),
  (
    '97ec0a22-cfb5-5c08-a915-40119293a0c9'::uuid,
    '0a723fd2-5b84-5176-8f77-af44d800f7b8'::uuid,
    'en',
    'Scotland',
    'canonical'
  ),
  (
    '56f7e698-84ce-569c-8114-755c7e6fb7c1'::uuid,
    'f594f812-4cde-5f8c-aaa4-eca025da675a'::uuid,
    'en',
    'Wales',
    'canonical'
  ),
  (
    '949816df-885b-5774-b7af-473b4facc82e'::uuid,
    '36337131-b8a4-5e6b-ab0b-0b7dbfee3970'::uuid,
    'en',
    'Northern Ireland',
    'canonical'
  ),
  (
    '07d82411-c5a9-5ba0-a96f-abfad92a7c42'::uuid,
    'ee913ba9-9e12-5874-af2b-732cf30e35e9'::uuid,
    'en',
    'Dubai',
    'canonical'
  )
on conflict do nothing;

-- ------------------------------------------------------------
-- 4. Current ISO 3166-2 exact-market external codes
-- ------------------------------------------------------------

insert into zos.geography_external_codes (
  id,
  location_id,
  code_system,
  country_iso,
  code
)
values
  (
    '692d905f-980b-505d-9e54-ec4cffef396d'::uuid,
    '19381a30-fb3d-5473-830d-937199d46815'::uuid,
    'ISO_3166-2',
    'GB',
    'GB-ENG'
  ),
  (
    '95e3cb83-b1f4-50d2-a75a-60d990060932'::uuid,
    '0a723fd2-5b84-5176-8f77-af44d800f7b8'::uuid,
    'ISO_3166-2',
    'GB',
    'GB-SCT'
  ),
  (
    'a5723eb2-0b98-5b10-8a0a-fa35fae2317c'::uuid,
    'f594f812-4cde-5f8c-aaa4-eca025da675a'::uuid,
    'ISO_3166-2',
    'GB',
    'GB-WLS'
  ),
  (
    'e68d29c2-03dc-5fd8-abec-3df6a9ad9b95'::uuid,
    '36337131-b8a4-5e6b-ab0b-0b7dbfee3970'::uuid,
    'ISO_3166-2',
    'GB',
    'GB-NIR'
  ),
  (
    '2286ebb9-c8b2-5417-a8f2-8063dc0c678a'::uuid,
    'ee913ba9-9e12-5874-af2b-732cf30e35e9'::uuid,
    'ISO_3166-2',
    'AE',
    'AE-DU'
  )
on conflict do nothing;

-- ------------------------------------------------------------
-- 5. Bootstrap provenance
-- ------------------------------------------------------------

insert into zos.geography_provenance (
  id,
  location_id,
  source_code,
  source_record_id,
  source_version,
  batch_id,
  observed_at,
  raw_payload
)
values
  (
    '3f5a7d35-61c4-5399-9973-b80e9cabb001'::uuid,
    'efa75b1d-835b-5d2a-8f3b-1dcaa2b9aca6'::uuid,
    'ISO_3166-1_ALPHA_2',
    'GB',
    'zos-controlled-bootstrap-v1',
    'zos-geography-exact-market-bootstrap-v1',
    now(),
    '{"code":"GB","name":"United Kingdom","location_type":"country"}'::jsonb
  ),
  (
    '74b44755-3ff8-5b44-8156-8b9c4033653e'::uuid,
    '747d3cf8-962b-52e4-ac67-5b267a819bf6'::uuid,
    'ISO_3166-1_ALPHA_2',
    'AE',
    'zos-controlled-bootstrap-v1',
    'zos-geography-exact-market-bootstrap-v1',
    now(),
    '{"code":"AE","name":"United Arab Emirates","location_type":"country"}'::jsonb
  ),
  (
    'ea4f1eb6-c1ff-58f6-ba38-3d114928ea9a'::uuid,
    '19381a30-fb3d-5473-830d-937199d46815'::uuid,
    'ISO_3166-2',
    'GB-ENG',
    'zos-controlled-bootstrap-v1',
    'zos-geography-exact-market-bootstrap-v1',
    now(),
    '{"code":"GB-ENG","name":"England","location_type":"constituent-country","parent":"GB"}'::jsonb
  ),
  (
    '05aceb7f-6ac3-52c7-acfe-e234b4c77f04'::uuid,
    '0a723fd2-5b84-5176-8f77-af44d800f7b8'::uuid,
    'ISO_3166-2',
    'GB-SCT',
    'zos-controlled-bootstrap-v1',
    'zos-geography-exact-market-bootstrap-v1',
    now(),
    '{"code":"GB-SCT","name":"Scotland","location_type":"constituent-country","parent":"GB"}'::jsonb
  ),
  (
    'fc49bab8-9bff-5c3d-b1f0-51a4b7319831'::uuid,
    'f594f812-4cde-5f8c-aaa4-eca025da675a'::uuid,
    'ISO_3166-2',
    'GB-WLS',
    'zos-controlled-bootstrap-v1',
    'zos-geography-exact-market-bootstrap-v1',
    now(),
    '{"code":"GB-WLS","name":"Wales","location_type":"constituent-country","parent":"GB"}'::jsonb
  ),
  (
    'b1ab423e-c391-5986-be4b-a09ac02a4175'::uuid,
    '36337131-b8a4-5e6b-ab0b-0b7dbfee3970'::uuid,
    'ISO_3166-2',
    'GB-NIR',
    'zos-controlled-bootstrap-v1',
    'zos-geography-exact-market-bootstrap-v1',
    now(),
    '{"code":"GB-NIR","name":"Northern Ireland","location_type":"constituent-country","parent":"GB"}'::jsonb
  ),
  (
    'd3211595-d305-531b-b836-d76a9d927f0f'::uuid,
    'ee913ba9-9e12-5874-af2b-732cf30e35e9'::uuid,
    'ISO_3166-2',
    'AE-DU',
    'zos-controlled-bootstrap-v1',
    'zos-geography-exact-market-bootstrap-v1',
    now(),
    '{"code":"AE-DU","name":"Dubai","location_type":"emirate","parent":"AE"}'::jsonb
  )
on conflict do nothing;

-- ------------------------------------------------------------
-- 6. Append-only canonical creation history
-- ------------------------------------------------------------

insert into zos.geography_location_history (
  id,
  location_id,
  change_type,
  before_state,
  after_state,
  provenance_id,
  batch_id,
  changed_by
)
values
  (
    '6f5147dc-5ad5-55a6-a09d-0288e06b1b9a'::uuid,
    'efa75b1d-835b-5d2a-8f3b-1dcaa2b9aca6'::uuid,
    'new',
    null,
    '{"location_type":"country","canonical_code":"GB","country_iso":"GB","parent_id":null,"status":"active"}'::jsonb,
    '3f5a7d35-61c4-5399-9973-b80e9cabb001'::uuid,
    'zos-geography-exact-market-bootstrap-v1',
    'migration:20260816220000_zos_geography_exact_market_bootstrap_v1'
  ),
  (
    '9884d844-17e2-5fa7-9201-df862da7064e'::uuid,
    '747d3cf8-962b-52e4-ac67-5b267a819bf6'::uuid,
    'new',
    null,
    '{"location_type":"country","canonical_code":"AE","country_iso":"AE","parent_id":null,"status":"active"}'::jsonb,
    '74b44755-3ff8-5b44-8156-8b9c4033653e'::uuid,
    'zos-geography-exact-market-bootstrap-v1',
    'migration:20260816220000_zos_geography_exact_market_bootstrap_v1'
  ),
  (
    '9fcaf2da-c4fe-5796-ad83-ca6b11eb23bf'::uuid,
    '19381a30-fb3d-5473-830d-937199d46815'::uuid,
    'new',
    null,
    '{"location_type":"constituent-country","canonical_code":"GB-ENG","country_iso":"GB","parent_id":"efa75b1d-835b-5d2a-8f3b-1dcaa2b9aca6","status":"active"}'::jsonb,
    'ea4f1eb6-c1ff-58f6-ba38-3d114928ea9a'::uuid,
    'zos-geography-exact-market-bootstrap-v1',
    'migration:20260816220000_zos_geography_exact_market_bootstrap_v1'
  ),
  (
    'de49ced7-e47f-5bba-bb35-a62c3fb20422'::uuid,
    '0a723fd2-5b84-5176-8f77-af44d800f7b8'::uuid,
    'new',
    null,
    '{"location_type":"constituent-country","canonical_code":"GB-SCT","country_iso":"GB","parent_id":"efa75b1d-835b-5d2a-8f3b-1dcaa2b9aca6","status":"active"}'::jsonb,
    '05aceb7f-6ac3-52c7-acfe-e234b4c77f04'::uuid,
    'zos-geography-exact-market-bootstrap-v1',
    'migration:20260816220000_zos_geography_exact_market_bootstrap_v1'
  ),
  (
    '1b903d53-a79c-5419-aadb-5179ca63e8fe'::uuid,
    'f594f812-4cde-5f8c-aaa4-eca025da675a'::uuid,
    'new',
    null,
    '{"location_type":"constituent-country","canonical_code":"GB-WLS","country_iso":"GB","parent_id":"efa75b1d-835b-5d2a-8f3b-1dcaa2b9aca6","status":"active"}'::jsonb,
    'fc49bab8-9bff-5c3d-b1f0-51a4b7319831'::uuid,
    'zos-geography-exact-market-bootstrap-v1',
    'migration:20260816220000_zos_geography_exact_market_bootstrap_v1'
  ),
  (
    '9169d5e3-3700-5fd1-a39d-43d280c8f17a'::uuid,
    '36337131-b8a4-5e6b-ab0b-0b7dbfee3970'::uuid,
    'new',
    null,
    '{"location_type":"constituent-country","canonical_code":"GB-NIR","country_iso":"GB","parent_id":"efa75b1d-835b-5d2a-8f3b-1dcaa2b9aca6","status":"active"}'::jsonb,
    'b1ab423e-c391-5986-be4b-a09ac02a4175'::uuid,
    'zos-geography-exact-market-bootstrap-v1',
    'migration:20260816220000_zos_geography_exact_market_bootstrap_v1'
  ),
  (
    'e27cce45-bf65-5d04-ae44-0f16b6170069'::uuid,
    'ee913ba9-9e12-5874-af2b-732cf30e35e9'::uuid,
    'new',
    null,
    '{"location_type":"emirate","canonical_code":"AE-DU","country_iso":"AE","parent_id":"747d3cf8-962b-52e4-ac67-5b267a819bf6","status":"active"}'::jsonb,
    'd3211595-d305-531b-b836-d76a9d927f0f'::uuid,
    'zos-geography-exact-market-bootstrap-v1',
    'migration:20260816220000_zos_geography_exact_market_bootstrap_v1'
  )
on conflict do nothing;

-- ------------------------------------------------------------
-- 7. Strict postconditions
-- ------------------------------------------------------------

do $$
begin
  if (
    select count(*)
    from zos.geography_locations gl
    where gl.id in (
      'efa75b1d-835b-5d2a-8f3b-1dcaa2b9aca6'::uuid,
      '747d3cf8-962b-52e4-ac67-5b267a819bf6'::uuid,
      '19381a30-fb3d-5473-830d-937199d46815'::uuid,
      '0a723fd2-5b84-5176-8f77-af44d800f7b8'::uuid,
      'f594f812-4cde-5f8c-aaa4-eca025da675a'::uuid,
      '36337131-b8a4-5e6b-ab0b-0b7dbfee3970'::uuid,
      'ee913ba9-9e12-5874-af2b-732cf30e35e9'::uuid
    )
      and gl.status = 'active'
  ) <> 7 then
    raise exception
      'ZOS Geography bootstrap postcondition failed: expected 7 active canonical locations';
  end if;

  if not exists (
    select 1
    from zos.geography_locations gl
    where gl.id = '19381a30-fb3d-5473-830d-937199d46815'::uuid
      and gl.location_type = 'constituent-country'
      and gl.canonical_code = 'GB-ENG'
      and gl.country_iso = 'GB'
      and gl.parent_id = 'efa75b1d-835b-5d2a-8f3b-1dcaa2b9aca6'::uuid
  ) or not exists (
    select 1
    from zos.geography_locations gl
    where gl.id = '0a723fd2-5b84-5176-8f77-af44d800f7b8'::uuid
      and gl.location_type = 'constituent-country'
      and gl.canonical_code = 'GB-SCT'
      and gl.country_iso = 'GB'
      and gl.parent_id = 'efa75b1d-835b-5d2a-8f3b-1dcaa2b9aca6'::uuid
  ) or not exists (
    select 1
    from zos.geography_locations gl
    where gl.id = 'f594f812-4cde-5f8c-aaa4-eca025da675a'::uuid
      and gl.location_type = 'constituent-country'
      and gl.canonical_code = 'GB-WLS'
      and gl.country_iso = 'GB'
      and gl.parent_id = 'efa75b1d-835b-5d2a-8f3b-1dcaa2b9aca6'::uuid
  ) or not exists (
    select 1
    from zos.geography_locations gl
    where gl.id = '36337131-b8a4-5e6b-ab0b-0b7dbfee3970'::uuid
      and gl.location_type = 'constituent-country'
      and gl.canonical_code = 'GB-NIR'
      and gl.country_iso = 'GB'
      and gl.parent_id = 'efa75b1d-835b-5d2a-8f3b-1dcaa2b9aca6'::uuid
  ) or not exists (
    select 1
    from zos.geography_locations gl
    where gl.id = 'ee913ba9-9e12-5874-af2b-732cf30e35e9'::uuid
      and gl.location_type = 'emirate'
      and gl.canonical_code = 'AE-DU'
      and gl.country_iso = 'AE'
      and gl.parent_id = '747d3cf8-962b-52e4-ac67-5b267a819bf6'::uuid
  ) then
    raise exception
      'ZOS Geography bootstrap postcondition failed: exact-market hierarchy mismatch';
  end if;

  if (
    select count(*)
    from zos.geography_external_codes gec
    where gec.code_system = 'ISO_3166-2'
      and gec.valid_to is null
      and gec.code in (
        'GB-ENG',
        'GB-SCT',
        'GB-WLS',
        'GB-NIR',
        'AE-DU'
      )
  ) <> 5 then
    raise exception
      'ZOS Geography bootstrap postcondition failed: expected 5 current ISO 3166-2 exact-market codes';
  end if;

  if (
    select count(*)
    from zos.geography_names gn
    where gn.id in (
      '5d8a50c7-4c7b-519d-b138-95c457264f54'::uuid,
      'b3221ddf-d548-5f4d-b1b8-69716ef1a8fb'::uuid,
      '410a2563-8a19-5608-afc1-9da280868420'::uuid,
      '97ec0a22-cfb5-5c08-a915-40119293a0c9'::uuid,
      '56f7e698-84ce-569c-8114-755c7e6fb7c1'::uuid,
      '949816df-885b-5774-b7af-473b4facc82e'::uuid,
      '07d82411-c5a9-5ba0-a96f-abfad92a7c42'::uuid
    )
      and gn.language_code = 'en'
      and gn.name_type = 'canonical'
      and gn.valid_to is null
  ) <> 7 then
    raise exception
      'ZOS Geography bootstrap postcondition failed: expected 7 canonical English names';
  end if;

  if (
    select count(*)
    from zos.geography_provenance gp
    where gp.batch_id = 'zos-geography-exact-market-bootstrap-v1'
  ) <> 7 then
    raise exception
      'ZOS Geography bootstrap postcondition failed: expected 7 provenance rows';
  end if;

  if (
    select count(*)
    from zos.geography_location_history gh
    where gh.batch_id = 'zos-geography-exact-market-bootstrap-v1'
      and gh.change_type = 'new'
      and gh.before_state is null
  ) <> 7 then
    raise exception
      'ZOS Geography bootstrap postcondition failed: expected 7 append-only creation history rows';
  end if;
end
$$;

comment on table zos.geography_locations is
  'Canonical geographic identity and extensible administrative hierarchy. Exact-market bootstrap v1 adds GB/AE roots plus GB-ENG, GB-SCT, GB-WLS, GB-NIR and AE-DU without creating marketplace zone bindings.';
