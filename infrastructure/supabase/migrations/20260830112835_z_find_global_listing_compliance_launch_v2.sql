-- Z FIND — Global Listing Compliance Launch V2
-- Applied authority version: 20260830112835
-- France-first publication enforcement; global model remains jurisdiction-aware.

create table public.zfind_listing_compliance (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  facts jsonb not null default '{}'::jsonb,
  source_evidence jsonb not null default '{}'::jsonb,
  review_status text not null default 'unreviewed',
  review_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint zfind_listing_compliance_facts_object_chk check (jsonb_typeof(facts) = 'object'),
  constraint zfind_listing_compliance_evidence_object_chk check (jsonb_typeof(source_evidence) = 'object'),
  constraint zfind_listing_compliance_review_status_chk check (review_status in ('unreviewed','pending','approved','rejected'))
);

alter table public.zfind_listing_compliance enable row level security;
revoke all on table public.zfind_listing_compliance from public, anon, authenticated;

create or replace function public.zfind_listing_compliance_touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger zfind_listing_compliance_touch_updated_at
before update on public.zfind_listing_compliance
for each row execute function public.zfind_listing_compliance_touch_updated_at();

create or replace function public.zfind_jsonb_text_present(p_obj jsonb, p_key text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select jsonb_typeof(p_obj -> p_key) = 'string'
     and nullif(btrim(p_obj ->> p_key), '') is not null;
$$;

create or replace function public.zfind_jsonb_nonnegative_number(p_obj jsonb, p_key text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select case when jsonb_typeof(p_obj -> p_key) = 'number'
    then (p_obj ->> p_key)::numeric >= 0 else false end;
$$;

create or replace function public.zfind_jsonb_positive_number(p_obj jsonb, p_key text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select case when jsonb_typeof(p_obj -> p_key) = 'number'
    then (p_obj ->> p_key)::numeric > 0 else false end;
$$;

create or replace function public.zfind_listing_jurisdiction(p_listing_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select upper(z.country_iso)
  from public.listings l
  join public.representations r on r.id = l.representation_id
  left join public.properties pr on pr.id = r.property_id
  left join public.developments d on d.id = r.development_id
  left join public.zones_lite z on z.id = coalesce(pr.zone_lite_id, d.zone_lite_id)
  where l.id = p_listing_id
  limit 1;
$$;

create or replace function public.zfind_listing_compliance_profile(p_listing_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select case
    when upper(z.country_iso) <> 'FR' then null
    when r.target_type = 'property' and pr.property_class = 'residential' and l.transaction_type = 'sale'
      then 'fr_residential_sale_v1'
    when r.target_type = 'property' and pr.property_class = 'residential' and l.transaction_type = 'rent'
      then 'fr_residential_rent_v1'
    else null
  end
  from public.listings l
  join public.representations r on r.id = l.representation_id
  left join public.properties pr on pr.id = r.property_id
  left join public.developments d on d.id = r.development_id
  left join public.zones_lite z on z.id = coalesce(pr.zone_lite_id, d.zone_lite_id)
  where l.id = p_listing_id
  limit 1;
$$;

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
  v_dpe_status text;
  v_rent_control_status text;
begin
  v_jurisdiction := public.zfind_listing_jurisdiction(p_listing_id);
  v_profile := public.zfind_listing_compliance_profile(p_listing_id);

  if v_jurisdiction is null then
    return jsonb_build_object('jurisdiction_iso',null,'profile',null,'facts_valid',false,'missing',jsonb_build_array('jurisdiction_unresolved'));
  end if;
  if v_jurisdiction <> 'FR' then
    return jsonb_build_object('jurisdiction_iso',v_jurisdiction,'profile',null,'facts_valid',false,'missing',jsonb_build_array('unsupported_jurisdiction'));
  end if;
  if v_profile is null then
    return jsonb_build_object('jurisdiction_iso',v_jurisdiction,'profile',null,'facts_valid',false,'missing',jsonb_build_array('unsupported_profile'));
  end if;

  select c.facts into v_facts from public.zfind_listing_compliance c where c.listing_id = p_listing_id;
  if found then v_has_record := true; else v_facts := '{}'::jsonb; end if;
  if not v_has_record then v_missing := array_append(v_missing,'compliance_record'); end if;
  if v_facts -> 'georisques_disclosure' is distinct from 'true'::jsonb then v_missing := array_append(v_missing,'georisques_disclosure'); end if;
  if coalesce(v_facts ->> 'fees_payer','') not in ('seller','buyer','landlord','tenant','shared') then v_missing := array_append(v_missing,'fees_payer'); end if;
  if not public.zfind_jsonb_nonnegative_number(v_facts,'agency_fees_amount') then v_missing := array_append(v_missing,'agency_fees_amount'); end if;

  v_dpe_status := coalesce(v_facts ->> 'dpe_status','');
  if v_dpe_status not in ('available','exempt') then
    v_missing := array_append(v_missing,'dpe_status');
  elsif v_dpe_status = 'available' then
    if upper(coalesce(v_facts ->> 'dpe_energy_class','')) not in ('A','B','C','D','E','F','G') then v_missing := array_append(v_missing,'dpe_energy_class'); end if;
    if upper(coalesce(v_facts ->> 'ghg_class','')) not in ('A','B','C','D','E','F','G') then v_missing := array_append(v_missing,'ghg_class'); end if;
    if not public.zfind_jsonb_nonnegative_number(v_facts,'energy_cost_min') then v_missing := array_append(v_missing,'energy_cost_min'); end if;
    if not public.zfind_jsonb_nonnegative_number(v_facts,'energy_cost_max') then v_missing := array_append(v_missing,'energy_cost_max'); end if;
    if public.zfind_jsonb_nonnegative_number(v_facts,'energy_cost_min') and public.zfind_jsonb_nonnegative_number(v_facts,'energy_cost_max') and (v_facts ->> 'energy_cost_max')::numeric < (v_facts ->> 'energy_cost_min')::numeric then v_missing := array_append(v_missing,'energy_cost_range'); end if;
    if not public.zfind_jsonb_text_present(v_facts,'energy_cost_reference_year') then v_missing := array_append(v_missing,'energy_cost_reference_year'); end if;
  else
    if not public.zfind_jsonb_text_present(v_facts,'dpe_exemption_reason') then v_missing := array_append(v_missing,'dpe_exemption_reason'); end if;
  end if;

  if v_profile = 'fr_residential_sale_v1' then
    if jsonb_typeof(v_facts -> 'price_includes_agency_fees') <> 'boolean' then v_missing := array_append(v_missing,'price_includes_agency_fees'); end if;
    if jsonb_typeof(v_facts -> 'is_condominium') <> 'boolean' then
      v_missing := array_append(v_missing,'is_condominium');
    elsif v_facts -> 'is_condominium' = 'true'::jsonb then
      if not public.zfind_jsonb_positive_number(v_facts,'condominium_lots_count') then v_missing := array_append(v_missing,'condominium_lots_count'); end if;
      if not public.zfind_jsonb_nonnegative_number(v_facts,'annual_condominium_charges') then v_missing := array_append(v_missing,'annual_condominium_charges'); end if;
      if not public.zfind_jsonb_text_present(v_facts,'condominium_procedure_status') then v_missing := array_append(v_missing,'condominium_procedure_status'); end if;
    end if;
  elsif v_profile = 'fr_residential_rent_v1' then
    if not public.zfind_jsonb_positive_number(v_facts,'surface_habitable_sqm') then v_missing := array_append(v_missing,'surface_habitable_sqm'); end if;
    if not public.zfind_jsonb_nonnegative_number(v_facts,'monthly_rent_excl_charges') then v_missing := array_append(v_missing,'monthly_rent_excl_charges'); end if;
    if not public.zfind_jsonb_nonnegative_number(v_facts,'monthly_charges') then v_missing := array_append(v_missing,'monthly_charges'); end if;
    if coalesce(v_facts ->> 'charges_recovery_method','') not in ('provision','forfait','none') then v_missing := array_append(v_missing,'charges_recovery_method'); end if;
    if not public.zfind_jsonb_nonnegative_number(v_facts,'deposit_amount') then v_missing := array_append(v_missing,'deposit_amount'); end if;
    if not public.zfind_jsonb_nonnegative_number(v_facts,'tenant_fees_amount') then v_missing := array_append(v_missing,'tenant_fees_amount'); end if;
    if not public.zfind_jsonb_nonnegative_number(v_facts,'inventory_fees_amount') then v_missing := array_append(v_missing,'inventory_fees_amount'); end if;
    if jsonb_typeof(v_facts -> 'furnished') <> 'boolean' then v_missing := array_append(v_missing,'furnished'); end if;
    v_rent_control_status := coalesce(v_facts ->> 'rent_control_status','');
    if v_rent_control_status not in ('applicable','not_applicable') then
      v_missing := array_append(v_missing,'rent_control_status');
    elsif v_rent_control_status = 'applicable' then
      if not public.zfind_jsonb_positive_number(v_facts,'reference_rent') then v_missing := array_append(v_missing,'reference_rent'); end if;
      if not public.zfind_jsonb_positive_number(v_facts,'increased_reference_rent') then v_missing := array_append(v_missing,'increased_reference_rent'); end if;
      if not public.zfind_jsonb_nonnegative_number(v_facts,'rent_supplement_amount') then v_missing := array_append(v_missing,'rent_supplement_amount'); end if;
    end if;
  end if;

  return jsonb_build_object('jurisdiction_iso',v_jurisdiction,'profile',v_profile,'facts_valid',cardinality(v_missing)=0,'missing',to_jsonb(v_missing));
end;
$$;

create or replace function public.zfind_assess_listing_compliance(p_listing_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare v_base jsonb; v_review_status text := 'unreviewed'; v_missing text[] := array[]::text[];
begin
  v_base := public.zfind_validate_listing_compliance_facts(p_listing_id);
  select c.review_status into v_review_status from public.zfind_listing_compliance c where c.listing_id=p_listing_id;
  if not found then v_review_status := 'unreviewed'; end if;
  select coalesce(array_agg(value),array[]::text[]) into v_missing from jsonb_array_elements_text(coalesce(v_base -> 'missing','[]'::jsonb)) as t(value);
  if v_review_status <> 'approved' then v_missing := array_append(v_missing,'review_approval'); end if;
  return v_base || jsonb_build_object('review_status',v_review_status,'compliant',coalesce((v_base ->> 'facts_valid')::boolean,false) and v_review_status='approved','missing',to_jsonb(v_missing));
end;
$$;

create or replace function public.zfind_can_manage_listing_compliance(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin') or public.zfind_partner_controls_listing(p_listing_id);
$$;

create or replace function public.zfind_get_listing_compliance(p_listing_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare v_row public.zfind_listing_compliance%rowtype;
begin
  if not public.zfind_can_manage_listing_compliance(p_listing_id) then raise exception 'Listing compliance access denied' using errcode='42501'; end if;
  select * into v_row from public.zfind_listing_compliance c where c.listing_id=p_listing_id;
  if not found then
    return jsonb_build_object('listing_id',p_listing_id,'facts','{}'::jsonb,'source_evidence','{}'::jsonb,'review_status','unreviewed','review_note',null,'reviewed_at',null,'jurisdiction_iso',public.zfind_listing_jurisdiction(p_listing_id),'profile',public.zfind_listing_compliance_profile(p_listing_id),'validation',public.zfind_validate_listing_compliance_facts(p_listing_id),'assessment',public.zfind_assess_listing_compliance(p_listing_id));
  end if;
  return jsonb_build_object('listing_id',v_row.listing_id,'facts',v_row.facts,'source_evidence',v_row.source_evidence,'review_status',v_row.review_status,'review_note',v_row.review_note,'reviewed_at',v_row.reviewed_at,'jurisdiction_iso',public.zfind_listing_jurisdiction(p_listing_id),'profile',public.zfind_listing_compliance_profile(p_listing_id),'validation',public.zfind_validate_listing_compliance_facts(p_listing_id),'assessment',public.zfind_assess_listing_compliance(p_listing_id));
end;
$$;

create or replace function public.zfind_save_listing_compliance(p_listing_id uuid,p_facts jsonb,p_source_evidence jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare v_listing_status text; v_old_facts jsonb; v_exists boolean := false; v_changed boolean := true;
begin
  if not public.zfind_can_manage_listing_compliance(p_listing_id) then raise exception 'Listing compliance access denied' using errcode='42501'; end if;
  if p_facts is null or jsonb_typeof(p_facts)<>'object' then raise exception 'p_facts must be a JSON object' using errcode='22023'; end if;
  if p_source_evidence is null or jsonb_typeof(p_source_evidence)<>'object' then raise exception 'p_source_evidence must be a JSON object' using errcode='22023'; end if;
  select l.status into v_listing_status from public.listings l where l.id=p_listing_id for update;
  if not found then raise exception 'Listing not found' using errcode='P0002'; end if;
  select c.facts into v_old_facts from public.zfind_listing_compliance c where c.listing_id=p_listing_id for update;
  if found then v_exists:=true; v_changed:=v_old_facts is distinct from p_facts; end if;
  if v_listing_status='published' and v_changed then raise exception 'Suspend the Listing before changing approved compliance facts' using errcode='55000'; end if;
  if not v_exists then
    insert into public.zfind_listing_compliance(listing_id,facts,source_evidence,review_status) values(p_listing_id,p_facts,p_source_evidence,'pending');
  else
    update public.zfind_listing_compliance c set facts=p_facts,source_evidence=p_source_evidence,review_status=case when v_changed then 'pending' else c.review_status end,review_note=case when v_changed then null else c.review_note end,reviewed_by=case when v_changed then null else c.reviewed_by end,reviewed_at=case when v_changed then null else c.reviewed_at end where c.listing_id=p_listing_id;
  end if;
  return public.zfind_get_listing_compliance(p_listing_id);
end;
$$;

create or replace function public.zfind_admin_review_listing_compliance(p_listing_id uuid,p_decision text,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare v_actor uuid:=auth.uid(); v_validation jsonb;
begin
  if v_actor is null or not exists(select 1 from public.profiles p where p.id=v_actor and p.role='admin') then raise exception 'Admin role required' using errcode='42501'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'p_decision must be approved or rejected' using errcode='22023'; end if;
  perform 1 from public.zfind_listing_compliance c where c.listing_id=p_listing_id for update;
  if not found then raise exception 'Compliance record not found' using errcode='P0002'; end if;
  v_validation:=public.zfind_validate_listing_compliance_facts(p_listing_id);
  if p_decision='approved' and not coalesce((v_validation ->> 'facts_valid')::boolean,false) then raise exception 'Compliance facts are incomplete: %',v_validation -> 'missing' using errcode='55000'; end if;
  update public.zfind_listing_compliance c set review_status=p_decision,review_note=nullif(btrim(p_note),''),reviewed_by=v_actor,reviewed_at=now() where c.listing_id=p_listing_id;
  return public.zfind_get_listing_compliance(p_listing_id);
end;
$$;

create or replace function public.zfind_public_get_listing_compliance(p_listing_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare v_assessment jsonb; v_facts jsonb; v_reviewed_at timestamptz;
begin
  if not public.zfind_public_listing_visible(p_listing_id) then return null; end if;
  v_assessment:=public.zfind_assess_listing_compliance(p_listing_id);
  if not coalesce((v_assessment ->> 'compliant')::boolean,false) then return null; end if;
  select c.facts,c.reviewed_at into v_facts,v_reviewed_at from public.zfind_listing_compliance c where c.listing_id=p_listing_id;
  return jsonb_build_object('listing_id',p_listing_id,'jurisdiction_iso',v_assessment ->> 'jurisdiction_iso','profile',v_assessment ->> 'profile','facts',v_facts,'verified_at',v_reviewed_at);
end;
$$;

create or replace function public.zfind_public_get_asset_compliance(p_kind text,p_asset_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare v_listing_id uuid;
begin
  if p_kind not in ('property','land','development') then return null; end if;
  if p_kind in ('property','land') then
    select l.id into v_listing_id from public.representations r join public.listings l on l.representation_id=r.id where r.property_id=p_asset_id and r.status='active' and l.status='published' and public.zfind_public_listing_visible(l.id) order by l.created_at desc,l.id desc limit 1;
  else
    select l.id into v_listing_id from public.representations r join public.listings l on l.representation_id=r.id where r.development_id=p_asset_id and r.status='active' and l.status='published' and public.zfind_public_listing_visible(l.id) order by l.created_at desc,l.id desc limit 1;
  end if;
  if v_listing_id is null then return null; end if;
  return public.zfind_public_get_listing_compliance(v_listing_id);
end;
$$;

create or replace function public.zfind_enforce_listing_compliance_before_publish()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare v_jurisdiction text; v_assessment jsonb;
begin
  if new.status<>'published' then return new; end if;
  if tg_op='UPDATE' and old.status is not distinct from new.status then return new; end if;
  select upper(z.country_iso) into v_jurisdiction from public.representations r left join public.properties pr on pr.id=r.property_id left join public.developments d on d.id=r.development_id left join public.zones_lite z on z.id=coalesce(pr.zone_lite_id,d.zone_lite_id) where r.id=new.representation_id limit 1;
  if v_jurisdiction<>'FR' or v_jurisdiction is null then return new; end if;
  if tg_op='INSERT' then raise exception 'France Listings must be created before publication and pass compliance review' using errcode='55000'; end if;
  v_assessment:=public.zfind_assess_listing_compliance(new.id);
  if not coalesce((v_assessment ->> 'compliant')::boolean,false) then raise exception 'France Listing compliance gate failed: %',v_assessment -> 'missing' using errcode='55000'; end if;
  return new;
end;
$$;

create trigger zfind_listing_compliance_before_publish before insert or update of status on public.listings for each row execute function public.zfind_enforce_listing_compliance_before_publish();

revoke all on function public.zfind_listing_compliance_touch_updated_at() from public,anon,authenticated;
revoke all on function public.zfind_jsonb_text_present(jsonb,text) from public,anon,authenticated;
revoke all on function public.zfind_jsonb_nonnegative_number(jsonb,text) from public,anon,authenticated;
revoke all on function public.zfind_jsonb_positive_number(jsonb,text) from public,anon,authenticated;
revoke all on function public.zfind_listing_jurisdiction(uuid) from public,anon,authenticated;
revoke all on function public.zfind_listing_compliance_profile(uuid) from public,anon,authenticated;
revoke all on function public.zfind_validate_listing_compliance_facts(uuid) from public,anon,authenticated;
revoke all on function public.zfind_assess_listing_compliance(uuid) from public,anon,authenticated;
revoke all on function public.zfind_can_manage_listing_compliance(uuid) from public,anon,authenticated;
revoke all on function public.zfind_get_listing_compliance(uuid) from public,anon,authenticated;
revoke all on function public.zfind_save_listing_compliance(uuid,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.zfind_admin_review_listing_compliance(uuid,text,text) from public,anon,authenticated;
revoke all on function public.zfind_public_get_listing_compliance(uuid) from public,anon,authenticated;
revoke all on function public.zfind_public_get_asset_compliance(text,uuid) from public,anon,authenticated;
revoke all on function public.zfind_enforce_listing_compliance_before_publish() from public,anon,authenticated;

grant execute on function public.zfind_get_listing_compliance(uuid) to authenticated;
grant execute on function public.zfind_save_listing_compliance(uuid,jsonb,jsonb) to authenticated;
grant execute on function public.zfind_admin_review_listing_compliance(uuid,text,text) to authenticated;
grant execute on function public.zfind_public_get_listing_compliance(uuid) to anon,authenticated;
grant execute on function public.zfind_public_get_asset_compliance(text,uuid) to anon,authenticated;
