-- local-dev/00_supabase_stub.sql
--
-- Stub mínimo do esquema auth do Supabase, para desenvolvimento local
-- e CI — permite validar a estrutura das migrations reais contra um
-- Postgres genuíno, sem precisar de um projeto Supabase real. NÃO é
-- uma réplica do Supabase Auth, nem deve ser usado em produção.
--
-- CONTEXTO IMPORTANTE: com a integração real do Supabase Auth
-- (apps/api/src/supabaseAuth.ts), este stub deixou de ser necessário
-- para autenticação em si — a aplicação já não escreve em auth.users
-- quando SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_JWT_SECRET estão
-- definidas (ver PgStore.bootstrapPersonRecord). Continua necessário
-- só para o CAMINHO LOCAL de reserva (sem essas variáveis), usado em
-- desenvolvimento e nos testes automáticos deste repositório.
--
-- Corre isto ANTES das migrations reais, só em ambiente local/CI —
-- nunca contra um projeto Supabase real, onde auth.users já existe.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
