-- ============================================================
-- Z FIND — France Search Inventory QA Bootstrap v1
-- ============================================================
-- Boundary:
--   * binds 24 launch communes from canonical ZOS Geography to zones_lite;
--   * creates one synthetic Property and one synthetic Development QA seed;
--   * QA partner is inactive;
--   * Representations remain proposed;
--   * Listings remain draft with zero price;
--   * NOTHING synthetic is published;
--   * no Portugal or other-market data is mutated;
--   * replay-safe and fail-closed through strict postconditions.
-- ============================================================

do $$
begin
  if to_regclass('public.zones_lite') is null
     or to_regclass('public.properties') is null
     or to_regclass('public.developments') is null
     or to_regclass('public.partners') is null
     or to_regclass('public.representations') is null
     or to_regclass('public.listings') is null
     or to_regclass('public.listing_content') is null then
    raise exception
      'France inventory QA bootstrap requires Z Find operational tables';
  end if;

  if (
    select count(*)
    from zos.geography_locations
    where country_iso = 'FR'
      and location_type = 'commune'
      and canonical_code in (
        'FR-COM-75056','FR-COM-45234','FR-COM-21231','FR-COM-76540',
        'FR-COM-59350','FR-COM-67482','FR-COM-44109','FR-COM-35238',
        'FR-COM-33063','FR-COM-31555','FR-COM-69123','FR-COM-13055',
        'FR-COM-2A004','FR-COM-97101','FR-COM-97209','FR-COM-97302',
        'FR-COM-97411','FR-COM-97611','FR-COM-06088','FR-COM-06029',
        'FR-COM-34172','FR-COM-74010','FR-COM-13001','FR-COM-78646'
      )
      and status = 'active'
  ) <> 24 then
    raise exception
      'France inventory QA bootstrap requires all 24 canonical launch communes';
  end if;
end
$$;

-- ------------------------------------------------------------
-- 1. Explicit canonical Geography -> Zones Lite bindings
-- ------------------------------------------------------------
with desired(commune_code, official_name) as (
  values
    ('75056','Paris'),
    ('45234','Orléans'),
    ('21231','Dijon'),
    ('76540','Rouen'),
    ('59350','Lille'),
    ('67482','Strasbourg'),
    ('44109','Nantes'),
    ('35238','Rennes'),
    ('33063','Bordeaux'),
    ('31555','Toulouse'),
    ('69123','Lyon'),
    ('13055','Marseille'),
    ('2A004','Ajaccio'),
    ('97101','Les Abymes'),
    ('97209','Fort-de-France'),
    ('97302','Cayenne'),
    ('97411','Saint-Denis'),
    ('97611','Mamoudzou'),
    ('06088','Nice'),
    ('06029','Cannes'),
    ('34172','Montpellier'),
    ('74010','Annecy'),
    ('13001','Aix-en-Provence'),
    ('78646','Versailles')
), canonical as (
  select
    d.commune_code,
    d.official_name,
    gl.id as geography_entity_id
  from desired d
  join zos.geography_locations gl
    on gl.country_iso = 'FR'
   and gl.location_type = 'commune'
   and gl.canonical_code = 'FR-COM-' || d.commune_code
   and gl.status = 'active'
)
insert into public.zones_lite (
  name,
  city,
  country_iso,
  geography_entity_id,
  geography_binding_status
)
select
  c.official_name,
  c.official_name,
  'FR',
  c.geography_entity_id,
  'linked'
from canonical c
on conflict (name, city, country_iso)
do update
set
  geography_entity_id = excluded.geography_entity_id,
  geography_binding_status = 'linked'
where
  public.zones_lite.geography_entity_id is null
  or public.zones_lite.geography_entity_id = excluded.geography_entity_id;

-- ------------------------------------------------------------
-- 2. Dedicated inactive QA partner
-- ------------------------------------------------------------
insert into public.partners (
  name,
  role,
  status,
  enquiry_policy
)
select
  'Z Find France QA — NON PUBLIC',
  'agency',
  'inactive',
  '{"direct":false,"assisted":false,"qualified":false}'::jsonb
where not exists (
  select 1
  from public.partners
  where name = 'Z Find France QA — NON PUBLIC'
);

-- ------------------------------------------------------------
-- 3. Synthetic QA Property — Paris
-- ------------------------------------------------------------
insert into public.properties (
  property_class,
  subtype,
  typology,
  area_sqm,
  zone_lite_id,
  attributes,
  external_ids
)
select
  'residential',
  'apartment',
  'T3',
  80,
  z.id,
  '{"qa_seed":true,"visibility":"non_public","market":"FR","purpose":"france_search_pipeline"}'::jsonb,
  '{"zfind_qa_seed":"fr-property-v1"}'::jsonb
