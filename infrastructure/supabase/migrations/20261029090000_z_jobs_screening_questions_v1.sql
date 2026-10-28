-- Z Jobs — screening questions, v1
--
-- Screening questions chosen by the employer (up to 5 per offer: yes/no,
-- number, short text) and the candidate's answers, given when applying.
--
-- * The answers only help the employer read the application. Nothing is
--   decided automatically from them: no automatic rejection (the same rule
--   as the candidate score — a human always decides).
-- * Questions are part of the offer: written while it is a draft or being
--   corrected, so they go through moderation like the rest of the text.
-- * Answers are free text about the candidate: candidate erasure deletes
--   them, like the messages.
--
-- Idempotent: safe to run again.

begin;

create table if not exists jobs.job_offer_questions (
  id            uuid primary key default gen_random_uuid(),
  job_offer_id  uuid not null references jobs.job_offers(id) on delete cascade,
  position      smallint not null check (position between 1 and 5),
  kind          text not null check (kind in ('yes_no', 'number', 'short_text')),
  label         text not null check (char_length(btrim(label)) between 3 and 300),
  required      boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (job_offer_id, position)
);

create table if not exists jobs.application_answers (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references jobs.applications(id) on delete cascade,
  question_id     uuid not null references jobs.job_offer_questions(id) on delete cascade,
  answer          text not null check (char_length(answer) <= 1000),
  created_at      timestamptz not null default now(),
  unique (application_id, question_id)
);

create index if not exists idx_application_answers_application on jobs.application_answers (application_id);

alter table jobs.job_offer_questions enable row level security;
alter table jobs.application_answers enable row level security;

-- Questions: public once the offer is published (candidates read them before
-- applying); always visible to the employer and to platform staff.
drop policy if exists job_offer_questions_select on jobs.job_offer_questions;
create policy job_offer_questions_select on jobs.job_offer_questions
  for select using (
    exists (
      select 1 from jobs.job_offers o
      where o.id = job_offer_id
        and (o.status = 'published' or jobs.is_org_member(o.organization_id))
    )
    or jobs.is_platform_staff()
  );

-- The employer writes its questions only while the offer is a draft or being
-- corrected: questions are part of the offer and go through moderation.
drop policy if exists job_offer_questions_write on jobs.job_offer_questions;
create policy job_offer_questions_write on jobs.job_offer_questions
  for all using (
    exists (
      select 1 from jobs.job_offers o
      where o.id = job_offer_id
        and o.status in ('draft', 'needs_changes')
        and jobs.is_org_member(o.organization_id)
    )
  ) with check (
    exists (
      select 1 from jobs.job_offers o
      where o.id = job_offer_id
        and o.status in ('draft', 'needs_changes')
        and jobs.is_org_member(o.organization_id)
    )
  );

-- Answers: read by the candidate of the application, the employer of the
-- offer, and platform staff (moderation).
drop policy if exists application_answers_select on jobs.application_answers;
create policy application_answers_select on jobs.application_answers
  for select using (
    exists (
      select 1 from jobs.applications a
      join jobs.job_offers o on o.id = a.job_offer_id
      where a.id = application_id
        and (a.candidate_id = auth.uid() or jobs.is_org_member(o.organization_id))
    )
    or jobs.is_platform_staff()
  );

-- Only the candidate answers, for a question of the offer applied to.
drop policy if exists application_answers_insert on jobs.application_answers;
create policy application_answers_insert on jobs.application_answers
  for insert with check (
    exists (
      select 1 from jobs.applications a
      join jobs.job_offer_questions q on q.job_offer_id = a.job_offer_id
      where a.id = application_id
        and q.id = question_id
        and a.candidate_id = auth.uid()
    )
  );

grant select, insert, update, delete on jobs.job_offer_questions to jobs_runtime;
grant select, insert on jobs.application_answers to jobs_runtime;

