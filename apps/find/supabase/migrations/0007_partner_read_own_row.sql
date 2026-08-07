-- ============================================================
-- Z FIND — MIGRATION 0007 (PROPOSTA — NÃO APLICAR SEM REVISÃO)
-- ============================================================
-- Encontrado ao construir o esqueleto do Partner Dashboard: não
-- existia nenhuma política que deixasse um partner_user ler o seu
-- PRÓPRIO registo em `partners` — só existia a política pública
-- (anon), condicionada a ter pelo menos uma listing publicada. Um
-- parceiro novo, sem nada publicado ainda, ficaria sem forma de ver
-- o seu próprio nome/logo ao entrar. Migration 0006 cobriu 10
-- tabelas; esta é a 11ª, encontrada só ao ligar a UI a sério.
-- ============================================================

create policy "partner: read own partner row" on partners
  for select to authenticated using (is_own_partner(id));

-- Nota deliberada: sem política de UPDATE aqui — editar o próprio
-- perfil (nome, logo) é funcionalidade futura, não parte deste
-- esqueleto de login. Fica para quando essa UI for construída.

-- ---------------- Verificação ----------------
-- select policyname from pg_policies where tablename = 'partners' and policyname like 'partner:%';
-- -- Expected: 1 row.
