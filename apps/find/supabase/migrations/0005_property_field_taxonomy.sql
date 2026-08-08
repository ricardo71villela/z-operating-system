-- ============================================================
-- Z FIND — MIGRATION 0005 (PROPOSTA — NÃO APLICAR SEM REVISÃO)
-- ============================================================
-- Implementa a taxonomia completa de campos de
-- docs/architecture/PROPERTY-FIELD-TAXONOMY.md — compilada a partir
-- de: RESO Data Dictionary (standard internacional), Decreto-Lei
-- 101-D/2020 (Certificado Energético, obrigatório em Portugal),
-- Código do IMI (Área Bruta Privativa vs. Dependente), e a ficha real
-- de imóvel da Z Imobiliária já inspecionada.
--
-- Tudo aditivo. Nenhuma coluna existente alterada ou removida.
-- Populate features (0004 criou a tabela, nunca a populou).
-- ============================================================

-- ---------------- 1. Obrigatório por lei (Portugal) ----------------
alter table properties add column energy_rating text check (energy_rating in ('A+','A','B','B-','C','D','E','F'));
alter table properties add column energy_certificate_number text;
alter table properties add column license_number text; -- referência, não requisito de anúncio — ver taxonomia, secção 1

-- ---------------- 2. Localização exata ----------------
alter table properties add column street_address text;
alter table properties add column latitude numeric;
alter table properties add column longitude numeric;
alter table properties add column postal_code text;

-- ---------------- 3. Core universais (residencial) ----------------
alter table properties add column bedrooms int;
alter table properties add column living_rooms int default 1;
alter table properties add column bathrooms int; -- número único — ver correção na taxonomia, não dividido em full/half
alter table properties add column gross_private_area_sqm numeric; -- ABP
alter table properties add column dependent_area_sqm numeric;     -- ABD — onde garagem/arrumos tecnicamente vivem
alter table properties add column plot_area_sqm numeric;
alter table properties add column year_built int;
alter table properties add column condition text check (condition in ('new','used','needs_renovation','renovated'));
alter table properties add column unit_floors int default 1; -- duplex=2, triplex=3 — distinto de `floor` (em que piso está)

-- ---------------- 4. Financeiro factual — só declarado ----------------
alter table properties add column condo_fee_monthly numeric;
alter table properties add column imi_annual numeric;
alter table properties add column taxable_value numeric;
alter table properties add column payment_terms text;
alter table properties add column accepts_trade boolean not null default false;

-- ---------------- 5. Referências externas ----------------
alter table properties add column agency_reference text;
alter table properties add column external_ids jsonb not null default '{}'::jsonb;

-- ---------------- 6. Multimédia adicional ----------------
alter table properties add column tour_360_url text; -- link externo (Matterport/Kuula), não upload
alter table listing_media add column category text not null default 'photo' check (category in ('photo','floor_plan','rendering'));
alter table development_media add column category text not null default 'photo' check (category in ('photo','floor_plan','rendering'));

-- ---------------- 7. Empreendimentos ----------------
alter table developments add column footprint_area_sqm numeric;
alter table developments add column building_floors int;
alter table developments add column total_units int;
alter table developments add column expected_completion date;
alter table developments add column project_phase text check (project_phase in ('planning','construction','completed'));
alter table developments add column developer_name text;

-- development_features: a Migration 0004 criou property_features mas
-- nunca o equivalente para Empreendimentos — encontrado ao verificar
-- explicitamente "ambos os casos" (propriedade e empreendimento) para
-- carregamento elétrico. Espelha property_features exatamente, mesma
-- tabela features partilhada entre os dois.
create table development_features (
  development_id uuid not null references developments(id),
  feature_id uuid not null references features(id),
  primary key (development_id, feature_id)
);
alter table development_features enable row level security;

create policy "public read development_features for published developments"
  on development_features for select to anon
  using (
    exists (
      select 1 from representations
      join listings on listings.representation_id = representations.id
      where representations.target_type = 'development'
      and representations.development_id = development_features.development_id
      and listings.status = 'published'
    )
  );
create policy "admin: full access to development_features" on development_features
  for all to authenticated using (is_admin()) with check (is_admin());

grant select on development_features to anon;
grant select, insert, update, delete on development_features to authenticated;

-- ---------------- 8. Histórico de preços — tabela nova, não coluna ----------------
-- Série ao longo do tempo, nunca um valor único a substituir.
create table price_history (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id),
  price numeric not null,
  currency_iso text not null,
  recorded_at timestamptz not null default now()
);
alter table price_history enable row level security;

-- Mesmo padrão de listing_content: leitura pública só para listings
-- publicadas, escrita só admin.
create policy "public read price_history for published listings"
  on price_history for select to anon
  using (
    exists (
      select 1 from listings
      where listings.id = price_history.listing_id
      and listings.status = 'published'
    )
  );
