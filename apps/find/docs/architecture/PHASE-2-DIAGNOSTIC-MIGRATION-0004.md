# Z Find — Diagnóstico Consolidado da Fase 2
## Migration 0004 (revista, corrigida, ficheiro real criado — aguarda aplicação)

**Estado:** Documento técnico. O SQL abaixo corresponde exatamente a `supabase/migrations/0004_partner_monetization_extensibility.sql`, já criado no repositório. Não foi ainda aplicado a nenhuma base de dados real.

**Correção feita nesta revisão, antes de considerar isto pronto:** o rascunho original ativava RLS em `features`/`property_features` mas nunca criava nenhuma política de leitura — em Postgres, isso torna a tabela inacessível a toda a gente, mesmo com `GRANT`. Corrigido, espelhando exatamente o padrão já usado em `zones_lite` (referência pública) e `properties` (só via listing publicada).

---

## 0. Porquê este documento existe

Combinado explicitamente: em vez de ir escrevendo `0004`, `0005`, `0006` à medida que cada necessidade aparece, este documento junta **tudo o que já sabemos que vai precisar de schema novo**, numa proposta só, revista antes de ser aplicada. Cinco fontes reais, não hipotéticas:

1. `docs/architecture/Z-FIND-IMPLEMENTATION-STATUS-2026-07.md` — a fronteira Registry/Data por corrigir.
2. Migration 0002 já antecipa `profiles.role='partner_user'`, nunca implementado — o Portal do Parceiro precisa disto.
3. `PRODUCT-AUDIT-V1.md` — camada de monetização, deteção de duplicados.
4. Z Living/Renting — ainda sem nenhuma modelação, mesmo preliminar.
5. **Encontrado agora, ao tentar construir o "pedido de avaliação"**: `leads.listing_id` é `not null references listings(id)` — um pedido de quem quer VENDER/ARRENDAR não tem listing nenhum para referenciar. Bloqueio real, descoberto ao codificar, não especulado.

---

## 1. Fronteira Registry/Data

**Problema:** `properties.typology`, `properties.area_sqm`, `properties.floor` estão diretamente na tabela de Registry, quando `20-registry/ENTITY-ASSET-MODEL.md` (já estabelecido, `z-operating-system`) define que atributos medidos/afirmados pertencem a `60-data`, não ao Registry.

**Proposta:** Não mover estas colunas agora (risco desnecessário para dados que já funcionam) — mas **parar de crescer o problema**: qualquer atributo NOVO (a partir de agora) vai para uma tabela de atributos extensível, nunca uma coluna nova em `properties`. Ver secção 5.

---

## 2. O que o Portal do Parceiro vai precisar (schema, não a implementação)

Não vou construir o Portal agora — só o schema que ele vai exigir, para não o bloquear depois:

- **RLS para `partner_user`**: hoje só existe `is_admin()`. Precisa de uma função equivalente `is_own_partner(partner_id)` — verifica que `profiles.partner_id` do utilizador autenticado corresponde ao registo que está a tentar ler/escrever.
- **Scoping em cada tabela relevante**: `representations`, `listings`, `listing_content`, `listing_media` — um parceiro só pode gerir os seus próprios registos, nunca os de outro parceiro. Hoje só `admin` tem qualquer acesso `authenticated`.
- **Vista de desempenho**: precisa de uma forma barata de contar leads por parceiro — `leads` já tem `listing_id`, que já liga a `representations.partner_id` via `listings.representation_id`. Não precisa de coluna nova, só de política de leitura correta.

---

## 3. Camada de Monetização (schema mínimo, não o produto)

- `listings.tier` (novo, nullable, `'standard'` por omissão) — para destaque pago, sem redesenhar `channel` (que já significa outra coisa: standard/offmarket).
- Sem tabela de faturação/subscrição agora — isso é produto, não schema urgente. Fica fora desta migração.

---

## 4. Z Living/Renting — primeira modelação, não implementação

**Princípio:** reutilizar `representations`/`listings` tal como estão — um arrendamento é outra `listing`, não outra árvore de tabelas. O que falta é o que já é genuinamente diferente entre venda e arrendamento:

- `listings.rental_period` (novo, nullable — `null` para venda, `'monthly'`/`'seasonal'`/`'yearly'` para arrendamento). Um único campo, extensível.
- **Não** modelar contratos, cauções, renovação agora — isso é o produto Z Living em si, prematuro sem cliente real desse produto ainda (mesma disciplina já aplicada ao resto).

---

## 5. Extensibilidade de atributos — sem repetir o erro do `subtype`

Consistente com a secção 1 (não crescer o problema Registry/Data):

- `property_features` (novo) + `features` (novo, tabela de referência) — para atributos comparáveis/filtráveis (piscina, elevador, carregador elétrico) como discutido e já concordado — nunca JSONB para isto.
- `properties.attributes jsonb` (novo, só para o que é genuinamente de cauda longa, nunca filtrável) — mantém-se como decidido anteriormente.

---

## 6. O bloqueio real: pedidos de avaliação (venda/arrendamento)

**Problema exato, encontrado ao codificar:** `leads.listing_id not null` impede qualquer lead sem uma listing associada. Um "pedido de avaliação" é, por definição, alguém sem listing nenhuma.

**Proposta:** nova tabela `seller_leads` (não reutilizar `leads` — semânticas diferentes, `status`/`contact_type` de `leads` não fazem sentido aqui):
```
seller_leads (
  id uuid primary key default gen_random_uuid(),
  intent text not null check (intent in ('sell', 'rent')),
  name text not null,
  email text,
  phone text,
  zone_lite_id uuid references zones_lite(id),  -- opcional, onde é o imóvel
  message text,
  status text not null check (status in ('new','contacted','closed')) default 'new',
  created_at timestamptz not null default now()
)
```
Mesmo padrão de grants já estabelecido: `anon` só `insert`, `authenticated`+`is_admin()` só `select` — idêntico ao que já existe para `leads`.

---

## 7. Deteção de Duplicados — schema mínimo

Não construir o motor agora (é produto, precisa de desenho próprio). Mas o schema para o suportar depois, sem migração extra:
- `properties.dedup_hash` (novo, nullable, indexado) — um hash calculado (endereço + área + tipologia) para acelerar a deteção futura, sem decidir agora o algoritmo exato.

---

## 8. Migration 0004 — Proposta Completa

```sql
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
```

---

## 9. O que fica deliberadamente fora desta migração

- Políticas RLS completas de `partner_user` por tabela — só a função fica pronta; as políticas entram quando o Portal for construído a sério.
- Tabela de faturação/subscrição.
- Modelo de contratos de arrendamento.
- Algoritmo de deteção de duplicados em si.

## 10. Recomendação

Rever esta proposta com calma — não é urgente aplicá-la já. Só depois de aprovada é que sugiro juntá-la à Migration 0002/0003 pendentes, para aplicares tudo de uma vez no Supabase real, como combinado.
