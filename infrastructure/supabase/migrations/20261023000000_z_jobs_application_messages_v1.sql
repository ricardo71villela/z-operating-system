-- Z Jobs — application messages, v1
--
-- Messages between a candidate and the employer, one thread per application.
--
-- * Only the candidate of the application and the members of the employer
--   that published the offer read and write the thread (platform staff can
--   read it for moderation). Nobody else, and never between two candidates.
-- * Messages cannot be edited or deleted by users; only read_at changes.
-- * Candidate erasure deletes the whole thread of each of the candidate's
--   applications (free text, both sides), like application_notes.
--
-- Idempotent: safe to run again.

begin;

create table if not exists jobs.application_messages (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references jobs.applications(id) on delete cascade,
  author_side     text not null check (author_side in ('candidate', 'employer')),
  author_id       uuid references auth.users(id) on delete set null,
  body            text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at      timestamptz not null default now(),
  read_at         timestamptz
);

create index if not exists idx_application_messages_thread
  on jobs.application_messages (application_id, created_at);

alter table jobs.application_messages enable row level security;

-- The candidate of the application, members of the employer that published
-- the offer, and platform staff (moderation) read the thread.
drop policy if exists application_messages_select_participants on jobs.application_messages;
create policy application_messages_select_participants on jobs.application_messages
  for select using (
    exists (
      select 1 from jobs.applications a
      join jobs.job_offers o on o.id = a.job_offer_id
      where a.id = application_id
        and (a.candidate_id = auth.uid() or jobs.is_org_member(o.organization_id))
    )
    or jobs.is_platform_staff()
  );

-- Each side writes as itself, never on a closed application.
drop policy if exists application_messages_insert_participants on jobs.application_messages;
create policy application_messages_insert_participants on jobs.application_messages
  for insert with check (
    author_id = auth.uid()
    and exists (
      select 1 from jobs.applications a
      join jobs.job_offers o on o.id = a.job_offer_id
      where a.id = application_id
        and a.status <> 'closed'
        and (
          (author_side = 'candidate' and a.candidate_id = auth.uid())
          or (author_side = 'employer' and jobs.is_org_member(o.organization_id))
        )
    )
  );

-- Marking messages as read (only the read_at column is granted).
drop policy if exists application_messages_mark_read on jobs.application_messages;
create policy application_messages_mark_read on jobs.application_messages
  for update using (
    exists (
      select 1 from jobs.applications a
      join jobs.job_offers o on o.id = a.job_offer_id
      where a.id = application_id
        and (a.candidate_id = auth.uid() or jobs.is_org_member(o.organization_id))
    )
  );

grant select, insert on jobs.application_messages to jobs_runtime;
grant update (read_at) on jobs.application_messages to jobs_runtime;

-- Candidate erasure also removes the messages (same function as in
-- 20260810020000_z_jobs_database_convergence_v1.sql, one DELETE added).
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

-- Check: select count(*) from jobs.application_messages;  -- 0, table readable
