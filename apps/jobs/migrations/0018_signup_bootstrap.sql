-- 0018_signup_bootstrap.sql
-- Z Jobs — paradoxo de registo só visível com RLS a sério (P0.3): criar a
-- própria pessoa (persons) durante o signup acontece ANTES de existir
-- qualquer sessão — auth.uid() é null nesse preciso instante, e
-- persons_insert_own (0007) exige user_id = auth.uid(). Não há como
-- "provar" de forma segura, de dentro de uma política RLS, que um
-- pedido anónimo está de facto a registar-se a si próprio.
--
-- Isto é exatamente o problema que o Supabase Auth resolve com um
-- trigger privilegiado em auth.users. Aqui replica-se com uma função
-- SECURITY DEFINER estreita: só cria UMA linha em persons, para o
-- user_id indicado, nunca mais do que isso — não é uma porta aberta
-- genérica, é o equivalente ao trigger de registo.

begin;

create or replace function bootstrap_person(p_user_id uuid, p_full_name text)
returns void
language sql
security definer
as $$
  insert into persons (user_id, full_name) values (p_user_id, p_full_name);
$$;

commit;
