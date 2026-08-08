-- ============================================================
-- Z FIND — MIGRATION 0004 (PROPOSTA — NÃO APLICAR SEM REVISÃO)
-- ============================================================
-- Consolida: Portal do Parceiro (schema), monetização (schema),
-- Z Living (primeiro campo), extensibilidade de atributos,
-- pedidos de avaliação (seller_leads), preparação para dedup.
-- Tudo aditivo. Nenhuma coluna existente alterada ou removida.
-- ============================================================

-- ---------------- Portal do Parceiro: RLS scoping ----------------
create or replace function public.is_own_partner(target_partner_id uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and partner_id = target_partner_id and role = 'partner_user'
  );
$$;

-- (políticas de partner_user por tabela ficam para quando o Portal
-- for efetivamente construído — a função fica pronta, sem ainda
-- conceder nenhum GRANT/POLICY não usado)

-- ---------------- Monetização ----------------
alter table listings add column tier text not null default 'standard' check (tier in ('standard', 'featured'));

-- ---------------- Z Living ----------------
alter table listings add column rental_period text check (rental_period in ('monthly', 'seasonal', 'yearly'));

-- ---------------- Extensibilidade de atributos ----------------
create table features (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null
);
alter table features enable row level security;

create table property_features (
  property_id uuid not null references properties(id),
  feature_id uuid not null references features(id),
  primary key (property_id, feature_id)
);
alter table property_features enable row level security;

alter table properties add column attributes jsonb not null default '{}'::jsonb;

-- CORREÇÃO (encontrada na revisão final, antes de aplicar): ativar
-- RLS sem nenhuma política torna a tabela inacessível a toda a gente,
-- mesmo com GRANT — o rascunho original tinha os GRANTs mas nenhuma
-- policy. Corrigido aqui, espelhando exatamente o padrão já
-- estabelecido em zones_lite (referência não sensível, leitura
-- pública total) e properties (só visível via listing publicada).
create policy "public read features" on features
  for select to anon using (true); -- referência não sensível, como zones_lite

create policy "public read property_features for published properties"
  on property_features for select to anon
  using (
    exists (
      select 1 from representations
      join listings on listings.representation_id = representations.id
      where representations.target_type = 'property'
      and representations.property_id = property_features.property_id
      and listings.status = 'published'
    )
  );

create policy "admin: full access to features" on features
  for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin: full access to property_features" on property_features
  for all to authenticated using (is_admin()) with check (is_admin());

-- ---------------- Pedidos de avaliação (venda/arrendamento) ----------------
create table seller_leads (
  id uuid primary key default gen_random_uuid(),
  intent text not null check (intent in ('sell', 'rent')),
  name text not null,
  email text,
  phone text,
  zone_lite_id uuid references zones_lite(id),
  message text,
  status text not null check (status in ('new','contacted','closed')) default 'new',
  created_at timestamptz not null default now()
);
alter table seller_leads enable row level security;

create policy "anon: insert seller_leads" on seller_leads
  for insert to anon with check (true);
create policy "admin: read seller_leads" on seller_leads
  for select to authenticated using (is_admin());

grant insert on seller_leads to anon;
grant select on seller_leads to authenticated;
grant select on features, property_features to anon;
grant select, insert, update, delete on features, property_features to authenticated;

-- ---------------- Preparação para deteção de duplicados ----------------
alter table properties add column dedup_hash text;
create index idx_properties_dedup_hash on properties (dedup_hash) where dedup_hash is not null;


-- ---------------- Verificação ----------------
-- Run after applying:
--
-- select table_name, column_name from information_schema.columns
-- where table_schema = 'public' and table_name in ('listings','properties')
-- and column_name in ('tier','rental_period','attributes','dedup_hash')
-- order by table_name, column_name;
-- -- Expected: 4 rows.
--
-- select tablename, policyname, roles, cmd from pg_policies
-- where schemaname = 'public' and tablename in ('features','property_features','seller_leads')
-- order by tablename, policyname;
-- -- Expected: features (2 policies: public read + admin full),
-- -- property_features (2 policies: public read + admin full),
-- -- seller_leads (2 policies: anon insert + admin read).
--
-- select proname from pg_proc where proname in ('is_own_partner');
-- -- Expected: 1 row (function exists, ready for when the Partner
-- -- Portal is actually built — no policies use it yet, by design).