-- Candidate erasure also removes the answers (same function as in
-- 20261023000000_z_jobs_application_messages_v1.sql, one DELETE added).
CREATE OR REPLACE FUNCTION jobs.execute_candidate_erasure(
    p_candidate_id uuid
)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_actor uuid;
    v_storage_paths text[];
BEGIN
    IF p_candidate_id IS NULL THEN
        RAISE EXCEPTION 'candidate id is required'
            USING ERRCODE = '22004';
    END IF;

    v_actor := auth.uid();

    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'authentication required'
            USING ERRCODE = '42501';
    END IF;

    IF v_actor <> p_candidate_id
       AND NOT jobs.is_platform_staff() THEN
        RAISE EXCEPTION 'candidate erasure not authorized'
            USING ERRCODE = '42501';
    END IF;

    -- Guardamos primeiro os identificadores opacos dos ficheiros.
    -- As linhas candidate_documents serão apagadas mais abaixo.
    SELECT COALESCE(
        pg_catalog.array_agg(cd.storage_path ORDER BY cd.storage_path),
        ARRAY[]::text[]
    )
    INTO v_storage_paths
    FROM jobs.candidate_documents cd
    WHERE cd.user_id = p_candidate_id;

    -- application_notes contém texto livre potencialmente pessoal.
    DELETE FROM jobs.application_notes n
    USING jobs.applications a
    WHERE n.application_id = a.id
      AND a.candidate_id = p_candidate_id;

    -- Mensagens trocadas sobre as candidaturas: texto livre pessoal,
    -- dos dois lados da conversa. Apagadas por inteiro.
    DELETE FROM jobs.application_messages m
    USING jobs.applications a
    WHERE m.application_id = a.id
      AND a.candidate_id = p_candidate_id;

    -- Respostas às perguntas do empregador: texto livre pessoal.
    DELETE FROM jobs.application_answers r
    USING jobs.applications a
    WHERE r.application_id = a.id
      AND a.candidate_id = p_candidate_id;

    -- Mantemos o histórico dos estados, mas removemos texto livre
    -- e a identidade do candidato caso tenha sido ele o ator.
    UPDATE jobs.application_status_history h
    SET changed_by = CASE
            WHEN h.changed_by = p_candidate_id THEN NULL
            ELSE h.changed_by
        END,
        note = NULL
    FROM jobs.applications a
    WHERE h.application_id = a.id
      AND a.candidate_id = p_candidate_id;

    -- Desligar primeiro as candidaturas é obrigatório antes de
    -- apagar candidate_documents, porque resume_document_id tem FK.
    UPDATE jobs.applications
    SET candidate_id = NULL,
        cover_note = NULL,
        resume_document_id = NULL,
        updated_at = pg_catalog.now()
    WHERE candidate_id = p_candidate_id;

    DELETE FROM jobs.candidate_private_data
    WHERE user_id = p_candidate_id;

    DELETE FROM jobs.candidate_experiences
    WHERE user_id = p_candidate_id;

    DELETE FROM jobs.candidate_education
    WHERE user_id = p_candidate_id;

    DELETE FROM jobs.candidate_skills
    WHERE user_id = p_candidate_id;

    DELETE FROM jobs.candidate_languages
    WHERE user_id = p_candidate_id;

    DELETE FROM jobs.candidate_data_consents
    WHERE user_id = p_candidate_id;

    DELETE FROM jobs.job_alerts
    WHERE user_id = p_candidate_id;

    DELETE FROM jobs.saved_job_offers
    WHERE user_id = p_candidate_id;

    DELETE FROM jobs.institution_affiliations
    WHERE user_id = p_candidate_id;

    DELETE FROM jobs.candidate_profiles
    WHERE user_id = p_candidate_id;

    -- Tem de ser posterior ao UPDATE de applications.
    DELETE FROM jobs.candidate_documents
    WHERE user_id = p_candidate_id;

    RETURN v_storage_paths;
END;
$$;

revoke all on function jobs.execute_candidate_erasure(uuid) from public;

commit;

-- Check: select count(*) from jobs.job_offer_questions;  -- 0, table readable
