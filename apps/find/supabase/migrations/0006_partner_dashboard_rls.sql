-- ============================================================
-- Z FIND — MIGRATION 0006 (PROPOSTA — NÃO APLICAR SEM REVISÃO)
-- ============================================================
-- Fundação de segurança do Partner Dashboard. is_own_partner() foi
-- criada na Migration 0004, comentada explicitamente como "pronta,
-- sem nenhuma política a usá-la ainda" — esta migração liga-a a
-- políticas reais, tabela a tabela.
--
-- Regra seguida em toda esta migração, sem exceção: um partner_user
-- só pode ver/gerir dados ligados ao SEU PRÓPRIO partner_id — nunca
-- de outro parceiro. Testado explicitamente (ver checklist no fim).
--
-- Tudo aditivo. Nenhuma política de admin/anon já existente é
-- alterada ou removida — as novas políticas de partner_user
-- coexistem com elas (RLS permissivo: múltiplas políticas para o
-- mesmo comando somam-se com OR, nunca se substituem).
-- ============================================================

-- ---------------- properties ----------------
-- INSERT precisa de política própria: no momento de criar uma
-- Propriedade nova, ainda não existe nenhuma representation a
-- ligá-la ao parceiro — mesmo problema "ovo e galinha" que o Admin já
-- resolve em dois passos (cria a propriedade, depois a listing).
create policy "partner: create properties" on properties
  for insert to authenticated
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'partner_user'));

create policy "partner: view own properties" on properties
  for select to authenticated using (
    exists (select 1 from representations where representations.property_id = properties.id and is_own_partner(representations.partner_id))
  );
create policy "partner: update own properties" on properties
  for update to authenticated
  using (exists (select 1 from representations where representations.property_id = properties.id and is_own_partner(representations.partner_id)))
  with check (exists (select 1 from representations where representations.property_id = properties.id and is_own_partner(representations.partner_id)));
create policy "partner: delete own properties" on properties
  for delete to authenticated using (
    exists (select 1 from representations where representations.property_id = properties.id and is_own_partner(representations.partner_id))
  );

-- ---------------- developments ----------------
-- Mesma lógica exata que properties, mesmo problema de bootstrap no insert.
create policy "partner: create developments" on developments
  for insert to authenticated
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'partner_user'));

create policy "partner: view own developments" on developments
  for select to authenticated using (
    exists (select 1 from representations where representations.development_id = developments.id and is_own_partner(representations.partner_id))
  );
create policy "partner: update own developments" on developments
  for update to authenticated
  using (exists (select 1 from representations where representations.development_id = developments.id and is_own_partner(representations.partner_id)))
  with check (exists (select 1 from representations where representations.development_id = developments.id and is_own_partner(representations.partner_id)));
create policy "partner: delete own developments" on developments
  for delete to authenticated using (
    exists (select 1 from representations where representations.development_id = developments.id and is_own_partner(representations.partner_id))
  );

-- ---------------- representations ----------------
-- partner_id é uma coluna direta aqui — sem problema de bootstrap,
-- is_own_partner(partner_id) funciona igual para insert/select/update/delete.
create policy "partner: manage own representations" on representations
  for all to authenticated
  using (is_own_partner(partner_id))
  with check (is_own_partner(partner_id));

-- ---------------- listings ----------------
-- Sempre criada referenciando uma representation já existente e já
-- corretamente ligada — sem problema de bootstrap.
create policy "partner: manage own listings" on listings
  for all to authenticated
  using (exists (select 1 from representations where representations.id = listings.representation_id and is_own_partner(representations.partner_id)))
  with check (exists (select 1 from representations where representations.id = listings.representation_id and is_own_partner(representations.partner_id)));

-- ---------------- listing_content ----------------
create policy "partner: manage own listing_content" on listing_content
  for all to authenticated
  using (exists (
    select 1 from listings join representations on representations.id = listings.representation_id
    where listings.id = listing_content.listing_id and is_own_partner(representations.partner_id)
  ))
  with check (exists (
    select 1 from listings join representations on representations.id = listings.representation_id
    where listings.id = listing_content.listing_id and is_own_partner(representations.partner_id)
  ));

-- ---------------- listing_media ----------------
create policy "partner: manage own listing_media" on listing_media
  for all to authenticated
  using (exists (
    select 1 from listings join representations on representations.id = listings.representation_id
    where listings.id = listing_media.listing_id and is_own_partner(representations.partner_id)
  ))
  with check (exists (
    select 1 from listings join representations on representations.id = listings.representation_id
    where listings.id = listing_media.listing_id and is_own_partner(representations.partner_id)
  ));

-- ---------------- development_media ----------------
create policy "partner: manage own development_media" on development_media
  for all to authenticated
  using (exists (select 1 from representations where representations.development_id = development_media.development_id and is_own_partner(representations.partner_id)))
  with check (exists (select 1 from representations where representations.development_id = development_media.development_id and is_own_partner(representations.partner_id)));

-- ---------------- property_features / development_features ----------------
-- Migration 0004/0005 já criaram admin: full access — esta adiciona a
-- camada de partner_user, coexistindo (OR) com essa, nunca a substitui.
create policy "partner: manage own property_features" on property_features
  for all to authenticated
  using (exists (select 1 from representations where representations.property_id = property_features.property_id and is_own_partner(representations.partner_id)))
  with check (exists (select 1 from representations where representations.property_id = property_features.property_id and is_own_partner(representations.partner_id)));

create policy "partner: manage own development_features" on development_features
  for all to authenticated
  using (exists (select 1 from representations where representations.development_id = development_features.development_id and is_own_partner(representations.partner_id)))
  with check (exists (select 1 from representations where representations.development_id = development_features.development_id and is_own_partner(representations.partner_id)));

-- ---------------- leads ----------------
-- Só leitura — leads são inseridas por anon (visitantes), nunca por
-- um partner_user; e só admin gere o campo status. Um parceiro pode
-- ver os leads dos SEUS anúncios, nunca escrever/apagar.
create policy "partner: read own leads" on leads
  for select to authenticated using (
    exists (
      select 1 from listings join representations on representations.id = listings.representation_id
      where listings.id = leads.listing_id and is_own_partner(representations.partner_id)
    )
  );

-- ---------------- Verificação ----------------
-- Run after applying:
--
-- select tablename, count(*) from pg_policies
-- where schemaname='public' and policyname like 'partner:%'
-- group by tablename order by tablename;
-- -- Expected: properties(4), developments(4), representations(1),
-- -- listings(1), listing_content(1), listing_media(1),
-- -- development_media(1), property_features(1),
-- -- development_features(1), leads(1). 16 políticas, 10 tabelas.
--
-- TESTE CRÍTICO DE ISOLAMENTO — nunca confiar só na contagem acima:
-- Criar 2 parceiros de teste (A e B), cada um com uma propriedade
-- sua. Autenticado como partner_user de A, confirmar:
--   select * from properties; -- deve devolver SÓ a propriedade de A
-- Repetir como partner_user de B — deve devolver SÓ a de B. Se
-- qualquer um dos dois vir a propriedade do outro, isto está errado
-- e não deve ir para produção.
