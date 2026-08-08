-- 0014_membership_bootstrap_fix.sql
-- Z Jobs — corrige um paradoxo de arranque só descoberto ao ativar RLS a
-- sério (P0.3): a política `memberships_manage_admins` (0007) exige já
-- ser owner/admin da organização para poder inserir uma membership —
-- mas o criador de uma organização nova NUNCA é ainda membro dela no
-- momento exato em que essa primeira membership (dele próprio, como
-- 'owner') teria de ser inserida. Sem esta política adicional, nenhuma
-- organização poderia nunca ter o seu primeiro membro.

begin;

create policy memberships_insert_self_as_org_creator on organization_memberships
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from organizations o
      where o.id = organization_id and o.created_by = auth.uid()
    )
  );

-- Achado adicional ao testar a sério: count(*) sobre organization_memberships
-- está sujeito ao RLS de leitura (memberships_select_own_org), que só deixa
-- ver as PRÓPRIAS memberships a quem ainda não é staff nem membro de
-- nenhuma organização. Sem esta função, qualquer pessoa veria sempre
-- count=0 do seu próprio ponto de vista — permitindo múltiplos "primeiros"
-- bootstraps em vez de só um. SECURITY DEFINER dá-lhe visibilidade real,
-- mas a função em si só devolve um número, nunca dados sensíveis.
create or replace function count_platform_staff()
returns integer
language sql
security definer
stable
as $$
  select count(*)::int from organization_memberships
  where role in ('platform_moderator', 'platform_auditor', 'platform_superadmin');
$$;

commit;
