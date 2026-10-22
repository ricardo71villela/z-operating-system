-- 0032_application_messages.sql
-- Local mirror of infrastructure/supabase/migrations/20261023000000_z_jobs_application_messages_v1.sql
--
-- Messages between a candidate and the employer, one thread per application.
--
-- * Only the candidate of the application and the members of the employer
--   that published the offer read and write the thread (platform staff can
--   read it for moderation). Nobody else, and never between two candidates.
-- * Messages cannot be edited or deleted by users; only read_at changes.
-- * Candidate erasure deletes the whole thread of each of the candidate's
--   applications (free text, both sides), like application_notes.

begin;

create table if not exists application_messages (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references applications(id) on delete cascade,
  author_side     text not null check (author_side in ('candidate', 'employer')),
  author_id       uuid references auth.users(id) on delete set null,
  body            text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at      timestamptz not null default now(),
  read_at         timestamptz
);

create index if not exists idx_application_messages_thread
  on application_messages (application_id, created_at);

alter table application_messages enable row level security;

-- The candidate of the application, members of the employer that published
-- the offer, and platform staff (moderation) read the thread.
drop policy if exists application_messages_select_participants on application_messages;
create policy application_messages_select_participants on application_messages
  for select using (
    exists (
      select 1 from applications a
      join job_offers o on o.id = a.job_offer_id
      where a.id = application_id
        and (a.candidate_id = auth.uid() or is_org_member(o.organization_id))
    )
    or is_platform_staff()
  );

-- Each side writes as itself, never on a closed application.
drop policy if exists application_messages_insert_participants on application_messages;
create policy application_messages_insert_participants on application_messages
  for insert with check (
    author_id = auth.uid()
    and exists (
      select 1 from applications a
      join job_offers o on o.id = a.job_offer_id
      where a.id = application_id
        and a.status <> 'closed'
        and (
          (author_side = 'candidate' and a.candidate_id = auth.uid())
          or (author_side = 'employer' and is_org_member(o.organization_id))
        )
    )
  );

-- Marking messages as read (only the read_at column is granted).
drop policy if exists application_messages_mark_read on application_messages;
create policy application_messages_mark_read on application_messages
  for update using (
    exists (
      select 1 from applications a
      join job_offers o on o.id = a.job_offer_id
      where a.id = application_id
        and (a.candidate_id = auth.uid() or is_org_member(o.organization_id))
    )
  );

commit;