from public.zones_lite z
where z.name = 'Paris'
  and z.city = 'Paris'
  and z.country_iso = 'FR'
  and z.geography_binding_status = 'linked'
  and not exists (
    select 1
    from public.properties p
    where p.external_ids->>'zfind_qa_seed' = 'fr-property-v1'
  );

-- ------------------------------------------------------------
-- 4. Synthetic QA Development — Lyon
-- ------------------------------------------------------------
insert into public.developments (
  name,
  zone_lite_id,
  project_phase,
  developer_name
)
select
  'QA France — Development seed — NON PUBLIC',
  z.id,
  'planning',
  'Z Find QA'
from public.zones_lite z
where z.name = 'Lyon'
  and z.city = 'Lyon'
  and z.country_iso = 'FR'
  and z.geography_binding_status = 'linked'
  and not exists (
    select 1
    from public.developments d
    where d.name = 'QA France — Development seed — NON PUBLIC'
  );

-- ------------------------------------------------------------
-- 5. Proposed Representations only
-- ------------------------------------------------------------
with qa_partner as (
  select id
  from public.partners
  where name = 'Z Find France QA — NON PUBLIC'
  order by created_at
  limit 1
), qa_property as (
  select id
  from public.properties
  where external_ids->>'zfind_qa_seed' = 'fr-property-v1'
  order by created_at
  limit 1
)
insert into public.representations (
  target_type,
  property_id,
  partner_id,
  status
)
select
  'property',
  p.id,
  q.id,
  'proposed'
from qa_property p
cross join qa_partner q
where not exists (
  select 1
  from public.representations r
  where r.target_type = 'property'
    and r.property_id = p.id
);

with qa_partner as (
  select id
  from public.partners
  where name = 'Z Find France QA — NON PUBLIC'
  order by created_at
  limit 1
), qa_development as (
  select id
  from public.developments
  where name = 'QA France — Development seed — NON PUBLIC'
  order by created_at
  limit 1
)
insert into public.representations (
  target_type,
  development_id,
  partner_id,
  status
)
select
  'development',
  d.id,
  q.id,
  'proposed'
from qa_development d
cross join qa_partner q
where not exists (
  select 1
  from public.representations r
  where r.target_type = 'development'
    and r.development_id = d.id
);

-- ------------------------------------------------------------
-- 6. Draft €0 Listings only
-- ------------------------------------------------------------
with qa_representations as (
  select r.id
  from public.representations r
  left join public.properties p
    on r.target_type = 'property'
   and p.id = r.property_id
  left join public.developments d
    on r.target_type = 'development'
   and d.id = r.development_id
  where p.external_ids->>'zfind_qa_seed' = 'fr-property-v1'
     or d.name = 'QA France — Development seed — NON PUBLIC'
)
insert into public.listings (
  representation_id,
  channel,
  price_current,
  currency_iso,
  price_is_from,
  status,
  tier,
  transaction_type,
  rental_period
)
select
  r.id,
  'standard',
  0,
  'EUR',
  false,
  'draft',
  'standard',
  'sale',
  null
from qa_representations r
where not exists (
  select 1
  from public.listings l
  where l.representation_id = r.id
);

-- ------------------------------------------------------------
-- 7. Six-language QA content
-- ------------------------------------------------------------
with qa_listings as (
  select l.id, r.target_type
  from public.listings l
  join public.representations r
    on r.id = l.representation_id
  left join public.properties p
    on r.target_type = 'property'
   and p.id = r.property_id
  left join public.developments d
    on r.target_type = 'development'
   and d.id = r.development_id
  where p.external_ids->>'zfind_qa_seed' = 'fr-property-v1'
     or d.name = 'QA France — Development seed — NON PUBLIC'
), copy(locale, property_title, development_title, description) as (
  values
    ('fr',
     'QA — NON PUBLIC — Appartement France',
     'QA — NON PUBLIC — Programme France',
     'Donnée synthétique de QA. Ne jamais publier.'),
    ('en',
     'QA — NON PUBLIC — France property',
     'QA — NON PUBLIC — France development',
     'Synthetic QA data. Never publish.'),
    ('pt-PT',
     'QA — NÃO PUBLICAR — Imóvel França',
     'QA — NÃO PUBLICAR — Empreendimento França',
     'Dado sintético de QA. Nunca publicar.'),
    ('es',
     'QA — NO PUBLICAR — Inmueble Francia',
     'QA — NO PUBLICAR — Promoción Francia',
     'Dato sintético de QA. No publicar.'),
    ('de',
     'QA — NICHT VERÖFFENTLICHEN — Immobilie Frankreich',
     'QA — NICHT VERÖFFENTLICHEN — Projekt Frankreich',
     'Synthetische QA-Daten. Niemals veröffentlichen.'),
    ('it',
     'QA — NON PUBBLICARE — Immobile Francia',
     'QA — NON PUBBLICARE — Progetto Francia',
     'Dato QA sintetico. Non pubblicare mai.')
)
insert into public.listing_content (
  listing_id,
  locale,
  title,
  description,
  translation_status,
  content_source
)
select
  q.id,
  c.locale,
  case
    when q.target_type = 'property'
      then c.property_title
    else c.development_title
  end,
  c.description,
  'ai_generated',
  'ai'
