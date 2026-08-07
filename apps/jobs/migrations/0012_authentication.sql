-- 0012_authentication.sql
-- Z Jobs — autenticação real por password + sessões (P0.2 da auditoria
-- técnica: até aqui, auth.users era só um stub para testar SQL, sem
-- login nenhum por trás).
--
-- ATUALIZAÇÃO IMPORTANTE: com a integração real do Supabase Auth
-- (apps/api/src/supabaseAuth.ts), esta migração passou a ser SÓ PARA
-- AMBIENTE LOCAL/CI — nunca corras isto contra um projeto Supabase
-- real. `auth.users` já existe lá, gerida por eles; tentar alterá-la
-- diretamente não é suportado e pode falhar por permissões, ou pior,
-- ter sucesso e modificar uma tabela interna deles de forma não
-- sancionada. Ver local-dev/00_supabase_stub.sql e
-- docs/POSTGRES-INTEGRATION.md para o contexto completo.
--
-- Em produção com Supabase real, `signupWithSupabase`/
-- `loginWithSupabase` tratam disto pela API deles — esta tabela e a
-- coluna password_hash abaixo deixam de ser tocadas pela aplicação.

begin;

alter table auth.users add column if not exists password_hash text;

create table if not exists auth.sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null
);

create index if not exists idx_sessions_user on auth.sessions(user_id);
create index if not exists idx_sessions_expiry on auth.sessions(expires_at);

commit;
