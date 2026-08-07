-- 0013_app_role.sql
-- Z Jobs — papel de aplicação sem privilégios de superutilizador.
--
-- Achado crítico ao ativar RLS a sério: Postgres NUNCA aplica row-level
-- security a superutilizadores nem ao dono das tabelas, independentemente
-- de quantas políticas existirem. Até este ponto, a API ligava-se sempre
-- como 'postgres' (superutilizador, dono de todas as tabelas via
-- migrations) — por isso as políticas RLS, mesmo bem desenhadas e agora
-- corretamente ligadas a auth.uid(), nunca teriam bloqueado nada na
-- prática. Este papel é o que resolve isso: tem permissões via GRANT, não
-- é dono de nada, logo o RLS aplica-se-lhe a sério.
--
-- Password definida aqui é só para desenvolvimento local (ambiente
-- efémero desta sessão). Produção usaria um segredo gerido fora do
-- controlo de versões.

begin;

do $$ begin
  create role zjobs_app login password 'zjobs_app_dev_pw';
exception when duplicate_object then null; end $$;

grant usage on schema public to zjobs_app;
grant usage on schema auth to zjobs_app;

grant select, insert, update, delete on all tables in schema public to zjobs_app;
grant select, insert, update on auth.users to zjobs_app;
grant select, insert, delete on auth.sessions to zjobs_app;

alter default privileges in schema public
  grant select, insert, update, delete on tables to zjobs_app;

commit;
