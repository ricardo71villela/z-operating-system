-- ============================================================
-- LOJAS FRANÇA (Z Fashion) — ingestão pela API REST do Supabase
--
-- A ingestão semanal das lojas (90-platform-engineering/lojas-franca-ingest)
-- passa a escrever pela API REST com a chave do servidor (service_role),
-- como a ingestão das agências do Z Find, em vez de uma ligação Postgres
-- direta (SUPABASE_DB_URL), que nunca funcionou: a tabela continua vazia.
--
-- 1. public.lojas foi criada à mão no Supabase, sem migração: fica aqui
--    descrita tal como existe (create if not exists — não muda nada onde
--    já existe), para que a sequência de migrações a reproduza.
-- 2. A tabela não dava ao service_role SELECT / INSERT / UPDATE.
--    RLS continua ativo e sem políticas: anon e authenticated não leem nada.
-- ============================================================

-- ------------------------------------------------------------ 1. tabela
create table if not exists public.lojas (
  id uuid primary key default gen_random_uuid(),
  siret text unique,
  siren text,
  nome text not null,
  nome_comercial text,
  codigo_naf text,
  setor text,
  morada text,
  codigo_postal text,
  cidade text,
  latitude double precision,
  longitude double precision,
  telefone text,
  email text,
  website text,
  ativo boolean default true,
  fonte_enriquecimento text,
  data_criacao_empresa date,
  data_ingestao timestamptz default now(),
  data_ultima_atualizacao timestamptz default now(),
  contactado boolean default false,
  data_contacto timestamptz,
  estado_outreach text default 'novo',
  followups_enviados integer default 0
);

alter table public.lojas enable row level security;

-- ------------------------------------------------------------ 2. acesso do servidor
grant select, insert, update on table public.lojas to service_role;
