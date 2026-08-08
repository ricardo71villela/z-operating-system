-- 0016_translations_rls.sql
-- Z Jobs — translations (0001) também nunca teve RLS ativado em lado
-- nenhum — terceiro achado do mesmo tipo nesta sessão (job_offer_reports
-- em 0015 foi o segundo). Leitura fica pública (o conteúdo traduzido
-- acompanha a visibilidade do conteúdo original), escrita fica restrita
-- a quem pode editar a entidade referenciada.

begin;

alter table translations enable row level security;

create policy translations_select_public on translations
  for select using (true);

create policy translations_manage_job_offer_org on translations
  for all using (
    entity_type = 'job_offer' and exists (
      select 1 from job_offers jo where jo.id = translations.entity_id
        and (is_org_member(jo.organization_id, array['owner','admin','recruiter','hiring_manager']::org_role[]) or is_platform_staff())
    )
  )
  with check (
    entity_type = 'job_offer' and exists (
      select 1 from job_offers jo where jo.id = translations.entity_id
        and (is_org_member(jo.organization_id, array['owner','admin','recruiter','hiring_manager']::org_role[]) or is_platform_staff())
    )
  );

-- Qualquer entity_type fora de 'job_offer' (ex: futuras traduções de
-- company_profile) fica restrito a staff até haver uma política própria.
create policy translations_manage_staff_other_entities on translations
  for all using (entity_type <> 'job_offer' and is_platform_staff())
  with check (entity_type <> 'job_offer' and is_platform_staff());

commit;
