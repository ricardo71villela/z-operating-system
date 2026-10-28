-- 0034_screening_questions.sql
-- Local mirror of infrastructure/supabase/migrations/20261029090000_z_jobs_screening_questions_v1.sql
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

begin;

create table if not exists job_offer_questions (
  id            uuid primary key default gen_random_uuid(),
  job_offer_id  uuid not null references job_offers(id) on delete cascade,
  position      smallint not null check (position between 1 and 5),
  kind          text not null check (kind in ('yes_no', 'number', 'short_text')),
  label         text not null check (char_length(btrim(label)) between 3 and 300),
  required      boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (job_offer_id, position)
);

create table if not exists application_answers (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references applications(id) on delete cascade,
  question_id     uuid not null references job_offer_questions(id) on delete cascade,
  answer          text not null check (char_length(answer) <= 1000),
  created_at      timestamptz not null default now(),
  unique (application_id, question_id)
);

create index if not exists idx_application_answers_application on application_answers (application_id);

alter table job_offer_questions enable row level security;
alter table application_answers enable row level security;

-- Questions: public once the offer is published (candidates read them before
-- applying); always visible to the employer and to platform staff.
drop policy if exists job_offer_questions_select on job_offer_questions;
create policy job_offer_questions_select on job_offer_questions
  for select using (
    exists (
      select 1 from job_offers o
      where o.id = job_offer_id
        and (o.status = 'published' or is_org_member(o.organization_id))
    )
    or is_platform_staff()
  );

-- The employer writes its questions only while the offer is a draft or being
-- corrected: questions are part of the offer and go through moderation.
drop policy if exists job_offer_questions_write on job_offer_questions;
create policy job_offer_questions_write on job_offer_questions
  for all using (
    exists (
      select 1 from job_offers o
      where o.id = job_offer_id
        and o.status in ('draft', 'needs_changes')
        and is_org_member(o.organization_id)
    )
  ) with check (
    exists (
      select 1 from job_offers o
      where o.id = job_offer_id
        and o.status in ('draft', 'needs_changes')
        and is_org_member(o.organization_id)
    )
  );

-- Answers: read by the candidate of the application, the employer of the
-- offer, and platform staff (moderation).
drop policy if exists application_answers_select on application_answers;
create policy application_answers_select on application_answers
  for select using (
    exists (
      select 1 from applications a
      join job_offers o on o.id = a.job_offer_id
      where a.id = application_id
        and (a.candidate_id = auth.uid() or is_org_member(o.organization_id))
    )
    or is_platform_staff()
  );

-- Only the candidate answers, for a question of the offer applied to.
drop policy if exists application_answers_insert on application_answers;
create policy application_answers_insert on application_answers
  for insert with check (
    exists (
      select 1 from applications a
      join job_offer_questions q on q.job_offer_id = a.job_offer_id
      where a.id = application_id
        and q.id = question_id
        and a.candidate_id = auth.uid()
    )
  );

commit;
