-- ============================================================
-- Z FIND — Mentions obligatoires: new France profiles, Belgium and
-- Luxembourg gate, energy class G — v1
--
-- Builds on 20260830112835_z_find_global_listing_compliance_launch_v2
-- (compliance table, validator, review, publish gate),
-- 20261009120000 (review queue) and 20261009180000 (partner submission
-- readiness). Idempotent: create or replace only; the one constraint it
-- replaces (properties.energy_rating CHECK) is dropped and re-added.
-- No row is updated or deleted.
--
-- 1. FRANCE — new profiles (the two existing profiles are UNCHANGED:
--    their checks below are a verbatim copy of the v2 validator):
--
--    fr_residential_sale_v1 / fr_residential_rent_v1 (unchanged)
--    fr_new_development_sale_v1  programme neuf / lot vendu en VEFA
--    fr_commercial_sale_v1       bureaux, commerces, locaux d'activité,
--                                hôtellerie (property_class commercial)
--    fr_commercial_rent_v1
--    fr_land_sale_v1             terrain (property_class land)
--    fr_land_rent_v1
--
--    Mapping (zfind_listing_compliance_profile):
--      property residential + rent                    -> fr_residential_rent_v1
--      property residential + sale, no programme      -> fr_residential_sale_v1
--      property residential + sale, in a programme    -> fr_new_development_sale_v1
--        (properties.development_id set: a lot of a programme neuf).
--        Every fact set valid for fr_residential_sale_v1 is also valid for
--        fr_new_development_sale_v1 (its checks are a strict subset), so an
--        already approved record stays valid.
--      development (the programme itself) + sale     -> fr_new_development_sale_v1
--      property commercial + sale | rent             -> fr_commercial_sale_v1 | _rent_v1
--      property land + sale | rent                   -> fr_land_sale_v1 | _rent_v1
--    Parking / garage / box / cave / immeuble entier: NOT in the property
--    taxonomy (property_subtypes: apartment, villa, office, retail,
--    industrial_logistics, hospitality, land; « building » is a forbidden
--    subtype code, migration 20260815030000) — no profile, the importer
--    keeps refusing them.
--
--    Legal basis (France):
--    - Géorisques mention in every ad for the sale or rent of a « bien
--      immobilier » (built or not): code de l'environnement L.125-5 and
--      R.125-25 (décret 2022-1289). All FR profiles.
--    - DPE classes in ads: CCH L.126-33 (energy + climate class), for
--      every building subject to a DPE (dwellings AND tertiary buildings).
--      Exemptions: CCH R.126-15 (< 50 m², temporary, worship, historic
--      monuments, industrial / agricultural buildings with low energy
--      needs…) -> dpe_status 'exempt' + reason.
--      Estimated annual energy costs + reference year: décret 2022-780 /
--      arrêté du 22 mars 2023 — dwellings only (« logements »):
--      residential and new development profiles, never commercial.
--      Tertiary DPE: energy and climate labels; older tertiary methods
--      used scales up to I, so A–I is accepted for commercial profiles.
--      Land: no building, no DPE.
--    - New builds (VEFA): the DPE of a new building is established at
--      completion (before delivery); while the programme is not completed
--      it cannot be shown -> dpe_status 'pending_completion' (« DPE
--      disponible à l'achèvement »), allowed for fr_new_development_sale_v1
--      only.
--    - Agency fees: arrêté du 10 janvier 2017 (information des
--      consommateurs, transaction immobilière): every SALE ad states who
--      pays the fees and, when the buyer pays, the price including fees
--      and the fees amount / rate. Rentals: rentals of any property
--      EXCEPT commercial premises let between professionals (DGCCRF
--      note on the arrêté) -> fees required for land rent, optional for
--      commercial rent.
--    - Copropriété (lot in an « immeuble bâti »): CCH L.721-1 (loi ALUR):
--      status, number of lots, average annual charges, procedures —
--      required for commercial sales (a commercial lot can be in a
--      copropriété); not for land; optional for VEFA (the copropriété is
--      not yet constituted before completion).
--
-- 2. BELGIUM (regional rules) and LUXEMBOURG — listings were not
--    checked at all; they are now gated exactly like France.
--    Region of a Belgian listing (zfind_be_region): the commune's NIS
--    code (zones_lite.commune_code, set by zfind_set_asset_commune:
--    21xxx Bruxelles-Capitale; 25xxx Brabant wallon and 5xxxx-6xxxx,
--    8xxxx-9xxxx Wallonie; 1xxxx, 23xxx-24xxx, 3xxxx-4xxxx, 7xxxx
--    Flandre), else the property's postcode (1000–1299 Bruxelles,
--    1300–1499 Brabant wallon, 4000–7999 Wallonie, 1500–3999 and
--    8000–9999 Flandre). Unknown region -> no profile, missing
--    'be_region_unresolved'.
--
--    be_wal_sale_v1 / be_wal_rent_v1 — Wallonie: décret PEB du
--      28 novembre 2013 and AGW du 15 mai 2014 (since 1 January 2015
--      every sale / rent ad shows the PEB certificate indicators):
--      classe énergétique, consommation spécifique d'énergie primaire
--      (kWh/m².an), consommation théorique totale d'énergie primaire
--      (kWh/an), code unique du certificat. Source: SPW Énergie,
--      « Certificat PEB — publicité » (energie.wallonie.be).
--    be_bru_sale_v1 / be_bru_rent_v1 — Bruxelles-Capitale: COBRACE
--      (ordonnance du 2 mai 2013) and its certification arrêtés: classe
--      PEB, consommation d'énergie primaire (kWh EP/m².an) and émissions
--      annuelles de CO2 (kg CO2/m².an).
--    be_vla_sale_v1 / be_vla_rent_v1 — Flandre: Energiedecreet
--      8 mei 2009 art. 11.2.1 §3 and 13.4.10 §3/1 (EPC kengetal in
--      kWh/m².jaar + unieke code OR full address; vlaanderen.be
--      « Verplichte vermelding van EPC-informatie in advertenties »,
--      including the renovatieplicht mention for poor labels); for SALES
--      also the stedenbouwkundige informatie (Vlaamse Codex Ruimtelijke
--      Ordening art. 5.2.1: vergunning, meest recente bestemming,
--      dagvaarding, voorkooprecht, verkavelingsvergunning) and the
--      overstromingsgevoeligheid (informatieplicht watertoets, since
--      1 January 2023: P-score always, G-score when the plot is built).
--      Flood scores and urbanism apply to sales (and leases > 9 years,
--      not modelled: Z Find rentals are residential leases).
--    Rentals in all three regions: rent and common charges in every
--      public communication (former art. 1716 Code civil, now regional
--      housing-lease law: Code bruxellois du Logement, décret wallon du
--      15 mars 2018, Vlaams Woninghuurdecreet).
--    lu_sale_v1 / lu_rent_v1 — Luxembourg: loi modifiée du 5 août 1993
--      and règlement grand-ducal modifié du 30 novembre 2007 (bâtiments
--      d'habitation) / 31 août 2010 (bâtiments fonctionnels): every sale
--      or rent ad in commercial media shows the classe de performance
--      énergétique and the classe d'isolation thermique of the valid
--      certificate (guichet.public.lu « Energiepass »). Agency fees: no
--      ad-specific rule found -> optional fields only.
--    Every BE / LU profile accepts « exempt » + reason (no certificate
--    required: land, building to be demolished, commercial unit outside
--    the regional certification scope…).
--
--    EXISTING BE / LU LISTINGS: this migration changes no listing. The
--    gate only runs on the TRANSITION to 'published' (trigger BEFORE
--    INSERT OR UPDATE OF status, unchanged): listings already published
--    stay published. Like in France, a BE / LU listing created directly
--    as 'published' is refused, and approved facts of a published
--    listing cannot be changed (zfind_save_listing_compliance). New: a
--    published listing whose facts were never APPROVED (legacy BE / LU
--    listings, or France listings published before the 2026-08-30 gate)
--    may now record its facts without being suspended; they go to
--    « pending » review and the listing stays online.
--
-- 3. ENERGY CLASS G: properties.energy_rating accepted A+, A, B, B-, C,
--    D, E, F (Portuguese scale). It now also accepts G (French / EU
--    scale A–G). A+ and B- are kept so existing rows stay valid.
-- ============================================================


-- ------------------------------------------------------------
-- 1. properties.energy_rating: A–G (+ legacy A+, B-)
-- ------------------------------------------------------------
do $energy$
declare v_name text;
begin
  for v_name in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.properties'::regclass and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%energy_rating%'
  loop
    execute format('alter table public.properties drop constraint %I', v_name);
  end loop;
end
$energy$;

alter table public.properties
  add constraint properties_energy_rating_check
  check (energy_rating is null or energy_rating in ('A+','A','B','B-','C','D','E','F','G'));


-- ------------------------------------------------------------
-- 2. Belgian region of a commune / postcode
-- ------------------------------------------------------------
create or replace function public.zfind_be_region(p_commune_code text, p_postal_code text)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_code text := btrim(coalesce(p_commune_code, ''));
  v_pc text := regexp_replace(coalesce(p_postal_code, ''), '\s', '', 'g');
  v_n integer;
begin
  -- NIS (Statbel) commune code: 5 digits, the first ones give the province.
  if v_code ~ '^[0-9]{5}$' then
    if left(v_code, 2) = '21' then return 'BRU'; end if;
    if left(v_code, 2) = '25' or left(v_code, 1) in ('5','6','8','9') then return 'WAL'; end if;
    if left(v_code, 2) in ('23','24') or left(v_code, 1) in ('1','3','4','7') then return 'VLA'; end if;
  end if;
  -- Belgian postcode ranges (bpost).
  if v_pc ~ '^[0-9]{4}$' then
    v_n := v_pc::integer;
    if v_n between 1000 and 1299 then return 'BRU'; end if;
    if v_n between 1300 and 1499 or v_n between 4000 and 7999 then return 'WAL'; end if;
    if v_n between 1500 and 3999 or v_n between 8000 and 9999 then return 'VLA'; end if;
  end if;
  return null;
end;
$$;


-- ------------------------------------------------------------
-- 3. Profile of a Listing
-- ------------------------------------------------------------
create or replace function public.zfind_listing_compliance_profile(p_listing_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_country text; v_target text; v_class text; v_dev uuid; v_tx text; v_commune text; v_postcode text; v_region text;
begin
  select upper(z.country_iso), r.target_type, pr.property_class, pr.development_id, l.transaction_type::text, z.commune_code, pr.postal_code
    into v_country, v_target, v_class, v_dev, v_tx, v_commune, v_postcode
  from public.listings l
  join public.representations r on r.id = l.representation_id
  left join public.properties pr on pr.id = r.property_id
  left join public.developments d on d.id = r.development_id
  left join public.zones_lite z on z.id = coalesce(pr.zone_lite_id, d.zone_lite_id)
  where l.id = p_listing_id
  limit 1;
  if not found or v_country is null or v_tx not in ('sale','rent') then return null; end if;

  if v_country = 'FR' then
    if v_target = 'property' then
      if v_class = 'residential' then
        if v_tx = 'rent' then return 'fr_residential_rent_v1'; end if;
        if v_dev is not null then return 'fr_new_development_sale_v1'; end if;
        return 'fr_residential_sale_v1';
      elsif v_class = 'commercial' then
        return 'fr_commercial_' || v_tx || '_v1';
      elsif v_class = 'land' then
        return 'fr_land_' || v_tx || '_v1';
      end if;
      return null;
    elsif v_target = 'development' and v_tx = 'sale' then
      return 'fr_new_development_sale_v1';
    end if;
    return null;
  elsif v_country = 'BE' then
    v_region := public.zfind_be_region(v_commune, v_postcode);
    if v_region is null then return null; end if;
    return 'be_' || lower(v_region) || '_' || v_tx || '_v1';
  elsif v_country = 'LU' then
    return 'lu_' || v_tx || '_v1';
  end if;
  return null;
end;
$$;


-- ------------------------------------------------------------
-- 4. What a fact set misses for a profile (pure; the browser mirror
--    services/listing-compliance.js sqlMissing() gives the same keys in
--    the same order — tests/sql/listing-compliance.test.mjs)
-- ------------------------------------------------------------
create or replace function public.zfind_compliance_profile_missing(p_profile text, p_facts jsonb)
returns text[]
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  f jsonb := case when jsonb_typeof(p_facts) = 'object' then p_facts else '{}'::jsonb end;
  m text[] := array[]::text[];
  v_dpe_status text;
  v_rent_control_status text;
  fr_classes constant text[] := array['A','B','C','D','E','F','G'];
  tertiary_classes constant text[] := array['A','B','C','D','E','F','G','H','I'];
  wal_classes constant text[] := array['A++','A+','A','B','C','D','E','F','G'];
  bru_classes constant text[] := array['A++','A+','A','B+','B','B-','C+','C','C-','D+','D','D-','E+','E','E-','F','G'];
  vla_labels constant text[] := array['A+','A','B','C','D','E','F'];
  lu_classes constant text[] := array['A+','A','B','C','D','E','F','G','H','I'];
  flood_scores constant text[] := array['A','B','C','D'];
begin
  -- ---------- France, residential (verbatim v2 checks) ----------
  if p_profile in ('fr_residential_sale_v1','fr_residential_rent_v1') then
    if f -> 'georisques_disclosure' is distinct from 'true'::jsonb then m := array_append(m,'georisques_disclosure'); end if;
    if coalesce(f ->> 'fees_payer','') not in ('seller','buyer','landlord','tenant','shared') then m := array_append(m,'fees_payer'); end if;
    if not public.zfind_jsonb_nonnegative_number(f,'agency_fees_amount') then m := array_append(m,'agency_fees_amount'); end if;
    v_dpe_status := coalesce(f ->> 'dpe_status','');
    if v_dpe_status not in ('available','exempt') then
      m := array_append(m,'dpe_status');
    elsif v_dpe_status = 'available' then
      if upper(coalesce(f ->> 'dpe_energy_class','')) not in ('A','B','C','D','E','F','G') then m := array_append(m,'dpe_energy_class'); end if;
      if upper(coalesce(f ->> 'ghg_class','')) not in ('A','B','C','D','E','F','G') then m := array_append(m,'ghg_class'); end if;
      if not public.zfind_jsonb_nonnegative_number(f,'energy_cost_min') then m := array_append(m,'energy_cost_min'); end if;
      if not public.zfind_jsonb_nonnegative_number(f,'energy_cost_max') then m := array_append(m,'energy_cost_max'); end if;
      if public.zfind_jsonb_nonnegative_number(f,'energy_cost_min') and public.zfind_jsonb_nonnegative_number(f,'energy_cost_max') and (f ->> 'energy_cost_max')::numeric < (f ->> 'energy_cost_min')::numeric then m := array_append(m,'energy_cost_range'); end if;
      if not public.zfind_jsonb_text_present(f,'energy_cost_reference_year') then m := array_append(m,'energy_cost_reference_year'); end if;
    else
      if not public.zfind_jsonb_text_present(f,'dpe_exemption_reason') then m := array_append(m,'dpe_exemption_reason'); end if;
    end if;
    if p_profile = 'fr_residential_sale_v1' then
      if jsonb_typeof(f -> 'price_includes_agency_fees') <> 'boolean' then m := array_append(m,'price_includes_agency_fees'); end if;
      if jsonb_typeof(f -> 'is_condominium') <> 'boolean' then
        m := array_append(m,'is_condominium');
      elsif f -> 'is_condominium' = 'true'::jsonb then
        if not public.zfind_jsonb_positive_number(f,'condominium_lots_count') then m := array_append(m,'condominium_lots_count'); end if;
        if not public.zfind_jsonb_nonnegative_number(f,'annual_condominium_charges') then m := array_append(m,'annual_condominium_charges'); end if;
        if not public.zfind_jsonb_text_present(f,'condominium_procedure_status') then m := array_append(m,'condominium_procedure_status'); end if;
      end if;
    else
      if not public.zfind_jsonb_positive_number(f,'surface_habitable_sqm') then m := array_append(m,'surface_habitable_sqm'); end if;
      if not public.zfind_jsonb_nonnegative_number(f,'monthly_rent_excl_charges') then m := array_append(m,'monthly_rent_excl_charges'); end if;
      if not public.zfind_jsonb_nonnegative_number(f,'monthly_charges') then m := array_append(m,'monthly_charges'); end if;
      if coalesce(f ->> 'charges_recovery_method','') not in ('provision','forfait','none') then m := array_append(m,'charges_recovery_method'); end if;
      if not public.zfind_jsonb_nonnegative_number(f,'deposit_amount') then m := array_append(m,'deposit_amount'); end if;
      if not public.zfind_jsonb_nonnegative_number(f,'tenant_fees_amount') then m := array_append(m,'tenant_fees_amount'); end if;
      if not public.zfind_jsonb_nonnegative_number(f,'inventory_fees_amount') then m := array_append(m,'inventory_fees_amount'); end if;
      if jsonb_typeof(f -> 'furnished') <> 'boolean' then m := array_append(m,'furnished'); end if;
      v_rent_control_status := coalesce(f ->> 'rent_control_status','');
      if v_rent_control_status not in ('applicable','not_applicable') then
        m := array_append(m,'rent_control_status');
      elsif v_rent_control_status = 'applicable' then
        if not public.zfind_jsonb_positive_number(f,'reference_rent') then m := array_append(m,'reference_rent'); end if;
        if not public.zfind_jsonb_positive_number(f,'increased_reference_rent') then m := array_append(m,'increased_reference_rent'); end if;
        if not public.zfind_jsonb_nonnegative_number(f,'rent_supplement_amount') then m := array_append(m,'rent_supplement_amount'); end if;
      end if;
    end if;
    return m;
  end if;

  -- ---------- France, programme neuf (VEFA): a strict subset of fr_residential_sale_v1 ----------
  if p_profile = 'fr_new_development_sale_v1' then
    if f -> 'georisques_disclosure' is distinct from 'true'::jsonb then m := array_append(m,'georisques_disclosure'); end if;
    if coalesce(f ->> 'fees_payer','') not in ('seller','buyer','landlord','tenant','shared') then m := array_append(m,'fees_payer'); end if;
    if not public.zfind_jsonb_nonnegative_number(f,'agency_fees_amount') then m := array_append(m,'agency_fees_amount'); end if;
    v_dpe_status := coalesce(f ->> 'dpe_status','');
    if v_dpe_status not in ('available','exempt','pending_completion') then
      m := array_append(m,'dpe_status');
    elsif v_dpe_status = 'available' then
      if upper(coalesce(f ->> 'dpe_energy_class','')) <> all (fr_classes) then m := array_append(m,'dpe_energy_class'); end if;
      if upper(coalesce(f ->> 'ghg_class','')) <> all (fr_classes) then m := array_append(m,'ghg_class'); end if;
      if not public.zfind_jsonb_nonnegative_number(f,'energy_cost_min') then m := array_append(m,'energy_cost_min'); end if;
      if not public.zfind_jsonb_nonnegative_number(f,'energy_cost_max') then m := array_append(m,'energy_cost_max'); end if;
      if public.zfind_jsonb_nonnegative_number(f,'energy_cost_min') and public.zfind_jsonb_nonnegative_number(f,'energy_cost_max') and (f ->> 'energy_cost_max')::numeric < (f ->> 'energy_cost_min')::numeric then m := array_append(m,'energy_cost_range'); end if;
      if not public.zfind_jsonb_text_present(f,'energy_cost_reference_year') then m := array_append(m,'energy_cost_reference_year'); end if;
    elsif v_dpe_status = 'exempt' then
      if not public.zfind_jsonb_text_present(f,'dpe_exemption_reason') then m := array_append(m,'dpe_exemption_reason'); end if;
    end if;
    if jsonb_typeof(f -> 'price_includes_agency_fees') <> 'boolean' then m := array_append(m,'price_includes_agency_fees'); end if;
    return m;
  end if;

  -- ---------- France, commercial / land ----------
  if p_profile in ('fr_commercial_sale_v1','fr_commercial_rent_v1','fr_land_sale_v1','fr_land_rent_v1') then
    if f -> 'georisques_disclosure' is distinct from 'true'::jsonb then m := array_append(m,'georisques_disclosure'); end if;
    if p_profile in ('fr_commercial_sale_v1','fr_land_sale_v1') then
      if coalesce(f ->> 'fees_payer','') not in ('seller','buyer','shared') then m := array_append(m,'fees_payer'); end if;
      if not public.zfind_jsonb_nonnegative_number(f,'agency_fees_amount') then m := array_append(m,'agency_fees_amount'); end if;
      if coalesce(jsonb_typeof(f -> 'price_includes_agency_fees'),'') <> 'boolean' then m := array_append(m,'price_includes_agency_fees'); end if;
    elsif p_profile = 'fr_land_rent_v1' then
      if coalesce(f ->> 'fees_payer','') not in ('landlord','tenant','shared') then m := array_append(m,'fees_payer'); end if;
      if not public.zfind_jsonb_nonnegative_number(f,'agency_fees_amount') then m := array_append(m,'agency_fees_amount'); end if;
    end if;
    if p_profile in ('fr_commercial_sale_v1','fr_commercial_rent_v1') then
      v_dpe_status := coalesce(f ->> 'dpe_status','');
      if v_dpe_status not in ('available','exempt') then
        m := array_append(m,'dpe_status');
      elsif v_dpe_status = 'available' then
        if upper(coalesce(f ->> 'dpe_energy_class','')) <> all (tertiary_classes) then m := array_append(m,'dpe_energy_class'); end if;
        if upper(coalesce(f ->> 'ghg_class','')) <> all (tertiary_classes) then m := array_append(m,'ghg_class'); end if;
      else
        if not public.zfind_jsonb_text_present(f,'dpe_exemption_reason') then m := array_append(m,'dpe_exemption_reason'); end if;
      end if;
    end if;
    if p_profile = 'fr_commercial_sale_v1' then
      if coalesce(jsonb_typeof(f -> 'is_condominium'),'') <> 'boolean' then
        m := array_append(m,'is_condominium');
      elsif f -> 'is_condominium' = 'true'::jsonb then
        if not public.zfind_jsonb_positive_number(f,'condominium_lots_count') then m := array_append(m,'condominium_lots_count'); end if;
        if not public.zfind_jsonb_nonnegative_number(f,'annual_condominium_charges') then m := array_append(m,'annual_condominium_charges'); end if;
        if not public.zfind_jsonb_text_present(f,'condominium_procedure_status') then m := array_append(m,'condominium_procedure_status'); end if;
      end if;
    end if;
    return m;
  end if;

  -- ---------- Belgium: Wallonie / Bruxelles-Capitale (certificat PEB) ----------
  if p_profile in ('be_wal_sale_v1','be_wal_rent_v1','be_bru_sale_v1','be_bru_rent_v1') then
    v_dpe_status := coalesce(f ->> 'peb_status','');
    if v_dpe_status not in ('available','exempt') then
      m := array_append(m,'peb_status');
    elsif v_dpe_status = 'available' then
      if p_profile like 'be_wal_%' then
        if upper(coalesce(f ->> 'peb_class','')) <> all (wal_classes) then m := array_append(m,'peb_class'); end if;
        if not public.zfind_jsonb_nonnegative_number(f,'peb_specific_consumption_kwh_m2') then m := array_append(m,'peb_specific_consumption_kwh_m2'); end if;
        if not public.zfind_jsonb_nonnegative_number(f,'peb_total_consumption_kwh') then m := array_append(m,'peb_total_consumption_kwh'); end if;
        if not public.zfind_jsonb_text_present(f,'peb_certificate_code') then m := array_append(m,'peb_certificate_code'); end if;
      else
        if upper(coalesce(f ->> 'peb_class','')) <> all (bru_classes) then m := array_append(m,'peb_class'); end if;
        if not public.zfind_jsonb_nonnegative_number(f,'peb_primary_energy_kwh_m2') then m := array_append(m,'peb_primary_energy_kwh_m2'); end if;
        if not public.zfind_jsonb_nonnegative_number(f,'peb_co2_kg_m2') then m := array_append(m,'peb_co2_kg_m2'); end if;
      end if;
    else
      if not public.zfind_jsonb_text_present(f,'peb_exemption_reason') then m := array_append(m,'peb_exemption_reason'); end if;
    end if;
    if p_profile like '%_rent_v1' then
      if not public.zfind_jsonb_nonnegative_number(f,'monthly_rent') then m := array_append(m,'monthly_rent'); end if;
      if not public.zfind_jsonb_nonnegative_number(f,'monthly_common_charges') then m := array_append(m,'monthly_common_charges'); end if;
    end if;
    return m;
  end if;

  -- ---------- Belgium: Flandre (EPC, watertoets, stedenbouwkundige informatie) ----------
  if p_profile in ('be_vla_sale_v1','be_vla_rent_v1') then
    v_dpe_status := coalesce(f ->> 'epc_status','');
    if v_dpe_status not in ('available','exempt') then
      m := array_append(m,'epc_status');
    elsif v_dpe_status = 'available' then
      if not public.zfind_jsonb_nonnegative_number(f,'epc_score_kwh_m2') then m := array_append(m,'epc_score_kwh_m2'); end if;
      if not public.zfind_jsonb_text_present(f,'epc_unique_code') and f -> 'epc_address_in_ad' is distinct from 'true'::jsonb then m := array_append(m,'epc_unique_code'); end if;
    else
      if not public.zfind_jsonb_text_present(f,'epc_exemption_reason') then m := array_append(m,'epc_exemption_reason'); end if;
    end if;
    if p_profile = 'be_vla_sale_v1' then
      if coalesce(jsonb_typeof(f -> 'renovation_obligation'),'') <> 'boolean' then m := array_append(m,'renovation_obligation'); end if;
      if upper(coalesce(f ->> 'flood_p_score','')) <> all (flood_scores) then m := array_append(m,'flood_p_score'); end if;
      if coalesce(jsonb_typeof(f -> 'plot_is_built'),'') <> 'boolean' then
        m := array_append(m,'plot_is_built');
      elsif f -> 'plot_is_built' = 'true'::jsonb then
        if upper(coalesce(f ->> 'flood_g_score','')) <> all (flood_scores) then m := array_append(m,'flood_g_score'); end if;
      end if;
      if coalesce(jsonb_typeof(f -> 'urban_permit_issued'),'') <> 'boolean' then m := array_append(m,'urban_permit_issued'); end if;
      if not public.zfind_jsonb_text_present(f,'urban_zoning_designation') then m := array_append(m,'urban_zoning_designation'); end if;
      if coalesce(jsonb_typeof(f -> 'urban_summons'),'') <> 'boolean' then m := array_append(m,'urban_summons'); end if;
      if coalesce(jsonb_typeof(f -> 'urban_preemption_right'),'') <> 'boolean' then m := array_append(m,'urban_preemption_right'); end if;
      if coalesce(jsonb_typeof(f -> 'urban_subdivision_permit'),'') <> 'boolean' then m := array_append(m,'urban_subdivision_permit'); end if;
    else
      if not public.zfind_jsonb_nonnegative_number(f,'monthly_rent') then m := array_append(m,'monthly_rent'); end if;
      if not public.zfind_jsonb_nonnegative_number(f,'monthly_common_charges') then m := array_append(m,'monthly_common_charges'); end if;
    end if;
    return m;
  end if;

  -- ---------- Luxembourg (certificat de performance énergétique) ----------
  if p_profile in ('lu_sale_v1','lu_rent_v1') then
    v_dpe_status := coalesce(f ->> 'cpe_status','');
    if v_dpe_status not in ('available','exempt') then
      m := array_append(m,'cpe_status');
    elsif v_dpe_status = 'available' then
      if upper(coalesce(f ->> 'cpe_energy_class','')) <> all (lu_classes) then m := array_append(m,'cpe_energy_class'); end if;
      if upper(coalesce(f ->> 'cpe_insulation_class','')) <> all (lu_classes) then m := array_append(m,'cpe_insulation_class'); end if;
    else
      if not public.zfind_jsonb_text_present(f,'cpe_exemption_reason') then m := array_append(m,'cpe_exemption_reason'); end if;
    end if;
    return m;
  end if;

  return array['unsupported_profile']::text[];
end;
$$;


-- ------------------------------------------------------------
-- 5. Validator: FR, BE and LU (same JSON shape as v2)
-- ------------------------------------------------------------
create or replace function public.zfind_validate_listing_compliance_facts(p_listing_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_jurisdiction text;
  v_profile text;
  v_facts jsonb := '{}'::jsonb;
  v_has_record boolean := false;
  v_missing text[] := array[]::text[];
begin
  v_jurisdiction := public.zfind_listing_jurisdiction(p_listing_id);
  v_profile := public.zfind_listing_compliance_profile(p_listing_id);

  if v_jurisdiction is null then
    return jsonb_build_object('jurisdiction_iso',null,'profile',null,'facts_valid',false,'missing',jsonb_build_array('jurisdiction_unresolved'));
  end if;
  if v_jurisdiction not in ('FR','BE','LU') then
    return jsonb_build_object('jurisdiction_iso',v_jurisdiction,'profile',null,'facts_valid',false,'missing',jsonb_build_array('unsupported_jurisdiction'));
  end if;
  if v_profile is null then
    -- Belgium: a sale / rent without a profile means the region (commune
    -- code or postcode) could not be determined.
    return jsonb_build_object('jurisdiction_iso',v_jurisdiction,'profile',null,'facts_valid',false,'missing',
      jsonb_build_array(case when v_jurisdiction = 'BE' and exists (
          select 1 from public.listings l where l.id = p_listing_id and l.transaction_type::text in ('sale','rent'))
        then 'be_region_unresolved' else 'unsupported_profile' end));
  end if;

  select c.facts into v_facts from public.zfind_listing_compliance c where c.listing_id = p_listing_id;
  if found then v_has_record := true; else v_facts := '{}'::jsonb; end if;
  if not v_has_record then v_missing := array_append(v_missing,'compliance_record'); end if;
  v_missing := v_missing || public.zfind_compliance_profile_missing(v_profile, v_facts);

  return jsonb_build_object('jurisdiction_iso',v_jurisdiction,'profile',v_profile,'facts_valid',cardinality(v_missing)=0,'missing',to_jsonb(v_missing));
end;
$$;


-- ------------------------------------------------------------
-- 6. Saving: approved facts of a published Listing stay locked; facts
--    never approved may be recorded on a published Listing (legacy
--    BE / LU listings published before this gate).
-- ------------------------------------------------------------
create or replace function public.zfind_save_listing_compliance(p_listing_id uuid,p_facts jsonb,p_source_evidence jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare v_listing_status text; v_old_facts jsonb; v_old_review text; v_exists boolean := false; v_changed boolean := true;
begin
  if not public.zfind_can_manage_listing_compliance(p_listing_id) then raise exception 'Listing compliance access denied' using errcode='42501'; end if;
  if p_facts is null or jsonb_typeof(p_facts)<>'object' then raise exception 'p_facts must be a JSON object' using errcode='22023'; end if;
  if p_source_evidence is null or jsonb_typeof(p_source_evidence)<>'object' then raise exception 'p_source_evidence must be a JSON object' using errcode='22023'; end if;
  select l.status into v_listing_status from public.listings l where l.id=p_listing_id for update;
  if not found then raise exception 'Listing not found' using errcode='P0002'; end if;
  select c.facts, c.review_status into v_old_facts, v_old_review from public.zfind_listing_compliance c where c.listing_id=p_listing_id for update;
  if found then v_exists:=true; v_changed:=v_old_facts is distinct from p_facts; end if;
  if v_listing_status='published' and v_changed and v_exists and v_old_review='approved' then raise exception 'Suspend the Listing before changing approved compliance facts' using errcode='55000'; end if;
  if not v_exists then
    insert into public.zfind_listing_compliance(listing_id,facts,source_evidence,review_status) values(p_listing_id,p_facts,p_source_evidence,'pending');
  else
    update public.zfind_listing_compliance c set facts=p_facts,source_evidence=p_source_evidence,review_status=case when v_changed then 'pending' else c.review_status end,review_note=case when v_changed then null else c.review_note end,reviewed_by=case when v_changed then null else c.reviewed_by end,reviewed_at=case when v_changed then null else c.reviewed_at end where c.listing_id=p_listing_id;
  end if;
  return public.zfind_get_listing_compliance(p_listing_id);
end;
$$;


-- ------------------------------------------------------------
-- 7. Publish gate: France, Belgium, Luxembourg. Only the transition to
--    'published' is checked (as before): already published listings are
--    never touched.
-- ------------------------------------------------------------
create or replace function public.zfind_enforce_listing_compliance_before_publish()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare v_jurisdiction text; v_assessment jsonb; v_country_name text;
begin
  if new.status<>'published' then return new; end if;
  if tg_op='UPDATE' and old.status is not distinct from new.status then return new; end if;
  select upper(z.country_iso) into v_jurisdiction from public.representations r left join public.properties pr on pr.id=r.property_id left join public.developments d on d.id=r.development_id left join public.zones_lite z on z.id=coalesce(pr.zone_lite_id,d.zone_lite_id) where r.id=new.representation_id limit 1;
  if v_jurisdiction is null or v_jurisdiction not in ('FR','BE','LU') then return new; end if;
  v_country_name := case v_jurisdiction when 'FR' then 'France' when 'BE' then 'Belgium' else 'Luxembourg' end;
  if tg_op='INSERT' then raise exception '% Listings must be created before publication and pass compliance review', v_country_name using errcode='55000'; end if;
  v_assessment:=public.zfind_assess_listing_compliance(new.id);
  if not coalesce((v_assessment ->> 'compliant')::boolean,false) then raise exception '% Listing compliance gate failed: %', v_country_name, v_assessment -> 'missing' using errcode='55000'; end if;
  return new;
end;
$$;


-- ------------------------------------------------------------
-- 8. Partner submission readiness (20261009180000): the mandatory
--    information is now checked for FR, BE and LU listings.
-- ------------------------------------------------------------
create or replace function public.zfind_listing_submission_missing(p_listing_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_listing public.listings%rowtype;
  v_rep public.representations%rowtype;
  v_missing text[] := array[]::text[];
  v_jurisdiction text;
  v_review_status text;
begin
  select l.* into v_listing from public.listings l where l.id = p_listing_id;
  if not found then
    return array['listing_not_found']::text[];
  end if;
  select r.* into v_rep from public.representations r where r.id = v_listing.representation_id;

  v_jurisdiction := public.zfind_listing_jurisdiction(p_listing_id);
  if v_jurisdiction is null then
    v_missing := array_append(v_missing, 'commune');
  end if;

  if not exists (
    select 1 from public.listing_content lc
    where lc.listing_id = p_listing_id and lc.locale = 'fr'
      and nullif(pg_catalog.btrim(lc.title), '') is not null
  ) then
    v_missing := array_append(v_missing, 'title_fr');
  end if;

  if not exists (
    select 1 from public.listing_content lc
    where lc.listing_id = p_listing_id and lc.locale = 'fr'
      and nullif(pg_catalog.btrim(lc.description), '') is not null
  ) then
    v_missing := array_append(v_missing, 'description_fr');
  end if;

  if coalesce(v_listing.price_current, 0) <= 0 then
    v_missing := array_append(v_missing, 'price');
  end if;

  if v_rep.target_type = 'development' then
    if not exists (select 1 from public.development_media dm where dm.development_id = v_rep.development_id) then
      v_missing := array_append(v_missing, 'photo');
    end if;
  elsif not exists (select 1 from public.listing_media lm where lm.listing_id = p_listing_id) then
    v_missing := array_append(v_missing, 'photo');
  end if;

  -- France, Belgium, Luxembourg: the mandatory information must be saved
  -- and complete (approval by Z Find comes after submission).
  if v_jurisdiction in ('FR', 'BE', 'LU') then
    if public.zfind_listing_compliance_profile(p_listing_id) is null then
      v_missing := array_append(v_missing, 'compliance_unsupported');
    else
      select c.review_status into v_review_status
      from public.zfind_listing_compliance c where c.listing_id = p_listing_id;
      if not found
         or not coalesce((public.zfind_validate_listing_compliance_facts(p_listing_id) ->> 'facts_valid')::boolean, false) then
        v_missing := array_append(v_missing, 'compliance_facts');
      elsif v_review_status = 'rejected' then
        v_missing := array_append(v_missing, 'compliance_rejected');
      end if;
    end if;
  end if;

  return v_missing;
end;
$$;

create or replace function public.zfind_listing_submission_missing_text(p_missing text[])
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(string_agg(
    case m.code
      when 'commune' then 'la commune du bien'
      when 'title_fr' then 'un titre en français'
      when 'description_fr' then 'une description en français'
      when 'price' then 'un prix supérieur à 0'
      when 'photo' then 'au moins une photo'
      when 'compliance_facts' then 'les mentions obligatoires complètes et enregistrées'
      when 'compliance_rejected' then 'les mentions obligatoires corrigées (refusées par Z Find)'
      when 'compliance_unsupported' then 'un type d’annonce couvert par les mentions obligatoires (commune et type de bien à vérifier)'
      else m.code
    end, ', ' order by m.ord), '')
  from unnest(coalesce(p_missing, array[]::text[])) with ordinality as m(code, ord);
$$;


-- ------------------------------------------------------------
-- 9. Grants (same pattern as the v2 compliance functions: internal
--    helpers are not callable by clients)
-- ------------------------------------------------------------
revoke all on function public.zfind_be_region(text, text) from public, anon, authenticated;
revoke all on function public.zfind_compliance_profile_missing(text, jsonb) from public, anon, authenticated;
revoke all on function public.zfind_listing_compliance_profile(uuid) from public, anon, authenticated;
revoke all on function public.zfind_validate_listing_compliance_facts(uuid) from public, anon, authenticated;
revoke all on function public.zfind_save_listing_compliance(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.zfind_enforce_listing_compliance_before_publish() from public, anon, authenticated;
revoke all on function public.zfind_listing_submission_missing(uuid) from public, anon, authenticated;
revoke all on function public.zfind_listing_submission_missing_text(text[]) from public, anon, authenticated;
grant execute on function public.zfind_save_listing_compliance(uuid, jsonb, jsonb) to authenticated;

comment on function public.zfind_compliance_profile_missing(text, jsonb) is
  'Mandatory listing information missing for a compliance profile (FR residential / programme neuf / commercial / land, BE Wallonie / Bruxelles / Flandre, LU). Pure; mirrored by zfind-web services/listing-compliance.js sqlMissing().';
comment on function public.zfind_be_region(text, text) is
  'Belgian region (WAL, BRU, VLA) from the commune NIS code, else from the postcode.';