create policy "admin: full access to price_history" on price_history
  for all to authenticated using (is_admin()) with check (is_admin());

grant select on price_history to anon;
grant select, insert, update, delete on price_history to authenticated;

-- ---------------- 8.5. Tipos de Parceiro — mesma correção já aplicada ao subtype ----------------
-- partners.role tem hoje um CHECK fechado ('agency','promoter') — o
-- mesmo anti-padrão já identificado para subtype. Prova concreta:
-- PRODUCT-AUDIT-V1.md já lista "Fornecedores de CRM" como prioridade
-- nº3 de clientes, mas o schema não conseguia representar isso.
create table partner_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null
);
alter table partner_types enable row level security;

create policy "public read partner_types" on partner_types
  for select to anon using (true); -- referência não sensível, como zones_lite
create policy "admin: full access to partner_types" on partner_types
  for all to authenticated using (is_admin()) with check (is_admin());

grant select on partner_types to anon;
grant select, insert, update, delete on partner_types to authenticated;

insert into partner_types (code, label) values
  ('agency', 'Agência'),
  ('promoter', 'Promotor'),
  ('private_individual', 'Particular'),
  ('crm_provider', 'Fornecedor de CRM'),
  ('fund', 'Fundo'),
  ('asset_manager', 'Asset Manager'),
  ('bank', 'Banco'),
  ('independent_consultant', 'Consultor Independente')
on conflict (code) do nothing;

-- Transição segura: nova coluna, preenchida a partir do role
-- existente. NÃO remove `role` — o Admin já construído lê/escreve
-- esse campo diretamente; mudar isso é trabalho de UI para depois,
-- não uma decisão de schema a forçar nesta migração.
alter table partners add column partner_type_id uuid references partner_types(id);
update partners set partner_type_id = (select id from partner_types where code = partners.role);

-- ---------------- 9. Popular a tabela features (criada na 0004, nunca populada) ----------------
insert into features (code, label) values
  ('elevator', 'Elevador'),
  ('pool', 'Piscina'),
  ('balcony', 'Varanda'),
  ('terrace', 'Terraço'),
  ('garden', 'Jardim'),
  ('garage_box', 'Garagem Box'),
  ('garage_covered', 'Lugar de Garagem Coberto'),
  ('garage_uncovered', 'Lugar de Garagem Descoberto'),
  ('bike_spot', 'Lugar para Bicicleta'),
  ('storage_room', 'Arrumos / Arrecadação'),
  ('pantry', 'Despensa'),
  ('sun_east', 'Orientação Nascente'),
  ('sun_west', 'Orientação Poente'),
  ('sun_north', 'Orientação Norte'),
  ('sun_south', 'Orientação Sul'),
  ('air_conditioning', 'Ar Condicionado'),
  ('central_heating', 'Aquecimento Central'),
  ('solar_panels', 'Painéis Solares'),
  ('accessibility', 'Acesso para Mobilidade Reduzida'),
  ('furnished', 'Mobilado'),
  ('fitted_kitchen', 'Cozinha Equipada'),
  ('office', 'Escritório / Gabinete'),
  ('laundry', 'Lavandaria'),
  ('entrance_hall', 'Hall de Entrada'),
  ('closet', 'Closet / Roupeiro'),
  ('fireplace', 'Lareira'),
  ('home_automation', 'Domótica'),
  ('electric_shutters', 'Estores Elétricos'),
  ('double_glazing', 'Vidros Duplos'),
  ('thermal_insulation', 'Isolamento Térmico'),
  ('acoustic_insulation', 'Isolamento Acústico'),
  ('security_system', 'Sistema de Segurança'),
  ('fiber_internet', 'Internet Fibra'),
  ('barbecue', 'Churrasqueira'),
  ('ev_charging', 'Carregamento Elétrico'),
  ('ev_charging_ready', 'Pré-instalação para Carregador VE')
on conflict (code) do nothing;

-- ---------------- Verificação ----------------
-- Run after applying:
--
-- select count(*) from information_schema.columns
-- where table_schema='public' and table_name='properties'
-- and column_name in ('energy_rating','street_address','bedrooms','bathrooms','gross_private_area_sqm','dependent_area_sqm');
-- -- Expected: 6.
--
-- select count(*) from features;
-- -- Expected: 36.
--
-- select tablename, policyname from pg_policies where tablename in ('price_history', 'development_features', 'partner_types');
-- -- Expected: 6 rows total (2 per table: public read + admin full access) — mesmo cuidado
-- -- que apanhou o bug de RLS na 0004: confirmar SEMPRE que existem
-- -- políticas reais, não só a tabela criada.
--
-- select code, label from partner_types order by code;
-- -- Expected: 8 rows.
--
-- select count(*) from partners where partner_type_id is null;
-- -- Expected: 0 — confirma que o backfill a partir de role funcionou
-- -- para todos os parceiros já existentes.
