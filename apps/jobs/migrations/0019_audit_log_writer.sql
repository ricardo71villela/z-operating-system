-- 0019_audit_log_writer.sql
-- Z Jobs — o comentário original em 0007_rls_policies.sql já dizia:
-- "Inserts de audit_logs feitos apenas via funções security definer /
-- triggers, nunca diretamente pelo cliente" — mas essa função nunca
-- chegou a ser escrita, e não havia NENHUMA política de insert para
-- audit_logs. Resultado: com RLS a sério, nenhum registo de auditoria
-- conseguia ser escrito. Esta função implementa o que o comentário já
-- previa.

begin;

create or replace function record_audit_log(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_action text
)
returns table(id uuid, created_at timestamptz)
language sql
security definer
as $$
  insert into audit_logs (actor_user_id, organization_id, entity_type, entity_id, action)
  values (p_actor_user_id, p_organization_id, p_entity_type, p_entity_id, p_action)
  returning audit_logs.id, audit_logs.created_at;
$$;

commit;
