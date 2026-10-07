-- ============================================================
-- LOJAS FRANÇA (Z Fashion) — ingestão pela API REST do Supabase
--
-- A ingestão semanal das lojas (90-platform-engineering/lojas-franca-ingest)
-- passa a escrever pela API REST com a chave do servidor (service_role),
-- como a ingestão das agências do Z Find, em vez de uma ligação Postgres
-- direta (SUPABASE_DB_URL), que nunca funcionou: a tabela continua vazia.
--
-- A tabela public.lojas não dava ao service_role SELECT / INSERT / UPDATE.
-- RLS continua ativo e sem políticas: anon e authenticated não leem nada.
-- ============================================================

grant select, insert, update on table public.lojas to service_role;
