-- Z Jobs — application messages boundary (run by .github/workflows/jobs-shared-postgres.yml).
-- Needs the CI login jobs_runtime_ci (member of jobs_runtime) and the full migration sequence.
\set ON_ERROR_STOP 1
-- Fixtures (database owner)
insert into auth.users(id, email) values
  ('c1111111-1111-4111-8111-111111111111', 'msg-candidate@example.invalid'),
  ('c2222222-2222-4222-8222-222222222222', 'msg-employer@example.invalid'),
  ('c3333333-3333-4333-8333-333333333333', 'msg-stranger@example.invalid');
insert into jobs.persons(user_id, full_name) values
  ('c1111111-1111-4111-8111-111111111111', 'Msg Candidate'),
  ('c3333333-3333-4333-8333-333333333333', 'Msg Stranger');
insert into jobs.currencies(code, name) values ('EUR', 'Euro') on conflict (code) do nothing;
insert into jobs.organizations(id, type, legal_name, display_name, created_by) values
  ('c4444444-4444-4444-8444-444444444444', 'employer', 'Msg Employer', 'Msg Employer', 'c2222222-2222-4222-8222-222222222222');
insert into jobs.organization_memberships(organization_id, user_id, role) values
  ('c4444444-4444-4444-8444-444444444444', 'c2222222-2222-4222-8222-222222222222', 'owner');
insert into jobs.job_offers(id, organization_id, created_by, title, description, contract_type, salary_min, salary_currency, work_regime, status)
  values ('c5555555-5555-4555-8555-555555555555', 'c4444444-4444-4444-8444-444444444444', 'c2222222-2222-4222-8222-222222222222',
          'Msg CI Job', 'Messages fixture', 'permanent', 1000, 'EUR', 'remote', 'published');
insert into jobs.applications(id, job_offer_id, candidate_id, status) values
  ('c6666666-6666-4666-8666-666666666666', 'c5555555-5555-4555-8555-555555555555', 'c1111111-1111-4111-8111-111111111111', 'received');

-- As the runtime login, acting for each person in turn.
set role jobs_runtime_ci;

begin;
select set_config('request.jwt.claim.sub', 'c1111111-1111-4111-8111-111111111111', true);
insert into jobs.application_messages(application_id, author_side, author_id, body)
  values ('c6666666-6666-4666-8666-666666666666', 'candidate', 'c1111111-1111-4111-8111-111111111111', 'Bonjour, le poste est-il ouvert au télétravail ?');
do $$ begin
  begin
    insert into jobs.application_messages(application_id, author_side, author_id, body)
      values ('c6666666-6666-4666-8666-666666666666', 'employer', 'c1111111-1111-4111-8111-111111111111', 'posing as employer');
    raise exception 'candidate could write as the employer';
  exception when insufficient_privilege then null; end;
end $$;
commit;

begin;
select set_config('request.jwt.claim.sub', 'c2222222-2222-4222-8222-222222222222', true);
do $$ begin
  if (select count(*) from jobs.application_messages where application_id = 'c6666666-6666-4666-8666-666666666666') <> 1 then
    raise exception 'employer member cannot read the thread';
  end if;
end $$;
insert into jobs.application_messages(application_id, author_side, author_id, body)
  values ('c6666666-6666-4666-8666-666666666666', 'employer', 'c2222222-2222-4222-8222-222222222222', 'Oui, deux jours par semaine.');
update jobs.application_messages set read_at = now() where author_side = 'candidate';
do $$ begin
  begin
    update jobs.application_messages set body = 'edited' where author_side = 'employer';
    raise exception 'message body could be edited';
  exception when insufficient_privilege then null; end;
end $$;
commit;

begin;
select set_config('request.jwt.claim.sub', 'c3333333-3333-4333-8333-333333333333', true);
do $$ begin
  if (select count(*) from jobs.application_messages) <> 0 then
    raise exception 'a stranger can read messages';
  end if;
  begin
    insert into jobs.application_messages(application_id, author_side, author_id, body)
      values ('c6666666-6666-4666-8666-666666666666', 'candidate', 'c3333333-3333-4333-8333-333333333333', 'intrusion');
    raise exception 'a stranger could write in the thread';
  exception when insufficient_privilege then null; end;
end $$;
commit;

-- Candidate erasure removes the thread.
begin;
select set_config('request.jwt.claim.sub', 'c1111111-1111-4111-8111-111111111111', true);
select jobs.execute_candidate_erasure('c1111111-1111-4111-8111-111111111111');
commit;
reset role;
do $$ begin
  if (select count(*) from jobs.application_messages where application_id = 'c6666666-6666-4666-8666-666666666666') <> 0 then
    raise exception 'erasure left messages behind';
  end if;
end $$;
select 'application messages boundary: OK';
