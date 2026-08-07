-- 0025_candidate_detail_visibility.sql
-- Z Jobs — corrige uma lacuna de RLS séria, encontrada ao testar a
-- pontuação de candidatos a sério: só `candidate_profiles` (título e
-- resumo) alguma vez respeitou os níveis de visibilidade
-- ('public' / 'visible_to_verified_employers'). As tabelas de detalhe
-- (`candidate_skills`, `candidate_education`, `candidate_languages`,
-- `candidate_documents`) nunca tiveram nenhuma política de visibilidade
-- além do dono — e `candidate_experiences` tinha uma política
-- incompleta, que verificava `visibility = 'public'` mas nunca
-- `'visible_to_verified_employers'`, e nunca confirmava que quem via
-- era de facto um empregador verificado.
--
-- Na prática, isto significava que a promessa central de "perfil
-- visível a empregadores verificados" nunca funcionou para nada além do
-- título e resumo — um empregador via um perfil praticamente vazio,
-- mesmo quando o candidato tinha competências e experiência registadas.
-- Só apareceu porque testei a pontuação de candidato a sério contra
-- Postgres real com um utilizador diferente do dono dos dados — a
-- mesma categoria de achado que job_offer_reports (0015) e
-- application_status_history (0017) nesta sessão.

begin;

-- ---------- candidate_experiences: adiciona o nível em falta ----------
create policy experiences_visible_to_verified_employers on candidate_experiences
  for select using (
    exists (
      select 1 from candidate_profiles p
      where p.user_id = candidate_experiences.user_id
        and p.visibility = 'visible_to_verified_employers'
        and exists (
          select 1 from organization_memberships m
          where m.user_id = auth.uid() and is_verified_employer(m.organization_id)
        )
    )
  );

-- ---------- candidate_education: não tinha NENHUM nível além do dono ----------
create policy education_visible_public on candidate_education
  for select using (
    exists (select 1 from candidate_profiles p where p.user_id = candidate_education.user_id and p.visibility = 'public')
  );

create policy education_visible_to_verified_employers on candidate_education
  for select using (
    exists (
      select 1 from candidate_profiles p
      where p.user_id = candidate_education.user_id
        and p.visibility = 'visible_to_verified_employers'
        and exists (select 1 from organization_memberships m where m.user_id = auth.uid() and is_verified_employer(m.organization_id))
    )
  );

-- ---------- candidate_skills: mesma lacuna ----------
create policy skills_visible_public on candidate_skills
  for select using (
    exists (select 1 from candidate_profiles p where p.user_id = candidate_skills.user_id and p.visibility = 'public')
  );

create policy skills_visible_to_verified_employers on candidate_skills
  for select using (
    exists (
      select 1 from candidate_profiles p
      where p.user_id = candidate_skills.user_id
        and p.visibility = 'visible_to_verified_employers'
        and exists (select 1 from organization_memberships m where m.user_id = auth.uid() and is_verified_employer(m.organization_id))
    )
  );

-- ---------- candidate_languages: mesma lacuna ----------
create policy languages_visible_public on candidate_languages
  for select using (
    exists (select 1 from candidate_profiles p where p.user_id = candidate_languages.user_id and p.visibility = 'public')
  );

create policy languages_visible_to_verified_employers on candidate_languages
  for select using (
    exists (
      select 1 from candidate_profiles p
      where p.user_id = candidate_languages.user_id
        and p.visibility = 'visible_to_verified_employers'
        and exists (select 1 from organization_memberships m where m.user_id = auth.uid() and is_verified_employer(m.organization_id))
    )
  );

-- ---------- candidate_documents: mesma lacuna (inclui o CV) ----------
create policy documents_visible_public on candidate_documents
  for select using (
    exists (select 1 from candidate_profiles p where p.user_id = candidate_documents.user_id and p.visibility = 'public')
  );

create policy documents_visible_to_verified_employers on candidate_documents
  for select using (
    exists (
      select 1 from candidate_profiles p
      where p.user_id = candidate_documents.user_id
        and p.visibility = 'visible_to_verified_employers'
        and exists (select 1 from organization_memberships m where m.user_id = auth.uid() and is_verified_employer(m.organization_id))
    )
  );

commit;