from qa_listings q
cross join copy c
on conflict (listing_id, locale) do nothing;

-- ------------------------------------------------------------
-- 8. Strict postconditions
-- ------------------------------------------------------------
do $$
declare
  france_zone_count integer;
  qa_listing_count integer;
begin
  select count(*)
  into france_zone_count
  from public.zones_lite z
  join zos.geography_locations gl
    on gl.id = z.geography_entity_id
  where z.country_iso = 'FR'
    and z.geography_binding_status = 'linked'
    and gl.country_iso = 'FR'
    and gl.location_type = 'commune'
    and gl.canonical_code in (
      'FR-COM-75056','FR-COM-45234','FR-COM-21231','FR-COM-76540',
      'FR-COM-59350','FR-COM-67482','FR-COM-44109','FR-COM-35238',
      'FR-COM-33063','FR-COM-31555','FR-COM-69123','FR-COM-13055',
      'FR-COM-2A004','FR-COM-97101','FR-COM-97209','FR-COM-97302',
      'FR-COM-97411','FR-COM-97611','FR-COM-06088','FR-COM-06029',
      'FR-COM-34172','FR-COM-74010','FR-COM-13001','FR-COM-78646'
    );

  if france_zone_count <> 24 then
    raise exception
      'France inventory postcondition failed: expected 24 linked launch zones, got %',
      france_zone_count;
  end if;

  if (
    select count(*)
    from public.properties
    where external_ids->>'zfind_qa_seed' = 'fr-property-v1'
  ) <> 1 then
    raise exception
      'France inventory postcondition failed: QA Property seed';
  end if;

  if (
    select count(*)
    from public.developments
    where name = 'QA France — Development seed — NON PUBLIC'
  ) <> 1 then
    raise exception
      'France inventory postcondition failed: QA Development seed';
  end if;

  select count(*)
  into qa_listing_count
  from public.listings l
  join public.representations r
    on r.id = l.representation_id
  left join public.properties p
    on r.target_type = 'property'
   and p.id = r.property_id
  left join public.developments d
    on r.target_type = 'development'
   and d.id = r.development_id
  where p.external_ids->>'zfind_qa_seed' = 'fr-property-v1'
     or d.name = 'QA France — Development seed — NON PUBLIC';

  if qa_listing_count <> 2 then
    raise exception
      'France inventory postcondition failed: expected 2 QA Listings, got %',
      qa_listing_count;
  end if;

  if exists (
    select 1
    from public.listings l
    join public.representations r
      on r.id = l.representation_id
    left join public.properties p
      on r.target_type = 'property'
     and p.id = r.property_id
    left join public.developments d
      on r.target_type = 'development'
     and d.id = r.development_id
    where (
      p.external_ids->>'zfind_qa_seed' = 'fr-property-v1'
      or d.name = 'QA France — Development seed — NON PUBLIC'
    )
      and l.status <> 'draft'
  ) then
    raise exception
      'France inventory safety failure: QA Listing escaped draft state';
  end if;

  if exists (
    select 1
    from public.representations r
    left join public.properties p
      on r.target_type = 'property'
     and p.id = r.property_id
    left join public.developments d
      on r.target_type = 'development'
     and d.id = r.development_id
    where (
      p.external_ids->>'zfind_qa_seed' = 'fr-property-v1'
      or d.name = 'QA France — Development seed — NON PUBLIC'
    )
      and r.status <> 'proposed'
  ) then
    raise exception
      'France inventory safety failure: QA Representation escaped proposed state';
  end if;

  if exists (
    select 1
    from public.zones_lite z
    join zos.geography_locations gl
      on gl.id = z.geography_entity_id
    where z.country_iso = 'FR'
      and gl.country_iso <> 'FR'
  ) then
    raise exception
      'France inventory safety failure: cross-country Geography binding';
  end if;
end
$$;