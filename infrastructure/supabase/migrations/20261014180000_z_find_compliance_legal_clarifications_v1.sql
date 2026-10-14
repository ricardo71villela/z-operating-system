-- ============================================================
-- Z FIND — Mentions obligatoires: legal clarifications after
-- 20261014120000_z_find_compliance_coverage_be_lu_class_g_v1 — v1
--
-- Idempotent: one CREATE OR REPLACE of the pure validator
-- zfind_compliance_profile_missing (same signature, same grants).
-- No table, column, constraint or row is changed. Profiles keep their
-- _v1 names: the only change is ADDITIVE and only reachable through a
-- dpe_status ('pending_completion') that no existing France row uses
-- (the 7 production FR rows are residential sale / rent), so every
-- record valid before stays valid after.
--
-- Three doubts left by PR #162, researched on official sources:
--
-- 1. BRUXELLES-CAPITALE (be_bru_sale_v1 / be_bru_rent_v1) — NO CHANGE.
--    Bruxelles Environnement, « Le certificat PEB d'un logement en
--    Région bruxelloise » (environnement.brussels): the owner states the
--    energy class AND the energy performance in kWh/m².an (primary
--    energy) in the sale / rent ad; info-fiche « La publicité du
--    certificat PEB en cas d'annonce immobilière » (07/01/2020):
--    « Communiquer la classe énergétique dans toute publicité ».
--    The certificate NUMBER is not a mandatory ad item in any official
--    source -> peb_certificate_code stays optional for Brussels.
--    CO2 (kg CO2/m².an): required by the older official info sheet on
--    the residential certificate (« la classe énergétique et les
--    émissions de CO2 »), no longer listed in the current pages; it is
--    printed on every certificate, so the prudent choice is kept:
--    peb_co2_kg_m2 stays required.
--
-- 2. FLANDRE (be_vla_rent_v1) — NO CHANGE (confirmed).
--    vlaanderen.be « Verplichte vermelding van EPC-informatie in
--    advertenties »: the EPC score / label and the full address or the
--    unique code apply to sale AND rent ads; the renovatieplicht
--    mention applies to the publicity linked to a notarial transfer in
--    full ownership (or the creation / transfer of opstal / erfpacht)
--    of a building with label E or worse (residential) / F or worse
--    (non-residential) — not to rentals. be_vla_rent_v1 already does not
--    require renovation_obligation; be_vla_sale_v1 keeps it.
--
-- 3. FRANCE, PROGRAMME NEUF / VEFA (fr_new_development_sale_v1).
--    The DPE of a new building is established at the request of the
--    maître d'ouvrage « lors de la construction » (CCH L.126-27; arrêté
--    du 31 mars 2021 art. 13-19: drawn from the RSET / RSEE of the
--    étude thermique and the attestation « à l'achèvement des
--    travaux »); in a VEFA the seller is exempt from providing a DPE at
--    the signing of the contract and provides it at the latest on
--    delivery (ANIL, analyses juridiques « Diagnostic de performance
--    énergétique » and « aj-dpe »).
--    CCH L.126-33 requires the DPE classes in ads for property « devant
--    faire l'objet d'un DPE »: before completion no DPE exists, so the
--    ad states « DPE établi à l'achèvement des travaux » (dpe_status
--    'pending_completion', unchanged). NEW: the ad MAY show the classes
--    estimated by the étude thermique (RSET RT2012 / RSEE RE2020),
--    always labelled « prévisionnelles » — optional keys
--    dpe_provisional_energy_class / dpe_provisional_ghg_class, checked on
--    the A–G scale when present (missing keys of the same names).
--    Copropriété (CCH L.721-1): unchanged — not required for VEFA (the
--    syndicate is not constituted before the first lots are delivered;
--    only a provisional budget exists).
--
-- Also checked: Luxembourg — no rule found requiring the agent's
-- commission in ads (fees stay optional); France tertiary DPE — energy
-- and climate labels on scales up to I (unchanged).
-- ============================================================


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
    else
      -- pending_completion: the DPE does not exist yet (established at
      -- completion, CCH L.126-27). Optional « classes prévisionnelles »
      -- from the étude thermique (RSET RT2012 / RSEE RE2020): when given,
      -- they must be on the A–G scale.
      if btrim(coalesce(f ->> 'dpe_provisional_energy_class','')) <> '' and upper(f ->> 'dpe_provisional_energy_class') <> all (fr_classes) then m := array_append(m,'dpe_provisional_energy_class'); end if;
      if btrim(coalesce(f ->> 'dpe_provisional_ghg_class','')) <> '' and upper(f ->> 'dpe_provisional_ghg_class') <> all (fr_classes) then m := array_append(m,'dpe_provisional_ghg_class'); end if;
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


revoke all on function public.zfind_compliance_profile_missing(text, jsonb) from public, anon, authenticated;

comment on function public.zfind_compliance_profile_missing(text, jsonb) is
  'Mandatory listing information missing for a compliance profile (FR residential / programme neuf / commercial / land, BE Wallonie / Bruxelles / Flandre, LU). Pure; mirrored by zfind-web services/listing-compliance.js sqlMissing(). Programme neuf: optional provisional DPE classes (étude thermique) checked A–G (migration 20261014180000).';
