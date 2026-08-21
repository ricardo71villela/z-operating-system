-- Z Mobility database convergence v1
-- Runs only against a disposable database after the complete integrated
-- migration chain. No live mutation.

begin;

-- Structural authority.
do $$
begin
  if to_regnamespace('mobility') is null then
    raise exception 'missing mobility schema';
  end if;
  if to_regclass('public.automotive_manufacturers') is null then
    raise exception 'missing automotive_manufacturers';
  end if;
  if to_regclass('public.automotive_variants') is null then
    raise exception 'missing automotive_variants';
  end if;
  if to_regclass('public.automotive_versions') is null then
    raise exception 'missing automotive_versions compatibility view';
  end if;
  if to_regclass('public.automotive_observations') is null then
    raise exception 'missing automotive_observations';
  end if;
  if to_regclass('public.automotive_resolved_profiles') is null then
    raise exception 'missing automotive_resolved_profiles';
  end if;
  if to_regclass('public.vehicles') is null then
    raise exception 'missing vehicles';
  end if;
end $$;

-- Seed authority.
do $$
declare
  source_count integer;
begin
  select count(*) into source_count
  from public.automotive_data_sources
  where code in (
    'z_mobility_curated','bmw_pressclub','audi_media','mercedes_media',
    'porsche_newsroom','nhtsa_vpic','volkswagen_media','skoda_storyboard',
    'seat_media_center','cupra_media','bentley_media','lamborghini_media'
  );
  if source_count <> 12 then
    raise exception 'expected 12 Mobility source seeds, got %', source_count;
  end if;
end $$;

-- Insert a complete local automotive identity chain and prove that every
-- local identity receives a local_only ZOS Registry binding while the
-- physical variant row is exposed canonically as Version.
do $$
declare
  manufacturer_id uuid := gen_random_uuid();
  brand_id uuid := gen_random_uuid();
  model_id uuid := gen_random_uuid();
  generation_id uuid := gen_random_uuid();
  version_id uuid := gen_random_uuid();
  vehicle_id uuid := gen_random_uuid();
  binding_count integer;
  version_view_count integer;
begin
  insert into public.automotive_manufacturers(id, name, slug)
  values (manufacturer_id, 'ZOS CI Manufacturer', 'zos-ci-manufacturer');

  insert into public.automotive_brands(id, manufacturer_id, name, slug)
  values (brand_id, manufacturer_id, 'ZOS CI Brand', 'zos-ci-brand');

  insert into public.automotive_models(id, brand_id, name, slug)
  values (model_id, brand_id, 'ZOS CI Model', 'zos-ci-model');

  insert into public.automotive_generations(id, model_id, name, slug)
  values (generation_id, model_id, 'ZOS CI Generation', 'zos-ci-generation');

  insert into public.automotive_variants(id, generation_id, name, slug, market_code)
  values (version_id, generation_id, 'ZOS CI Version', 'zos-ci-version', 'EU');

  insert into public.vehicles(
    id, slug, brand, model, variant, year, mileage,
    fuel, transmission, country, price, currency, status, version_id
  ) values (
    vehicle_id, 'zos-ci-vehicle', 'ZOS CI Brand', 'ZOS CI Model',
    'ZOS CI Version', 2026, 0, 'Electric', 'Automatic', 'PT',
    50000, 'EUR', 'draft', version_id
  );

  select count(*) into binding_count
  from zos.registry_bindings
  where domain_code = 'mobility'
    and binding_status = 'local_only'
    and (local_entity_type, local_entity_id) in (
      ('manufacturer', manufacturer_id::text),
      ('brand', brand_id::text),
      ('model', model_id::text),
      ('generation', generation_id::text),
      ('version', version_id::text),
      ('vehicle', vehicle_id::text)
    );

  if binding_count <> 6 then
    raise exception 'expected 6 Mobility registry bindings, got %', binding_count;
  end if;

  select count(*) into version_view_count
  from public.automotive_versions
  where id = version_id
    and name = 'ZOS CI Version';

  if version_view_count <> 1 then
    raise exception 'automotive_versions did not preserve Version identity';
  end if;
end $$;

-- The cross-RLS helper is trigger-only; browser/service roles do not receive
-- direct EXECUTE privilege.
do $$
begin
  if has_function_privilege('anon', 'mobility.ensure_registry_binding()', 'EXECUTE') then
    raise exception 'anon must not execute mobility.ensure_registry_binding directly';
  end if;
  if has_function_privilege('authenticated', 'mobility.ensure_registry_binding()', 'EXECUTE') then
    raise exception 'authenticated must not execute mobility.ensure_registry_binding directly';
  end if;
  if has_function_privilege('service_role', 'mobility.ensure_registry_binding()', 'EXECUTE') then
    raise exception 'service_role must not execute mobility.ensure_registry_binding directly';
  end if;
end $$;

-- Prove that direct function EXECUTE is not required for an authenticated
-- insert trigger to create the Core binding. The temporary grant is rolled
-- back with this transaction and is test-only.
grant usage on schema public to authenticated;
grant insert on public.automotive_manufacturers to authenticated;

set local role authenticated;
insert into public.automotive_manufacturers(id, name, slug)
values ('11111111-1111-4111-8111-111111111111', 'Authenticated Trigger Test', 'authenticated-trigger-test');
reset role;

do $$
declare
  n integer;
begin
  select count(*) into n
  from zos.registry_bindings
  where domain_code = 'mobility'
    and local_entity_type = 'manufacturer'
    and local_entity_id = '11111111-1111-4111-8111-111111111111'
    and binding_status = 'local_only';
  if n <> 1 then
    raise exception 'authenticated insert did not create trigger-owned Registry binding';
  end if;
end $$;

-- Existing public marketplace read tables retain RLS.
do $$
declare
  vehicles_rls boolean;
  images_rls boolean;
begin
  select relrowsecurity into vehicles_rls from pg_class where oid = 'public.vehicles'::regclass;
  select relrowsecurity into images_rls from pg_class where oid = 'public.vehicle_images'::regclass;
  if vehicles_rls is not true then
    raise exception 'vehicles RLS must be enabled';
  end if;
  if images_rls is not true then
    raise exception 'vehicle_images RLS must be enabled';
  end if;
end $$;

rollback;

select 'Z_MOBILITY_DATABASE_CONVERGENCE_V1=PASS';
